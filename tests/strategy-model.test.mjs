import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, damperToLps, lpsToDamper, minimumOutdoorAirLps } from "../scripts/strategy/config.mjs";
import { impliedOccupancy, simulateCo2, stepCo2, steadyStateLps, timeConstantMinutes } from "../scripts/strategy/co2-model.mjs";
import { enthalpy, intervalSavings, outdoorAirCoolingKw } from "../scripts/strategy/energy.mjs";
import { horizonMinutes, hkTime, occupancyForecast, scheduledPriorAt } from "../scripts/strategy/occupancy-forecast.mjs";
import { roomCo2, measuredOccupancy, doorChanged } from "../scripts/strategy/sensors.mjs";

const config = DEFAULT_CONFIG;
const close = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ""} expected ${expected} ± ${tolerance}, got ${actual}`);

test("steady-state airflow matches the strategy table", () => {
  close(steadyStateLps(4, 750, config), 64.5, 0.5);
  close(steadyStateLps(8, 750, config), 129, 0.5);
  close(timeConstantMinutes(64.5, config), 72, 1);
  close(timeConstantMinutes(129, config), 36, 1);
  close(minimumOutdoorAirLps(1, config), 16.5, 0.1);
});

test("exact step reproduces the 8-person meeting example", () => {
  const people = () => 8;
  const end = (lps, start) => simulateCo2({ startPpm: start, startMs: 0, minutes: 60, occupancyAt: people, airflowAt: () => lps, config }).at(-1).ppm;
  assert.ok(end(98, 500) <= 750, "98 L/s keeps 60 minutes at or below 750 ppm");
  assert.ok(end(97, 500) > 750);
  close(end(118.5, 650), 750, 2);
});

test("no airflow accumulates CO₂ linearly", () => {
  close(stepCo2(500, 1, 0, 3600, config), 500 + 0.005 * 1e6 * 3600 / 280000, 1e-9);
});

test("implied occupancy inverts the model", () => {
  const c1 = stepCo2(520, 4, 90, 600, config);
  close(impliedOccupancy(520, c1, 90, 600, config), 4, 1e-6);
  close(impliedOccupancy(520, stepCo2(520, 3, 0, 600, config), 0, 600, config), 3, 1e-6);
});

test("damper curve and its inverse", () => {
  const curve = [[0, 10], [50, 100], [100, 300]];
  assert.equal(damperToLps(25, curve), 55);
  assert.equal(damperToLps(150, curve), 300);
  close(lpsToDamper(damperToLps(73, curve), curve), 73, 1e-9);
  assert.equal(lpsToDamper(5, curve), 0);
});

test("enthalpy and cooling load", () => {
  close(enthalpy(24, 50), 47.8, 0.6);
  close(enthalpy(30, 80), 85.8, 1.2);
  const outdoor = { temperatureC: 30, humidityPct: 80 };
  const indoor = { temperatureC: 24, humidityPct: 60 };
  assert.equal(outdoorAirCoolingKw(100, indoor, outdoor, config), 0, "no load when outdoor enthalpy is lower");
  const kw = outdoorAirCoolingKw(100, outdoor, indoor, config);
  const savings = intervalSavings({ baselineLps: 100, recommendedLps: 0, seconds: 3600, outdoor, indoor, config });
  close(savings.coolingKwh, kw, 1e-9);
  close(savings.electricKwh, kw / config.energy.plantCop, 1e-9);
  assert.equal(savings.airM3, 360);
});

test("Hong Kong time, schedule prior and forecast", () => {
  const wednesday10 = Date.parse("2026-10-14T10:00:00+08:00");
  assert.equal(hkTime(wednesday10).label, "10:00");
  assert.equal(scheduledPriorAt(wednesday10, config), 1);
  assert.equal(scheduledPriorAt(Date.parse("2026-10-14T20:00:00+08:00"), config), 0);
  assert.equal(scheduledPriorAt(Date.parse("2026-10-17T10:00:00+08:00"), config), 0, "Saturday");
  const meetings = [{ start: "2026-10-14T03:00:00Z", end: "2026-10-14T04:00:00Z", people: 8 }];
  const forecast = occupancyForecast({ nowMs: wednesday10, current: 3, meetings, config });
  assert.equal(forecast(wednesday10), 3);
  close(forecast(wednesday10 + 30 * 60000), 3 * Math.exp(-1) + 1 - Math.exp(-1), 1e-9);
  assert.equal(forecast(Date.parse("2026-10-14T03:15:00Z")), 8);
});

test("horizon extends to cover a meeting, capped at 180 minutes", () => {
  const now = Date.parse("2026-10-14T01:00:00Z");
  assert.equal(horizonMinutes(now, [], config), 60);
  assert.equal(horizonMinutes(now, [{ start: "2026-10-14T01:30:00Z", end: "2026-10-14T03:30:00Z", people: 6 }], config), 150);
  assert.equal(horizonMinutes(now, [{ start: "2026-10-14T01:30:00Z", end: "2026-10-14T06:00:00Z", people: 6 }], config), 180);
  assert.equal(horizonMinutes(now, [{ start: "2026-10-14T03:00:00Z", end: "2026-10-14T04:00:00Z", people: 6 }], config), 60, "meeting beyond the horizon");
});

test("room CO₂ uses offset-corrected median of fresh sensors", () => {
  const offsets = { ...config, co2: { ...config.co2, sensorOffsetsPpm: { AM103_06: 130, AM103_08: -130 } } };
  const now = 1_000_000_000;
  const readings = { AM103_05: { ppm: 450, t: now }, AM103_06: { ppm: 580, t: now }, AM103_08: { ppm: 320, t: now }, AM308_01: { ppm: 2000, t: now - 3600000 } };
  const room = roomCo2(readings, now, offsets);
  assert.equal(room.ppm, 450);
  assert.deepEqual(room.sensors.sort(), ["AM103_05", "AM103_06", "AM103_08"]);
  assert.equal(roomCo2({}, now, offsets), null);
});

test("measured occupancy needs enough reporting VS341 sensors", () => {
  const now = 1_000_000_000;
  const readings = Object.fromEntries(config.occupancy.occupancySensors.map((id, index) => [id, { value: index < 3 ? 1 : 0, t: now }]));
  assert.deepEqual(measuredOccupancy(readings, now, config), { available: true, count: 3, reporting: 10 });
  const stale = Object.fromEntries(Object.entries(readings).map(([id, reading], index) => [id, index < 4 ? { ...reading, t: now - 86400000 } : reading]));
  assert.equal(measuredOccupancy(stale, now, config).available, false);
});

test("door change detection", () => {
  const history = { WS301_01: [{ t: 0, value: 0 }, { t: 100, value: 1 }, { t: 200, value: 1 }] };
  assert.equal(doorChanged(history, 50, 150), true);
  assert.equal(doorChanged(history, 150, 250), false);
});
