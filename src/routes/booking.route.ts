import express from "express";
import bookingController from "../controllers/booking.controller";
import { isAuthenticated } from "../middleware/auth.middleware";

const router = express.Router();

// 👇 Protect all booking routes with authentication
router.use(isAuthenticated);

// Booking routes
router.post("/reserve", bookingController.reserveSeat);
router.post("/extend-lock", bookingController.extendSeatLockDuringPayment);
router.post("/create-order", bookingController.createBookingOrder);
router.post("/refund/:bookingId", bookingController.processRefund);
// router.get("/:bookingId", bookingController.getBookingStatus);

// Webhook route (⚠️ Razorpay calls this, so NO auth middleware here)
router.post("/webhook", bookingController.razorpayWebhookHandler);

export default router;
