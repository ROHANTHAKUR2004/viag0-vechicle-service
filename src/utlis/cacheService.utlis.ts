import { Request } from "express";
import redisCache from "../config/redis.config";

export default class CacheService {
  private static readonly CACHE_TTL = 300; // 5 minutes

  static async get(key: string): Promise<any> {
    return await redisCache.get(key);
  }

  static async set(key: string, data: any): Promise<void> {
    await redisCache.set(key, data, this.CACHE_TTL);
  }

  static async del(key: string): Promise<void> {
    await redisCache.delete(key);
  }

  static generateKey(req: Request): string {
    const { source, destination, date, page, limit, ...filters } = req.query;
    const keyParts = [
      "vehicles",
      source,
      destination,
      date,
      page,
      limit,
      ...Object.entries(filters)
        .sort()
        .map(([k, v]) => `${k}:${v}`),
    ];
    return keyParts.filter(Boolean).join(":");
  }
}