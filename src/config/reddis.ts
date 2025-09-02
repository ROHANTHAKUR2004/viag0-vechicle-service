// src/config/redis.ts
import { createClient, RedisClientType } from "redis";

class RedisCache {
  public client: RedisClientType;
  public pubClient: RedisClientType;
  public subClient: RedisClientType;
  private redisUrl: string;

  constructor() {
    this.redisUrl = 'redis://default:qrwolXFcCbEriZeaIBGGxmWLkiWLhS7o@redis-18454.c240.us-east-1-3.ec2.redns.redis-cloud.com:18454';

    this.client = createClient({ url: this.redisUrl });
    this.pubClient = createClient({ url: this.redisUrl });
    this.subClient = createClient({ url: this.redisUrl });

    this.client.on("connect", () => console.log(`Redis client connected`));
    this.pubClient.on("connect", () =>
      console.log("Redis pubClient connected")
    );
    this.subClient.on("connect", () =>
      console.log("Redis subClient connected")
    );

    this.client.on("error", (err) => console.error("Redis error:", err));
    this.pubClient.on("error", (err) =>
      console.error("Redis pubClient error:", err)
    );
    this.subClient.on("error", (err) =>
      console.error("Redis subClient error:", err)
    );
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) await this.client.connect();
    if (!this.pubClient.isOpen) await this.pubClient.connect();
    if (!this.subClient.isOpen) await this.subClient.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
    if (this.pubClient.isOpen) await this.pubClient.quit();
    if (this.subClient.isOpen) await this.subClient.quit();
    console.log("🔴 Disconnected all redis clients");
  }
}

const redisCache = new RedisCache();
export const pubClient = redisCache.pubClient;
export const subClient = redisCache.subClient;
export default redisCache;
