import { Router, raw } from "express";
import { requireSeniorAuth } from "../middlewares/auth.js";
import { AiProvider, AiCall, User } from "../models/index.js";
import AssistantMemory from "../models/AssistantMemory.js";
import AssistantConversation from "../models/AssistantConversation.js";
import { badRequest, forbidden, HttpError } from "../utils/httpError.js";
import { generateText } from "../services/ai/gateway.js";
import { hasApiKey } from "../services/ai/providers.js";
import { validateOutput } from "../services/ai/validator.js";
import { trackEvent } from "../services/tracking.js";
import { DIALOGUE_SYSTEM, EXTRACTION_SYSTEM, HISTORY_LIMIT, buildPrompt, explicitNames, validateFacts } from "../services/assistant/dialogue.js";
import { AUDIO_TYPES, MAX_AUDIO_BYTES, transcribeAudio, synthesizeSpeech } from "../services/assistant/speech.js";
import { understandRequest, navigationReply } from "../services/assistant/actions.js";
import { getWeather } from "../services/assistant/weather.js";
import Medication from "../models/Medication.js";
import Event from "../models/Event.js";

const router = Router();
router.use(requireSeniorAuth);
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const activeChats = new Set();

router.get("/session", async (req, res) => {
  const providers = await AiProvider.find({ enabled: true }).lean();
  const caregivers = await User.find({ _id: { $in: req.senior.caregivers || [] }, status: "actif" }).select("name phone").lean();
  const validPhone = (value) => typeof value === "string" && /^[+\d][\d\s().-]{4,30}$/.test(value);
  const contacts = caregivers.filter((c) => validPhone(c.phone)).map((c) => ({ name: c.name, phone: c.phone, relation: "Aidant" }));
  if (validPhone(req.senior.doctor?.phone)) contacts.push({ name: req.senior.doctor.name || "Mon médecin", phone: req.senior.doctor.phone, relation: "Médecin" });
  res.json({ senior: { _id: req.senior._id, firstName: req.senior.firstName, lastName: req.senior.lastName, photoUrl: req.senior.photoUrl },
    contacts,
    consentAI: req.senior.consentAI,
    llm: providers.some((p) => p.capability === "llm" && hasApiKey(p)),
    whisper: Boolean(process.env.GROQ_API_KEY?.trim()) && providers.some((p) => p.key === "whisper"),
    webspeech: providers.some((p) => p.key === "webspeech"),
    edgetts: providers.some((p) => p.key === "edgetts"),
    browsertts: providers.some((p) => p.key === "browsertts"),
  });
});
router.get("/conversation", async (req, res) => {
  const conversation = await AssistantConversation.findOne({ senior: req.senior._id, expiresAt: { $gt: new Date() } }).lean();
  res.json({ turns: (conversation?.turns || []).map(({ role, content, sourceUrl, weatherDate }) => ({ role, content, ...(sourceUrl ? { sourceUrl, weatherDate } : {}) })) });
});
router.get("/medications", async (req, res) => {
  const medications = await Medication.find({ senior: req.senior._id, active: true }).select("name dosage posology times instructions").sort({ name: 1 }).limit(100).lean();
  res.json({ medications });
});
router.get("/agenda", async (req, res) => {
  const events = await Event.find({ senior: req.senior._id, status: "prevu", startAt: { $gte: new Date() } }).select("title type startAt location notes").sort({ startAt: 1 }).limit(50).lean();
  res.json({ events });
});
router.get("/memory", async (req, res) => {
  res.json({ facts: await AssistantMemory.find({ senior: req.senior._id }).select("key value").lean() });
});
router.delete("/memory", async (req, res) => {
  if (activeChats.has(String(req.senior._id))) throw new HttpError(409, "Attendez la fin de la réponse avant d'effacer la mémoire.");
  await AssistantMemory.deleteMany({ senior: req.senior._id });
  await AssistantConversation.deleteOne({ senior: req.senior._id });
  res.status(204).end();
});

