import { Request, Response } from "express";
import bookingService from "../services/booking.service";
import razorpayService from "../services/razorpay.service";


class WebhookController {
  async razorpayWebhook(req: Request, res: Response) {
    try {
      const webhookBody = req.body;
      const signature = req.headers["x-razorpay-signature"] as string;

      // Verify webhook signature
      const isValid = razorpayService.validateWebhookSignature(
        webhookBody.payload.payment.entity.order_id,
        webhookBody.payload.payment.entity.id,
        signature
      );

      if (!isValid) {
        return res.status(400).json({ success: false, message: "Invalid signature" });
      }

      const event = webhookBody.event;
      const payment = webhookBody.payload.payment.entity;

      switch (event) {
        case "payment.captured":
          await bookingService.confirmBooking(
            payment.id,
            payment.order_id,
            signature
          );
          break;

        case "payment.failed":
          await bookingService.handlePaymentFailure(
            payment.order_id,
            payment.error_description || "Payment failed"
          );
          break;

        case "refund.processed":
          // Handle refund processed
          break;

        default:
          console.log("Unhandled webhook event:", event);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error processing webhook:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}

export default new WebhookController();