// Script de l'assistant d'agenda (module F2) : phrases naturelles et cohérentes — npm test (backend)
import { test } from "node:test";
import assert from "node:assert/strict";
import { intakeReminder, proposal, rdvPhrase, saved, timePassed } from "../src/services/agenda/phrases.js";

test("un rendez-vous est dit comme une personne le dirait", () => {
  assert.equal(rdvPhrase("Aller chez le cardiologue"), "votre rendez-vous chez le cardiologue");
  assert.equal(rdvPhrase("Rendez-vous chez le dentiste"), "votre rendez-vous chez le dentiste");
  assert.equal(rdvPhrase("Prise de sang au laboratoire"), "prise de sang au laboratoire");
});

test("proposition : question fermée, au vouvoiement, avec « votre »", () => {
  const p = { title: "Appeler ma fille", date: "2099-01-01", time: "10:00", type: "rappel" };
  assert.match(proposal(p, true), /^Je vous rappelle d'appeler votre fille .* à 10 heures, c'est bien ça \?$/);
  assert.match(proposal({ ...p, repeat: { freq: "hebdomadaire", weekdays: [1] } }, true), /tous les lundis à 10 heures/);
  assert.match(proposal({ ...p, title: "Aller chez le cardiologue", type: "rdv" }, true), /^Très bien : votre rendez-vous chez le cardiologue, .*Je le note dans votre agenda \?$/);
});

test("confirmation : conseils puis aidant prévenu, sans supposer son genre", () => {
  const text = saved({ title: "Aller chez le cardiologue", type: "rdv" }, "jeudi à 14 heures", { advice: ["Pensez à emporter votre carte de soins."], notified: "Sophie" }, true);
  assert.equal(text, "C'est noté : votre rendez-vous chez le cardiologue, jeudi à 14 heures. Pensez à emporter votre carte de soins. J'en informe aussi Sophie.");
  assert.doesNotMatch(text, /\belle\b|prévenue/);
});

test("les consignes correspondent à ce que le senior peut faire", () => {
  // La fenêtre de rappel a des boutons : on ne lui demande pas de « dire » quelque chose
  assert.match(intakeReminder("08:30", "Paracétamol 1 g", "Pendant le petit déjeuner"), /^Il est 8 heures et demie\. C'est le moment de prendre votre Paracétamol 1 g, pendant le petit déjeuner\. Touchez « Je l'ai pris »/);
  assert.equal(timePassed("08:00"), "Il est déjà plus de 8 heures. À quelle heure voulez-vous ce rappel ?");
});
