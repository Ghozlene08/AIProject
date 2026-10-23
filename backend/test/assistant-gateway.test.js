import { test } from "node:test";
import assert from "node:assert/strict";
import { generateText } from "../src/services/ai/gateway.js";
import { AiProvider, AiCall, PlatformSettings } from "../src/models/index.js";
import { LLM_CALLERS } from "../src/services/ai/providers.js";

function setup(t, providers) {
  const logs = [];
  t.mock.method(AiProvider, "find", () => ({ sort: async () => providers }));
  t.mock.method(PlatformSettings, "get", async () => ({ privacy: { storePromptPreview: true } }));
  t.mock.method(AiCall, "create", async (entry) => { logs.push(entry); });
  return logs;
}
const request = { task: "assistant-vocal", system: "Réponds en français", prompt: "Bonjour Nadia", names: ["Nadia"], localFallback: () => "Réponse de secours locale" };

test("la passerelle anonymise, restitue et désactive les aperçus pour F1", async (t) => {
  const logs = setup(t, [{ key: "groq", name: "Groq", model: "dialogue" }]);
  t.mock.method(LLM_CALLERS, "groq", async (_p, _s, prompt) => { assert.ok(!prompt.includes("Nadia")); return "Bonjour [PERSONNE_1], comment allez-vous ?"; });
  const result = await generateText({ ...request, storePromptPreview: false });
  assert.match(result.text, /Nadia/);
  assert.equal(logs[0].promptPreview, undefined);
  assert.ok(!JSON.stringify(logs).includes("Nadia"));
});
test("une panne Groq bascule vers Gemini et nettoie les erreurs journalisées", async (t) => {
  const logs = setup(t, [{ key: "groq", name: "Groq" }, { key: "gemini", name: "Gemini" }]);
  t.mock.method(LLM_CALLERS, "groq", async () => { throw new Error("Nadia donnée privée"); });
  t.mock.method(LLM_CALLERS, "gemini", async () => "Voici une réponse générale et utile.");
  const result = await generateText({ ...request, storePromptPreview: false, redactErrors: true });
  assert.equal(result.provider, "Gemini"); assert.equal(result.fallback, true);
  assert.equal(logs[0].status, "erreur"); assert.ok(!JSON.stringify(logs).includes("Nadia"));
});
test("l’extraction essaie le petit modèle puis le grand et valide son JSON", async (t) => {
  setup(t, [{ key: "groq", name: "Groq", model: "principal" }]);
  const models = [];
  t.mock.method(LLM_CALLERS, "groq", async (p) => { models.push(p.model); if (p.model === "petit") throw new Error("quota"); return "[]"; });
  const result = await generateText({ ...request, models: { groq: ["petit", "grand"] }, validate: (raw) => JSON.stringify(JSON.parse(raw)) });
  assert.equal(result.text, "[]"); assert.deepEqual(models, ["petit", "grand"]);
});
test("sans fournisseur le dialogue peut signaler l’indisponibilité sans fausse réponse", async (t) => {
  setup(t, []);
  await assert.rejects(generateText({ ...request, localFallback: () => { throw new Error("Dialogue indisponible"); } }), /Dialogue indisponible/);
});
