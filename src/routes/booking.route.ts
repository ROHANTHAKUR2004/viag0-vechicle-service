import { Router } from "express";
import bookingController from "../controllers/booking.controller";
import { isAuthenticated } from "../middleware/auth.middleware";
import { asyncHandler, validateRequest, rateLimiter } from "../middleware/error.middleware";
import Joi from "joi";
import { BookingRequest, PaymentConfirmationRequest } from "../types/common";

const router = Router();

// Validation schemas
const bookingValidationSchema = Joi.object<BookingRequest>({
  vehicleId: Joi.string().required().messages({
    'string.empty': 'Vehicle ID is required',
    'any.required': 'Vehicle ID is required'
  }),
  seatNumbers: Joi.array().items(Joi.string()).min(1).required().messages({
    'array.min': 'At least one seat must be selected',
    'any.required': 'Seat numbers are required'
  }),
  from: Joi.string().required().messages({
    'string.empty': 'From location is required',
    'any.required': 'From location is required'
  }),
  to: Joi.string().required().messages({
    'string.empty': 'To location is required',
    'any.required': 'To location is required'
  }),
  departureAt: Joi.date().min('now').required().messages({
    'date.min': 'Departure time must be in the future',
    'any.required': 'Departure time is required'
  })
});

const paymentConfirmationSchema = Joi.object<PaymentConfirmationRequest>({
  razorpay_payment_id: Joi.string().required().messages({
    'string.empty': 'Payment ID is required',
    'any.required': 'Payment ID is required'
  }),
  razorpay_order_id: Joi.string().required().messages({
    'string.empty': 'Order ID is required',
    'any.required': 'Order ID is required'
  }),
  razorpay_signature: Joi.string().required().messages({
    'string.empty': 'Signature is required',
    'any.required': 'Signature is required'
  })
});

const cancellationSchema = Joi.object({
  reason: Joi.string().min(10).max(500).required().messages({
    'string.min': 'Cancellation reason must be at least 10 characters',
    'string.max': 'Cancellation reason must not exceed 500 characters',
    'any.required': 'Cancellation reason is required'
  })
});

// Apply rate limiting to all booking routes
router.use(rateLimiter(15 * 60 * 1000, 50)); // 50 requests per 15 minutes

/**
 * @route   POST /api/bookings
 * @desc    Initiate a new booking
 * @access  Private
 */
router.post(
  "/",
  isAuthenticated,
  validateRequest(bookingValidationSchema),
  asyncHandler(bookingController.initiateBooking)
);

/**
 * @route   POST /api/bookings/confirm
 * @desc    Confirm booking after successful payment
 * @access  Private
 */
router.post(
  "/confirm",
  isAuthenticated,
  validateRequest(paymentConfirmationSchema),
  asyncHandler(bookingController.confirmBooking)
);

/**
 * @route   DELETE /api/bookings/:bookingId
 * @desc    Cancel a booking and process refund
 * @access  Private
 */
router.delete(
  "/:bookingId",
  isAuthenticated,
  validateRequest(cancellationSchema),
  asyncHandler(bookingController.cancelBooking)
);

/**
 * @route   GET /api/bookings/:bookingId
 * @desc    Get booking details
 * @access  Private
 */
router.get(
  "/:bookingId",
  isAuthenticated,
  asyncHandler(bookingController.getBookingDetails)
);

/**
 * @route   GET /api/bookings
 * @desc    Get user's booking history
 * @access  Private
 */
router.get(
  "/",
  isAuthenticated,
  asyncHandler(bookingController.getUserBookings)
);

/**
 * @route   GET /api/bookings/:bookingId/receipt
 * @desc    Get booking receipt
 * @access  Private
 */
router.get(
  "/:bookingId/receipt",
  isAuthenticated,
  asyncHandler(bookingController.getBookingReceipt)
);

/**
 * @route   POST /api/bookings/:bookingId/extend-lock
 * @desc    Extend seat lock time
 * @access  Private
 */
router.post(
  "/:bookingId/extend-lock",
  isAuthenticated,
  asyncHandler(bookingController.extendSeatLock)
);

export default router;
