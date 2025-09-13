import rabbitMQ from "../config/rabbitmq.config";
import redisCache from "../config/redis.config";
import Booking from "../models/booking.model";

class SeatLockCleanupWorker {
  async start() {
    await rabbitMQ.receiveMessages("seat.lock.cleanup", async (message) => {
      try {
        if(!message){
            return ; 
        }
        const { vehicleId } = JSON.parse(message);
        
        // Get all seat locks for the vehicle
        const seatLocks = await redisCache.getVehicleSeatLocks(vehicleId);
        
        for (const lock of seatLocks) {
          // Check if lock is expired
          if (new Date(lock.expiresAt) < new Date()) {
            // Check if booking exists and is still pending
            const booking = await Booking.findOne({
              bookingId: lock.bookingId,
              status: "PENDING",
            });
            
            if (booking) {
              // Release the seat lock
              await redisCache.releaseSeat(vehicleId, lock.seatNumber, lock.lockId);
              
              // Update booking status if all seats are released
              // ...
            }
          }
        }
      } catch (error) {
        console.error("Error in seat lock cleanup worker:", error);
      }
    });

    console.log("Seat lock cleanup worker started");
  }
}

export default new SeatLockCleanupWorker();