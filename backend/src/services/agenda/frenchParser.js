// Analyse déterministe des demandes d'agenda en français (heures, dates, intentions).
// Sert de secours quand aucun LLM n'est disponible, et de garde-fou contre les heures inventées.

const NUMBER_WORDS = [
  ["vingt et une", 21], ["vingt et un", 21], ["vingt-trois", 23], ["vingt trois", 23], ["vingt-deux", 22], ["vingt deux", 22],
  ["dix-neuf", 19], ["dix neuf", 19], ["dix-huit", 18], ["dix huit", 18], ["dix-sept", 17], ["dix sept", 17],
  ["cinquante", 50], ["quarante-cinq", 45], ["quarante", 40], ["trente", 30], ["vingt", 20],
  ["seize", 16], ["quinze", 15], ["quatorze", 14], ["treize", 13], ["douze", 12], ["onze", 11], ["dix", 10],
  ["neuf", 9], ["huit", 8], ["sept", 7], ["six", 6], ["cinq", 5], ["quatre", 4], ["trois", 3], ["deux", 2], ["une", 1], ["un", 1],
];
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];

const pad = (n) => String(n).padStart(2, "0");
export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plusDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Minuscules, sans accents, apostrophes droites, nombres écrits en lettres → chiffres
export function normalize(text) {
  let s = String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  for (const [word, n] of NUMBER_WORDS) s = s.replace(new RegExp(`\\b${word}\\b`, "g"), String(n));
  return s;
}

/** Heure demandée → { time: "HH:MM", dayOffset? } ou null */
export function parseTime(text, now = new Date()) {
  const s = normalize(text);

  // Relatif : « dans 2 heures », « dans 30 minutes », « dans 1 heure et demie »
  const rel = s.match(/\bdans (\d{1,3}) ?(heures?|h|minutes?|min)\b(?: et (demie?|quart))?/);
  if (rel) {
    let minutes = Number(rel[1]) * (rel[2].startsWith("h") ? 60 : 1);
    if (rel[3]) minutes += rel[3].startsWith("demi") ? 30 : 15;
    const at = new Date(now.getTime() + minutes * 60000);
    return { time: `${pad(at.getHours())}:${pad(at.getMinutes())}`, date: toISODate(at), relative: true };
  }

  if (/\bminuit\b/.test(s)) return { time: "00:00" };
  // « midi » seul, pas « après-midi »
  const noon = s.match(/(?<!apres[- ])\bmidi(?: (et demie?|et quart|(\d{1,2})))?\b/);
  if (noon) return { time: `12:${noon[1]?.startsWith("et demi") ? "30" : noon[1] === "et quart" ? "15" : pad(Number(noon[2] ?? 0))}` };

  const m = s.match(/\b(\d{1,2}) ?(?:h|heures?)\b(?: ?(\d{1,2})\b| et (demie?|quart)| moins (?:le )?quart)?/);
  if (!m) return null;
  let h = Number(m[1]);
  let min = m[2] ? Number(m[2]) : m[3] ? (m[3].startsWith("demi") ? 30 : 15) : 0;
  if (/moins (le )?quart/.test(m[0])) {
    h = (h + 23) % 24;
    min = 45;
  }
  if (h > 23 || min > 59) return null;
  // « 8 heures du soir », « 3 heures de l'après-midi », « ce soir à 9 heures »
  if (h < 12 && /\b(du soir|de l'apres[- ]midi|cet apres[- ]midi|ce soir)\b/.test(s)) h += 12;
  return { time: `${pad(h)}:${pad(min)}` };
}

/** Jour demandé → "AAAA-MM-JJ" ou null si aucun jour n'est mentionné */
export function parseDate(text, now = new Date()) {
  const s = normalize(text);
  const today = dayStart(now);
  if (/\bapres[- ]demain\b/.test(s)) return toISODate(plusDays(today, 2));
  if (/\bdemain\b/.test(s)) return toISODate(plusDays(today, 1));
  if (/\b(aujourd'hui|ce soir|ce matin|cet apres[- ]midi|tout a l'heure)\b/.test(s)) return toISODate(today);
  if (/\bhier\b/.test(s)) return toISODate(plusDays(today, -1));

  const wd = s.match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1]);
    let diff = (target - today.getDay() + 7) % 7;
    if (diff === 0) diff = 7; // « samedi » dit un samedi : la semaine prochaine
    return toISODate(plusDays(today, diff));
  }

  const dm = s.match(/\ble (\d{1,2})(?:er)?(?: (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre))?\b/);
  if (dm) {
    const day = Number(dm[1]);
    if (day < 1 || day > 31) return null;
    let month = dm[2] ? MONTHS.indexOf(dm[2]) : today.getMonth();
    let year = today.getFullYear();
    let d = new Date(year, month, day);
    if (d < today) {
      if (dm[2]) year += 1;
      else month += 1;
      d = new Date(year, month, day);
    }
    return toISODate(d);
  }
  return null;
}

