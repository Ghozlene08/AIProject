import mongoose from "mongoose";

const { Schema } = mongoose;

export const CALL_STATUSES = [
  "ringing",     // senior is calling, nobody answered yet
  "in_progress", // a caregiver accepted
  "completed",   // audio connected, then someone hung up
  "missed",      // nobody answered in time
  "rejected",    // every caregiver refused
  "cancelled",   // senior hung up while it was ringing
  "failed",      // accepted but audio never connected, or server restarted
  "unavailable", // no caregiver was online
];

const callSchema = new Schema(
  {
    callId: { type: String, required: true, unique: true },
    senior: { type: Schema.Types.ObjectId, ref: "Senior", required: true },
    caregiver: { type: Schema.Types.ObjectId, ref: "User" }, // the one who answered
    notifiedCaregivers: [{ type: Schema.Types.ObjectId, ref: "User" }],

    status: { type: String, enum: CALL_STATUSES, default: "ringing" },

    startedAt: { type: Date, default: Date.now }, // senior pressed "call"
    answeredAt: Date, // caregiver pressed "Répondre"
    connectedAt: Date, // audio really connected (start of the timer)
    endedAt: Date,
    durationSeconds: { type: Number, default: 0 }, // endedAt - connectedAt

    endedBy: { type: String, enum: ["senior", "caregiver", "system"] },
    endReason: String, // hangup | disconnected | timeout | rejected | no_caregiver_online | server_restart
  },
  { timestamps: true },
);

callSchema.index({ senior: 1, startedAt: -1 });
callSchema.index({ caregiver: 1, startedAt: -1 });

export default mongoose.models.Call || mongoose.model("Call", callSchema);