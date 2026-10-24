import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFact, validateFacts, buildDialoguePrompt } from "../src/services/assistant.js";
test("mémoire volontaire, ponctuation et valeurs invalides", () => {
  assert.deepEqual(extractFact("Retiens que mon médecin s'appelle Nadia."), { key: "doctor", value: "Nadia" });
  assert.deepEqual(extractFact("Retiens que mon médecin s’appelle Nadia."), { key: "doctor", value: "Nadia" });
  assert.equal(extractFact("Mon médecin s'appelle Nadia"), null);
  assert.equal(extractFact("Retiens que mon médecin s'appelle <script>"), null);
  assert.equal(extractFact(`Retiens que mon médecin s'appelle ${"x".repeat(101)}`), null);
});
test("les faits extraits doivent être autorisés, bornés et présents dans la phrase", () => {
  const source = "Mon médecin est Nadia et j’aime le jardinage.";
  const facts = validateFacts(JSON.stringify([
    { key: "doctor", value: "Nadia" }, { key: "hobby", value: "jardinage" },
    { key: "doctor", value: "Nadia" }, { key: "password", value: "Nadia" },
    { key: "familyContact", value: "invention" },
  ]), source);
  assert.deepEqual(JSON.parse(facts), [{ key: "doctor", value: "Nadia" }, { key: "hobby", value: "jardinage" }]);
  assert.equal(validateFacts('```json\n[]\n```', source), "[]");
  assert.equal(validateFacts(JSON.stringify([{ key: "preferredName", value: null }, { key: "preferredLanguage", value: "" }, null]), source), "[]");
  assert.throws(() => validateFacts("{}", source), /Extraction/);
  assert.throws(() => validateFacts("[1,2,3,4,5,6]", source), /Extraction/);
  assert.throws(() => validateFacts("non JSON", source));
});
test("le dialogue inclut les faits et les douze derniers tours, sans champs MongoDB", () => {
  const prompt = JSON.parse(buildDialoguePrompt("Et ensuite ?", [{ key: "hobby", value: "jardinage", senior: "secret" }], Array.from({ length: 20 }, (_, i) => ({ role: "user", content: String(i), _id: "secret" }))));
  assert.equal(prompt.message, "Et ensuite ?");
  assert.equal(prompt.history.length, 12);
  assert.equal(prompt.history[0].content, "8");
  assert.deepEqual(prompt.memory, [{ key: "hobby", value: "jardinage" }]);
  assert.ok(!JSON.stringify(prompt).includes("secret"));
});
