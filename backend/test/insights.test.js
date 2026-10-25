// Tests de la validation des recommandations rédigées par le LLM : npm test (backend)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLlmInsights } from "../src/services/insights.js";

const FACTS = `Période analysée : 7 derniers jours.
UTILITÉ — réussite des actions vocales : 93,9 % sur 1 114 demandes (seuil 85 %) ; prises confirmées : 77 % sur 496 prises (seuil 80 %).
AIDANTS — alertes créées : 118 ; délivrées : 112 (94,9 %).`;

const item = (over = {}) => ({
  category: "Aidants",
  module: "Alertes",
  severity: "critique",
  title: "Des alertes ne sont pas délivrées",
  observation: "112 alertes délivrées sur 118 (94,9 %).",
  action: "Inviter les aidants à activer Telegram.",
  metric: "94,9 %",
  ...over,
});

test("accepte une réponse valide, même entourée de texte ou de balises", () => {
  const text = "Voici l'analyse :\n```json\n" + JSON.stringify([item()]) + "\n```";
  const out = parseLlmInsights(text, FACTS);
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "critique");
});

test("reconnaît les nombres au format français (espaces fines, virgules)", () => {
  const out = parseLlmInsights(JSON.stringify([item({ observation: "93,9 % de réussite sur 1 114 demandes." })]), FACTS);
  assert.equal(out.length, 1);
});

test("rejette une recommandation qui invente un chiffre", () => {
  const out = parseLlmInsights(JSON.stringify([item({ observation: "Seulement 63 % des alertes sont délivrées." })]), FACTS);
  assert.equal(out.length, 0);
});

test("rejette une catégorie ou une sévérité inconnue, ou un champ manquant", () => {
  const bad = [item({ category: "Marketing" }), item({ severity: "urgentissime" }), item({ action: "" })];
  assert.equal(parseLlmInsights(JSON.stringify(bad), FACTS).length, 0);
});

test("garde les éléments valides d'une liste partiellement invalide", () => {
  const mixed = [item(), item({ observation: "Hausse de 250 % des alertes." })];
  assert.equal(parseLlmInsights(JSON.stringify(mixed), FACTS).length, 1);
});

test("renvoie une liste vide pour un JSON illisible", () => {
  assert.deepEqual(parseLlmInsights("Je ne peux pas répondre.", FACTS), []);
  assert.deepEqual(parseLlmInsights("[{ cassé", FACTS), []);
});
