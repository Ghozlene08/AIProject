import mongoose from "mongoose";

// Alerte destinée à l'aidant (prise manquée, SOS, check-in manqué, appel manqué, rendez-vous, synthèse…)
const alertSchema = new mongoose.Schema(
  {
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true, index: true },
    type: {
      type: String,
      enum: ["appel_manque", "sos", "checkin_manque", "synthese", "info"],
      required: true,
    },
    severity: { type: String, enum: ["haute", "moyenne", "info"], default: "moyenne" },
    title: { type: String, required: true },
    message: String,
    read: { type: Boolean, default: false },

    // Missed calls only: link to the Call document
    callId: String,

    // Trois étapes distinctes : enregistrée (createdAt) → délivrée → traitée par l'aidant
    sentTelegram: { type: Boolean, default: false },
    deliveredAt: Date,
    readAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model("Alert", alertSchema);