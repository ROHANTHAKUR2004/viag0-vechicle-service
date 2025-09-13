import cron from "node-cron";
import bookingService from "../services/booking.service";
import { SocketEventEmitter } from "../socket/index";
import Booking, { BookingStatus } from "../models/booking.model";
import redisCache from "../config/redis.config";

class ExpiredBookingCleanupWorker {
  private io: any; // Socket.IO server instance
  private isRunning = false;

  constructor(io?: any) {
    this.io = io;
  }

  start(): void {
    if (this.isRunning) {
      console.log("⚠️ Expired booking cleanup worker is already running");
      return;
    }

    // Run every minute to check for expired bookings
    cron.schedule("* * * * *", async () => {
      try {
        await this.processExpiredBookings();
      } catch (error) {
        console.error("❌ Error in expired booking cleanup:", error);
      }
    });

    // Run every 30 seconds for more frequent cleanup
    cron.schedule("*/30 * * * * *", async () => {
      try {
        await this.processExpiredBookings();
      } catch (error) {
        console.error("❌ Error in expired booking cleanup (30s):", error);
      }
    });

    this.isRunning = true;
    console.log("✅ Expired booking cleanup worker started");
  }

  private async processExpiredBookings(): Promise<void> {
    try {
      const now = new Date();
      
      // Find expired bookings that are still pending
      const expiredBookings = await Booking.find({
        status: BookingStatus.PENDING,
        expiresAt: { $lt: now },
      }).limit(50); // Process in batches to avoid memory issues

      if (expiredBookings.length > 0) {
        console.log(`🕐 Found ${expiredBookings.length} expired bookings to process`);

        for (const booking of expiredBookings) {
          try {
            await this.processExpiredBooking(booking);
          } catch (error) {
            console.error(`❌ Error processing expired booking ${booking.bookingId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error("❌ Error in processExpiredBookings:", error);
    }
  }

  private async processExpiredBooking(booking: any): Promise<void> {
    try {
      console.log(`⏰ Processing expired booking: ${booking.bookingId}`);

      // Mark booking as expired
      booking.status = BookingStatus.EXPIRED;
      await booking.save();

      // Release all seat locks for this booking
      await this.releaseSeatLocks(booking);

      // Emit socket event if available
      if (this.io) {
        SocketEventEmitter.emitBookingExpired(this.io, booking.userId, {
          bookingId: booking.bookingId,
          status: 'expired',
          message: 'Booking expired due to timeout',
        });
      }

      // Send notification via RabbitMQ
      await this.sendExpirationNotification(booking);

      console.log(`✅ Successfully processed expired booking: ${booking.bookingId}`);

    } catch (error) {
      console.error(`❌ Error processing expired booking ${booking.bookingId}:`, error);
      throw error;
    }
  }

  private async releaseSeatLocks(booking: any): Promise<void> {
    try {
      const seatNumbers = booking.seats.map((seat: any) => seat.seatNumber);
      
      for (const seatNumber of seatNumbers) {
        const lockKey = `seat:lock:${booking.vehicleId}:${seatNumber}`;
        const lockData = await redisCache.get(lockKey);

        if (lockData && lockData.bookingId === booking.bookingId) {
          const released = await redisCache.releaseSeat(
            booking.vehicleId,
            seatNumber,
            lockData.lockId
          );

          if (released) {
            console.log(`🔓 Released seat lock for seat ${seatNumber}`);
            
            // Emit socket event if available
            if (this.io) {
              SocketEventEmitter.emitSeatReleased(this.io, booking.vehicleId, {
                vehicleId: booking.vehicleId,
                seatNumber,
                bookingId: booking.bookingId,
                status: 'expired',
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error releasing seat locks for booking ${booking.bookingId}:`, error);
    }
  }

  private async sendExpirationNotification(booking: any): Promise<void> {
    try {
      const rabbitMQ = require("../config/rabbitmq.config").default;
      
      await rabbitMQ.sendNotification({
        type: 'BOOKING_EXPIRED',
        userId: booking.userId,
        bookingId: booking.bookingId,
        seats: booking.seats.map((s: any) => s.seatNumber),
        expiredAt: booking.expiresAt,
      });

      console.log(`📧 Sent expiration notification for booking ${booking.bookingId}`);
    } catch (error) {
      console.error(`❌ Error sending expiration notification:`, error);
    }
  }

  /**
   * Manually trigger expired booking cleanup
   */
  async triggerCleanup(): Promise<void> {
    console.log("🔧 Manually triggering expired booking cleanup");
    await this.processExpiredBookings();
  }

  /**
   * Get statistics about expired bookings
   */
  async getExpiredBookingsStats(): Promise<{
    totalExpired: number;
    pendingExpired: number;
    recentlyExpired: number;
  }> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const [totalExpired, pendingExpired, recentlyExpired] = await Promise.all([
        Booking.countDocuments({ status: BookingStatus.EXPIRED }),
        Booking.countDocuments({ 
          status: BookingStatus.PENDING,
          expiresAt: { $lt: now }
        }),
        Booking.countDocuments({ 
          status: BookingStatus.EXPIRED,
          updatedAt: { $gte: oneHourAgo }
        }),
      ]);

      return {
        totalExpired,
        pendingExpired,
        recentlyExpired,
      };
    } catch (error) {
      console.error("❌ Error getting expired bookings stats:", error);
      return {
        totalExpired: 0,
        pendingExpired: 0,
        recentlyExpired: 0,
      };
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log("🛑 Expired booking cleanup worker stopped");
  }
}

export default new ExpiredBookingCleanupWorker();