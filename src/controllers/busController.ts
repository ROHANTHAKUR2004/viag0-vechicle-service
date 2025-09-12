import { Request, Response } from "express";
import VehicleModel, { IVehicle } from "../models/vechicle.model";
import ApiError from "../utlis/ApiError";
import ApiResponse from "../utlis/ApiResponse";
import asyncHandler from "../utlis/asyncHandler";

export const createBus = asyncHandler(async (req: Request, res: Response) => {
   console.log("Request body =>", req.body);

    const body = req.body as any;

  if (
    !body.vehicleNumber ||
    !body.type ||
    !body.capacity ||
    !body.departureAt ||
    !body.arrivalAt ||
    !body.currentLocation
  ) {
    throw new ApiError( "Vehicle information required", 400);
  }

  if (!body.source || !body.destination) {
    throw new ApiError( "Vehicle route information required", 400);
  }

  const totalSeats = Number(body.totalSeats) || body.capacity;
  let seats = body.seats;

  if (!Array.isArray(seats) || seats.length === 0) {
    seats = Array.from({ length: totalSeats }, (_, i) => ({
      seatNumber: String(i + 1),
      isAvailable: true,
      passenger: null,
      price: body.price || 0,
    }));
  }

  const vehicleDoc = new VehicleModel({
    vehicleNumber: body.vehicleNumber,
    type: body.type || "bus",
    capacity: body.capacity || totalSeats,
    seats,
    totalSeats,
    availableSeats: seats.filter((s: any) => s.isAvailable).length,
    filledSeats: totalSeats - seats.filter((s: any) => s.isAvailable).length,
    source: body.source,
    destination: body.destination,
    route: body.route || [],
    departureAt: new Date(body.departureAt),
    arrivalAt: new Date(body.arrivalAt),
    runsOnDays: body.runsOnDays || [],
    notRunsOn: body.notRunsOn || [],
    currentLocation: body.currentLocation,
  });

  await vehicleDoc.save();

  return res.json(
    new ApiResponse(200, { vehicle: vehicleDoc }, "Vehicle created successfully")
  );
});


export const listVehicles = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const skip = (page - 1) * limit;

  const { source, destination, date } = req.query;
  if (!source || !destination) {
    throw new ApiError( "Both source and destination are required", 400);
  }

  // Date filter
  let filter: any = {};
  
  if (date) {
  const dateObj = new Date(String(date));

  // Extract the day of week (Mon, Tue, etc.)
  const dayOfWeek = dateObj.toLocaleDateString("en-US", { weekday: "long" });

  const start = new Date(dateObj);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateObj);
  end.setHours(23, 59, 59, 999);

  filter = {
    ...filter,
    departureAt: { $gte: start, $lte: end },
    runsOnDays: { $in: [dayOfWeek] }, // ✅ Only include buses that actually run that day
    notRunsOn: { $ne: dayOfWeek },    // ✅ Exclude buses marked as not running
  };
}


  let vehicles: any[] = [];
  let total = 0;

  /**
   * STEP 1: Direct buses (source -> destination).
   */
  const directFilter = { ...filter, source, destination };
  const directBuses = await VehicleModel.find(directFilter)
    .sort({ departureAt: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  if (directBuses.length > 0) {
    vehicles = directBuses;
    total = await VehicleModel.countDocuments(directFilter);
  } else {
    /**
     * STEP 2: Indirect buses.
     * Strategy:
     *   - Find all buses starting from `source`.
     *   - Find all buses that reach `destination`.
     *   - Look for common "connector stops".
     */
    const busesFromSource = await VehicleModel.find({
      ...filter,
      $or: [{ source }, { "route.stopName": source }],
    }).lean();

    const busesToDestination = await VehicleModel.find({
      ...filter,
      $or: [{ destination }, { "route.stopName": destination }],
    }).lean();

    const indirectResults: any[] = [];

    for (const bus1 of busesFromSource) {
      // all stops where bus1 drops passengers
      const bus1Stops = [bus1.destination, ...(bus1.route?.map(r => r.stopName) || [])];

      for (const stop of bus1Stops) {
        for (const bus2 of busesToDestination) {
          // all stops where bus2 picks passengers
          const bus2Stops = [bus2.source, ...(bus2.route?.map(r => r.stopName) || [])];

          if (bus2Stops.includes(stop)) {
            indirectResults.push({
              connectorStop: stop,
              firstBus: bus1,
              secondBus: bus2,
            });
          }
        }
      }
    }

    vehicles = indirectResults;
    total = indirectResults.length;
  }

  return res.json(
    new ApiResponse(
      200,
      { vehicles, meta: { page, limit, total } },
      "Vehicles fetched successfully"
    )
  );
});