function consent(req) {
  if (!req.senior.consentAI) throw forbidden("Les services IA sont désactivés dans votre profil. Votre aidant peut vérifier votre consentement.");
}
function speechLog(req, capability, provider, model, started, status, fallback = false) {
  return AiCall.create({ task: "assistant-vocal", senior: req.senior._id, capability, provider, model, status, latencyMs: Date.now() - started, fallback, ...(status === "erreur" ? { error: "Service vocal indisponible" } : {}) });
}

router.post("/stt", raw({ type: Object.keys(AUDIO_TYPES), limit: MAX_AUDIO_BYTES }), async (req, res) => {
  consent(req);
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest("Audio manquant ou format non pris en charge");
  const started = Date.now();
  const provider = await AiProvider.findOne({ key: "whisper", enabled: true });
  try {
    if (!provider || provider.simulateFailure) throw new Error("Indisponible");
    const text = await transcribeAudio(req.body, req.headers["content-type"], { model: provider.model || "whisper-large-v3-turbo" });
    await speechLog(req, "stt", "Whisper Groq", provider.model, started, "succes");
    res.json({ text, provider: "Whisper Groq" });
  } catch {
    await speechLog(req, "stt", "Whisper Groq", "whisper-large-v3-turbo", started, "erreur");
    res.status(503).json({ message: "La transcription est indisponible. Répétez votre demande avec la reconnaissance de secours.", fallback: "webspeech" });
  }
});

router.post("/tts", async (req, res) => {
  consent(req);
  const text = req.body?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 4000) throw badRequest("Texte vocal invalide");
  const provider = await AiProvider.findOne({ key: "edgetts", enabled: true });
  const started = Date.now();
  try {
    if (!provider || provider.simulateFailure) throw new Error("Indisponible");
    const audio = await synthesizeSpeech(validateOutput(text), { voice: provider.model || "fr-FR-DeniseNeural" });
    await speechLog(req, "tts", "Edge TTS", provider.model, started, "succes");
    res.type("audio/mpeg").send(audio);
  } catch {
    await speechLog(req, "tts", "Edge TTS", "fr-FR-DeniseNeural", started, "erreur");
    res.status(503).json({ message: "Synthèse principale indisponible", fallback: "browsertts" });
  }
});
router.post("/speech-event", async (req, res) => {
  consent(req);
  const { capability, status } = req.body || {};
  if (!["stt", "tts"].includes(capability) || !["succes", "erreur"].includes(status)) throw badRequest("Événement vocal invalide");
  await speechLog(req, capability, capability === "stt" ? "Web Speech API" : "Synthèse du navigateur", "navigateur", Date.now(), status, true);
  res.status(204).end();
});

