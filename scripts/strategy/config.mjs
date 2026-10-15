// ZB202 ventilation strategy parameters. Values marked "assumed" are placeholders
// until calibration (data/strategy/calibration.json) or FMO confirmation replaces them.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const strategyDataDir = path.join(projectRoot, "data", "strategy");

export const DEFAULT_CONFIG = Object.freeze({
  room: {
    floorAreaM2: 46.6, // 5.9 × 7.9 m
    volumeM3: 280, // Geometric volume; effective mixing volume to be calibrated (190–280 m³).
    maxOccupancy: 10,
  },
  co2: {
    limitPpm: 800, // HK EPD IAQ "Excellent" class.
    targetPpm: 750, // 50 ppm margin for sensor and forecast error.
    safetyPpm: 780, // L2: open to the safety maximum above this measured value.
    outdoorPpm: 440, // Assumed; calibrate from night baseline.
    generationLpsPerPerson: 0.005, // Assumed; calibrate from occupied periods.
    // Sensors identified by InfluxDB measurement name. Offsets are subtracted from raw readings.
    sensors: ["AM103_05", "AM103_06", "AM103_07", "AM103_08", "AM308_01"],
    sensorOffsetsPpm: {},
    maxReadingAgeMinutes: 20,
  },
  ventilation: {
    // ASHRAE 62.1 office: 2.5 L/s per person + 0.3 L/s per m².
    perPersonLps: 2.5,
    perAreaLps: 0.3,
    // Outdoor-air damper % → outdoor airflow (L/s). Assumed linear until calibrated.
    damperCurve: [[0, 0], [100, 300]],
    baselineDamperPct: 30, // Current BMS command used as the "existing operation" baseline.
    // AHU operating hours (Hong Kong time). null = assume it always runs. Outside these hours the room
    // only receives infiltration/exhaust airflow (ahuOffLps, from evening decay calibration).
    // Inferred: every evening CO₂ decay starts at about 17:50, so the AHU stops at about 18:00;
    // the start time is assumed. Replace with the BMS schedule once FMO confirms it.
    ahuSchedule: { weekday: [["08:00", "18:00"]], weekend: [] },
    ahuScheduleSource: "inferred", // "inferred" | "bms"
    ahuOffLps: 22,
    damperMinPct: 0,
    damperMaxPct: 100,
    damperStepPct: 5,
  },
  horizon: {
    defaultMinutes: 60,
    maxMinutes: 180,
    stepMinutes: 10, // Recalculation interval, aligned with CO₂ reporting.
    simulationStepMinutes: 1,
    outputStepMinutes: 5,
  },
  occupancy: {
    // Weekday prior: one PhD student 09:30–18:30 (Hong Kong time).
    weekdayPrior: [{ start: "09:30", end: "18:30", people: 1 }],
    weekendPrior: [],
    forecastDecayMinutes: 30,
    forecastSafetySigma: 1, // Forecast from estimate + 1σ of the occupancy filter.
    measuredMaxAgeMinutes: 360,
    measuredMinReportingSensors: 8,
    occupancySensors: ["VS341_01", "VS341_02", "VS341_03", "VS341_04", "VS341_05", "VS341_06", "VS341_07", "VS341_08", "VS341_09", "VS341_10"],
    doorSensors: ["WS301_01", "WS301_02", "WS301_03"],
    noiseSensors: ["WS302_01", "WS302_02"],
    meetingNoiseDb: 55, // LAeq above this suggests conversation.
    kalman: { processVariance: 0.25, doorProcessVariance: 4, measurementFloorVariance: 0.5, sensorNoisePpm: 15 },
  },
  energy: {
    airDensityKgM3: 1.2,
    plantCop: 4.5, // Assumed chiller plant COP.
    fallbackOutdoor: { temperatureC: 27, humidityPct: 78 },
    fallbackIndoor: { temperatureC: 24, humidityPct: 60 },
  },
  optimizer: {
    method: "bisection", // "bisection" (v1) or "dp" (v2).
    dpSteps: 6,
    dpSmoothingWeight: 0.02,
    dpCo2BinPpm: 2,
  },
  control: {
    mode: "L1", // L0 recommend only, L1 shadow mode, L2 BACnet write (requires authorisation).
    maxDamperChangePctPerStep: 10,
    dataGapReleaseMinutes: 20,
    bacnetPriority: null, // To be specified by FMO.
    bacnetPoint: null,
    l2Authorised: false,
  },
});

