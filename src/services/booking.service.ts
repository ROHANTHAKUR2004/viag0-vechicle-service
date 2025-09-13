import { v4 as uuidv4 } from "uuid";
import Booking, { BookingStatus, IBooking } from "../models/booking.model";

import redisCache from "../config/redis.config";
import rabbitMQ from "../config/rabbitmq.config";
import { razorpay } from "../config/razorpay.config";
import Transaction, {
  TransactionType,
  TransactionStatus,
} from "../models/transaction.model";
import vechicleModel from "../models/vechicle.model";
import razorpayService from "./razorpay.service";

class BookingService {
  private readonly SEAT_LOCK_TTL = 300; // 5 minutes
  private readonly MAX_RETRY_ATTEMPTS = 3;

  /**
   * Initiate a new booking with seat locking and payment creation
   */
  async initiateBooking(bookingData: {
    userId: string;
    vehicleId: string;
    seatNumbers: string[];
    from: string;
    to: string;
    departureAt: Date;
    userAgent?: string;
    ipAddress?: string;
    bookingSource?: string;
    idempotencyKey?: string;
  }): Promise<{
    success: boolean;
    booking?: IBooking;
    razorpayOrder?: any;
    message?: string;
    lockedSeats?: string[];
  }> {
    const {
      userId,
      vehicleId,
      seatNumbers,
      from,
      to,
      departureAt,
      userAgent,
      ipAddress,
      bookingSource = "web",
      idempotencyKey = uuidv4(),
    } = bookingData;

    // Check for duplicate request using idempotency key
    const existingBooking = await Booking.findOne({ idempotencyKey });
    if (existingBooking) {
      return {
        success: false,
        message: "Duplicate booking request",
        booking: existingBooking,
      };
    }

    // Get vehicle details
    const vehicle = await vechicleModel.findById(vehicleId);
    if (!vehicle) {
      return { success: false, message: "Vehicle not found" };
    }

    // Calculate total price
    const totalPrice = this.calculatePrice(vehicle, seatNumbers, from, to);

    // Lock seats using Redis
    const lockResults = await this.lockSeats(
      vehicleId,
      seatNumbers,
      userId,
      idempotencyKey
    );

    if (!lockResults.success) {
      return {
        success: false,
        message: "Failed to lock seats",
        lockedSeats: lockResults.lockedSeats,
      };
    }

    try {
      // Create Razorpay order
      const razorpayOrder = await razorpay.orders.create({
        amount: totalPrice * 100, // Convert to paise
        currency: "INR",
        receipt: idempotencyKey,
        notes: {
          userId,
          vehicleId,
          seatNumbers: seatNumbers.join(","),
          from,
          to,
          departureAt: departureAt.toISOString(),
        },
      });

      // Create booking record
      const bookingId =
        `B${Date.now()}${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
      const expiresAt = new Date(Date.now() + this.SEAT_LOCK_TTL * 1000);

      const bookedSeats = seatNumbers.map((seatNumber) => ({
        seatNumber,
        price: this.getSeatPrice(vehicle, seatNumber, from, to),
        from,
        to,
      }));

      const booking = new Booking({
        bookingId,
        userId,
        vehicleId: vehicle._id.toString(),
        departureAt,
        seats: bookedSeats,
        totalPrice,
        finalAmount: totalPrice,
        status: BookingStatus.PENDING,
        expiresAt,
        payment: {
          razorpayOrderId: razorpayOrder.id,
          status: "CREATED",
        },
        idempotencyKey,
        bookingSource,
        userAgent,
        ipAddress,
      });

      await booking.save();

      // Create transaction log
      await this.createTransactionLog({
        type: TransactionType.SEAT_LOCK,
        status: TransactionStatus.COMPLETED,
        userId,
        bookingId,
        vehicleId,
        seatNumbers,
        amount: 0, // No charge for locking
        lockDuration: this.SEAT_LOCK_TTL,
      });

      // Schedule seat release if payment not completed
      this.scheduleSeatRelease(
        bookingId,
        vehicleId,
        seatNumbers,
        lockResults.lockIds,
        expiresAt
      );

      return {
        success: true,
        booking,
        razorpayOrder,
        lockedSeats: seatNumbers,
      };
    } catch (error) {
      // Release locked seats in case of error
      await this.releaseSeats(vehicleId, seatNumbers, lockResults.lockIds);

      console.error("Error initiating booking:", error);
      return { success: false, message: "Failed to create booking" };
    }
  }

  /**
   * Confirm booking after successful payment
   */
  async confirmBooking(
    razorpayPaymentId: string,
    razorpayOrderId: string,
    razorpaySignature: string
  ): Promise<{
    success: boolean;
    booking?: IBooking;
    message?: string;
  }> {
    try {
      // Verify payment signature
      const isValidSignature = razorpayService.validateWebhookSignature(
        razorpayOrderId + "|" + razorpayPaymentId,
        razorpaySignature,
        process.env.RAZORPAY_WEBHOOK_SECRET!
      );

      if (!isValidSignature) {
        return { success: false, message: "Invalid payment signature" };
      }

      // Find the booking
      const booking = await Booking.findOne({
        "payment.razorpayOrderId": razorpayOrderId,
        status: BookingStatus.PENDING,
      });

      if (!booking) {
        return {
          success: false,
          message: "Booking not found or already processed",
        };
      }

      // Check if booking is expired
      if (booking.expiresAt < new Date()) {
        await this.handleExpiredBooking(booking);
        return { success: false, message: "Booking expired" };
      }

      // Update booking status
      booking.status = BookingStatus.CONFIRMED;
      booking.payment.razorpayPaymentId = razorpayPaymentId;
      booking.payment.razorpaySignature = razorpaySignature;
      booking.payment.status = "PAID";
      booking.payment.paidAt = new Date();
      booking.expiresAt = new Date(Date.now() + 86400000); // 24 hours for reference

      await booking.save();

      // Update vehicle seat status
      await this.confirmSeatsInVehicle(
        booking.vehicleId,
        booking.seats.map((s) => s.seatNumber),
        booking.bookingId,
        booking.userId
      );

      // Create transaction log
      await this.createTransactionLog({
        type: TransactionType.PAYMENT,
        status: TransactionStatus.COMPLETED,
        userId: booking.userId,
        bookingId: booking.bookingId,
        amount: booking.totalPrice,
        razorpayOrderId,
        razorpayPaymentId,
      });

      // Send confirmation notification
      await rabbitMQ.sendMessage(
        "notification.email",
        JSON.stringify({
          type: "BOOKING_CONFIRMATION",
          userId: booking.userId,
          bookingId: booking.bookingId,
          seats: booking.seats.map((s) => s.seatNumber),
          totalAmount: booking.totalPrice,
        })
      );

      return { success: true, booking };
    } catch (error) {
      console.error("Error confirming booking:", error);
      return { success: false, message: "Failed to confirm booking" };
    }
  }

  /**
   * Handle payment failure
   */
  async handlePaymentFailure(
    razorpayOrderId: string,
    errorReason: string
  ): Promise<void> {
    try {
      const booking = await Booking.findOne({
        "payment.razorpayOrderId": razorpayOrderId,
        status: BookingStatus.PENDING,
      });

      if (!booking) return;

      // Increment retry attempts
      booking.retryAttempts += 1;

      if (booking.retryAttempts >= this.MAX_RETRY_ATTEMPTS) {
        // Max retries reached, mark as failed
        booking.status = BookingStatus.PAYMENT_FAILED;
        await booking.save();

        // Release seats
        const lockIds = await this.getSeatLockIds(
          booking.vehicleId,
          booking.seats.map((s) => s.seatNumber)
        );

        await this.releaseSeats(
          booking.vehicleId,
          booking.seats.map((s) => s.seatNumber),
          lockIds
        );

        // Create transaction log
        await this.createTransactionLog({
          type: TransactionType.PAYMENT,
          status: TransactionStatus.FAILED,
          userId: booking.userId,
          bookingId: booking.bookingId,
          amount: booking.totalPrice,
          razorpayOrderId,
          errorDetails: { errorReason, retryAttempts: booking.retryAttempts },
        });

        // Send failure notification
        await rabbitMQ.sendMessage(
          "notification.email",
          JSON.stringify({
            type: "PAYMENT_FAILED",
            userId: booking.userId,
            bookingId: booking.bookingId,
            errorReason,
          })
        );
      } else {
        // Schedule retry
        await booking.save();

        await rabbitMQ.sendMessage(
          "payment.retry",
          JSON.stringify({
            razorpayOrderId,
            attempt: booking.retryAttempts,
            nextRetryAt: new Date(Date.now() + booking.retryAttempts * 60000), // Exponential backoff
          })
        );
      }
    } catch (error) {
      console.error("Error handling payment failure:", error);
    }
  }

  /**
   * Handle expired bookings (seat lock timeout)
   */
  async handleExpiredBookings(): Promise<void> {
    try {
      const expiredBookings = await Booking.find({
        status: BookingStatus.PENDING,
        expiresAt: { $lt: new Date() },
      });

      for (const booking of expiredBookings) {
        await this.handleExpiredBooking(booking);
      }
    } catch (error) {
      console.error("Error handling expired bookings:", error);
    }
  }

  /**
   * Process refund for cancelled booking
   */
  async processRefund(
    bookingId: string,
    reason: string
  ): Promise<{
    success: boolean;
    refundId?: string;
    message?: string;
  }> {
    try {
      const booking = await Booking.findOne({ bookingId });

      if (!booking || booking.status !== BookingStatus.CONFIRMED) {
        return {
          success: false,
          message: "Booking not found or not confirmed",
        };
      }

      // Check if refund is possible based on cancellation policy
      const refundAmount = this.calculateRefundAmount(booking);

      if (refundAmount <= 0) {
        booking.status = BookingStatus.CANCELLED;
        await booking.save();
        return { success: true, message: "No refund applicable" };
      }

      // Process refund via Razorpay
      const refund = await razorpay.payments.refund(
        booking.payment.razorpayPaymentId!,
        {
          amount: refundAmount * 100, // Convert to paise
          notes: {
            reason,
            bookingId,
            cancelledAt: new Date().toISOString(),
          },
        }
      );

      // Update booking status
      booking.status = BookingStatus.REFUNDED;
      booking.finalAmount = booking.totalPrice - refundAmount;

      // Update payment details
      booking.payment.status =
        refundAmount === booking.totalPrice ? "REFUNDED" : "PARTIALLY_REFUNDED";
      booking.payment.refundedAt = new Date();
      booking.payment.refundId = refund.id;
      booking.payment.refundAmount = refundAmount;

      // Mark seats as cancelled
      booking.seats.forEach((seat) => {
        seat.isCancelled = true;
        seat.cancellationReason = reason;
        seat.refundAmount = this.getSeatRefundAmount(
          seat,
          refundAmount / booking.seats.length
        );
      });

      await booking.save();

      // Release seats in vehicle
      await this.releaseSeatsInVehicle(
        booking.vehicleId,
        booking.seats.map((s) => s.seatNumber)
      );

      // Create transaction log
      await this.createTransactionLog({
        type: TransactionType.REFUND,
        status: TransactionStatus.COMPLETED,
        userId: booking.userId,
        bookingId: booking.bookingId,
        amount: refundAmount,
        razorpayOrderId: booking.payment.razorpayOrderId,
        razorpayPaymentId: booking.payment.razorpayPaymentId,
        razorpayRefundId: refund.id,
      });

      // Send refund notification
      await rabbitMQ.sendMessage(
        "notification.email",
        JSON.stringify({
          type: "REFUND_PROCESSED",
          userId: booking.userId,
          bookingId: booking.bookingId,
          refundAmount,
          totalAmount: booking.totalPrice,
        })
      );

      return { success: true, refundId: refund.id };
    } catch (error) {
      console.error("Error processing refund:", error);

      // Create failed transaction log
      await this.createTransactionLog({
        type: TransactionType.REFUND,
        status: TransactionStatus.FAILED,
        userId: booking.userId,
        bookingId: booking.bookingId,
        amount: refundAmount,
        razorpayOrderId: booking.payment.razorpayOrderId,
        razorpayPaymentId: booking.payment.razorpayPaymentId,
        errorDetails: { error: error.message, reason },
      });

      return { success: false, message: "Failed to process refund" };
    }
  }

  // Helper methods
  private async lockSeats(
    vehicleId: string,
    seatNumbers: string[],
    userId: string,
    bookingId: string
  ): Promise<{ success: boolean; lockIds: string[]; lockedSeats?: string[] }> {
    const lockIds: string[] = [];
    const failedLocks: string[] = [];

    for (const seatNumber of seatNumbers) {
      const result = await redisCache.lockSeat(
        vehicleId,
        seatNumber,
        userId,
        bookingId,
        this.SEAT_LOCK_TTL
      );

      if (result.success) {
        lockIds.push(result.lockId!);
      } else {
        failedLocks.push(seatNumber);
      }
    }

    if (failedLocks.length > 0) {
      // Release any successfully locked seats
      for (let i = 0; i < lockIds.length; i++) {
        await redisCache.releaseSeat(vehicleId, seatNumbers[i], lockIds[i]);
      }

      return {
        success: false,
        lockIds: [],
        lockedSeats: failedLocks,
      };
    }

    return { success: true, lockIds };
  }

  private async releaseSeats(
    vehicleId: string,
    seatNumbers: string[],
    lockIds: string[]
  ): Promise<void> {
    for (let i = 0; i < seatNumbers.length; i++) {
      await redisCache.releaseSeat(vehicleId, seatNumbers[i], lockIds[i]);
    }
  }

  private async getSeatLockIds(
    vehicleId: string,
    seatNumbers: string[]
  ): Promise<string[]> {
    const lockIds: string[] = [];

    for (const seatNumber of seatNumbers) {
      const lockKey = `seat:lock:${vehicleId}:${seatNumber}`;
      const lockData = await redisCache.get(lockKey);

      if (lockData && typeof lockData === "object" && "lockId" in lockData) {
        lockIds.push(lockData.lockId);
      }
    }

    return lockIds;
  }

  private scheduleSeatRelease(
    bookingId: string,
    vehicleId: string,
    seatNumbers: string[],
    lockIds: string[],
    expiresAt: Date
  ): void {
    const delay = expiresAt.getTime() - Date.now();

    if (delay > 0) {
      setTimeout(async () => {
        // Check if booking was confirmed
        const booking = await Booking.findOne({ bookingId });

        if (booking && booking.status === BookingStatus.PENDING) {
          // Booking expired, release seats
          await this.releaseSeats(vehicleId, seatNumbers, lockIds);

          // Update booking status
          booking.status = BookingStatus.EXPIRED;
          await booking.save();

          // Create transaction log
          await this.createTransactionLog({
            type: TransactionType.SEAT_RELEASE,
            status: TransactionStatus.COMPLETED,
            userId: booking.userId,
            bookingId: booking.bookingId,
            vehicleId,
            seatNumbers,
            amount: 0,
          });

          // Send expiration notification
          await rabbitMQ.sendMessage(
            "notification.email",
            JSON.stringify({
              type: "BOOKING_EXPIRED",
              userId: booking.userId,
              bookingId: booking.bookingId,
            })
          );
        }
      }, delay);
    }
  }

  private async handleExpiredBooking(booking: IBooking): Promise<void> {
    try {
      booking.status = BookingStatus.EXPIRED;
      await booking.save();

      // Release seats
      const lockIds = await this.getSeatLockIds(
        booking.vehicleId,
        booking.seats.map((s) => s.seatNumber)
      );

      await this.releaseSeats(
        booking.vehicleId,
        booking.seats.map((s) => s.seatNumber),
        lockIds
      );

      // Create transaction log
      await this.createTransactionLog({
        type: TransactionType.SEAT_RELEASE,
        status: TransactionStatus.COMPLETED,
        userId: booking.userId,
        bookingId: booking.bookingId,
        vehicleId: booking.vehicleId,
        seatNumbers: booking.seats.map((s) => s.seatNumber),
        amount: 0,
      });

      // Send expiration notification
      await rabbitMQ.sendMessage(
        "notification.email",
        JSON.stringify({
          type: "BOOKING_EXPIRED",
          userId: booking.userId,
          bookingId: booking.bookingId,
        })
      );
    } catch (error) {
      console.error("Error handling expired booking:", error);
    }
  }

  private async confirmSeatsInVehicle(
    vehicleId: string,
    seatNumbers: string[],
    bookingId: string,
    userId: string
  ): Promise<void> {
    try {
      const vehicle = await vechicleModel.findById(vehicleId);
      if (!vehicle) return;

      for (const seatNumber of seatNumbers) {
        const seat = vehicle.seats.find((s) => s.seatNumber === seatNumber);
        if (seat) {
          seat.isAvailable = false;
          seat.passenger = userId;
          seat.isLocked = false;
          seat.lockedUntil = undefined;
          seat.lockedBy = undefined;
        }
      }

      vehicle.lastSeatUpdate = new Date();
      vehicle.seatLockVersion += 1;

      await vehicle.save();
    } catch (error) {
      console.error("Error confirming seats in vehicle:", error);
    }
  }

  private async releaseSeatsInVehicle(
    vehicleId: string,
    seatNumbers: string[]
  ): Promise<void> {
    try {
      const vehicle = await vechicleModel.findById(vehicleId);
      if (!vehicle) return;

      for (const seatNumber of seatNumbers) {
        const seat = vehicle.seats.find((s) => s.seatNumber === seatNumber);
        if (seat) {
          seat.isAvailable = true;
          seat.passenger = undefined;
          seat.isLocked = false;
          seat.lockedUntil = undefined;
          seat.lockedBy = undefined;
        }
      }

      vehicle.lastSeatUpdate = new Date();
      vehicle.seatLockVersion += 1;

      await vehicle.save();
    } catch (error) {
      console.error("Error releasing seats in vehicle:", error);
    }
  }

  private async createTransactionLog(transactionData: {
    type: TransactionType;
    status: TransactionStatus;
    userId: string;
    bookingId?: string;
    vehicleId?: string;
    seatNumbers?: string[];
    amount: number;
    currency?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpayRefundId?: string;
    lockDuration?: number;
    errorDetails?: any;
  }): Promise<void> {
    try {
      const transaction = new Transaction({
        transactionId:
          `T${Date.now()}${Math.random().toString(36).substr(2, 5)}`.toUpperCase(),
        ...transactionData,
        currency: transactionData.currency || "INR",
      });

      await transaction.save();
    } catch (error) {
      console.error("Error creating transaction log:", error);
    }
  }

  private calculatePrice(
    vehicle: any,
    seatNumbers: string[],
    from: string,
    to: string
  ): number {
    // Implementation depends on your pricing logic
    let total = 0;

    for (const seatNumber of seatNumbers) {
      total += this.getSeatPrice(vehicle, seatNumber, from, to);
    }

    return total;
  }

  private getSeatPrice(
    vehicle: any,
    seatNumber: string,
    from: string,
    to: string
  ): number {
    // Implementation depends on your pricing logic
    const seat = vehicle.seats.find((s: any) => s.seatNumber === seatNumber);
    return seat?.price || 0;
  }

  private calculateRefundAmount(booking: IBooking): number {
    // Implementation depends on your refund policy
    const hoursUntilDeparture =
      (booking.departureAt.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilDeparture > 24) {
      return booking.totalPrice * 0.8; // 80% refund
    } else if (hoursUntilDeparture > 12) {
      return booking.totalPrice * 0.5; // 50% refund
    } else if (hoursUntilDeparture > 6) {
      return booking.totalPrice * 0.2; // 20% refund
    } else {
      return 0; // No refund
    }
  }

  private getSeatRefundAmount(seat: any, totalRefund: number): number {
    // Distribute refund amount proportionally to seat price
    return totalRefund;
  }

  /**
   * Get booking details by ID
   */
  async getBookingDetails(bookingId: string, userId: string): Promise<IBooking | null> {
    try {
      const booking = await Booking.findOne({ 
        bookingId, 
        userId 
      }).populate('vehicleId');

      return booking;
    } catch (error) {
      console.error('Error fetching booking details:', error);
      return null;
    }
  }

  /**
   * Get user's booking history with pagination
   */
  async getUserBookings(userId: string, options: {
    page: number;
    limit: number;
    status?: string;
  }): Promise<{ bookings: IBooking[]; meta: any }> {
    try {
      const { page, limit, status } = options;
      const skip = (page - 1) * limit;

      const filter: any = { userId };
      if (status) {
        filter.status = status;
      }

      const [bookings, total] = await Promise.all([
        Booking.find(filter)
          .populate('vehicleId')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Booking.countDocuments(filter)
      ]);

      return {
        bookings,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        }
      };
    } catch (error) {
      console.error('Error fetching user bookings:', error);
      throw error;
    }
  }

  /**
   * Generate booking receipt
   */
  async generateBookingReceipt(bookingId: string, userId: string): Promise<any> {
    try {
      const booking = await Booking.findOne({ 
        bookingId, 
        userId 
      }).populate('vehicleId');

      if (!booking || booking.status !== 'CONFIRMED') {
        return null;
      }

      return {
        bookingId: booking.bookingId,
        receiptNumber: `RCP-${booking.bookingId}`,
        bookingDate: booking.createdAt,
        departureDate: booking.departureAt,
        vehicle: {
          number: (booking as any).vehicleId?.vehicleNumber,
          type: (booking as any).vehicleId?.type,
        },
        passenger: {
          userId: booking.userId,
        },
        seats: booking.seats.map(seat => ({
          seatNumber: seat.seatNumber,
          from: seat.from,
          to: seat.to,
          price: seat.price,
        })),
        pricing: {
          totalPrice: booking.totalPrice,
          finalAmount: booking.finalAmount,
          currency: 'INR',
        },
        payment: {
          status: booking.payment.status,
          paidAt: booking.payment.paidAt,
          paymentId: booking.payment.razorpayPaymentId,
        },
        status: booking.status,
      };
    } catch (error) {
      console.error('Error generating booking receipt:', error);
      return null;
    }
  }

  /**
   * Extend seat lock time
   */
  async extendSeatLock(
    bookingId: string, 
    userId: string, 
    extendBy: number = 300
  ): Promise<{ success: boolean; message?: string; newExpiryTime?: Date }> {
    try {
      const booking = await Booking.findOne({ bookingId, userId });

      if (!booking) {
        return { success: false, message: 'Booking not found' };
      }

      if (booking.status !== 'PENDING') {
        return { success: false, message: 'Booking is not in pending state' };
      }

      // Extend expiry time
      const newExpiryTime = new Date(Date.now() + extendBy * 1000);
      booking.expiresAt = newExpiryTime;
      await booking.save();

      // Extend Redis locks
      const lockIds = await this.getSeatLockIds(
        booking.vehicleId,
        booking.seats.map(s => s.seatNumber)
      );

      for (let i = 0; i < booking.seats.length; i++) {
        await redisCache.extendSeatLock(
          booking.vehicleId,
          booking.seats[i].seatNumber,
          lockIds[i],
          extendBy
        );
      }

      return { success: true, newExpiryTime };
    } catch (error) {
      console.error('Error extending seat lock:', error);
      return { success: false, message: 'Failed to extend seat lock' };
    }
  }

  /**
   * Find booking by Razorpay order ID
   */
  async findBookingByOrderId(orderId: string): Promise<IBooking | null> {
    try {
      return await Booking.findOne({ 
        'payment.razorpayOrderId': orderId 
      });
    } catch (error) {
      console.error('Error finding booking by order ID:', error);
      return null;
    }
  }
}

export default new BookingService();
