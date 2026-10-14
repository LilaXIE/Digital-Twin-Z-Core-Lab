// Calibration from history. Prints results; --write saves data/strategy/calibration.json.
//   npm run strategy:calibrate -- --days 30 [--bms bms.csv] [--occupancy people.csv] [--use-decay-flow] [--write]
// bms.csv columns: time,damperPct   people.csv columns: time,people   (times without offset = HKT)
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_CONFIG, damperToLps, loadConfig, readJson, strategyDataDir } from "./config.mjs";
import { stepCo2 } from "./co2-model.mjs";
import { OccupancyEstimator } from "./occupancy-estimator.mjs";
import { hkTime, scheduledPriorAt } from "./occupancy-forecast.mjs";
import { parseArgs, readTimeSeriesCsv, valueAt } from "./csv.mjs";

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value, digits = 1) => (value === null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);

// Offset of each sensor against the median of all sensors reporting in the same window.
export function sensorOffsets(series, sensors, minSensors = 4) {
  const differences = Object.fromEntries(sensors.map((id) => [id, []]));
  for (const point of series) {
    const present = sensors.filter((id) => Number.isFinite(point.readings[id]));
    if (present.length < minSensors) continue;
    const consensus = median(present.map((id) => point.readings[id]));
    for (const id of present) differences[id].push(point.readings[id] - consensus);
  }
  return Object.fromEntries(sensors.filter((id) => differences[id].length).map((id) => [id, round(median(differences[id]), 0)]));
}

// Room series using offsets: median of corrected readings per window.
export function roomSeries(series, sensors, offsets) {
  return series.map((point) => {
    const values = sensors.filter((id) => Number.isFinite(point.readings[id])).map((id) => point.readings[id] - (offsets[id] || 0));
    return values.length ? { t: point.t, ppm: median(values) } : null;
  }).filter(Boolean);
}

// Stable night windows (01:00–05:00 HKT, one-hour spread < 8 ppm): their means approximate outdoor CO₂.
export function nightBaseline(room) {
  const nights = new Map();
  for (let i = 0; i + 6 <= room.length; i += 1) {
    const window = room.slice(i, i + 6);
    if (window.at(-1).t - window[0].t > 60 * 60000) continue;
    const local = hkTime(window[0].t);
    if (local.minutes < 60 || local.minutes >= 300) continue;
    const values = window.map((point) => point.ppm);
    if (Math.max(...values) - Math.min(...values) >= 8) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const night = hkTime(window[0].t).dateKey;
    nights.set(night, Math.min(nights.get(night) ?? Infinity, mean));
  }
  const values = [...nights.values()];
  return { outdoorPpm: round(median(values), 0), nights: [...nights].map(([date, ppm]) => ({ date, ppm: round(ppm, 0) })) };
}

// Exponential decays after occupied periods: ln(C − C_out) falls linearly at rate Q/V.
export function decaySegments(room, outdoorPpm, volumeM3, { minRisePpm = 60, minMinutes = 60, tolerancePpm = 4 } = {}) {
  const segments = [];
  let i = 1;
  while (i < room.length - 1) {
    const isPeak = room[i].ppm >= outdoorPpm + minRisePpm && room[i].ppm >= room[i - 1].ppm && room[i + 1].ppm < room[i].ppm;
    if (!isPeak) { i += 1; continue; }
    let j = i;
    while (j + 1 < room.length && room[j + 1].t - room[j].t <= 20 * 60000 && room[j + 1].ppm <= room[j].ppm + tolerancePpm && room[j + 1].ppm - outdoorPpm > 15) j += 1;
    const points = room.slice(i, j + 1);
    const minutes = (points.at(-1).t - points[0].t) / 60000;
    if (minutes >= minMinutes && points[0].ppm - points.at(-1).ppm >= 40) {
      const xs = points.map((point) => (point.t - points[0].t) / 3600000);
      const ys = points.map((point) => Math.log(point.ppm - outdoorPpm));
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      const sxx = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
      const slope = xs.reduce((sum, x, k) => sum + (x - mx) * (ys[k] - my), 0) / sxx;
      const residual = ys.reduce((sum, y, k) => sum + (y - (my + slope * (xs[k] - mx))) ** 2, 0);
      const total = ys.reduce((sum, y) => sum + (y - my) ** 2, 0);
      const r2 = total ? 1 - residual / total : 0;
      const ach = -slope;
      if (ach > 0 && r2 >= 0.85) {
        segments.push({ start: new Date(points[0].t).toISOString(), startHkt: `${hkTime(points[0].t).dateKey} ${hkTime(points[0].t).label}`, minutes: Math.round(minutes), fromPpm: Math.round(points[0].ppm), toPpm: Math.round(points.at(-1).ppm), ach: round(ach, 2), lps: round(ach * volumeM3 / 3.6, 0), r2: round(r2, 3), midMs: (points[0].t + points.at(-1).t) / 2 });
      }
    }
    i = j + 1;
  }
  return segments;
}

