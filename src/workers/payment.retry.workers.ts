import rabbitMQ from "../config/rabbitmq.config";
import bookingService from "../services/booking.service";
import { RazorpayService } from "../config/razorpay.config";
import { WorkerJobData } from "../types/common";

interface PaymentRetryMessage {
  razorpayOrderId: string;
  attempt: number;
  nextRetryAt?: string;
  maxRetries?: number;
}

class PaymentRetryWorker {
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAYS = [60000, 300000, 900000]; // 1min, 5min, 15min

  async start(): Promise<void> {
    try {
      await rabbitMQ.receiveMessages("payment.retry", async (message) => {
        try {
          if (!message) return;

          const data = JSON.parse(message.content.toString()) as PaymentRetryMessage;
          await this.processPaymentRetry(data);
        } catch (error) {
          console.error("❌ Error processing payment retry message:", error);
        }
      });

      console.log("✅ Payment retry worker started");
    } catch (error) {
      console.error("❌ Failed to start payment retry worker:", error);
      throw error;
    }
  }

  private async processPaymentRetry(data: PaymentRetryMessage): Promise<void> {
    const { razorpayOrderId, attempt, maxRetries = this.MAX_RETRY_ATTEMPTS } = data;

    try {
      console.log(`🔄 Retrying payment for order ${razorpayOrderId}, attempt ${attempt}`);

      // Check if we've exceeded max retry attempts
      if (attempt > maxRetries) {
        console.log(`❌ Max retry attempts reached for order ${razorpayOrderId}`);
        await bookingService.handlePaymentFailure(razorpayOrderId, 'Max retry attempts exceeded');
        return;
      }

      // Find the booking
      const booking = await bookingService.findBookingByOrderId(razorpayOrderId);
      if (!booking) {
        console.log(`⚠️ Booking not found for order ${razorpayOrderId}`);
        return;
      }

      // Check if booking is still pending
      if (booking.status !== 'PENDING') {
        console.log(`ℹ️ Booking ${booking.bookingId} is no longer pending, skipping retry`);
        return;
      }

      // Check if booking has expired
      if (booking.expiresAt < new Date()) {
        console.log(`⏰ Booking ${booking.bookingId} has expired, marking as expired`);
        await bookingService.handleExpiredBooking(booking);
        return;
      }

      // Get order details from Razorpay
      try {
        const order = await RazorpayService.getOrder(razorpayOrderId);
        
        // Check if payment was captured
        if (order.status === 'paid') {
          console.log(`✅ Payment captured for order ${razorpayOrderId}`);
          
          // Find the payment ID and confirm the booking
          const payments = await RazorpayService.getPaymentDetails(order.notes?.paymentId || '');
          if (payments.success) {
            await bookingService.confirmBooking(
              payments.payment.id,
              razorpayOrderId,
              '' // Signature verification already done
            );
            return;
          }
        }
      } catch (error) {
        console.error(`❌ Error checking Razorpay order ${razorpayOrderId}:`, error);
      }

      // Schedule next retry if not at max attempts
      if (attempt < maxRetries) {
        const nextAttempt = attempt + 1;
        const delay = this.RETRY_DELAYS[Math.min(attempt - 1, this.RETRY_DELAYS.length - 1)];
        const nextRetryAt = new Date(Date.now() + delay);

        const retryJob: WorkerJobData = {
          type: 'PAYMENT_RETRY',
          payload: {
            razorpayOrderId,
            attempt: nextAttempt,
            maxRetries,
            nextRetryAt: nextRetryAt.toISOString(),
          },
          retryCount: nextAttempt,
          maxRetries,
          delay,
        };

        // Send to retry queue with delay
        await rabbitMQ.sendWorkerJob(retryJob);
        
        console.log(`📅 Scheduled retry ${nextAttempt} for order ${razorpayOrderId} at ${nextRetryAt.toISOString()}`);
      } else {
        // Final attempt failed
        await bookingService.handlePaymentFailure(razorpayOrderId, 'All retry attempts exhausted');
      }

    } catch (error) {
      console.error(`❌ Error in payment retry for order ${razorpayOrderId}:`, error);
      
      // If it's not the final attempt, schedule another retry
      if (attempt < maxRetries) {
        const retryJob: WorkerJobData = {
          type: 'PAYMENT_RETRY',
          payload: {
            razorpayOrderId,
            attempt: attempt + 1,
            maxRetries,
            error: error.message,
          },
          retryCount: attempt + 1,
          maxRetries,
          delay: this.RETRY_DELAYS[Math.min(attempt, this.RETRY_DELAYS.length - 1)],
        };

        await rabbitMQ.sendWorkerJob(retryJob);
      }
    }
  }

  async stop(): Promise<void> {
    console.log("🛑 Payment retry worker stopped");
  }
}

export default new PaymentRetryWorker();
