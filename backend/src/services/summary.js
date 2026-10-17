import { Alert, Contact, Event, Intake, WeeklySummary } from "../models/index.js";
import { addDays, endOfDay, formatFr, startOfDay } from "../utils/dates.js";
import { generateText } from "./ai/gateway.js";

// Statistiques des 7 derniers jours pour un senior
export async function weeklyStats(seniorId, end = new Date()) {
  const periodEnd = endOfDay(end);
  const periodStart = startOfDay(addDays(end, -6));
  const range = { $gte: periodStart, $lte: periodEnd };

  const [intakes, events, alerts] = await Promise.all([
    Intake.find({ senior: seniorId, scheduledAt: range }).populate("medication", "name"),
    Event.find({ senior: seniorId, startAt: range }),
    Alert.find({ senior: seniorId, createdAt: range, type: { $ne: "synthese" } }),
  ]);

  const done = intakes.filter((i) => i.status !== "a_venir");
  const confirmed = done.filter((i) => i.status === "confirme").length;
  const missed = done.filter((i) => i.status === "manque");
  return {
    periodStart,
    periodEnd,
    intakes,
    events,
    alerts,
    missed,
    stats: {
      intakesTotal: done.length,
      intakesConfirmed: confirmed,
      intakesMissed: missed.length,
      adherence: done.length ? Math.round((confirmed / done.length) * 100) : 100,
      events: events.length,
      alerts: alerts.length,
    },
  };
}

// Génère (via la passerelle IA) la synthèse hebdomadaire destinée à l'aidant
export async function generateWeeklySummary(senior) {
  const data = await weeklyStats(senior._id);
  const { stats } = data;
  const contacts = await Contact.find({ senior: senior._id });

  const missedList = data.missed
    .map((i) => `- ${i.medication?.name ?? "Médicament"} le ${formatFr(i.scheduledAt, { weekday: "long", hour: "2-digit", minute: "2-digit" })}`)
    .join("\n");
  const eventList = data.events.map((e) => `- ${e.title} (${formatFr(e.startAt)})`).join("\n");
  const alertList = data.alerts.map((a) => `- ${a.title}`).join("\n");
  const fullName = `${senior.firstName} ${senior.lastName}`;

  const system =
    "Tu es l'assistant de Senior Assistant. Tu rédiges pour un aidant familial une synthèse " +
    "hebdomadaire bienveillante, factuelle et courte (120 à 180 mots), en français, sans " +
    "diagnostic ni conseil médical. Termine par une ou deux suggestions concrètes.";
  const prompt = `Synthèse de la semaine pour ${fullName}.
Prises de médicaments : ${stats.intakesConfirmed} confirmées sur ${stats.intakesTotal} (observance ${stats.adherence} %).
Prises manquées :
${missedList || "- aucune"}
Rendez-vous et activités :
${eventList || "- aucun"}
Alertes :
${alertList || "- aucune"}`;

  const local = () => {
    const tone =
      stats.adherence >= 90 ? "Très bonne semaine" : stats.adherence >= 70 ? "Semaine globalement correcte" : "Semaine à surveiller";
    const lines = [
      `${tone} pour ${senior.firstName}.`,
      `${stats.intakesConfirmed} prises de médicaments confirmées sur ${stats.intakesTotal}, soit une observance de ${stats.adherence} %.`,
    ];
    if (data.missed.length) {
      const names = [...new Set(data.missed.map((i) => i.medication?.name).filter(Boolean))];
      lines.push(`${data.missed.length} prise(s) manquée(s), principalement : ${names.join(", ")}.`);
    } else lines.push("Aucune prise manquée cette semaine.");
    lines.push(
      data.events.length
        ? `${data.events.length} rendez-vous ou activité(s) au programme, dont « ${data.events[0].title} ».`
        : "Aucun rendez-vous n'était prévu.",
    );
    if (data.alerts.length) lines.push(`${data.alerts.length} alerte(s) ont été émises pendant la période.`);
    lines.push(
      data.missed.length
        ? "Suggestion : un petit appel au moment des prises du soir peut aider à les ancrer dans la routine."
        : "Suggestion : profitez d'un appel cette semaine pour la féliciter de sa régularité.",
    );
    return lines.join("\n");
  };

  const { text, provider } = await generateText({
    task: "Synthèse hebdomadaire",
    system,
    prompt,
    names: [fullName, senior.firstName, senior.lastName, senior.doctor?.name, ...contacts.map((c) => c.name)],
    seniorId: senior._id,
    localFallback: local,
  });

  const summary = await WeeklySummary.create({
    senior: senior._id,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    content: text,
    stats,
    provider,
  });

  await Alert.create({
    senior: senior._id,
    type: "synthese",
    severity: "info",
    title: "Synthèse hebdomadaire disponible",
    message: `Semaine du ${formatFr(data.periodStart, { day: "numeric", month: "short" })} au ${formatFr(data.periodEnd, { day: "numeric", month: "short" })}`,
  });

  return summary;
}
