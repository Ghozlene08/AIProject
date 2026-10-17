import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Alert, Contact, Event, Intake, Medication, Senior, WeeklySummary } from "../models/index.js";
import { addDays, endOfDay, startOfDay } from "../utils/dates.js";
import { badRequest, notFound, pick, requireFields } from "../utils/httpError.js";
import { ensureIntakesForMedication, removeFutureIntakes } from "../services/scheduler.js";
import { generateWeeklySummary, weeklyStats } from "../services/summary.js";

const SENIOR_FIELDS = ["firstName", "lastName", "birthDate", "phone", "address", "city", "doctor", "medicalNotes", "consentAI"];
const CONTACT_FIELDS = ["name", "relation", "phone", "isEmergency", "order"];
const MED_FIELDS = ["name", "dosage", "posology", "times", "instructions", "active"];
const EVENT_FIELDS = ["title", "type", "startAt", "location", "notes", "status"];

// Code d'appairage lisible (sans 0/O/1/I) + PIN à 4 chiffres
const newPairingCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
};
const newPin = () => String(crypto.randomInt(0, 10000)).padStart(4, "0");

async function findOwned(Model, id, senior) {
  const doc = await Model.findOne({ _id: id, senior: senior._id }).catch(() => null);
  if (!doc) throw notFound();
  return doc;
}

const range = (from, to) => ({
  $gte: from ? new Date(from) : startOfDay(),
  $lte: to ? new Date(to) : endOfDay(),
});

/* ---------- Profils seniors ---------- */

export async function listSeniors(req, res) {
  const seniors = await Senior.find({ caregivers: req.user._id }).sort({ createdAt: 1 });
  res.json({ seniors });
}

export async function createSenior(req, res) {
  requireFields(req.body, ["firstName", "lastName"]);
  const pin = newPin();
  const senior = await Senior.create({
    ...pick(req.body, SENIOR_FIELDS),
    caregivers: [req.user._id],
    pairingCode: newPairingCode(),
    pinHash: await bcrypt.hash(pin, 10),
  });
  // Le PIN n'est montré qu'une fois, à l'aidant
  res.status(201).json({ senior, pin });
}

export async function getSenior(req, res) {
  const contacts = await Contact.find({ senior: req.senior._id }).sort({ order: 1, createdAt: 1 });
  res.json({ senior: req.senior, contacts });
}

export async function updateSenior(req, res) {
  Object.assign(req.senior, pick(req.body, SENIOR_FIELDS));
  await req.senior.save();
  res.json({ senior: req.senior });
}

export async function regeneratePairing(req, res) {
  const pin = newPin();
  req.senior.pairingCode = newPairingCode();
  req.senior.pinHash = await bcrypt.hash(pin, 10);
  req.senior.pairedAt = undefined;
  await req.senior.save();
  res.json({ senior: req.senior, pin });
}

/* ---------- Tableau de bord ---------- */

export async function dashboard(req, res) {
  const id = req.senior._id;
  const now = new Date();
  const [todayIntakes, nextEvents, alerts, unread, lastSummary] = await Promise.all([
    Intake.find({ senior: id, scheduledAt: range() }).populate("medication", "name dosage").sort({ scheduledAt: 1 }),
    Event.find({ senior: id, startAt: { $gte: now }, status: { $ne: "annule" } }).sort({ startAt: 1 }).limit(4),
    Alert.find({ senior: id }).sort({ createdAt: -1 }).limit(5),
    Alert.countDocuments({ senior: id, read: false }),
    WeeklySummary.findOne({ senior: id }).sort({ createdAt: -1 }),
  ]);
  const todayEvents = await Event.countDocuments({ senior: id, startAt: range(), status: { $ne: "annule" } });

  // Activités à venir : prises et rendez-vous mélangés, par ordre chronologique
  const upcoming = [
    ...todayIntakes
      .filter((i) => i.status === "a_venir")
      .map((i) => ({ kind: "prise", at: i.scheduledAt, title: "Prise de médicament", detail: `${i.medication?.name ?? ""} ${i.medication?.dosage ?? ""}`.trim() })),
    ...nextEvents.map((e) => ({ kind: e.type, at: e.startAt, title: e.title, detail: e.location })),
  ]
    .sort((a, b) => a.at - b.at)
    .slice(0, 4);

  res.json({
    senior: req.senior,
    online: Boolean(req.senior.lastSeenAt && now - req.senior.lastSeenAt < 15 * 60000),
    intakes: {
      list: todayIntakes,
      confirmed: todayIntakes.filter((i) => i.status === "confirme").length,
      total: todayIntakes.length,
    },
    todayEvents,
    nextEvent: nextEvents[0] ?? null,
    upcoming,
    alerts,
    unreadAlerts: unread,
    lastSummary,
  });
}

/* ---------- Contacts ---------- */

export async function createContact(req, res) {
  requireFields(req.body, ["name", "phone"]);
  const contact = await Contact.create({ ...pick(req.body, CONTACT_FIELDS), senior: req.senior._id });
  res.status(201).json({ contact });
}

