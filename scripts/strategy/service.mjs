// Runs the ventilation strategy inside the data bridge: ingests telemetry, recalculates every
// 10 minutes, keeps the shadow log and serves history and calendar messages.
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { baselineAirflowAt, damperToLps, strategyDataDir } from "./config.mjs";
import { Calendar } from "./calendar.mjs";
import { Controller } from "./controller.mjs";
import { addSavings, intervalSavings } from "./energy.mjs";
import { OccupancyEstimator } from "./occupancy-estimator.mjs";
import { hkDayStart, hkWeekStart, scheduledPriorAt } from "./occupancy-forecast.mjs";
import { buildRecommendation } from "./recommend.mjs";
import { doorChanged, latestNoise, measuredOccupancy, roomCo2, sensorKey } from "./sensors.mjs";
import { fetchHkoOutdoor } from "./weather.mjs";

const HISTORY_DAYS = 8;
const WEATHER_PATTERN = /weather|outdoor|meteorolog|aws|wx/i;

export class StrategyService {
  constructor({ config, dataDir = strategyDataDir, now = () => Date.now(), fetchImpl = fetch, writer, writePoint = null, logger = console }) {
    this.config = config;
    this.now = now;
    this.fetchImpl = fetchImpl;
    this.writePoint = writePoint;
    this.logger = logger;
    this.shadowLogFile = path.join(dataDir, "shadow-log.jsonl");
    this.calendar = new Calendar(path.join(dataDir, "calendar.json"), { maxOccupancy: config.room.maxOccupancy });
    this.estimator = new OccupancyEstimator(config);
    this.controller = new Controller(config, { writer, log: (entry) => this.appendLog({ kind: "control", t: new Date(this.now()).toISOString(), ...entry }) });
    this.co2Readings = new Map();
    this.occupancyReadings = new Map();
    this.noiseReadings = new Map();
    this.indoorReadings = new Map();
    this.doorHistory = {};
    this.weatherOutdoor = null;
    this.hkoOutdoor = null;
    this.roomHistory = []; // { t, ppm } every tick, for the 8-hour average
    this.history = []; // compact recommendation entries
    this.pendingForecasts = []; // { dueMs, horizon, ppm } baseline forecasts awaiting measurement
    this.forecastErrors = []; // { t, horizon, error }
    this.latest = null;
    this.lastTickMs = null;
    this.lastDataMs = null;
    this.bridgeHealthy = true;
    this.listeners = new Set();
    this.excludedSensors = new Set(); // CO₂ sensors flagged by the bridge's health check
  }

