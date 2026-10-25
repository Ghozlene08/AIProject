import { Event, Intake } from "../models/index.js";
import { badRequest, forbidden, notFound, requireFields } from "../utils/httpError.js";
import { trackEvent } from "../services/tracking.js";
// Reconnaissance vocale : route commune de l'équipe POST /api/senior/stt (senior/senior.controller.js)
import { logBrowserStt } from "../services/ai/stt.js";
import { synthesize } from "../services/ai/tts.js";
import { parseYesNo, toISODate } from "../services/agenda/frenchParser.js";
import { agendaFor, briefing as buildBriefing, fromISO, speakAgenda, speakDay, speakTime, toSecondPerson, understand } from "../services/agenda/voiceAgenda.js";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Formulation orale : minuscule initiale et « mon » → « votre »
const lowerFirst = (s) => toSecondPerson(s.charAt(0).toLowerCase() + s.slice(1));

// La session du senior est ouverte par la reconnaissance faciale (auth.controller → seniorFaceLogin)

export async function me(req, res) {
  const s = req.senior;
  res.json({ senior: { _id: s._id, firstName: s.firstName, lastName: s.lastName } });
}

/* ---------- Agenda ---------- */

const dayFromQuery = (q) => (q && DATE_RE.test(q) ? fromISO(q) : new Date());

export async function agenda(req, res) {
  const day = dayFromQuery(req.query.date);
  const iso = toISODate(day);
  const items = await agendaFor(req.senior._id, day);
  res.json({ date: iso, label: speakDay(iso), items, speech: speakAgenda(items, iso) });
}

export async function confirmIntake(req, res) {
  const intake = await Intake.findOne({ _id: req.params.id, senior: req.senior._id }).populate("medication", "name dosage").catch(() => null);
  if (!intake) throw notFound("Prise introuvable");
  if (intake.scheduledAt > new Date(Date.now() + 2 * 3600000)) throw badRequest("Cette prise est prévue plus tard");
  if (intake.status !== "confirme") {
    intake.status = "confirme";
    intake.confirmedAt = new Date();
    await intake.save();
    const voice = req.body?.channel === "voix";
    trackEvent({ senior: req.senior._id, actor: "senior", module: "agenda", action: "prise_confirmee", channel: voice ? "voix" : "ecran", intent: voice ? "confirmer_prise" : undefined, step: voice ? 4 : undefined });
  }
  res.json({ intake, speech: `C'est noté, bravo ! Votre ${intake.medication?.name ?? "médicament"} est bien enregistré.` });
}

function checkProposal(p) {
  if (!p || typeof p.title !== "string" || !p.title.trim()) throw badRequest("Intitulé manquant");
  if (!DATE_RE.test(p.date ?? "") || !TIME_RE.test(p.time ?? "")) throw badRequest("Date ou heure invalide");
  const at = fromISO(p.date, p.time);
  if (at < new Date(Date.now() - 60000)) throw badRequest("Cette heure est déjà passée");
  return { title: p.title.trim().slice(0, 80), startAt: at, type: ["rdv", "repas", "rappel"].includes(p.type) ? p.type : "rappel" };
}

// Rappel ajouté à l'écran (bouton « + »)
export async function createEvent(req, res) {
  const data = checkProposal(req.body);
  const event = await Event.create({ ...data, senior: req.senior._id, createdBy: "senior" });
  trackEvent({ senior: req.senior._id, actor: "senior", module: "agenda", action: "rappel_cree", channel: "ecran" });
  res.status(201).json({ event });
}

// Le senior peut annuler uniquement les rappels qu'il a lui-même créés
export async function cancelEvent(req, res) {
  const event = await Event.findOne({ _id: req.params.id, senior: req.senior._id }).catch(() => null);
  if (!event) throw notFound("Rappel introuvable");
  if (event.createdBy !== "senior") throw forbidden("Ce rendez-vous a été ajouté par votre proche");
  event.status = "annule";
  await event.save();
  res.json({ ok: true });
}

export async function ackEvent(req, res) {
  const event = await Event.findOneAndUpdate({ _id: req.params.id, senior: req.senior._id }, { acknowledgedAt: new Date() }, { new: true }).catch(() => null);
  if (!event) throw notFound("Rappel introuvable");
  res.json({ ok: true });
}

