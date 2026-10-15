// Demo mode: a complete, clearly labelled virtual dataset (replaces the old hidden switches).
// Nothing here ever reaches the live dataset; turning demo mode off discards it.
import { createDataset, registry, snapshotFor, deviceStatusFromValues } from "./devices.js";
import { emit } from "../state.js";
import { SITE } from "../config/site.js";
import { t as translate, clockTime } from "../i18n.js";

const HOUR = 3600000;
const OFFLINE = ["VS341-03", "AM103-05"];
const OCCUPIED = new Set(["VS341-01", "VS341-02", "VS341-04", "VS341-05", "VS341-07", "VS341-09", "VS341-10"]);
const SOCKET_POWER = { "WS523-01": 420, "WS523-02": 160, "WS523-03": 0, "WS523-04": 310, "WS523-05": 0, "WS523-06": 90 };

const hkHour = (t) => ((t + 8 * HOUR) % (24 * HOUR)) / HOUR;
const wave = (t, period, amplitude, phase = 0) => amplitude * Math.sin(((t + phase) / period) * Math.PI * 2);
const peopleAt = (t) => { const h = hkHour(t); return h >= 9.5 && h < 18.5 ? (h > 14 && h < 15.5 ? 8 : 3) : 0; };
const co2At = (t, i = 0) => 470 + peopleAt(t) * 34 + wave(t, 5.1 * HOUR, 16, i * 1e6) + i * 6;
const tempAt = (t, i = 0) => 23.6 + wave(t - 3 * HOUR, 24 * HOUR, 0.6) + peopleAt(t) * 0.06 + i * 0.12;
const humAt = (t, i = 0) => 60 + wave(t, 24 * HOUR, 2.5) + i * 0.5;
const solarAt = (t) => { const h = hkHour(t); return h < 6.2 || h > 18 ? 0 : Math.round(Math.max(0, Math.sin(((h - 6.2) / 11.8) * Math.PI)) * 820); };
const powerAt = (id, t, state) => (state.get(id) ? SOCKET_POWER[id] * (0.9 + 0.1 * Math.sin(t / 7e5 + id.length)) : 0);

function setValues(dataset, id, values, at) {
  const snapshot = snapshotFor(dataset, id);
  for (const [key, value] of Object.entries(values)) {
    snapshot.values[key] = value;
    snapshot.metricUpdatedAt[key] = at;
  }
  snapshot.updatedAt = at;
}

function ensureDemoSockets() {
  // The demo shows all six sockets of the equipment plan.
  for (const id of ["WS523-05", "WS523-06"]) {
    if (!registry.devices.some((device) => device.id === id)) {
      registry.devices.push({ ...registry.devices.find((device) => device.id === "WS523-01"), id, name: { zh: `${id} 智能插座`, "zh-Hant": `${id} 智能插座`, en: `${id} Smart portable socket` }, sensorGuid: null, binding: null, demoOnly: true });
    }
  }
}

