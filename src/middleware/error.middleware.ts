import { NextFunction, Request, Response } from "express";
import ApiError from "../utlis/ApiError";
import { ENV } from "../config/env";
import { BusinessError } from "../types/common";

/**
 * Global error handling middleware
 */
const globalErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let apiError: ApiError;

  // Convert known errors to ApiError
  if (error instanceof ApiError) {
    apiError = error;
  } else if (error.name === 'ValidationError') {
    // Mongoose validation error
    apiError = ApiError.validation('Validation failed', [
      { field: 'validation', message: error.message }
    ]);
  } else if (error.name === 'CastError') {
    // Mongoose cast error
    apiError = ApiError.validation('Invalid data format');
  } else if (error.name === 'MongoServerError' && (error as any).code === 11000) {
    // MongoDB duplicate key error
    apiError = ApiError.conflict('Resource already exists');
  } else if (error.name === 'JsonWebTokenError') {
    apiError = ApiError.unauthorized('Invalid token');
  } else if (error.name === 'TokenExpiredError') {
    apiError = ApiError.unauthorized('Token expired');
  } else {
    // Unknown error
    apiError = new ApiError(
      ENV.NODE_ENV === 'production' ? 'Something went wrong' : error.message,
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }

  // Log error details
  console.error('❌ Error:', {
    message: apiError.message,
    statusCode: apiError.statusCode,
    code: apiError.code,
    stack: ENV.NODE_ENV === 'development' ? apiError.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Send error response
  res.status(apiError.statusCode).json(apiError.toJSON());
};

/**
 * Handle unhandled promise rejections
 */
export const handleUnhandledRejection = (): void => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('❌ Unhandled Promise Rejection:', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise,
    });
    
    // Close server gracefully
    process.exit(1);
  });
};

/**
 * Handle uncaught exceptions
 */
export const handleUncaughtException = (): void => {
  process.on('uncaughtException', (error: Error) => {
    console.error('❌ Uncaught Exception:', {
      message: error.message,
      stack: error.stack,
    });
    
    // Close server gracefully
    process.exit(1);
  });
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const apiError = ApiError.notFound(`Route ${req.originalUrl} not found`);
  res.status(apiError.statusCode).json(apiError.toJSON());
};

/**
 * Async error wrapper
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Validation middleware factory
 */
export const validateRequest = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = schema.validate(req.body);
      
      if (error) {
        const validationErrors = error.details.map((detail: any) => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
        }));
        
        throw ApiError.validation('Validation failed', validationErrors);
      }
      
      req.body = value; // Use validated and sanitized data
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Rate limiting middleware
 */
export const rateLimiter = (windowMs: number = 15 * 60 * 1000, max: number = 100) => {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean up old entries
    for (const [key, value] of requests.entries()) {
      if (value.resetTime < windowStart) {
        requests.delete(key);
      }
    }
    
    const clientRequests = requests.get(clientId);
    
    if (!clientRequests || clientRequests.resetTime < windowStart) {
      requests.set(clientId, { count: 1, resetTime: now });
      next();
    } else if (clientRequests.count >= max) {
      const apiError = ApiError.rateLimit('Too many requests, please try again later');
      res.status(apiError.statusCode).json(apiError.toJSON());
    } else {
      clientRequests.count++;
      next();
    }
  };
};

export default globalErrorHandler;