/* ---------- Rappels proactifs : ce qui doit être signalé maintenant ---------- */

export async function dueReminders(req, res) {
  const now = Date.now();
  const [intakes, events] = await Promise.all([
    Intake.find({ senior: req.senior._id, status: "a_venir", scheduledAt: { $gte: new Date(now - 30 * 60000), $lte: new Date(now + 60000) } }).populate("medication", "name dosage instructions"),
    Event.find({ senior: req.senior._id, status: "prevu", acknowledgedAt: null, startAt: { $gte: new Date(now - 15 * 60000), $lte: new Date(now + 60000) } }),
  ]);
  const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  res.json({
    reminders: [
      ...intakes.map((i) => {
        const med = [i.medication?.name, i.medication?.dosage].filter(Boolean).join(" ");
        return {
          kind: "prise",
          id: String(i._id),
          time: hhmm(i.scheduledAt),
          title: "C'est l'heure de votre médicament",
          detail: med,
          speech: `Il est ${speakTime(hhmm(new Date()))}. C'est l'heure de prendre votre ${med}.${i.medication?.instructions ? ` ${i.medication.instructions}.` : ""} Dites « je l'ai pris » quand c'est fait.`,
        };
      }),
      ...events.map((e) => ({
        kind: "evenement",
        id: String(e._id),
        time: hhmm(e.startAt),
        title: e.type === "rdv" ? "Rendez-vous" : "Petit rappel",
        detail: e.title,
        speech: e.type === "rdv" ? `Rappel : ${lowerFirst(e.title)}${e.location ? `, ${e.location.replace(/s+[—–-]s+/g, ", ")}` : ""}, à ${speakTime(hhmm(e.startAt))}.` : `Vous m'avez demandé de vous rappeler : ${lowerFirst(e.title)}.`,
      })),
    ],
  });
}

export async function briefing(req, res) {
  const out = await buildBriefing(req.senior);
  trackEvent({ senior: req.senior._id, actor: "senior", module: "agenda", action: "interaction_vocale", channel: "ecran", intent: "consulter_agenda" });
  res.json(out);
}

/* ---------- Voix ---------- */

// Voix naturelle (Edge TTS → Gemini TTS) ; 503 → l'interface utilise la voix du navigateur
export async function tts(req, res) {
  requireFields(req.body, ["text"]);
  try {
    const out = await synthesize(req.body.text, req.senior._id);
    res.set({ "Content-Type": out.mime, "X-TTS-Provider": out.provider, "Cache-Control": "no-store" });
    res.send(out.audio);
  } catch (err) {
    res.status(503).json({ message: err.message, fallback: "navigateur" });
  }
}

