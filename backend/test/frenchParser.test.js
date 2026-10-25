// Tests de l'analyse des demandes d'agenda en français : npm test (backend)
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectIntent, extractTitle, parseDate, parseTime, parseYesNo, ruleParse } from "../src/services/agenda/frenchParser.js";

const NOW = new Date(2026, 9, 18, 10, 0); // dimanche 18 octobre 2026, 10 h

test("heures en chiffres et en lettres", () => {
  assert.equal(parseTime("à 20h", NOW).time, "20:00");
  assert.equal(parseTime("à 8 h 30", NOW).time, "08:30");
  assert.equal(parseTime("vers 14 heures 15", NOW).time, "14:15");
  assert.equal(parseTime("à huit heures et demie", NOW).time, "08:30");
  assert.equal(parseTime("à vingt heures", NOW).time, "20:00");
  assert.equal(parseTime("à midi", NOW).time, "12:00");
  assert.equal(parseTime("à 9 heures moins le quart", NOW).time, "08:45");
});

test("soir / après-midi ajoutent 12 heures", () => {
  assert.equal(parseTime("à 8 heures du soir", NOW).time, "20:00");
  assert.equal(parseTime("ce soir à 9 heures", NOW).time, "21:00");
  assert.equal(parseTime("à 3 heures de l'après-midi", NOW).time, "15:00");
});

test("heures relatives", () => {
  const r = parseTime("dans 2 heures", NOW);
  assert.equal(r.time, "12:00");
  assert.equal(r.date, "2026-10-18");
  assert.equal(parseTime("dans trente minutes", NOW).time, "10:30");
});

test("aucune heure inventée", () => {
  assert.equal(parseTime("rappelle-moi d'appeler ma fille", NOW), null);
});

test("dates relatives, jours de la semaine et dates explicites", () => {
  assert.equal(parseDate("demain", NOW), "2026-10-19");
  assert.equal(parseDate("après-demain", NOW), "2026-10-20");
  assert.equal(parseDate("aujourd'hui", NOW), "2026-10-18");
  assert.equal(parseDate("lundi", NOW), "2026-10-19");
  assert.equal(parseDate("samedi", NOW), "2026-10-24");
  assert.equal(parseDate("dimanche", NOW), "2026-10-25"); // dit un dimanche : la semaine prochaine
  assert.equal(parseDate("le 25 octobre", NOW), "2026-10-25");
  assert.equal(parseDate("le 3", NOW), "2026-11-03");
  assert.equal(parseDate("rien", NOW), null);
});

test("intentions", () => {
  assert.equal(detectIntent("Qu'ai-je prévu aujourd'hui ?"), "consulter_agenda");
  assert.equal(detectIntent("Qu'est-ce que j'ai demain ?"), "consulter_agenda");
  assert.equal(detectIntent("Rappelle-moi de prendre mon médicament à 20h"), "creer_rappel");
  assert.equal(detectIntent("J'ai pris mon médicament"), "confirmer_prise");
  assert.equal(detectIntent("Quel temps fait-il ?"), "autre");
});

test("intitulé du rappel sans formule ni horaire", () => {
  assert.equal(extractTitle("Rappelle-moi de prendre mon médicament à 20h"), "Prendre mon médicament");
  assert.equal(extractTitle("Rappelle-moi d'appeler ma fille demain à 10 heures"), "Appeler ma fille");
  assert.equal(extractTitle("Fais-moi penser à arroser les plantes ce soir"), "Arroser les plantes");
});

test("cas de démonstration : rappel à 20 h créé pour aujourd'hui", () => {
  const r = ruleParse("Rappelle-moi de prendre mon médicament à 20h.", NOW);
  assert.deepEqual(r, { intent: "creer_rappel", date: "2026-10-18", time: "20:00", title: "Prendre mon médicament", type: "rappel" });
});

test("heure passée sans jour : le rappel est pour demain", () => {
  assert.equal(ruleParse("Rappelle-moi d'appeler Sophie à 8 heures", NOW).date, "2026-10-19");
});

test("type rendez-vous détecté", () => {
  assert.equal(ruleParse("Note que j'ai rendez-vous chez le dentiste jeudi à 15 heures", NOW).type, "rdv");
});

test("oui / non", () => {
  assert.equal(parseYesNo("Oui, c'est ça"), "oui");
  assert.equal(parseYesNo("D'accord"), "oui");
  assert.equal(parseYesNo("Non, annule"), "non");
  assert.equal(parseYesNo("Peut-être"), null);
});
