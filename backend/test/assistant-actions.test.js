import { test } from "node:test";
import assert from "node:assert/strict";
import { validateIntent, fallbackIntent, navigationReply } from "../src/services/assistant/actions.js";
import { getWeather, WEATHER_SOURCE } from "../src/services/assistant/weather.js";

test("Les actions sont limitées aux rubriques connues et les villes doivent venir du senior", () => {
  assert.deepEqual(JSON.parse(validateIntent('{"type":"navigate","target":"medications","url":"javascript:alert(1)"}', "")), { type: "navigate", target: "medications" });
  assert.throws(() => validateIntent('{"type":"navigate","target":"https://example.com"}', ""));
  assert.throws(() => validateIntent('{"type":"send-sos"}', ""));
  assert.throws(() => validateIntent('{"type":"weather","city":"Paris","day":"today"}', "Météo Tunis"));
  assert.throws(() => validateIntent('{"type":"weather","city":"Tunis","day":"nextweek"}', "Tunis"));
  assert.deepEqual(JSON.parse(validateIntent('{"type":"weather","city":"Tunis","day":"tomorrow"}', "À Tunis, et demain ?")), { type: "weather", city: "Tunis", day: "tomorrow" });
  assert.match(navigationReply("medications"), /aidant/);
  assert.match(navigationReply("sos"), /Confirmez/);
  assert.throws(() => navigationReply("unknown"));
  assert.deepEqual(fallbackIntent("Rappelle-moi mes médicaments"), { type: "navigate", target: "medications" });
  assert.deepEqual(fallbackIntent("N’ouvre pas mes médicaments"), { type: "dialogue" });
  assert.deepEqual(fallbackIntent("Explique ce qu’est un médicament"), { type: "dialogue" });
  assert.deepEqual(fallbackIntent("Quel temps fait-il à Tunis demain ?"), { type: "weather", city: "Tunis", day: "tomorrow" });
  assert.equal(fallbackIntent("La météo après-demain ?").day, "unsupported");
});

const forecast = () => ({ current: { temperature_2m: 22.2, weather_code: 0 }, daily: { time: ["2026-10-26", "2026-10-27"], temperature_2m_min: [16, 17], temperature_2m_max: [25, 26], precipitation_probability_max: [0, 60], weather_code: [0, 61] } });
const geo = { results: [{ name: "Tunis", country: "Tunisie", latitude: 36.8, longitude: 10.18 }] };
test("La météo utilise des températures réelles simulées et distingue demain d’aujourd’hui", async () => {
  const urls = [];
  const fetcher = async (url) => { urls.push(new URL(url)); return Response.json(url.hostname.startsWith("geocoding") ? geo : forecast()); };
  const result = await getWeather("Tunis", "today", { fetcher });
  assert.match(result.text, /22 degrés/); assert.match(result.text, /Tunis, Tunisie/); assert.equal(result.sourceUrl, WEATHER_SOURCE);
  assert.equal(urls[0].hostname, "geocoding-api.open-meteo.com"); assert.equal(urls[1].hostname, "api.open-meteo.com");
  assert.equal(urls[0].searchParams.get("name"), "Tunis");
  const tomorrow = await getWeather("Tunis", "tomorrow", { fetcher });
  assert.match(tomorrow.text, /Demain.*pluie.*17 et 26/); assert.match(tomorrow.text, /60 %/); assert.equal(tomorrow.weatherDate, "2026-10-27");
});
test("Ville introuvable, données absentes, nulles ou panne : aucune météo inventée", async () => {
  const unknown = await getWeather("Inconnue", "today", { fetcher: async () => Response.json({ results: [] }) });
  assert.match(unknown.text, /préciser/); assert.equal(unknown.sourceUrl, undefined);
  await assert.rejects(getWeather("", "today"));
  await assert.rejects(getWeather("Tunis", "today", { fetcher: async () => { throw new Error("offline"); } }));
  await assert.rejects(getWeather("Tunis", "today", { fetcher: async () => new Response("", { status: 500 }) }));
  for (const change of [(f) => { f.current.temperature_2m = null; }, (f) => { f.daily.temperature_2m_min[0] = null; }, (f) => { f.daily.precipitation_probability_max[0] = 110; }, (f) => { f.current.weather_code = 999; }]) {
    const data = forecast(); change(data);
    await assert.rejects(getWeather("Tunis", "today", { fetcher: async (url) => Response.json(url.hostname.startsWith("geocoding") ? geo : data) }));
  }
});
