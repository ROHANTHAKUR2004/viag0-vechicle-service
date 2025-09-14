import { Request, Response } from "express";
import bookingService from "../services/booking.service";
import { v4 as uuidv4 } from "uuid";

class BookingController {
  async initiateBooking(req: Request, res: Response) {
    try {
      const {
        vehicleId,
        seatNumbers,
        from,
        to,
        departureAt,
      } = req.body;

      const userId = req.user?.id; // Assuming user is authenticated

      if (!vehicleId || !seatNumbers || !from || !to || !departureAt) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      const result = await bookingService.initiateBooking({
        userId :userId as string ,
        vehicleId,
        seatNumbers,
        from,
        to,
        departureAt: new Date(departureAt),
        userAgent: req.get("User-Agent"),
        ipAddress: req.ip,
        idempotencyKey: req.headers["idempotency-key"] as string || uuidv4(),
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message,
          lockedSeats: result.lockedSeats,
        });
      }

      res.status(201).json({
        success: true,
        booking: result.booking,
        razorpayOrder: result.razorpayOrder,
      });
    } catch (error) {
      console.error("Error initiating booking:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async confirmBooking(req: Request, res: Response) {
    try {
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

      const result = await bookingService.confirmBooking(
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message,
        });
      }

      res.json({
        success: true,
        booking: result.booking,
      });
    } catch (error) {
      console.error("Error confirming booking:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async cancelBooking(req: Request, res: Response) {
    try {
      const { bookingId } = req.params;
      const { reason } = req.body;

      const result = await bookingService.processRefund(bookingId, reason);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message,
        });
      }

      res.json({
        success: true,
        refundId: result.refundId,
      });
    } catch (error) {
      console.error("Error cancelling booking:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async getBookingDetails(req: Request, res: Response) {
    try {
      const { bookingId } = req.params;

      // Implementation to fetch booking details
      // ...

      res.json({
        success: true,
        booking: {}, // Booking details
      });
    } catch (error) {
      console.error("Error fetching booking details:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}

export default new BookingController();