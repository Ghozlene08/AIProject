import mongoose from "mongoose";

// Réglages globaux de la plateforme (document unique, clé « global »)
const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "global", unique: true },
    thresholds: {
      latencyP95TargetMs: { type: Number, default: 4000 }, // exigence : < 4 s pour 95 % des demandes
      errorRateMax: { type: Number, default: 5 }, // % d'erreurs par fournisseur
      fallbackRateMax: { type: Number, default: 10 }, // % d'appels servis par un secours
      voiceSuccessMin: { type: Number, default: 85 }, // % d'intentions vocales réalisées
      intakeConfirmMin: { type: Number, default: 80 }, // % de prises confirmées
      documentSuccessMin: { type: Number, default: 85 }, // % de documents expliqués
      inactivityDays: { type: Number, default: 7 }, // senior inactif au-delà
      quotaWarnPct: { type: Number, default: 80 }, // alerte de consommation de quota
    },
    privacy: {
      logRetentionDays: { type: Number, default: 90, min: 7, max: 365 },
      storePromptPreview: { type: Boolean, default: true },
      maskSeniorNames: { type: Boolean, default: true },
      minGroupSize: { type: Number, default: 3, min: 1 }, // statistiques masquées sous ce seuil
    },
  },
  { timestamps: true },
);

platformSettingsSchema.statics.get = async function get() {
  return (await this.findOne({ key: "global" })) ?? this.create({ key: "global" });
};

export default mongoose.model("PlatformSettings", platformSettingsSchema);
