import express from "express";
import http from "http";
import cookieParser from "cookie-parser";
import cors from "cors";

// Config imports
import { connectDB } from "./config/db";
import { ENV } from "./config/env";
import redisCache from "./config/redis.config";
import rabbitMQ from "./config/rabbitmq.config";

// Routes
import vehicleRoutes from "./routes/vechicle.route";
import bookingRoutes from "./routes/booking.route";
import webhookRoutes from "./routes/webhook.route";

// Socket.IO
import { initializeSocket } from "./socket/index";

// Middleware
import globalErrorHandler, { 
  handleUnhandledRejection, 
  handleUncaughtException, 
  notFoundHandler 
} from "./middleware/error.middleware";

// Workers
import paymentRetryWorkers from "./workers/payment.retry.workers";
import seatlockCleanupWorker from "./workers/seatlock.cleanup.worker";
import expiredBookingCleanupWorker from "./workers/expired.booking.worker";

// Consumers
import { seatBookingconsumer } from "./consumers/seat-booking.consumer";

/**
 * Initialize Express application with all middleware and routes
 */
const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
  origin: ENV.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'idempotency-key'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: ENV.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});

// API Routes
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/webhooks", webhookRoutes);

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handling middleware (must be last)
app.use(globalErrorHandler);

/**
 * Start the server with all services
 */
export async function startServer(): Promise<void> {
  try {
    console.log("🚀 Starting Vehicle Service Server...");

    // Handle unhandled promise rejections and uncaught exceptions
    handleUnhandledRejection();
    handleUncaughtException();

    // Connect to databases
    console.log("📊 Connecting to databases...");
    await connectDB();
    await redisCache.connect();

    // Connect to message queue
    console.log("📨 Connecting to message queue...");
    await rabbitMQ['connect']();

    // Initialize Socket.IO
    console.log("🔌 Initializing Socket.IO...");
    const server = http.createServer(app);
    const io = initializeSocket(server);

    // Start background workers
    console.log("⚙️ Starting background workers...");
    await paymentRetryWorkers.start();
    
    // Initialize workers with Socket.IO instance for real-time updates
    const seatCleanupWorker = new seatlockCleanupWorker(io);
    await seatCleanupWorker.start();
    
    const expiredWorker = new expiredBookingCleanupWorker(io);
    expiredWorker.start();

    // Start consumers
    console.log("👂 Starting message consumers...");
    await seatBookingconsumer();

    // Start HTTP server
    server.listen(ENV.PORT, () => {
      console.log(`
🎉 Vehicle Service Server is running!
📍 Server: http://localhost:${ENV.PORT}
🌍 Environment: ${ENV.NODE_ENV}
📊 Health Check: http://localhost:${ENV.PORT}/health
🔌 Socket.IO: Enabled with Redis adapter
📨 Message Queue: Connected
💾 Database: Connected
⚙️ Workers: Active
      `);
    });

    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
      console.log('🛑 SIGTERM received, shutting down gracefully...');
      await gracefulShutdown(server);
    });

    process.on('SIGINT', async () => {
      console.log('🛑 SIGINT received, shutting down gracefully...');
      await gracefulShutdown(server);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown function
 */
async function gracefulShutdown(server: http.Server): Promise<void> {
  try {
    console.log('🔄 Starting graceful shutdown...');

    // Stop accepting new connections
    server.close(async () => {
      console.log('🔒 HTTP server closed');

      // Close all connections
      try {
        await redisCache.disconnect();
        await rabbitMQ.close();
        
        console.log('✅ All connections closed gracefully');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during graceful shutdown:', error);
        process.exit(1);
      }
    });

    // Force close after 30 seconds
    setTimeout(() => {
      console.error('❌ Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);

  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
