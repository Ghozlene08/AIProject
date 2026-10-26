import mongoose from "mongoose";

// Élément de l'agenda : rendez-vous, repas, activité…
const eventSchema = new mongoose.Schema(
  {
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true, index: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["rdv", "repas", "activite", "rappel", "autre"], default: "rdv" },
    startAt: { type: Date, required: true, index: true },
    location: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: String, enum: ["aidant", "senior", "ia"], default: "aidant" },
    status: { type: String, enum: ["prevu", "fait", "annule"], default: "prevu" },
    // Le senior a vu le rappel au moment prévu (bouton « C'est noté » ou réponse vocale)
    acknowledgedAt: Date,
    // Occurrence d'un rappel répété
    series: { type: mongoose.Schema.Types.ObjectId, ref: "ReminderSeries", index: true },
    // Lié à la santé (détecté par règles + LLM) : l'aidant est prévenu quand le senior l'ajoute
    medical: { type: Boolean, default: false },
    caregiverNotifiedAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model("Event", eventSchema);
