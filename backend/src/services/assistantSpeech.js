import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export const AUDIO_TYPES = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mpeg": "mp3" };
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function transcribeAudio(audio, contentType, { apiKey = process.env.GROQ_API_KEY, fetcher = fetch, model = "whisper-large-v3-turbo" } = {}) {
  const mime = String(contentType).split(";")[0].toLowerCase();
  if (!AUDIO_TYPES[mime] || !Buffer.isBuffer(audio) || audio.length === 0 || audio.length > MAX_AUDIO_BYTES) throw new Error("Audio invalide");
  if (!apiKey) throw new Error("Clé Groq absente");
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mime }), `demande.${AUDIO_TYPES[mime]}`);
  form.append("model", model);
  form.append("language", "fr");
  form.append("response_format", "json");
  const response = await fetcher("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`STT indisponible (${response.status})`);
  const data = await response.json();
  if (typeof data.text !== "string" || !data.text.trim() || data.text.length > 2000) throw new Error("Transcription vide ou trop longue");
  return data.text.trim();
}

export const escapeXml = (text) => text.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]);

export async function synthesizeSpeech(text, { voice = "fr-FR-DeniseNeural", createTts = () => new MsEdgeTTS({ connectionTimeoutMs: 4000, synthesisTimeoutMs: 6000 }) } = {}) {
  if (typeof text !== "string" || !text.trim() || text.length > 4000) throw new Error("Texte TTS invalide");
  const tts = createTts();
  let deadline;
  let stream;
  try {
    const work = async () => {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(escapeXml(text), { rate: 0.9 });
      stream = audioStream;
      const chunks = [];
      let size = 0;
      for await (const chunk of audioStream) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) throw new Error("Audio TTS trop volumineux");
        chunks.push(Buffer.from(chunk));
      }
      if (!size) throw new Error("Audio TTS vide");
      return Buffer.concat(chunks);
    };
    return await Promise.race([work(), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("Délai TTS dépassé")), 10000); })]);
  } finally { clearTimeout(deadline); stream?.destroy(); tts.close(); }
}
