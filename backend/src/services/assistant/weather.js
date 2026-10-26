export const WEATHER_SOURCE = "https://open-meteo.com/";

function description(code) {
  if (code === 0) return "ciel dégagé";
  if ([1, 2].includes(code)) return "ciel partiellement nuageux";
  if (code === 3) return "ciel couvert";
  if ([45, 48].includes(code)) return "brouillard";
  if ([51, 53, 55, 56, 57].includes(code)) return "bruine";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "pluie";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "neige";
  if ([95, 96, 99].includes(code)) return "orages";
  throw new Error("Code météo invalide");
}
const numeric = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
async function json(url, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(6000), redirect: "error" });
  if (!response.ok) throw new Error("Météo indisponible");
  return response.json();
}

export async function getWeather(city, day = "today", { fetcher = fetch } = {}) {
  if (typeof city !== "string" || !city.trim() || city.length > 100 || !["today", "tomorrow"].includes(day)) throw new Error("Lieu ou jour invalide");
  const search = new URL("https://geocoding-api.open-meteo.com/v1/search");
  search.search = new URLSearchParams({ name: city.trim(), count: "1", language: "fr", format: "json" }).toString();
  const geo = await json(search, fetcher);
  const place = geo.results?.[0];
  if (!place) return { text: `Je ne trouve pas la ville « ${city} ». Pouvez-vous préciser la ville et le pays ?` };
  if (!numeric(place.latitude, -90, 90) || !numeric(place.longitude, -180, 180) || typeof place.name !== "string" || place.name.length > 100) throw new Error("Lieu invalide");
  const forecast = new URL("https://api.open-meteo.com/v1/forecast");
  forecast.search = new URLSearchParams({ latitude: String(place.latitude), longitude: String(place.longitude),
    current: "temperature_2m,weather_code", daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    forecast_days: "2", timezone: "auto", temperature_unit: "celsius" }).toString();
  const data = await json(forecast, fetcher);
  const index = day === "tomorrow" ? 1 : 0;
  const daily = data.daily;
  const low = daily?.temperature_2m_min?.[index], high = daily?.temperature_2m_max?.[index], rain = daily?.precipitation_probability_max?.[index];
  if (!numeric(low, -100, 70) || !numeric(high, -100, 70) || high < low || !numeric(rain, 0, 100) || !/^\d{4}-\d{2}-\d{2}$/.test(daily?.time?.[index] || "")) throw new Error("Prévisions incomplètes");
  const location = `${place.name}${typeof place.country === "string" ? `, ${place.country.slice(0, 100)}` : ""}`;
  const rounded = (n) => Math.round(n).toLocaleString("fr-FR");
  let text;
  if (day === "tomorrow") text = `Demain à ${location} : ${description(daily.weather_code?.[index])}, entre ${rounded(low)} et ${rounded(high)} degrés.`;
  else {
    if (!numeric(data.current?.temperature_2m, -100, 70)) throw new Error("Température manquante");
    text = `Actuellement à ${location} : ${rounded(data.current.temperature_2m)} degrés, ${description(data.current.weather_code)}. Aujourd’hui, les températures prévues vont de ${rounded(low)} à ${rounded(high)} degrés.`;
  }
  return { text: `${text} Probabilité de précipitations : ${rounded(rain)} %.`, sourceUrl: WEATHER_SOURCE, weatherDate: daily.time[index] };
}
