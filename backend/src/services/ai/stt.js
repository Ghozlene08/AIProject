import { AiCall, AiProvider } from "../../models/index.js";
import { hasApiKey } from "./providers.js";

// Phrases que Whisper « entend » parfois sur un silence ou un bruit de fond
const SILENCE_HALLUCINATIONS = /sous-titr|merci d'avoir regardé|abonnez-vous|amara\.org|♪/i;

const EXTENSIONS = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "audio/mp4": "m4a" };

/**
 * Transcrit un enregistrement audio en français avec Whisper (Groq).
 * En cas d'échec, l'erreur remonte : l'interface utilise alors la reconnaissance
 * du navigateur (Web Speech API), solution de secours du cahier des charges.
 */
export async function transcribe(buffer, mime, seniorId) {
  const provider = await AiProvider.findOne({ capability: "stt", key: "whisper" });
  const started = Date.now();
  const log = (status, error) =>
    AiCall.create({ task: "Reconnaissance vocale", capability: "stt", provider: provider?.name ?? "Whisper (STT)", model: provider?.model, status, latencyMs: Date.now() - started, error, senior: seniorId });

  if (!provider?.enabled || provider.simulateFailure || !hasApiKey(provider)) {
    const reason = provider?.simulateFailure ? "Panne simulée par l'administrateur" : "Whisper indisponible (désactivé ou clé absente)";
    await log("erreur", reason);
    throw new Error(reason);
  }
  if (!buffer?.length || buffer.length < 1000) {
    await log("erreur", "Enregistrement vide");
    throw new Error("Enregistrement vide");
  }

  const type = String(mime || "audio/webm").split(";")[0];
  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), `demande.${EXTENSIONS[type] ?? "webm"}`);
  form.append("model", provider.model || "whisper-large-v3-turbo");
  form.append("language", "fr");
  form.append("response_format", "json");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env[provider.envKey]}` },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status} : ${data?.error?.message ?? res.statusText}`);
    const text = String(data.text ?? "").trim();
    if (!text || SILENCE_HALLUCINATIONS.test(text)) throw new Error("Aucune parole détectée");
    await log("succes");
    return { text, provider: provider.name };
  } catch (err) {
    await log("erreur", err.message);
    throw err;
  }
}

// Journalise l'usage de la reconnaissance du navigateur (secours) pour la supervision
export function logBrowserStt(seniorId) {
  return AiCall.create({ task: "Reconnaissance vocale", capability: "stt", provider: "Web Speech API", model: "navigateur", status: "succes", fallback: true, latencyMs: 0, senior: seniorId });
}
