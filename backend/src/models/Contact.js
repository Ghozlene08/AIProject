import mongoose from "mongoose";

// Proche ou professionnel que le senior peut appeler
const contactSchema = new mongoose.Schema(
  {
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true, index: true },
    name: { type: String, required: true, trim: true },
    relation: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
    isEmergency: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.model("Contact", contactSchema);
