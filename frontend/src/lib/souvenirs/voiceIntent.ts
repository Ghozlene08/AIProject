/**
 * Comprend la réponse du senior à la question « Voulez-vous écouter un souvenir, ou en raconter un ? ».
 * Comparaison de mots, sans IA : c'est instantané, gratuit et toujours disponible.
 * Le senior peut répondre librement : « écouter », « je veux écouter », « raconte-moi »…
 */

export type MemoryChoice = "ecouter" | "raconter";

const normalize = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, " ");

// Débuts de mots reconnus pour chaque choix
const LISTEN = ["ecout", "entend", "oreille", "raconte moi", "racontez moi", "raconter moi"];
const TELL = ["racont", "parl", "dire", "enregistr", "bouche", "partag"];

/** Renvoie le choix compris, ou null si la réponse est ambiguë ou hors sujet */
export function detectChoice(text: string | null): MemoryChoice | null {
  if (!text) return null;
  const t = ` ${normalize(text)} `;
  // « raconte-moi » = le senior veut ÉCOUTER (c'est l'assistant qui raconte)
  const listen = LISTEN.some((w) => t.includes(` ${w}`));
  const tell = !/ racont\w* moi /.test(t) && TELL.some((w) => t.includes(` ${w}`));
  if (listen && !tell) return "ecouter";
  if (tell && !listen) return "raconter";
  return null;
}