const isInfinitive = (title) => /^[a-zàâäéèêëîïôöùûüç'-]+(er|ir|re|oir)\b/i.test(title.trim());

function proposalSpeech(p) {
  const when = `${speakDay(p.date)} à ${speakTime(p.time)}`;
  return p.type !== "rdv" && isInfinitive(p.title)
    ? `Je vous rappellerai ${/^[aeéèêiouyh]/i.test(p.title) ? "d'" : "de "}${lowerFirst(p.title)} ${when}. C'est bien cela ?`
    : `Je note : ${lowerFirst(p.title)}, ${when}. C'est bien cela ?`;
}

export async function voiceAgenda(req, res) {
  const started = Date.now();
  requireFields(req.body, ["text"]);
  const text = String(req.body.text).slice(0, 500);
  const context = req.body.context ?? null;
  if (req.body.stt === "webspeech") logBrowserStt(req.senior._id);

  const r = await understand(text, req.senior, context);
  const latency = () => Date.now() - started;
  const track = (e) => trackEvent({ senior: req.senior._id, actor: "senior", channel: "voix", latencyMs: latency(), ...e });

  if (r.intent === "consulter_agenda") {
    const items = await agendaFor(req.senior._id, fromISO(r.date));
    track({ module: "agenda", action: "interaction_vocale", intent: "consulter_agenda", step: 4, outcome: "reussi" });
    return res.json({ status: "answer", intent: r.intent, date: r.date, items, speech: speakAgenda(items, r.date), source: r.source });
  }

  if (r.intent === "confirmer_prise") {
    const now = Date.now();
    const intake = await Intake.findOne({ senior: req.senior._id, status: "a_venir", scheduledAt: { $gte: new Date(now - 3 * 3600000), $lte: new Date(now + 3600000) } })
      .sort({ scheduledAt: 1 })
      .populate("medication", "name dosage");
    if (!intake) {
      track({ module: "agenda", action: "prise_confirmee", intent: "confirmer_prise", step: 2, outcome: "echec", failureReason: "aucune_prise_due" });
      return res.json({ status: "answer", intent: r.intent, speech: "Je ne vois pas de médicament à prendre en ce moment. Votre agenda est à jour." });
    }
    intake.status = "confirme";
    intake.confirmedAt = new Date();
    await intake.save();
    track({ module: "agenda", action: "prise_confirmee", intent: "confirmer_prise", step: 4, outcome: "reussi" });
    return res.json({ status: "answer", intent: r.intent, speech: `C'est noté, bravo ! Votre ${intake.medication?.name ?? "médicament"} est bien enregistré.`, source: r.source });
  }

  if (r.intent === "creer_rappel") {
    const pending = { title: r.title, date: r.date, type: r.type };
    if (!r.time) {
      if (context) {
        // Deuxième tentative sans heure compréhensible : on abandonne poliment
        track({ module: "agenda", action: "rappel_cree", intent: "creer_rappel", step: 2, outcome: "echec", failureReason: "horaire_non_identifie" });
        return res.json({ status: "answer", intent: r.intent, speech: "Je n'ai pas bien compris l'heure. Vous pouvez recommencer, par exemple : « Rappelle-moi d'appeler ma fille demain à 10 heures »." });
      }
      return res.json({ status: "clarification", intent: r.intent, context: pending, speech: "À quelle heure voulez-vous que je vous le rappelle ?", source: r.source });
    }
    if (fromISO(r.date, r.time) < new Date(Date.now() - 60000)) {
      return res.json({ status: "clarification", intent: r.intent, context: pending, speech: `${speakTime(r.time).charAt(0).toUpperCase() + speakTime(r.time).slice(1)}, c'est déjà passé. À quelle heure voulez-vous ce rappel ?` });
    }
    const proposal = { title: r.title, date: r.date, time: r.time, type: r.type };
    return res.json({ status: "confirmation", intent: r.intent, proposal, speech: proposalSpeech(proposal), source: r.source });
  }

  track({ module: "assistant", action: "interaction_vocale", intent: "question_libre", step: 2, outcome: "echec", failureReason: "intention_non_comprise" });
  res.json({
    status: "answer",
    intent: "autre",
    speech: "Je peux vous aider avec votre agenda. Dites par exemple : « Qu'ai-je prévu aujourd'hui ? » ou « Rappelle-moi de prendre mon médicament à 20 heures ».",
  });
}

// Réponse du senior à « C'est bien cela ? »
export async function voiceConfirm(req, res) {
  const started = Date.now();
  const { proposal } = req.body ?? {};
  const answer = req.body?.confirmed === true ? "oui" : req.body?.confirmed === false ? "non" : parseYesNo(req.body?.answer ?? "");
  const track = (e) => trackEvent({ senior: req.senior._id, actor: "senior", module: "agenda", action: "rappel_cree", channel: "voix", intent: "creer_rappel", latencyMs: Date.now() - started, ...e });

  if (!answer) {
    return res.json({ status: "confirmation", proposal, speech: "Excusez-moi, je n'ai pas compris. Dites « oui » pour confirmer, ou « non » pour annuler." });
  }
  if (answer === "non") {
    track({ step: 3, outcome: "abandon" });
    return res.json({ status: "answer", speech: "D'accord, j'annule. Vous pouvez me redemander quand vous voulez." });
  }
  const data = checkProposal(proposal);
  const event = await Event.create({ ...data, senior: req.senior._id, createdBy: "senior" });
  track({ step: 4, outcome: "reussi" });
  const when = `${speakDay(proposal.date)} à ${speakTime(proposal.time)}`;
  res.status(201).json({
    status: "answer",
    event,
    speech: data.type === "rdv" ? `C'est noté dans votre agenda : ${lowerFirst(data.title)}, ${when}.` : `D'accord, je vous le rappellerai ${when}.`,
  });
}
