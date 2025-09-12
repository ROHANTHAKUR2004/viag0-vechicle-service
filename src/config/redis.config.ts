import { createClient, RedisClientType } from "redis";
class RedisCache {
  public client: RedisClientType;
  public  pubClient : RedisClientType;
  public  subClient : RedisClientType;

  constructor() {
    const redisUrl:string  = 'redis://default:qrwolXFcCbEriZeaIBGGxmWLkiWLhS7o@redis-18454.c240.us-east-1-3.ec2.redns.redis-cloud.com:18454';
  //  const redisUrl  :string =  process.env.REDIS_URL || ""
  //  const redisUrl  :string =  "redis://127.0.0.1:6379";
    this.client = createClient({
      url : redisUrl
    });
    this.subClient = createClient({url : redisUrl});
    this.pubClient= createClient({url : redisUrl});

    this.client.on("connect", () => {
      console.log(`connected to redis`);
    });
    this.pubClient.on("connect", ()=>console.log("Pub client connected to redis"));
    this.subClient.on("connect", ()=>console.log("sub client connected to redis"));

    this.client.on("error", (err) => {
      console.log("redis error:", err);
    });
    this.pubClient.on("error", (err) => console.error("Redis pub error:", err));
    this.subClient.on("error", (err) => console.error("Redis sub error:", err));


  }
  public async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    if(!this.pubClient.isOpen){
      await this.pubClient.connect();

    }
    if(!this.subClient.isOpen){
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
  //default generic is string but it can be of any type
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
  public async publish (channel:string , message : any):Promise<void>{
    const stringMessage = typeof message ==="string" ? message:JSON.stringify(message);
    await this.pubClient.publish(channel, stringMessage);

  }
  public async subscribe(channel : string , callback:(message:any)=>void):Promise<void>{
    await this.subClient.subscribe(channel , (message)=>{
      try {
        callback(JSON.parse(message));
      } catch (error) {
        callback(message);

      }
    })
  }
  public async disconnect(): Promise<void> {
   
      await this.client.quit();
      console.log(`Disconnected from Redis`);
    
    if(this.pubClient.isOpen) await this.pubClient.quit();
    if(this.subClient.isOpen) await this.subClient.quit();
    console.log('Disconnected all redis clients');

  }
}
const redisCache: RedisCache = new RedisCache();
export default redisCache;
