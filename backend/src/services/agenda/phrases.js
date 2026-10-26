import { isInfinitive, rdvPhrase, speakDay, speakTime, toSecondPerson } from "./voiceAgenda.js";
import { speakRepeat } from "./frenchParser.js";

export { rdvPhrase };

/*
 * Le « script » de l'assistant d'agenda (module F2), réuni en un seul endroit.
 * Règles d'écriture : phrases courtes, vouvoiement chaleureux, une seule idée par phrase,
 * jamais de jargon ; plusieurs formulations pour ne pas sonner comme un robot ;
 * chaque consigne correspond à ce que le senior peut réellement faire (bouton ou voix).
 */

/** Une formulation au hasard (variété), ou la première si `fixed` (tests) */
export const pick = (list, fixed = false) => (fixed ? list[0] : list[Math.floor(Math.random() * list.length)]);

export const lowerFirst = (s) => toSecondPerson(String(s ?? "").charAt(0).toLowerCase() + String(s ?? "").slice(1));
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const de = (s) => (/^[aeéèêiîoôuyh]/i.test(s) ? "d'" : "de ");

/** « ce soir à 19 heures », « jeudi à 10 heures », « tous les lundis à 10 heures » */
export function whenOf(p, repeat = p.repeat) {
  if (repeat) return `${speakRepeat(repeat)} à ${speakTime(p.time)}`;
  const day = speakDay(p.date);
  const evening = Number(p.time.slice(0, 2)) >= 18;
  if (evening && day === "aujourd'hui") return `ce soir à ${speakTime(p.time)}`;
  return `${day} à ${speakTime(p.time)}`;
}

/** Ce que l'assistant propose avant d'enregistrer (question fermée : oui / non) */
export function proposal(p, fixed = false) {
  const when = whenOf(p);
  if (p.type === "rdv") return pick([`Très bien : ${rdvPhrase(p.title)}, ${when}. Je le note dans votre agenda ?`, `${capFirst(rdvPhrase(p.title))}, ${when} : c'est bien ça ?`], fixed);
  if (isInfinitive(p.title)) {
    const what = `${de(p.title)}${lowerFirst(p.title)}`;
    return pick([`Je vous rappelle ${what} ${when}, c'est bien ça ?`, `Entendu : je vous rappellerai ${what} ${when}. C'est bien ça ?`], fixed);
  }
  return pick([`Je note « ${lowerFirst(p.title)} », ${when}. C'est bien ça ?`], fixed);
}

/** Confirmation après l'enregistrement, suivie des conseils et de l'aidant prévenu */
export function saved({ title, type }, when, { advice = [], notified = null } = {}, fixed = false) {
  const base =
    type === "rdv"
      ? pick([`C'est noté : ${rdvPhrase(title)}, ${when}.`, `Parfait, j'ai noté ${rdvPhrase(title)}, ${when}.`], fixed)
      : pick([`C'est noté ! Je vous le rappellerai ${when}.`, `Parfait, je vous le rappellerai ${when}.`], fixed);
  // Transparence : le senior sait que son aidant est informé (formulation neutre, sans genre)
  const tell = notified ? pick([`J'en informe aussi ${notified}.`, `Je préviens aussi ${notified}.`], fixed) : "";
  return [base, ...advice, tell].filter(Boolean).join(" ");
}

export const alreadyThere = (title, when, type) =>
  `Vous l'avez déjà noté : ${type === "rdv" ? rdvPhrase(title) : lowerFirst(title)}, ${when}. Je vous le rappellerai, ne vous inquiétez pas.`;

export const askTime = (fixed = false) => pick(["À quelle heure voulez-vous que je vous le rappelle ?", "Très bien. Et à quelle heure ?"], fixed);
export const timeNotUnderstood = () => "Pardon, je n'ai pas bien compris l'heure. Vous pouvez recommencer, par exemple : « Rappelle-moi d'appeler ma fille demain à 10 heures ».";
export const timePassed = (time) => `Il est déjà plus de ${speakTime(time)}. À quelle heure voulez-vous ce rappel ?`;
export const yesNoAgain = () => "Pardon, je n'ai pas bien entendu. Est-ce que je le note : oui ou non ?";
export const cancelled = (fixed = false) => pick(["D'accord, je ne note rien. Je reste là si vous avez besoin.", "Pas de souci, j'annule."], fixed);
export const notUnderstood = () => "Je m'occupe de votre agenda et de vos rappels. Vous pouvez me demander, par exemple : « Qu'est-ce que j'ai demain ? » ou « Rappelle-moi d'appeler ma fille à 18 heures ».";

export const intakeConfirmed = (name, fixed = false) =>
  pick([`C'est noté, bravo ! Votre ${name} est bien enregistré.`, `Parfait, j'ai bien noté votre ${name}. Bravo !`], fixed);
export const noIntakeDue = () => "Je ne vois pas de médicament à prendre en ce moment. Tout est à jour, bravo !";

/** Rappel à l'heure : la consigne correspond aux boutons de la fenêtre de rappel */
export function intakeReminder(nowHHMM, med, instructions) {
  return `Il est ${speakTime(nowHHMM)}. C'est le moment de prendre votre ${med}${instructions ? `, ${lowerFirst(instructions)}` : ""}. Touchez « Je l'ai pris » quand c'est fait.`;
}

export function eventReminder(e, timeHHMM, location) {
  if (e.type === "rdv") return `N'oubliez pas : ${rdvPhrase(e.title)}, à ${speakTime(timeHHMM)}${location ? `, ${location}` : ""}.`;
  if (isInfinitive(e.title)) return pick([`Petit rappel : c'est le moment ${de(e.title)}${lowerFirst(e.title)}.`, `Comme vous me l'avez demandé : pensez à ${lowerFirst(e.title)}.`]);
  return `Petit rappel : ${lowerFirst(e.title)}.`;
}
