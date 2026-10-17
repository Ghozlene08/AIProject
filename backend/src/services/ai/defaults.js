import { AiProvider } from "../../models/index.js";

// Fournisseurs IA du cahier des charges (principal + secours pour chaque capacité)
export const DEFAULT_PROVIDERS = [
  { key: "groq", name: "Groq", capability: "llm", model: "llama-3.3-70b-versatile", role: "principal", priority: 1, envKey: "GROQ_API_KEY", description: "Dialogue, intention, simplification, synthèse" },
  { key: "gemini", name: "Gemini", capability: "llm", model: "gemini-2.0-flash", role: "secours", priority: 2, envKey: "GEMINI_API_KEY", description: "Secours du dialogue et des synthèses" },
  { key: "openrouter", name: "OpenRouter", capability: "llm", model: "meta-llama/llama-3.3-70b-instruct:free", role: "secours", priority: 3, envKey: "OPENROUTER_API_KEY", description: "Second secours du dialogue" },
  { key: "whisper", name: "Whisper (STT)", capability: "stt", model: "whisper-large-v3-turbo", role: "principal", priority: 1, envKey: "GROQ_API_KEY", description: "Reconnaissance vocale via Groq" },
  { key: "webspeech", name: "Web Speech API", capability: "stt", model: "navigateur", role: "secours", priority: 2, description: "Reconnaissance vocale du navigateur" },
  { key: "edgetts", name: "Edge TTS", capability: "tts", model: "fr-FR-DeniseNeural", role: "principal", priority: 1, description: "Synthèse vocale fr-FR" },
  { key: "browsertts", name: "Synthèse du navigateur", capability: "tts", model: "speechSynthesis", role: "secours", priority: 2, description: "Synthèse vocale de secours" },
  { key: "tesseract", name: "Tesseract.js", capability: "ocr", model: "fra", role: "principal", priority: 1, description: "OCR exécuté sur notre serveur" },
];

// Crée les fournisseurs manquants au démarrage (sans écraser les réglages de l'admin)
export async function ensureProviders() {
  await AiProvider.bulkWrite(
    DEFAULT_PROVIDERS.map((p) => ({
      updateOne: { filter: { key: p.key }, update: { $setOnInsert: p }, upsert: true },
    })),
  );
}
