import { Alert, Event, Intake, ReminderSeries, Senior, User } from "../../models/index.js";
import { addDays, endOfDay, formatFr, startOfDay, timeFr } from "../../utils/dates.js";
import { generateText } from "../ai/gateway.js";
import { raiseAlert } from "../notifier.js";
import { repeatLabel } from "./series.js";
import { agendaFor } from "./voiceAgenda.js";

/*
 * Module F2 — ce que l'aidant reçoit (alerte dans son espace + Telegram s'il l'a activé).
 * Principe : peu de messages, mais utiles.
 *  - immédiatement : seulement les rendez-vous / rappels liés à la santé ajoutés par le senior ;
 *  - chaque soir : un résumé de la journée ;
 *  - au plus une fois par semaine et par prise : les oublis répétés, avec une piste.
 */

const SUMMARY_HOUR = Number(process.env.AGENDA_SUMMARY_HOUR ?? 19);
const PATTERN_DAYS = 14;
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const hFr = (t) => t.replace(":", "h");

/** Prénom du premier aidant actif (pour prévenir le senior : « Je préviens aussi Sophie ») */
export async function caregiverFirstName(senior) {
  const u = await User.findOne({ _id: { $in: senior.caregivers ?? [] }, status: "actif" }).select("name");
  return u?.name?.split(" ")[0] ?? null;
}

/* ---------- 1. Rendez-vous médical ajouté par le senior ---------- */

export async function notifyMedical(senior, { title, startAt, type, series }) {
  const when = `${formatFr(startAt)} à ${hFr(timeFr(startAt))}`;
  const repeat = series ? `, ${repeatLabel(series)}` : "";
  await raiseAlert(senior, {
    type: "rdv",
    severity: "moyenne",
    title: type === "rdv" ? `${senior.firstName} a noté un rendez-vous médical` : `${senior.firstName} a ajouté un rappel lié à sa santé`,
    message: `${title} — ${when}${repeat}.${type === "rdv" ? " Faut-il l'accompagner ?" : ""}`,
  });
}

/* ---------- 2. Oublis répétés (règles pour les chiffres, LLM pour la rédaction) ---------- */

export async function omissionPatterns(seniorId, now = new Date()) {
  const since = addDays(startOfDay(now), -PATTERN_DAYS);
  const [intakes, events] = await Promise.all([
    Intake.find({ senior: seniorId, scheduledAt: { $gte: since, $lte: new Date(now.getTime() - 3600000) } }).populate("medication", "name dosage"),
    Event.find({ senior: seniorId, status: { $ne: "annule" }, startAt: { $gte: addDays(since, -1), $lte: now } }).select("startAt"),
  ]);
  const groups = new Map();
  for (const i of intakes) {
    if (!i.medication) continue;
    const key = `${i.medication._id}|${hhmm(i.scheduledAt)}`;
    if (!groups.has(key)) groups.set(key, { name: [i.medication.name, i.medication.dosage].filter(Boolean).join(" "), time: hhmm(i.scheduledAt), list: [] });
    groups.get(key).list.push(i);
  }
  const patterns = [];
  for (const g of groups.values()) {
    const missedList = g.list.filter((i) => i.status === "manque");
    const missed = missedList.length;
    const total = g.list.length;
    if (missed < 3 || missed / total < 0.3) continue;
    const byDay = new Map();
    for (const i of missedList) byDay.set(i.scheduledAt.getDay(), (byDay.get(i.scheduledAt.getDay()) ?? 0) + 1);
    const [topDay, topCount] = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    // Oubli après une activité ou un rendez-vous dans les 4 heures précédentes
    const busy = missedList.filter((i) => events.some((e) => e.startAt <= i.scheduledAt && e.startAt >= new Date(i.scheduledAt.getTime() - 4 * 3600000))).length;
    patterns.push({ name: g.name, time: g.time, total, missed, weekday: topCount >= 2 && topCount * 2 >= missed ? { day: WEEKDAYS[topDay], count: topCount } : null, busy: busy >= 2 ? busy : 0 });
  }
  return patterns.sort((a, b) => b.missed / b.total - a.missed / a.total);
}

const numbersIn = (t) => (String(t).match(/\d+/g) ?? []).map(Number);

