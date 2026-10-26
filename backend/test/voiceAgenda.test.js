// Tests des réponses vocales de l'agenda (module F2) : npm test (backend)
import { test } from "node:test";
import assert from "node:assert/strict";
import { capitalize, speakAgenda, speakDay, speakTime, toSecondPerson } from "../src/services/agenda/voiceAgenda.js";

const NOW = new Date(2026, 9, 26, 9, 0); // lundi 26 octobre 2026

test("heures dites naturellement", () => {
  assert.equal(speakTime("20:00"), "20 heures");
  assert.equal(speakTime("08:30"), "8 heures et demie");
  assert.equal(speakTime("10:15"), "10 heures et quart");
  assert.equal(speakTime("14:05"), "14 heures 5");
  assert.equal(speakTime("01:00"), "1 heure");
  assert.equal(speakTime("12:00"), "midi");
  assert.equal(speakTime("00:00"), "minuit");
});

test("jours relatifs puis date complète", () => {
  assert.equal(speakDay("2026-10-26", NOW), "aujourd'hui");
  assert.equal(speakDay("2026-10-27", NOW), "demain");
  assert.equal(speakDay("2026-10-28", NOW), "après-demain");
  assert.equal(speakDay("2026-10-25", NOW), "hier");
  assert.equal(speakDay("2026-10-29", NOW), "jeudi 29 octobre");
});

test("l'assistant répond à la deuxième personne", () => {
  assert.equal(toSecondPerson("Appeler ma fille"), "Appeler votre fille");
  assert.equal(toSecondPerson("Prendre mon médicament et mes lunettes"), "Prendre votre médicament et vos lunettes");
  assert.equal(capitalize("appeler"), "Appeler");
  assert.equal(capitalize(""), "");
});

test("journée vide : réponse rassurante", () => {
  assert.equal(speakAgenda([], "2026-10-26", NOW), "Aujourd'hui, vous n'avez rien de prévu. Profitez bien de votre journée !");
});

test("journée chargée : chaque élément avec son heure et son état", () => {
  const items = [
    { kind: "prise", time: "08:30", detail: "Paracétamol 1 g", status: "confirme" },
    { kind: "prise", time: "12:00", detail: "Vitamine D", status: "manque" },
    { kind: "evenement", time: "14:00", title: "Rendez-vous médical", detail: "Cabinet Dr. Ben Salem — Cardiologie", status: "prevu" },
    { kind: "evenement", time: "18:00", title: "Appeler ma fille", detail: null, status: "prevu" },
  ];
  const text = speakAgenda(items, "2026-10-27", NOW);
  assert.match(text, /^Demain, vous avez 4 choses de prévues\./);
  assert.match(text, /À 8 heures et demie, votre Paracétamol 1 g : c'est déjà fait\./);
  assert.match(text, /À midi, votre Vitamine D : cette prise n'a pas été confirmée\./);
  // Le tiret long d'un lieu est remplacé par une virgule (mieux prononcé)
  assert.match(text, /À 14 heures, rendez-vous médical, cabinet Dr\. Ben Salem, Cardiologie\./);
  assert.match(text, /À 18 heures, appeler votre fille\./);
});

test("un seul élément : accord au singulier", () => {
  const text = speakAgenda([{ kind: "evenement", time: "10:00", title: "Atelier mémoire", detail: null, status: "prevu" }], "2026-10-26", NOW);
  assert.match(text, /^Aujourd'hui, vous avez une chose de prévue\./);
});
