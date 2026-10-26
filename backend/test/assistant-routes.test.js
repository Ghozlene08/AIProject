import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { Senior, AiProvider, AiCall, PlatformSettings, UsageEvent, User } from "../src/models/index.js";
import AssistantMemory from "../src/models/AssistantMemory.js";
import AssistantConversation from "../src/models/AssistantConversation.js";
import { LLM_CALLERS } from "../src/services/ai/providers.js";
import { jwtSecret } from "../src/middlewares/auth.js";
import { fallbackIntent } from "../src/services/assistant/actions.js";
import Medication from "../src/models/Medication.js";
import Event from "../src/models/Event.js";

test("F1 utilise le jeton facial Senior : dialogue libre, contexte, consentement et mémoire isolée", async (t) => {
  const ids = ["000000000000000000000001", "000000000000000000000002"];
  const seniors = Object.fromEntries(ids.map((id) => [id, { _id: id, firstName: "Marie", lastName: "Test", consentAI: true }]));
  const memories = new Map(); const conversations = new Map(); const calls = [];
  const providers = [{ key: "groq", name: "Groq", capability: "llm", model: "test" }];
  t.mock.method(Senior, "findById", async (id) => seniors[id]);
  t.mock.method(User, "find", () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(AiProvider, "find", () => ({ sort: async () => providers, lean: async () => providers }));
  t.mock.method(AiProvider, "findOne", async () => ({ simulateFailure: true }));
  t.mock.method(AiCall, "create", async () => ({}));
  t.mock.method(PlatformSettings, "get", async () => ({ privacy: { storePromptPreview: true } }));
  t.mock.method(UsageEvent, "create", async () => ({}));
  const recordQueries = [];
  const records = (filter, data) => { recordQueries.push(filter); const query = { select: () => query, sort: () => query, limit: () => query, lean: async () => data }; return query; };
  t.mock.method(Medication, "find", (filter) => records(filter, [{ name: "Traitement Test", times: ["08:00"] }]));
  t.mock.method(Event, "find", (filter) => records(filter, []));
  const originalFetch = globalThis.fetch;
  let weatherUnavailable = false;
  t.mock.method(globalThis, "fetch", (url, options) => {
    const parsed = new URL(url);
    if (parsed.hostname === "geocoding-api.open-meteo.com") return Promise.resolve(Response.json({ results: [{ name: "Tunis", country: "Tunisie", latitude: 36.8, longitude: 10.18 }] }));
    if (parsed.hostname === "api.open-meteo.com") return weatherUnavailable ? Promise.reject(new Error("offline")) : Promise.resolve(Response.json({ current: { temperature_2m: 23, weather_code: 0 }, daily: { time: ["2026-10-26", "2026-10-27"], temperature_2m_min: [17, 18], temperature_2m_max: [25, 26], precipitation_probability_max: [10, 20], weather_code: [0, 2] } }));
    return originalFetch(url, options);
  });
  t.mock.method(AssistantMemory, "find", ({ senior }) => { const q = { lean: async () => memories.get(String(senior)) || [], select: () => q }; return q; });
  t.mock.method(AssistantMemory, "findOneAndUpdate", async ({ senior, key }, update) => {
    const values = memories.get(String(senior)) || []; memories.set(String(senior), [...values.filter((f) => f.key !== key), { key, value: update.$set.value }]);
  });
  t.mock.method(AssistantMemory, "deleteMany", async ({ senior }) => { memories.delete(String(senior)); });
  t.mock.method(AssistantConversation, "findOne", ({ senior, expiresAt }) => ({ lean: async () => {
    const value = conversations.get(String(senior)); return value?.expiresAt > expiresAt.$gt ? value : null;
  } }));
  t.mock.method(AssistantConversation, "findOneAndUpdate", async ({ senior }, update) => { conversations.set(String(senior), update.$set); });
  t.mock.method(AssistantConversation, "deleteOne", async ({ senior }) => { conversations.delete(String(senior)); });
  t.mock.method(LLM_CALLERS, "groq", async (provider, system, prompt) => {
    calls.push({ model: provider.model, system, prompt });
    if (system.startsWith("Extrais")) return JSON.stringify([{ key: "doctor", value: prompt.match(/s'appelle (.+)$/)[1] }]);
    const data = JSON.parse(prompt);
    if (system.startsWith("Classe")) {
      if (data.message === "Tunis" || data.message === "Et demain ?") return JSON.stringify({ type: "weather", city: "Tunis", day: data.message === "Et demain ?" ? "tomorrow" : "today" });
      return JSON.stringify(fallbackIntent(data.message));
    }
    if (data.message.includes("médecin ?")) {
      const doctor = data.memory.find((f) => f.key === "doctor");
      return doctor ? `Votre médecin s'appelle ${doctor.value}.` : "Je ne connais pas le nom de votre médecin.";
    }
    return "Voici une réponse du modèle à votre question libre.";
  });

  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/senior/assistant`;
  const token = (id, role = "senior") => jwt.sign({ sub: id, role }, jwtSecret());
  const request = (path, body, id = ids[0], method = "POST") => fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token(id)}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal((await fetch(`${base}/conversation`)).status, 401);
  assert.equal((await fetch(`${base}/conversation`, { headers: { Authorization: `Bearer ${token(ids[0], "aidant")}` } })).status, 401);
  assert.equal((await request("/chat", { message: "" })).status, 400);
  assert.equal((await request("/chat", { message: "Bonjour", remember: "oui" })).status, 400);
  const session = await request("/session", undefined, ids[0], "GET");
  assert.equal(session.status, 200); assert.equal((await session.json()).senior._id, ids[0]);

  let response = await request("/chat", { message: "Explique pourquoi le ciel est bleu.", channel: "voix" });
  assert.equal(response.status, 200); assert.equal((await response.json()).provider, "Groq");
  assert.equal(calls.length, 2);
  response = await request("/chat", { message: "Et pourquoi est-il rouge le soir ?" });
  assert.equal(response.status, 200); assert.match(calls.at(-1).prompt, /Explique pourquoi le ciel/);

  await request("/chat", { message: "Retiens que mon médecin s'appelle Nadia", remember: false });
  assert.equal(memories.size, 0);
  response = await request("/chat", { message: "Retiens que mon médecin s'appelle Nadia", remember: true });
  assert.equal(response.status, 200); assert.equal((await response.json()).saved, true);
  assert.deepEqual(memories.get(ids[0]), [{ key: "doctor", value: "Nadia" }]);
  assert.ok(!calls.at(-1).prompt.includes("Nadia"));
  response = await request("/chat", { message: "Comment s'appelle mon médecin ?" });
  assert.match((await response.json()).text, /Nadia/);
  response = await request("/chat", { message: "Comment s'appelle mon médecin ?" }, ids[1]);
  assert.match((await response.json()).text, /ne connais pas/);
  response = await request("/memory", undefined, ids[1], "GET");
  assert.deepEqual((await response.json()).facts, []);
  response = await request("/conversation", undefined, ids[0], "GET");
  assert.ok((await response.json()).turns.length > 0);
  assert.equal((await request("/memory", undefined, ids[0], "DELETE")).status, 204);
  assert.equal(memories.has(ids[0]), false); assert.equal(conversations.has(ids[0]), false);

  response = await request("/chat", { message: "Rappelle-moi mes médicaments", channel: "voix" });
  assert.deepEqual((await response.json()).action, { type: "navigate", target: "medications" });
  response = await request("/medications", undefined, ids[1], "GET");
  assert.equal((await response.json()).medications[0].name, "Traitement Test");
  assert.equal(recordQueries.at(-1).senior, ids[1]); assert.equal(recordQueries.at(-1).active, true);
  response = await request("/agenda", undefined, ids[0], "GET");
  assert.deepEqual((await response.json()).events, []); assert.equal(recordQueries.at(-1).senior, ids[0]);
  response = await request("/chat", { message: "Quelle est la météo ?" });
  assert.match((await response.json()).text, /quelle ville/);
  response = await request("/chat", { message: "Tunis" });
  const weather = await response.json(); assert.match(weather.text, /23 degrés/); assert.equal(weather.sourceUrl, "https://open-meteo.com/");
  response = await request("/chat", { message: "Et demain ?" });
  assert.match((await response.json()).text, /Demain.*18 et 26/);
  response = await request("/conversation", undefined, ids[0], "GET");
  const weatherHistory = (await response.json()).turns;
  assert.equal(weatherHistory.at(-1).sourceUrl, "https://open-meteo.com/"); assert.equal(weatherHistory.at(-1).action, undefined);
  assert.equal(weatherHistory.at(-1).weatherDate, "2026-10-27");
  seniors[ids[0]].city = "Tunis";
  response = await request("/chat", { message: "La météo ?" });
  assert.match((await response.json()).text, /23 degrés/);
  weatherUnavailable = true;
  response = await request("/chat", { message: "La météo ?" });
  const unavailable = await response.json(); assert.equal(unavailable.fallback, true); assert.match(unavailable.text, /réessayer/); assert.equal(unavailable.sourceUrl, undefined);
  response = await request("/chat", { message: "La météo après-demain ?" });
  assert.match((await response.json()).text, /aujourd’hui ou de demain/);

  // Les erreurs vocales demandent explicitement le secours navigateur.
  response = await fetch(`${base}/stt`, { method: "POST", headers: { Authorization: `Bearer ${token(ids[0])}`, "Content-Type": "audio/webm" }, body: Buffer.from("fictif") });
  assert.equal(response.status, 503); assert.equal((await response.json()).fallback, "webspeech");
  response = await request("/tts", { text: "Bonjour, comment allez-vous ?" });
  assert.equal(response.status, 503); assert.equal((await response.json()).fallback, "browsertts");
  assert.equal((await request("/speech-event", { capability: "tts", status: "succes" })).status, 204);
  assert.equal((await request("/speech-event", { capability: "inconnu", status: "succes" })).status, 400);
  seniors[ids[0]].consentAI = false;
  const previous = calls.length;
  assert.equal((await request("/chat", { message: "Bonjour" })).status, 403); assert.equal(calls.length, previous);
});
