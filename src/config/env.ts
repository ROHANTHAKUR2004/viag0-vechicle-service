import dotenv from "dotenv";
import { EnvironmentConfig } from "../types/common";

dotenv.config();

/**
 * Validates and exports environment variables with type safety
 */
function validateEnv(): EnvironmentConfig {
  const requiredEnvVars = [
    'MONGO_URI',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  const nodeEnv = process.env.NODE_ENV as 'development' | 'production' | 'test';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be one of: development, production, test');
  }

  const corsOrigin = process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(",").map(s => s.trim()).filter(Boolean)
    : ["http://localhost:3000", "http://localhost:5173"];

  return {
    NODE_ENV: nodeEnv,
    PORT: Number(process.env.PORT ?? 5001),
    MONGO_URI: process.env.MONGO_URI!,
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    JWT_SECRET: process.env.JWT_SECRET ?? "change_me",
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID!,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET!,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET!,
    CORS_ORIGIN: corsOrigin,
    RABBITMQ_URL: process.env.RABBITMQ_URL ?? "amqp://localhost:5672",
  };
}

export const ENV = validateEnv();
