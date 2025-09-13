import Razorpay from "razorpay";
import { ENV } from "./env";
import { WebhookEvent } from "../types/common";

/**
 * Razorpay configuration with proper type safety and error handling
 */
export const razorpay = new Razorpay({
  key_id: ENV.RAZORPAY_KEY_ID,
  key_secret: ENV.RAZORPAY_KEY_SECRET,
});

/**
 * Razorpay service class with comprehensive payment operations
 */
export class RazorpayService {
  private static readonly DEFAULT_CURRENCY = "INR";
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds

  /**
   * Create a new Razorpay order
   */
  static async createOrder(params: {
    amount: number;
    currency?: string;
    receipt: string;
    notes?: Record<string, string>;
    timeout?: number;
  }): Promise<Razorpay.Order> {
    try {
      const order = await razorpay.orders.create({
        amount: params.amount,
        currency: params.currency || this.DEFAULT_CURRENCY,
        receipt: params.receipt,
        notes: params.notes || {},
        timeout: params.timeout || this.DEFAULT_TIMEOUT,
      });

      console.log(`✅ Razorpay order created: ${order.id}`);
      return order;
    } catch (error) {
      console.error('❌ Failed to create Razorpay order:', error);
      throw new Error(`Failed to create payment order: ${error}`);
    }
  }

  /**
   * Fetch order details by ID
   */
  static async getOrder(orderId: string): Promise<Razorpay.Order> {
    try {
      const order = await razorpay.orders.fetch(orderId);
      console.log(`✅ Razorpay order fetched: ${order.id}`);
      return order;
    } catch (error) {
      console.error(`❌ Failed to fetch Razorpay order ${orderId}:`, error);
      throw new Error(`Failed to fetch order: ${error}`);
    }
  }

  /**
   * Verify payment signature
   */
  static verifyPaymentSignature(params: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): boolean {
    try {
      const crypto = require('crypto');
      const body = params.razorpay_order_id + "|" + params.razorpay_payment_id;
      
      const expectedSignature = crypto
        .createHmac('sha256', ENV.RAZORPAY_WEBHOOK_SECRET)
        .update(body.toString())
        .digest('hex');

      const isValid = expectedSignature === params.razorpay_signature;
      
      if (isValid) {
        console.log(`✅ Payment signature verified for order: ${params.razorpay_order_id}`);
      } else {
        console.warn(`⚠️ Invalid payment signature for order: ${params.razorpay_order_id}`);
      }
      
      return isValid;
    } catch (error) {
      console.error('❌ Error verifying payment signature:', error);
      return false;
    }
  }

  /**
   * Verify webhook signature
   */
  static verifyWebhookSignature(body: string, signature: string): boolean {
    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', ENV.RAZORPAY_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');

      const isValid = expectedSignature === signature;
      
      if (isValid) {
        console.log('✅ Webhook signature verified');
      } else {
        console.warn('⚠️ Invalid webhook signature');
      }
      
      return isValid;
    } catch (error) {
      console.error('❌ Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Create a refund
   */
  static async createRefund(params: {
    paymentId: string;
    amount?: number;
    notes?: Record<string, string>;
    speed?: 'optimum' | 'normal';
  }): Promise<Razorpay.Refund> {
    try {
      const refundOptions: any = {
        notes: params.notes || {},
        speed: params.speed || 'normal',
      };

      if (params.amount) {
        refundOptions.amount = params.amount;
      }

      const refund = await razorpay.payments.refund(params.paymentId, refundOptions);
      
      console.log(`✅ Refund created: ${refund.id} for payment: ${params.paymentId}`);
      return refund;
    } catch (error) {
      console.error(`❌ Failed to create refund for payment ${params.paymentId}:`, error);
      throw new Error(`Failed to create refund: ${error}`);
    }
  }

  /**
   * Fetch refund details
   */
  static async getRefund(refundId: string): Promise<Razorpay.Refund> {
    try {
      const refund = await razorpay.refunds.fetch(refundId);
      console.log(`✅ Refund fetched: ${refund.id}`);
      return refund;
    } catch (error) {
      console.error(`❌ Failed to fetch refund ${refundId}:`, error);
      throw new Error(`Failed to fetch refund: ${error}`);
    }
  }

  /**
   * Fetch payment details
   */
  static async getPayment(paymentId: string): Promise<Razorpay.Payment> {
    try {
      const payment = await razorpay.payments.fetch(paymentId);
      console.log(`✅ Payment fetched: ${payment.id}`);
      return payment;
    } catch (error) {
      console.error(`❌ Failed to fetch payment ${paymentId}:`, error);
      throw new Error(`Failed to fetch payment: ${error}`);
    }
  }

  /**
   * Process webhook event
   */
  static processWebhookEvent(event: WebhookEvent): {
    type: string;
    orderId: string;
    paymentId: string;
    status: string;
    amount: number;
    currency: string;
  } {
    try {
      const payment = event.payload.payment.entity;
      
      return {
        type: event.event,
        orderId: payment.order_id,
        paymentId: payment.id,
        status: payment.status,
        amount: payment.amount / 100, // Convert from paise to rupees
        currency: payment.currency,
      };
    } catch (error) {
      console.error('❌ Error processing webhook event:', error);
      throw new Error(`Failed to process webhook event: ${error}`);
    }
  }

  /**
   * Calculate refund amount based on cancellation policy
   */
  static calculateRefundAmount(
    totalAmount: number,
    cancellationTime: Date,
    departureTime: Date
  ): number {
    const hoursUntilDeparture = (departureTime.getTime() - cancellationTime.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntilDeparture > 24) {
      return totalAmount * 0.8; // 80% refund
    } else if (hoursUntilDeparture > 12) {
      return totalAmount * 0.5; // 50% refund
    } else if (hoursUntilDeparture > 6) {
      return totalAmount * 0.2; // 20% refund
    } else {
      return 0; // No refund
    }
  }
}

export default RazorpayService;
