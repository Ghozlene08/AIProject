import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { AiCall, AiProvider } from "../../models/index.js";
import { hasApiKey } from "./providers.js";

/*
 * Synthèse vocale « voix naturelle » côté serveur.
 * Chaîne : Edge TTS (principal, cahier des charges) → Gemini TTS (secours officiel) ;
 * en cas d'échec, l'interface utilise la voix du navigateur (dernier secours).
 *
 * Constat du 25/10/2026 : Microsoft refuse l'accès non officiel d'Edge TTS
 * (« Unexpected server response: 200 »). Un disjoncteur évite de le retenter
 * à chaque phrase : après un échec, il est ignoré pendant 30 minutes.
 */

const BREAKER_MS = 30 * 60 * 1000;
const brokenUntil = new Map();

function edgeTts(provider, text) {
  return new Promise((resolve, reject) => {
    const tts = new MsEdgeTTS();
    const timer = setTimeout(() => {
      tts.close();
      reject(new Error("Délai dépassé (6 s)"));
    }, 6000);
    const fail = (err) => {
      clearTimeout(timer);
      try {
        tts.close();
      } catch {}
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    tts
      .setMetadata(provider.model || "fr-FR-DeniseNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      .then(() => {
        const { audioStream } = tts.toStream(text, { rate: "-8%" });
        const chunks = [];
        audioStream.on("data", (c) => chunks.push(c));
        audioStream.on("error", fail);
        audioStream.on("close", () => {
          clearTimeout(timer);
          tts.close();
          const audio = Buffer.concat(chunks);
          audio.length ? resolve({ audio, mime: "audio/mpeg" }) : reject(new Error("Audio vide"));
        });
      })
      .catch(fail);
  });
}

// Gemini renvoie du WAV ou du PCM brut (L16, 24 kHz) : le PCM est enveloppé dans un en-tête WAV
function pcmToWav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function geminiTts(provider, text) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${provider.model || "gemini-3.8-flash-tts"}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env[provider.envKey] },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Lis ce texte en français, d'une voix calme, chaleureuse et un peu lente : ${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
    }),
    signal: AbortSignal.timeout(12000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status} : ${data?.error?.message ?? res.statusText}`);
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("Aucun audio renvoyé");
  const bytes = Buffer.from(part.inlineData.data, "base64");
  const mime = part.inlineData.mimeType ?? "";
  if (mime.includes("wav")) return { audio: bytes, mime: "audio/wav" };
  const rate = Number(mime.match(/rate=(\d+)/)?.[1] ?? 24000);
  return { audio: pcmToWav(bytes, rate), mime: "audio/wav" };
}

const SYNTH = { edgetts: edgeTts, geminitts: geminiTts };

/** Synthétise `text` ; lève une erreur si aucun fournisseur serveur n'a répondu. */
export async function synthesize(text, seniorId) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
  if (!clean) throw new Error("Texte vide");
  const providers = await AiProvider.find({ capability: "tts", enabled: true, key: { $in: Object.keys(SYNTH) } }).sort({ priority: 1 });

  let attempt = 0;
  for (const p of providers) {
    if (p.simulateFailure === false && brokenUntil.get(p.key) > Date.now()) continue; // disjoncteur ouvert
    if (!p.simulateFailure && !hasApiKey(p)) continue;
    const started = Date.now();
    const log = (status, error) =>
      AiCall.create({ task: "Synthèse vocale", capability: "tts", provider: p.name, model: p.model, status, fallback: attempt > 0, latencyMs: Date.now() - started, error, senior: seniorId });
    try {
      if (p.simulateFailure) throw new Error("Panne simulée par l'administrateur");
      const out = await SYNTH[p.key](p, clean);
      brokenUntil.delete(p.key);
      await log("succes");
      return { ...out, provider: p.name };
    } catch (err) {
      brokenUntil.set(p.key, Date.now() + BREAKER_MS);
      await log("erreur", err.message);
      attempt += 1;
    }
  }
  throw new Error("Aucune voix naturelle disponible");
}
