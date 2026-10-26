import { Event, Medication } from "../../models/index.js";
import { atTime, startOfDay } from "../../utils/dates.js";
import { preparationAdvice } from "./frenchParser.js";
import { speakTime } from "./voiceAgenda.js";

/*
 * Conseils pratiques au moment où le senior ajoute un rendez-vous (module F2) :
 * conflit d'horaire, médicament à emporter, préparation (à jeun, ordonnance…).
 * Uniquement des règles sur les données réelles : rien n'est inventé, aucun conseil médical.
 */

const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export async function adviceFor(seniorId, { title, startAt, type, medical, excludeSeries }) {
  const out = [];
  const at = new Date(startAt);

  // Autre élément prévu à moins de 45 minutes
  const near = await Event.findOne({
    senior: seniorId,
    status: "prevu",
    startAt: { $gte: new Date(at.getTime() - 45 * 60000), $lte: new Date(at.getTime() + 45 * 60000) },
    ...(excludeSeries ? { series: { $ne: excludeSeries } } : {}),
  }).sort({ startAt: 1 });
  if (near && near.title.trim().toLowerCase() !== title.trim().toLowerCase()) {
    out.push(`Attention, vous avez aussi « ${lowerFirst(near.title)} » à ${speakTime(hhmm(near.startAt))}.`);
  }

  // Sortie pour un rendez-vous : médicament à prendre pendant l'absence (de 30 min avant à 2 h après)
  if (type === "rdv" || medical) {
    const meds = await Medication.find({ senior: seniorId, active: true });
    const day = startOfDay(at);
    const during = meds.flatMap((m) =>
      m.times
        .map((t) => ({ m, t, when: atTime(day, t) }))
        .filter(({ when }) => when >= new Date(at.getTime() - 30 * 60000) && when <= new Date(at.getTime() + 120 * 60000)),
    );
    if (during.length) {
      const { m, t } = during[0];
      out.push(`Pensez à prendre avec vous votre ${[m.name, m.dosage].filter(Boolean).join(" ")} de ${speakTime(t)}.`);
    }
  }

  if (medical) {
    const prep = preparationAdvice(title);
    // Deux conseils « à emporter » à la suite : formulés comme une seule idée
    if (prep && out.some((s) => s.startsWith("Pensez à prendre avec vous"))) out.push(prep.replace(/^Pensez à emporter /, "Et n'oubliez pas "));
    else if (prep) out.push(prep);
  }
  return out;
}
