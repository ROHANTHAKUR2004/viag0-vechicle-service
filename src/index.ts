import http from "http";

import { connectDB } from "./config/db";
import { ENV } from "./config/env";
import express  from "express";
import redisCache from "./config/reddis";
import { createSocketServer } from "./socket";
import  vehicleRoutes from "./routes/vechicle.route"

const app = express();


export async function startServer() {


app.use(express.json());

app.use("/api/vehicles", vehicleRoutes);


  await connectDB();
  await redisCache.connect();



  const server = http.createServer(app);
  const io = createSocketServer(server);

  server.listen(ENV.PORT, () => {
    console.log(` Server running on port ${ENV.PORT}`);
  });

//   withGracefulShutdown([
//     () => new Promise<void>(res => server.close(() => res())),
//     () => io.close(),
//     () => pubClient.disconnect(),
//     () => subClient.disconnect()
//   ]);
}

startServer();
