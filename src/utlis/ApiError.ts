import { NextFunction, Response, Request } from "express";
import { BusinessError, ValidationError } from "../types/common";

/**
 * Custom API Error class with comprehensive error handling
 */
class ApiError extends Error implements BusinessError {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;
  public code?: string;
  public details?: any;
  public timestamp: string;

  constructor(
    message: string, 
    statusCode: number = 500, 
    code?: string, 
    details?: any
  ) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create a validation error
   */
  static validation(message: string, errors?: ValidationError[]): ApiError {
    return new ApiError(message, 400, 'VALIDATION_ERROR', errors);
  }

  /**
   * Create a not found error
   */
  static notFound(message: string = 'Resource not found'): ApiError {
    return new ApiError(message, 404, 'NOT_FOUND');
  }

  /**
   * Create an unauthorized error
   */
  static unauthorized(message: string = 'Unauthorized access'): ApiError {
    return new ApiError(message, 401, 'UNAUTHORIZED');
  }

  /**
   * Create a forbidden error
   */
  static forbidden(message: string = 'Access forbidden'): ApiError {
    return new ApiError(message, 403, 'FORBIDDEN');
  }

  /**
   * Create a conflict error
   */
  static conflict(message: string = 'Resource conflict'): ApiError {
    return new ApiError(message, 409, 'CONFLICT');
  }

  /**
   * Create a rate limit error
   */
  static rateLimit(message: string = 'Too many requests'): ApiError {
    return new ApiError(message, 429, 'RATE_LIMIT');
  }

  /**
   * Create a service unavailable error
   */
  static serviceUnavailable(message: string = 'Service temporarily unavailable'): ApiError {
    return new ApiError(message, 503, 'SERVICE_UNAVAILABLE');
  }

  /**
   * Create a payment error
   */
  static payment(message: string, details?: any): ApiError {
    return new ApiError(message, 402, 'PAYMENT_ERROR', details);
  }

  /**
   * Create a booking error
   */
  static booking(message: string, details?: any): ApiError {
    return new ApiError(message, 422, 'BOOKING_ERROR', details);
  }

  /**
   * Create a seat error
   */
  static seat(message: string, details?: any): ApiError {
    return new ApiError(message, 422, 'SEAT_ERROR', details);
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON(): any {
    return {
      success: false,
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        status: this.status,
        timestamp: this.timestamp,
        details: this.details,
      },
    };
  }
}

export default ApiError;
