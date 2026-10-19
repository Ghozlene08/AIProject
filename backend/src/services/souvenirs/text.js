// Outils de texte partagés par le module Souvenirs (aucune dépendance externe)

// « Leïla ! » → « leila » : minuscules, sans accents ni ponctuation
export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "d", "l", "a", "au", "aux", "en", "et", "ou",
  "votre", "vos", "mon", "ma", "mes", "son", "sa", "ses", "c", "est", "etait", "ce", "cette", "il", "elle",
]);

// Mots porteurs de sens (≥ 3 lettres ou nombres), sans les mots outils
export function keywords(text) {
  return normalize(text)
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w) && (w.length >= 3 || /^\d+$/.test(w)));
}

// Première lettre utile d'un mot, en majuscule (pour les indices)
export function firstLetter(text) {
  const m = String(text ?? "").trim().match(/\p{L}|\d/u);
  return m ? m[0].toUpperCase() : "";
}

// Mots qui ne doivent jamais être dits au senior
export const FORBIDDEN_WORDS = /\b(faux|fausse|incorrecte?s?|erreurs?|mauvaises? r[ée]ponses?|rat[ée]e?)\b/i;