// Monotonic damper curve from decay segments paired with BMS damper positions (10 % bins).
export function damperCurveFromDecays(segments, bmsRows) {
  const bins = new Map();
  for (const segment of segments) {
    const pct = valueAt(bmsRows, "damperPct", segment.midMs);
    if (pct === null) continue;
    const bin = Math.round(pct / 10) * 10;
    (bins.get(bin) || bins.set(bin, []).get(bin)).push(segment.lps);
  }
  const points = [...bins].sort((a, b) => a[0] - b[0]).map(([pct, values]) => [pct, median(values)]);
  for (let k = 1; k < points.length; k += 1) points[k][1] = Math.max(points[k][1], points[k - 1][1]);
  return points.length >= 2 ? points : null;
}

// Grid search of V and G against a head-count log, minimising 10-minute-ahead CO₂ error.
export function fitVolumeAndGeneration(room, occupancyLog, config, airflowAt) {
  let best = null;
  for (let volume = 150; volume <= 350; volume += 10) {
    for (let generation = 0.003; generation <= 0.0081; generation += 0.00025) {
      const trial = { ...config, room: { ...config.room, volumeM3: volume }, co2: { ...config.co2, generationLpsPerPerson: generation } };
      let sum = 0;
      let count = 0;
      for (let k = 0; k + 1 < room.length; k += 1) {
        const seconds = (room[k + 1].t - room[k].t) / 1000;
        const people = valueAt(occupancyLog, "people", room[k].t);
        if (seconds > 1200 || people === null) continue;
        const predicted = stepCo2(room[k].ppm, people, airflowAt(room[k].t), seconds, trial);
        sum += (room[k + 1].ppm - predicted) ** 2;
        count += 1;
      }
      if (count && (!best || sum / count < best.mse)) best = { volumeM3: volume, generationLpsPerPerson: round(generation, 5), mse: sum / count, samples: count };
    }
  }
  return best && { ...best, rmsePpm: round(Math.sqrt(best.mse)) };
}

// Night first-difference noise of the room series, as a sensor-noise estimate for the Kalman filter.
export function nightNoise(room) {
  const differences = [];
  for (let k = 1; k < room.length; k += 1) {
    const minutes = hkTime(room[k].t).minutes;
    if (minutes >= 60 && minutes < 300 && room[k].t - room[k - 1].t <= 20 * 60000) differences.push(room[k].ppm - room[k - 1].ppm);
  }
  if (differences.length < 10) return null;
  const mean = differences.reduce((a, b) => a + b, 0) / differences.length;
  const sd = Math.sqrt(differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (differences.length - 1));
  return round(sd / Math.SQRT2, 1);
}

