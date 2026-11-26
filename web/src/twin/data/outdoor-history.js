// Outdoor curves for the Environment panel. The bridge sends only the latest HKO King's Park reading,
// so the past 48 hours come from Open-Meteo's hourly data for the lab's location (temperature and
// humidity: weather model with station data; PM2.5: CAMS air-quality model). Fetched in the browser,
// refreshed at most every 30 minutes; without it the charts simply show the indoor line alone.
import { SITE } from "../config/site.js";
import { emit } from "../state.js";

const REFRESH_MS = 30 * 60000;
// Asked through our own site first (/api/open-meteo/…, a rewrite in vercel.json and a proxy in
// vite.config.js), so a network or browser extension that blocks third-party requests does not
// lose the outdoor curves; straight from Open-Meteo when the page is served without the rewrite.
// Temperature and humidity in 15-minute steps (hourly as a fallback) so short ranges get a curve.
const WEATHER_QUERY = `forecast?latitude=${SITE.latitude}&longitude=${SITE.longitude}&minutely_15=temperature_2m,relative_humidity_2m&hourly=temperature_2m,relative_humidity_2m&past_days=2&forecast_days=1&timeformat=unixtime`;
const AIR_QUERY = `air-quality?latitude=${SITE.latitude}&longitude=${SITE.longitude}&hourly=pm2_5&past_days=2&forecast_days=1&timeformat=unixtime`;
const SOURCES = {
  weather: [`api/open-meteo/weather/${WEATHER_QUERY}`, `https://api.open-meteo.com/v1/${WEATHER_QUERY}`],
  air: [`api/open-meteo/air/${AIR_QUERY}`, `https://air-quality-api.open-meteo.com/v1/${AIR_QUERY}`],
};

async function fetchJson(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok || !String(response.headers.get("content-type")).includes("json")) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

const series = { temperature: [], humidity: [], pm25: [] };
let fetchedAt = 0;
let loading = false;

function points(hourly, field) {
  const now = Date.now();
  return (hourly?.time || []).map((time, index) => ({ t: time * 1000, v: hourly[field]?.[index] }))
    .filter((point) => point.t <= now && Number.isFinite(point.v));
}

async function load() {
  loading = true;
  const [weather, air] = await Promise.allSettled([fetchJson(SOURCES.weather), fetchJson(SOURCES.air)]);
  if (weather.status === "fulfilled") {
    const fine = (field) => points(weather.value.minutely_15, field);
    series.temperature = fine("temperature_2m").length > 8 ? fine("temperature_2m") : points(weather.value.hourly, "temperature_2m");
    series.humidity = fine("relative_humidity_2m").length > 8 ? fine("relative_humidity_2m") : points(weather.value.hourly, "relative_humidity_2m");
  }
  if (air.status === "fulfilled") series.pm25 = points(air.value.hourly, "pm2_5");
  fetchedAt = Date.now();
  // A failed attempt is retried after a minute rather than after the full refresh interval.
  if (weather.status === "rejected" && air.status === "rejected") fetchedAt = Date.now() - REFRESH_MS + 60000;
  loading = false;
  emit("data", { kind: "outdoor-history" });
}

// The hourly outdoor curve for a room metric, or [] (none yet, or no outdoor counterpart).
export function outdoorHistory(key) {
  if (!loading && Date.now() - fetchedAt > REFRESH_MS) void load();
  return series[key] || [];
}
