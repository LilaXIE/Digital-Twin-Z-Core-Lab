// Outdoor curves for the Environment panel. The bridge sends only the latest HKO King's Park reading,
// so the past 48 hours come from Open-Meteo's hourly data for the lab's location (temperature and
// humidity: weather model with station data; PM2.5: CAMS air-quality model). Fetched in the browser,
// refreshed at most every 30 minutes; without it the charts simply show the indoor line alone.
import { SITE } from "../config/site.js";
import { emit } from "../state.js";

const REFRESH_MS = 30 * 60000;
const WEATHER_URL = `https://api.open-meteo.com/v1/forecast?latitude=${SITE.latitude}&longitude=${SITE.longitude}&hourly=temperature_2m,relative_humidity_2m&past_days=2&forecast_days=1&timeformat=unixtime`;
const AIR_URL = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${SITE.latitude}&longitude=${SITE.longitude}&hourly=pm2_5&past_days=2&forecast_days=1&timeformat=unixtime`;

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
  const [weather, air] = await Promise.allSettled([WEATHER_URL, AIR_URL].map(async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }));
  if (weather.status === "fulfilled") {
    series.temperature = points(weather.value.hourly, "temperature_2m");
    series.humidity = points(weather.value.hourly, "relative_humidity_2m");
  }
  if (air.status === "fulfilled") series.pm25 = points(air.value.hourly, "pm2_5");
  fetchedAt = Date.now();
  loading = false;
  emit("data", { kind: "outdoor-history" });
}

// The hourly outdoor curve for a room metric, or [] (none yet, or no outdoor counterpart).
export function outdoorHistory(key) {
  if (!loading && Date.now() - fetchedAt > REFRESH_MS) void load();
  return series[key] || [];
}