router.post("/chat", async (req, res) => {
  consent(req);
  const { message, remember = false, channel = "ecran" } = req.body || {};
  if (typeof message !== "string" || !message.trim() || message.length > 2000 || typeof remember !== "boolean" || !["voix", "ecran"].includes(channel)) throw badRequest("Message invalide (1 à 2000 caractères)");
  const senior = req.senior;
  const id = String(senior._id);
  if (activeChats.has(id)) throw new HttpError(409, "Une réponse est déjà en préparation.");
  activeChats.add(id);
  const started = Date.now();
  try {
    const [facts, conversation] = await Promise.all([
      AssistantMemory.find({ senior: senior._id }).lean(),
      AssistantConversation.findOne({ senior: senior._id, expiresAt: { $gt: new Date() } }).lean(),
    ]);
    const contextFacts = [...facts];
    if (senior.doctor?.name && !facts.some((f) => f.key === "doctor")) contextFacts.push({ key: "doctor", value: senior.doctor.name });
    const names = [senior.firstName, senior.lastName, ...contextFacts.map((f) => f.value), ...explicitNames(message)];
    const common = { seniorId: senior._id, names, storePromptPreview: false, redactErrors: true };
    const understood = await understandRequest(message, conversation?.turns || [], common);
    const { intent } = understood;
    let result;
    if (intent.type === "navigate") {
      result = { text: navigationReply(intent.target), action: { type: "navigate", target: intent.target }, provider: understood.provider, fallback: understood.fallback };
    } else if (intent.type === "weather") {
      const city = intent.city || senior.city?.trim();
      if (intent.day === "unsupported") result = { text: "Je peux consulter la météo d’aujourd’hui ou de demain. Quel jour souhaitez-vous consulter ?", provider: "Open-Meteo", fallback: false };
      else if (!city) result = { text: "Dans quelle ville souhaitez-vous connaître la météo ?", provider: "Open-Meteo", fallback: false };
      else {
        try { result = { ...await getWeather(city, intent.day), provider: "Open-Meteo", fallback: false }; }
        catch { result = { text: "Je n’arrive pas à consulter la météo pour le moment. Veuillez réessayer dans quelques instants.", provider: "Open-Meteo", fallback: true }; }
      }
    }
    let extracted = [];
    if (!result && remember && !/\?\s*$/.test(message) && /retiens|mémorise|souviens|\bje\b|\bmon\b|\bma\b/iu.test(message)) {
      const result = await generateText({
        ...common, task: "assistant-extraction", system: EXTRACTION_SYSTEM, prompt: message,
        models: { groq: [process.env.GROQ_FACT_MODEL || "llama-3.1-8b-instant", process.env.ASSISTANT_GROQ_MODEL || "openai/gpt-oss-120b"] },
        validate: (raw) => validateFacts(raw, message), maxTokens: 250, localFallback: () => "[]",
      });
      extracted = JSON.parse(result.text);
    }
    const memory = [...contextFacts.filter((f) => !extracted.some((e) => e.key === f.key)), ...extracted];
    result ??= await generateText({
      ...common, names: [...names, ...extracted.map((f) => f.value)], task: "assistant-vocal",
      system: `${DIALOGUE_SYSTEM}\nFaits à enregistrer après succès de cette réponse : ${JSON.stringify(extracted)}.`,
      prompt: buildPrompt(message.trim(), memory, conversation?.turns || [], remember), maxTokens: 350,
      ...(process.env.ASSISTANT_GROQ_MODEL ? { models: { groq: process.env.ASSISTANT_GROQ_MODEL } } : {}),
      localFallback: () => { const error = new HttpError(503, "Le dialogue IA est indisponible. Réessayez dans quelques instants."); error.expose = true; throw error; },
    });
    for (const fact of extracted) await AssistantMemory.findOneAndUpdate({ senior: senior._id, key: fact.key }, { $set: { value: fact.value } }, { upsert: true, runValidators: true });
    const turns = [...(conversation?.turns || []), { role: "user", content: message.trim() }, { role: "assistant", content: result.text, ...(result.sourceUrl ? { sourceUrl: result.sourceUrl, weatherDate: result.weatherDate } : {}) }].slice(-HISTORY_LIMIT);
    await AssistantConversation.findOneAndUpdate({ senior: senior._id }, { $set: { turns, expiresAt: new Date(Date.now() + 24 * 3600000) } }, { upsert: true, runValidators: true });
    trackEvent({ senior: senior._id, actor: "senior", module: "assistant", action: "interaction_vocale", channel, outcome: "reussi", step: 4, latencyMs: Date.now() - started });
    res.json({ ...result, saved: extracted.length > 0 });
  } catch (error) {
    trackEvent({ senior: senior._id, actor: "senior", module: "assistant", action: "interaction_vocale", channel, outcome: "echec", failureReason: "assistant_indisponible", latencyMs: Date.now() - started });
    throw error;
  } finally { activeChats.delete(id); }
});

export default router;
