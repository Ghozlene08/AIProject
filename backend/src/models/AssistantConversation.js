import mongoose from "mongoose";

const turn = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true, maxlength: 4000 },
}, { _id: false });
const schema = new mongoose.Schema({
  senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true, unique: true },
  turns: { type: [turn], default: [] },
  // Le contexte court expire après 24 heures ; les faits confirmés restent séparés.
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });
export default mongoose.model("AssistantConversation", schema);