export async function patternText(senior, p) {
  const facts = [
    `${senior.firstName} n'a pas confirmé ${p.missed} prises sur ${p.total} de ${p.name} prévues à ${hFr(p.time)} ces ${PATTERN_DAYS} derniers jours.`,
    p.weekday ? `${p.weekday.count} de ces oublis tombaient un ${p.weekday.day}.` : "",
    p.busy ? `${p.busy} de ces oublis suivaient une activité ou un rendez-vous dans les heures précédentes.` : "",
    "Piste : un appel ou un rappel supplémentaire à ce moment-là, ou un horaire mieux adapté, à valider avec son médecin.",
  ]
    .filter(Boolean)
    .join(" ");
  try {
    const res = await generateText({
      task: "Oublis répétés (aidant)",
      system:
        "Tu écris à un aidant familial, avec bienveillance et sans culpabiliser. Reformule ces constats en 2 ou 3 phrases simples. Reprends tous les chiffres et l'heure exactement, n'ajoute aucun chiffre, aucune cause ni aucun conseil médical en dehors de la piste fournie. Texte brut.",
      prompt: facts,
      names: [`${senior.firstName} ${senior.lastName}`, senior.firstName, senior.lastName],
      seniorId: senior._id,
      maxTokens: 250,
      localFallback: () => facts,
    });
    const allowed = new Set(numbersIn(facts));
    const said = numbersIn(res.text);
    const ok =
      res.provider !== "Générateur local" &&
      res.text.length <= 600 &&
      said.every((n) => allowed.has(n)) &&
      said.includes(p.missed) &&
      said.includes(p.total);
    return ok ? res.text : facts;
  } catch {
    return facts;
  }
}

/* ---------- 3. Résumé du soir ---------- */

export async function eveningSummary(senior, now = new Date()) {
  const from = startOfDay(now);
  const to = endOfDay(now);
  const [added, series, intakes, tomorrow] = await Promise.all([
    Event.find({ senior: senior._id, createdBy: "senior", series: null, status: { $ne: "annule" }, createdAt: { $gte: from, $lte: to } }).sort({ startAt: 1 }),
    ReminderSeries.find({ senior: senior._id, createdBy: "senior", active: true, createdAt: { $gte: from, $lte: to } }),
    Intake.find({ senior: senior._id, scheduledAt: { $gte: from, $lte: to } }).populate("medication", "name dosage").sort({ scheduledAt: 1 }),
    agendaFor(senior._id, addDays(now, 1)),
  ]);
  const lines = [];
  if (intakes.length) {
    const ok = intakes.filter((i) => i.status === "confirme").length;
    const missed = intakes.filter((i) => i.status === "manque");
    lines.push(
      `Médicaments : ${ok} prise${ok > 1 ? "s" : ""} confirmée${ok > 1 ? "s" : ""} sur ${intakes.length}` +
        (missed.length ? ` (non confirmée${missed.length > 1 ? "s" : ""} : ${missed.map((i) => `${i.medication?.name ?? "médicament"} de ${hFr(hhmm(i.scheduledAt))}`).join(", ")}).` : "."),
    );
  }
  const notes = [
    ...added.map((e) => `${e.title} (${formatFr(e.startAt, { weekday: "long", day: "numeric", month: "long" })} à ${hFr(hhmm(e.startAt))})`),
    ...series.map((s) => `${s.title} (${repeatLabel(s)} à ${hFr(s.time)})`),
  ];
  if (notes.length) lines.push(`Ajouté par ${senior.firstName} : ${notes.join(" ; ")}.`);
  const next = tomorrow.filter((i) => i.kind === "evenement");
  const meds = tomorrow.filter((i) => i.kind === "prise").length;
  if (next.length || meds) {
    lines.push(`Demain : ${[meds ? `${meds} prise${meds > 1 ? "s" : ""} de médicament` : "", ...next.map((e) => `${e.title} à ${hFr(e.time)}`)].filter(Boolean).join(", ")}.`);
  }
  return lines.length ? lines.join("\n") : null;
}

/* ---------- Planification (appelée à chaque tour du planificateur) ---------- */

let lastRunDay = null;

export async function runEveningTasks(now = new Date()) {
  const day = startOfDay(now).getTime();
  if (now.getHours() < SUMMARY_HOUR || lastRunDay === day) return;
  lastRunDay = day;
  const seniors = await Senior.find({ "caregivers.0": { $exists: true } });
  for (const senior of seniors) {
    try {
      // Au redémarrage du serveur : pas de second résumé le même jour
      const already = await Alert.exists({ senior: senior._id, title: "Résumé de la journée", createdAt: { $gte: startOfDay(now) } });
      if (!already) {
        const message = await eveningSummary(senior, now);
        if (message) await raiseAlert(senior, { type: "info", severity: "info", title: "Résumé de la journée", message });
      }
      // Oublis répétés : au plus 2 par senior, et une seule fois par semaine pour une même prise
      for (const p of (await omissionPatterns(senior._id, now)).slice(0, 2)) {
        const title = `Oublis répétés : ${p.name} de ${hFr(p.time)}`;
        if (await Alert.exists({ senior: senior._id, title, createdAt: { $gte: addDays(now, -7) } })) continue;
        await raiseAlert(senior, { type: "info", severity: "moyenne", title, message: await patternText(senior, p) });
      }
    } catch (err) {
      console.error("❌ Résumé du soir :", err.message);
    }
  }
}
