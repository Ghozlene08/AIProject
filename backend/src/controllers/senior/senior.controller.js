import { Senior } from "../../models/index.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import { signSeniorToken } from "../../middlewares/seniorAuth.js";
import { transcribe } from "../../services/ai/stt.js";
import { trackEvent } from "../../services/tracking.js";

/* POST /api/senior/session-demo  { pairingCode: "MARIE7" }
 * ⚠️ TEMPORAIRE, uniquement en développement : ouvre une session senior sans PIN,
 * pour travailler sur l'interface Senior en attendant la vraie connexion de l'équipe.
 * À supprimer quand la connexion (code d'appairage + PIN / reconnaissance faciale) sera prête. */
export async function demoSession(req, res) {
  const pairingCode = String(req.body?.pairingCode ?? "MARIE7").trim().toUpperCase();
  const senior = await Senior.findOne({ pairingCode });
  if (!senior) throw notFound(`Aucun senior avec le code ${pairingCode} (lancez le seed si la base est vide)`);
  res.json({ token: signSeniorToken(senior), senior: publicSenior(senior) });
}

/* GET /api/senior/moi : le profil du senior connecté (prénom pour l'accueil) */
export async function me(req, res) {
  res.json({ senior: publicSenior(req.senior) });
}

/* POST /api/senior/stt — corps : l'enregistrement audio brut (Content-Type audio/webm, ogg, mp4…)
 * Transcrit une courte phrase du senior (ex. « écouter », « raconter »). */
export async function speechToText(req, res) {
  if (!Buffer.isBuffer(req.body)) throw badRequest("Envoyez l'enregistrement audio dans le corps de la requête");
  // Consentement : sans accord du senior, sa voix n'est pas envoyée à un service externe
  if (req.senior.consentAI === false) throw badRequest("CONSENTEMENT_REFUSE");

  const module = ["souvenirs", "assistant", "agenda", "documents", "famille"].includes(req.query.module) ? req.query.module : "assistant";
  let result;
  try {
    result = await transcribe(req.body, req.headers["content-type"], {
      seniorId: req.senior._id,
      task: `Reconnaissance vocale (${module})`,
      hint: typeof req.query.hint === "string" ? req.query.hint.slice(0, 200) : undefined,
    });
  } catch (err) {
    // Whisper indisponible : réponse claire pour que le navigateur passe à son secours (Web Speech API)
    if (err.status === 503) return res.status(503).json({ message: "STT_UNAVAILABLE", fallback: "web-speech", reason: err.details?.reason });
    throw err;
  }
  const { text, provider, latencyMs } = result;
  trackEvent({ senior: req.senior._id, actor: "senior", module, action: "interaction_vocale", channel: "voix", step: 1, latencyMs });
  res.json({ text, provider });
}

// Ce que l'interface Senior a le droit de connaître du profil
const publicSenior = (s) => ({ _id: s._id, firstName: s.firstName, lastName: s.lastName, consentAI: s.consentAI });