export async function updateContact(req, res) {
  const contact = await findOwned(Contact, req.params.id, req.senior);
  Object.assign(contact, pick(req.body, CONTACT_FIELDS));
  await contact.save();
  res.json({ contact });
}

export async function deleteContact(req, res) {
  const contact = await findOwned(Contact, req.params.id, req.senior);
  await contact.deleteOne();
  res.status(204).end();
}

/* ---------- Traitements ---------- */

export async function listMedications(req, res) {
  const medications = await Medication.find({ senior: req.senior._id }).sort({ active: -1, createdAt: 1 });
  const stats = await weeklyStats(req.senior._id);
  res.json({ medications, stats: stats.stats });
}

export async function createMedication(req, res) {
  requireFields(req.body, ["name", "times"]);
  const med = await Medication.create({ ...pick(req.body, MED_FIELDS), senior: req.senior._id });
  await ensureIntakesForMedication(med);
  res.status(201).json({ medication: med });
}

export async function updateMedication(req, res) {
  const med = await findOwned(Medication, req.params.id, req.senior);
  Object.assign(med, pick(req.body, MED_FIELDS));
  await med.save();
  // Les horaires ou l'état ont pu changer : on régénère les prises à venir
  await removeFutureIntakes(med._id);
  await ensureIntakesForMedication(med);
  res.json({ medication: med });
}

export async function deleteMedication(req, res) {
  const med = await findOwned(Medication, req.params.id, req.senior);
  await removeFutureIntakes(med._id);
  await med.deleteOne();
  res.status(204).end();
}

/* ---------- Prises ---------- */

export async function listIntakes(req, res) {
  const intakes = await Intake.find({ senior: req.senior._id, scheduledAt: range(req.query.from, req.query.to) })
    .populate("medication", "name dosage")
    .sort({ scheduledAt: 1 });
  res.json({ intakes });
}

export async function updateIntake(req, res) {
  const intake = await findOwned(Intake, req.params.id, req.senior);
  const { status } = req.body;
  if (!["a_venir", "confirme", "manque"].includes(status)) throw badRequest("Statut invalide");
  intake.status = status;
  intake.confirmedAt = status === "confirme" ? new Date() : undefined;
  await intake.save();
  res.json({ intake });
}

// Observance jour par jour sur N jours (graphique « 7 derniers jours »)
export async function adherence(req, res) {
  const days = Math.min(Number(req.query.days) || 7, 31);
  const from = startOfDay(addDays(new Date(), -(days - 1)));
  const intakes = await Intake.find({ senior: req.senior._id, scheduledAt: { $gte: from, $lte: endOfDay() } });

  const series = Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i);
    const list = intakes.filter((x) => x.scheduledAt >= day && x.scheduledAt <= endOfDay(day));
    const confirmed = list.filter((x) => x.status === "confirme").length;
    const missed = list.filter((x) => x.status === "manque").length;
    const done = confirmed + missed;
    return { date: day, total: list.length, confirmed, missed, rate: done ? Math.round((confirmed / done) * 100) : null };
  });
  const confirmed = series.reduce((s, d) => s + d.confirmed, 0);
  const done = series.reduce((s, d) => s + d.confirmed + d.missed, 0);
  res.json({ series, rate: done ? Math.round((confirmed / done) * 100) : null });
}

/* ---------- Agenda ---------- */

export async function listEvents(req, res) {
  const events = await Event.find({ senior: req.senior._id, startAt: range(req.query.from, req.query.to) }).sort({ startAt: 1 });
  res.json({ events });
}

export async function createEvent(req, res) {
  requireFields(req.body, ["title", "startAt"]);
  const event = await Event.create({ ...pick(req.body, EVENT_FIELDS), senior: req.senior._id, createdBy: "aidant" });
  res.status(201).json({ event });
}

export async function updateEvent(req, res) {
  const event = await findOwned(Event, req.params.id, req.senior);
  Object.assign(event, pick(req.body, EVENT_FIELDS));
  await event.save();
  res.json({ event });
}

export async function deleteEvent(req, res) {
  const event = await findOwned(Event, req.params.id, req.senior);
  await event.deleteOne();
  res.status(204).end();
}

/* ---------- Alertes ---------- */

export async function listAlerts(req, res) {
  const filter = { senior: req.senior._id };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.unread === "true") filter.read = false;
  const alerts = await Alert.find(filter).sort({ createdAt: -1 }).limit(100);
  res.json({ alerts });
}

export async function markAlert(req, res) {
  const alert = await findOwned(Alert, req.params.id, req.senior);
  alert.read = req.body.read ?? true;
  await alert.save();
  res.json({ alert });
}

export async function markAllAlerts(req, res) {
  await Alert.updateMany({ senior: req.senior._id, read: false }, { read: true });
  res.json({ ok: true });
}

/* ---------- Synthèses ---------- */

export async function listSummaries(req, res) {
  const summaries = await WeeklySummary.find({ senior: req.senior._id }).sort({ createdAt: -1 }).limit(12);
  res.json({ summaries });
}

export async function createSummary(req, res) {
  const summary = await generateWeeklySummary(req.senior);
  res.status(201).json({ summary });
}
