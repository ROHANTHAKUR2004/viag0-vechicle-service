import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import redisCache from "../config/redis.config";
import { SocketEvents, SocketData } from "../types/common";

/**
 * Initialize Socket.IO server with Redis adapter and authentication
 */
export const initializeSocket = (server: any) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || ["http://localhost:5173"],
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Setup Redis adapter for scaling
  io.adapter(createAdapter(redisCache.pubClient, redisCache.subClient));

  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Verify JWT token (simplified version)
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded || !decoded.id) {
        return next(new Error('Authentication error: Invalid token'));
      }

      socket.data.userId = decoded.id;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Connection handling
  io.on('connection', (socket: Socket) => {
    console.log(`✅ User ${socket.data.userId} connected via socket`);

    // Join user to their personal room
    socket.join(`user:${socket.data.userId}`);

    // Handle joining vehicle rooms for real-time updates
    socket.on('join_vehicle', (vehicleId: string) => {
      if (!vehicleId) {
        socket.emit('error', { message: 'Vehicle ID is required' });
        return;
      }

      socket.join(`vehicle:${vehicleId}`);
      console.log(`User ${socket.data.userId} joined vehicle room: ${vehicleId}`);
      
      socket.emit('joined_vehicle', { vehicleId, message: 'Successfully joined vehicle room' });
    });

    // Handle leaving vehicle rooms
    socket.on('leave_vehicle', (vehicleId: string) => {
      socket.leave(`vehicle:${vehicleId}`);
      console.log(`User ${socket.data.userId} left vehicle room: ${vehicleId}`);
      
      socket.emit('left_vehicle', { vehicleId, message: 'Successfully left vehicle room' });
    });

    // Handle seat selection updates
    socket.on('seat_selected', (data: SocketData) => {
      if (!data.vehicleId || !data.seatNumber) {
        socket.emit('error', { message: 'Vehicle ID and seat number are required' });
        return;
      }

      // Broadcast seat selection to other users in the same vehicle room
      socket.to(`vehicle:${data.vehicleId}`).emit('seat_selected', {
        ...data,
        userId: socket.data.userId,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle seat deselection
    socket.on('seat_deselected', (data: SocketData) => {
      if (!data.vehicleId || !data.seatNumber) {
        socket.emit('error', { message: 'Vehicle ID and seat number are required' });
        return;
      }

      // Broadcast seat deselection to other users
      socket.to(`vehicle:${data.vehicleId}`).emit('seat_deselected', {
        ...data,
        userId: socket.data.userId,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle booking status updates
    socket.on('booking_status_update', (data: SocketData) => {
      if (!data.bookingId) {
        socket.emit('error', { message: 'Booking ID is required' });
        return;
      }

      // Broadcast booking status to the user's personal room
      io.to(`user:${socket.data.userId}`).emit('booking_status_updated', {
        ...data,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`❌ User ${socket.data.userId} disconnected: ${reason}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error for user ${socket.data.userId}:`, error);
    });
  });

  return io;
};

/**
 * Socket event emitter utilities for server-side events
 */
export class SocketEventEmitter {
  /**
   * Emit seat locked event to vehicle room
   */
  static emitSeatLocked(io: Server, vehicleId: string, data: SocketData) {
    io.to(`vehicle:${vehicleId}`).emit('seat_locked', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit seat released event to vehicle room
   */
  static emitSeatReleased(io: Server, vehicleId: string, data: SocketData) {
    io.to(`vehicle:${vehicleId}`).emit('seat_released', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit booking confirmed event to user
   */
  static emitBookingConfirmed(io: Server, userId: string, data: SocketData) {
    io.to(`user:${userId}`).emit('booking_confirmed', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit booking expired event to user
   */
  static emitBookingExpired(io: Server, userId: string, data: SocketData) {
    io.to(`user:${userId}`).emit('booking_expired', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit vehicle updated event to vehicle room
   */
  static emitVehicleUpdated(io: Server, vehicleId: string, data: SocketData) {
    io.to(`vehicle:${vehicleId}`).emit('vehicle_updated', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit payment status event to user
   */
  static emitPaymentStatus(io: Server, userId: string, data: SocketData) {
    io.to(`user:${userId}`).emit('payment_status', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}

export function registerSocketEvents(io: Server, socket: Socket) {
  // This function can be used for additional event registration if needed
  // Currently, all events are registered in the initializeSocket function
}
