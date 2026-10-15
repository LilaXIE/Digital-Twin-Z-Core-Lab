// AI review (Phase C): the savings report (baseline against recommended operation, with a range for
// the uncalibrated assumptions) and forecast accuracy (what the model predicted against what was
// measured). Pure: works on the service's recommendation history.
import { ahuRunning } from "./config.mjs";
import { enthalpyDifference } from "./energy.mjs";

const HOUR = 3600000;
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const hourStart = (tMs) => Math.floor(tMs / HOUR) * HOUR;
const hkDayStart = (tMs) => Math.floor((tMs + 8 * HOUR) / 86400000) * 86400000 - 8 * HOUR;

// Uncertainty of the savings: the damper → airflow curve is not calibrated (±25 %) and the chiller
// plant COP is assumed (±1).
export const SAVINGS_RANGE = Object.freeze({ airflowShare: 0.25, copDelta: 1 });

// entries: compact recommendation entries, oldest first ({ t, lps, baselineLps, outdoor?, indoor? }).
export function savingsReport(entries, { config, nowMs, days = 7 }) {
  const from = hkDayStart(nowMs) - (days - 1) * 86400000;
  const cop = config.energy.plantCop;
  const hours = new Map();
  const daily = new Map();
  let baselineKwh = 0;
  let recommendedKwh = 0;
  let baselineAirM3 = 0;
  let recommendedAirM3 = 0;
  for (let i = 1; i < entries.length; i += 1) {
    const a = entries[i - 1];
    const b = entries[i];
    const ta = Date.parse(a.t);
    const tb = Date.parse(b.t);
    if (tb < from || tb - ta > 20 * 60000 || tb <= ta) continue;
    if (a.ahuRunning === false || !ahuRunning(ta, config)) continue; // nothing to adjust while the AHU is off
    const seconds = (tb - ta) / 1000;
    const delta = enthalpyDifference(a.outdoor?.temperatureC != null ? a.outdoor : config.energy.fallbackOutdoor, a.indoor?.temperatureC != null ? a.indoor : config.energy.fallbackIndoor);
    const electric = (lps) => config.energy.airDensityKgM3 * lps / 1000 * delta * seconds / 3600 / cop;
    const base = electric(a.baselineLps);
    const rec = electric(a.lps);
    baselineKwh += base;
    recommendedKwh += rec;
    baselineAirM3 += a.baselineLps * seconds / 1000;
    recommendedAirM3 += a.lps * seconds / 1000;
    const hour = hours.get(hourStart(ta)) || { baselineKwh: 0, recommendedKwh: 0 };
    hour.baselineKwh += base;
    hour.recommendedKwh += rec;
    hours.set(hourStart(ta), hour);
    const day = daily.get(hkDayStart(ta)) || { baselineKwh: 0, recommendedKwh: 0 };
    day.baselineKwh += base;
    day.recommendedKwh += rec;
    daily.set(hkDayStart(ta), day);
  }
  const savedKwh = baselineKwh - recommendedKwh;
  const { airflowShare, copDelta } = SAVINGS_RANGE;
  return {
    from: new Date(from).toISOString(),
    to: new Date(nowMs).toISOString(),
    hours: [...hours].sort((x, y) => x[0] - y[0]).map(([t, value]) => ({ t: new Date(t).toISOString(), baselineKwh: round(value.baselineKwh, 4), recommendedKwh: round(value.recommendedKwh, 4) })),
    days: [...daily].sort((x, y) => x[0] - y[0]).map(([t, value]) => ({ t: new Date(t).toISOString(), baselineKwh: round(value.baselineKwh, 3), recommendedKwh: round(value.recommendedKwh, 3) })),
    totals: {
      baselineKwh: round(baselineKwh), recommendedKwh: round(recommendedKwh), savedKwh: round(savedKwh),
      savedSharePct: baselineKwh > 0 ? round(savedKwh / baselineKwh * 100, 1) : null,
      savedKwhLow: round(savedKwh * (1 - airflowShare) * cop / (cop + copDelta)),
      savedKwhHigh: round(savedKwh * (1 + airflowShare) * cop / Math.max(1, cop - copDelta)),
      baselineAirM3: Math.round(baselineAirM3), recommendedAirM3: Math.round(recommendedAirM3),
    },
    assumptions: { plantCop: cop, baselineDamperPct: config.ventilation.baselineDamperPct, ahuSchedule: config.ventilation.ahuSchedule, ...SAVINGS_RANGE },
  };
}

// Forecast accuracy. Each entry predicted CO₂ 30 and 60 minutes ahead under the operation the room
// actually ran (the baseline), so those predictions can be checked against what was later measured.
export function forecastReview(entries, { nowMs, hours = 24 }) {
  const from = nowMs - hours * HOUR;
  const measured = entries.filter((entry) => Number.isFinite(entry.roomPpm)).map((entry) => ({ t: Date.parse(entry.t), ppm: entry.roomPpm }));
  const actualAt = (t) => {
    let best = null;
    for (const point of measured) if (Math.abs(point.t - t) <= 6 * 60000 && (!best || Math.abs(point.t - t) < Math.abs(best.t - t))) best = point;
    return best?.ppm ?? null;
  };
  const result = { points: [], errors30: [], errors60: [] };
  for (const entry of entries) {
    const t = Date.parse(entry.t);
    for (const horizon of [30, 60]) {
      const predicted = entry[`at${horizon}`]?.baseline;
      const target = t + horizon * 60000;
      if (!Number.isFinite(predicted) || target < from || target > nowMs) continue;
      const actual = actualAt(target);
      if (actual === null) continue;
      result[`errors${horizon}`].push(actual - predicted);
      if (horizon === 60) result.points.push({ t: new Date(target).toISOString(), predicted: Math.round(predicted), actual: Math.round(actual) });
    }
  }
  const mae = (errors) => (errors.length ? round(errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length, 1) : null);
  const bias = (errors) => (errors.length ? round(errors.reduce((sum, e) => sum + e, 0) / errors.length, 1) : null);
  return {
    hours,
    points: result.points,
    mae30: mae(result.errors30), mae60: mae(result.errors60), bias60: bias(result.errors60),
    samples30: result.errors30.length, samples60: result.errors60.length,
    measured: measured.filter((point) => point.t >= from).map((point) => ({ t: new Date(point.t).toISOString(), ppm: Math.round(point.ppm) })),
  };
}
