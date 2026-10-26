// Tests de l'analyse des demandes d'agenda en français : npm test (backend)
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectIntent, extractTitle, parseDate, parseTime, parseYesNo, ruleParse } from "../src/services/agenda/frenchParser.js";
import { isMedical, nextOccurrence, parseRecurrence, preparationAdvice, speakRepeat } from "../src/services/agenda/frenchParser.js";

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
  assert.deepEqual(r, { intent: "creer_rappel", date: "2026-10-18", time: "20:00", title: "Prendre mon médicament", type: "rappel", repeat: null, medical: false });
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

test("rappels répétés : rythme et jours", () => {
  assert.deepEqual(parseRecurrence("Rappelle-moi tous les jours à 9 heures de prendre mon médicament"), { freq: "quotidien", weekdays: [] });
  assert.deepEqual(parseRecurrence("chaque matin à 8h"), { freq: "quotidien", weekdays: [] });
  assert.deepEqual(parseRecurrence("tous les lundis d'appeler ma fille"), { freq: "hebdomadaire", weekdays: [1] });
  assert.deepEqual(parseRecurrence("tous les mardis et jeudis à 18h"), { freq: "hebdomadaire", weekdays: [2, 4] });
  assert.deepEqual(parseRecurrence("toutes les semaines"), { freq: "hebdomadaire", weekdays: null });
  assert.equal(parseRecurrence("Rappelle-moi lundi d'appeler ma fille"), null);
  assert.equal(extractTitle("Rappelle-moi tous les lundis d'appeler ma fille à 10 heures"), "Appeler ma fille");
  assert.equal(speakRepeat({ freq: "hebdomadaire", weekdays: [2, 4] }), "tous les mardis et jeudis");
});

test("première occurrence d'un rappel répété", () => {
  const monday9 = new Date(2026, 9, 26, 9, 0); // lundi
  assert.equal(nextOccurrence({ freq: "quotidien", weekdays: [] }, "08:00", monday9), "2026-10-27");
  assert.equal(nextOccurrence({ freq: "quotidien", weekdays: [] }, "10:00", monday9), "2026-10-26");
  assert.equal(nextOccurrence({ freq: "hebdomadaire", weekdays: [4] }, "15:00", monday9), "2026-10-29");
});

test("santé : détection et conseil pratique (pas de conseil médical)", () => {
  assert.equal(isMedical("Rendez-vous chez le cardiologue"), true);
  assert.equal(isMedical("Prise de sang au laboratoire"), true);
  assert.equal(isMedical("Acheter du pain"), false);
  assert.match(preparationAdvice("prise de sang vendredi"), /à jeun/);
  assert.match(preparationAdvice("scanner du genou"), /ordonnance/);
  assert.equal(preparationAdvice("Arroser les plantes"), null);
});
