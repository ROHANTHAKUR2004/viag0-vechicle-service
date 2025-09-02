
import mongoose, { Document, Schema } from "mongoose";

/**
 * Seat schema: simple seat-level info (no booking logic here).
 * Booking/booking-ref will be handled by separate booking service.
 */
export interface ISeat {
  seatNumber: string; // "A1" or "1"
  isAvailable: boolean;
  passenger?: string | null; // optionally store passenger id/string for quick reference (booking service will be canonical)
  price: number;
  from?: string;
  to?: string;
}

export interface IRouteStop {
  lng: any;
  lat: any;
  stopName: string;
  arrivalTime?: string; // "09:30" (local-time string) or ISO if you prefer
  departureTime?: string;
  priceFromStart: number; // fare from route start to this stop
  distanceFromStartKm?: number; // optional for ETA calculations
}

export interface IVehicle extends Document {
  vehicleNumber: string;
  type: string; // bus, minibus, tempo, etc
  capacity: number;

  // Seat-level data (snapshot). Booking service should update these.
  seats: ISeat[];
  totalSeats: number;
  availableSeats: number;
  filledSeats: number;

  // route details
  source: string;
  destination: string;
  route: IRouteStop[]; // ordered list of stops

  // schedule & timing (ISO Date)
  departureAt: Date; // scheduled departure time from source (ISO)
  arrivalAt: Date;   // scheduled arrival time at destination (ISO)
  runsOnDays: string[]; // ["Mon","Tue"] or numbers 0-6 according to your preference
  notRunsOn?: string[]; // holidays / maintenance dates (ISO strings)

  // live tracking
  currentLocation?: {
    lat: any;
    lng: any;
    speedKmph?: number;
    updatedAt: Date;
  };

  // dynamic status
  delayMinutes?: number; // total minutes of delay (driver can update)
  isActive?: boolean; // whether a vehicle is operational

  createdAt: Date;
  updatedAt: Date;
}

const SeatSchema = new Schema<ISeat>({
  seatNumber: { type: String, required: true },
  isAvailable: { type: Boolean, default: true },
  passenger: { type: String, default: null },
  price: { type: Number, },
  from: { type: String },
  to: { type: String },
});

const RouteStopSchema = new Schema<IRouteStop>({
  stopName: { type: String, required: true },
  arrivalTime: { type: String },
  departureTime: { type: String },
  priceFromStart: { type: Number, required: true },
  distanceFromStartKm: { type: Number },
});

const VehicleSchema = new Schema<IVehicle>(
  {
    vehicleNumber: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true },
    capacity: { type: Number, required: true },

    seats: { type: [SeatSchema], default: [] },
    totalSeats: { type: Number, required: true },
    availableSeats: { type: Number, default: 0 },
    filledSeats: { type: Number, default: 0 },

    source: { type: String, required: true, index: true },
    destination: { type: String, required: true, index: true },
    route: { type: [RouteStopSchema], default: [] },

    departureAt: { type: Date, required: true },
    arrivalAt: { type: Date, required: true },
    runsOnDays: { type: [String], default: [] },
    notRunsOn: { type: [String], default: [] },

    currentLocation: {
      lat: Number,
      lng: Number,
      speedKmph: Number,
      updatedAt: { type: Date, default: Date.now },
    },

    delayMinutes: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexes to help queries by route/time
VehicleSchema.index({ source: 1, destination: 1, departureAt: 1 });
VehicleSchema.index({ "currentLocation.updatedAt": 1 });

export default mongoose.model<IVehicle>("Vehicle", VehicleSchema);
