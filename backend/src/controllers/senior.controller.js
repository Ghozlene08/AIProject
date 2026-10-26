import { Contact, Event, Intake, Medication, User } from "../models/index.js";
import { badRequest, forbidden, notFound, requireFields } from "../utils/httpError.js";
import { trackEvent } from "../services/tracking.js";
// Reconnaissance vocale : route commune de l'équipe POST /api/senior/stt (senior/senior.controller.js)
import { logBrowserStt } from "../services/ai/stt.js";
import { synthesize } from "../services/ai/tts.js";
import { detectType, isMedical, nextOccurrence, parseYesNo, toISODate } from "../services/agenda/frenchParser.js";
import { agendaFor, briefing as buildBriefing, fromISO, speakAgenda, speakDay, speakTime, understand } from "../services/agenda/voiceAgenda.js";
import { createSeries, findSeriesDuplicate, stopSeries } from "../services/agenda/series.js";
import { adviceFor } from "../services/agenda/advice.js";
import { caregiverFirstName, notifyMedical } from "../services/agenda/caregiver.js";
import * as say from "../services/agenda/phrases.js";
import { speakWeather, todayWeather } from "../services/agenda/weather.js";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// La session du senior est ouverte par la reconnaissance faciale (auth.controller → seniorFaceLogin)

export async function me(req, res) {
  const s = req.senior;
  res.json({ senior: { _id: s._id, firstName: s.firstName, lastName: s.lastName } });
}

/* ---------- Proches : aidants, contacts saisis par l'aidant, médecin traitant ---------- */

export async function contacts(req, res) {
  const s = req.senior;
  const [caregivers, saved] = await Promise.all([
    User.find({ _id: { $in: s.caregivers ?? [] }, status: "actif", phone: { $nin: [null, ""] } }).select("name phone"),
    Contact.find({ senior: s._id }).sort({ order: 1, createdAt: 1 }),
  ]);
  const list = [
    ...caregivers.map((u) => ({ id: String(u._id), name: u.name, relation: "Mon aidant", phone: u.phone, isEmergency: false })),
    ...saved.map((c) => ({ id: String(c._id), name: c.name, relation: c.relation ?? "", phone: c.phone, isEmergency: c.isEmergency })),
  ];
  if (s.doctor?.phone) list.push({ id: "medecin", name: s.doctor.name || "Mon médecin", relation: s.doctor.specialty ? `Médecin, ${s.doctor.specialty}` : "Médecin traitant", phone: s.doctor.phone, isEmergency: false });
  // Un même numéro n'apparaît qu'une fois
  const seen = new Set();
  res.json({ contacts: list.filter((c) => !seen.has(c.phone.replace(/\s/g, "")) && seen.add(c.phone.replace(/\s/g, ""))) });
}

/* ---------- Médicaments : traitements actifs et prises du jour ---------- */

export async function medications(req, res) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86400000 - 1);
  const [meds, intakes] = await Promise.all([
    Medication.find({ senior: req.senior._id, active: true }).sort({ name: 1 }),
    Intake.find({ senior: req.senior._id, scheduledAt: { $gte: start, $lte: end } }).sort({ scheduledAt: 1 }),
  ]);
  const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = intakes.map((i) => ({ id: String(i._id), medication: String(i.medication), time: hhmm(i.scheduledAt), at: i.scheduledAt, status: i.status }));
  const items = meds.map((m) => ({
    id: String(m._id),
    name: m.name,
    dosage: m.dosage ?? null,
    posology: m.posology ?? null,
    instructions: m.instructions ?? null,
    times: m.times,
    today: today.filter((t) => t.medication === String(m._id)),
  }));
  // Dans l'ordre de la journée (premier horaire), plus naturel que l'ordre alphabétique
  const first = (m) => [...m.times].sort()[0] ?? "99:99";
  items.sort((a, b) => first(a).localeCompare(first(b)));
  // Prochaine prise : la première non confirmée de la journée (en retard comprise)
  const pending = today.find((t) => t.status !== "confirme" && t.at >= new Date(now.getTime() - 3 * 3600000));
  const med = pending && meds.find((m) => String(m._id) === pending.medication);
  res.json({
    medications: items,
    next: pending ? { id: pending.id, time: pending.time, name: [med?.name, med?.dosage].filter(Boolean).join(" "), late: pending.at < now } : null,
  });
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
  res.json({ intake, speech: say.intakeConfirmed(intake.medication?.name ?? "médicament") });
}

function checkProposal(p) {
  if (!p || typeof p.title !== "string" || !p.title.trim()) throw badRequest("Intitulé manquant");
  if (!DATE_RE.test(p.date ?? "") || !TIME_RE.test(p.time ?? "")) throw badRequest("Date ou heure invalide");
  const at = fromISO(p.date, p.time);
  if (at < new Date(Date.now() - 60000)) throw badRequest("Cette heure est déjà passée");
  return { title: p.title.trim().slice(0, 80), startAt: at, type: ["rdv", "repas", "rappel"].includes(p.type) ? p.type : "rappel" };
}

