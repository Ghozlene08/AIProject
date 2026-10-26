/**
 * Tests de l'interface Senior (sans base de données ni Internet) : npm test
 *  - le jeton du senior porte bien son identifiant et le rôle "senior" ;
 *  - sans clé Groq, la reconnaissance vocale renvoie 503 (le navigateur prend alors le relais).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { signSeniorToken } from "../src/middlewares/seniorAuth.js";
import { jwtSecret } from "../src/middlewares/auth.js";
import { baseMime, transcribe } from "../src/services/ai/stt.js";
import { AiProvider } from "../src/models/index.js";

test("le jeton senior contient l'identifiant du profil et le rôle senior", () => {
  const token = signSeniorToken({ _id: "65f000000000000000000002" });
  const payload = jwt.verify(token, jwtSecret());
  assert.equal(payload.sub, "65f000000000000000000002");
  assert.equal(payload.role, "senior");
});

test("le type audio est simplifié (sans le codec)", () => {
  assert.equal(baseMime("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(baseMime("Audio/MP4"), "audio/mp4");
});

test("sans clé GROQ_API_KEY, la reconnaissance vocale passe au secours (503)", async (t) => {
  t.mock.method(AiProvider, "findOne", async () => null);
  const saved = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    await assert.rejects(() => transcribe(Buffer.alloc(2000), "audio/webm"), (err) => err.status === 503);
  } finally {
    if (saved !== undefined) process.env.GROQ_API_KEY = saved;
  }
});

test("un format audio inconnu ou un enregistrement vide est refusé (400)", async (t) => {
  t.mock.method(AiProvider, "findOne", async () => null);
  await assert.rejects(() => transcribe(Buffer.alloc(2000), "video/avi"), (err) => err.status === 400);
  await assert.rejects(() => transcribe(Buffer.alloc(10), "audio/webm"), (err) => err.status === 400);
});
