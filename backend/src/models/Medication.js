import mongoose from "mongoose";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Traitement saisi par l'aidant ; chaque horaire génère une prise par jour
const medicationSchema = new mongoose.Schema(
  {
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true, index: true },
    name: { type: String, required: true, trim: true },
    dosage: { type: String, trim: true },
    posology: { type: String, trim: true },
    times: {
      type: [String],
      validate: {
        validator: (arr) => arr.length > 0 && arr.every((t) => TIME_RE.test(t)),
        message: "Horaires invalides (format HH:MM attendu)",
      },
    },
    instructions: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model("Medication", medicationSchema);
