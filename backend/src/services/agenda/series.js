import { Event, ReminderSeries } from "../../models/index.js";
import { addDays, atTime, startOfDay } from "../../utils/dates.js";
import { speakRepeat } from "./frenchParser.js";

/*
 * Rappels répétés (module F2) : « tous les lundis à 10 h », « chaque matin à 9 h ».
 * Comme les prises de médicaments, chaque occurrence devient un élément normal de l'agenda
 * (Event) pour aujourd'hui et demain : rappels proactifs, suppression et doublons fonctionnent à l'identique.
 */

const sameTitle = (a, b) => a.trim().localeCompare(b.trim(), "fr", { sensitivity: "base" }) === 0;

const occursOn = (series, day) => series.freq === "quotidien" || series.weekdays.includes(day.getDay());

// Crée les occurrences manquantes (opération idempotente, appelée par le planificateur)
export async function ensureOccurrences(seriesList, days = [new Date(), addDays(new Date(), 1)]) {
  const ops = [];
  for (const s of seriesList) {
    if (!s.active) continue;
    for (const day of days) {
      const startAt = atTime(startOfDay(day), s.time);
      if (!occursOn(s, day) || startAt < s.startAt) continue;
      ops.push({
        updateOne: {
          filter: { series: s._id, startAt },
          update: { $setOnInsert: { senior: s.senior, title: s.title, type: s.type, createdBy: s.createdBy, medical: s.medical, status: "prevu" } },
          upsert: true,
        },
      });
    }
  }
  if (ops.length) await Event.bulkWrite(ops);
}

export async function ensureAllOccurrences() {
  await ensureOccurrences(await ReminderSeries.find({ active: true }));
}

/** Rappel répété identique déjà actif (même intitulé, même heure, même rythme) */
export async function findSeriesDuplicate(seniorId, { title, time, freq, weekdays }) {
  const list = await ReminderSeries.find({ senior: seniorId, active: true, time, freq });
  const key = (w) => [...(w ?? [])].sort().join(",");
  return list.find((s) => sameTitle(s.title, title) && (freq === "quotidien" || key(s.weekdays) === key(weekdays))) ?? null;
}

/**
 * Crée un rappel répété et ses premières occurrences.
 * `firstAt` : date de la première occurrence (sert aussi de jour par défaut pour « toutes les semaines »).
 */
export async function createSeries(senior, { title, type, time, repeat, medical, createdBy = "senior" }, firstAt) {
  const weekdays = repeat.freq === "quotidien" ? [] : repeat.weekdays?.length ? repeat.weekdays : [firstAt.getDay()];
  const data = { title, time, freq: repeat.freq, weekdays };
  const existing = await findSeriesDuplicate(senior._id, data);
  if (existing) return { series: existing, duplicate: true };
  const series = await ReminderSeries.create({ ...data, senior: senior._id, type, medical, createdBy, startAt: new Date(Date.now() - 60000) });
  await ensureOccurrences([series]);
  return { series, duplicate: false };
}

/** Arrête un rappel répété : plus de nouvelles occurrences, celles à venir sont annulées */
export async function stopSeries(seriesId, seniorId) {
  const series = await ReminderSeries.findOneAndUpdate({ _id: seriesId, senior: seniorId }, { active: false }, { new: true });
  if (!series) return null;
  await Event.updateMany({ series: series._id, status: "prevu", startAt: { $gte: new Date(Date.now() - 15 * 60000) } }, { status: "annule" });
  return series;
}

export const repeatLabel = (series) => (series ? speakRepeat({ freq: series.freq, weekdays: series.weekdays }) : null);
