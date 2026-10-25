import Memory from "../../models/souvenirs/Memory.js";
import QuizSession from "../../models/souvenirs/QuizSession.js";
import { classifyIntent, evaluateAnswer } from "../../services/souvenirs/answerEvaluator.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import { matchMemory } from "../../services/souvenirs/titleMatcher.js";
import { streamPhoto } from "../../services/souvenirs/photo.storage.js";
import { trackEvent } from "../../services/tracking.js";

/**
 * Module Souvenirs — côté SENIOR (routes sous /api/senior/souvenirs, jeton senior obligatoire).
 * Le senior ne voit que les souvenirs VALIDÉS par l'aidant et NON MASQUÉS.
 */
const visibleTo = (senior) => ({ senior: senior._id, status: "valide", hidden: { $ne: true } });

// Ce que l'interface Senior reçoit pour la liste (pas de quiz ni de réponses)
const listItem = (m) => ({ _id: m._id, title: m.title, date: m.date, place: m.place, photosCount: m.photos?.length ?? 0 });

/* GET /api/senior/souvenirs : la liste des souvenirs à écouter (les plus récents d'abord) */
export async function list(req, res) {
  const memories = await Memory.find(visibleTo(req.senior)).sort({ createdAt: -1 });
  res.json({ memories: memories.map(listItem) });
}

/* POST /api/senior/souvenirs/choisir  { text, ids }
 * Retrouve le souvenir demandé à voix haute. `ids` = les souvenirs affichés à l'écran, dans l'ordre
 * (pour comprendre « le premier », « le deuxième »…). Sans `ids`, on cherche parmi tous les souvenirs. */
export async function choose(req, res) {
  const text = String(req.body?.text ?? "").trim();
  if (!text) throw badRequest("Le texte entendu est vide");
  const all = await Memory.find(visibleTo(req.senior), "title date place people");
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
  // Les souvenirs affichés d'abord, dans l'ordre de l'écran ; les autres ensuite
  const ordered = ids ? [...ids.map((id) => all.find((m) => String(m._id) === id)).filter(Boolean), ...all.filter((m) => !ids.includes(String(m._id)))] : all;
  const pool = ids ? ordered.slice(0, ids.length) : ordered;

  // On cherche d'abord parmi les souvenirs affichés, puis parmi tous
  let result = matchMemory(text, pool);
  if (result.status === "aucun" && ids) result = matchMemory(text, ordered);
  res.json(result);
}

/* GET /api/senior/souvenirs/:id : un souvenir à écouter (titre, récit, photos) */
export async function getOne(req, res) {
  const memory = await Memory.findOne({ _id: req.params.id, ...visibleTo(req.senior) });
  if (!memory) throw notFound("Souvenir introuvable");
  res.json({
    memory: {
      ...listItem(memory),
      recit: memory.generated?.recit ?? memory.story ?? "",
      photos: memory.photos.map((p) => ({ _id: p._id })),
    },
  });
}

// Souvenir visible par le senior connecté, ou erreur 404
async function findVisible(req) {
  const memory = await Memory.findOne({ _id: req.params.id, ...visibleTo(req.senior) });
  if (!memory) throw notFound("Souvenir introuvable");
  return memory;
}

/* GET /api/senior/souvenirs/:id/photos/:photoId : une photo du souvenir, montrée pendant le récit */
export async function getPhoto(req, res) {
  const memory = await findVisible(req);
  const photo = memory.photos.id(req.params.photoId);
  if (!photo) throw notFound("Photo introuvable");
  await streamPhoto(photo.fileId, res, photo.mime).catch(() => {
    throw notFound("Fichier de la photo introuvable");
  });
}

/* POST /api/senior/souvenirs/:id/ecoute : le senior a écouté le récit jusqu'au bout.
 * Alimente les statistiques de l'aidant (« Souvenirs écoutés ») et le compteur du souvenir. */
export async function markListened(req, res) {
  const memory = await findVisible(req);
  memory.listenCount = (memory.listenCount ?? 0) + 1;
  memory.lastListenedAt = new Date();
  await memory.save();
  trackEvent({ senior: req.senior._id, actor: "senior", module: "souvenirs", action: "souvenir_ecoute", channel: "voix", outcome: "reussi", step: 4 });
  res.status(204).end();
}

