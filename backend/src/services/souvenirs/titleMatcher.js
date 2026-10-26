import { keywords, normalize } from "./text.js";

/**
 * Retrouve le souvenir que le senior a demandé à voix haute, sans IA (rapide, gratuit, fiable).
 *
 * Le senior n'a pas besoin de dire le titre exact :
 *  - « le mariage »          → « Mariage de Marie et Ahmed »
 *  - « celui avec Karim »    → « Naissance de Karim »   (on cherche aussi dans les personnes et le lieu)
 *  - « Tabarqa »             → « Vacances à Tabarka »   (petites fautes de transcription tolérées)
 *  - « le deuxième »         → 2e titre affiché à l'écran
 *
 * Résultat : { status: "trouve", memoryId } | { status: "ambigu", candidates: [ids] } | { status: "aucun" }
 */

// Mots sans intérêt pour identifier un souvenir (« je veux écouter celui du mariage »)
const FILLERS = new Set([
  "veux", "voudrais", "aimerais", "ecouter", "entendre", "souvenir", "souvenirs", "celui", "celle", "ceux", "parle",
  "raconte", "racontez", "moi", "histoire", "plait", "merci", "oui", "bien", "alors", "avec", "dans", "pour", "quand", "etait",
]);

// Positions dites en toutes lettres (« le deuxième ») ou après « numéro » (« numéro 2 », « numéro deux »)
const ORDINAL_WORDS = [["premier", "premiere"], ["deuxieme", "second", "seconde"], ["troisieme"]];
const NUMBER_WORDS = [["un", "une", "1"], ["deux", "2"], ["trois", "3"]];

// Distance d'édition (nombre de lettres à changer) entre deux mots
function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// Deux mots « se ressemblent » : identiques, même début (≥ 4 lettres) ou 1 faute pour les mots longs
export function similar(a, b) {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return a.length >= 5 && b.length >= 5 && levenshtein(a, b) <= 1;
}

// Tous les mots qui décrivent un souvenir : titre, lieu, date, prénoms
function memoryWords(m) {
  const people = (m.people ?? []).map((p) => p.name).join(" ");
  return keywords([m.title, m.place, m.date, people].filter(Boolean).join(" "));
}

/**
 * @param text      ce que le senior a dit
 * @param memories  les souvenirs proposés (dans l'ordre affiché à l'écran)
 */
export function matchMemory(text, memories) {
  if (!text || !memories.length) return { status: "aucun" };

  // 1. « le premier », « le deuxième », « numéro 2 » : position dans la liste affichée
  const words = normalize(text).split(" ");
  let index = ORDINAL_WORDS.findIndex((forms) => forms.some((f) => words.includes(f)));
  const numero = words.indexOf("numero");
  if (index === -1 && numero !== -1) index = NUMBER_WORDS.findIndex((forms) => forms.includes(words[numero + 1]));
  if (index !== -1 && memories[index]) return { status: "trouve", memoryId: String(memories[index]._id) };

  // 2. Mots en commun avec le titre, le lieu, la date ou les prénoms
  const spoken = keywords(text).filter((w) => !FILLERS.has(w));
  if (!spoken.length) return { status: "aucun" };

  const scored = memories.map((m) => {
    const mWords = memoryWords(m);
    const score = spoken.filter((w) => mWords.some((mw) => similar(w, mw))).length;
    return { id: String(m._id), score };
  });
  const best = Math.max(...scored.map((s) => s.score));
  if (best === 0) return { status: "aucun" };

  const top = scored.filter((s) => s.score === best);
  if (top.length === 1) return { status: "trouve", memoryId: top[0].id };
  return { status: "ambigu", candidates: top.slice(0, 3).map((s) => s.id) };
}
