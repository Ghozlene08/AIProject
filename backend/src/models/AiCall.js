import mongoose from "mongoose";

// Journal d'un appel IA : le prompt est stocké déjà anonymisé (jetons)
const aiCallSchema = new mongoose.Schema(
  {
    task: { type: String, required: true },
    capability: { type: String, enum: ["llm", "stt", "tts", "ocr"], default: "llm" },
    provider: String,
    model: String,
    status: { type: String, enum: ["succes", "erreur"], required: true },
    fallback: { type: Boolean, default: false },
    latencyMs: Number,
    promptPreview: String,
    tokens: [String],
    error: String,
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior" },
  },
  { timestamps: true },
);

aiCallSchema.index({ createdAt: -1 });

export default mongoose.model("AiCall", aiCallSchema);
