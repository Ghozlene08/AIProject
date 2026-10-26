/**
 * Tests unitaires du module Souvenirs (F4).
 * Lancement : `npm test` dans le dossier backend (utilise le lanceur intégré de Node : node --test).
 *
 * Ces tests ne touchent ni à MongoDB ni à Internet : ils vérifient uniquement la logique
 * « pure » du module, c'est-à-dire :
 *   - la normalisation du texte (accents, majuscules…) ;
 *   - la validation des sorties de l'IA (aucune invention, aucun mot « faux ») ;
 *   - le générateur local de secours.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isGrounded, factsText, validateGenerated } from "../src/services/souvenirs/quiz.validator.js";
import { localGenerate } from "../src/services/souvenirs/localGenerator.js";
import { normalize } from "../src/services/souvenirs/text.js";

// Souvenir d'exemple, tel que l'aidant pourrait le saisir
const memory = {
  title: "Mariage de Marie et Ahmed",
  date: "été 1972",
  place: "Sousse",
  people: [
    { name: "Ahmed", relation: "mari" },
    { name: "Leïla", relation: "sœur" },
  ],
  story: "Fête dans le jardin, Leïla a chanté, robe brodée par sa mère.",
};

// Simule une réponse de LLM : du JSON entouré de ```json … ``` (cas fréquent en pratique)
const llmOutput = (questions, recit = "Je vais vous raconter votre mariage avec Ahmed, à Sousse, en été 1972. Leïla chantait dans le jardin.") =>
  "```json\n" + JSON.stringify({ recit, questions }) + "\n```";

/* ---------- Normalisation du texte ---------- */

test("normalise accents, majuscules et ponctuation", () => {
  assert.equal(normalize("  Leïla ! "), "leila");
  assert.equal(normalize("À Sousse."), "a sousse");
});

/* ---------- Ancrage : la réponse doit exister dans les faits saisis ---------- */

test("une réponse présente dans les faits est ancrée, une réponse inventée ne l'est pas", () => {
  const facts = factsText(memory);
  assert.ok(isGrounded("À Sousse", facts)); // « sousse » est dans les faits
  assert.ok(isGrounded("leila", facts)); // sans accent ni majuscule : accepté
  assert.ok(!isGrounded("Monastir", facts)); // jamais mentionné : refusé
});

/* ---------- Validation des sorties de l'IA ---------- */

test("accepte une sortie IA valide (JSON entouré de ```json)", () => {
  const out = validateGenerated(
    llmOutput([
      { question: "Où a eu lieu votre mariage", reponse: "Sousse", indices: ["Une ville au bord de la mer.", "Elle commence par S."] },
      { question: "Qui a chanté ?", reponse: "Leïla", indices: ["Votre sœur.", "Son prénom commence par L."] },
      { question: "En quelle année ?", reponse: "1972", indices: ["Dans les années 70.", "Deux ans avant 1974."] },
    ]),
    memory,
  );
  assert.equal(out.questions.length, 3);
  assert.equal(out.questions[0].question, "Où a eu lieu votre mariage ?"); // le « ? » manquant est ajouté
  assert.equal(out.questions[1].answer, "Leïla"); // « reponse » (français) devient « answer »
  assert.equal(out.questions[1].hints.length, 2); // toujours 2 indices
});

test("écarte les questions dont la réponse est inventée", () => {
  // « Rouge » n'apparaît nulle part dans les faits → question écartée → il en reste 1 → rejet
  assert.throws(
    () =>
      validateGenerated(
        llmOutput([
          { question: "Quelle était la couleur de la voiture ?", reponse: "Rouge", indices: [] },
          { question: "Qui a chanté ?", reponse: "Leïla", indices: [] },
        ]),
        memory,
      ),
    /Pas assez de questions fiables/,
  );
});

test("rejette un récit qui contient un mot interdit", () => {
  // Règle du module : on ne dit jamais « faux » au senior
  assert.throws(
    () => validateGenerated(llmOutput([], "C'est faux de penser que ce mariage était triste, c'était une très belle fête à Sousse."), memory),
    /mot interdit/,
  );
});

