import mongoose from "mongoose";

// Profil d'une personne âgée, créé et géré par un ou plusieurs aidants
const seniorSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    birthDate: Date,
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    doctor: {
      name: { type: String, trim: true },
      specialty: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    medicalNotes: { type: String, trim: true },
    photoUrl: { type: String }, 
    caregivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    lastSeenAt: Date,
    consentAI: { type: Boolean, default: true },
  },
  { timestamps: true },
);

seniorSchema.virtual("age").get(function age() {
  if (!this.birthDate) return null;
  const diff = Date.now() - this.birthDate.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
});

seniorSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.id;
    return ret;
  },
});

export default mongoose.model("Senior", seniorSchema);
