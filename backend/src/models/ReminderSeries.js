import mongoose from "mongoose";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Rappel répété (« tous les lundis à 10 h ») : le planificateur crée chaque occurrence
// dans l'agenda (Event) pour aujourd'hui et demain, comme les prises de médicaments
const reminderSeriesSchema = new mongoose.Schema(
  {
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true, index: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["rdv", "repas", "activite", "rappel", "autre"], default: "rappel" },
    time: { type: String, required: true, match: TIME_RE },
    freq: { type: String, enum: ["quotidien", "hebdomadaire"], required: true },
    // 0 = dimanche … 6 = samedi (répétition hebdomadaire)
    weekdays: { type: [Number], default: [] },
    medical: { type: Boolean, default: false },
    createdBy: { type: String, enum: ["aidant", "senior", "ia"], default: "senior" },
    active: { type: Boolean, default: true },
    // Aucune occurrence n'est créée avant ce moment (pas de rappel « déjà passé »)
    startAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model("ReminderSeries", reminderSeriesSchema);
