import type { Socket } from "socket.io";
import { ENV } from "../config/env";
import jwt from "jsonwebtoken";

export interface AuthedSocket extends Socket {
  user?: { id: string; name?: string };
}

export function socketAuth() {
  return (socket: AuthedSocket, next: (err?: Error) => void) => {
    try {
      // Token from handshake query, headers, or cookie
      const token = (socket.handshake.auth?.token
        || socket.handshake.headers.authorization?.replace("Bearer ", "")
        || (socket.handshake as any).headers?.cookie?.match(/token=([^;]+)/)?.[1]);

      if (!token) return next(); // allow anonymous sockets too
      const payload = jwt.verify(token, ENV.JWT_SECRET) as any;
      socket.user = { id: payload.id, name: payload.name };
      next();
    } catch (e) {
      next(); // soft-fail auth for public channels
    }
  };
}
