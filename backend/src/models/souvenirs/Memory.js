import mongoose from "mongoose";

/**
 * Souvenir d'un senior (module F4).
 * - source "aidant" : saisi par l'aidant, directement validé
 * - source "senior" : raconté à voix haute par le senior, « à valider » par l'aidant
 * Le récit et le quiz sont générés par l'IA une seule fois puis gardés en cache (`generated`),
 * pour que la lecture côté senior démarre en moins de 4 secondes.
 */
const personSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    relation: { type: String, trim: true, maxlength: 60 }, // « mari », « sœur »…
  },
  { _id: false },
);

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    hints: { type: [String], default: [] }, // 2 indices : du plus vague au plus précis
  },
  { _id: false },
);

// Photo ajoutée par l'aidant, montrée au senior pendant l'écoute du souvenir.
// Le fichier lui-même est stocké dans GridFS (services/souvenirs/photo.storage.js).
const photoSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  mime: { type: String, required: true },
  size: Number, // en octets
  uploadedAt: { type: Date, default: Date.now },
});

const memorySchema = new mongoose.Schema(
  {
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true, index: true },
    title: { type: String, required: [true, "Le titre est obligatoire"], trim: true, maxlength: 120 },
    date: { type: String, trim: true, maxlength: 60 }, // texte libre : « été 1972 », « années 80 »
    place: { type: String, trim: true, maxlength: 80 },
    people: { type: [personSchema], default: [] },
    // Récit du souvenir (lu au senior) : jusqu'à 6000 caractères, soit environ 4 à 5 minutes de lecture
    story: { type: String, trim: true, maxlength: [6000, "Le récit ne doit pas dépasser 6000 caractères"] },
    photos: { type: [photoSchema], default: [] }, // 6 au maximum

    source: { type: String, enum: ["aidant", "senior"], default: "aidant" },
    status: { type: String, enum: ["valide", "a_valider"], default: "valide", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    validatedAt: Date,
    // Masqué par l'aidant : le souvenir reste enregistré mais n'est plus proposé au senior
    // (ex. souvenir devenu douloureux après un deuil). Réversible à tout moment.
    hidden: { type: Boolean, default: false },

    // Souvenir raconté par le senior (rempli à l'étape Senior)
    transcription: { type: String, maxlength: 6000 },
    audio: {
      fileId: mongoose.Schema.Types.ObjectId, // fichier GridFS
      mime: String,
      durationSec: Number,
    },

    // Contenu généré par l'IA (mis en cache)
    generated: {
      recit: String,
      questions: { type: [questionSchema], default: undefined },
      provider: String,
      fallback: Boolean,
      generatedAt: Date,
    },

    listenCount: { type: Number, default: 0 },
    lastListenedAt: Date,
  },
  { timestamps: true },
);

memorySchema.index({ senior: 1, createdAt: -1 });

memorySchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("Memory", memorySchema);
