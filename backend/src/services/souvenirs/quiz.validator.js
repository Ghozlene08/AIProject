import { FORBIDDEN_WORDS, firstLetter, keywords, normalize } from "./text.js";

/**
 * Validation du contenu généré pour un souvenir (exigence : sortie validée avant affichage).
 * Rejette la sortie si :
 *  - ce n'est pas du JSON exploitable ;
 *  - le récit est vide, trop court ou trop long ;
 *  - un texte contient un mot interdit (« faux », « erreur »…) ;
 *  - moins de 2 questions ont une réponse présente dans les faits saisis (aucune invention).
 */

export const RECIT_MIN = 60;
export const RECIT_MAX = 1500;

// Tous les faits connus du souvenir, en un seul texte
export function factsText(memory) {
  const people = (memory.people ?? []).map((p) => `${p.name} ${p.relation ?? ""}`).join(" ");
  return [memory.title, memory.date, memory.place, people, memory.story].filter(Boolean).join(" ");
}

// Une réponse est « ancrée » si au moins un de ses mots porteurs figure dans les faits
export function isGrounded(answer, facts) {
  const factWords = new Set(keywords(facts));
  const words = keywords(answer);
  return words.length > 0 && words.some((w) => factWords.has(w));
}

// Extrait l'objet JSON d'une réponse de LLM (qui l'entoure parfois de ```json … ```)
export function parseJsonObject(raw) {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw ?? "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Sortie IA sans JSON");
  return JSON.parse(text.slice(start, end + 1));
}

const clean = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

function defaultHints(answer) {
  return ["Prenez votre temps, pensez à ce moment-là.", `Cela commence par « ${firstLetter(answer)} ».`];
}

/**
 * @param raw     texte (JSON) produit par le LLM ou par le générateur local
 * @param memory  le souvenir (faits saisis)
 * @returns {{ recit: string, questions: {question: string, answer: string, hints: string[]}[] }}
 */
export function validateGenerated(raw, memory) {
  const data = parseJsonObject(raw);

  const recit = clean(data.recit);
  if (recit.length < RECIT_MIN) throw new Error("Récit trop court");
  if (recit.length > RECIT_MAX) throw new Error("Récit trop long");
  if (FORBIDDEN_WORDS.test(recit)) throw new Error("Récit rejeté : mot interdit");

  const facts = factsText(memory);
  const items = Array.isArray(data.questions) ? data.questions : [];
  const questions = [];

  for (const item of items) {
    let question = clean(item?.question);
    const answer = clean(item?.answer ?? item?.reponse);
    if (!question || !answer || answer.length > 80) continue;
    if (!question.endsWith("?")) question = `${question} ?`;
    if (!isGrounded(answer, facts)) continue; // réponse inventée : question écartée

    let hints = (Array.isArray(item.hints ?? item.indices) ? (item.hints ?? item.indices) : []).map(clean).filter(Boolean);
    // Un indice ne doit ni contenir la réponse entière, ni de mot interdit
    const normAnswer = normalize(answer);
    hints = hints.filter((h) => !normalize(h).includes(normAnswer) && !FORBIDDEN_WORDS.test(h));
    while (hints.length < 2) hints.push(defaultHints(answer)[hints.length]);

    if (FORBIDDEN_WORDS.test(question)) continue;
    questions.push({ question, answer, hints: hints.slice(0, 2) });
    if (questions.length === 3) break;
  }

  if (questions.length < 2) throw new Error("Pas assez de questions fiables");
  return { recit, questions };
}
