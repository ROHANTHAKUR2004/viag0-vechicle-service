import { ConsumeMessage } from "amqplib";
import rabbitMQ from "../config/rabbitmq.config";

export const seatBookingconsumer = async () => {
  await rabbitMQ.receiveMessages("book_seat", (msg: ConsumeMessage | null) => {
    if (!msg) {
      return;
    }
    try {
      const {
        bookingId,
        userId,
        vehicleId,
        departureAt,
        seats,
        price,
        status,
        expiresAt,
        idempotencyKey,
      } = JSON.parse(msg.content.toString());


      
    } catch (error) {}
  });
};
