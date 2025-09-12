import mongoose, { Document, Schema } from "mongoose";

/** Seat Interface */
export interface ISeat {
  seatNumber: string;
  isAvailable: boolean;
  passenger?: string | null;
  price: number;
  from?: string;
  to?: string;
}

/** Route Stop Interface */
export interface IRouteStop {
  lng: number;
  lat: number;
  stopName: string;
  arrivalTime?: string; // ISO time string
  departureTime?: string; // ISO time string
  priceFromStart: number;
  distanceFromStartKm?: number;
}

/** Vehicle Document Interface */
export interface IVehicle extends Document {
  vehicleNumber: string;
  type: string;
  capacity: number;
  seats: ISeat[];
  source: string;
  destination: string;
  route: IRouteStop[];
  departureAt: Date;
  arrivalAt: Date;
  runsOnDays: string[];
  notRunsOn?: string[];

  currentLocation?: {
    lat: number;
    lng: number;
    speedKmph?: number;
    updatedAt: Date;
  };

  delayMinutes: number;
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/** Schemas */
const SeatSchema = new Schema<ISeat>({
  seatNumber: { type: String, required: true },
  isAvailable: { type: Boolean, default: true },
  passenger: { type: String, default: null },
  price: { type: Number, required: true, min: 0 },
  from: { type: String },
  to: { type: String },
});

const RouteStopSchema = new Schema<IRouteStop>({
  stopName: { type: String, required: true },
  arrivalTime: { type: String },
  departureTime: { type: String },
  priceFromStart: { type: Number, required: true, min: 0 },
  distanceFromStartKm: { type: Number, min: 0 },
  lng: { type: Number, required: true, min: -180, max: 180 },
  lat: { type: Number, required: true, min: -90, max: 90 },
});

const VehicleSchema = new Schema<IVehicle>(
  {
    vehicleNumber: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, enum: ["bus", "minibus", "tempo"] },
    capacity: { type: Number, required: true, min: 1 },

    seats: { type: [SeatSchema], default: [] },
    source: { type: String, required: true, index: true },
    destination: { type: String, required: true, index: true },
    route: { type: [RouteStopSchema], default: [] },

    departureAt: { type: Date, required: true },
    arrivalAt: { type: Date, required: true },
    runsOnDays: {
      type: [String],
      default: [],
      validate: [
        (val: string[]) => val.length > 0,
        "At least one operating day required",
      ],
    },
    notRunsOn: { type: [String], default: [] },

    currentLocation: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
      speedKmph: { type: Number, min: 0 },
      updatedAt: { type: Date, default: Date.now },
    },

    delayMinutes: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

VehicleSchema.index({ source: 1, destination: 1, departureAt: 1 });
VehicleSchema.index({ "currentLocation.updatedAt": 1 });

export default mongoose.model<IVehicle>("Vehicle", VehicleSchema);