// Même intitulé (sans tenir compte des majuscules ni des accents) à la même heure : pas de doublon
const sameTitle = (a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }) === 0;
async function findDuplicate(seniorId, { title, startAt }) {
  const events = await Event.find({ senior: seniorId, status: "prevu", startAt });
  return events.find((e) => sameTitle(e.title.trim(), title.trim())) ?? null;
}

// Répétition envoyée par l'interface : { freq: "quotidien" | "hebdomadaire", weekdays?: [0-6] }
function checkRepeat(r) {
  if (!r || typeof r !== "object" || !["quotidien", "hebdomadaire"].includes(r.freq)) return null;
  const weekdays = Array.isArray(r.weekdays) ? [...new Set(r.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : null;
  return { freq: r.freq, weekdays: r.freq === "quotidien" ? [] : weekdays?.length ? weekdays : null };
}

const whenOf = (p, repeat) => say.whenOf(p, repeat ?? null);

/**
 * Enregistre un rappel du senior (écran ou voix) : doublons, répétition, conseils pratiques,
 * et aidant prévenu s'il s'agit de santé. Retourne aussi la phrase dite au senior.
 */
async function addReminder(senior, proposal) {
  const repeat = checkRepeat(proposal.repeat);
  if (repeat && TIME_RE.test(proposal.time ?? "")) proposal = { ...proposal, date: nextOccurrence(repeat, proposal.time) ?? proposal.date };
  const data = checkProposal(proposal);
  const medical = proposal.medical === true || isMedical(data.title);
  // Ajouté à l'écran : « Rendez-vous chez le dentiste » est un rendez-vous, pas un simple rappel
  if (data.type === "rappel" && detectType(data.title) === "rdv") data.type = "rdv";
  const when = whenOf(proposal, repeat);

  // Conseils calculés avant l'enregistrement (le rappel ne se signale pas lui-même comme conflit)
  const advice = await adviceFor(senior._id, { ...data, medical });
  let event;
  let series = null;
  let duplicate = false;
  if (repeat) {
    ({ series, duplicate } = await createSeries(senior, { title: data.title, type: data.type, time: proposal.time, repeat, medical }, data.startAt));
    event = await Event.findOne({ series: series._id, status: "prevu" }).sort({ startAt: 1 });
  } else {
    event = await findDuplicate(senior._id, data);
    duplicate = Boolean(event);
    if (!event) event = await Event.create({ ...data, medical, senior: senior._id, createdBy: "senior" });
  }
  if (duplicate) return { event, duplicate, speech: say.alreadyThere(data.title, when, data.type) };

  // Santé : l'aidant est prévenu, et le senior le sait (transparence)
  let notified = null;
  if (medical) {
    await notifyMedical(senior, { title: data.title, startAt: data.startAt, type: data.type, series });
    if (event) await Event.updateOne({ _id: event._id }, { caregiverNotifiedAt: new Date() });
    notified = await caregiverFirstName(senior);
  }
  const speech = say.saved(data, when, { advice, notified });
  return { event, series, duplicate, advice, notified, speech };
}

// Rappel ajouté à l'écran (bouton « + »)
export async function createEvent(req, res) {
  const out = await addReminder(req.senior, req.body ?? {});
  if (!out.duplicate) trackEvent({ senior: req.senior._id, actor: "senior", module: "agenda", action: "rappel_cree", channel: "ecran" });
  res.status(out.duplicate ? 200 : 201).json({ event: out.event, duplicate: out.duplicate, repeat: Boolean(out.series), notified: out.notified ?? null, speech: out.speech });
}

// Le senior peut annuler uniquement les rappels qu'il a lui-même créés.
// Pour un rappel répété, la répétition entière est arrêtée.
export async function cancelEvent(req, res) {
  const event = await Event.findOne({ _id: req.params.id, senior: req.senior._id }).catch(() => null);
  if (!event) throw notFound("Rappel introuvable");
  if (event.createdBy !== "senior") throw forbidden("Ce rendez-vous a été ajouté par votre proche");
  if (event.series) {
    await stopSeries(event.series, req.senior._id);
    return res.json({ ok: true, stopped: true });
  }
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
          speech: say.intakeReminder(hhmm(new Date()), med, i.medication?.instructions),
        };
      }),
      ...events.map((e) => ({
        kind: "evenement",
        id: String(e._id),
        time: hhmm(e.startAt),
        title: e.type === "rdv" ? "Rendez-vous" : "Petit rappel",
        detail: e.title,
        speech: say.eventReminder(e, hhmm(e.startAt), e.location?.replace(/s+[—–-]s+/g, ", ")),
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

const proposalSpeech = (p) => say.proposal(p);

export async function voiceAgenda(req, res) {
  const started = Date.now();
  requireFields(req.body, ["text"]);
  const text = String(req.body.text).slice(0, 500);
  const context = req.body.context ?? null;
  if (req.body.stt === "webspeech") logBrowserStt(req.senior._id);

  // « Quel temps fait-il ? » : réponse directe (Open-Meteo), sans passer par le LLM
  if (!context && /(quel temps|la meteo|météo|va-t-il pleuvoir|il va pleuvoir|fait-il (beau|froid|chaud)|il fait (beau|froid|chaud)|parapluie)/i.test(text)) {
    const weather = speakWeather(await todayWeather(req.senior.city));
    trackEvent({ senior: req.senior._id, actor: "senior", channel: "voix", module: "assistant", action: "interaction_vocale", intent: "meteo", step: 4, outcome: weather ? "reussi" : "echec", latencyMs: Date.now() - started });
    return res.json({ status: "answer", intent: "meteo", speech: weather || "Je n'arrive pas à connaître la météo pour le moment. Réessayez un peu plus tard." });
  }

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
      return res.json({ status: "answer", intent: r.intent, speech: say.noIntakeDue() });
    }
    intake.status = "confirme";
    intake.confirmedAt = new Date();
    await intake.save();
    track({ module: "agenda", action: "prise_confirmee", intent: "confirmer_prise", step: 4, outcome: "reussi" });
    return res.json({ status: "answer", intent: r.intent, speech: say.intakeConfirmed(intake.medication?.name ?? "médicament"), source: r.source });
  }

  if (r.intent === "creer_rappel") {
    const pending = { title: r.title, date: r.date, type: r.type, repeat: r.repeat, medical: r.medical };
    // Rappel répété : la première occurrence est la prochaine à venir
    if (r.repeat && r.time) r.date = nextOccurrence(r.repeat, r.time) ?? r.date;
    if (!r.time) {
      if (context) {
        // Deuxième tentative sans heure compréhensible : on abandonne poliment
        track({ module: "agenda", action: "rappel_cree", intent: "creer_rappel", step: 2, outcome: "echec", failureReason: "horaire_non_identifie" });
        return res.json({ status: "answer", intent: r.intent, speech: say.timeNotUnderstood() });
      }
      return res.json({ status: "clarification", intent: r.intent, context: pending, speech: say.askTime(), source: r.source });
    }
    if (fromISO(r.date, r.time) < new Date(Date.now() - 60000)) {
      return res.json({ status: "clarification", intent: r.intent, context: pending, speech: say.timePassed(r.time) });
    }
    const proposal = { title: r.title, date: r.date, time: r.time, type: r.type, repeat: r.repeat, medical: r.medical };
    const duplicate = r.repeat
      ? await findSeriesDuplicate(req.senior._id, { title: r.title, time: r.time, freq: r.repeat.freq, weekdays: r.repeat.freq === "quotidien" ? [] : (r.repeat.weekdays ?? [fromISO(r.date).getDay()]) })
      : await findDuplicate(req.senior._id, { title: r.title, startAt: fromISO(r.date, r.time) });
    if (duplicate) {
      return res.json({ status: "answer", intent: r.intent, speech: say.alreadyThere(r.title, whenOf(r, r.repeat), r.type), source: r.source });
    }
    return res.json({ status: "confirmation", intent: r.intent, proposal, speech: proposalSpeech(proposal), source: r.source });
  }

  track({ module: "assistant", action: "interaction_vocale", intent: "question_libre", step: 2, outcome: "echec", failureReason: "intention_non_comprise" });
  res.json({
    status: "answer",
    intent: "autre",
    speech: say.notUnderstood(),
  });
}

// Réponse du senior à « C'est bien cela ? »
export async function voiceConfirm(req, res) {
  const started = Date.now();
  const { proposal } = req.body ?? {};
  const answer = req.body?.confirmed === true ? "oui" : req.body?.confirmed === false ? "non" : parseYesNo(req.body?.answer ?? "");
  const track = (e) => trackEvent({ senior: req.senior._id, actor: "senior", module: "agenda", action: "rappel_cree", channel: "voix", intent: "creer_rappel", latencyMs: Date.now() - started, ...e });

  if (!answer) {
    return res.json({ status: "confirmation", proposal, speech: say.yesNoAgain() });
  }
  if (answer === "non") {
    track({ step: 3, outcome: "abandon" });
    return res.json({ status: "answer", speech: say.cancelled() });
  }
  // « Oui » répété (double envoi, réseau lent) : addReminder ne crée pas deux fois le même rappel
  const out = await addReminder(req.senior, proposal ?? {});
  track({ step: 4, outcome: "reussi" });
  res.status(out.duplicate ? 200 : 201).json({
    status: "answer",
    event: out.event,
    notified: out.notified ?? null,
    speech: out.duplicate ? "C'est bien noté, ne vous inquiétez pas." : out.speech,
  });
}
