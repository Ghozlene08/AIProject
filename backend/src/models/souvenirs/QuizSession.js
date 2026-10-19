import mongoose from "mongoose";

/**
 * Une partie de quiz jouée par le senior sur un souvenir.
 * Chaque réponse garde son résultat, sans jamais être « fausse » pour le senior :
 *   sans_indice  → trouvée du premier coup
 *   un_indice    → trouvée après le 1er indice
 *   deux_indices → trouvée après le 2e indice
 *   donnee       → racontée par l'assistant après les 2 indices
 *   passee       → le senior a dit « passe »
 */
export const ANSWER_RESULTS = ["sans_indice", "un_indice", "deux_indices", "donnee", "passee"];

const answerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true },
    given: String, // dernière réponse entendue
    hintsUsed: { type: Number, min: 0, max: 2, default: 0 },
    result: { type: String, enum: ANSWER_RESULTS, required: true },
  },
  { _id: false },
);

const quizSessionSchema = new mongoose.Schema(
  {
    senior: { type: mongoose.Schema.Types.ObjectId, ref: "Senior", required: true, index: true },
    memory: { type: mongoose.Schema.Types.ObjectId, ref: "Memory", required: true },
    answers: { type: [answerSchema], default: [] },
    finishedAt: Date,
  },
  { timestamps: true },
);

quizSessionSchema.index({ senior: 1, createdAt: -1 });

export default mongoose.model("QuizSession", quizSessionSchema);
