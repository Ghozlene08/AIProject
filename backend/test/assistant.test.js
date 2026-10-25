import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFacts, buildPrompt, explicitNames } from "../src/services/assistant/dialogue.js";

test("les faits doivent être cités par le senior et appartenir aux catégories autorisées", () => {
  const source = "Mon médecin s’appelle Nadia et j’aime le jardinage.";
  const raw = JSON.stringify([{ key: "doctor", value: "Nadia" }, { key: "hobby", value: "jardinage" }, { key: "doctor", value: "Nadia" }, { key: "password", value: "Nadia" }, { key: "familyContact", value: "inventé" }]);
  assert.deepEqual(JSON.parse(validateFacts(raw, source)), [{ key: "doctor", value: "Nadia" }, { key: "hobby", value: "jardinage" }]);
  assert.equal(validateFacts('```json\n[]\n```', source), "[]");
  assert.equal(validateFacts(JSON.stringify([null, { key: "doctor", value: null }, { key: "hobby", value: "" }, { key: "hobby", value: "<script>" }]), source), "[]");
  assert.throws(() => validateFacts("{}", source)); assert.throws(() => validateFacts("[1,2,3,4,5,6]", source)); assert.throws(() => validateFacts("pas JSON", source));
  assert.deepEqual(explicitNames(source), ["Nadia"]);
  assert.deepEqual(explicitNames("Bonjour"), []);
});
test("le contexte contient douze tours au plus et aucun champ MongoDB privé", () => {
  const prompt = JSON.parse(buildPrompt("Et ensuite ?", [{ key: "doctor", value: "Nadia", senior: "privé" }], Array.from({ length: 20 }, (_, i) => ({ role: "user", content: String(i), _id: "privé" })), false));
  assert.equal(prompt.history.length, 12); assert.equal(prompt.history[0].content, "8"); assert.equal(prompt.durableMemoryAllowed, false);
  assert.deepEqual(prompt.memory, [{ key: "doctor", value: "Nadia" }]); assert.ok(!JSON.stringify(prompt).includes("privé"));
});
