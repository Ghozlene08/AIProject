import mongoose from "mongoose";

// Prise d'un médicament à un horaire donné
const intakeSchema = new mongoose.Schema(
  {
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true, index: true },
    medication: { type: mongoose.Schema.Types.ObjectId, ref: "Medication", required: true },
    scheduledAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ["a_venir", "confirme", "manque"], default: "a_venir" },
    confirmedAt: Date,
    // Nombre de rappels envoyés au senior sans confirmation
    reminders: { type: Number, default: 0 },
  },
  { timestamps: true },
);

intakeSchema.index({ medication: 1, scheduledAt: 1 }, { unique: true });

export default mongoose.model("Intake", intakeSchema);
