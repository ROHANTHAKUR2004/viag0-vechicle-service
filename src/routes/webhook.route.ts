import { Router } from "express";
import webhookController from "../controllers/webhook.controller";
import { asyncHandler, rateLimiter } from "../middleware/error.middleware";

const router = Router();

// Apply rate limiting to webhook routes (more lenient for webhooks)
router.use(rateLimiter(60 * 1000, 200)); // 200 requests per minute

/**
 * @route   POST /api/webhooks/razorpay
 * @desc    Handle Razorpay webhook events
 * @access  Public (authenticated via signature)
 */
router.post(
  "/razorpay",
  asyncHandler(webhookController.handleRazorpayWebhook)
);

/**
 * @route   GET /api/webhooks/health
 * @desc    Webhook health check
 * @access  Public
 */
router.get(
  "/health",
  asyncHandler(webhookController.webhookHealthCheck)
);

export default router;
