import rabbitMQ from "../config/rabbitmq.config";
import redisCache from "../config/redis.config";
import bookingService from "../services/booking.service";
import { SocketEventEmitter } from "../socket/index";
import { WorkerJobData } from "../types/common";

interface SeatLockCleanupMessage {
  vehicleId: string;
  seatNumber?: string;
  bookingId?: string;
}

class SeatLockCleanupWorker {
  private io: any; // Socket.IO server instance

  constructor(io?: any) {
    this.io = io;
  }

  async start(): Promise<void> {
    try {
    await rabbitMQ.receiveMessages("seat.lock.cleanup", async (message) => {
      try {
          if (!message) return;

          const data = JSON.parse(message.content.toString()) as SeatLockCleanupMessage;
          await this.processSeatLockCleanup(data);
        } catch (error) {
          console.error("❌ Error processing seat lock cleanup message:", error);
        }
      });

      console.log("✅ Seat lock cleanup worker started");
    } catch (error) {
      console.error("❌ Failed to start seat lock cleanup worker:", error);
      throw error;
    }
  }

  private async processSeatLockCleanup(data: SeatLockCleanupMessage): Promise<void> {
    const { vehicleId, seatNumber, bookingId } = data;

    try {
      console.log(`🧹 Processing seat lock cleanup for vehicle ${vehicleId}`);

      if (seatNumber && bookingId) {
        // Clean up specific seat lock
        await this.cleanupSpecificSeatLock(vehicleId, seatNumber, bookingId);
      } else {
        // Clean up all expired locks for the vehicle
        await this.cleanupExpiredSeatLocks(vehicleId);
      }

    } catch (error) {
      console.error(`❌ Error in seat lock cleanup for vehicle ${vehicleId}:`, error);
    }
  }

  private async cleanupSpecificSeatLock(
    vehicleId: string, 
    seatNumber: string, 
    bookingId: string
  ): Promise<void> {
    try {
      // Get the specific lock
      const lockKey = `seat:lock:${vehicleId}:${seatNumber}`;
      const lockData = await redisCache.get(lockKey);

      if (!lockData) {
        console.log(`ℹ️ No lock found for seat ${seatNumber} in vehicle ${vehicleId}`);
        return;
      }

      // Check if lock belongs to the specified booking
      if (lockData.bookingId !== bookingId) {
        console.log(`⚠️ Lock for seat ${seatNumber} belongs to different booking`);
        return;
      }

      // Release the seat lock
      const released = await redisCache.releaseSeat(vehicleId, seatNumber, lockData.lockId);
      
      if (released) {
        console.log(`✅ Released seat lock for seat ${seatNumber} in vehicle ${vehicleId}`);
        
        // Emit socket event if available
        if (this.io) {
          SocketEventEmitter.emitSeatReleased(this.io, vehicleId, {
            vehicleId,
            seatNumber,
            bookingId,
            status: 'released',
          });
        }

        // Check if booking needs to be updated
        await this.checkBookingStatus(bookingId, vehicleId);
      }

    } catch (error) {
      console.error(`❌ Error cleaning up specific seat lock:`, error);
    }
  }

  private async cleanupExpiredSeatLocks(vehicleId: string): Promise<void> {
    try {
        // Get all seat locks for the vehicle
        const seatLocks = await redisCache.getVehicleSeatLocks(vehicleId);
      const now = new Date();

      console.log(`🔍 Found ${seatLocks.length} seat locks for vehicle ${vehicleId}`);
        
        for (const lock of seatLocks) {
        try {
          // Check if lock is expired
          if (new Date(lock.expiresAt) < now) {
            console.log(`⏰ Found expired lock for seat ${lock.seatNumber}`);

            // Check if booking exists and is still pending
            const booking = await bookingService.findBookingByOrderId(lock.bookingId);
            
            if (booking && booking.status === 'PENDING') {
              // Release the seat lock
              const released = await redisCache.releaseSeat(
                vehicleId, 
                lock.seatNumber, 
                lock.lockId
              );

              if (released) {
                console.log(`✅ Released expired seat lock for seat ${lock.seatNumber}`);
                
                // Emit socket event if available
                if (this.io) {
                  SocketEventEmitter.emitSeatReleased(this.io, vehicleId, {
                    vehicleId,
                    seatNumber: lock.seatNumber,
                    bookingId: lock.bookingId,
                    status: 'expired',
                  });
                }
              }
            } else {
              // Booking doesn't exist or is not pending, clean up the lock anyway
              await redisCache.releaseSeat(vehicleId, lock.seatNumber, lock.lockId);
              console.log(`🧹 Cleaned up orphaned seat lock for seat ${lock.seatNumber}`);
            }
          }
        } catch (error) {
          console.error(`❌ Error processing lock for seat ${lock.seatNumber}:`, error);
        }
      }

      } catch (error) {
      console.error(`❌ Error cleaning up expired seat locks:`, error);
    }
  }

  private async checkBookingStatus(bookingId: string, vehicleId: string): Promise<void> {
    try {
      const booking = await bookingService.findBookingByOrderId(bookingId);
      
      if (!booking) {
        console.log(`⚠️ Booking ${bookingId} not found during cleanup`);
        return;
      }

      // Check if all seats for this booking are still locked
      const seatNumbers = booking.seats.map(s => s.seatNumber);
      const activeLocks = [];

      for (const seatNumber of seatNumbers) {
        const lockKey = `seat:lock:${vehicleId}:${seatNumber}`;
        const lockData = await redisCache.get(lockKey);
        
        if (lockData && lockData.bookingId === bookingId) {
          activeLocks.push(seatNumber);
        }
      }

      // If no seats are locked anymore, mark booking as expired
      if (activeLocks.length === 0 && booking.status === 'PENDING') {
        console.log(`📋 All seats released for booking ${bookingId}, marking as expired`);
        await bookingService.handleExpiredBooking(booking);

        // Emit socket event if available
        if (this.io) {
          SocketEventEmitter.emitBookingExpired(this.io, booking.userId, {
            bookingId,
            status: 'expired',
            message: 'All seats released due to lock expiration',
          });
        }
      }

    } catch (error) {
      console.error(`❌ Error checking booking status:`, error);
    }
  }

  async stop(): Promise<void> {
    console.log("🛑 Seat lock cleanup worker stopped");
  }
}

export default new SeatLockCleanupWorker();