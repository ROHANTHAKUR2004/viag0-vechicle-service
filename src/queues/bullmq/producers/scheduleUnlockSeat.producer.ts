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
    {
      delay: ttlMs,
      removeOnComplete: true, // keeps Redis clean after success
      removeOnFail: false, // keep failed jobs for inspection
      attempts: 3, // auto-retry 3 times
      backoff: { type: "exponential", delay: 5000 }, // retry with delay
    }
  );
};