test("retire un indice qui donne directement la réponse", () => {
  const out = validateGenerated(
    llmOutput([
      { question: "Où ?", reponse: "Sousse", indices: ["C'était à Sousse.", "Au bord de la mer."] },
      { question: "Qui a chanté ?", reponse: "Leïla", indices: ["Votre sœur.", "Commence par L."] },
    ]),
    memory,
  );
  // « C'était à Sousse. » est retiré, puis remplacé par un indice par défaut
  assert.ok(out.questions[0].hints.every((h) => !h.includes("Sousse")));
  assert.equal(out.questions[0].hints.length, 2);
});

test("rejette une sortie qui n'est pas du JSON", () => {
  assert.throws(() => validateGenerated("Voici un joli récit sans JSON.", memory), /JSON/);
});

/* ---------- Générateur local de secours ---------- */

test("le générateur local produit un récit et 3 questions ancrées, sans mot interdit", () => {
  const out = localGenerate(memory);
  assert.ok(out.recit.includes("Sousse"));
  assert.equal(out.questions.length, 3);
  // Ordre attendu : lieu, première personne, époque
  assert.deepEqual(out.questions.map((q) => q.answer), ["Sousse", "Ahmed", "été 1972"]);
  // La sortie locale respecte elle aussi toutes les règles de validation
  const validated = validateGenerated(JSON.stringify(out), memory);
  assert.equal(validated.questions.length, 3);
});

test("le générateur local fonctionne avec un titre seul", () => {
  const out = localGenerate({ title: "Mon premier vélo" });
  assert.ok(out.recit.includes("Mon premier vélo"));
  assert.equal(out.questions.length, 1); // une seule question possible : le titre
});

/* ---------- Photos : vérification du vrai format du fichier ---------- */

import { detectImageType } from "../src/services/souvenirs/photo.storage.js";

test("reconnaît une photo JPEG, PNG ou WebP grâce à ses premiers octets", () => {
  const pad = Buffer.alloc(8);
  assert.equal(detectImageType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), pad])), "image/jpeg");
  assert.equal(detectImageType(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pad])), "image/png");
  assert.equal(detectImageType(Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "binary")), "image/webp");
});

test("refuse un fichier qui n'est pas une image, même s'il se dit image/jpeg", () => {
  assert.equal(detectImageType(Buffer.from("<script>alert(1)</script>")), null);
  assert.equal(detectImageType(Buffer.alloc(4)), null); // trop court
});

/* ---------- Corrections du générateur local ---------- */

test("le générateur local écrit « en été 1985 » et évite « votre mon mari »", () => {
  const out = localGenerate({ title: "Vacances à la plage", date: "Été 1985", place: "Sousse", people: [{ name: "Ahmed", relation: "mon mari" }] });
  assert.ok(out.recit.includes("en été 1985"));
  assert.ok(out.recit.includes("Ahmed, votre mari"));
  assert.ok(!out.recit.includes("votre mon"));
  assert.ok(out.questions.some((q) => q.question === "Comment s'appelle votre mari, dans ce souvenir ?"));
});

/* ---------- Proposition de récit acceptée par l'aidant ---------- */

import { checkProposal } from "../src/services/souvenirs/generation.service.js";

test("une proposition valide est acceptée, une proposition modifiée avec une réponse inventée est refusée", () => {
  const ok = {
    recit: "Je vais vous raconter votre mariage avec Ahmed, à Sousse, en été 1972. Leïla chantait dans le jardin.",
    questions: [
      { question: "Où ?", answer: "Sousse", hints: ["La mer.", "Commence par S."] },
      { question: "Qui a chanté ?", answer: "Leïla", hints: ["Votre sœur.", "Commence par L."] },
    ],
  };
  assert.equal(checkProposal(ok, memory).questions.length, 2);
  const tampered = { ...ok, questions: [{ question: "Où ?", answer: "Paris", hints: [] }] };
  assert.throws(() => checkProposal(tampered, memory));
});

test("la proposition du générateur local est acceptée même avec une seule question", () => {
  const simple = { title: "Mon premier vélo" };
  assert.equal(checkProposal(localGenerate(simple), simple).questions.length, 1);
});

/* ---------- Un seul récit : formulaire (story) = livre (generated.recit) ---------- */

import { generateForMemory } from "../src/services/souvenirs/generation.service.js";

// consentAI: false → aucun appel externe (générateur local), le test reste hors ligne
const noAI = { consentAI: false };