function demoRecommendation(dataset, t) {
  const env = SITE.envSensors.filter((id) => !OFFLINE.includes(id));
  const room = env.reduce((sum, id) => sum + (dataset.snapshots.get(id)?.values.co2 || 0), 0) / env.length;
  const people = OCCUPIED.size;
  const min = Math.round(2.5 * people + 0.3 * 46.6);
  const lps = Math.min(300, Math.max(min, Math.round(min + Math.max(0, room - 650) * 0.45)));
  const damper = Math.round(lps / 3);
  const iso = (ms) => new Date(ms).toISOString();
  const forecast = (offset, slope) => Array.from({ length: 13 }, (_, i) => ({ t: iso(t + i * 5 * 60000), ppm: Math.round(room + slope * i + offset) }));
  return {
    type: "recommendation", status: lps >= 300 ? "at-max" : "ok", generatedAt: iso(t), horizonMinutes: 60,
    occupancy: { current: people, measured: true, forecast: Array.from({ length: 13 }, (_, i) => ({ t: iso(t + i * 5 * 60000), n: i > 6 ? 8 : people })) },
    co2: { current: Math.round(room), limit: 800, target: 750, forecastRecommended: forecast(0, room > 720 ? -3 : 2), forecastBaseline: forecast(0, 9),
      peakRecommended: Math.round(Math.max(room, room + (room > 720 ? 0 : 24))), peakBaseline: Math.round(room + 108),
      at30: { recommended: Math.round(room + 12), baseline: Math.round(room + 54) }, at60: { recommended: Math.round(room + 24), baseline: Math.round(room + 108) },
      exceedAt: null, average8h: Math.round(room - 20), average8hCoverageHours: 8 },
    airflow: { recommendedLps: lps, recommendedDamperPct: damper, minLps: min, maxLps: 300, baselineLps: 90, baselineDamperPct: 30, atMax: lps >= 300, method: "bisection", plan: [] },
    meeting: { id: "demo", title: "Group meeting", start: iso(t + 35 * 60000), end: iso(t + 95 * 60000), people: 8 },
    reasonCode: { code: "meeting-upcoming", params: { title: "", people: 8, at: iso(t + 35 * 60000), raised: true } },
    reason: `${clockTime(t + 35 * 60000)} 组会预计 8 人，提前加大新风`, reasonEn: `Group meeting at ${clockTime(t + 35 * 60000)} with 8 expected; increasing outdoor air in advance`,
    energy: { savedTodayM3: 386, savedTodayKwhCooling: 2.9, savedTodayKwhElectric: 0.64, savedWeekM3: 2240, savedWeekKwhCooling: 16.8, savedWeekKwhElectric: 3.73, outdoorSource: "hko-kings-park", plantCop: 4.5 },
    controlMode: dataset.demoControlMode || "L1", calendar: dataset.meetings,
    internal: { shadow: { commandPct: damper, ppm: Math.round(room - 6), steps: 1440, shadowExceedances: 0, guardActivations: 1 }, occupancySource: "vs341",
      forecastAccuracy: { rmse30: 19, samples30: 480, rmse60: 31, samples60: 466 }, l2Available: false, calibratedAt: iso(t - 6 * 24 * HOUR) },
    demo: { autoMode: true, supplySetpoint: { recommended: 22.5, current: 23.0, executed: false }, damper: { recommended: 46, current: 32, executed: true } },
  };
}

function populate(dataset, t) {
  const preview = dataset.preview.co2;
  SITE.envSensors.forEach((id, index) => {
    if (OFFLINE.includes(id)) return;
    const co2 = preview !== null ? preview + index * 6 - 12 : Math.round(co2At(t, index));
    setValues(dataset, id, { co2: Math.round(co2), temperature: +tempAt(t, index).toFixed(1), humidity: +humAt(t, index).toFixed(1), battery: 94 - index * 7,
      ...(id === "AM308-01" ? { pm25: 9, pm10: 14, tvoc: 104, pressure: 1009.2, light: 330 } : {}) }, t - index * 41000);
  });
  for (const device of registry.devices) {
    if (OFFLINE.includes(device.id)) continue;
    if (device.model === "VS341") setValues(dataset, device.id, { occupancy: OCCUPIED.has(device.id) ? 1 : 0, battery: 86 }, t - 90000);
    if (device.model === "WS301") setValues(dataset, device.id, { magnetStatus: 0, tamperStatus: 0, battery: 81 }, t - 120000);
    if (device.model === "WS303") setValues(dataset, device.id, { leakageStatus: 0, battery: 64 }, t - 300000);
    if (device.model === "WS302") setValues(dataset, device.id, { noiseLaeq: 48, noiseLai: 50.2, noiseLaiMax: 61.4, battery: 72 }, t - 200000);
    if (device.model === "WS523") {
      const power = powerAt(device.id, t, dataset.socketState);
      setValues(dataset, device.id, { activePower: +power.toFixed(1), voltage: 221.6, current: Math.round(power / 0.2216), powerFactor: 93, powerConsumption: 18320, socketStatus: dataset.socketState.get(device.id) ? 1 : 0,
        ...(device.id === "WS523-03" ? { battery: 12 } : {}) }, t - 60000);
    }
  }
  for (const [id, snapshot] of dataset.snapshots) {
    const device = registry.devices.find((item) => item.id === id);
    if (device) snapshot.status = deviceStatusFromValues(device, snapshot.values);
  }
  dataset.outdoor = { type: "outdoor-weather", station: "King's Park", source: "demo", temperature: 31.8, humidity: 68, windSpeed: 4.2, windDirection: 112.5, receivedAt: new Date(t - 300000).toISOString() };
  dataset.radiation = { type: "solar-radiation", value: dataset.preview.solar ?? solarAt(t), receivedAt: new Date(t - 240000).toISOString(), station: "King's Park", source: "demo" };
  dataset.readingStats = { type: "reading-stats", sensorsReporting: 21, readingsToday: 1268, at: new Date(t).toISOString() };
  dataset.recommendation = demoRecommendation(dataset, t);
  dataset.recommendationAt = t;
}

