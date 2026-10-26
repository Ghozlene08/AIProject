/*
 * Météo du jour pour le briefing du matin : Open-Meteo (gratuit, sans clé, sans compte).
 * Seule la ville du senior est envoyée (jamais son nom). Cache d'une heure par ville ;
 * en cas de panne réseau, le briefing est simplement lu sans la météo.
 */

const TTL_MS = 3600_000;
const cache = new Map(); // ville → { at, value }

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return res.json();
}

async function fetchToday(city) {
  const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`);
  const place = geo.results?.[0];
  if (!place) return null;
  const q = `latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`;
  const data = await getJson(`https://api.open-meteo.com/v1/forecast?${q}`);
  const d = data.daily;
  if (!d?.temperature_2m_max?.length) return null;
  return {
    city: place.name,
    min: Math.round(d.temperature_2m_min[0]),
    max: Math.round(d.temperature_2m_max[0]),
    rain: d.precipitation_probability_max?.[0] ?? 0,
    sky: skyOf(d.weather_code?.[0]),
  };
}

// Codes météo WMO (Open-Meteo) → description simple
function skyOf(code) {
  if (code == null) return null;
  if (code === 0) return "un beau soleil";
  if (code <= 2) return "un temps plutôt ensoleillé";
  if (code === 3) return "un ciel couvert";
  if (code === 45 || code === 48) return "du brouillard";
  if (code >= 95) return "des orages";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "de la neige";
  if (code >= 51) return "de la pluie";
  return null;
}

/** Météo du jour { city, min, max, rain } ou null (ville inconnue, réseau indisponible) */
export async function todayWeather(city) {
  const key = String(city ?? "").trim().toLowerCase();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const value = await fetchToday(city);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

/** Phrase lue dans le briefing, avec un conseil pratique adapté */
export function speakWeather(w, { goingOut = false } = {}) {
  if (!w) return "";
  const parts = [w.sky ? `Aujourd'hui à ${w.city}, on annonce ${w.sky}. Il fera entre ${w.min} et ${w.max} degrés.` : `Aujourd'hui à ${w.city}, il fera entre ${w.min} et ${w.max} degrés.`];
  if (w.rain >= 50) parts.push(goingOut ? "Prenez un parapluie si vous sortez." : "Il pourrait pleuvoir : un parapluie sera utile si vous sortez.");
  if (w.max >= 32) parts.push("Il fera chaud : pensez à boire de l'eau régulièrement.");
  else if (w.min <= 5) parts.push("Il fera froid : couvrez-vous bien si vous sortez.");
  return parts.join(" ");
}
