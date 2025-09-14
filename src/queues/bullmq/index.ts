import { Worker } from "bullmq";
import { baseQueueConfig } from "./queue.config";
import { JobNames, QueueNames } from "./queue.enum";
import { seatUnlockProcessor } from "./processors/seatunlock.processor";

// Hint Unlock Worker
new Worker(
  QueueNames.UNLOCK_SEATS,
  async (job) => {
    if (job.name === JobNames.UNLOCK_SEATS) {
      await seatUnlockProcessor(job);
    }
  },
  {
    ...baseQueueConfig,
    concurrency: 5, // we can adjust concurrency based on expected load
    autorun: true, //automatically start the worker
  }
);

console.log("[BullMQ] Workers registered");
