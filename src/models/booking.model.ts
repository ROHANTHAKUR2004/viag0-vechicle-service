import mongoose, { Document, Schema } from "mongoose";

export enum BookingStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED",
}

export interface IBookedSeat {
  seatNumber: string;
  price: number;
  from: string;
  to: string;
}

export interface IPaymentDetails {
  method: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  amountPaid: number;
  paidAt: Date;
}

export interface IBooking extends Document {
  bookingId: string;
  userId: mongoose.Types.ObjectId;
  vehicleId: mongoose.Types.ObjectId;
  departureAt: Date;

  seats: IBookedSeat[];
  totalPrice: number;

  status: BookingStatus;
  expiresAt: Date;

  paymentId?: string;
  idempotencyKey?: string;
  paymentDetails?: IPaymentDetails;

  createdAt: Date;
  updatedAt: Date;
}

/** Seat Schema (embedded in booking) */
const BookedSeatSchema = new Schema<IBookedSeat>(
  {
    seatNumber: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  { _id: false }
);

/** Payment Details Schema (embedded in booking) */
const PaymentDetailsSchema = new Schema<IPaymentDetails>(
  {
    method: { type: String, required: true },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String, required: true, unique: true },
    razorpaySignature: { type: String, required: true },
    amountPaid: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, required: true },
  },
  { _id: false }
);

/** Booking Schema */
const BookingSchema = new Schema<IBooking>(
  {
    bookingId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
    departureAt: { type: Date, required: true },

    seats: {
      type: [BookedSeatSchema],
      required: true,
      validate: {
        validator: (v: IBookedSeat[]): boolean => v.length > 0,
        message: "At least one seat must be booked.",
      },
    },
    totalPrice: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.PENDING,
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },

    paymentId: { type: String },
    idempotencyKey: { type: String, index: true },

    paymentDetails: { type: PaymentDetailsSchema }, // Razorpay payment info
  },
  { timestamps: true }
);

// Composite index to prevent seat overbooking
BookingSchema.index({
  vehicleId: 1,
  departureAt: 1,
  "seats.seatNumber": 1,
  status: 1,
});

export default mongoose.model<IBooking>("Booking", BookingSchema);
