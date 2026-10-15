// CO₂ offset correction and sensor health checks shared by the bridge and its tests.
// The five room sensors track each other but carry fixed offsets (data/strategy/calibration.json);
// the page shows corrected values everywhere, and flags sensors whose readings look implausible.
import { sensorKey } from "./strategy/sensors.mjs";

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export const HEALTH_RULES = Object.freeze({
  belowOutdoorPpm: 30, // corrected value more than this below the outdoor baseline
  flatlineMinutes: 120, // identical readings for at least this long
  flatlineMinReadings: 6,
  deviationPpm: 150, // corrected value this far from the median of the other sensors
  freshMinutes: 30, // only readings this recent take part in the checks
});

// Offset in ppm for a sensor id in either form (AM103-05 or AM103_05); null when not a room CO₂ sensor.
export function co2Offset(id, config) {
  const key = sensorKey(id);
  if (!config.co2.sensors.includes(key)) return null;
  return Number(config.co2.sensorOffsetsPpm?.[key]) || 0;
}

// Copy of a telemetry message with co2 corrected; the raw value travels in `corrections`.
export function correctTelemetry(telemetry, config) {
  const raw = telemetry?.values?.co2;
  const offset = co2Offset(telemetry?.deviceId || telemetry?.devEui, config);
  if (!Number.isFinite(raw) || offset === null) return telemetry;
  return {
    ...telemetry,
    values: { ...telemetry.values, co2: Math.round(raw - offset) },
    corrections: { co2: { raw, offsetPpm: offset } },
  };
}

// Corrects co2 trend samples of one device ({ time, value } or [t, value] pairs).
export function correctCo2Samples(id, samples, config) {
  const offset = co2Offset(id, config);
  if (!offset) return samples;
  return samples.map((sample) => (Array.isArray(sample)
    ? [sample[0], Math.round(sample[1] - offset)]
    : { ...sample, value: Math.round(sample.value - offset) }));
}

// Public calibration summary for the page, keyed by device id (AM103-05).
export function calibrationSummary(config) {
  const offsets = {};
  for (const key of config.co2.sensors) offsets[key.replaceAll("_", "-")] = Number(config.co2.sensorOffsetsPpm?.[key]) || 0;
  return { type: "sensor-calibration", co2: { offsets, outdoorPpm: config.co2.outdoorPpm, calibratedAt: config.calibration?.calibratedAt || null } };
}

// history: { sensorId: [{ t, ppm }] } with corrected ppm, any order. Returns
// { sensorId: { state: "ok" | "suspect" | "stale", reasons: [...], ppm, at } } keyed by device id (AM103-05).
export function assessCo2Health({ history, nowMs, config, rules = HEALTH_RULES }) {
  const latest = {};
  for (const [id, points] of Object.entries(history || {})) {
    const key = sensorKey(id);
    if (!config.co2.sensors.includes(key)) continue;
    const sorted = (points || []).filter((p) => Number.isFinite(p?.t) && Number.isFinite(p?.ppm)).sort((a, b) => a.t - b.t);
    if (sorted.length) latest[key] = { last: sorted.at(-1), points: sorted };
  }
  const fresh = Object.entries(latest).filter(([, item]) => nowMs - item.last.t <= rules.freshMinutes * 60000);
  const result = {};
  for (const key of config.co2.sensors) {
    const id = key.replaceAll("_", "-");
    const item = latest[key];
    if (!item) continue;
    const { last, points } = item;
    if (nowMs - last.t > rules.freshMinutes * 60000) { result[id] = { state: "stale", reasons: [], ppm: Math.round(last.ppm), at: last.t }; continue; }
    const reasons = [];
    if (last.ppm < config.co2.outdoorPpm - rules.belowOutdoorPpm) reasons.push("below-outdoor");
    const window = points.filter((p) => p.t >= last.t - rules.flatlineMinutes * 60000);
    const span = window.length ? last.t - window[0].t : 0;
    if (window.length >= rules.flatlineMinReadings && span >= rules.flatlineMinutes * 60000 * 0.9 && window.every((p) => p.ppm === last.ppm)) reasons.push("flatline");
    const others = fresh.filter(([other]) => other !== key).map(([, other]) => other.last.ppm);
    if (others.length >= 2 && Math.abs(last.ppm - median(others)) > rules.deviationPpm) reasons.push("deviates");
    result[id] = { state: reasons.length ? "suspect" : "ok", reasons, ppm: Math.round(last.ppm), at: last.t };
  }
  return result;
}
