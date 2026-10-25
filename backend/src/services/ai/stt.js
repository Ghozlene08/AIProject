import { AiCall } from "../../models/index.js";
import { HttpError } from "../../utils/httpError.js";

/**
 * Reconnaissance vocale (speech-to-text) : transforme l'enregistrement du micro en texte.
 *
 * Fournisseur principal : Whisper large-v3-turbo, modèle d'IA de reconnaissance vocale,
 * hébergé gratuitement par Groq (même clé GROQ_API_KEY que le LLM).
 * Secours : si Groq ne répond pas (clé absente, quota, panne), on renvoie l'erreur 503
 * « STT_UNAVAILABLE » et le navigateur utilise sa propre reconnaissance (Web Speech API).
 * Le senior ne voit donc jamais d'erreur.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";
const TIMEOUT_MS = 10_000;

// Formats audio acceptés par Whisper → extension du fichier envoyé (Groq déduit le format du nom)
const EXTENSIONS = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};
export const AUDIO_TYPES = Object.keys(EXTENSIONS);
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 Mo, environ 10 minutes de voix en webm

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
  const type = baseMime(mime);
  if (!EXTENSIONS[type]) throw new HttpError(400, "Format audio non pris en charge");
  if (!Buffer.isBuffer(buffer) || buffer.length < 1000) throw new HttpError(400, "Enregistrement vide ou trop court");

  // Clé absente : ce n'est pas une panne, on passe directement au secours du navigateur
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw sttUnavailable("cle_absente");

  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), `audio.${EXTENSIONS[type]}`);
  form.append("model", MODEL);
  form.append("language", "fr");
  form.append("response_format", "json");
  form.append("temperature", "0");
  if (hint) form.append("prompt", hint); // vocabulaire attendu, ex. « écouter, raconter »

  const started = Date.now();
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
    const latencyMs = Date.now() - started;
    log({ task, status: "succes", latencyMs, seniorId });
    return { text, provider: "Groq Whisper", latencyMs };
  } catch (err) {
    log({ task, status: "erreur", latencyMs: Date.now() - started, seniorId, error: err.message });
    throw sttUnavailable("erreur_fournisseur");
  }
}

// Journal de l'appel (visible par l'administrateur) ; ne bloque jamais la réponse
function log({ task, status, latencyMs, seniorId, error }) {
  AiCall.create({
    task,
    capability: "stt",
    provider: "Groq",
    model: MODEL,
    status,
    latencyMs,
    error,
    senior: seniorId,
  }).catch(() => {});
}
