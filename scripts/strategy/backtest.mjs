// Historical backtest: replays InfluxDB CO₂ history through the estimator, forecast and optimizer.
//   npm run strategy:backtest -- --days 7 [--optimizer dp] [--occupancy people.csv] [--synthetic]
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ahuRunning, baselineAirflowAt, damperToLps, loadConfig, strategyDataDir } from "./config.mjs";
import { impliedOccupancy, stepCo2 } from "./co2-model.mjs";
import { Calendar } from "./calendar.mjs";
import { intervalSavings, addSavings } from "./energy.mjs";
import { latestEventsAt } from "./influx-history.mjs";
import { OccupancyEstimator } from "./occupancy-estimator.mjs";
import { scheduledPriorAt } from "./occupancy-forecast.mjs";
import { buildRecommendation } from "./recommend.mjs";
import { doorChanged, latestNoise, measuredOccupancy, roomCo2 } from "./sensors.mjs";
import { parseArgs, readTimeSeriesCsv, valueAt } from "./csv.mjs";

const rmse = (errors) => (errors.length ? Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length) : null);
const mae = (errors) => (errors.length ? errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length : null);
const round = (value, digits = 1) => (value === null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);

// history: { series: [{ t, readings }], occupancyEvents, doorEvents, noiseEvents }
export function runBacktest({ history, config, meetings = [], occupancyLog = null, outdoor, indoor, stepMinutes = 10, includeTrace = false }) {
  const baselineLps = damperToLps(config.ventilation.baselineDamperPct, config.ventilation.damperCurve);
  const actualAt = (t) => baselineAirflowAt(t, config);
  const outdoorConditions = outdoor || config.energy.fallbackOutdoor;
  const indoorConditions = indoor || config.energy.fallbackIndoor;
  const estimator = new OccupancyEstimator(config);
  const steps = [];
  for (const point of history.series) {
    const readings = Object.fromEntries(Object.entries(point.readings).map(([id, ppm]) => [id, { ppm, t: point.t }]));
    const room = roomCo2(readings, point.t, config);
    if (room) steps.push({ t: point.t, ppm: room.ppm });
  }

  const byTime = new Map(steps.map((step) => [step.t, step]));
  const rows = [];
  let previousT = null;
  let previousDamper = null;
  for (const step of steps) {
    const occupancyReadings = Object.fromEntries(Object.entries(latestEventsAt(history.occupancyEvents, step.t)).map(([id, event]) => [id, event]));
    const noiseReadings = latestEventsAt(history.noiseEvents, step.t);
    const measuredInput = measuredOccupancy(occupancyReadings, step.t, config);
    const doorEvent = doorChanged(history.doorEvents, previousT ?? step.t - stepMinutes * 60000, step.t);
    const noiseDb = latestNoise(noiseReadings, step.t);
    const occupancy = estimator.update({ t: step.t, roomPpm: step.ppm, lps: actualAt(step.t), measured: measuredInput, doorEvent, noiseDb, priorPeople: scheduledPriorAt(step.t, config) });
    const recommendation = buildRecommendation({ nowMs: step.t, roomPpm: step.ppm, occupancy, meetings, config, outdoor: outdoorConditions, indoor: indoorConditions, previousDamperPct: previousDamper });
    previousDamper = recommendation.airflow.recommendedDamperPct;
    previousT = step.t;
    rows.push({ t: step.t, ppm: step.ppm, occupancy: occupancy.current, measured: occupancy.measured, recommendation, measuredInput, doorEvent, noiseDb });
  }

  // Forecast accuracy: the baseline forecast is comparable with what was measured, because the
  // room actually ran on the baseline airflow.
  const errors = { 30: [], 60: [] };
  for (const row of rows) {
    for (const horizon of [30, 60]) {
      const actual = byTime.get(row.t + horizon * 60000);
      if (actual) errors[horizon].push(actual.ppm - row.recommendation.co2[`at${horizon}`].baseline);
    }
  }

  // Closed loop: the room is simulated under the recommended airflow, with recommendations computed
  // from the simulated CO₂. Occupancy "truth" is implied in hindsight by the measured CO₂ under the
  // airflow that actually ran.
  const loopEstimator = new OccupancyEstimator(config);
  const loop = [];
  let simulated = null;
  let exceedSteps = 0;
  let savings = null;
  let loopDamper = null;
  for (let i = 0; i < rows.length - 1; i += 1) {
    const row = rows[i];
    const next = rows[i + 1];
    const seconds = (next.t - row.t) / 1000;
    if (seconds > 30 * 60) { simulated = null; continue; }
    const actualLps = actualAt(row.t);
    const truePeople = Math.min(config.room.maxOccupancy, Math.max(0, impliedOccupancy(row.ppm, next.ppm, actualLps, seconds, config)));
    const roomPpm = simulated ?? row.ppm;
    const occupancy = loopEstimator.update({ t: row.t, roomPpm, lps: actualLps, measured: row.measuredInput, doorEvent: row.doorEvent, noiseDb: row.noiseDb, priorPeople: scheduledPriorAt(row.t, config) });
    const recommendation = buildRecommendation({ nowMs: row.t, roomPpm, occupancy, meetings, config, outdoor: outdoorConditions, indoor: indoorConditions, previousDamperPct: loopDamper });
    loopDamper = recommendation.airflow.recommendedDamperPct;
    // Recommendations only change the damper while the AHU runs.
    const lps = ahuRunning(row.t, config) ? recommendation.exact.lps : actualLps;
    loopEstimator.setAirflow(lps);
    simulated = stepCo2(roomPpm, truePeople, lps, seconds, config);
    if (simulated > config.co2.limitPpm) exceedSteps += 1;
    savings = addSavings(savings, intervalSavings({ baselineLps: actualLps, recommendedLps: lps, seconds, outdoor: outdoorConditions, indoor: indoorConditions, config }));
    loop.push({ t: row.t, measuredPpm: row.ppm, ppm: simulated, lps, truePeople, estimate: occupancy.current, recommendation });
  }

  let occupancyMae = null;
  if (occupancyLog?.length) {
    const differences = rows.map((row) => {
      const truth = valueAt(occupancyLog, "people", row.t);
      return truth === null ? null : row.occupancy - truth;
    }).filter((value) => value !== null);
    occupancyMae = round(mae(differences), 2);
  }

  const recommended = loop.map((item) => item.lps);
  const hours = rows.length > 1 ? (rows.at(-1).t - rows[0].t) / 3600000 : 0;
  const baselineAirM3 = rows.slice(0, -1).reduce((sum, row, index) => sum + actualAt(row.t) * (rows[index + 1].t - row.t) / 1e6, 0);
  return {
    period: rows.length ? { from: new Date(rows[0].t).toISOString(), to: new Date(rows.at(-1).t).toISOString(), steps: rows.length, hours: round(hours) } : null,
    assumptions: {
      baselineDamperPct: config.ventilation.baselineDamperPct, baselineLps: round(baselineLps), damperCurve: config.ventilation.damperCurve,
      ahuSchedule: config.ventilation.ahuSchedule, ahuOffLps: config.ventilation.ahuOffLps,
      volumeM3: config.room.volumeM3, generationLpsPerPerson: config.co2.generationLpsPerPerson, outdoorPpm: config.co2.outdoorPpm,
      outdoor: outdoorConditions, indoor: indoorConditions, plantCop: config.energy.plantCop, optimizer: config.optimizer.method,
    },
    forecast: { rmse30: round(rmse(errors[30])), rmse60: round(rmse(errors[60])), bias30: round(errors[30].reduce((a, b) => a + b, 0) / (errors[30].length || 1)), samples30: errors[30].length, samples60: errors[60].length },
    closedLoop: {
      exceedanceSteps: exceedSteps,
      exceedanceRatio: loop.length ? round(exceedSteps / loop.length * 100, 2) : null,
      peakPpm: loop.length ? Math.round(Math.max(...loop.map((item) => item.ppm))) : null,
      measuredPeakPpm: steps.length ? Math.round(Math.max(...steps.map((step) => step.ppm))) : null,
    },
    airflow: {
      meanRecommendedLps: round(recommended.reduce((a, b) => a + b, 0) / (recommended.length || 1)),
      maxRecommendedLps: recommended.length ? Math.round(Math.max(...recommended)) : null,
      atMinimumShare: round(loop.filter((item) => item.recommendation.airflow.recommendedLps <= item.recommendation.airflow.minLps + 1).length / (loop.length || 1) * 100),
      atMaxSteps: loop.filter((item) => item.recommendation.airflow.atMax).length,
    },
    savings: savings ? {
      airM3: Math.round(savings.airM3), airSharePct: baselineAirM3 ? round(savings.airM3 / baselineAirM3 * 100) : null,
      coolingKwh: round(savings.coolingKwh, 2), electricKwh: round(savings.electricKwh, 2),
    } : null,
    trace: includeTrace ? loop.map((item) => ({ t: new Date(item.t).toISOString(), measuredPpm: Math.round(item.measuredPpm), simulatedPpm: Math.round(item.ppm), lps: round(item.lps), impliedPeople: round(item.truePeople, 2), estimatedPeople: round(item.estimate, 2) })) : undefined,
    occupancy: {
      meanEstimate: round(rows.reduce((sum, row) => sum + row.occupancy, 0) / (rows.length || 1), 2),
      maxEstimate: round(Math.max(0, ...rows.map((row) => row.occupancy)), 2),
      measuredShare: round(rows.filter((row) => row.measured).length / (rows.length || 1) * 100),
      maeAgainstLog: occupancyMae,
    },
  };
}

