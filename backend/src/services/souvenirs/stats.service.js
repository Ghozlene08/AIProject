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

  const answers = sessions.flatMap((s) => s.answers ?? []);
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
      played: sessions.length,
      answered,
      withoutHint: count("sans_indice"),
      withHint: count("un_indice") + count("deux_indices"),
      given: count("donnee"),
      skipped: count("passee"),
    },
    daily,
  };
}
