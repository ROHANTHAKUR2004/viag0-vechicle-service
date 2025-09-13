import { Request, Response } from "express";
import { RazorpayService } from "../config/razorpay.config";
import bookingService from "../services/booking.service";
import { asyncHandler } from "../middleware/error.middleware";
import { ENV } from "../config/env";
import ApiError from "../utlis/ApiError";

/**
 * Webhook controller for handling Razorpay payment events
 */
class WebhookController {
  /**
   * Handle Razorpay webhook events
   */
  async handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      
      if (!signature) {
        throw ApiError.unauthorized('Missing webhook signature');
      }

      // Verify webhook signature
      const isValidSignature = RazorpayService.verifyWebhookSignature(
        JSON.stringify(req.body),
        signature
      );

      if (!isValidSignature) {
        throw ApiError.unauthorized('Invalid webhook signature');
      }

      const event = req.body;
      
      // Process the webhook event
      const processedEvent = RazorpayService.processWebhookEvent(event);
      
      switch (processedEvent.type) {
        case 'payment.captured':
          await this.handlePaymentCaptured(processedEvent);
          break;
          
        case 'payment.failed':
          await this.handlePaymentFailed(processedEvent);
          break;
          
        case 'refund.created':
          await this.handleRefundCreated(processedEvent);
          break;
          
        case 'refund.processed':
          await this.handleRefundProcessed(processedEvent);
          break;
          
        default:
          console.log(`Unhandled webhook event: ${processedEvent.type}`);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('❌ Webhook processing error:', error);
      
      if (error instanceof ApiError) {
        res.status(error.statusCode).json(error.toJSON());
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  }

  /**
   * Handle successful payment capture
   */
  private async handlePaymentCaptured(event: any): Promise<void> {
    try {
      console.log(`✅ Payment captured: ${event.paymentId}`);
      
      // Find and confirm the booking
      const booking = await bookingService.findBookingByOrderId(event.orderId);
      
      if (!booking) {
        console.warn(`⚠️ Booking not found for order: ${event.orderId}`);
        return;
      }

      // Update booking status if not already confirmed
      if (booking.status === 'PENDING') {
        await bookingService.confirmBooking(
          event.paymentId,
          event.orderId,
          '', // Signature already verified in webhook
        );
      }
    } catch (error) {
      console.error('❌ Error handling payment captured:', error);
      throw error;
    }
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(event: any): Promise<void> {
    try {
      console.log(`❌ Payment failed: ${event.paymentId}`);
      
      // Find the booking
      const booking = await bookingService.findBookingByOrderId(event.orderId);
      
      if (!booking) {
        console.warn(`⚠️ Booking not found for order: ${event.orderId}`);
        return;
      }

      // Handle payment failure
      await bookingService.handlePaymentFailure(event.orderId, 'Payment failed');
    } catch (error) {
      console.error('❌ Error handling payment failure:', error);
      throw error;
    }
  }

  /**
   * Handle refund creation
   */
  private async handleRefundCreated(event: any): Promise<void> {
    try {
      console.log(`💰 Refund created: ${event.refundId}`);
      
      // Log refund creation for tracking
      // Additional processing can be added here if needed
    } catch (error) {
      console.error('❌ Error handling refund created:', error);
      throw error;
    }
  }

  /**
   * Handle refund processed
   */
  private async handleRefundProcessed(event: any): Promise<void> {
    try {
      console.log(`✅ Refund processed: ${event.refundId}`);
      
      // Update booking status if needed
      // Additional processing can be added here
    } catch (error) {
      console.error('❌ Error handling refund processed:', error);
      throw error;
    }
  }

  /**
   * Health check endpoint for webhook
   */
  async webhookHealthCheck(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      message: 'Webhook endpoint is healthy',
      timestamp: new Date().toISOString(),
    });
  }
}

export default new WebhookController();