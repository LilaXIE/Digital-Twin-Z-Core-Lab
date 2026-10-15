import test from "node:test";
import assert from "node:assert/strict";
import { assessCo2Health, calibrationSummary, correctCo2Samples, correctTelemetry } from "../scripts/co2-quality.mjs";
import { DEFAULT_CONFIG } from "../scripts/strategy/config.mjs";
import { roomCo2 } from "../scripts/strategy/sensors.mjs";

const config = { ...DEFAULT_CONFIG, co2: { ...DEFAULT_CONFIG.co2, outdoorPpm: 433, sensorOffsetsPpm: { AM103_06: 138, AM103_08: -130 } }, calibration: { calibratedAt: "2026-10-14T16:22:52Z" } };
const nowMs = Date.parse("2026-10-16T06:00:00Z");

test("telemetry carries the corrected CO₂ and keeps the raw value", () => {
  const corrected = correctTelemetry({ deviceId: "AM103_08", values: { co2: 358, temperature: 24 }, receivedAt: "x" }, config);
  assert.equal(corrected.values.co2, 488);
  assert.equal(corrected.values.temperature, 24);
  assert.deepEqual(corrected.corrections, { co2: { raw: 358, offsetPpm: -130 } });
  const other = { deviceId: "WS523_01", values: { activePower: 12 } };
  assert.equal(correctTelemetry(other, config), other);
});

test("history samples are corrected in both shapes", () => {
  assert.deepEqual(correctCo2Samples("AM103-06", [[1, 640]], config), [[1, 502]]);
  assert.deepEqual(correctCo2Samples("AM103-06", [{ time: 1, value: 640 }], config), [{ time: 1, value: 502 }]);
  assert.deepEqual(correctCo2Samples("AM103-05", [[1, 500]], config), [[1, 500]]);
});

test("calibration summary uses device ids", () => {
  const summary = calibrationSummary(config);
  assert.equal(summary.co2.offsets["AM103-08"], -130);
  assert.equal(summary.co2.offsets["AM103-05"], 0);
  assert.equal(summary.co2.outdoorPpm, 433);
});

test("health check flags implausible sensors", () => {
  const series = (ppm, minutes = 150, step = 10, jitter = true) => Array.from({ length: minutes / step + 1 }, (_, i) => ({ t: nowMs - (minutes - i * step) * 60000, ppm: jitter ? ppm + (i % 3) : ppm }));
  const history = {
    AM103_05: series(500), AM103_06: series(505), AM103_07: series(498),
    AM103_08: series(330), // corrected value below the outdoor baseline
    AM308_01: series(520, 150, 10, false), // stuck on one value
  };
  const health = assessCo2Health({ history, nowMs, config });
  assert.equal(health["AM103-05"].state, "ok");
  assert.equal(health["AM103-08"].state, "suspect");
  assert.ok(health["AM103-08"].reasons.includes("below-outdoor"));
  assert.ok(health["AM103-08"].reasons.includes("deviates"));
  assert.deepEqual(health["AM308-01"].reasons, ["flatline"]);

  const stale = assessCo2Health({ history: { AM103_05: [{ t: nowMs - 3 * 3600000, ppm: 500 }] }, nowMs, config });
  assert.equal(stale["AM103-05"].state, "stale");
});

test("room CO₂ leaves flagged sensors out unless nothing else is fresh", () => {
  const readings = { AM103_05: { ppm: 500, t: nowMs }, AM103_07: { ppm: 510, t: nowMs }, AM103_08: { ppm: 250, t: nowMs } };
  const plain = { ...config, co2: { ...config.co2, sensorOffsetsPpm: {} } };
  assert.equal(roomCo2(readings, nowMs, plain).ppm, 500);
  assert.equal(roomCo2(readings, nowMs, plain, new Set(["AM103_08"])).ppm, 505);
  assert.equal(roomCo2({ AM103_08: { ppm: 250, t: nowMs } }, nowMs, plain, new Set(["AM103_08"])).ppm, 250);
});
