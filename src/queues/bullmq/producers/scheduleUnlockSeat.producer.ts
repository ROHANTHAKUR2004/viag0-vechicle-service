import { Queue } from "bullmq";
import { QueueNames } from "../queue.enum";
import { baseQueueConfig } from "../queue.config";

export const seatUnlockQueue = new Queue(
  QueueNames.UNLOCK_SEATS,
  baseQueueConfig
);
export const scheduleUnlockSeatJob = async (
  bookingId: string,
  ttlMs: number
) => {
  await seatUnlockQueue.add(
    "unlockSeats",
    { bookingId },
    { delay: ttlMs, removeOnComplete: true, removeOnFail: true }
  );
};
