import mongoose from "mongoose";

// Alerte destinée à l'aidant (prise manquée, SOS, check-in manqué, rendez-vous, synthèse…)
const alertSchema = new mongoose.Schema(
  {
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true, index: true },
    type: {
      type: String,
      enum: ["prise_manquee", "sos", "checkin_manque", "rdv", "symptome", "synthese", "info"], // ← checkin_manque
      required: true,
    },
    severity: { type: String, enum: ["haute", "moyenne", "info"], default: "moyenne" },
    title: { type: String, required: true },
    message: String,
    read: { type: Boolean, default: false },
    sentTelegram: { type: Boolean, default: false }, // ← lu par la page Alertes (badge Telegram)
  },
  { timestamps: true },
);

export default mongoose.model("Alert", alertSchema);