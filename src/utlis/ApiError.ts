import { NextFunction, Response, Request } from "express";

class AppError extends Error {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true; // Distinguishes between operational errors and programming errors

    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