  onRecommendation(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  async init() {
    await mkdir(path.dirname(this.shadowLogFile), { recursive: true });
    await this.calendar.load();
    await this.restoreHistory();
  }

  // telemetry: bridge message { deviceId, devEui, values, receivedAt }
  ingestTelemetry(telemetry) {
    const id = sensorKey(telemetry.deviceId || telemetry.devEui);
    const t = Date.parse(telemetry.receivedAt);
    const values = telemetry.values || {};
    if (!id || !Number.isFinite(t)) return;
    const newer = (map) => !map.has(id) || map.get(id).t <= t;
    if (WEATHER_PATTERN.test(id) || ["windSpeed", "windDirection", "rainfall"].some((key) => key in values)) {
      if (Number.isFinite(values.temperature) && Number.isFinite(values.humidity) && (!this.weatherOutdoor || this.weatherOutdoor.t <= t)) {
        this.weatherOutdoor = { temperatureC: values.temperature, humidityPct: values.humidity, t, source: "weather-station" };
      }
      return;
    }
    if (Number.isFinite(values.co2) && this.config.co2.sensors.includes(id) && newer(this.co2Readings)) {
      this.co2Readings.set(id, { ppm: values.co2, t });
      this.lastDataMs = Math.max(this.lastDataMs || 0, t);
    }
    if (Number.isFinite(values.temperature) && Number.isFinite(values.humidity) && this.config.co2.sensors.includes(id) && newer(this.indoorReadings)) {
      this.indoorReadings.set(id, { temperatureC: values.temperature, humidityPct: values.humidity, t });
    }
    if (Number.isFinite(values.occupancy) && newer(this.occupancyReadings)) this.occupancyReadings.set(id, { value: values.occupancy, t });
    if (Number.isFinite(values.noiseLaeq) && newer(this.noiseReadings)) this.noiseReadings.set(id, { value: values.noiseLaeq, t });
    if (Number.isFinite(values.magnetStatus) && this.config.occupancy.doorSensors.includes(id)) {
      const events = (this.doorHistory[id] ||= []);
      if (!events.some((event) => event.t === t)) {
        events.push({ t, value: values.magnetStatus });
        events.sort((a, b) => a.t - b.t);
        const cutoff = this.now() - 48 * 3600000;
        while (events.length > 1 && events[1].t < cutoff) events.shift();
      }
    }
  }

  setBridgeHealthy(healthy) { this.bridgeHealthy = healthy; }

  setExcludedSensors(ids) { this.excludedSensors = new Set([...ids].map(sensorKey)); }

  // series: [{ t, readings: { sensorId: ppm } }] at 10-minute steps, oldest first.
  warmUp(series) {
    for (const point of series) {
      if (this.lastTickMs && point.t <= this.lastTickMs) continue;
      const readings = Object.fromEntries(Object.entries(point.readings).map(([id, ppm]) => [id, { ppm, t: point.t }]));
      const room = roomCo2(readings, point.t, this.config);
      if (!room) continue;
      this.roomHistory.push({ t: point.t, ppm: room.ppm });
      this.estimator.update({ t: point.t, roomPpm: room.ppm, lps: this.actualLps(point.t), priorPeople: scheduledPriorAt(point.t, this.config) });
    }
    this.trimRoomHistory(this.now());
  }

  trimRoomHistory(nowMs) {
    const cutoff = nowMs - 8 * 3600000;
    this.roomHistory = this.roomHistory.filter((point) => point.t >= cutoff).sort((a, b) => a.t - b.t);
  }

  // Airflow the room actually receives: the BMS baseline unless L2 is writing commands.
  actualLps(tMs = this.now()) {
    if (this.controller.mode === "L2" && this.controller.writing && Number.isFinite(this.controller.previousCommandPct)) {
      return damperToLps(this.controller.previousCommandPct, this.config.ventilation.damperCurve);
    }
    return baselineAirflowAt(tMs, this.config);
  }

  async outdoorConditions(nowMs) {
    if (this.weatherOutdoor && nowMs - this.weatherOutdoor.t < 60 * 60000) return this.weatherOutdoor;
    if (!this.hkoOutdoor || nowMs - this.hkoOutdoor.fetchedAt > 9 * 60000) {
      try {
        this.hkoOutdoor = { ...await fetchHkoOutdoor(this.fetchImpl), fetchedAt: nowMs };
      } catch (error) {
        this.logger.warn?.(`[Strategy] HKO outdoor conditions unavailable: ${error.message}`);
        if (this.hkoOutdoor) this.hkoOutdoor.fetchedAt = nowMs;
      }
    }
    if (this.hkoOutdoor && nowMs - this.hkoOutdoor.t < 60 * 60000) return this.hkoOutdoor;
    return { ...this.config.energy.fallbackOutdoor, t: nowMs, source: "assumed" };
  }

  indoorConditions(nowMs) {
    const fresh = [...this.indoorReadings.values()].filter((reading) => nowMs - reading.t < 30 * 60000);
    if (!fresh.length) return { ...this.config.energy.fallbackIndoor, source: "assumed" };
    const mean = (key) => fresh.reduce((sum, reading) => sum + reading[key], 0) / fresh.length;
    return { temperatureC: mean("temperatureC"), humidityPct: mean("humidityPct"), source: "sensors" };
  }

  savingsTotals(nowMs) {
    const dayStart = hkDayStart(nowMs);
    const weekStart = hkWeekStart(nowMs);
    let today = null;
    let week = null;
    for (const entry of this.history) {
      if (!entry.savings) continue;
      const t = Date.parse(entry.t);
      if (t >= weekStart) week = addSavings(week, entry.savings);
      if (t >= dayStart) today = addSavings(today, entry.savings);
    }
    const round = (value) => Math.round((value || 0) * 100) / 100;
    const shape = (total) => ({ airM3: Math.round(total?.airM3 || 0), coolingKwh: round(total?.coolingKwh), electricKwh: round(total?.electricKwh) });
    return { today: shape(today), week: shape(week) };
  }

  forecastAccuracy() {
    const result = {};
    for (const horizon of [30, 60]) {
      const errors = this.forecastErrors.filter((item) => item.horizon === horizon).map((item) => item.error);
      result[`rmse${horizon}`] = errors.length ? Math.round(Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length)) : null;
      result[`samples${horizon}`] = errors.length;
    }
    return result;
  }

