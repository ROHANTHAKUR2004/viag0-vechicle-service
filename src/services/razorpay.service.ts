import { RazorpayService as RazorpayConfig } from "../config/razorpay.config";
import { ENV } from "../config/env";
import ApiError from "../utlis/ApiError";

/**
 * Razorpay service for payment operations
 */
class RazorpayService {
  /**
   * Create a new payment order
   */
  static async createPaymentOrder(params: {
    amount: number;
    currency?: string;
    receipt: string;
    notes?: Record<string, string>;
    timeout?: number;
  }) {
    try {
      const order = await RazorpayConfig.createOrder(params);
      return {
        success: true,
        order,
      };
    } catch (error) {
      console.error('❌ Failed to create payment order:', error);
      throw ApiError.payment('Failed to create payment order', error);
    }
  }

  /**
   * Verify payment signature
   */
  static async verifyPayment(params: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<boolean> {
    try {
      return RazorpayConfig.verifyPaymentSignature(params);
    } catch (error) {
      console.error('❌ Failed to verify payment:', error);
      throw ApiError.payment('Failed to verify payment', error);
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
  }) {
    try {
      const refund = await RazorpayConfig.createRefund(params);
      return {
        success: true,
        refund,
      };
    } catch (error) {
      console.error('❌ Failed to create refund:', error);
      throw ApiError.payment('Failed to create refund', error);
    }
  }

  /**
   * Get payment details
   */
  static async getPaymentDetails(paymentId: string) {
    try {
      const payment = await RazorpayConfig.getPayment(paymentId);
      return {
        success: true,
        payment,
      };
    } catch (error) {
      console.error('❌ Failed to get payment details:', error);
      throw ApiError.payment('Failed to get payment details', error);
    }
  }

  /**
   * Get refund details
   */
  static async getRefundDetails(refundId: string) {
    try {
      const refund = await RazorpayConfig.getRefund(refundId);
      return {
        success: true,
        refund,
      };
    } catch (error) {
      console.error('❌ Failed to get refund details:', error);
      throw ApiError.payment('Failed to get refund details', error);
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
    try {
      return RazorpayConfig.calculateRefundAmount(
        totalAmount,
        cancellationTime,
        departureTime
      );
    } catch (error) {
      console.error('❌ Failed to calculate refund amount:', error);
      return 0;
    }
  }

  /**
   * Validate webhook signature
   */
  static validateWebhookSignature(body: string, signature: string): boolean {
    try {
      return RazorpayConfig.verifyWebhookSignature(body, signature);
    } catch (error) {
      console.error('❌ Failed to validate webhook signature:', error);
      return false;
    }
  }
}

export default RazorpayService;