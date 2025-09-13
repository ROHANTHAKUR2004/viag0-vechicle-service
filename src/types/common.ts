/**
 * Common type definitions for the seat booking system
 */

export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  data: T | null;
  message: string;
  timestamp?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: PaginationMeta;
}

export interface BookingRequest {
  vehicleId: string;
  seatNumbers: string[];
  from: string;
  to: string;
  departureAt: string | Date;
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  bookingSource?: string;
  idempotencyKey?: string;
}

export interface PaymentConfirmationRequest {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface SeatLockData {
  lockId: string;
  userId: string;
  bookingId: string;
  lockedAt: string;
  expiresAt: string;
}

export interface VehicleSearchFilters {
  source?: string;
  destination?: string;
  date?: string;
  type?: string;
  minPrice?: number;
  maxPrice?: number;
  departureTime?: string;
  arrivalTime?: string;
  page?: number;
  limit?: number;
}

export interface SeatBookingStatus {
  seatNumber: string;
  isAvailable: boolean;
  isLocked: boolean;
  lockedBy?: string;
  lockedUntil?: Date;
  price: number;
}

export interface NotificationData {
  type: 'BOOKING_CONFIRMATION' | 'PAYMENT_FAILED' | 'BOOKING_EXPIRED' | 'REFUND_PROCESSED';
  userId: string;
  bookingId: string;
  [key: string]: any;
}

export interface WebhookEvent {
  event: string;
  account_id: string;
  contains: string[];
  payload: {
    payment: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        status: string;
        order_id: string;
        method: string;
        captured: boolean;
        created_at: number;
      };
    };
  };
  created_at: number;
}

export interface EnvironmentConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  MONGO_URI: string;
  REDIS_URL: string;
  JWT_SECRET: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;
  CORS_ORIGIN: string[];
  RABBITMQ_URL: string;
}

export interface DatabaseConnectionOptions {
  useNewUrlParser: boolean;
  useUnifiedTopology: boolean;
  maxPoolSize: number;
  serverSelectionTimeoutMS: number;
  socketTimeoutMS: number;
  bufferMaxEntries: number;
  bufferCommands: boolean;
}

export interface RedisConnectionOptions {
  url: string;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  lazyConnect: boolean;
}

export interface RabbitMQConnectionOptions {
  url: string;
  reconnectTimeInSeconds: number;
  heartbeatIntervalInSeconds: number;
}

export interface SocketEvents {
  SEAT_LOCKED: 'seat_locked';
  SEAT_RELEASED: 'seat_released';
  BOOKING_CONFIRMED: 'booking_confirmed';
  BOOKING_EXPIRED: 'booking_expired';
  VEHICLE_UPDATED: 'vehicle_updated';
  PAYMENT_STATUS: 'payment_status';
}

export interface SocketData {
  vehicleId: string;
  seatNumber?: string;
  bookingId?: string;
  userId?: string;
  status?: string;
  message?: string;
  data?: any;
}

export interface WorkerJobData {
  type: 'PAYMENT_RETRY' | 'SEAT_CLEANUP' | 'BOOKING_EXPIRY' | 'NOTIFICATION';
  payload: any;
  retryCount?: number;
  maxRetries?: number;
  delay?: number;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface BusinessError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;
  details?: any;
}
