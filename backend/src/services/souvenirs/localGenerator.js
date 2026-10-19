import { firstLetter } from "./text.js";

/**
 * Générateur local de secours : produit un récit et un quiz uniquement à partir des
 * faits saisis, sans aucun appel externe. Utilisé quand aucun fournisseur IA ne répond,
 * quand la sortie de l'IA est rejetée, ou quand le senior n'a pas donné son consentement IA.
 */

// Saisons et mois. On teste « suivi d'un espace, d'une virgule ou de la fin » plutôt que \b,
// car \b ne reconnaît pas la fin d'un mot qui se termine par une lettre accentuée (« Été »).
const SEASON = /^(printemps|ete|été|automne|hiver|janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)(?=[\s,]|$)/i;

function dateLabel(date) {
  const d = date.trim();
  if (/^\d{4}$/.test(d)) return `en ${d}`;
  if (SEASON.test(d)) return `en ${d.charAt(0).toLowerCase()}${d.slice(1)}`; // « Été 1985 » → « en été 1985 »
  if (/^ann[ée]es\b/i.test(d)) return `dans les ${d}`;
  return `à cette époque (${d})`;
}

const sentence = (s) => {
  const t = s.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};

// « mon mari », « Ma sœur » → « mari », « sœur » (on ajoute nous-mêmes « votre »)
export function cleanRelation(relation) {
  return String(relation ?? "")
    .trim()
    .replace(/^(mon|ma|mes|son|sa|ses|votre|vos|notre|nos)\s+/i, "");
}

function personLabel(p) {
  const relation = cleanRelation(p.relation);
  return relation ? `${p.name}, votre ${relation}` : p.name;
}

function joinFr(list) {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} et ${list.at(-1)}`;
}

export function localGenerate(memory) {
  const people = memory.people ?? [];
  const parts = [`Je vais vous raconter un souvenir : « ${memory.title} ».`];

  if (memory.date || memory.place) {
    const when = memory.date ? ` ${dateLabel(memory.date)}` : "";
    const where = memory.place ? ` à ${memory.place}` : "";
    parts.push(`Cela se passait${when}${where}.`);
  }
  if (people.length) parts.push(`Il y avait ${joinFr(people.map(personLabel))}.`);
  if (memory.story) parts.push(sentence(memory.story));
  parts.push("C'est un très beau moment de votre vie.");

  const candidates = [];
  if (memory.place) {
    candidates.push({
      question: "Où se passait ce souvenir ?",
      answer: memory.place,
      hints: ["Pensez à l'endroit où tout s'est passé.", `Le nom commence par « ${firstLetter(memory.place)} ».`],
    });
  }
  people.slice(0, 2).forEach((p, i) => {
    candidates.push({
      question: cleanRelation(p.relation) ? `Comment s'appelle votre ${cleanRelation(p.relation)}, dans ce souvenir ?` : i === 0 ? "Qui était avec vous ce jour-là ?" : "Qui d'autre était présent ?",
      answer: p.name,
      hints: [p.relation ? "Une personne de votre famille, très proche de vous." : "Une personne qui compte pour vous.", `Son prénom commence par « ${firstLetter(p.name)} ».`],
    });
  });
  if (memory.date) {
    candidates.push({
      question: "À quelle époque se passait ce souvenir ?",
      answer: memory.date,
      hints: ["Pensez à l'année ou à la saison.", `Cela commence par « ${firstLetter(memory.date)} ».`],
    });
  }
  candidates.push({
    question: "De quel moment de votre vie parle ce souvenir ?",
    answer: memory.title,
    hints: ["Repensez au début de l'histoire.", `Cela commence par « ${firstLetter(memory.title)} ».`],
  });

  // Ordre : lieu, 1re personne, époque, 2e personne, titre → on garde les 3 premières
  const order = [
    candidates.find((c) => c.question.startsWith("Où")),
    ...candidates.filter((c) => c.answer === people[0]?.name),
    candidates.find((c) => c.question.startsWith("À quelle")),
    ...candidates.filter((c) => c.answer === people[1]?.name),
    candidates.at(-1),
  ].filter(Boolean);

  return { recit: parts.join(" "), questions: order.slice(0, 3) };
}
