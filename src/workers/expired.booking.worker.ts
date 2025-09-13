import cron from "node-cron";
import bookingService from "../services/booking.service";

class ExpiredBookingCleanupWorker {
  start() {
    // Run every minute to check for expired bookings
    cron.schedule("* * * * *", async () => {
      try {
        console.log("Checking for expired bookings...");
        await bookingService.handleExpiredBookings();
      } catch (error) {
        console.error("Error in expired booking cleanup:", error);
      }
    });

    console.log("Expired booking cleanup worker started");
  }
}

export default new ExpiredBookingCleanupWorker();