function deepMerge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return override ?? base;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = base?.[key] && typeof base[key] === "object" && !Array.isArray(base[key]) ? deepMerge(base[key], value) : value;
  }
  return result;
}

export function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}

// Calibration results override defaults; environment variables override both.
export function loadConfig({ calibrationFile = path.join(strategyDataDir, "calibration.json"), env = process.env, overrides } = {}) {
  const calibration = readJson(calibrationFile, {});
  let config = deepMerge(DEFAULT_CONFIG, calibration.config || {});
  if (overrides) config = deepMerge(config, overrides);
  if (["L0", "L1", "L2"].includes(env.ZB202_STRATEGY_MODE)) config = deepMerge(config, { control: { mode: env.ZB202_STRATEGY_MODE } });
  if (env.ZB202_STRATEGY_OPTIMIZER === "dp" || env.ZB202_STRATEGY_OPTIMIZER === "bisection") config = deepMerge(config, { optimizer: { method: env.ZB202_STRATEGY_OPTIMIZER } });
  if (Number(env.ZB202_STRATEGY_PLANT_COP) > 0) config = deepMerge(config, { energy: { plantCop: Number(env.ZB202_STRATEGY_PLANT_COP) } });
  return { ...config, calibration: { calibratedAt: calibration.calibratedAt || null, notes: calibration.notes || [] } };
}

export const minimumOutdoorAirLps = (people, config) =>
  config.ventilation.perPersonLps * Math.max(0, people) + config.ventilation.perAreaLps * config.room.floorAreaM2;

const clockMinutes = (text) => {
  const [hours, minutes] = String(text).split(":").map(Number);
  return hours * 60 + minutes;
};

export function ahuRunning(tMs, config) {
  const schedule = config.ventilation.ahuSchedule;
  if (!schedule) return true;
  const local = new Date(tMs + 8 * 3600000);
  const day = local.getUTCDay();
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const windows = (day === 0 || day === 6 ? schedule.weekend : schedule.weekday) || [];
  return windows.some(([start, end]) => minutes >= clockMinutes(start) && minutes < clockMinutes(end));
}

// Current AHU state and the next scheduled start and stop (ms), looking up to 8 days ahead.
export function ahuStatus(tMs, config) {
  const schedule = config.ventilation.ahuSchedule;
  if (!schedule) return { running: true, nextStart: null, nextStop: null, source: "assumed" };
  const dayMs = 86400000;
  const localMidnight = Math.floor((tMs + 8 * 3600000) / dayMs) * dayMs - 8 * 3600000;
  let nextStart = null;
  let nextStop = null;
  for (let offset = -1; offset <= 8 && (nextStart === null || nextStop === null); offset += 1) {
    const midnight = localMidnight + offset * dayMs;
    const day = new Date(midnight + 8 * 3600000).getUTCDay();
    for (const [start, end] of (day === 0 || day === 6 ? schedule.weekend : schedule.weekday) || []) {
      const startMs = midnight + clockMinutes(start) * 60000;
      const endMs = midnight + clockMinutes(end) * 60000;
      if (startMs > tMs && (nextStart === null || startMs < nextStart)) nextStart = startMs;
      if (endMs > tMs && (nextStop === null || endMs < nextStop)) nextStop = endMs;
    }
  }
  return { running: ahuRunning(tMs, config), nextStart, nextStop, source: config.ventilation.ahuScheduleSource || "inferred" };
}

// Airflow the room actually receives under existing operation at time tMs.
export function baselineAirflowAt(tMs, config, damperPct = config.ventilation.baselineDamperPct) {
  return ahuRunning(tMs, config) ? damperToLps(damperPct, config.ventilation.damperCurve) : config.ventilation.ahuOffLps;
}

// Piecewise-linear damper curve and its inverse. The curve must be non-decreasing in airflow.
export function damperToLps(pct, curve) {
  const points = [...curve].sort((a, b) => a[0] - b[0]);
  const x = Math.min(points.at(-1)[0], Math.max(points[0][0], pct));
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return points.at(-1)[1];
}

export function lpsToDamper(lps, curve) {
  const points = [...curve].sort((a, b) => a[0] - b[0]);
  if (lps <= points[0][1]) return points[0][0];
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (lps <= y1) return y1 === y0 ? x0 : x0 + (x1 - x0) * (lps - y0) / (y1 - y0);
  }
  return points.at(-1)[0];
}
