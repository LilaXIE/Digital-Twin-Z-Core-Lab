import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../scripts/strategy/config.mjs";
import { StrategyService } from "../scripts/strategy/service.mjs";

const hkoCsv = (header, value) => `Date time,Automatic Weather Station,${header}\n202610141300,King's Park,${value}\n`;
const fakeFetch = async (url) => ({
  ok: true,
  text: async () => (url.includes("temperature") ? hkoCsv("Air Temperature(degree Celsius)", 29) : hkoCsv("Relative Humidity(percent)", 80)),
});

test("service produces, logs and restores recommendations", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "zb202-strategy-"));
  try {
    let nowMs = Date.parse("2026-10-14T05:00:00Z");
    const service = new StrategyService({ config: DEFAULT_CONFIG, dataDir: dir, now: () => nowMs, fetchImpl: fakeFetch, logger: { warn() {}, error() {} } });
    await service.init();
    const messages = [];
    service.onRecommendation((message) => messages.push(message));

    const empty = await service.tick();
    assert.equal(empty.status, "no-data");

    const sensors = ["AM103_05", "AM103_07", "AM308_01"];
    const feed = (ppm) => {
      for (const deviceId of sensors) {
        service.ingestTelemetry({ deviceId, values: { co2: ppm, temperature: 24, humidity: 60 }, receivedAt: new Date(nowMs - 60000).toISOString() });
      }
    };
    service.warmUp([
      { t: nowMs - 1200000, readings: { AM103_05: 540, AM103_07: 540 } },
      { t: nowMs - 600000, readings: { AM103_05: 560, AM103_07: 560 } },
    ]);
    feed(580);
    await service.updateCalendar({ action: "upsert", meeting: { title: "组会", start: "2026-10-14T05:40:00Z", end: "2026-10-14T06:40:00Z", people: 8 } });
    const first = await service.tick();
    assert.equal(first.status, "ok");
    assert.equal(first.co2.current, 580);
    assert.equal(first.controlMode, "L1");
    assert.equal(first.energy.outdoorSource, "hko-kings-park");
    assert.equal(first.calendar.length, 1);
    assert.equal(first.co2.average8h, 560);
    assert.ok(first.co2.peakRecommended <= 750);
    assert.equal("exact" in first, false);

    nowMs += 600000;
    feed(600);
    const second = await service.tick();
    assert.ok(Number.isFinite(second.energy.savedTodayM3));
    assert.equal(service.recommendationHistory(24).length, 2);
    assert.equal(messages.length, 3);

    const log = (await readFile(path.join(dir, "shadow-log.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(log.filter((entry) => entry.kind === "recommendation").length, 2);
    assert.ok(log.every((entry) => entry.kind !== "recommendation" || entry.commandPct !== null));

    const restored = new StrategyService({ config: DEFAULT_CONFIG, dataDir: dir, now: () => nowMs, fetchImpl: fakeFetch });
    await restored.init();
    assert.equal(restored.recommendationHistory(24).length, 2);
    assert.equal(restored.calendar.meetings[0].title, "组会");

    await assert.rejects(service.updateCalendar({ action: "upsert", meeting: { start: "x", end: "y", people: 3 } }), /Invalid meeting time/);
    await service.updateCalendar({ action: "delete", meeting: { id: restored.calendar.meetings[0].id } });
    assert.equal(service.calendar.meetings.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("no savings accrue while the AHU is off, and the week is rebuilt from history", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "zb202-strategy-"));
  try {
    // Friday 20:30 Hong Kong time: the AHU stopped at 18:00 and restarts on Monday 08:00.
    let nowMs = Date.parse("2026-10-16T20:30:00+08:00");
    const service = new StrategyService({ config: DEFAULT_CONFIG, dataDir: dir, now: () => nowMs, fetchImpl: fakeFetch, logger: { warn() {}, error() {} } });
    await service.init();
    // Monday 00:00 → now at 10-minute steps; a steady room at 520 ppm.
    const weekStart = Date.parse("2026-10-12T00:00:00+08:00");
    const series = [];
    for (let t = weekStart; t <= nowMs - 600000; t += 600000) series.push({ t, readings: { AM103_05: 520, AM103_07: 520 } });
    const rebuilt = await service.warmUp(series, { backfillSince: weekStart });
    assert.ok(rebuilt > 600);
    const totals = service.savingsTotals(nowMs);
    assert.ok(totals.week.airM3 > totals.today.airM3, "the week holds more than today");
    assert.equal(totals.coveredSince, new Date(weekStart).toISOString());

    for (const deviceId of ["AM103_05", "AM103_07"]) service.ingestTelemetry({ deviceId, values: { co2: 520 }, receivedAt: new Date(nowMs - 60000).toISOString() });
    const before = service.savingsTotals(nowMs).today.airM3;
    const off = await service.tick();
    assert.equal(off.status, "ahu-off");
    assert.equal(off.reasonCode.code, "ahu-off");
    assert.equal(off.ahu.running, false);
    assert.equal(off.ahu.nextStart, new Date(Date.parse("2026-10-19T08:00:00+08:00")).toISOString());
    assert.ok(Number.isFinite(off.ahu.ppmAtNextStart));
    nowMs += 600000;
    await service.tick();
    assert.equal(service.savingsTotals(nowMs).today.airM3, before, "evening ticks add nothing");

    // A restart reads the rebuilt entries back from the shadow log instead of recomputing them.
    const restored = new StrategyService({ config: DEFAULT_CONFIG, dataDir: dir, now: () => nowMs, fetchImpl: fakeFetch });
    await restored.init();
    assert.equal(await restored.warmUp(series, { backfillSince: weekStart }), 0);
    assert.equal(restored.savingsTotals(nowMs).week.airM3, service.savingsTotals(nowMs).week.airM3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
