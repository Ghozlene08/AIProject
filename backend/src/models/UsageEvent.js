import mongoose from "mongoose";

/**
 * Événement d'usage : chaque action significative est enregistrée une fois.
 * C'est la source de vérité des indicateurs de l'administration (adoption, utilité…).
 *
 * - module  : fonctionnalité concernée (F1 à F6)
 * - action  : ce qui a été fait (voir ACTIONS)
 * - outcome : reussi | echec | abandon — une action enregistrée n'est pas forcément réussie
 * - step    : pour les interactions vocales, étape atteinte du parcours
 *             1 demande entendue → 2 intention comprise → 3 action confirmée → 4 action réalisée
 */
export const MODULES = ["assistant", "agenda", "documents", "souvenirs", "famille", "aidant"];

export const ACTIONS = [
  "connexion",
  "interaction_vocale",
  "rappel_cree",
  "prise_confirmee",
  "prise_manquee",
  "appel_manque",
  "document_traite",
  "souvenir_ecoute",
  "souvenir_cree",
  "souvenir_valide",
  "souvenir_raconte",
  "quiz_commence",
  "quiz_reponse",
  "appel_proche",
  "sos",
  "traitement_saisi",
  "evenement_cree",
  "synthese_generee",
  "synthese_consultee",
  "alerte_traitee",
];

const usageEventSchema = new mongoose.Schema(
  {
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actor: { type: String, enum: ["senior", "aidant", "admin", "systeme"], required: true },
    module: { type: String, enum: MODULES, required: true },
    action: { type: String, enum: ACTIONS, required: true },
    channel: { type: String, enum: ["voix", "ecran", "auto"], default: "ecran" },
    outcome: { type: String, enum: ["reussi", "echec", "abandon"], default: "reussi" },
    intent: String,
    step: { type: Number, min: 1, max: 4 },
    failureReason: String,
    latencyMs: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

usageEventSchema.index({ createdAt: -1 });
usageEventSchema.index({ module: 1, createdAt: -1 });

export default mongoose.model("UsageEvent", usageEventSchema);
