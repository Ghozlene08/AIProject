import mongoose from "mongoose";

const schema = new mongoose.Schema({
  senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true },
  key: { type: String, enum: ["doctor", "preferredName", "hobby", "familyContact", "preferredLanguage"], required: true },
  value: { type: String, required: true, trim: true, maxlength: 200 },
}, { timestamps: true });
schema.index({ senior: 1, key: 1 }, { unique: true });
export default mongoose.model("AssistantMemory", schema);
