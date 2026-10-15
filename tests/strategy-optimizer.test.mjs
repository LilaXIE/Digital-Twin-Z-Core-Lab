import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../scripts/strategy/config.mjs";
import { optimizeBisection, optimizeDynamic } from "../scripts/strategy/optimizer.mjs";
import { buildRecommendation } from "../scripts/strategy/recommend.mjs";

const config = DEFAULT_CONFIG;
const input = (startPpm, people, extra = {}) => ({ startPpm, nowMs: 0, horizonMinutes: 60, occupancyAt: () => people, config, ...extra });

test("bisection finds the least constant airflow for the meeting example", () => {
  const result = optimizeBisection(input(500, 8));
  assert.ok(result.lps >= 97 && result.lps <= 98.5, `got ${result.lps}`);
  assert.ok(result.peak <= config.co2.targetPpm + 1e-9);
  assert.equal(result.atMax, false);
  const higherStart = optimizeBisection(input(650, 8));
  assert.ok(higherStart.lps > 117 && higherStart.lps < 120, `got ${higherStart.lps}`);
});

test("bisection respects minimum outdoor air", () => {
  const result = optimizeBisection(input(450, 1));
  assert.equal(result.lps, result.minLps);
  assert.ok(Math.abs(result.minLps - 16.5) < 0.1);
});

test("bisection reports at-max when the limit cannot be met", () => {
  const small = { ...config, ventilation: { ...config.ventilation, damperCurve: [[0, 0], [100, 60]] } };
  const result = optimizeBisection(input(700, 10, { config: small }));
  assert.equal(result.atMax, true);
  assert.equal(result.lps, 60);
});

test("dynamic programming plan keeps CO₂ at target with discrete damper steps", () => {
  const result = optimizeDynamic(input(500, 8, { enthalpyDeltaKjPerKg: 20 }));
  assert.equal(result.plan.length, 6);
  assert.equal(result.atMax, false);
  assert.ok(result.peak <= config.co2.targetPpm + 1e-9, `peak ${result.peak}`);
  for (const step of result.plan) assert.equal(step.damperPct % config.ventilation.damperStepPct, 0);
  // A time-varying plan never needs more total air than the best constant airflow rounded up to a damper step.
  const constant = optimizeBisection(input(500, 8));
  const total = result.plan.reduce((sum, step) => sum + step.lps, 0);
  assert.ok(total <= Math.ceil(constant.lps / 15) * 15 * 6 + 1e-9);
});

test("dynamic programming pre-ventilates before a meeting", () => {
  const meetingAt = 30 * 60000;
  const result = optimizeDynamic(input(600, 0, { occupancyAt: (t) => (t >= meetingAt ? 8 : 1), horizonMinutes: 90, enthalpyDeltaKjPerKg: 20 }));
  assert.equal(result.atMax, false);
  assert.ok(result.peak <= config.co2.targetPpm + 1e-9);
});

test("recommendation message follows the documented format", () => {
  const nowMs = Date.parse("2026-10-14T05:00:00Z"); // 13:00 HKT
  const meetings = [{ id: "m1", title: "组会", start: "2026-10-14T06:00:00Z", end: "2026-10-14T07:00:00Z", people: 8 }];
  const rec = buildRecommendation({
    nowMs, roomPpm: 612, occupancy: { current: 3, measured: false }, meetings, config,
    outdoor: { temperatureC: 29, humidityPct: 80 }, indoor: { temperatureC: 24, humidityPct: 60 },
  });
  assert.equal(rec.type, "recommendation");
  assert.equal(rec.horizonMinutes, 120, "horizon extends to the meeting end");
  assert.equal(rec.occupancy.current, 3);
  assert.equal(rec.occupancy.measured, false);
  assert.equal(rec.co2.limit, 800);
  assert.equal(rec.co2.target, 750);
  assert.ok(rec.co2.peakRecommended <= 750);
  assert.ok(rec.co2.peakBaseline > rec.co2.peakRecommended || rec.airflow.recommendedLps >= rec.airflow.baselineLps);
  assert.equal(rec.co2.forecastRecommended.length, 120 / 5 + 1);
  assert.ok(rec.airflow.recommendedLps >= rec.airflow.minLps);
  assert.ok(Number.isInteger(rec.airflow.recommendedDamperPct));
  assert.match(rec.reason, /14:00 组会预计 8 人/);
  assert.equal(rec.meeting.id, "m1");
});
