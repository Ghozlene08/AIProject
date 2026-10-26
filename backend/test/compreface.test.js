import { test } from "node:test";
import assert from "node:assert/strict";
import { registerSeniorFace, recognizeSenior, deleteSeniorFace } from "../src/services/compreface.service.js";

function configure(t) {
  const before = process.env.COMPREFACE_API_KEY;
  process.env.COMPREFACE_API_KEY = "cle-fictive-pour-tests";
  t.after(() => { if (before === undefined) delete process.env.COMPREFACE_API_KEY; else process.env.COMPREFACE_API_KEY = before; });
}

test("CompreFace code 10 : erreur de configuration lisible et sans clé dans le message", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 404, json: async () => ({ code: 10, message: `Recognition service with API Key ${process.env.COMPREFACE_API_KEY} not found` }) }));
  await assert.rejects(registerSeniorFace(Buffer.from("photo fictive"), "senior-test"), (error) => {
    assert.equal(error.status, 422); assert.equal(error.expose, true);
    assert.match(error.message, /Face Recognition/);
    assert.ok(!error.message.includes(process.env.COMPREFACE_API_KEY)); return true;
  });
});

test("une clé manquante ne provoque aucun appel externe", async (t) => {
  configure(t); delete process.env.COMPREFACE_API_KEY;
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("ne doit pas être appelé"); });
  await assert.rejects(registerSeniorFace(Buffer.from("test"), "senior"), (e) => e.status === 422);
  assert.equal(fetch.mock.callCount(), 0);
});

test("reconnaissance, enregistrement et suppression utilisent le service attendu", async (t) => {
  configure(t);
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => url.endsWith("recognize") ? { result: [{ subjects: [{ subject: "senior", similarity: 0.98 }] }] } : { image_id: "exemple" } };
  });
  assert.deepEqual(await recognizeSenior(Buffer.from("test")), { subject: "senior", similarity: 0.98 });
  assert.deepEqual(await registerSeniorFace(Buffer.from("test"), "id avec espace"), { image_id: "exemple" });
  assert.ok(requests[1].url.endsWith("faces?subject=id%20avec%20espace"));
  assert.equal(requests[1].options.body.get("file").type, "image/jpeg");
  assert.equal(await deleteSeniorFace("senior"), true);
  assert.equal(requests[2].options.method, "DELETE");
});

test("les pannes, images invalides et réponses invalides sont gérées", async (t) => {
  configure(t);
  await assert.rejects(registerSeniorFace(Buffer.alloc(0), "senior"), (e) => e.status === 400);
  t.mock.method(globalThis, "fetch", async () => { throw new Error("erreur réseau privée"); });
  await assert.rejects(recognizeSenior(Buffer.from("test")), (e) => e.status === 503 && !e.message.includes("privée"));
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 400, json: async () => ({ code: 28 }) }));
  await assert.rejects(registerSeniorFace(Buffer.from("test"), "senior"), (e) => e.status === 422);
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ result: [] }) }));
  assert.equal(await recognizeSenior(Buffer.from("test")), null);
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => { throw new Error("JSON invalide"); } }));
  await assert.rejects(recognizeSenior(Buffer.from("test")), (e) => e.status === 502);
});
