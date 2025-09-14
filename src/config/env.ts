import dotenv from "dotenv";
dotenv.config();

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 5001),
  MONGO_URI: process.env.MONGO_URI!,
  CORS_ORIGIN: (process.env.CORS_ORIGIN ?? "").split(",").map(s => s.trim()).filter(Boolean),
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  JWT_SECRET: process.env.JWT_SECRET ?? "change_me",
};
