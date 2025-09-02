// src/sockets/index.ts
import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";
import { createAdapter } from "@socket.io/redis-adapter";

import { ENV } from "../config/env";
import { pubClient, subClient } from "../config/reddis";
import { socketAuth } from "./middleware";
import { initVehicleEvents } from "./events/vechicle";


export function createSocketServer(httpServer: HTTPServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: ENV.CORS_ORIGIN?.length ? ENV.CORS_ORIGIN : true,
      credentials: true,
    },
    serveClient: false,
    transports: ["websocket", "polling"],
  });

  // Redis adapter (multi-instance scaling)
  io.adapter(createAdapter(pubClient, subClient));

  // Middleware (auth)
  io.use(socketAuth());

  // Custom namespaces / events
  initVehicleEvents(io);

  io.on("connection", (socket) => {
    console.log(` Client connected: ${socket.id}`);

    // basic ping-pong
    socket.on("ping", () => socket.emit("pong"));

    socket.on("disconnect", (reason) => {
      console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  return io;
}
