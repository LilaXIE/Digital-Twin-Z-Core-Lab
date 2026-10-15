// Turns raw sensor readings into room-level inputs for the strategy engine.

export const sensorKey = (value) => String(value || "").trim().replaceAll("-", "_").toUpperCase();

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// readings: Map/obj sensorId → { ppm, t }. Offsets come from calibration (sensor − room consensus).
// The median of offset-corrected values tolerates one faulty sensor; sensors flagged by the health
// check (exclude) are left out unless no other sensor is fresh.
export function roomCo2(readings, nowMs, config, exclude = null) {
  const entries = readings instanceof Map ? [...readings] : Object.entries(readings || {});
  const maxAge = config.co2.maxReadingAgeMinutes * 60000;
  const used = [];
  for (const [id, reading] of entries) {
    const key = sensorKey(id);
    if (!config.co2.sensors.includes(key)) continue;
    if (!Number.isFinite(reading?.ppm) || !Number.isFinite(reading?.t) || nowMs - reading.t > maxAge || reading.t > nowMs + 60000) continue;
    used.push({ id: key, ppm: reading.ppm - (config.co2.sensorOffsetsPpm[key] || 0) });
  }
  if (!used.length) return null;
  const kept = exclude?.size ? used.filter((item) => !exclude.has(item.id)) : used;
  const chosen = kept.length ? kept : used;
  return { ppm: median(chosen.map((item) => item.ppm)), sensors: chosen.map((item) => item.id) };
}

// readings: sensorId → { value, t }. Counts VS341 seats reporting presence when enough sensors are fresh.
export function measuredOccupancy(readings, nowMs, config) {
  const entries = readings instanceof Map ? [...readings] : Object.entries(readings || {});
  const maxAge = config.occupancy.measuredMaxAgeMinutes * 60000;
  const fresh = entries.filter(([id, reading]) => config.occupancy.occupancySensors.includes(sensorKey(id))
    && Number.isFinite(reading?.value) && Number.isFinite(reading?.t) && nowMs - reading.t <= maxAge);
  const count = fresh.filter(([, reading]) => reading.value > 0).length;
  return { available: fresh.length >= config.occupancy.measuredMinReportingSensors, count, reporting: fresh.length };
}

// True when any door contact changed state in (fromMs, toMs].
export function doorChanged(doorHistory, fromMs, toMs) {
  for (const events of Object.values(doorHistory || {})) {
    let previous = null;
    for (const event of events) {
      if (event.t > toMs) break;
      if (previous !== null && event.t > fromMs && event.value !== previous) return true;
      previous = event.value;
    }
  }
  return false;
}

export function latestNoise(readings, nowMs, maxAgeMinutes = 20) {
  const values = Object.values(readings || {}).filter((reading) => Number.isFinite(reading?.value) && nowMs - reading.t <= maxAgeMinutes * 60000);
  return values.length ? Math.max(...values.map((reading) => reading.value)) : null;
}
