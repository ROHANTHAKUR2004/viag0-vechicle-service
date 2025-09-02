import mongoose, { Document, Schema } from "mongoose";

export interface IReminder extends Document {
  userId: string;       // user identifier (string or ObjectId)
  vehicleId: mongoose.Types.ObjectId;
  busNumber?: string;   // optional convenience copy
  targetAt: Date;       // time when reminder should fire (destination arrival - beforeMinutes)
  beforeMinutes: number; // minutes before arrival to notify
  createdAt: Date;
  triggered: boolean;   // whether reminder has been processed
  channel?: "push" | "sms" | "email" | "webhook"; // optional
  meta?: any;           // extra metadata for worker
}

const ReminderSchema = new Schema<IReminder>(
  {
    userId: { type: String, required: true, index: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
    busNumber: { type: String },
    targetAt: { type: Date, required: true, index: true },
    beforeMinutes: { type: Number, required: true },
    triggered: { type: Boolean, default: false, index: true },
    channel: { type: String, enum: ["push", "sms", "email", "webhook"], default: "push" },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// index to quickly find pending reminders which are due
ReminderSchema.index({ triggered: 1, targetAt: 1 });

export default mongoose.model<IReminder>("Reminder", ReminderSchema);
