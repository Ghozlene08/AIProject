import { AiCall, AiProvider } from "../../models/index.js";
import { HttpError } from "../../utils/httpError.js";
import { hasApiKey } from "./providers.js";

/**
 * Reconnaissance vocale (speech-to-text) : transforme l'enregistrement du micro en texte.
 *
 * Fournisseur principal : Whisper large-v3-turbo hébergé gratuitement par Groq
 * (même clé GROQ_API_KEY que le LLM), configurable via le modèle AiProvider
 * (permet la simulation de panne depuis l'admin).
 * Secours : si Groq ne répond pas, on renvoie l'erreur 503 « STT_UNAVAILABLE »
 * et le navigateur utilise sa propre reconnaissance (Web Speech API).
 * Le senior ne voit donc jamais d'erreur.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const DEFAULT_MODEL = "whisper-large-v3-turbo";
const TIMEOUT_MS = 15_000;

// Phrases que Whisper « entend » parfois sur un silence ou un bruit de fond
const SILENCE_HALLUCINATIONS = /sous-titr|merci d'avoir regardé|abonnez-vous|amara\.org|♪/i;

// Formats audio acceptés par Whisper → extension du fichier envoyé
const EXTENSIONS = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};
export const AUDIO_TYPES = Object.keys(EXTENSIONS);
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 Mo, ~10 min de voix webm

// « audio/webm;codecs=opus » → « audio/webm »
export const baseMime = (mime) => String(mime ?? "").split(";")[0].trim().toLowerCase();

export const sttUnavailable = (reason) => new HttpError(503, "STT_UNAVAILABLE", { reason });

/**
 * @param buffer   l'enregistrement audio
 * @param mime     son type (ex. audio/webm)
 * @param options  { seniorId, task, hint } — hint : mots attendus, pour aider Whisper
 * @returns {Promise<{ text: string, provider: string, latencyMs: number }>}
 */
export async function transcribe(buffer, mime, { seniorId, task = "Reconnaissance vocale", hint } = {}) {
  const provider = await AiProvider.findOne({ capability: "stt", key: "whisper" });
  const started = Date.now();
  const log = (status, error) =>
    AiCall.create({
      task,
      capability: "stt",
      provider: provider?.name ?? "Groq Whisper",
      model: provider?.model ?? DEFAULT_MODEL,
      status,
      latencyMs: Date.now() - started,
      error,
      senior: seniorId,
    }).catch(() => {});

  // Validation d'entrée
  const type = baseMime(mime);
  if (!EXTENSIONS[type]) throw new HttpError(400, "Format audio non pris en charge");
  if (!Buffer.isBuffer(buffer) || buffer.length < 1000) throw new HttpError(400, "Enregistrement vide ou trop court");
  if (buffer.length > MAX_AUDIO_BYTES) throw new HttpError(400, "Enregistrement trop volumineux");

  // Provider désactivé / panne simulée / clé absente → secours navigateur
  if (provider && (!provider.enabled || provider.simulateFailure)) {
    const reason = provider.simulateFailure ? "Panne simulée par l'administrateur" : "Whisper indisponible (désactivé)";
    await log("erreur", reason);
    throw sttUnavailable(provider.simulateFailure ? "panne_simulee" : "desactive");
  }

  const envKey = provider?.envKey ?? "GROQ_API_KEY";
  const apiKey = process.env[envKey];
  if (!apiKey || (provider && !hasApiKey(provider))) {
    // Clé absente : ce n'est pas une panne, on passe directement au secours du navigateur
    throw sttUnavailable("cle_absente");
  }

  const model = provider?.model || DEFAULT_MODEL;
  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), `audio.${EXTENSIONS[type]}`);
  form.append("model", model);
  form.append("language", "fr");
  form.append("response_format", "json");
  form.append("temperature", "0");
  if (hint) form.append("prompt", hint); // vocabulaire attendu, ex. « écouter, raconter »

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status} : ${data?.error?.message ?? res.statusText}`);

    const text = String(data.text ?? "").trim();
    // Whisper hallucine parfois « Sous-titres réalisés par… » sur un silence
    if (!text || SILENCE_HALLUCINATIONS.test(text)) {
      const latencyMs = Date.now() - started;
      await log("erreur", "Aucune parole détectée");
      throw new HttpError(400, "Aucune parole détectée");
    }

    const latencyMs = Date.now() - started;
    await log("succes");
    return { text, provider: provider?.name ?? "Groq Whisper", latencyMs };
  } catch (err) {
    // Déjà loggé si hallucination, sinon on log ici
    if (!(err instanceof HttpError && err.status === 400)) {
      await log("erreur", err.message);
    }
    if (err instanceof HttpError) throw err;
    throw sttUnavailable("erreur_fournisseur");
  }
}

// Journalise l'usage de la reconnaissance du navigateur (secours) pour la supervision
export function logBrowserStt(seniorId) {
  return AiCall.create({
    task: "Reconnaissance vocale",
    capability: "stt",
    provider: "Web Speech API",
    model: "navigateur",
    status: "succes",
    fallback: true,
    latencyMs: 0,
    senior: seniorId,
  }).catch(() => {});
}