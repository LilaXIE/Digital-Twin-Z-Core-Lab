import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../scripts/strategy/config.mjs";
import { applyGuards, Controller, shouldRelease } from "../scripts/strategy/controller.mjs";
import { stepCo2 } from "../scripts/strategy/co2-model.mjs";
import { OccupancyEstimator } from "../scripts/strategy/occupancy-estimator.mjs";

const config = DEFAULT_CONFIG;

test("guards clamp, rate-limit and open fully above the CO₂ safety level", () => {
  assert.deepEqual(applyGuards({ desiredPct: 5, previousPct: null, measuredPpm: 600, minPct: 12, config }), { pct: 12, reasons: ["limit"] });
  assert.deepEqual(applyGuards({ desiredPct: 60, previousPct: 30, measuredPpm: 600, config }), { pct: 40, reasons: ["rate-limit"] });
  assert.deepEqual(applyGuards({ desiredPct: 0, previousPct: 30, measuredPpm: 600, config }), { pct: 20, reasons: ["rate-limit"] });
  assert.deepEqual(applyGuards({ desiredPct: 20, previousPct: 20, measuredPpm: 781, config }), { pct: 100, reasons: ["co2-safety"] });
});

test("release on data gap or unhealthy bridge", () => {
  const nowMs = 100 * 60000;
  assert.equal(shouldRelease({ nowMs, lastDataMs: nowMs - 19 * 60000, bridgeHealthy: true, config }), null);
  assert.equal(shouldRelease({ nowMs, lastDataMs: nowMs - 21 * 60000, bridgeHealthy: true, config }), "data-gap");
  assert.equal(shouldRelease({ nowMs, lastDataMs: nowMs, bridgeHealthy: false, config }), "bridge-unhealthy");
});

test("L2 is refused without authorisation and a writer", async () => {
  const controller = new Controller(config);
  await assert.rejects(controller.setMode("L2"), /FMO authorisation/);
  assert.equal(controller.mode, "L1");
});

test("L2 writes guarded commands, relinquishes on a data gap and logs every write", async () => {
  const calls = [];
  const writer = {
    configured: true,
    async write(pct, priority) { calls.push(["write", pct, priority]); },
    async relinquish(priority) { calls.push(["relinquish", priority]); },
  };
  const log = [];
  const authorised = { ...config, control: { ...config.control, l2Authorised: true, bacnetPriority: 8 } };
  const controller = new Controller(authorised, { writer, log: (entry) => log.push(entry) });
  await controller.setMode("L2");
  const context = (nowMs, lastDataMs) => ({ nowMs, measuredPpm: 600, people: 2, lastDataMs, bridgeHealthy: true });
  let result = await controller.step({ damperPct: 50, minLps: 20 }, context(0, 0));
  assert.equal(result.written, true);
  assert.deepEqual(calls[0], ["write", 50, 8]);
  result = await controller.step({ damperPct: 10, minLps: 20 }, context(600000, 600000));
  assert.deepEqual(calls[1], ["write", 40, 8], "rate-limited to −10 %");
  result = await controller.step({ damperPct: 10, minLps: 20 }, context(1200000 + 21 * 60000, 1200000 - 60000));
  assert.equal(result.released, "data-gap");
  assert.deepEqual(calls[2], ["relinquish", 8]);
  assert.equal(controller.mode, "L1");
  assert.ok(log.some((entry) => entry.event === "bacnet-write") && log.some((entry) => entry.event === "bacnet-relinquish"));
});

test("leaving L2 relinquishes immediately", async () => {
  const calls = [];
  const writer = { configured: true, async write() { calls.push("write"); }, async relinquish() { calls.push("relinquish"); } };
  const controller = new Controller({ ...config, control: { ...config.control, l2Authorised: true, bacnetPriority: 8 } }, { writer });
  await controller.setMode("L2");
  await controller.step({ damperPct: 30, minLps: 20 }, { nowMs: 0, measuredPpm: 600, people: 1, lastDataMs: 0, bridgeHealthy: true });
  await controller.setMode("L0");
  assert.deepEqual(calls, ["write", "relinquish"]);
});

test("shadow mode tracks a simulated trajectory without writing", async () => {
  const controller = new Controller(config);
  const first = await controller.step({ damperPct: 30, minLps: 20 }, { nowMs: 0, measuredPpm: 600, people: 4, lastDataMs: 0, bridgeHealthy: true });
  assert.equal(first.written, false);
  assert.equal(first.shadowPpm, 600);
  const second = await controller.step({ damperPct: 30, minLps: 20 }, { nowMs: 600000, measuredPpm: 610, people: 4, lastDataMs: 600000, bridgeHealthy: true });
  assert.ok(Math.abs(second.shadowPpm - stepCo2(600, 4, 90, 600, config)) < 1e-9);
});

function noisy(seed) {
  let state = seed;
  return () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296 - 0.5; };
}

test("CO₂-implied occupancy converges and follows a door-marked jump", () => {
  const estimator = new OccupancyEstimator(config);
  const random = noisy(7);
  let ppm = 450;
  let t = 0;
  let estimate;
  const run = (people, steps, doorAtStart) => {
    for (let i = 0; i < steps; i += 1) {
      ppm = stepCo2(ppm, people, 90, 600, config);
      t += 600000;
      estimate = estimator.update({ t, roomPpm: ppm + random() * 10, lps: 90, doorEvent: doorAtStart && i === 0 });
    }
  };
  estimator.update({ t, roomPpm: ppm, lps: 90 });
  run(4, 18, false);
  assert.ok(Math.abs(estimate.current - 4) < 1, `steady estimate ${estimate.current}`);
  run(8, 4, true);
  assert.ok(estimate.current > 6, `after jump ${estimate.current}`);
  assert.equal(estimate.measured, false);
  const measured = estimator.update({ t: t + 600000, roomPpm: stepCo2(ppm, 8, 90, 600, config), lps: 90, measured: { available: true, count: 9 } });
  assert.equal(measured.measured, true);
  assert.ok(measured.current >= 9);
});
