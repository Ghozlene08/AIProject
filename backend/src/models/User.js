import mongoose from "mongoose";

// Compte d'un aidant ou d'un administrateur
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["aidant", "admin"], default: "aidant" },
    status: { type: String, enum: ["actif", "inactif"], default: "actif" },
    phone: { type: String, trim: true },
    notifications: {
      email: { type: Boolean, default: true },
      telegram: { type: Boolean, default: false },
      telegramChatId: {
        type: String,
        default: null,
      },
      sms: { type: Boolean, default: false },
    },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});


export default mongoose.model("User", userSchema);
