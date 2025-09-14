import { NextFunction, Request, Response } from "express";
import rabbitMQ from "../config/rabbitmq.config";
import redisCache from "../config/redis.config";
import { v4 as uuidv4 } from "uuid";
import { razorpayInstance } from "../config/razorpay.config";
import bookingModel, { BookingStatus } from "../models/booking.model";
import crypto from "crypto";
import { scheduleUnlockSeatJob } from "../queues/bullmq/producers/scheduleUnlockSeat.producer";
class bookingController {
  public async reserveSeat(req: Request, res: Response, next: NextFunction) {
    try {
      const { vehicleId, departureAt, seats, price } = req.body;

      const userId = req.user?.id; // assume middleware sets req.user
      const bookingId = uuidv4();
      const idempotencyKey = req.headers["idempotency-key"] as string;
      const ttl = 2 * 60; // 2 mins
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

      if (!vehicleId || !seats || seats.length === 0) {
        return res.status(400).json({ error: "Vehicle ID and seats required" });
      }

      for (const seat of seats) {
        const isLocked = await redisCache.isSeatLocked(vehicleId, seat);
        if (isLocked) {
          return res.status(409).json({
            error: `Seat ${seat} is already locked by another user`,
          });
        }
      }

      for (const seat of seats) {
        const locked = await redisCache.lockSeat(vehicleId, seat, ttl);
        if (!locked) {
          return res.status(409).json({
            error: `Failed to lock seat ${seat}, already taken`,
          });
        }
      }
      const bookingPayload = {
        bookingId,
        userId,
        vehicleId,
        departureAt,
        seats,
        price,
        status: "PENDING",
        expiresAt,
        idempotencyKey,
      };

      await rabbitMQ.sendMessage("book_seat", JSON.stringify(bookingPayload));
    } catch (error) {}
  }
  public async extendSeatLockDuringPayment(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { vehicleId, seats } = req.body;

      if (!vehicleId || !seats || seats.length === 0) {
        return res.status(400).json({ error: "Vehicle ID and seats required" });
      }

      const extendedTtl = 10 * 60; // 10 minutes during payment flow

      let allExtended = true;

      for (const seat of seats) {
        const extended = await redisCache.extendSeatLockTtl(
          vehicleId,
          seat,
          extendedTtl
        );
        if (!extended) {
          allExtended = false;
        }
      }

      if (!allExtended) {
        return res.status(409).json({
          error: "Failed to extend seat lock, some seats may have expired",
        });
      }

      return res
        .status(200)
        .json({ message: "Seat lock extended successfully" });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
  async createBookingOrder(req: Request, res: Response) {
    try {
      const { userId, vehicleId, departureAt, seats, totalPrice, expiresAt } =
        req.body;

      const razorpayOrder = await razorpayInstance.orders.create({
        amount: totalPrice * 100, // Convert to smallest currency unit (paise)
        currency: "INR",
        receipt: `receipt_${new Date().getTime()}`,
        payment_capture: true,
      });

      const booking = new bookingModel({
        bookingId: uuidv4(),
        userId,
        vehicleId,
        departureAt,
        seats,
        totalPrice,
        status: BookingStatus.PENDING,
        expiresAt,
        paymentId: razorpayOrder.id, // Now properly typed
      });

      await booking.save();
      const ttlMs = 10 * 60 * 1000; // 10 minutes
      await scheduleUnlockSeatJob(booking.bookingId, ttlMs);

      return res.status(201).json({
        message: "Your order has been created successfully",
        orderId: razorpayOrder.id,
      });
    } catch (err) {
      console.error("Order creation error:", err);
      return res.status(500).json({ error: "Could not create order" });
    }
  }
  public async razorpayWebhookHandler(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const signature = req.headers["x-razorpay-signature"] as string;
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", process.env.WEBHOOK_SECRET as string)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(400).send("Invalid signature");
    }

    const event = req.body.event;
    const payload = req.body.payload;

    try {
      switch (event) {
        case "payment.captured": {
          const payment = payload.payment.entity;
          const razorpayOrderId = payment.order_id;
          const razorpayPaymentId = payment.id;

          const booking = await bookingModel.findOne({
            paymentId: razorpayOrderId,
          });
          if (!booking)
            return res.status(404).json({ message: "Booking not found" });

          booking.status = BookingStatus.CONFIRMED;
          booking.paymentDetails = {
            method: payment.method,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature: signature,
            amountPaid: payment.amount / 100,
            paidAt: new Date(payment.created_at * 1000),
          };

          await booking.save();
          console.log(
            `Booking ${booking.bookingId} confirmed after payment capture.`
          );
          break;
        }

        case "payment.failed": {
          const payment = payload.payment.entity;
          const razorpayOrderId = payment.order_id;

          const booking = await bookingModel.findOne({
            paymentId: razorpayOrderId,
          });
          if (booking) {
            booking.status = BookingStatus.CANCELLED;
            await booking.save();
            console.log(
              `Booking ${booking.bookingId} cancelled due to payment failure.`
            );
          }
          break;
        }

        case "payment.refunded":
        case "refund.processed": {
          const refund = payload.refund.entity;
          const razorpayPaymentId = refund.payment_id;

          const booking = await bookingModel.findOne({
            "paymentDetails.razorpayPaymentId": razorpayPaymentId,
          });
          if (booking) {
            booking.status = BookingStatus.CANCELLED;
            await booking.save();
            console.log(
              `Booking ${booking.bookingId} marked cancelled due to refund.`
            );
          }
          break;
        }

        case "order.paid": {
          const order = payload.order.entity;
          const razorpayOrderId = order.id;

          const booking = await bookingModel.findOne({
            paymentId: razorpayOrderId,
          });
          if (booking && booking.status === BookingStatus.PENDING) {
            booking.status = BookingStatus.CONFIRMED;
            await booking.save();
            console.log(
              `Booking ${booking.bookingId} confirmed via order.paid event.`
            );
          }
          break;
        }

        case "refund.failed": {
          const refund = payload.refund.entity;
          console.error(`Refund failed for payment: ${refund.payment_id}`);

          break;
        }

        default:
          console.warn(`Unhandled webhook event received: ${event}`);
          break;
      }

      return res.status(200).json({ status: "success" });
    } catch (err) {
      console.error("Error handling webhook:", err);

      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
export default bookingController;
