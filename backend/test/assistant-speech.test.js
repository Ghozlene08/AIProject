import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { transcribeAudio, synthesizeSpeech, escapeXml, MAX_AUDIO_BYTES } from "../src/services/assistantSpeech.js";

test("STT envoie le fichier audio à Whisper Groq avec la langue française", async () => {
  const text = await transcribeAudio(Buffer.from("audio"), "audio/webm;codecs=opus", {
    apiKey: "cle-fictive", fetcher: async (url, options) => {
      assert.equal(url, "https://api.groq.com/openai/v1/audio/transcriptions");
      assert.equal(options.headers.Authorization, "Bearer cle-fictive");
      assert.equal(options.body.get("model"), "whisper-large-v3-turbo");
      assert.equal(options.body.get("language"), "fr");
      assert.equal(options.body.get("file").name, "demande.webm");
      assert.equal(await options.body.get("file").text(), "audio");
      return { ok: true, json: async () => ({ text: "  Pourquoi le ciel est bleu ?  " }) };
    },
  });
  assert.equal(text, "Pourquoi le ciel est bleu ?");
});

test("STT rejette un format inconnu, audio vide, surdimensionné ou une clé absente", async () => {
  await assert.rejects(transcribeAudio(Buffer.from("x"), "text/plain"), /Audio invalide/);
  await assert.rejects(transcribeAudio(Buffer.alloc(0), "audio/webm"), /Audio invalide/);
  await assert.rejects(transcribeAudio(Buffer.alloc(MAX_AUDIO_BYTES + 1), "audio/webm"), /Audio invalide/);
  await assert.rejects(transcribeAudio(Buffer.from("x"), "audio/webm", { apiKey: "" }), /Clé Groq absente/);
});

test("STT signale les pannes et les transcriptions invalides sans exposer les erreurs fournisseur", async () => {
  const options = { apiKey: "fictive", fetcher: async () => ({ ok: false, status: 429 }) };
  await assert.rejects(transcribeAudio(Buffer.from("x"), "audio/mp4", options), /429/);
  for (const text of ["", null, "x".repeat(2001)]) {
    await assert.rejects(transcribeAudio(Buffer.from("x"), "audio/ogg", { ...options, fetcher: async () => ({ ok: true, json: async () => ({ text }) }) }), /Transcription/);
  }
});

test("Edge TTS produit un MP3 en français et échappe le SSML utilisateur", async () => {
  let closed = false;
  const audio = await synthesizeSpeech("Bonjour <Marie> & bienvenue.", { createTts: () => ({
    setMetadata: async (voice, format) => { assert.equal(voice, "fr-FR-DeniseNeural"); assert.equal(format, "audio-24khz-48kbitrate-mono-mp3"); },
    toStream: (text, options) => { assert.equal(text, "Bonjour &lt;Marie&gt; &amp; bienvenue."); assert.equal(options.rate, 0.9); return { audioStream: Readable.from([Buffer.from("mp3")]) }; },
    close: () => { closed = true; },
  }) });
  assert.equal(audio.toString(), "mp3"); assert.equal(closed, true);
  assert.equal(escapeXml('"test\''), "&quot;test&apos;");
});

test("Edge TTS ferme la connexion après erreur et rejette audio vide ou texte invalide", async () => {
  await assert.rejects(synthesizeSpeech(""), /Texte TTS invalide/);
  await assert.rejects(synthesizeSpeech("x".repeat(4001)), /Texte TTS invalide/);
  let closed = false;
  await assert.rejects(synthesizeSpeech("Bonjour", { createTts: () => ({
    setMetadata: async () => { throw new Error("panne"); }, close: () => { closed = true; },
  }) }), /panne/);
  assert.equal(closed, true);
  await assert.rejects(synthesizeSpeech("Bonjour", { createTts: () => ({
    setMetadata: async () => {}, toStream: () => ({ audioStream: Readable.from([]) }), close: () => {},
  }) }), /Audio TTS vide/);
  await assert.rejects(synthesizeSpeech("Bonjour", { createTts: () => ({
    setMetadata: async () => {}, toStream: () => ({ audioStream: Readable.from([Buffer.alloc(2 * 1024 * 1024 + 1)]) }), close: () => {},
  }) }), /volumineux/);
});
