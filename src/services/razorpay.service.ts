import { razorpay } from '../config/razorpay.config';
import crypto from 'crypto';

class RazorpayService {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;

  async createOrder(orderData: any, retryCount = 0): Promise<any> {
    try {
      const order = await razorpay.orders.create(orderData);
      return order;
    } catch (error) {
      if (retryCount < this.MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * (retryCount + 1)));
        return this.createOrder(orderData, retryCount + 1);
      }
      throw error;
    }
  }

  validateWebhookSignature(orderId: string, paymentId: string, signature: string): boolean {
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(body)
      .digest('hex');

    return expectedSignature === signature;
  }

  async processRefund(paymentId: string, refundData: any, retryCount = 0): Promise<any> {
    try {
      const refund = await razorpay.payments.refund(paymentId, refundData);
      return refund;
    } catch (error) {
      if (retryCount < this.MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * (retryCount + 1)));
        return this.processRefund(paymentId, refundData, retryCount + 1);
      }
      throw error;
    }
  }

  async getPaymentDetails(paymentId: string): Promise<any> {
    try {
      return await razorpay.payments.fetch(paymentId);
    } catch (error) {
      console.error('Error fetching payment details:', error);
      throw error;
    }
  }

  async getOrderDetails(orderId: string): Promise<any> {
    try {
      return await razorpay.orders.fetch(orderId);
    } catch (error) {
      console.error('Error fetching order details:', error);
      throw error;
    }
  }

  async verifyPayment(orderId: string, paymentId: string): Promise<boolean> {
    try {
      const order = await this.getOrderDetails(orderId);
      const payment = await this.getPaymentDetails(paymentId);

      return order.status === 'paid' &&
             payment.status === 'captured' &&
             payment.order_id === orderId;
    } catch (error) {
      console.error('Error verifying payment:', error);
      return false;
    }
  }
}

export default new RazorpayService();
