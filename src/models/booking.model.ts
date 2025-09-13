import mongoose, { Document, Schema } from "mongoose";

export enum BookingStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED",
  REFUNDED = "REFUNDED",
  PAYMENT_FAILED = "PAYMENT_FAILED",
}

export interface IBookedSeat {
  seatNumber: string;
  price: number;
  from: string;
  to: string;
  isCancelled?: boolean;
  cancellationReason?: string;
  refundAmount?: number;
}

export interface IPaymentDetails {
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: "CREATED" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  paidAt?: Date;
  refundedAt?: Date;
  refundId?: string;
  refundAmount?: number;
  paymentMethod?: string;
}

export interface IBooking extends Document {
  bookingId: string; // external UUID
  userId: string;
  vehicleId: string;
  departureAt: Date;

  seats: IBookedSeat[];
  totalPrice: number;
  finalAmount: number; // after any discounts/refunds

  status: BookingStatus;
  expiresAt: Date;
  retryAttempts: number;

  payment: IPaymentDetails;
  idempotencyKey?: string;

  // For tracking and analytics
  bookingSource: string; // web, app, etc.
  userAgent?: string;
  ipAddress?: string;

  createdAt: Date;
  updatedAt: Date;
}

const BookedSeatSchema = new Schema<IBookedSeat>(
  {
    seatNumber: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    from: { type: String, required: true },
    to: { type: String, required: true },
    isCancelled: { type: Boolean, default: false },
    cancellationReason: { type: String },
    refundAmount: { type: Number, min: 0 },
  },
  { _id: false }
);

const PaymentDetailsSchema = new Schema<IPaymentDetails>(
  {
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    status: {
      type: String,
      enum: ["CREATED", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"],
      default: "CREATED",
      index: true,
    },
    paidAt: { type: Date },
    refundedAt: { type: Date },
    refundId: { type: String },
    refundAmount: { type: Number, min: 0 },
    paymentMethod: { type: String },
  },
  { _id: false }
);

const BookingSchema = new Schema<IBooking>(
  {
    bookingId: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true 
    },
    userId: { 
      type: String, 
      required: true, 
      index: true 
    },
    vehicleId: { 
      type: String, 
      required: true, 
      index: true 
    },
    departureAt: { 
      type: Date, 
      required: true, 
      index: true 
    },

    seats: {
      type: [BookedSeatSchema],
      required: true,
      validate: {
        validator: (v: IBookedSeat[]): boolean => v.length > 0,
        message: "At least one seat must be booked.",
      },
    },
    totalPrice: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    finalAmount: { 
      type: Number, 
      required: true, 
      min: 0 
    },

    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.PENDING,
      index: true,
    },
    expiresAt: { 
      type: Date, 
      required: true, 
      index: true 
    },
    retryAttempts: { 
      type: Number, 
      default: 0 
    },

    payment: { 
      type: PaymentDetailsSchema, 
      required: true 
    },
    idempotencyKey: { 
      type: String, 
      index: true 
    },
    
    bookingSource: { 
      type: String, 
      default: "web" 
    },
    userAgent: { 
      type: String 
    },
    ipAddress: { 
      type: String 
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for checking if booking is expired
BookingSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date() && this.status === BookingStatus.PENDING;
});

// Index for efficient querying
BookingSchema.index({
  vehicleId: 1,
  departureAt: 1,
  "seats.seatNumber": 1,
  status: 1,
});

BookingSchema.index({ createdAt: 1 });
BookingSchema.index({ updatedAt: 1 });
BookingSchema.index({ status: 1, expiresAt: 1 });

export default mongoose.model<IBooking>("Booking", BookingSchema);