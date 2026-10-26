import { Intake, Medication, Senior } from "../models/index.js";
import { addDays, atTime, startOfDay, timeFr } from "../utils/dates.js";
import { raiseAlert } from "./notifier.js";
import { trackEvent } from "./tracking.js";
import { purgeOldLogs } from "./retention.js";
import { ensureAllOccurrences } from "./agenda/series.js";
import { runEveningTasks } from "./agenda/caregiver.js";
import { startTelegramBot } from "./telegramBot.js";

const REMINDER_EVERY_MIN = 15; // un rappel au senior toutes les 15 minutes
const MAX_REMINDERS = 2; // « non confirmé deux fois » → prise manquée

// Crée les prises du jour (et du lendemain) pour un traitement — opération idempotente
export async function ensureIntakesForMedication(med, days = [new Date(), addDays(new Date(), 1)]) {
  if (!med.active) return;
  const ops = days.flatMap((day) =>
    med.times.map((t) => ({
      updateOne: {
        filter: { medication: med._id, scheduledAt: atTime(startOfDay(day), t) },
        update: { $setOnInsert: { senior: med.senior, status: "a_venir" } },
        upsert: true,
      },
    })),
  );
  if (ops.length) await Intake.bulkWrite(ops);
}

// Supprime les prises futures non effectuées (traitement modifié ou désactivé)
export async function removeFutureIntakes(medId) {
  await Intake.deleteMany({ medication: medId, status: "a_venir", scheduledAt: { $gt: new Date() } });
}

// Un tour du planificateur : génère les prises, compte les rappels, détecte les oublis
export async function tick() {
  const meds = await Medication.find({ active: true });
  for (const med of meds) await ensureIntakesForMedication(med);
  // Rappels répétés du senior : occurrences d'aujourd'hui et de demain (module F2)
  await ensureAllOccurrences();

  const now = Date.now();
  const pending = await Intake.find({ status: "a_venir", scheduledAt: { $lte: new Date(now) } }).populate("medication");
  for (const intake of pending) {
    const elapsedMin = (now - intake.scheduledAt.getTime()) / 60000;
    const reminders = Math.min(MAX_REMINDERS, Math.floor(elapsedMin / REMINDER_EVERY_MIN) + 1);
    if (reminders !== intake.reminders) intake.reminders = reminders;

    if (elapsedMin >= REMINDER_EVERY_MIN * MAX_REMINDERS) {
      intake.status = "manque";
      await intake.save();
      const senior = await Senior.findById(intake.senior);
      trackEvent({ senior: intake.senior, actor: "systeme", module: "agenda", action: "prise_manquee", channel: "auto", outcome: "echec" });
      if (senior) {
        const med = intake.medication;
        await raiseAlert(senior, {
          type: "prise_manquee",
          severity: "haute",
          title: "Prise manquée",
          message: `${med?.name ?? "Médicament"} ${med?.dosage ?? ""} — ${timeFr(intake.scheduledAt)}, non confirmée après ${MAX_REMINDERS} rappels`.replace(/\s+/g, " "),
        });
      }
    } else if (intake.isModified()) {
      await intake.save();
    }
  }
}

export function startScheduler(intervalMs = 60_000) {
  const run = () =>
    tick()
      // Résumé du soir et oublis répétés, envoyés à l'aidant (module F2)
      .then(() => runEveningTasks())
      .catch((err) => console.error("❌ Planificateur :", err.message));
  const purge = () => purgeOldLogs().catch((err) => console.error("❌ Purge des journaux :", err.message));
  run();
  purge();
  const timer = setInterval(run, intervalMs);
  setInterval(purge, 6 * 3600 * 1000).unref(); // durée de conservation des journaux
  timer.unref();
  console.log("⏰ Planificateur démarré (rappels et prises manquées)");
  startTelegramBot(); // liaison des comptes Telegram des aidants (si TELEGRAM_BOT_TOKEN est configuré)
  return timer;
}
