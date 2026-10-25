// Tests unitaires des calculs d'indicateurs : npm test (backend)
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskName, percentile, periodOf } from "../src/services/analytics.js";

test("percentile : P50 et P95 sur une série connue", () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
  assert.equal(percentile(values, 50), 50);
  assert.equal(percentile(values, 95), 95);
  assert.equal(percentile(values, 100), 100);
});

test("percentile : série vide ou à un seul élément", () => {
  assert.equal(percentile([], 95), null);
  assert.equal(percentile([3200], 95), 3200);
});

test("percentile : ne modifie pas le tableau d'origine", () => {
  const values = [5, 1, 3];
  percentile(values, 50);
  assert.deepEqual(values, [5, 1, 3]);
});

test("periodOf : 7 jours se terminant aujourd'hui, période précédente contiguë", () => {
  const end = new Date(2026, 9, 18, 15, 0);
  const p = periodOf(7, end);
  assert.equal(p.days, 7);
  assert.equal(p.from.getDate(), 12);
  assert.equal(p.from.getHours(), 0);
  assert.equal(p.prevFrom.getDate(), 5);
  assert.equal(p.prevTo.getTime(), p.from.getTime() - 1);
});

test("periodOf : bornes de la durée (1 à 90 jours)", () => {
  assert.equal(periodOf(500).days, 90);
  assert.equal(periodOf(0).days, 7);
  assert.equal(periodOf("30").days, 30);
});

test("maskName : abrège le nom de famille si demandé", () => {
  const s = { firstName: "Marie", lastName: "Dupont" };
  assert.equal(maskName(s, true), "Marie D.");
  assert.equal(maskName(s, false), "Marie Dupont");
});
