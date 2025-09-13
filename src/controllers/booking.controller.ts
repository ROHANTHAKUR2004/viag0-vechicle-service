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
      const userId = req.user?.id as string ;

      const booking = await bookingService.getBookingDetails(bookingId, userId);

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      res.json({
        success: true,
        booking,
      });
    } catch (error) {
      console.error("Error fetching booking details:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async getUserBookings(req: Request, res: Response) {
    try {
      const userId = req.user?.id as string ;
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const status = req.query.status as string;

      const result = await bookingService.getUserBookings(userId, {
        page,
        limit,
        status,
      });

      res.json({
        success: true,
        bookings: result.bookings,
        meta: result.meta,
      });
    } catch (error) {
      console.error("Error fetching user bookings:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async getBookingReceipt(req: Request, res: Response) {
    try {
      const { bookingId } = req.params;
      const userId = req.user?.id as string ;

      const receipt = await bookingService.generateBookingReceipt(bookingId, userId);

      if (!receipt) {
        return res.status(404).json({
          success: false,
          message: "Booking not found or receipt unavailable",
        });
      }

      res.json({
        success: true,
        receipt,
      });
    } catch (error) {
      console.error("Error generating booking receipt:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  async extendSeatLock(req: Request, res: Response) {
    try {
      const { bookingId } = req.params;
      const userId = req.user?.id as string ;
      const { extendBy = 300 } = req.body; // Default 5 minutes

      const result = await bookingService.extendSeatLock(bookingId, userId, extendBy);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message,
        });
      }

      res.json({
        success: true,
        message: "Seat lock extended successfully",
        newExpiryTime: result.newExpiryTime,
      });
    } catch (error) {
      console.error("Error extending seat lock:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}

export default new BookingController();