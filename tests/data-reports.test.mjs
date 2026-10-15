import test from "node:test";
import assert from "node:assert/strict";
import { deviceHealthFromRows } from "../scripts/device-health.mjs";
import { isWorkingHour, standbyReport } from "../scripts/standby.mjs";

const nowMs = Date.parse("2026-10-16T12:00:00+08:00");

test("device health measures uplinks, the longest silence and completeness", () => {
  const rows = [];
  // A 10-minute sensor that went quiet for three hours, and a door contact that reported twice.
  for (let t = nowMs - 24 * 3600000 + 300000; t <= nowMs; t += 600000) {
    if (t > nowMs - 8 * 3600000 && t < nowMs - 5 * 3600000) continue;
    rows.push({ _measurement: "AM103_05", _time: new Date(t).toISOString() });
  }
  rows.push({ _measurement: "WS301_01", _time: new Date(nowMs - 20 * 3600000).toISOString() }, { _measurement: "WS301_01", _time: new Date(nowMs - 2 * 3600000).toISOString() });
  const health = deviceHealthFromRows(rows, { nowMs, hours: 24 });
  assert.equal(health["AM103-05"].intervalMinutes, 10);
  assert.ok(health["AM103-05"].longestGapMinutes >= 180);
  assert.ok(health["AM103-05"].completeness > 85 && health["AM103-05"].completeness < 90);
  assert.equal(health["WS301-01"].completeness, null, "event-driven devices get no completeness");
  assert.equal(health["WS301-01"].uplinks, 2);
});

test("standby power counts only hours outside working time", () => {
  assert.equal(isWorkingHour(Date.parse("2026-10-16T10:00:00+08:00")), true);
  assert.equal(isWorkingHour(Date.parse("2026-10-17T10:00:00+08:00")), false, "Saturday");
  const rows = [];
  for (let t = nowMs - 7 * 86400000; t < nowMs; t += 3600000) {
    const end = t + 3600000;
    rows.push({ _measurement: "WS523_02", _time: new Date(end).toISOString(), _value: isWorkingHour(t) ? 60 : 15 });
    rows.push({ _measurement: "WS523_04", _time: new Date(end).toISOString(), _value: 0 });
  }
  const report = standbyReport(rows);
  assert.equal(report.sockets[0].id, "WS523-02");
  assert.equal(report.sockets[0].standbyW, 15);
  assert.equal(report.sockets[0].workingW, 60);
  assert.equal(report.sockets[0].yearKwh, Math.round(15 * report.standbyHoursPerYear / 1000));
  assert.equal(report.sockets[1].yearKwh, 0);
});