/** Intention d'agenda */
export function detectIntent(text) {
  const s = normalize(text);
  if (/\b(j'?ai (bien |deja )?pris|c'?est pris|je l'?ai pris|j'?ai avale|medicament (est )?pris)\b/.test(s)) return "confirmer_prise";
  if (
    /(qu'?ai[- ]je|qu'?est[- ]ce que j'?ai|qu'?est[- ]ce qui est prevu|quoi de prevu|mon programme|mon agenda|ma journee|j'?ai quoi|qu'?y a[- ]t[- ]il|qu'?est[- ]ce que je fais|ai[- ]je (un |des )?(rendez-vous|rdv))/.test(s)
  )
    return "consulter_agenda";
  if (/(rappelle|rappel|fais[- ]moi penser|n'?oublie pas|\bnote\b|ajoute|programme|mets[- ]moi|\breveille|prends? (un )?rendez-vous|j'?ai (un )?rendez-vous)/.test(s)) return "creer_rappel";
  return "autre";
}

/** Type d'événement d'après le contenu */
export function detectType(text) {
  const s = normalize(text);
  if (/(rendez-vous|\brdv\b|docteur|medecin|dentiste|kine|consultation|hopital|analyse|prise de sang)/.test(s)) return "rdv";
  if (/(manger|dejeuner|diner|repas|gouter)/.test(s)) return "repas";
  return "rappel";
}

// (?<![\p{L}\d]) remplace \b, qui ne reconnaît pas les lettres accentuées (« à », « après »…)
const TIME_EXPR = [
  /(?<![\p{L}\d])(?:à|a|vers|pour)\s+(?:\d{1,2}|[\p{L}-]+(?: et une?)?)\s*(?:h|heures?)(?![\p{L}])(?:\s*\d{1,2}|\s+et\s+(?:demie?|quart)|\s+moins\s+(?:le\s+)?quart)?(?:\s+(?:du soir|du matin|de l'après-midi|de l'apres-midi))?/giu,
  /(?<![\p{L}\d])(?:à|a)\s+(?:midi|minuit)(?:\s+et\s+(?:demie?|quart))?/giu,
  /(?<![\p{L}\d])dans\s+\S+\s+(?:heures?|minutes?|h|min)(?![\p{L}])(?:\s+et\s+(?:demie?|quart))?/giu,
  /(?<![\p{L}\d])(?:aujourd'hui|aujourd’hui|après-demain|apres-demain|demain|ce soir|ce matin|cet après-midi|cet apres-midi|tout à l'heure)(?![\p{L}])/giu,
  /(?<![\p{L}\d])(?:ce\s+|le\s+)?(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+prochain)?(?![\p{L}])/giu,
  /(?<![\p{L}\d])le\s+\d{1,2}(?:er)?(?:\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre))?(?![\p{L}\d])/giu,
];

/** Intitulé du rappel : la phrase sans la formule d'appel ni les indications de date et d'heure */
export function extractTitle(text) {
  let t = String(text ?? "").trim();
  t = t.replace(
    /^(?:(?:est-ce que tu peux|peux-tu|pourrais-tu|tu peux|s'il te plaît,?)\s+)?(?:rappelle[- ]moi|fais[- ]moi penser(?: à| a)?|n'oublie pas de me rappeler|note(?:-moi)?|ajoute(?: un rappel)?|programme(?: un rappel)?|mets[- ]moi un rappel|je voudrais un rappel)\s*(?:de |d'|d’|que |qu'|qu’|pour |:)?/i,
    "",
  );
  for (const re of TIME_EXPR) t = t.replace(re, " ");
  t = t
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, "")
    .replace(/\s+(?:à|a|le|pour|vers)$/i, "")
    .trim();
  if (!t) return null;
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 80);
}

/** Réponse oui / non à une question de confirmation */
export function parseYesNo(text) {
  const s = normalize(text);
  if (/\b(non|annule|annuler|pas (ca|du tout)|erreur|recommence|c'?est faux)\b/.test(s)) return "non";
  if (/\b(oui|ouais|d'?accord|exact|exactement|c'?est (bien )?(ca|cela)|parfait|tout a fait|absolument|ok|okay|vas[- ]y|confirme|bien sur|voila)\b/.test(s)) return "oui";
  return null;
}

/** Analyse complète par règles */
export function ruleParse(text, now = new Date()) {
  const intent = detectIntent(text);
  const t = parseTime(text, now);
  let date = t?.date ?? parseDate(text, now);
  const time = t?.time ?? null;
  // Une heure sans jour : aujourd'hui si elle n'est pas passée, sinon demain
  if (intent === "creer_rappel" && time && !date) {
    const [h, m] = time.split(":").map(Number);
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    date = toISODate(at > now ? at : plusDays(at, 1));
  }
  return {
    intent,
    date,
    time,
    title: intent === "creer_rappel" ? extractTitle(text) : null,
    type: detectType(text),
  };
}
