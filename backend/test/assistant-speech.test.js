import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { transcribeAudio, synthesizeSpeech, escapeXml, MAX_AUDIO_BYTES } from "../src/services/assistant/speech.js";

test("Whisper reçoit l’audio et la langue française", async () => {
  const text = await transcribeAudio(Buffer.from("audio fictif"), "audio/webm;codecs=opus", { apiKey: "fictive", fetcher: async (url, options) => {
    assert.equal(url, "https://api.groq.com/openai/v1/audio/transcriptions"); assert.equal(options.headers.Authorization, "Bearer fictive");
    assert.equal(options.body.get("model"), "whisper-large-v3-turbo"); assert.equal(options.body.get("language"), "fr");
    assert.equal(await options.body.get("file").text(), "audio fictif");
    return { ok: true, json: async () => ({ text: " Bonjour " }) };
  } });
  assert.equal(text, "Bonjour");
});
test("STT rejette format, taille, clé et transcription invalides et gère les quotas", async () => {
  await assert.rejects(transcribeAudio(Buffer.from("x"), "text/plain"));
  await assert.rejects(transcribeAudio(Buffer.alloc(0), "audio/webm"));
  await assert.rejects(transcribeAudio(Buffer.alloc(MAX_AUDIO_BYTES + 1), "audio/webm"));
  await assert.rejects(transcribeAudio(Buffer.from("x"), "audio/webm", { apiKey: "" }));
  await assert.rejects(transcribeAudio(Buffer.from("x"), "audio/mp4", { apiKey: "fictive", fetcher: async () => ({ ok: false, status: 429 }) }), /429/);
  for (const text of ["", null, "x".repeat(2001)]) await assert.rejects(transcribeAudio(Buffer.from("x"), "audio/ogg", { apiKey: "fictive", fetcher: async () => ({ ok: true, json: async () => ({ text }) }) }));
});
test("Edge TTS utilise la voix française, échappe le SSML et ferme la connexion", async () => {
  let closed = false;
  const audio = await synthesizeSpeech("Bonjour <Marie> & bienvenue.", { createTts: () => ({
    setMetadata: async (voice, format) => { assert.equal(voice, "fr-FR-DeniseNeural"); assert.equal(format, "audio-24khz-48kbitrate-mono-mp3"); },
    toStream: (text) => { assert.equal(text, "Bonjour &lt;Marie&gt; &amp; bienvenue."); return { audioStream: Readable.from([Buffer.from("MP3")]) }; },
    close: () => { closed = true; },
  }) });
  assert.equal(audio.toString(), "MP3"); assert.ok(closed); assert.equal(escapeXml('"\''), "&quot;&apos;");
});
test("TTS gère texte invalide, panne, flux vide et flux trop volumineux", async () => {
  await assert.rejects(synthesizeSpeech("")); await assert.rejects(synthesizeSpeech("x".repeat(4001)));
  let closed = false;
  await assert.rejects(synthesizeSpeech("Bonjour", { createTts: () => ({ setMetadata: async () => { throw new Error("panne"); }, close: () => { closed = true; } }) }));
  assert.ok(closed);
  for (const chunks of [[], [Buffer.alloc(2 * 1024 * 1024 + 1)]]) await assert.rejects(synthesizeSpeech("Bonjour", { createTts: () => ({ setMetadata: async () => {}, toStream: () => ({ audioStream: Readable.from(chunks) }), close: () => {} }) }));
});
