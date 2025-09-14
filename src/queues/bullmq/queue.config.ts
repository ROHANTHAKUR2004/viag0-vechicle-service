import { QueueOptions } from 'bullmq';

export const redisConnection: QueueOptions['connection'] = {
  host: 'redis-18454.c240.us-east-1-3.ec2.redns.redis-cloud.com',
  port: 18454,
  username: 'default',
  password: 'qrwolXFcCbEriZeaIBGGxmWLkiWLhS7o',
};

export const baseQueueConfig = {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: {
      count: 3,
    },
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
};
