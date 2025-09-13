import { createClient, RedisClientType } from "redis";
import { v4 as uuidv4 } from "uuid";

class RedisCache {
  public client: RedisClientType;
  public pubClient: RedisClientType;
  public subClient: RedisClientType;

  constructor() {
    const redisUrl: string =
      "redis://default:qrwolXFcCbEriZeaIBGGxmWLkiWLhS7o@redis-18454.c240.us-east-1-3.ec2.redns.redis-cloud.com:18454";
    
    this.client = createClient({
      url: redisUrl,
    });
    this.subClient = createClient({ url: redisUrl });
    this.pubClient = createClient({ url: redisUrl });

    this.client.on("connect", () => {
      console.log(`Connected to Redis`);
    });
    this.pubClient.on("connect", () =>
      console.log("Pub client connected to Redis")
    );
    this.subClient.on("connect", () =>
      console.log("Sub client connected to Redis")
    );

    this.client.on("error", (err) => {
      console.log("Redis error:", err);
    });
    this.pubClient.on("error", (err) => console.error("Redis pub error:", err));
    this.subClient.on("error", (err) => console.error("Redis sub error:", err));
  }

  public async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    if (!this.pubClient.isOpen) {
      await this.pubClient.connect();
    }
    if (!this.subClient.isOpen) {
      await this.subClient.connect();
    }
  }

  // ttl in seconds
  public async set(
    key: string,
    value: string | object,
    ttl?: number
  ): Promise<void> {
    const stringValue =
      typeof value === "string" ? value : JSON.stringify(value);
    if (ttl) {
      await this.client.set(key, stringValue, { EX: ttl });
    } else {
      await this.client.set(key, stringValue);
    }
  }

  // Default generic is string but it can be of any type
  public async get<T = string>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (value) {
      try {
        return JSON.parse(value) as T;
      } catch (error) {
        return value as T;
      }
    }
    return null;
  }

  public async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  public async exists(key: string): Promise<boolean> {
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  public async publish(channel: string, message: any): Promise<void> {
    const stringMessage =
      typeof message === "string" ? message : JSON.stringify(message);
    await this.pubClient.publish(channel, stringMessage);
  }

  public async subscribe(
    channel: string,
    callback: (message: any) => void
  ): Promise<void> {
    await this.subClient.subscribe(channel, (message) => {
      try {
        callback(JSON.parse(message));
      } catch (error) {
        callback(message);
      }
    });
  }

  public async disconnect(): Promise<void> {
    await this.client.quit();
    console.log(`Disconnected from Redis`);

    if (this.pubClient.isOpen) await this.pubClient.quit();
    if (this.subClient.isOpen) await this.subClient.quit();
    console.log("Disconnected all Redis clients");
  }

  /**
   * Advanced seat locking with atomic operations and retry mechanism
   */
  public async lockSeat(
    vehicleId: string,
    seatNumber: string,
    userId: string,
    bookingId: string,
    ttl = 300
  ): Promise<{ success: boolean; lockId?: string; existingLock?: any }> {
    const lockKey = `seat:lock:${vehicleId}:${seatNumber}`;
    const lockId = uuidv4();
    
    const lockData = {
      lockId,
      userId,
      bookingId,
      lockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };

    // Use Lua script for atomic operation
    const luaScript = `
      if redis.call("exists", KEYS[1]) == 0 then
        redis.call("set", KEYS[1], ARGV[1], "EX", ARGV[2])
        return {1, ARGV[1]}  -- Success, return lock data
      else
        return {0, redis.call("get", KEYS[1])}  -- Failed, return existing lock data
      end
    `;

    try {
      const result = await this.client.eval(luaScript, {
        keys: [lockKey],
        arguments: [JSON.stringify(lockData), ttl.toString()],
      }) as [number, string];
      
      if (result[0] === 1) {
        return { success: true, lockId };
      } else {
        return { 
          success: false, 
          existingLock: JSON.parse(result[1]) 
        };
      }
    } catch (error) {
      console.error("Error in seat locking:", error);
      return { success: false };
    }
  }

  /**
   * Release seat lock with verification
   */
  public async releaseSeat(
    vehicleId: string,
    seatNumber: string,
    lockId: string
  ): Promise<boolean> {
    const lockKey = `seat:lock:${vehicleId}:${seatNumber}`;
    
    const luaScript = `
      local currentLock = redis.call("get", KEYS[1])
      if not currentLock then
        return 1  -- No lock exists, considered success
      end
      
      local lockData = cjson.decode(currentLock)
      if lockData.lockId == ARGV[1] then
        redis.call("del", KEYS[1])
        return 1  -- Successfully released
      else
        return 0  -- Lock ID doesn't match
      end
    `;

    try {
      const result = await this.client.eval(luaScript, {
        keys: [lockKey],
        arguments: [lockId],
      }) as number;
      
      return result === 1;
    } catch (error) {
      console.error("Error in seat release:", error);
      return false;
    }
  }

  /**
   * Get all locked seats for a vehicle
   */
  public async getVehicleSeatLocks(vehicleId: string): Promise<any[]> {
    const pattern = `seat:lock:${vehicleId}:*`;
    const keys = await this.client.keys(pattern);
    
    if (keys.length === 0) return [];
    
    const locks = await this.client.mGet(keys);
    return locks
      .filter(lock => lock !== null)
      .map(lock => JSON.parse(lock as string));
  }

  /**
   * Extend seat lock TTL
   */
  public async extendSeatLock(
    vehicleId: string,
    seatNumber: string,
    lockId: string,
    ttl = 300
  ): Promise<boolean> {
    const lockKey = `seat:lock:${vehicleId}:${seatNumber}`;
    
    const luaScript = `
      local currentLock = redis.call("get", KEYS[1])
      if not currentLock then
        return 0  -- No lock exists
      end
      
      local lockData = cjson.decode(currentLock)
      if lockData.lockId == ARGV[1] then
        redis.call("expire", KEYS[1], ARGV[2])
        return 1  -- Successfully extended
      else
        return 0  -- Lock ID doesn't match
      end
    `;

    try {
      const result = await this.client.eval(luaScript, {
        keys: [lockKey],
        arguments: [lockId, ttl.toString()],
      }) as number;
      
      return result === 1;
    } catch (error) {
      console.error("Error in seat lock extension:", error);
      return false;
    }
  }
}

export default new RedisCache();