function roomHistory(dataset, hours, stepMinutes) {
  const step = stepMinutes * 60000;
  const stop = Math.ceil(Date.now() / step) * step;
  const start = stop - hours * HOUR;
  const sensors = {};
  const sockets = {};
  const solar = [];
  for (let t = start; t <= stop; t += step) {
    if (t > start + 4 * HOUR && t < start + 4.5 * HOUR) continue;
    SITE.envSensors.forEach((id, index) => {
      if (id === "AM103-05" && t > stop - 2 * HOUR) return; // went offline two hours ago
      const series = (sensors[id] ||= { co2: [], temperature: [], humidity: [] });
      series.co2.push([t, Math.round(co2At(t, index))]);
      series.temperature.push([t, +tempAt(t, index).toFixed(2)]);
      series.humidity.push([t, +humAt(t, index).toFixed(2)]);
    });
    for (const id of Object.keys(SOCKET_POWER)) (sockets[id] ||= []).push([t, +(SOCKET_POWER[id] * (0.85 + 0.15 * Math.sin(t / 3e6 + id.length)) * (peopleAt(t) ? 1 : 0.35)).toFixed(1)]);
    solar.push([t, solarAt(t)]);
  }
  return { type: "room-history", hours, stepMinutes, start, stop, sensors, sockets, solar, events: [{ t: start + 9.4 * HOUR, deviceId: "WS301-01", type: "door" }] };
}

let timer = null;

// Today (Hong Kong) at the given hour, for the demo time preview.
export function previewTime(hours) {
  const midnight = Math.floor((Date.now() + 8 * HOUR) / (24 * HOUR)) * 24 * HOUR - 8 * HOUR;
  return midnight + hours * HOUR;
}

export const demoFactory = {
  async create() {
    ensureDemoSockets();
    const dataset = createDataset("demo");
    dataset.connection = { known: true, connected: true, diagnostic: "", retryAt: null };
    dataset.control = { connected: true, readOnly: false, writeProtected: false };
    dataset.offline = new Set(OFFLINE);
    dataset.socketState = new Map(Object.entries(SOCKET_POWER).map(([id, watts]) => [id, watts > 0]));
    dataset.preview = { co2: null, timeOfDay: null, solar: null };
    dataset.meetings = [];
    dataset.ahu = { supply: 17.8, return: 24.1, water: 46, oa: 32, fan: 38, setpoint: 23 };
    populate(dataset, Date.now());
    dataset.recHistory = Array.from({ length: 145 }, (_, i) => {
      const t = Date.now() - (144 - i) * 10 * 60000;
      const lps = Math.max(26, peopleAt(t) * 7 + 14);
      return { t: new Date(t).toISOString(), roomPpm: Math.round(co2At(t)), occupancy: peopleAt(t), recommendedLps: lps, damperPct: Math.round(lps / 3), baselineLps: 90, peak: Math.round(co2At(t) + 20) };
    });
    dataset.recRoom = dataset.recHistory.slice(-49).map((entry) => ({ t: entry.t, ppm: entry.roomPpm }));
    return dataset;
  },
  start(dataset) {
    window.clearInterval(timer);
    timer = window.setInterval(() => { populate(dataset, Date.now()); emit("data", { kind: "telemetry", demo: true }); }, 60000);
  },
  stop() { window.clearInterval(timer); timer = null; },
  setPreview(dataset, key, value) {
    dataset.preview[key] = value;
    // The time preview also moves the (virtual) solar radiation, so light and sky follow it.
    if (key === "timeOfDay") dataset.preview.solar = solarAt(previewTime(value));
    populate(dataset, Date.now());
    emit("data", { kind: "telemetry", demo: true, preview: key });
  },
  api: null,
};