  scoreForecasts(nowMs, roomPpm) {
    const due = this.pendingForecasts.filter((item) => item.dueMs <= nowMs + 2 * 60000);
    this.pendingForecasts = this.pendingForecasts.filter((item) => item.dueMs > nowMs + 2 * 60000);
    for (const item of due) {
      if (nowMs - item.dueMs < 8 * 60000) this.forecastErrors.push({ t: nowMs, horizon: item.horizon, error: roomPpm - item.ppm });
    }
    const cutoff = nowMs - 7 * 86400000;
    this.forecastErrors = this.forecastErrors.filter((item) => item.t >= cutoff);
  }

  async tick() {
    const nowMs = this.now();
    const meetings = this.calendar.meetings;
    const room = roomCo2(this.co2Readings, nowMs, this.config, this.excludedSensors);
    const control = this.controller;
    if (!room) {
      await control.step({ damperPct: this.config.ventilation.baselineDamperPct, minLps: 0 }, { nowMs, measuredPpm: NaN, people: 0, lastDataMs: this.lastDataMs, bridgeHealthy: this.bridgeHealthy });
      this.latest = {
        type: "recommendation", status: "no-data", generatedAt: new Date(nowMs).toISOString(), controlMode: control.mode,
        reason: "暂无最近 20 分钟内的 CO₂ 数据，无法生成推荐", reasonEn: "No CO₂ reading in the last 20 minutes; no recommendation",
        calendar: meetings,
      };
      this.emit(this.latest);
      return this.latest;
    }

    const lps = this.actualLps(nowMs);
    const measured = measuredOccupancy(this.occupancyReadings, nowMs, this.config);
    const occupancy = this.estimator.update({
      t: nowMs,
      roomPpm: room.ppm,
      lps,
      measured,
      doorEvent: doorChanged(this.doorHistory, this.lastTickMs ?? nowMs - 600000, nowMs),
      noiseDb: latestNoise(Object.fromEntries(this.noiseReadings), nowMs),
      priorPeople: scheduledPriorAt(nowMs, this.config),
    });
    this.scoreForecasts(nowMs, room.ppm);
    this.roomHistory.push({ t: nowMs, ppm: room.ppm });
    this.trimRoomHistory(nowMs);

    const outdoor = await this.outdoorConditions(nowMs);
    const indoor = this.indoorConditions(nowMs);
    const recommendation = buildRecommendation({
      nowMs, roomPpm: room.ppm, occupancy, meetings, config: this.config, outdoor, indoor,
      previousDamperPct: control.previousCommandPct,
    });

    // Savings for the interval since the previous recommendation, had that recommendation been followed.
    let savings = null;
    const previous = this.history.at(-1);
    if (previous && nowMs - Date.parse(previous.t) <= 20 * 60000) {
      savings = intervalSavings({ baselineLps: previous.baselineLps, recommendedLps: previous.lps, seconds: (nowMs - Date.parse(previous.t)) / 1000, outdoor, indoor, config: this.config });
    }

    const controlResult = await control.step(
      { damperPct: recommendation.airflow.recommendedDamperPct, minLps: recommendation.exact.minLps },
      { nowMs, measuredPpm: room.ppm, people: occupancy.current, lastDataMs: this.lastDataMs, bridgeHealthy: this.bridgeHealthy },
    );

    for (const horizon of [30, 60]) {
      this.pendingForecasts.push({ dueMs: nowMs + horizon * 60000, horizon, ppm: recommendation.co2[`at${horizon}`].baseline });
    }

    const average8h = this.roomHistory.length ? this.roomHistory.reduce((sum, point) => sum + point.ppm, 0) / this.roomHistory.length : null;
    const coverageHours = this.roomHistory.length > 1 ? (this.roomHistory.at(-1).t - this.roomHistory[0].t) / 3600000 : 0;
    const entry = {
      kind: "recommendation",
      t: recommendation.generatedAt,
      roomPpm: Math.round(room.ppm),
      sensors: room.sensors,
      occupancy: Math.round(occupancy.current * 100) / 100,
      occupancyCo2: Math.round(occupancy.co2Estimate * 100) / 100,
      occupancyImplied: occupancy.implied === null ? null : Math.round(occupancy.implied * 100) / 100,
      occupancyVariance: Math.round(occupancy.variance * 1000) / 1000,
      occupancySource: occupancy.source,
      measuredCount: measured.count,
      measuredReporting: measured.reporting,
      meetingLikely: occupancy.meetingLikely,
      lps: recommendation.exact.lps,
      damperPct: recommendation.airflow.recommendedDamperPct,
      minLps: recommendation.exact.minLps,
      baselineLps: recommendation.exact.baselineLps,
      peak: Math.round(recommendation.exact.peak),
      at30: recommendation.co2.at30,
      at60: recommendation.co2.at60,
      atMax: recommendation.airflow.atMax,
      horizon: recommendation.horizonMinutes,
      mode: controlResult.mode,
      commandPct: controlResult.commandPct,
      guards: controlResult.guards,
      shadowPpm: controlResult.shadowPpm === null ? null : Math.round(controlResult.shadowPpm),
      released: controlResult.released,
      outdoor: { temperatureC: outdoor.temperatureC, humidityPct: outdoor.humidityPct, source: outdoor.source },
      indoor: { temperatureC: Math.round(indoor.temperatureC * 10) / 10, humidityPct: Math.round(indoor.humidityPct * 10) / 10, source: indoor.source },
      savings,
    };
    this.history.push(entry);
    this.trimHistory(nowMs);
    await this.appendLog(entry);
    this.lastTickMs = nowMs;

    const { exact, ...publicRecommendation } = recommendation;
    this.latest = {
      ...publicRecommendation,
      co2: { ...recommendation.co2, average8h: average8h === null ? null : Math.round(average8h), average8hCoverageHours: Math.round(coverageHours * 10) / 10 },
      energy: (() => {
        const totals = this.savingsTotals(nowMs);
        return {
          savedTodayM3: totals.today.airM3, savedTodayKwhCooling: totals.today.coolingKwh, savedTodayKwhElectric: totals.today.electricKwh,
          savedWeekM3: totals.week.airM3, savedWeekKwhCooling: totals.week.coolingKwh, savedWeekKwhElectric: totals.week.electricKwh,
          outdoorSource: outdoor.source, indoorSource: indoor.source, plantCop: this.config.energy.plantCop,
        };
      })(),
      controlMode: controlResult.mode,
      calendar: meetings,
      internal: {
        shadow: { commandPct: controlResult.commandPct, ppm: entry.shadowPpm, guards: controlResult.guards, ...control.stats },
        occupancySource: occupancy.source,
        forecastAccuracy: this.forecastAccuracy(),
        l2Available: control.canEnterL2(),
        calibratedAt: this.config.calibration?.calibratedAt || null,
      },
    };
    if (this.writePoint) {
      try { await this.writePoint(entry); } catch (error) { this.logger.warn?.(`[Strategy] InfluxDB write failed: ${error.message}`); }
    }
    this.emit(this.latest);
    return this.latest;
  }