/* ---------- Quiz ----------
 * Les réponses attendues restent sur le serveur : le navigateur ne reçoit que les questions,
 * puis, au fil du jeu, les indices et la réponse quand elle est trouvée ou donnée. */

const FOUND = ["sans_indice", "un_indice", "deux_indices"]; // réponses trouvées par le senior
const DEFAULT_HINTS = (answer) => ["Prenez votre temps, pensez à ce moment-là.", `Cela commence par « ${String(answer).trim().charAt(0).toUpperCase()} ».`];

async function findSession(req) {
  const session = await QuizSession.findOne({ _id: req.params.sessionId, senior: req.senior._id });
  if (!session) throw notFound("Partie introuvable");
  const memory = await Memory.findOne({ _id: session.memory, ...visibleTo(req.senior) });
  if (!memory?.generated?.questions?.length) throw notFound("Quiz introuvable");
  return { session, memory };
}

/* POST /api/senior/souvenirs/:id/quiz : commence une partie sur ce souvenir */
export async function startQuiz(req, res) {
  const memory = await findVisible(req);
  const questions = memory.generated?.questions ?? [];
  if (!questions.length) throw notFound("Ce souvenir n'a pas encore de quiz");
  const session = await QuizSession.create({ senior: req.senior._id, memory: memory._id });
  trackEvent({ senior: req.senior._id, actor: "senior", module: "souvenirs", action: "quiz_commence", channel: "voix" });
  res.status(201).json({
    sessionId: session._id,
    title: memory.title,
    questions: questions.map((q) => ({ question: q.question })), // sans les réponses
  });
}

/* POST /api/senior/souvenirs/quiz/:sessionId/reponse  { questionIndex, text, attempt }
 * attempt : 0 = premier essai, 1 = après l'indice 1, 2 = après l'indice 2.
 * Réponse : { outcome: "correct" | "indice" | "donnee" | "passee", hint?, proche?, answer? } */
export async function answerQuiz(req, res) {
  const { session, memory } = await findSession(req);
  const index = Number(req.body?.questionIndex);
  const q = memory.generated.questions[index];
  if (!q) throw badRequest("Question inconnue");
  const attempt = Math.min(Math.max(Number(req.body?.attempt) || 0, 0), 2);
  const text = String(req.body?.text ?? "").trim().slice(0, 300);

  // Enregistre le résultat de la question (remplace un éventuel résultat précédent)
  const record = async (result) => {
    session.answers = session.answers.filter((a) => a.questionIndex !== index);
    session.answers.push({ questionIndex: index, question: q.question, given: text, hintsUsed: attempt, result });
    await session.save();
    trackEvent({ senior: req.senior._id, actor: "senior", module: "souvenirs", action: "quiz_reponse", channel: "voix", outcome: FOUND.includes(result) ? "reussi" : "abandon" });
  };

  const intent = classifyIntent(text);
  if (intent === "skip") {
    await record("passee");
    return res.json({ outcome: "passee", answer: q.answer });
  }

  const verdict =
    intent === "dontknow"
      ? "different"
      : await evaluateAnswer({
          given: text,
          expected: q.answer,
          question: q.question,
          names: [memory.place, ...(memory.people ?? []).map((p) => p.name), req.senior.firstName, req.senior.lastName].filter(Boolean),
          seniorId: req.senior._id,
          allowAI: req.senior.consentAI !== false,
        });

  if (verdict === "correct") {
    await record(FOUND[attempt]);
    return res.json({ outcome: "correct", answer: q.answer });
  }
  if (attempt < 2) {
    const hints = q.hints?.length >= 2 ? q.hints : DEFAULT_HINTS(q.answer);
    return res.json({ outcome: "indice", hint: hints[attempt], proche: verdict === "proche" });
  }
  await record("donnee");
  res.json({ outcome: "donnee", answer: q.answer });
}

/* POST /api/senior/souvenirs/quiz/:sessionId/fin : fin de la partie */
export async function finishQuiz(req, res) {
  const { session, memory } = await findSession(req);
  session.finishedAt = new Date();
  await session.save();
  res.json({
    total: memory.generated.questions.length,
    found: session.answers.filter((a) => FOUND.includes(a.result)).length,
  });
}
