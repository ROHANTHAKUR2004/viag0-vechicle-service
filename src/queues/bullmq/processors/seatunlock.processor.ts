import { Job } from "bullmq";
import bookingModel, { BookingStatus } from "../../../models/booking.model";
import redisCache from "../../../config/redis.config";
import { razorpayInstance } from "../../../config/razorpay.config";

export const seatUnlockProcessor = async (job: Job) => {
  const { bookingId } = job.data;

  const booking = await bookingModel.findOne({ bookingId });
  if (!booking) throw new Error(`Booking not found for ID: ${bookingId}`);

  // Only cancel if still pending
  if (booking.status !== BookingStatus.PENDING) return;

  // Unlock seats in Redis
  const seatNumbers = booking.seats.map((s) => s.seatNumber);
  for (const seat of seatNumbers) {
    await redisCache.unlockSeat(booking.vehicleId.toString(), seat);
  }
  console.log(
    `Seats [${seatNumbers.join(", ")}] unlocked for booking ${booking.bookingId}`
  );

  // Mark booking as EXPIRED
  booking.status = BookingStatus.EXPIRED;
  await booking.save();
  console.log(`Booking ${booking.bookingId} expired.`);

  // Refund if payment was already captured
  if (booking.paymentDetails?.razorpayPaymentId) {
    try {
      await razorpayInstance.payments.refund(
        booking.paymentDetails.razorpayPaymentId,
        {} // Pass an empty object if no extra params needed
      );
      console.log(`Refund initiated for booking ${booking.bookingId}`);
    } catch (err) {
      console.error(`Failed to refund booking ${booking.bookingId}`, err);
    }
  }
};
