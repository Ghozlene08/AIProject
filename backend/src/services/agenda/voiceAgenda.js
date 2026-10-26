import { Contact, Event, Intake } from "../../models/index.js";
import { generateText } from "../ai/gateway.js";
import { isMedical, normalize, parseDate, parseRecurrence, parseTime, preparationAdvice, ruleParse, toISODate } from "./frenchParser.js";
import { repeatLabel } from "./series.js";
import { speakWeather, todayWeather } from "./weather.js";

/*
 * Module F2 — Agenda et rappels proactifs.
 * Compréhension : LLM gratuit (passerelle IA, données anonymisées) → JSON validé,
 * fusionné avec l'analyse par règles (qui fait foi pour les heures et les dates dites explicitement).
 * Réponses : construites à partir des données réelles de l'agenda (pas d'invention possible).
 */

const INTENTS = ["consulter_agenda", "creer_rappel", "confirmer_prise", "autre"];
const TYPES = ["rappel", "rdv", "repas"];
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
export const fromISO = (iso, hhmm = "00:00") => {
  const [y, m, d] = iso.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi);
};

/* ---------- Formulations orales ---------- */

export function speakTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === 12 && m === 0) return "midi";
  if (h === 0 && m === 0) return "minuit";
  const hours = `${h} heure${h > 1 ? "s" : ""}`;
  if (m === 0) return hours;
  if (m === 30) return `${hours} et demie`;
  if (m === 15) return `${hours} et quart`;
  return `${hours} ${m}`;
}

