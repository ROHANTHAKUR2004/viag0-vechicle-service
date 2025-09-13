import rabbitMQ from "../config/rabbitmq.config";
import bookingService from "../services/booking.service";

class PaymentRetryWorker {
  async start() {
    await rabbitMQ.receiveMessages("payment.retry", async (message) => {
      try {
        const { razorpayOrderId, attempt } = message;

        // Implement retry logic
        console.log(
          `Retrying payment for order ${razorpayOrderId}, attempt ${attempt}`
        );

        // Check if order is still pending and retry payment verification
        // ...
      } catch (error) {
        console.error("Error in payment retry worker:", error);
      }
    });

    console.log("Payment retry worker started");
  }
}

export default new PaymentRetryWorker();
