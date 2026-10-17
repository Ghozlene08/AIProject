import mongoose from "mongoose";

// Synthèse hebdomadaire générée par l'IA pour l'aidant
const weeklySummarySchema = new mongoose.Schema(
  {
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    content: { type: String, required: true },
    stats: {
      intakesTotal: Number,
      intakesConfirmed: Number,
      intakesMissed: Number,
      adherence: Number,
      events: Number,
      alerts: Number,
    },
    provider: String,
  },
  { timestamps: true },
);

export default mongoose.model("WeeklySummary", weeklySummarySchema);
