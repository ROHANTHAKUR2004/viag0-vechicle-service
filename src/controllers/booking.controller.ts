import { NextFunction, Request, Response } from "express";
import rabbitMQ from "../config/rabbitmq.config";
import redisCache from "../config/redis.config";
import { v4 as uuidv4 } from "uuid";

class bookingController {
  public async reserveSeat(req: Request, res: Response, next: NextFunction) {
    try {
      const { vehicleId, departureAt, seats, price } = req.body;

      const userId = req.user?.id; // assume middleware sets req.user
      const bookingId = uuidv4();
      const idempotencyKey = req.headers["idempotency-key"] as string;
      const ttl = 10 * 60; // 10 mins
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

      if (!vehicleId || !seats || seats.length === 0) {
        return res.status(400).json({ error: "Vehicle ID and seats required" });
      }

      // ✅ Step 1: Try to lock all requested seats
      for (const seat of seats) {
        const isLocked = await redisCache.isSeatLocked(vehicleId, seat);
        if (isLocked) {
          return res.status(409).json({
            error: `Seat ${seat} is already locked by another user`,
          });
        }
      }

      // Lock seats atomically
      for (const seat of seats) {
        const locked = await redisCache.lockSeat(vehicleId, seat, ttl);
        if (!locked) {
          return res.status(409).json({
            error: `Failed to lock seat ${seat}, already taken`,
          });
        }
      }
      const bookingPayload = {
        bookingId,
        userId,
        vehicleId,
        departureAt,
        seats,
        price,
        status: "PENDING",
        expiresAt,
        idempotencyKey,
      };

      await rabbitMQ.sendMessage("book_seat", JSON.stringify(bookingPayload));
    } catch (error) {}
  }
}
export default bookingController;
