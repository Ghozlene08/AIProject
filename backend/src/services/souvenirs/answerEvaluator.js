import { generateText } from "../ai/gateway.js";
import { keywords, normalize } from "./text.js";
import { similar } from "./titleMatcher.js";

/**
 * Évaluation des réponses orales du senior au quiz (module F4).
 * Verdict : "correct" | "proche" | "different" — jamais présenté comme « faux » au senior :
 * l'interface transforme "proche" et "different" en encouragement + indice.
 *
 * 1. Comparaison LOCALE (sans IA) : mots en commun, petites fautes tolérées, années proches.
 * 2. Si la comparaison ne suffit pas (« au bord de la mer » pour « Sousse »), le LLM juge,
 *    via la passerelle IA (anonymisation, secours, journal). Sans IA disponible : "different".
 */

// « Je ne sais pas », « je ne me souviens plus »… → l'assistant donne directement un indice
const DONT_KNOW = /\b(sais pas|sait pas|sais plus|aucune idee|souviens (plus|pas)|rappelle (plus|pas)|oublie|j'ai oublie|aide moi|aidez moi|un indice)\b/;
// « Passe », « question suivante »… → la question est passée
const SKIP = /\b(passe|passer|passons|suivante|on continue)\b/;

/** Ce que veut dire le senior : passer, avouer qu'il ne sait pas, ou répondre */
export function classifyIntent(text) {
  const t = ` ${normalize(text)} `.replace(/\s+/g, " ");
  // Seulement une phrase courte : « ça s'est passé à Sousse » est une réponse, pas « passer »
  if (SKIP.test(t) && t.trim().split(" ").length <= 4) return "skip";
  if (DONT_KNOW.test(t) || !keywords(text).length) return "dontknow";
  return "answer";
}

const years = (t) => (String(t).match(/\b(1[89]\d{2}|20\d{2})\b/g) ?? []).map(Number);

/** Comparaison locale entre la réponse dite et la réponse attendue */
export function localVerdict(given, expected) {
  // Années : exacte → correct ; à 3 ans près → proche
  const expYears = years(expected);
  const givYears = years(given);
  if (expYears.length && givYears.length) {
    const gap = Math.min(...expYears.flatMap((e) => givYears.map((g) => Math.abs(e - g))));
    if (gap === 0) return "correct";
    if (gap <= 3) return "proche";
  }

  const expected_ = keywords(expected);
  const given_ = keywords(given);
  const exp = expected_.length ? expected_ : normalize(expected).split(" ").filter(Boolean);
  if (!exp.length || !given_.length) return "different";

  const matched = exp.filter((e) => given_.some((g) => similar(g, e))).length;
  if (matched / exp.length >= 0.5) return "correct";
  if (matched > 0) return "proche";
  return "different";
}

const SYSTEM =
  "Tu évalues la réponse orale d'une personne âgée à un petit quiz sur ses propres souvenirs. " +
  "Sois bienveillant : accepte les synonymes, les approximations et les réponses partielles qui montrent " +
  "que la personne se souvient. Les jetons comme [PERSONNE_1] remplacent des noms ou des lieux. " +
  'Réponds uniquement en JSON : {"verdict": "correct" | "proche" | "different"}';

/**
 * @param given     ce que le senior a dit
 * @param expected  la réponse attendue (enregistrée avec le quiz)
 * @param question  la question posée
 * @param names     noms et lieux à anonymiser avant l'appel au LLM
 */
export async function evaluateAnswer({ given, expected, question, names = [], seniorId, allowAI = true }) {
  const local = localVerdict(given, expected);
  if (local !== "different" || !allowAI) return local;

  try {
    const { text } = await generateText({
      task: "Souvenir : évaluation d'une réponse au quiz",
      system: SYSTEM,
      prompt: `Question : ${question}\nRéponse attendue : ${expected}\nRéponse de la personne : ${given}`,
      names,
      seniorId,
      localFallback: () => JSON.stringify({ verdict: "different" }),
      maxTokens: 60,
    });
    const verdict = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).verdict;
    return ["correct", "proche", "different"].includes(verdict) ? verdict : "different";
  } catch {
    return "different";
  }
}