export function speakDay(iso, now = new Date()) {
  const d = fromISO(iso);
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "demain";
  if (diff === 2) return "après-demain";
  if (diff === -1) return "hier";
  // Dans la semaine : « jeudi » suffit (c'est ainsi qu'on parle) ; au-delà, la date complète
  if (diff > 2 && diff < 7) return WEEKDAYS[d.getDay()];
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString("fr-FR", { month: "long" })}`;
}

const hhmmOf = (date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Le senior dit « mon médicament » ; l'assistant répond « votre médicament »
export function toSecondPerson(text) {
  return String(text ?? "")
    .replace(/\bmon\b/gi, "votre")
    .replace(/\bma\b/gi, "votre")
    .replace(/\bmes\b/gi, "vos")
    .replace(/\bmoi\b/gi, "vous");
}

export const isInfinitive = (title) => /^[a-zàâäéèêëîïôöùûüç'-]+(er|ir|re|oir)\b/i.test(String(title ?? "").trim());

/**
 * Un rendez-vous dit comme une personne le dirait :
 * « Aller chez le cardiologue » → « votre rendez-vous chez le cardiologue »,
 * « Rendez-vous dentiste » → « votre rendez-vous dentiste », sinon l'intitulé tel quel.
 */
export function rdvPhrase(title) {
  const t = toSecondPerson(lowerFirst(String(title ?? ""))).trim();
  const go = t.match(/^(?:aller|se rendre|passer)\s+((?:chez|à|au|aux)\s.+)$/i);
  if (go) return `votre rendez-vous ${go[1]}`;
  const rdv = t.match(/^(?:un |le |mon |votre )?(?:rendez-vous|rdv)\b\s*(.*)$/i);
  if (rdv) return `votre rendez-vous${rdv[1] ? ` ${rdv[1]}` : ""}`;
  return t;
}

// Lieu lisible à voix haute (les tirets longs sont mal prononcés)
const speakPlace = (s) => lowerFirst(String(s).replace(/\s+[—–-]\s+/g, ", "));

/* ---------- Agenda d'une journée (prises + événements) ---------- */

export async function agendaFor(seniorId, day) {
  const range = { $gte: startOfDay(day), $lte: endOfDay(day) };
  const [intakes, events] = await Promise.all([
    Intake.find({ senior: seniorId, scheduledAt: range }).populate("medication", "name dosage posology instructions").sort({ scheduledAt: 1 }),
    Event.find({ senior: seniorId, startAt: range, status: { $ne: "annule" } }).populate("series", "freq weekdays").sort({ startAt: 1 }),
  ]);
  return [
    ...intakes.map((i) => ({
      kind: "prise",
      id: String(i._id),
      at: i.scheduledAt,
      time: hhmmOf(i.scheduledAt),
      title: "Prise de médicament",
      detail: [i.medication?.name, i.medication?.dosage].filter(Boolean).join(" "),
      note: i.medication?.instructions ?? null,
      status: i.status, // a_venir | confirme | manque
    })),
    ...events.map((e) => ({
      kind: "evenement",
      id: String(e._id),
      at: e.startAt,
      time: hhmmOf(e.startAt),
      title: e.title,
      detail: e.location ?? null,
      note: e.notes ?? null,
      type: e.type,
      createdBy: e.createdBy,
      // Rappel répété : « tous les lundis » (supprimer l'occurrence arrête la répétition)
      repeat: repeatLabel(e.series),
      medical: e.medical,
      status: e.status === "fait" ? "fait" : "prevu",
    })),
  ].sort((a, b) => a.at - b.at);
}

// « Qu'ai-je prévu aujourd'hui ? » : réponse construite à partir des données réelles
export function speakAgenda(items, iso, now = new Date()) {
  const day = speakDay(iso, now);
  const dayCap = day.charAt(0).toUpperCase() + day.slice(1);
  if (!items.length) return `${dayCap}, vous n'avez rien de prévu. Profitez bien de votre journée !`;
  const parts = items.map((it) => {
    const when = `À ${speakTime(it.time)}`;
    if (it.kind === "prise") {
      const state = it.status === "confirme" ? " : c'est déjà fait" : it.status === "manque" ? " : cette prise n'a pas été confirmée" : "";
      return `${when}, votre ${it.detail || "médicament"}${state}.`;
    }
    // « votre rendez-vous chez le dentiste », « pensez à appeler votre fille »
    const what = it.type === "rdv" || /^(rendez-vous|rdv)\b/i.test(it.title) ? rdvPhrase(it.title) : isInfinitive(it.title) ? `pensez à ${lowerFirst(toSecondPerson(it.title))}` : lowerFirst(toSecondPerson(it.title));
    return `${when}, ${what}${it.detail ? `, ${speakPlace(it.detail)}` : ""}.`;
  });
  const n = items.length;
  return `${dayCap}, vous avez ${n === 1 ? "une seule chose" : `${n} choses`} de prévue${n > 1 ? "s" : ""}. ${parts.join(" ")}`;
}

/* ---------- Compréhension de la demande ---------- */

function validLlm(obj, now) {
  if (!obj || typeof obj !== "object") return null;
  const intent = INTENTS.includes(obj.intent) ? obj.intent : null;
  if (!intent) return null;
  const date = typeof obj.date === "string" && DATE_RE.test(obj.date) && !Number.isNaN(fromISO(obj.date).getTime()) ? obj.date : null;
  const time = typeof obj.time === "string" && TIME_RE.test(obj.time) ? obj.time : null;
  // Pas de rappel dans le passé lointain ni au-delà d'un an
  if (date) {
    const d = fromISO(date);
    if (d < startOfDay(new Date(now.getTime() - 86400000)) || d > new Date(now.getTime() + 366 * 86400000)) return null;
  }
  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim().slice(0, 80) : null;
  const type = TYPES.includes(obj.type) ? obj.type : "rappel";
  return { intent, date, time, title, type, medical: obj.medical === true };
}

