import test from "node:test";
import assert from "node:assert/strict";
import { buildRoomHistoryQueries, roomHistoryFromRows, roomHistoryWindow } from "../scripts/room-history.mjs";

test("window is clamped and aligned to the step grid", () => {
  const stop = Date.parse("2026-10-15T03:27:00Z");
  const window = roomHistoryWindow({ hours: 500, stepMinutes: 1, stop });
  assert.equal(window.hours, 48);
  assert.equal(window.stepMinutes, 5);
  assert.equal(window.stop, Date.parse("2026-10-15T03:30:00Z"));
  assert.equal(window.stop - window.start, 48 * 3600000);
  const defaults = roomHistoryWindow({ stop });
  assert.equal(defaults.hours, 24);
  assert.equal(defaults.stepMinutes, 10);
});

test("queries are restricted to the room sensors and quote the bucket", () => {
  const queries = buildRoomHistoryQueries({ bucket: 'zb"202', solarMeasurement: "hko-solar-radiation", start: 0, stop: 3600000, stepMinutes: 10 });
  assert.match(queries.env, /from\(bucket: "zb\\"202"\)/);
  assert.match(queries.env, /"AM308_01"/);
  assert.match(queries.power, /"WS523_06"/);
  assert.match(queries.events, /magnet_\?status/);
  assert.match(queries.solar, /hko-solar-radiation/);
});

test("rows become per-sensor series and active transitions become events", () => {
  const history = roomHistoryFromRows({
    env: [
      { _time: "2026-10-15T01:10:00Z", _value: 612.4, _measurement: "AM103_05", _field: "co2_ppm" },
      { _time: "2026-10-15T01:00:00Z", _value: 600, _measurement: "AM103_05", _field: "co2_ppm" },
      { _time: "2026-10-15T01:00:00Z", _value: 24.123, _measurement: "AM103_05", _field: "temperature_c" },
      { _time: "2026-10-15T01:00:00Z", _value: 58.2, _measurement: "AM308_01", _field: "relative_humidity_pct" },
      { _time: "bad", _value: 1, _measurement: "AM103_05", _field: "co2_ppm" },
    ],
    power: [{ _time: "2026-10-15T01:00:00Z", _value: 41.26, _measurement: "WS523_02", _field: "active_power" }],
    solar: [{ _time: "2026-10-15T01:00:00Z", _value: 512.6 }],
    events: [
      { _time: "2026-10-15T01:00:00Z", _value: 0, _measurement: "WS301_01", _field: "magnet_status" },
      { _time: "2026-10-15T01:05:00Z", _value: 1, _measurement: "WS301_01", _field: "magnet_status" },
      { _time: "2026-10-15T01:06:00Z", _value: 1, _measurement: "WS301_01", _field: "magnet_status" },
      { _time: "2026-10-15T01:07:00Z", _value: 1, _measurement: "WS303_01", _field: "leakage_status" },
    ],
  });
  assert.deepEqual(history.sensors["AM103-05"].co2, [[Date.parse("2026-10-15T01:00:00Z"), 600], [Date.parse("2026-10-15T01:10:00Z"), 612]]);
  assert.deepEqual(history.sensors["AM103-05"].temperature, [[Date.parse("2026-10-15T01:00:00Z"), 24.12]]);
  assert.deepEqual(history.sensors["AM308-01"].humidity, [[Date.parse("2026-10-15T01:00:00Z"), 58.2]]);
  assert.deepEqual(history.sockets["WS523-02"], [[Date.parse("2026-10-15T01:00:00Z"), 41.3]]);
  assert.deepEqual(history.solar, [[Date.parse("2026-10-15T01:00:00Z"), 513]]);
  assert.deepEqual(history.events.map((event) => [event.deviceId, event.type]), [["WS301-01", "door"], ["WS303-01", "leak"]]);
});
