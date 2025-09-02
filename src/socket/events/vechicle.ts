import { Server } from "socket.io";

export function initVehicleEvents(io: Server) {
  // Client joins a vehicle room to get live updates for that vehicle
  io.on("connection", (socket) => {
    socket.on("vehicle:join", (vehicleId: string) => {
      socket.join(`vehicle:${vehicleId}`);
    });

    socket.on("vehicle:leave", (vehicleId: string) => {
      socket.leave(`vehicle:${vehicleId}`);
    });
  });
}

// Helper to broadcast location/seat updates from anywhere in your app
export function emitVehicleLocation(io: Server, vehicleId: string, data: {
  lat: number; lng: number; updatedAt: string;
}) {
  io.to(`vehicle:${vehicleId}`).emit("vehicle:location", data);
}

export function emitSeatSnapshot(io: Server, vehicleId: string, data: {
  totalSeats: number; availableSeats: number; filledSeats: number;
}) {
  io.to(`vehicle:${vehicleId}`).emit("vehicle:seats", data);
}
