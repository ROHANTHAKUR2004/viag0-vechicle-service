import { Request, Response } from "express";

import CacheService from "../utils/CacheService";
import VehicleModel from "../models/vechicle.model";
import redisCache from "../config/redis.config";
import rabbitMQ from "./config/rabbitMQ.config";
/**
 * Core Search Service
 */
class SearchService {
  /**
   * Find direct vehicles between source and destination
   */
  static async findDirectVehicles(
    filter: any,
    skip: number,
    limit: number
  ): Promise<{ vehicles: any[]; total: number }> {
    const [vehicles, total] = await Promise.all([
      VehicleModel.find(filter)
        .sort({ departureAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      VehicleModel.countDocuments(filter),
    ]);

    return { vehicles, total };
  }

  /**
   * Find indirect vehicles with connection points (BFS)
   */
  static async findIndirectVehicles(
    source: string,
    destination: string,
    filter: any,
    maxConnections: number = 2
  ): Promise<any[]> {
    const allVehicles = await VehicleModel.find({
      ...filter,
      isActive: true,
    }).lean();

    const graph: Map<string, Set<string>> = new Map();
    const vehiclesByStop: Map<string, any[]> = new Map();

    allVehicles.forEach((vehicle) => {
      const stops = [
        vehicle.source,
        ...vehicle.route.map((r) => r.stopName),
        vehicle.destination,
      ];

      stops.forEach((stop) => {
        if (!vehiclesByStop.has(stop)) vehiclesByStop.set(stop, []);
        vehiclesByStop.get(stop)!.push(vehicle);
      });

      for (let i = 0; i < stops.length - 1; i++) {
        const fromStop = stops[i];
        const toStop = stops[i + 1];
        if (!graph.has(fromStop)) graph.set(fromStop, new Set());
        graph.get(fromStop)!.add(toStop);
      }
    });

    const paths = this.findPathsBFS(graph, source, destination, maxConnections);

    const results: any[] = [];
    for (const path of paths) {
      const vehicleCombinations = this.findVehiclesForPath(
        path,
        vehiclesByStop,
        allVehicles
      );
      results.push(...vehicleCombinations);
    }

    return results;
  }

  /** BFS Algorithm */
  private static findPathsBFS(
    graph: Map<string, Set<string>>,
    source: string,
    destination: string,
    maxConnections: number
  ): string[][] {
    const paths: string[][] = [];
    const queue: { path: string[]; visited: Set<string> }[] = [
      { path: [source], visited: new Set([source]) },
    ];

    while (queue.length > 0) {
      const { path, visited } = queue.shift()!;
      const currentStop = path[path.length - 1];

      if (currentStop === destination) {
        paths.push(path);
        continue;
      }

      if (path.length - 1 >= maxConnections) continue;

      const connections = graph.get(currentStop) || new Set();
      for (const nextStop of connections) {
        if (!visited.has(nextStop)) {
          queue.push({
            path: [...path, nextStop],
            visited: new Set([...visited, nextStop]),
          });
        }
      }
    }

    return paths;
  }

  /** Map path → vehicle combinations */
  private static findVehiclesForPath(
    path: string[],
    vehiclesByStop: Map<string, any[]>,
    allVehicles: any[]
  ): any[] {
    const segmentVehicles: any[][] = [];

    for (let i = 0; i < path.length - 1; i++) {
      const fromStop = path[i];
      const toStop = path[i + 1];
      const vehiclesForSegment = (vehiclesByStop.get(fromStop) || [])
        .filter((vehicle) => {
          const stops = [
            vehicle.source,
            ...vehicle.route.map((r: any) => r.stopName),
            vehicle.destination,
          ];
          const fromIndex = stops.indexOf(fromStop);
          const toIndex = stops.indexOf(toStop);
          return fromIndex !== -1 && toIndex !== -1 && fromIndex < toIndex;
        })
        .map((vehicle) => ({
          ...vehicle,
          segmentFrom: fromStop,
          segmentTo: toStop,
        }));

      segmentVehicles.push(vehiclesForSegment);
    }

    const combinations: any[] = [];
    const generateCombinations = (index: number, current: any[]): void => {
      if (index === segmentVehicles.length) {
        combinations.push([...current]);
        return;
      }
      for (const vehicle of segmentVehicles[index]) {
        current.push(vehicle);
        generateCombinations(index + 1, current);
        current.pop();
      }
    };
    generateCombinations(0, []);

    return combinations.map((vehicles) => ({
      connectorStops: path.slice(1, -1),
      vehicles,
    }));
  }
}

/**
 * Message Queue Service (RabbitMQ + Redis)
 */
class MessageQueueService {
  private static readonly SEARCH_QUEUE = "vehicle-search-queue";

  static async sendSearchRequest(data: any): Promise<void> {
    await rabbitMQ.sendMessage(this.SEARCH_QUEUE, JSON.stringify(data));
  }

  static async processSearchRequests(
    callback: (data: any) => Promise<any>
  ): Promise<void> {
    await rabbitMQ.receiveMessages(this.SEARCH_QUEUE, async (msg) => {
      if (!msg) return;
      try {
        const data = JSON.parse(msg.content.toString());
        const result = await callback(data);
        await redisCache.publish(`search-result:${data.requestId}`, {
          success: true,
          data: result,
        });
      } catch (err: any) {
        await redisCache.publish(`search-result:${data.requestId}`, {
          success: false,
          error: err.message,
        });
      }
    });
  }
}

/**
 * Core search function
 */
async function processSearch(
  source: string,
  destination: string,
  date: string | undefined,
  page: number,
  limit: number,
  filters: any
) {
  const skip = (page - 1) * limit;
  let filter: any = { isActive: true };

  if (date) {
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.toLocaleDateString("en-US", { weekday: "long" });
    filter.departureAt = {
      $gte: new Date(dateObj.setHours(0, 0, 0, 0)),
      $lte: new Date(dateObj.setHours(23, 59, 59, 999)),
    };
    filter.runsOnDays = { $in: [dayOfWeek] };
    filter.notRunsOn = { $ne: dayOfWeek };
  }

  if (filters.type) filter.type = { $in: filters.type.split(",") };

  const directResult = await SearchService.findDirectVehicles(
    { ...filter, source, destination },
    skip,
    limit
  );

  if (directResult.vehicles.length > 0) {
    return {
      vehicles: directResult.vehicles,
      meta: { page, limit, total: directResult.total },
    };
  }

  const indirectResults = await SearchService.findIndirectVehicles(
    source,
    destination,
    filter
  );

  return {
    vehicles: indirectResults.slice(skip, skip + limit),
    meta: { page, limit, total: indirectResults.length },
  };
}

/**
 * Controller (Sync Search with Cache)
 */
export const listVehicles = asyncHandler(
  async (req: Request, res: Response) => {
    const { source, destination, date } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);

    if (!source || !destination)
      throw new ApiError("Both source and destination are required", 400);

    const cacheKey = CacheService.generateKey(req);
    const cached = await CacheService.get(cacheKey);
    if (cached)
      return res.json(
        new ApiResponse(
          200,
          cached,
          "Vehicles fetched successfully (from cache)"
        )
      );

    const result = await processSearch(
      source as string,
      destination as string,
      date as string,
      page,
      limit,
      req.query
    );
    await CacheService.set(cacheKey, result);

    res.json(new ApiResponse(200, result, "Vehicles fetched successfully"));
  }
);

/**
 * Controller (Async Search via RabbitMQ + Redis Pub/Sub)
 */
export const asyncListVehicles = asyncHandler(
  async (req: Request, res: Response) => {
    const { source, destination, date } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);

    if (!source || !destination)
      throw new ApiError("Both source and destination are required", 400);

    const requestId = `search-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    await MessageQueueService.sendSearchRequest({
      requestId,
      source,
      destination,
      date,
      page,
      limit,
      filters: req.query,
    });

    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new ApiError("Timeout", 504)),
        30000
      );

      redisCache.subscribe(`search-result:${requestId}`, (message) => {
        clearTimeout(timeout);
        if (message.success) resolve(message.data);
        else reject(new ApiError(message.error, 500));
      });
    });

    res.json(new ApiResponse(200, result, "Vehicles fetched successfully"));
  }
);

/**
 * Background Search Processor
 */
export const initializeSearchProcessing = async () => {
  await MessageQueueService.processSearchRequests(async (data) => {
    const { source, destination, date, page, limit, filters } = data;
    const cacheKey = `search:${source}:${destination}:${date}:${page}:${limit}:${JSON.stringify(
      filters
    )}`;

    const cached = await CacheService.get(cacheKey);
    if (cached) return cached;

    const result = await processSearch(
      source,
      destination,
      date,
      page,
      limit,
      filters
    );
    await CacheService.set(cacheKey, result);
    return result;
  });
};