// Same surface as bridgeApi, answered locally.
demoFactory.api = {
  kind: "demo",
  isOpen: () => true,
  requestSensorHistory(deviceId, hours) {
    const dataset = currentDemo();
    if (!dataset) return;
    const snapshot = snapshotFor(dataset, deviceId);
    const index = Math.max(0, SITE.envSensors.indexOf(deviceId));
    const stepMs = Math.max(60000, (hours * HOUR) / 120);
    const points = (fn) => { const list = []; for (let t = Date.now() - hours * HOUR; t <= Date.now(); t += stepMs) list.push({ time: t, value: fn(t) }); return list; };
    if (!OFFLINE.includes(deviceId)) {
      if (snapshot.values.co2 !== undefined) Object.assign(snapshot.trends, { co2: points((t) => Math.round(co2At(t, index))), temperature: points((t) => +tempAt(t, index).toFixed(2)), humidity: points((t) => +humAt(t, index).toFixed(2)) });
      if (snapshot.values.activePower !== undefined) snapshot.trends.activePower = points((t) => +powerAt(deviceId, t, dataset.socketState).toFixed(1));
      if (snapshot.values.occupancy !== undefined) snapshot.trends.occupancy = points((t) => (peopleAt(t) > 0 && OCCUPIED.has(deviceId) ? 1 : 0));
      if (snapshot.values.battery !== undefined) snapshot.trends.battery = points(() => snapshot.values.battery);
    }
    dataset.sensorHistory = { requestId: "demo", deviceId, loading: false, error: null };
    emit("data", { kind: "sensor-history", deviceId });
  },
  requestDemandHistory(range) {
    const dataset = currentDemo();
    if (!dataset) return;
    const span = range === "30d" ? 30 * 24 : range === "7d" ? 7 * 24 : hkHour(Date.now());
    const samples = [];
    for (let t = Date.now() - span * HOUR; t <= Date.now(); t += Math.max(300000, (span * HOUR) / 96)) samples.push({ time: t, value: 0.62 + (peopleAt(t) ? 0.34 : 0) + 0.04 * Math.sin(t / 5e6) });
    dataset.demandHistory.set(range, samples);
    emit("data", { kind: "demand", range });
  },
  async requestRoomHistory(hours = 24, stepMinutes = 10) {
    const dataset = currentDemo();
    if (!dataset) return null;
    dataset.roomHistory = roomHistory(dataset, hours, stepMinutes);
    emit("data", { kind: "room-history" });
    return dataset.roomHistory;
  },
  requestRecommendationHistory() { emit("data", { kind: "rec-history" }); },
  // Illustrative data health and standby figures for the demo devices.
  requestDeviceHealth() {
    const dataset = currentDemo();
    if (!dataset) return;
    const devices = {};
    for (const id of dataset.snapshots.keys()) devices[id] = { uplinks: 144, intervalMinutes: 10, longestGapMinutes: id === "AM103-07" ? 70 : 10, completeness: id === "AM103-07" ? 96.5 : 100, last: new Date().toISOString() };
    dataset.deviceHealth = { hours: 24, devices, events: [] };
    emit("data", { kind: "device-health" });
  },
  requestStandbyReport() {
    const dataset = currentDemo();
    if (!dataset) return;
    const sockets = Object.keys(SOCKET_POWER).map((id, index) => ({ id, standbyW: [12, 3.5, 1.2, 0][index] ?? 0, workingW: SOCKET_POWER[id], yearKwh: Math.round(([12, 3.5, 1.2, 0][index] ?? 0) * 6157 / 1000) })).sort((a, b) => b.yearKwh - a.yearKwh);
    dataset.standby = { days: 7, sockets, totalYearKwh: sockets.reduce((s, x) => s + x.yearKwh, 0), standbyHoursPerYear: 6157 };
    emit("data", { kind: "standby" });
  },
  // Illustrative AI review: working-hours savings for a week and a forecast that tracks the room.
  requestAiReview() {
    const dataset = currentDemo();
    if (!dataset) return;
    const now = Date.now();
    const hours = [];
    const points = [];
    for (let t = Math.floor((now - 7 * 24 * HOUR) / HOUR) * HOUR; t < now; t += HOUR) {
      const h = hkHour(t);
      const day = new Date(t + 8 * HOUR).getUTCDay();
      if (day >= 1 && day <= 5 && h >= 8 && h < 18) hours.push({ t: new Date(t).toISOString(), baselineKwh: 0.21, recommendedKwh: peopleAt(t) ? 0.16 : 0.06 });
    }
    for (let t = now - 24 * HOUR; t < now; t += 600000) {
      const actual = Math.round(co2At(t, 0));
      points.push({ t: new Date(t).toISOString(), actual, predicted: Math.round(actual + 14 * Math.sin(t / 4e6)) });
    }
    const baselineKwh = hours.reduce((s, h) => s + h.baselineKwh, 0);
    const recommendedKwh = hours.reduce((s, h) => s + h.recommendedKwh, 0);
    const savedKwh = baselineKwh - recommendedKwh;
    dataset.aiReview = {
      savings: { hours, days: [], totals: { baselineKwh, recommendedKwh, savedKwh, savedSharePct: Math.round(savedKwh / baselineKwh * 1000) / 10, savedKwhLow: savedKwh * 0.62, savedKwhHigh: savedKwh * 1.6 }, assumptions: { plantCop: 4.5, baselineDamperPct: 30, airflowShare: 0.25, copDelta: 1 } },
      forecast: { hours: 24, points, mae30: 9, mae60: 11, bias60: 2, samples30: 144, samples60: 138 },
    };
    emit("data", { kind: "ai-review" });
  },
  async socketControl(deviceId, desired) {
    const dataset = currentDemo();
    if (!dataset) return false;
    const message = (phase, key, vars = {}, level = "pending") => { dataset.controlMessage = { deviceId, phase, key, vars: { id: deviceId, ...vars }, level, at: Date.now() }; emit("data", { kind: "control-phase", deviceId }); };
    const id = `demo-${Date.now()}`;
    dataset.pendingControls.set(id, { deviceId, desired, phase: "queued" });
    message("queued", "phaseQueued");
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    message("sent", "phaseSent");
    await new Promise((resolve) => window.setTimeout(resolve, 1400));
    dataset.socketState.set(deviceId, desired);
    dataset.pendingControls.delete(id);
    populate(dataset, Date.now());
    message("applied", "phaseApplied", { state: translate(desired ? "stateOn" : "stateOff") }, "success");
    emit("data", { kind: "telemetry", deviceId, changed: ["socketStatus", "activePower"] });
    return true;
  },
  async writeRequest(message) {
    const dataset = currentDemo();
    if (!dataset) return { ok: false };
    if (message.type === "calendar-update") {
      if (message.action === "delete") dataset.meetings = dataset.meetings.filter((meeting) => meeting.id !== message.meeting?.id);
      else dataset.meetings = [...dataset.meetings, { id: `demo-${Date.now()}`, ...message.meeting }];
      dataset.recommendation = demoRecommendation(dataset, Date.now());
      emit("data", { kind: "calendar" });
      return { ok: true };
    }
    if (message.type === "control-mode-request") {
      if (message.mode === "L2") return { ok: false, error: "L2 requires FMO authorisation" };
      dataset.demoControlMode = message.mode;
      dataset.recommendation = demoRecommendation(dataset, Date.now());
      emit("data", { kind: "recommendation" });
      return { ok: true };
    }
    return { ok: false };
  },
};

let demoRef = null;
const currentDemo = () => demoRef;
const originalCreate = demoFactory.create;
demoFactory.create = async () => { demoRef = await originalCreate(); return demoRef; };
const originalStop = demoFactory.stop;
demoFactory.stop = (dataset) => {
  originalStop(dataset);
  demoRef = null;
  // Demo-only sockets leave the registry with the rest of the virtual data.
  for (let i = registry.devices.length - 1; i >= 0; i -= 1) if (registry.devices[i].demoOnly) registry.devices.splice(i, 1);
};
export const activeDemo = currentDemo;