export function calibrate({ history, config, bmsRows = null, occupancyLog = null, useDecayFlow = false }) {
  const sensors = config.co2.sensors;
  const offsets = sensorOffsets(history.series, sensors);
  const room = roomSeries(history.series, sensors, offsets);
  const baseline = nightBaseline(room);
  const outdoorPpm = baseline.outdoorPpm ?? config.co2.outdoorPpm;
  const segments = decaySegments(room, outdoorPpm, config.room.volumeM3);
  const daytime = segments.filter((segment) => { const minutes = hkTime(Date.parse(segment.start)).minutes; return minutes >= 8 * 60 && minutes < 22 * 60; });
  const notes = [];
  const result = { config: { co2: { sensorOffsetsPpm: offsets } }, measured: {}, notes };
  if (baseline.outdoorPpm !== null) result.config.co2.outdoorPpm = baseline.outdoorPpm;
  else notes.push("No stable night windows found; outdoor CO₂ unchanged.");

  const noise = nightNoise(room);
  // Floor of 8 ppm: the single-zone model's own error exceeds the night sensor noise.
  if (noise !== null) result.config.occupancy = { kalman: { sensorNoisePpm: Math.max(8, noise) } };

  result.measured.nightBaseline = baseline.nights;
  result.measured.decays = segments.map(({ midMs, ...segment }) => segment);
  result.measured.daytimeDecayLps = round(median(daytime.map((segment) => segment.lps)), 0);
  result.measured.allDecayLps = round(median(segments.map((segment) => segment.lps)), 0);
  // Decays starting after 17:30 most likely run with the AHU off: infiltration and exhaust only.
  const evening = segments.filter((segment) => { const minutes = hkTime(Date.parse(segment.start)).minutes; return minutes >= 17 * 60 + 30 || minutes < 6 * 60; });
  if (evening.length >= 3) {
    result.config.ventilation = { ahuOffLps: round(median(evening.map((segment) => segment.lps)), 0) };
    notes.push(`AHU-off airflow set from ${evening.length} evening/night decays; it applies only when ventilation.ahuSchedule is configured.`);
  }

  let curve = null;
  if (bmsRows?.length) {
    curve = damperCurveFromDecays(segments, bmsRows);
    if (curve) notes.push("Damper curve fitted from decay segments and BMS damper positions.");
    else notes.push("BMS data did not cover enough decay segments to fit a damper curve.");
  }
  if (!curve && useDecayFlow && result.measured.daytimeDecayLps) {
    const baselinePct = config.ventilation.baselineDamperPct;
    curve = [[0, 0], [100, round(result.measured.daytimeDecayLps * 100 / baselinePct, 0)]];
    notes.push(`Linear damper curve scaled so that the ${baselinePct}% baseline equals the median daytime decay flow (assumes the AHU ran at the baseline during those decays).`);
  }
  if (curve) result.config.ventilation = { ...result.config.ventilation, damperCurve: curve };
  else notes.push("Damper curve unchanged; needs BMS damper history or --use-decay-flow.");

  if (occupancyLog?.length) {
    const curveForFit = curve || config.ventilation.damperCurve;
    const airflowAt = (t) => damperToLps(bmsRows ? valueAt(bmsRows, "damperPct", t) ?? config.ventilation.baselineDamperPct : config.ventilation.baselineDamperPct, curveForFit);
    const fit = fitVolumeAndGeneration(room, occupancyLog, { ...config, co2: { ...config.co2, outdoorPpm } }, airflowAt);
    if (fit) {
      result.config.room = { volumeM3: fit.volumeM3 };
      result.config.co2.generationLpsPerPerson = fit.generationLpsPerPerson;
      result.measured.fit = fit;
      // CO₂-implied occupancy error against the log with the fitted parameters.
      const fitted = { ...config, room: { ...config.room, volumeM3: fit.volumeM3 }, co2: { ...config.co2, outdoorPpm, generationLpsPerPerson: fit.generationLpsPerPerson } };
      const estimator = new OccupancyEstimator(fitted);
      const errors = [];
      for (const point of room) {
        const estimate = estimator.update({ t: point.t, roomPpm: point.ppm, lps: airflowAt(point.t), priorPeople: scheduledPriorAt(point.t, fitted) });
        const truth = valueAt(occupancyLog, "people", point.t);
        if (truth !== null) errors.push(Math.abs(estimate.current - truth));
      }
      result.measured.occupancyMae = errors.length ? round(errors.reduce((a, b) => a + b, 0) / errors.length, 2) : null;
    }
  } else {
    notes.push("No head-count log; V and G unchanged.");
  }
  result.measured.roomPoints = room.length;
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const days = Math.min(90, Math.max(3, Number(args.days) || 30));
  // Calibrate from defaults so earlier calibration does not feed back into offsets.
  const config = loadConfig({ calibrationFile: path.join(strategyDataDir, "__none__.json") });
  await import("dotenv/config");
  const { InfluxDB } = await import("@influxdata/influxdb-client");
  const { loadStrategyHistory } = await import("./influx-history.mjs");
  const { ZB202_INFLUX_URL: url, ZB202_INFLUX_TOKEN: token, ZB202_INFLUX_ORG: org, ZB202_INFLUX_BUCKET: bucket = "zb202_iot" } = process.env;
  if (!url || !token || !org) throw new Error("Set ZB202_INFLUX_URL, ZB202_INFLUX_TOKEN and ZB202_INFLUX_ORG in .env");
  const queryApi = new InfluxDB({ url, token, timeout: 120000 }).getQueryApi(org);
  const stop = Date.now();
  const start = stop - days * 86400000;
  console.log(`Loading ${days} days of CO₂ history from ${bucket}…`);
  const history = await loadStrategyHistory({ queryApi, bucket, config, start, stop });
  const bmsRows = args.bms ? await readTimeSeriesCsv(args.bms) : null;
  const occupancyLog = args.occupancy ? await readTimeSeriesCsv(args.occupancy) : null;
  const result = calibrate({ history, config, bmsRows, occupancyLog, useDecayFlow: Boolean(args["use-decay-flow"]) });

  console.log("\nSensor offsets (sensor − consensus, ppm):", result.config.co2.sensorOffsetsPpm);
  console.log(`Outdoor CO₂ (night baseline): ${result.config.co2.outdoorPpm ?? "unchanged"} ppm from ${result.measured.nightBaseline.length} nights`);
  console.log(`Sensor noise (night): ${result.config.occupancy?.kalman.sensorNoisePpm ?? "n/a"} ppm`);
  console.log(`Decay segments: ${result.measured.decays.length}; median flow ${result.measured.allDecayLps ?? "n/a"} L/s (daytime ${result.measured.daytimeDecayLps ?? "n/a"} L/s) at V=${config.room.volumeM3} m³`);
  for (const segment of result.measured.decays.slice(-10)) console.log(`  ${segment.startHkt}  ${segment.fromPpm}→${segment.toPpm} ppm over ${segment.minutes} min: ${segment.ach} ACH ≈ ${segment.lps} L/s (R² ${segment.r2})`);
  if (result.config.ventilation?.damperCurve) console.log("Damper curve:", JSON.stringify(result.config.ventilation.damperCurve));
  if (result.measured.fit) console.log(`Fit: V=${result.measured.fit.volumeM3} m³, G=${result.measured.fit.generationLpsPerPerson} L/s, RMSE ${result.measured.fit.rmsePpm} ppm; occupancy MAE ${result.measured.occupancyMae}`);
  for (const note of result.notes) console.log(`Note: ${note}`);

  if (args.write) {
    const file = path.join(strategyDataDir, "calibration.json");
    const previous = readJson(file, {});
    const merged = {
      calibratedAt: new Date().toISOString(),
      source: { bucket, days, from: new Date(start).toISOString(), to: new Date(stop).toISOString(), bms: Boolean(bmsRows), occupancyLog: Boolean(occupancyLog) },
      config: { ...previous.config, ...result.config, co2: { ...previous.config?.co2, ...result.config.co2 }, ventilation: { ...previous.config?.ventilation, ...result.config.ventilation }, ...(result.config.occupancy ? { occupancy: { kalman: { ...DEFAULT_CONFIG.occupancy.kalman, ...previous.config?.occupancy?.kalman, ...result.config.occupancy.kalman } } } : {}) },
      measured: result.measured,
      notes: result.notes,
    };
    await writeFile(file, `${JSON.stringify(merged, null, 2)}\n`);
    console.log(`\nSaved ${path.relative(process.cwd(), file)}`);
  } else {
    console.log("\nDry run; add --write to save data/strategy/calibration.json.");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
