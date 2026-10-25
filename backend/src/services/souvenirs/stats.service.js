import UsageEvent from "../../models/UsageEvent.js";
import { addDays, startOfDay } from "../../utils/dates.js";
import Memory from "../../models/souvenirs/Memory.js";
import QuizSession from "../../models/souvenirs/QuizSession.js";

/**
 * Statistiques du module Souvenirs pour le tableau de bord de l'aidant.
 * Elles mesurent la participation du senior, pas sa mémoire : ce n'est pas un test médical.
 */
export async function memoryStats(seniorId, days = 7) {
  const since = startOfDay(addDays(new Date(), -(days - 1)));
  const range = { $gte: since };

  const [listenEvents, sessions, total, pending, toldBySenior] = await Promise.all([
    UsageEvent.find({ senior: seniorId, module: "souvenirs", action: "souvenir_ecoute", createdAt: range }, "createdAt").lean(),
    QuizSession.find({ senior: seniorId, createdAt: range }, "answers createdAt").lean(),
    Memory.countDocuments({ senior: seniorId, status: "valide" }),
    Memory.countDocuments({ senior: seniorId, status: "a_valider" }),
    Memory.countDocuments({ senior: seniorId, source: "senior", createdAt: range }),
  ]);

  const played = sessions.filter((s) => s.answers?.length); // une partie abandonnée sans réponse ne compte pas
  const answers = played.flatMap((s) => s.answers ?? []);
  const count = (r) => answers.filter((a) => a.result === r).length;
  const answered = answers.filter((a) => a.result !== "passee").length;

  // Une valeur par jour (pour la petite courbe)
  const dayKey = (d) => startOfDay(d).toISOString().slice(0, 10);
  const daily = Array.from({ length: days }, (_, i) => {
    const key = dayKey(addDays(since, i));
    return {
      date: key,
      listened: listenEvents.filter((e) => dayKey(e.createdAt) === key).length,
      answered: sessions
        .filter((s) => dayKey(s.createdAt) === key)
        .reduce((n, s) => n + (s.answers ?? []).filter((a) => a.result !== "passee").length, 0),
    };
  });

  return {
    periodDays: days,
    memories: { total, pending, toldBySenior },
    listened: listenEvents.length,
    quizzes: {
      played: played.length,
      answered,
      withoutHint: count("sans_indice"),
      withHint: count("un_indice") + count("deux_indices"),
      given: count("donnee"),
      skipped: count("passee"),
    },
    daily,
    recentQuizzes: await recentQuizzes(seniorId),
  };
}

// Détail des 5 dernières parties : question, réponse dite par le senior, résultat
async function recentQuizzes(seniorId) {
  const sessions = await QuizSession.find({ senior: seniorId, "answers.0": { $exists: true } })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("memory", "title")
    .lean();
  return sessions.map((s) => ({
    _id: s._id,
    memoryTitle: s.memory?.title ?? "Souvenir supprimé",
    createdAt: s.createdAt,
    answers: [...s.answers].sort((a, b) => a.questionIndex - b.questionIndex).map((a) => ({ question: a.question, given: a.given, result: a.result })),
  }));
}
