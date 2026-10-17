import mongoose from "mongoose";

// Alerte destinée à l'aidant (prise manquée, SOS, rendez-vous, synthèse…)
const alertSchema = new mongoose.Schema(
  {
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true, index: true },
    type: {
      type: String,
      enum: ["prise_manquee", "sos", "rdv", "symptome", "synthese", "info"],
      required: true,
    },
    severity: { type: String, enum: ["haute", "moyenne", "info"], default: "moyenne" },
    title: { type: String, required: true },
    message: String,
    read: { type: Boolean, default: false },
    sentTelegram: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("Alert", alertSchema);
