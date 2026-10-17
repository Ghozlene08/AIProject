// Validation systématique des sorties de l'IA avant affichage (exigence : 100 %)

const MAX_LENGTH = 4000;
const FORBIDDEN = [
  /arr[êe]t(ez|er) (votre|le|vos) traitements?/i,
  /doubl(ez|er) (la|votre) dose/i,
  /ne prenez plus/i,
];

export function validateOutput(text) {
  if (typeof text !== "string") throw new Error("Sortie IA vide ou invalide");
  let out = text
    .replace(/<[^>]*>/g, "") // aucun HTML
    .replace(/\[(PERSONNE|TEL)_\d+\]/g, "") // jetons non restitués
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (out.length < 10) throw new Error("Sortie IA trop courte");
  if (out.length > MAX_LENGTH) out = `${out.slice(0, MAX_LENGTH).trimEnd()}…`;
  if (FORBIDDEN.some((re) => re.test(out))) {
    throw new Error("Sortie IA rejetée : conseil médical non autorisé");
  }
  return out;
}
