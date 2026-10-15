import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, ahuRunning, baselineAirflowAt } from "../scripts/strategy/config.mjs";
import { stepCo2 } from "../scripts/strategy/co2-model.mjs";
import { decaySegments, fitVolumeAndGeneration, nightBaseline, roomSeries, sensorOffsets } from "../scripts/strategy/calibrate.mjs";
import { runBacktest, syntheticHistory } from "../scripts/strategy/backtest.mjs";
import { parseTime } from "../scripts/strategy/csv.mjs";

const config = DEFAULT_CONFIG;
const start = Date.parse("2026-10-05T00:00:00+08:00");

function syntheticRoom({ days = 3, lps = 60, offsets = {} }) {
  const series = [];
  const log = [];
  let ppm = 431;
  for (let t = start; t < start + days * 86400000; t += 600000) {
    const hour = ((t - start) / 3600000) % 24;
    const people = hour >= 9 && hour < 12 ? 4 : hour >= 14 && hour < 15 ? 8 : 0;
    log.push({ t, values: { people } });
    ppm = stepCo2(ppm, people, lps, 600, { ...config, co2: { ...config.co2, outdoorPpm: 431 } });
    // The log entry at t covers the following interval; the reading at its end reflects it.
    series.push({ t: t + 600000, readings: Object.fromEntries(config.co2.sensors.map((id) => [id, ppm + (offsets[id] || 0)])) });
  }
  return { series, log };
}

test("sensor offsets, room series and night baseline", () => {
  const offsets = { AM103_06: 138, AM103_08: -128, AM308_01: -15 };
  const { series } = syntheticRoom({ offsets });
  const found = sensorOffsets(series, config.co2.sensors);
  assert.deepEqual(found, { AM103_05: 0, AM103_06: 138, AM103_07: 0, AM103_08: -128, AM308_01: -15 });
  const room = roomSeries(series, config.co2.sensors, found);
  assert.equal(nightBaseline(room).outdoorPpm, 431);
});

test("decay fit recovers the airflow after occupied periods", () => {
  const { series } = syntheticRoom({ lps: 60 });
  const room = roomSeries(series, config.co2.sensors, {});
  const segments = decaySegments(room, 431, config.room.volumeM3);
  assert.ok(segments.length >= 2);
  for (const segment of segments) assert.ok(Math.abs(segment.lps - 60) <= 2, `decay ${segment.lps} L/s`);
});

test("volume and generation fit from a head-count log", () => {
  const { series, log } = syntheticRoom({ lps: 60 });
  const room = roomSeries(series, config.co2.sensors, {});
  const fit = fitVolumeAndGeneration(room, log, { ...config, co2: { ...config.co2, outdoorPpm: 431 } }, () => 60);
  assert.equal(fit.volumeM3, 280);
  assert.ok(Math.abs(fit.generationLpsPerPerson - 0.005) < 0.0003);
});

test("AHU schedule switches the baseline to infiltration", () => {
  const scheduled = { ...config, ventilation: { ...config.ventilation, ahuSchedule: { weekday: [["08:00", "18:00"]], weekend: [] }, ahuOffLps: 22 } };
  const wednesday = (time) => Date.parse(`2026-10-14T${time}:00+08:00`);
  assert.equal(ahuRunning(wednesday("10:00"), scheduled), true);
  assert.equal(ahuRunning(wednesday("19:00"), scheduled), false);
  assert.equal(baselineAirflowAt(wednesday("19:00"), scheduled), 22);
  assert.equal(baselineAirflowAt(wednesday("10:00"), scheduled), 90);
  assert.equal(ahuRunning(wednesday("19:00"), config), true, "no schedule means always running");
});

test("local times in CSV logs are Hong Kong time", () => {
  assert.equal(parseTime("2026-10-14 14:00"), Date.parse("2026-10-14T06:00:00Z"));
  assert.equal(parseTime("2026-10-14T14:00:00Z"), Date.parse("2026-10-14T14:00:00Z"));
});

test("synthetic backtest meets the 800 ppm limit and reports metrics", () => {
  const history = syntheticHistory({ days: 3, config });
  const report = runBacktest({ history, config });
  assert.ok(report.period.steps > 400);
  assert.equal(report.closedLoop.exceedanceSteps, 0);
  assert.ok(report.forecast.rmse30 !== null && report.forecast.rmse60 !== null);
  assert.ok(Number.isFinite(report.savings.airM3));
  assert.ok(report.occupancy.maxEstimate > 4, "detects the synthetic meetings");
});
