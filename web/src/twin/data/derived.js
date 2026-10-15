// Values derived from the active dataset: room representative values, statuses, occupancy, alarms.
// During a replay the replay values take precedence (data/replay.js fills ui.replay).
import { SITE, thresholds } from "../config/site.js";
import { data, alarmStates } from "./store.js";
import { deviceById, deviceStatusFromValues, registry } from "./devices.js";
import { ui } from "../state.js";

const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const now = () => (ui.replay ? ui.replay.t : Date.now());

export function deviceStatus(id, dataset = data()) {
  if (dataset.faults?.has(id)) return "fault";
  if (dataset.offline?.has(id)) return "offline";
  const snapshot = dataset.snapshots.get(id);
  if (!snapshot?.updatedAt) return "unavailable";
  if (dataset.kind === "live" && dataset.connection.known && !dataset.connection.connected) return "unavailable";
  const device = deviceById(id);
  return device ? deviceStatusFromValues(device, snapshot.values) : snapshot.status;
}

export const isOnline = (id) => ["normal", "fault", "warning"].includes(deviceStatus(id));

export function isStale(timeMs, at = Date.now()) {
  return !Number.isFinite(timeMs) || at - timeMs > SITE.staleAfterMs;
}

export function sensorReading(id, key) {
  if (ui.replay) {
    const value = ui.replay.sensors?.[id]?.[key];
    if (value !== undefined) return { value, at: ui.replay.t, stale: value === null, replay: true };
    if (["co2", "temperature", "humidity", "activePower"].includes(key)) return { value: null, at: ui.replay.t, stale: true, replay: true };
  }
  const dataset = data();
  if (dataset.offline?.has(id)) return { value: null, at: null, stale: true };
  const snapshot = dataset.snapshots.get(id);
  const value = snapshot?.values[key];
  const at = snapshot?.metricUpdatedAt[key] ?? null;
  return { value: Number.isFinite(value) ? value : null, at, stale: isStale(at) };
}

// Room value = mean of the five environment sensors; fresh readings win over stale ones.
export function roomMetric(key) {
  if (ui.replay) {
    const value = ui.replay.room?.[key];
    return { value: Number.isFinite(value) ? value : null, at: ui.replay.t, stale: !Number.isFinite(value), sources: 0, replay: true };
  }
  const ids = key === "pm25" ? ["AM308-01"] : key === "noise" ? registry.devices.filter((d) => d.model === "WS302").map((d) => d.id) : SITE.envSensors;
  const field = key === "noise" ? "noiseLaeq" : key;
  const readings = ids.map((id) => sensorReading(id, field)).filter((reading) => reading.value !== null);
  if (!readings.length) return { value: null, at: null, stale: true, sources: 0 };
  const fresh = readings.filter((reading) => !reading.stale);
  const used = fresh.length ? fresh : readings;
  return { value: average(used.map((reading) => reading.value)), at: Math.max(...used.map((reading) => reading.at || 0)), stale: !fresh.length, sources: used.length };
}

// Good / caution / poor, with comfort wording for temperature and humidity (section 4.5).
export function metricStatus(key, value) {
  if (!Number.isFinite(value)) return null;
  if (key === "co2") {
    const c = thresholds.co2;
    return value < c.goodBelow ? { level: "good", word: "good" } : value <= c.poorAbove ? { level: "caution", word: "caution" } : { level: "poor", word: "poor" };
  }
  if (key === "pm25") {
    const c = thresholds.pm25;
    return value <= c.goodAtMost ? { level: "good", word: "good" } : value <= c.poorAbove ? { level: "caution", word: "caution" } : { level: "poor", word: "poor" };
  }
  if (key === "temperature" || key === "humidity") {
    const c = thresholds[key];
    if (value >= c.comfort[0] && value <= c.comfort[1]) return { level: "good", word: "comfortable" };
    if (value >= c.caution[0] && value <= c.caution[1]) return { level: "caution", word: "caution" };
    if (key === "temperature") return { level: "poor", word: value < c.caution[0] ? "cold" : "hot" };
    return { level: "poor", word: value < c.caution[0] ? "dry" : "humid" };
  }
  return null;
}

export function recommendationState() {
  const dataset = data();
  const rec = dataset.recommendation;
  if (!rec) return { rec: null, stale: false, valid: false };
  const generated = Date.parse(rec.generatedAt);
  const stale = !Number.isFinite(generated) || Date.now() - generated > SITE.aiStaleAfterMs
    || (dataset.kind === "live" && dataset.connection.known && !dataset.connection.connected);
  return { rec, stale, valid: rec.status !== "no-data" };
}

// Measured (VS341 seats) when fresh seat readings exist, otherwise the strategy's estimate.
export function occupancyInfo() {
  if (ui.replay) return null;
  const seats = registry.devices.filter((device) => device.model === "VS341");
  const readings = seats.map((device) => sensorReading(device.id, "occupancy")).filter((reading) => reading.value !== null && !reading.stale);
  if (readings.length) return { count: readings.filter((reading) => reading.value > 0).length, measured: true, at: Math.max(...readings.map((r) => r.at)) };
  const { rec, stale, valid } = recommendationState();
  if (rec && valid && !stale && Number.isFinite(rec.occupancy?.current)) {
    return { count: rec.occupancy.current, measured: Boolean(rec.occupancy.measured), at: Date.parse(rec.generatedAt) };
  }
  return null;
}

export function seatOccupancy(deviceId) {
  const reading = sensorReading(deviceId, "occupancy");
  if (!isOnline(deviceId) || reading.value === null) return null;
  return reading.value > 0;
}

