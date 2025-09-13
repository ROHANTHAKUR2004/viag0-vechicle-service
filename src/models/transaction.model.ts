import mongoose, { Document, Schema } from "mongoose";

export enum TransactionType {
  PAYMENT = "PAYMENT",
  REFUND = "REFUND",
  SEAT_LOCK = "SEAT_LOCK",
  SEAT_RELEASE = "SEAT_RELEASE",
}

export enum TransactionStatus {
  INITIATED = "INITIATED",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  REVERSED = "REVERSED",
}

export interface ITransaction extends Document {
  transactionId: string;
  bookingId?: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  
  // Payment gateway details
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  
  // Seat locking details
  vehicleId?: string;
  seatNumbers?: string[];
  lockDuration?: number; // in seconds
  
  // Metadata
  metadata?: any;
  errorDetails?: any;
  retryCount: number;
  
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    transactionId: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true 
    },
    bookingId: { 
      type: String, 
      index: true 
    },
    userId: { 
      type: String, 
      required: true, 
      index: true 
    },
    type: { 
      type: String, 
      enum: Object.values(TransactionType), 
      required: true 
    },
    status: { 
      type: String, 
      enum: Object.values(TransactionStatus), 
      default: TransactionStatus.INITIATED,
      index: true 
    },
    amount: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    currency: { 
      type: String, 
      default: "INR" 
    },
    
    razorpayOrderId: { 
      type: String, 
      index: true 
    },
    razorpayPaymentId: { 
      type: String 
    },
    razorpayRefundId: { 
      type: String 
    },
    
    vehicleId: { 
      type: String 
    },
    seatNumbers: [{ 
      type: String 
    }],
    lockDuration: { 
      type: Number 
    },
    
    metadata: { 
      type: Schema.Types.Mixed 
    },
    errorDetails: { 
      type: Schema.Types.Mixed 
    },
    retryCount: { 
      type: Number, 
      default: 0 
    },
    
    completedAt: { 
      type: Date 
    },
  },
  { 
    timestamps: true 
  }
);

// Index for efficient querying
TransactionSchema.index({ createdAt: 1 });
TransactionSchema.index({ updatedAt: 1 });
TransactionSchema.index({ status: 1, retryCount: 1 });
TransactionSchema.index({ userId: 1, type: 1 });

export default mongoose.model<ITransaction>("Transaction", TransactionSchema);