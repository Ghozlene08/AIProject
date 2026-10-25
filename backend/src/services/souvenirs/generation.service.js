import { generateText } from "../ai/gateway.js";
import { localGenerate } from "./localGenerator.js";
import { validateGenerated } from "./quiz.validator.js";

/**
 * Génère (une seule fois) le récit et le quiz d'un souvenir, puis les met en cache dans `memory.generated`.
 * Chaîne : anonymisation → Groq → Gemini → OpenRouter (passerelle existante) → validation.
 * Si la sortie de l'IA est rejetée ou si le senior n'a pas donné son consentement IA,
 * le générateur local prend le relais : le senior a toujours un récit et un quiz.
 */

export const SYSTEM_PROMPT =
  "Tu es un conteur bienveillant pour une personne âgée. À partir des faits fournis " +
  "(titre, date, lieu, personnes, récit), écris un récit chaleureux de 4 à 6 phrases, à la " +
  "2e personne du pluriel (vous), en français simple. N'invente aucun fait, aucun nom, aucune date. " +
  "Les jetons entre crochets comme [PERSONNE_1] remplacent des noms ou des lieux : recopie-les tels quels. " +
  "Propose ensuite 3 questions faciles dont la réponse figure explicitement dans les faits, " +
  "avec 2 indices pour chacune, du plus vague au plus précis, sans jamais donner la réponse. " +
  "N'utilise jamais les mots « faux », « erreur » ou « incorrect ». " +
  'Réponds uniquement en JSON : {"recit": "...", "questions": [{"question": "...", "reponse": "...", "indices": ["...", "..."]}]}';

export function buildPrompt(memory) {
  const people = (memory.people ?? []).map((p) => `- ${p.name}${p.relation ? ` (${p.relation})` : ""}`).join("\n");
  return [
    `Titre : ${memory.title}`,
    `Date : ${memory.date || "non précisée"}`,
    `Lieu : ${memory.place || "non précisé"}`,
    `Personnes :\n${people || "- aucune précisée"}`,
    `Récit de l'aidant : ${memory.story || "aucun"}`,
  ].join("\n");
}

// Noms et lieux à anonymiser avant l'envoi au LLM
export function namesToHide(memory, senior) {
  return [
    senior && `${senior.firstName} ${senior.lastName}`,
    senior?.firstName,
    senior?.lastName,
    memory.place,
    ...(memory.people ?? []).map((p) => p.name),
  ].filter(Boolean);
}

function useLocal(memory) {
  return { ...localGenerate(memory), provider: "Générateur local", fallback: true };
}

/**
 * Produit un récit et un quiz SANS modifier le souvenir (rien n'est écrit en base).
 * Utilisé directement pour « Proposer un autre récit » : l'aidant décide ensuite.
 */
export async function proposeForMemory(memory, senior) {
  let result;

  if (senior && senior.consentAI === false) {
    // Pas de consentement : aucun appel externe
    result = useLocal(memory);
  } else {
    try {
      const { text, provider, fallback } = await generateText({
        task: "Souvenir : récit et quiz",
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(memory),
        names: namesToHide(memory, senior),
        seniorId: senior?._id,
        localFallback: () => JSON.stringify(localGenerate(memory)),
        maxTokens: 900,
      });
      result = { ...validateGenerated(text, memory), provider, fallback };
    } catch (err) {
      console.warn("⚠️  Souvenir : sortie IA rejetée, générateur local utilisé —", err.message);
      result = useLocal(memory);
    }
  }

  return result;
}

/**
 * Génère le quiz (et le récit si besoin) puis les place dans le souvenir (l'appelant fait memory.save()).
 *
 * Règle « un seul récit » : le texte du formulaire de l'aidant (story) et le récit lu au senior
 * (generated.recit) sont TOUJOURS identiques.
 *  - L'aidant a écrit le récit → c'est son texte qui est lu, mot pour mot ; l'IA ne fait que le quiz.
 *  - Le champ est vide → l'IA écrit le récit à partir des faits, et il est recopié dans le formulaire.
 * Pour reformuler avec l'IA, l'aidant passe par « Proposer un autre récit » (voir acceptProposal).
 */
export async function generateForMemory(memory, senior) {
  const result = await proposeForMemory(memory, senior);
  const story = memory.story?.trim();
  if (story) result.recit = story;
  else memory.story = result.recit;
  memory.generated = { ...result, generatedAt: new Date() };
  return memory;
}

/**
 * Vérifie une proposition renvoyée par le navigateur avant de l'enregistrer :
 * on ne fait jamais confiance au client, la proposition repasse par le validateur.
 * Seule exception : une proposition identique à celle du générateur local (déterministe).
 */
export function checkProposal(proposal, memory) {
  try {
    return validateGenerated(JSON.stringify(proposal ?? {}), memory);
  } catch (err) {
    const local = localGenerate(memory);
    if (JSON.stringify({ recit: proposal?.recit, questions: proposal?.questions }) === JSON.stringify(local)) return local;
    throw err;
  }
}

// Faut-il régénérer ? Oui si un fait servant au récit a changé
export const FACT_FIELDS = ["title", "date", "place", "people", "story"];
export function factsChanged(memory) {
  return FACT_FIELDS.some((f) => memory.isModified(f));
}
