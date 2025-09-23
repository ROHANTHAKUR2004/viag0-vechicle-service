import { connectDB } from "./config/db";
import { ENV } from "./config/env";
import express from "express";
import redisCache from "./config/redis.config";
import vehicleRoutes from "./routes/vechicle.route";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import http from "http";
import cookieParser from "cookie-parser";
import rabbitMQ from "./config/rabbitmq.config";
import { seatBookingconsumer } from "./consumers/seat-booking.consumer";

import bookingrouter from "./routes/booking.route"
const app = express();
app.use(express.json());
app.use(cookieParser());

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});
app.use("/api/vehicles", vehicleRoutes);

app.use("/api/booking", bookingrouter);


export async function startServer() {
  await connectDB();
  await redisCache.connect();
  await rabbitMQ['connect']();
  await seatBookingconsumer()
  io.adapter(createAdapter(redisCache.pubClient, redisCache.subClient));
  io.on("connection", (socket: Socket) => {
    if (io) {
    }
  });
  const server = http.createServer(app);

  server.listen(ENV.PORT, () => {
    console.log(` Server running on port ${ENV.PORT}`);
  });
}

startServer();
