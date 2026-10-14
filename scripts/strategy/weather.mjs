// Outdoor temperature and humidity fallback from the HKO King's Park 1-minute feeds,
// used when no weather-station telemetry is configured.
const BASE = "https://data.weather.gov.hk/weatherAPI/hko_data/regional-weather";
export const HKO_TEMPERATURE_URL = `${BASE}/latest_1min_temperature.csv`;
export const HKO_HUMIDITY_URL = `${BASE}/latest_1min_humidity.csv`;

export function parseStationCsv(csv, station = "King's Park") {
  const row = csv.replace(/^﻿/, "").trim().split(/\r?\n/).map((line) => line.split(",")).find((fields) => fields[1] === station);
  if (!row || !/^\d{12}$/.test(row[0])) throw new Error(`Missing ${station} observation`);
  const value = Number(row[2]);
  if (row[2]?.trim() === "" || !Number.isFinite(value)) throw new Error(`Invalid ${station} observation`);
  const t = row[0];
  return { value, t: Date.parse(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:00+08:00`) };
}

export async function fetchHkoOutdoor(fetchImpl = fetch) {
  const read = async (url) => {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HKO HTTP ${response.status}`);
    return parseStationCsv(await response.text());
  };
  const [temperature, humidity] = await Promise.all([read(HKO_TEMPERATURE_URL), read(HKO_HUMIDITY_URL)]);
  if (temperature.value < -5 || temperature.value > 45 || humidity.value < 0 || humidity.value > 100) throw new Error("HKO observation out of range");
  return { temperatureC: temperature.value, humidityPct: humidity.value, t: Math.min(temperature.t, humidity.t), source: "hko-kings-park" };
}
