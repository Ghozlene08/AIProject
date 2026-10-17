// Tests unitaires du module IA : npm test (backend)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAnonymizer } from "../src/services/ai/anonymizer.js";
import { validateOutput } from "../src/services/ai/validator.js";

test("anonymise les noms réels et les numéros de téléphone", () => {
  const a = createAnonymizer(["Marie Dupont", "Marie", "Ben Salem"]);
  const out = a.anonymize("Je suis Marie Dupont, appelle le Dr Ben Salem au 71 234 567.");
  assert.ok(!out.includes("Marie"));
  assert.ok(!out.includes("Ben Salem"));
  assert.ok(!out.includes("71 234 567"));
  assert.match(out, /\[PERSONNE_1\].*\[PERSONNE_2\].*\[TEL_1\]/);
});

test("restitue les valeurs réelles dans la réponse", () => {
  const a = createAnonymizer(["Sophie Martin"]);
  const safe = a.anonymize("Appelle Sophie Martin");
  assert.equal(a.deanonymize(`D'accord, j'appelle ${safe.replace("Appelle ", "")}.`), "D'accord, j'appelle Sophie Martin.");
});

test("le même nom reçoit toujours le même jeton", () => {
  const a = createAnonymizer(["Marie"]);
  assert.equal(a.anonymize("Marie et marie"), "[PERSONNE_1] et [PERSONNE_1]");
  assert.deepEqual(a.tokens(), ["[PERSONNE_1]"]);
});

test("le validateur nettoie le HTML et les jetons orphelins", () => {
  assert.equal(validateOutput("<b>Bonjour</b> [PERSONNE_9], comment allez-vous ?"), "Bonjour , comment allez-vous ?");
});

test("le validateur rejette les sorties vides ou dangereuses", () => {
  assert.throws(() => validateOutput(""));
  assert.throws(() => validateOutput(null));
  assert.throws(() => validateOutput("Vous pouvez arrêter votre traitement dès demain."));
});

test("le validateur tronque les réponses trop longues", () => {
  const out = validateOutput("a".repeat(5000));
  assert.ok(out.length <= 4001);
});
