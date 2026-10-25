import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Senior } from "../src/models/index.js";
import { createSenior, updateSenior } from "../src/controllers/aidant.controller.js";

test("un échec CompreFace ne sauvegarde ni nouveau profil ni remplacement de photo", async (t) => {
  const key = process.env.COMPREFACE_API_KEY;
  process.env.COMPREFACE_API_KEY = "fictive";
  t.after(() => { if (key === undefined) delete process.env.COMPREFACE_API_KEY; else process.env.COMPREFACE_API_KEY = key; });
  const saves = t.mock.method(Senior.prototype, "save", async () => { throw new Error("Aucune sauvegarde ne doit avoir lieu"); });
  t.mock.method(fs.promises, "readFile", async () => Buffer.from("photo fictive"));
  const removed = [];
  t.mock.method(fs, "unlink", (path, callback) => { removed.push(path); callback(null); });
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 404, json: async () => ({ code: 10 }) }));
  const file = { path: "photo-fictive-non-creee", filename: "nouvelle.jpg", mimetype: "image/jpeg" };
  const user = { _id: "000000000000000000000001" };
  const res = { status: () => { throw new Error("Ne doit pas annoncer un succès"); }, json: () => { throw new Error("Ne doit pas annoncer un succès"); } };
  await assert.rejects(createSenior({ body: { firstName: "Senior", lastName: "Test" }, user, file }, res), (e) => e.status === 422);
  const senior = new Senior({ firstName: "Senior", lastName: "Test", photoUrl: "/uploads/seniors/ancienne.jpg" });
  await assert.rejects(updateSenior({ body: { firstName: "Modifié" }, senior, file }, res), (e) => e.status === 422);
  assert.equal(saves.mock.callCount(), 0);
  assert.deepEqual(removed, [file.path, file.path]);
});