export function socketDevices() {
  return registry.devices.filter((device) => device.model === "WS523").sort((a, b) => a.id.localeCompare(b.id));
}

export function socketInfo(id) {
  const power = sensorReading(id, "activePower");
  const state = sensorReading(id, "socketStatus");
  return { id, power: power.value, powerAt: power.at, stale: power.stale, on: state.value === null ? null : state.value > 0, hasData: power.value !== null || state.value !== null };
}

export function totalPowerKw() {
  const values = socketDevices().map((device) => socketInfo(device.id)).filter((info) => info.power !== null);
  if (!values.length) return null;
  return { value: values.reduce((sum, info) => sum + info.power, 0) / 1000, stale: values.every((info) => info.stale) };
}

export function safetyFacts() {
  const doors = registry.devices.filter((d) => d.model === "WS301").map((d) => sensorReading(d.id, "magnetStatus")).filter((r) => r.value !== null && !r.stale);
  const leaks = registry.devices.filter((d) => d.model === "WS303").map((d) => sensorReading(d.id, "leakageStatus")).filter((r) => r.value !== null && !r.stale);
  return {
    doorsKnown: doors.length > 0, doorsClosed: doors.every((r) => r.value === 0),
    leakKnown: leaks.length > 0, leakFree: leaks.every((r) => r.value === 0),
  };
}

export function lastReadingAt() {
  if (ui.replay) return ui.replay.t;
  let latest = null;
  for (const snapshot of data().snapshots.values()) if (snapshot.updatedAt && (!latest || snapshot.updatedAt > latest)) latest = snapshot.updatedAt;
  return latest;
}

export function healthSummary() {
  const dataset = data();
  const devices = registry.devices.filter((device) => device.model !== "WEATHER");
  const statuses = devices.map((device) => deviceStatus(device.id));
  const batteries = devices.map((device) => dataset.snapshots.get(device.id)?.values.battery).filter(Number.isFinite);
  return {
    online: statuses.filter((status) => status === "normal").length,
    offline: statuses.filter((status) => status === "unavailable" || status === "offline").length,
    fault: statuses.filter((status) => status === "fault").length,
    batteryHigh: batteries.filter((value) => value >= 50).length,
    batteryMid: batteries.filter((value) => value >= 20 && value < 50).length,
    batteryLow: batteries.filter((value) => value < 20).length,
    total: devices.length,
  };
}

// Alarms derived from the latest readings (same rules as before), plus the data-service connection.
export function alarms() {
  const dataset = data();
  const list = [];
  const add = (type, level, deviceId, detailKey, detailVars = {}) => list.push({ id: `${type}:${deviceId}`, type, level, deviceId, detailKey, detailVars });
  for (const device of registry.devices) {
    const values = dataset.snapshots.get(device.id)?.values || {};
    if (dataset.offline?.has(device.id)) { add("offline", "warning", device.id); continue; }
    if (dataset.faults?.has(device.id)) add("fault", "critical", device.id);
    if (values.magnetStatus > 0) add("door", "critical", device.id);
    if (values.leakageStatus > 0) add("leak", "critical", device.id);
    if (values.tamperStatus > 0) add("tamper", "critical", device.id);
    if (Number.isFinite(values.battery) && values.battery < 20) add("battery", "warning", device.id, "batteryRemaining", { v: Math.round(values.battery) });
    if (device.model === "WS523" && values.activePower > 2500) add("socket-load", "critical", device.id, "raw", { text: `${Math.round(values.activePower)} W` });
    if (device.model === "WS523" && Number.isFinite(values.voltage) && (values.voltage < 200 || values.voltage > 250)) add("socket-voltage", "warning", device.id, "raw", { text: `${values.voltage.toFixed(1)} V` });
  }
  if (dataset.kind === "live" && dataset.connection.known && !dataset.connection.connected) {
    list.unshift({ id: "connection:database", type: "connection", level: "critical", deviceId: "dataService", detailKey: "raw", detailVars: { text: dataset.connection.diagnostic } });
  }
  return list.map((alarm) => ({ ...alarm, state: alarmStates[alarm.id] || "active" }));
}

export const ALARM_TITLE = { door: "alarmDoor", leak: "alarmLeak", tamper: "alarmTamper", battery: "alarmBattery", "socket-load": "alarmSocketLoad",
  "socket-voltage": "alarmSocketVoltage", connection: "alarmConnection", offline: "alarmOffline", fault: "statusFault" };
export const ALARM_ICON = { door: "ph-door-open", leak: "ph-drop", tamper: "ph-shield-warning", battery: "ph-battery-warning", "socket-load": "ph-plug",
  "socket-voltage": "ph-plug", connection: "ph-plugs", offline: "ph-wifi-slash", fault: "ph-warning-circle" };

// Room-level series from a room-history response: mean of the environment sensors at each step.
export function roomSeries(history, key) {
  if (!history?.sensors) return [];
  const byTime = new Map();
  for (const id of SITE.envSensors) {
    for (const [time, value] of history.sensors[id]?.[key] || []) {
      const entry = byTime.get(time) || [];
      entry.push(value);
      byTime.set(time, entry);
    }
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([time, values]) => ({ t: time, v: average(values) }));
}

// Splits a series wherever consecutive points are further apart than maxGapMs (gaps are never interpolated).
export function splitGaps(points, maxGapMs) {
  const segments = [];
  let current = [];
  for (const point of points) {
    if (current.length && point.t - current.at(-1).t > maxGapMs) { segments.push(current); current = []; }
    current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

export const currentTime = now;