// Synthetic week for running the backtest without database access.
export function syntheticHistory({ days = 7, config, startMs = Date.parse("2026-10-05T00:00:00+08:00") }) {
  const lps = damperToLps(config.ventilation.baselineDamperPct, config.ventilation.damperCurve);
  const series = [];
  let ppm = config.co2.outdoorPpm;
  let seed = 11;
  const noise = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return (seed / 4294967296 - 0.5) * 8; };
  for (let t = startMs; t < startMs + days * 86400000; t += 600000) {
    const local = new Date(t + 8 * 3600000);
    const weekday = local.getUTCDay() >= 1 && local.getUTCDay() <= 5;
    const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
    let people = weekday && hour >= 9.5 && hour < 18.5 ? 1 : 0;
    if (weekday && hour >= 14 && hour < 15.5) people = 8; // Afternoon group meeting.
    if (weekday && hour >= 10 && hour < 12) people = Math.max(people, 4);
    ppm = stepCo2(ppm, people, lps, 600, config);
    series.push({ t, readings: Object.fromEntries(config.co2.sensors.map((id) => [id, ppm + noise() + (config.co2.sensorOffsetsPpm[id] || 0)])) });
  }
  return { series, occupancyEvents: {}, doorEvents: {}, noiseEvents: {} };
}

