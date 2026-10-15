import test from "node:test";
import assert from "node:assert/strict";
import { roomState, sentenceText } from "../web/src/twin/ui/room-state.js";

const t = (key, vars = {}) => `${key}${Object.keys(vars).length ? JSON.stringify(vars) : ""}`;

test("after hours reports doors and leaks only when known", () => {
  assert.deepEqual(roomState({ working: false, safety: { doorsKnown: true, doorsClosed: true, leakKnown: true, leakFree: true } }).parts, ["sDoorClosed", "sNoLeak"]);
  assert.deepEqual(roomState({ working: false, safety: {} }).parts, []);
  assert.equal(sentenceText(roomState({ working: false, safety: { doorsKnown: true, doorsClosed: false } }), t, "zh"), "sAfterHours，sDoorOpen");
});

test("unknown occupancy describes the environment without judging people", () => {
  assert.equal(roomState({ working: true, occupancy: null, co2: 612 }).key, "sUnknownGood");
  assert.equal(roomState({ working: true, occupancy: null, co2: 900 }).key, "sUnknownCaution");
  assert.equal(roomState({ working: true, occupancy: null, co2: 1200 }).key, "sUnknownPoor");
  assert.equal(roomState({ working: true, occupancy: null }).key, "sNoData");
});

test("in use: good air, estimated wording, rising and high CO2", () => {
  assert.deepEqual(roomState({ working: true, occupancy: { count: 3, measured: true }, co2: 612 }), { state: "in-use", key: "sInUseGood", vars: { n: 3 }, emphasis: "co2" });
  assert.equal(roomState({ working: true, occupancy: { count: 3, measured: false }, co2: 612 }).key, "sInUseGoodEstimated");
  assert.equal(roomState({ working: true, occupancy: { count: 3, measured: true }, co2: 760, co2Rise30: 90 }).key, "sInUseRising");
  assert.equal(roomState({ working: true, occupancy: { count: 3, measured: true }, co2: 720, recommendation: { airflow: { recommendedLps: 120, baselineLps: 90 } } }).key, "sInUseRising");
  assert.equal(roomState({ working: true, occupancy: { count: 3, measured: true }, co2: 1100 }).key, "sInUseHigh");
  assert.equal(roomState({ working: true, occupancy: { count: 3, measured: true }, co2: 850 }).key, "sInUseCaution");
});

test("vacant counts sockets still drawing power", () => {
  const sockets = [{ power: 40, stale: false }, { power: 0, stale: false }, { power: 120, stale: false }, { power: 80, stale: true }, { power: null, stale: true }];
  assert.deepEqual(roomState({ working: true, occupancy: { count: 0, measured: true }, sockets }).vars, { total: 3, on: 2 });
  assert.equal(roomState({ working: true, occupancy: { count: 0, measured: true } }).key, "sVacant");
});
