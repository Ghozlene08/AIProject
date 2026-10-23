import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import app from "../src/app.js";
import { Senior, AiProvider, AiCall, PlatformSettings, UsageEvent } from "../src/models/index.js";
import AssistantMemory from "../src/models/AssistantMemory.js";
import AssistantConversation from "../src/models/AssistantConversation.js";
import { LLM_CALLERS } from "../src/services/ai/providers.js";
import { jwtSecret } from "../src/middlewares/auth.js";

test("API F1 : dialogue LLM, contexte, mémoire, isolation et refus sans authentification", async (t) => {
  const ids = ["000000000000000000000001", "000000000000000000000002"];
  const seniors = Object.fromEntries(ids.map((id) => [id, { _id: id, firstName: "Marie", lastName: "Test", consentAI: true, pairingCode: `CODE${id}` }]));
  const memories = new Map();
  const conversations = new Map();
  const calls = [];
  const providers = [{ key: "groq", name: "Groq", model: "dialogue" }];
  t.mock.method(Senior, "findById", async (id) => seniors[id]);
  t.mock.method(AiProvider, "find", () => Object.assign(Promise.resolve(providers), { sort: async () => providers }));
  t.mock.method(PlatformSettings, "get", async () => ({ privacy: { storePromptPreview: true } }));
  t.mock.method(AiCall, "create", async () => ({}));
  t.mock.method(UsageEvent, "create", async () => ({}));
  t.mock.method(AssistantMemory, "find", ({ senior }) => {
    const query = { lean: async () => memories.get(String(senior)) || [], select: () => query };
    return query;
  });
  t.mock.method(AssistantMemory, "findOneAndUpdate", async (filter, update) => {
    const old = memories.get(String(filter.senior)) || [];
    memories.set(String(filter.senior), [...old.filter((f) => f.key !== filter.key), { key: filter.key, value: update.$set.value }]);
  });
  t.mock.method(AssistantMemory, "deleteMany", async ({ senior }) => { memories.delete(String(senior)); });
  t.mock.method(AssistantConversation, "findOne", ({ senior, expiresAt }) => ({ lean: async () => {
    const value = conversations.get(String(senior)); return value?.expiresAt > expiresAt.$gt ? value : null;
  } }));
  t.mock.method(AssistantConversation, "findOneAndUpdate", async ({ senior }, update) => { conversations.set(String(senior), update.$set); });
  t.mock.method(AssistantConversation, "deleteOne", async ({ senior }) => { conversations.delete(String(senior)); });
  t.mock.method(LLM_CALLERS, "groq", async (provider, system, prompt) => {
    calls.push({ system, prompt, model: provider.model });
    if (system.startsWith("Extrais")) return JSON.stringify([{ key: "doctor", value: prompt.match(/s'appelle (.+)$/)[1] }]);
    return "Voici une réponse du modèle à votre question libre.";
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/senior`;
  const token = (id, role = "senior") => jwt.sign({ sub: id, role, pairing: seniors[id].pairingCode }, jwtSecret());
  const request = (path, body, id = ids[0], method = "POST") => fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token(id)}` }, body: body === undefined ? undefined : JSON.stringify(body),
  });

  assert.equal((await fetch(`${base}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Bonjour" }) })).status, 401);
  assert.equal((await fetch(`${base}/memory`, { headers: { Authorization: `Bearer ${token(ids[0], "aidant")}` } })).status, 401);
  assert.equal((await request("/chat", { message: "" })).status, 400);

  let response = await request("/chat", { message: "Explique pourquoi le ciel est bleu." });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).provider, "Groq");
  assert.equal(calls.length, 1);
  response = await request("/chat", { message: "Et pourquoi change-t-il de couleur le soir ?" });
  assert.equal(response.status, 200);
  assert.match(calls[1].prompt, /Explique pourquoi le ciel/);

  // Un fait n'est pas persisté sans l'autorisation dédiée.
  response = await request("/chat", { message: "Retiens que mon médecin s'appelle Nadia", remember: false });
  assert.equal(response.status, 200); assert.equal(memories.size, 0);
  response = await request("/chat", { message: "Retiens que mon médecin s'appelle Nadia", remember: true });
  assert.equal(response.status, 200); assert.equal((await response.json()).saved, true);
  assert.deepEqual(memories.get(ids[0]), [{ key: "doctor", value: "Nadia" }]);
  assert.ok(!calls.at(-1).prompt.includes("Nadia"));
  response = await request("/memory", undefined, ids[1], "GET");
  assert.deepEqual((await response.json()).facts, []);

  // Les questions sur le médecin passent elles aussi par le LLM.
  const previousCalls = calls.length;
  response = await request("/chat", { message: "Comment s'appelle mon médecin ?" });
  assert.equal(response.status, 200); assert.equal(calls.length, previousCalls + 1);
  assert.match(calls.at(-1).prompt, /doctor/);

  response = await request("/memory", undefined, ids[0], "DELETE");
  assert.equal(response.status, 204); assert.equal(memories.size, 0); assert.equal(conversations.size, 0);
  seniors[ids[0]].consentAI = false;
  const count = calls.length;
  assert.equal((await request("/chat", { message: "Bonjour" })).status, 403);
  assert.equal(calls.length, count);
});

test("la session Senior persiste par cookie HttpOnly et peut être fermée", async (t) => {
  const senior = { _id: "000000000000000000000003", firstName: "Marie", lastName: "Test", pairingCode: "MARIE7", pinHash: await bcrypt.hash("1234", 4) };
  t.mock.method(Senior, "findOne", () => ({ select: async () => senior }));
  t.mock.method(Senior, "findById", async () => senior);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/senior`;
  const response = await fetch(`${base}/pair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "MARIE7", pin: "1234" }) });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Max-Age=2592000/); assert.match(cookie, /Path=\/api\/senior/);
  assert.equal((await response.json()).token, undefined);
  const headers = { Cookie: cookie.split(";")[0] };
  const restored = await fetch(`${base}/session`, { headers });
  assert.equal(restored.status, 200); assert.equal((await restored.json()).firstName, "Marie");
  assert.equal(restored.headers.get("cache-control"), "no-store");
  assert.equal((await fetch(`${base}/session`)).status, 401);
  assert.equal((await fetch(`${base}/logout`, { method: "POST", headers: { ...headers, Origin: "https://site-inconnu.example" } })).status, 403);
  const logout = await fetch(`${base}/logout`, { method: "POST", headers });
  assert.equal(logout.status, 204); assert.match(logout.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
  senior.pairingCode = "NOUVEAU";
  assert.equal((await fetch(`${base}/session`, { headers })).status, 401);
});