test("le texte écrit par l'aidant est lu mot pour mot au senior", async () => {
  const m = { ...memory, story: "Le jour de notre mariage à Sousse, Leïla a chanté pour Ahmed et moi." };
  await generateForMemory(m, noAI);
  assert.equal(m.generated.recit, m.story);
  assert.ok(m.generated.questions.length >= 2); // le quiz est quand même généré
});

test("sans texte de l'aidant, le récit généré est recopié dans le formulaire", async () => {
  const m = { ...memory, story: "" };
  await generateForMemory(m, noAI);
  assert.ok(m.generated.recit.length > 0);
  assert.equal(m.story, m.generated.recit);
});

/* ---------- Côté senior : retrouver le souvenir demandé à voix haute ---------- */

import { matchMemory } from "../src/services/souvenirs/titleMatcher.js";

const list = [
  { _id: "a", title: "Mariage de Marie et Ahmed", date: "été 1972", place: "Sousse", people: [{ name: "Ahmed" }, { name: "Leïla" }] },
  { _id: "b", title: "Naissance de Karim", date: "1975", place: "Tunis", people: [{ name: "Karim" }, { name: "Ahmed" }] },
  { _id: "c", title: "Vacances à Tabarka", date: "années 80", place: "Tabarka", people: [{ name: "Karim" }, { name: "Sophie" }] },
];

test("retrouve un souvenir à partir d'un mot du titre, même dans une phrase", () => {
  assert.deepEqual(matchMemory("le mariage", list), { status: "trouve", memoryId: "a" });
  assert.deepEqual(matchMemory("je veux écouter les vacances", list), { status: "trouve", memoryId: "c" });
});

test("tolère une petite faute de transcription et cherche aussi le lieu", () => {
  assert.deepEqual(matchMemory("Tabarqa", list), { status: "trouve", memoryId: "c" });
  assert.deepEqual(matchMemory("celui à Tunis", list), { status: "trouve", memoryId: "b" });
});

test("comprend « le premier », « le deuxième », « numéro trois »", () => {
  assert.deepEqual(matchMemory("le premier", list), { status: "trouve", memoryId: "a" });
  assert.deepEqual(matchMemory("le deuxième s'il te plaît", list), { status: "trouve", memoryId: "b" });
  assert.deepEqual(matchMemory("numéro trois", list), { status: "trouve", memoryId: "c" });
});

test("signale une réponse ambiguë ou sans rapport", () => {
  // Karim apparaît dans deux souvenirs
  assert.deepEqual(matchMemory("celui avec Karim", list), { status: "ambigu", candidates: ["b", "c"] });
  assert.deepEqual(matchMemory("la voiture rouge", list), { status: "aucun" });
  assert.deepEqual(matchMemory("je veux écouter un souvenir", list), { status: "aucun" });
});

/* ---------- Quiz : jugement des réponses orales (sans IA) ---------- */

import { classifyIntent, localVerdict } from "../src/services/souvenirs/answerEvaluator.js";

test("une bonne réponse est reconnue, même dans une phrase ou avec une petite faute", () => {
  assert.equal(localVerdict("À Sousse", "Sousse"), "correct");
  assert.equal(localVerdict("c'était ma sœur Leïla", "Leïla"), "correct");
  assert.equal(localVerdict("Leila", "Leïla"), "correct");
  assert.equal(localVerdict("Tabarqa", "Tabarka"), "correct");
  assert.equal(localVerdict("en 1972", "été 1972"), "correct");
});

test("une réponse proche ou différente n'est jamais « correcte »", () => {
  assert.equal(localVerdict("1974", "été 1972"), "proche"); // à 2 ans près
  assert.equal(localVerdict("Mariage", "Mariage de Marie et Ahmed avec Leïla"), "proche"); // en partie
  assert.equal(localVerdict("Monastir", "Sousse"), "different");
});

test("comprend « je ne sais pas » et « passe », sans confondre avec une vraie réponse", () => {
  assert.equal(classifyIntent("je ne sais pas"), "dontknow");
  assert.equal(classifyIntent("je ne me souviens plus"), "dontknow");
  assert.equal(classifyIntent("passe"), "skip");
  assert.equal(classifyIntent("question suivante"), "skip");
  assert.equal(classifyIntent("ça s'est passé à Sousse"), "answer");
  assert.equal(classifyIntent("Leïla"), "answer");
});