function printReport(report) {
  console.log("\nZB202 ventilation strategy backtest");
  console.log(`Period: ${report.period?.from} → ${report.period?.to} (${report.period?.steps} steps)`);
  console.log(`Assumptions: baseline ${report.assumptions.baselineDamperPct}% → ${report.assumptions.baselineLps} L/s, V=${report.assumptions.volumeM3} m³, G=${report.assumptions.generationLpsPerPerson} L/s, C_out=${report.assumptions.outdoorPpm} ppm, optimizer=${report.assumptions.optimizer}`);
  console.log(`CO₂ forecast RMSE: 30 min ${report.forecast.rmse30} ppm (n=${report.forecast.samples30}), 60 min ${report.forecast.rmse60} ppm (n=${report.forecast.samples60}); target < 50 ppm`);
  console.log(`Closed loop (recommended airflow): ${report.closedLoop.exceedanceSteps} steps > 800 ppm (${report.closedLoop.exceedanceRatio}%), simulated peak ${report.closedLoop.peakPpm} ppm; measured peak ${report.closedLoop.measuredPeakPpm} ppm; target 0%`);
  console.log(`Airflow: mean ${report.airflow.meanRecommendedLps} L/s, max ${report.airflow.maxRecommendedLps} L/s, at minimum ${report.airflow.atMinimumShare}% of steps, at maximum ${report.airflow.atMaxSteps} steps`);
  if (report.savings) console.log(`Savings vs baseline: ${report.savings.airM3} m³ outdoor air (${report.savings.airSharePct}%), ${report.savings.coolingKwh} kWh cooling, ${report.savings.electricKwh} kWh electricity (assumed outdoor/indoor conditions)`);
  console.log(`Occupancy estimate: mean ${report.occupancy.meanEstimate}, max ${report.occupancy.maxEstimate}, VS341 used ${report.occupancy.measuredShare}% of steps${report.occupancy.maeAgainstLog === null ? "" : `, MAE vs log ${report.occupancy.maeAgainstLog} people (target < 1.5)`}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const days = Math.min(60, Math.max(1, Number(args.days) || 7));
  const config = loadConfig({ overrides: args.optimizer ? { optimizer: { method: args.optimizer === "dp" ? "dp" : "bisection" } } : undefined });
  let history;
  if (args.synthetic) {
    history = syntheticHistory({ days, config });
  } else {
    await import("dotenv/config");
    const { InfluxDB } = await import("@influxdata/influxdb-client");
    const { loadStrategyHistory } = await import("./influx-history.mjs");
    const { ZB202_INFLUX_URL: url, ZB202_INFLUX_TOKEN: token, ZB202_INFLUX_ORG: org, ZB202_INFLUX_BUCKET: bucket = "zb202_iot" } = process.env;
    if (!url || !token || !org) throw new Error("Set ZB202_INFLUX_URL, ZB202_INFLUX_TOKEN and ZB202_INFLUX_ORG in .env, or use --synthetic");
    const queryApi = new InfluxDB({ url, token, timeout: 120000 }).getQueryApi(org);
    const stop = Date.now();
    console.log(`Loading ${days} days of history from ${bucket}…`);
    history = await loadStrategyHistory({ queryApi, bucket, config, start: stop - days * 86400000, stop });
  }
  const calendar = new Calendar(path.join(strategyDataDir, "calendar.json"));
  const meetings = await calendar.load();
  const occupancyLog = args.occupancy ? await readTimeSeriesCsv(args.occupancy) : null;
  const report = runBacktest({ history, config, meetings, occupancyLog });
  printReport(report);
  const output = path.join(strategyDataDir, "backtest-latest.json");
  await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), synthetic: Boolean(args.synthetic), ...report }, null, 2)}\n`);
  console.log(`\nReport written to ${path.relative(process.cwd(), output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