  emit(message) { for (const listener of this.listeners) listener(message); }

  trimHistory(nowMs) {
    const cutoff = nowMs - HISTORY_DAYS * 86400000;
    while (this.history.length && Date.parse(this.history[0].t) < cutoff) this.history.shift();
  }

  async appendLog(entry) {
    try { await appendFile(this.shadowLogFile, `${JSON.stringify(entry)}\n`); }
    catch (error) { this.logger.warn?.(`[Strategy] Shadow log write failed: ${error.message}`); }
  }

  // Restores recent history (and the room CO₂ series) from the shadow log after a restart.
  async restoreHistory() {
    let text = "";
    try { text = await readFile(this.shadowLogFile, "utf8"); } catch { return; }
    const nowMs = this.now();
    const cutoff = nowMs - HISTORY_DAYS * 86400000;
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry.kind !== "recommendation" || Date.parse(entry.t) < cutoff) continue;
      this.history.push(entry);
      if (nowMs - Date.parse(entry.t) <= 8 * 3600000) this.roomHistory.push({ t: Date.parse(entry.t), ppm: entry.roomPpm });
    }
    this.history.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
    this.trimRoomHistory(nowMs);
  }

  recommendationHistory(hours) {
    const span = Math.min(24 * HISTORY_DAYS, Math.max(1, Number(hours) || 24));
    const cutoff = this.now() - span * 3600000;
    return this.history.filter((entry) => Date.parse(entry.t) >= cutoff).map((entry) => ({
      t: entry.t, roomPpm: entry.roomPpm, occupancy: entry.occupancy, occupancySource: entry.occupancySource,
      recommendedLps: Math.round(entry.lps), damperPct: entry.damperPct, baselineLps: Math.round(entry.baselineLps),
      peak: entry.peak, atMax: entry.atMax, mode: entry.mode, commandPct: entry.commandPct, shadowPpm: entry.shadowPpm,
    }));
  }

  // Offset-corrected room CO₂ for the last 8 hours, including the start-up warm-up.
  roomCo2History() {
    return this.roomHistory.map((point) => ({ t: new Date(point.t).toISOString(), ppm: Math.round(point.ppm) }));
  }

  async updateCalendar(message) {
    const meetings = await this.calendar.apply(message);
    return meetings;
  }

  async setControlMode(mode) { return this.controller.setMode(mode); }
}

