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
