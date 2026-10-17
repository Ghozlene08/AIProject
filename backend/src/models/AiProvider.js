import mongoose from "mongoose";

// Fournisseur IA configurable par l'administrateur
const aiProviderSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    capability: { type: String, enum: ["llm", "stt", "tts", "ocr"], required: true },
    model: String,
    role: { type: String, enum: ["principal", "secours"], default: "secours" },
    priority: { type: Number, default: 10 },
    enabled: { type: Boolean, default: true },
    // Démonstration : force l'échec de ce fournisseur (panne simulée)
    simulateFailure: { type: Boolean, default: false },
    envKey: String,
    description: String,
  },
  { timestamps: true },
);

export default mongoose.model("AiProvider", aiProviderSchema);
