
import mongoose from "mongoose";

const checkInSchema = new mongoose.Schema(
  {
    senior: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Senior",
      required: true,
      index: true,
    },
    requestedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    deadlineAt: {
      type: Date,
      required: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "responded", "missed", "escalated"],
      default: "pending",
      index: true,
    },
    escalationSentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

checkInSchema.index({ senior: 1, status: 1, requestedAt: -1 });

export default mongoose.model("CheckIn", checkInSchema);