function parseJsonObject(text) {
  const s = String(text).replace(/```(?:json)?/g, "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

/**
 * Comprend une phrase du senior. `context` = demande de rappel en attente d'une heure.
 * Retourne { intent, date, time, title, type, source }.
 */
export async function understand(text, senior, context = null, now = new Date()) {
  const rules = ruleParse(text, now);
  const contacts = await Contact.find({ senior: senior._id }).select("name");
  const names = [`${senior.firstName} ${senior.lastName}`, senior.firstName, senior.lastName, senior.doctor?.name, ...contacts.map((c) => c.name)];

  const today = `${WEEKDAYS[now.getDay()]} ${toISODate(now)}`;
  const system = [
    "Tu analyses une phrase dite par une personne âgée à son assistant d'agenda.",
    `Nous sommes le ${today}, il est ${hhmmOf(now)}.`,
    "Réponds UNIQUEMENT par un objet JSON :",
    '{"intent":"consulter_agenda|creer_rappel|confirmer_prise|autre","date":"AAAA-MM-JJ ou null","time":"HH:MM ou null","title":"intitulé court à l\'infinitif, ex. Prendre mon médicament, ou null","type":"rappel|rdv|repas","medical":true|false}',
    "- medical : true si c'est un rendez-vous ou un rappel lié à la santé (médecin, examen, soins, hôpital…).",
    "- consulter_agenda : la personne demande ce qui est prévu (date = jour demandé, aujourd'hui par défaut).",
    "- creer_rappel : elle veut un rappel ou noter un rendez-vous.",
    "- confirmer_prise : elle dit avoir pris son médicament.",
    "- N'invente jamais d'heure ni de date : si elles ne sont pas dites, mets null.",
  ].join("\n");
  const prompt = context
    ? `Demande en cours : rappel « ${context.title} »${context.date ? ` pour le ${context.date}` : ""}. L'assistant a demandé « À quelle heure ? ». Réponse de la personne : « ${text} »`
    : `Phrase : « ${text} »`;

  let llm = null;
  let source = "regles";
  try {
    const res = await generateText({
      task: "Compréhension vocale (agenda)",
      system,
      prompt,
      names,
      seniorId: senior._id,
      maxTokens: 300,
      localFallback: () => JSON.stringify(rules),
    });
    if (res.provider !== "Générateur local") {
      llm = validLlm(parseJsonObject(res.text), now);
      if (llm) source = res.provider;
    }
  } catch {
    llm = null;
  }

  // Fusion : les heures et dates dites explicitement (règles) font foi ; le LLM complète le reste
  const saidTime = parseTime(text, now);
  const saidDate = parseDate(text, now);
  const base = llm ?? rules;
  const result = {
    intent: base.intent,
    date: saidTime?.date ?? saidDate ?? base.date ?? null,
    time: saidTime?.time ?? (hasTimeWords(text) ? base.time : null),
    title: base.title ?? rules.title,
    type: base.type ?? rules.type,
    // Répétition : uniquement si elle est dite explicitement (règles, pas d'invention possible)
    repeat: parseRecurrence(text),
    medical: rules.medical || llm?.medical === true,
    source,
  };

  // Réponse à « À quelle heure ? » : on complète la demande en attente
  if (context) {
    result.intent = "creer_rappel";
    result.title = context.title;
    result.type = context.type ?? result.type;
    result.date = saidTime?.date ?? saidDate ?? context.date ?? result.date;
    result.repeat = result.repeat ?? context.repeat ?? null;
    result.medical = Boolean(context.medical) || isMedical(context.title);
  }
  // Heure sans jour : aujourd'hui si elle est encore à venir, sinon demain
  if (result.intent === "creer_rappel" && result.time && !result.date) {
    const at = fromISO(toISODate(now), result.time);
    result.date = toISODate(at > now ? at : new Date(at.getTime() + 86400000));
  }
  if (result.intent === "consulter_agenda" && !result.date) result.date = toISODate(now);
  if (result.intent === "creer_rappel") result.title = capitalize(result.title) || "Rappel";
  return result;
}

// Une heure ne peut venir du LLM que si la phrase contient des mots d'heure (garde-fou anti-invention)
const hasTimeWords = (text) => /\d|\b(heures?|midi|minuit|h)\b/.test(normalize(text));

/* ---------- Briefing du matin ---------- */

const numbersIn = (t) => (String(t).match(/\d+/g) ?? []).map(Number);

// Description orale d'un élément à venir
function speakItem(it) {
  const when = `à ${speakTime(it.time)}`;
  return it.kind === "prise" ? `${when}, votre ${it.detail || "médicament"}` : `${when}, ${lowerFirst(toSecondPerson(it.title))}${it.detail ? `, ${speakPlace(it.detail)}` : ""}`;
}

export async function briefing(senior, now = new Date()) {
  const items = await agendaFor(senior._id, now);
  const hour = now.getHours();
  const hello = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const dateLabel = `${WEEKDAYS[now.getDay()]} ${now.getDate()} ${now.toLocaleDateString("fr-FR", { month: "long" })}`;

  // La suite de la journée seulement : ce qui est passé n'est pas présenté comme à venir
  const upcoming = items.filter((i) => i.at >= new Date(now.getTime() - 15 * 60000) && i.status !== "confirme" && i.status !== "fait");
  const missed = items.filter((i) => i.kind === "prise" && i.status === "manque");
  const taken = items.filter((i) => i.kind === "prise" && i.status === "confirme").length;

  const parts = [`${hello} ${senior.firstName} ! Nous sommes ${dateLabel}.`];
  if (upcoming.length) parts.push(`Voici la suite de votre journée : ${upcoming.map(speakItem).join(" ; ")}.`);
  else parts.push("Vous n'avez plus rien de prévu aujourd'hui.");
  if (taken) parts.push(`Vous avez déjà pris ${taken === 1 ? "un médicament" : `${taken} médicaments`} aujourd'hui, bravo.`);
  // Rendez-vous de santé aujourd'hui : conseil de préparation (règles, pas de conseil médical)
  const prep = upcoming.find((i) => i.kind === "evenement" && (i.medical || isMedical(i.title)) && preparationAdvice(i.title));
  if (prep) parts.push(`Pour ${lowerFirst(toSecondPerson(prep.title))} : ${lowerFirst(preparationAdvice(prep.title))}`);
  // Météo du jour (Open-Meteo, seule la ville est envoyée)
  const weather = speakWeather(await todayWeather(senior.city), { goingOut: upcoming.some((i) => i.kind === "evenement") });
  if (weather) parts.push(weather);
  if (missed.length) parts.push(`${missed.map((m) => `Votre ${m.detail} de ${speakTime(m.time)}`).join(" et ")} n'${missed.length > 1 ? "ont" : "a"} pas été confirmé${missed.length > 1 ? "s" : ""}.`);
  const facts = parts.join(" ");

  // Le LLM reformule chaleureusement. Contrôles : aucun nombre inventé, chaque heure à venir
  // et le prénom présents ; sinon la version factuelle est lue telle quelle.
  try {
    const res = await generateText({
      task: "Briefing du jour",
      system:
        "Tu es l'assistant vocal bienveillant d'une personne âgée. Reformule ce programme de façon chaleureuse et simple, en phrases courtes, au vouvoiement. Garde le prénom et TOUTES les heures exactement comme écrites, ne change pas les temps (passé, à venir). N'ajoute aucune information ni conseil médical. Texte brut, sans liste ni émoji.",
      prompt: facts,
      names: [`${senior.firstName} ${senior.lastName}`, senior.firstName, senior.lastName, senior.doctor?.name],
      seniorId: senior._id,
      maxTokens: 400,
      localFallback: () => facts,
    });
    const allowed = new Set([...numbersIn(facts), 15, 30, 45]);
    const said = new Set(numbersIn(res.text));
    const hoursKept = upcoming.every((i) => said.has(Number(i.time.slice(0, 2))) || (i.time === "12:00" && /midi/i.test(res.text)));
    const ok =
      res.provider !== "Générateur local" &&
      res.text.length <= 900 &&
      res.text.includes(senior.firstName) &&
      hoursKept &&
      [...said].every((n) => allowed.has(n));
    return { text: ok ? res.text : facts, items, provider: ok ? res.provider : "Règles" };
  } catch {
    return { text: facts, items, provider: "Règles" };
  }
}
