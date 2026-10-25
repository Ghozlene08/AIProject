import { test } from "node:test";
import assert from "node:assert/strict";
import { generateText } from "../src/services/ai/gateway.js";
import { AiCall, AiProvider, PlatformSettings } from "../src/models/index.js";
import { LLM_CALLERS } from "../src/services/ai/providers.js";

function setup(t, providers) {
  const logs = [];
  t.mock.method(AiProvider, "find", () => ({ sort: async () => providers }));
  t.mock.method(PlatformSettings, "get", async () => ({ privacy: { storePromptPreview: true } }));
  t.mock.method(AiCall, "create", async (entry) => { logs.push(entry); });
  return logs;
}
const options = { task: "assistant-vocal", system: "Réponds en français", prompt: "Bonjour Nadia", names: ["Nadia"], storePromptPreview: false, redactErrors: true, localFallback: () => "Réponse locale de dernier recours" };
test("F1 anonymise les noms, les restitue et ne journalise pas les prompts", async (t) => {
  const logs = setup(t, [{ key: "groq", name: "Groq" }]);
  t.mock.method(LLM_CALLERS, "groq", async (_p, _s, prompt) => { assert.ok(!prompt.includes("Nadia")); return "Bonjour [PERSONNE_1], comment allez-vous ?"; });
  assert.match((await generateText(options)).text, /Nadia/);
  assert.equal(logs[0].promptPreview, undefined); assert.ok(!JSON.stringify(logs).includes("Nadia"));
});
test("une panne ou une réponse rejetée chez Groq bascule vers Gemini", async (t) => {
  const logs = setup(t, [{ key: "groq", name: "Groq" }, { key: "gemini", name: "Gemini" }]);
  t.mock.method(LLM_CALLERS, "groq", async () => { throw new Error("Nadia, information privée"); });
  t.mock.method(LLM_CALLERS, "gemini", async () => "Voici une réponse générale et utile.");
  const result = await generateText(options); assert.equal(result.provider, "Gemini"); assert.equal(result.fallback, true); assert.ok(!JSON.stringify(logs).includes("Nadia"));
});
test("l’extraction essaie le petit modèle puis le modèle de dialogue", async (t) => {
  setup(t, [{ key: "groq", name: "Groq" }]); const tried = [];
  t.mock.method(LLM_CALLERS, "groq", async (p) => { tried.push(p.model); if (p.model === "petit") throw new Error("quota"); return "[]"; });
  const result = await generateText({ ...options, models: { groq: ["petit", "grand"] }, validate: (raw) => JSON.stringify(JSON.parse(raw)) });
  assert.equal(result.text, "[]"); assert.deepEqual(tried, ["petit", "grand"]);
});
test("sans LLM configuré F1 signale l’indisponibilité, sans dialogue fictif", async (t) => {
  setup(t, []);
  await assert.rejects(generateText({ ...options, localFallback: () => { throw new Error("Dialogue indisponible"); } }), /Dialogue indisponible/);
});
