// Local stand-in for scripts/influxdb-bridge.mjs, for UI development without InfluxDB or MQTT.
// Speaks the same WebSocket protocol with synthetic readings. Never point a customer page at it.
// Usage: node tests/mock-bridge.mjs [port]   then open twin.html?bridgePort=<port>
import { WebSocketServer, WebSocket } from "ws";
import { DEFAULT_CONFIG } from "../scripts/strategy/config.mjs";
import { buildRecommendation } from "../scripts/strategy/recommend.mjs";

const port = Number(process.argv[2] || process.env.MOCK_BRIDGE_PORT || 8788);
const config = DEFAULT_CONFIG;
const HOUR = 3600000;
const ENV = [["AM103-05", "24E124725E281413"], ["AM103-06", "24E124725E283152"], ["AM103-07", "24E124725E281056"], ["AM103-08", "24E124725E283167"], ["AM308-01", "24E124707E093681"]];
const SOCKETS = ["WS523-01", "WS523-02", "WS523-03", "WS523-04"];
const socketState = new Map(SOCKETS.map((id, index) => [id, index !== 2]));
const meetings = [];
let mode = "L1";

const hkHour = (t) => ((t + 8 * HOUR) % (24 * HOUR)) / HOUR;
const workday = (t) => { const day = new Date(t + 8 * HOUR).getUTCDay(); return day > 0 && day < 6; };
const people = (t) => (workday(t) && hkHour(t) >= 9.5 && hkHour(t) < 18.5 ? (hkHour(t) > 14 && hkHour(t) < 15.5 ? 6 : 2) : 0);
const wave = (t, period, amplitude) => amplitude * Math.sin((t / period) * Math.PI * 2);
function co2At(t, offset = 0) { return 470 + people(t) * 48 + wave(t, 5.3 * HOUR, 18) + offset * 7; }
function tempAt(t, offset = 0) { return 23.4 + wave(t - 3 * HOUR, 24 * HOUR, 0.7) + people(t) * 0.08 + offset * 0.15; }
function humidityAt(t, offset = 0) { return 58 + wave(t, 24 * HOUR, 3) + offset * 0.6; }
function powerAt(id, t) { if (!socketState.get(id)) return 0; return { "WS523-01": 42, "WS523-02": 118, "WS523-03": 6, "WS523-04": 64 }[id] * (0.85 + 0.15 * Math.sin(t / 900000 + id.length)); }
function solarAt(t) { const h = hkHour(t); return h < 6.2 || h > 18 ? 0 : Math.round(Math.max(0, Math.sin(((h - 6.2) / 11.8) * Math.PI)) * 780 * (0.75 + 0.25 * Math.sin(t / 2.4e6))); }

function telemetryFor(now) {
  const messages = ENV.map(([deviceId, devEui], index) => ({
    type: "telemetry", deviceId, devEui, source: "mock", receivedAt: new Date(now - index * 37000).toISOString(),
    values: { co2: Math.round(co2At(now, index)), temperature: +tempAt(now, index).toFixed(1), humidity: +humidityAt(now, index).toFixed(1), battery: 92 - index * 9,
      ...(deviceId === "AM308-01" ? { pm25: 9, pm10: 14, tvoc: 108, pressure: 1009.4, light: 312, pir: people(now) > 0 ? 1 : 0 } : {}) },
    metrics: {},
  }));
  for (const id of SOCKETS) messages.push({ type: "telemetry", deviceId: id, source: "mock", receivedAt: new Date(now - 51000).toISOString(),
    values: { activePower: +powerAt(id, now).toFixed(1), voltage: 221.4, current: Math.round(powerAt(id, now) / 0.2214), powerFactor: 92, powerConsumption: 18240, socketStatus: socketState.get(id) ? 1 : 0 }, metrics: {} });
  for (const id of ["WS301-01", "WS301-02", "WS301-03"]) messages.push({ type: "telemetry", deviceId: id, source: "mock", receivedAt: new Date(now - 120000).toISOString(), values: { magnetStatus: 0, tamperStatus: 0, battery: 88 }, metrics: {} });
  messages.push({ type: "telemetry", deviceId: "WS303-01", source: "mock", receivedAt: new Date(now - 300000).toISOString(), values: { leakageStatus: 0, battery: 15 }, metrics: {} });
  messages.push({ type: "telemetry", deviceId: "WS302-02", source: "mock", receivedAt: new Date(now - 200000).toISOString(), values: { noiseLaeq: 41.6, noiseLai: 43.1, noiseLaiMax: 55.2, battery: 77 }, metrics: {} });
  return messages;
}

function roomPpm(now) { return ENV.reduce((sum, _, index) => sum + co2At(now, index), 0) / ENV.length; }

function recommendation(now) {
  const rec = buildRecommendation({ nowMs: now, roomPpm: roomPpm(now), occupancy: { current: people(now), measured: false }, meetings, config,
    outdoor: { temperatureC: 29.5, humidityPct: 74 }, indoor: { temperatureC: 23.8, humidityPct: 58 } });
  const { exact, ...publicRec } = rec;
  return { ...publicRec, co2: { ...rec.co2, average8h: Math.round(roomPpm(now) - 12), average8hCoverageHours: 8 },
    energy: { savedTodayM3: 412, savedTodayKwhCooling: 3.1, savedTodayKwhElectric: 0.69, savedWeekM3: 2310, savedWeekKwhCooling: 17.4, savedWeekKwhElectric: 3.87, outdoorSource: "hko-kings-park", indoorSource: "sensors", plantCop: config.energy.plantCop },
    controlMode: mode, calendar: meetings,
    internal: { shadow: { commandPct: rec.airflow.recommendedDamperPct, ppm: Math.round(roomPpm(now) - 8), guards: [], steps: 1440, shadowExceedances: 0, guardActivations: 2 },
      occupancySource: "co2", forecastAccuracy: { rmse30: 21, samples30: 512, rmse60: 34, samples60: 498 }, l2Available: false, calibratedAt: "2026-10-09T08:00:00.000Z" } };
}

function roomHistory(hours, stepMinutes) {
  const step = stepMinutes * 60000;
  const stop = Math.ceil(Date.now() / step) * step;
  const start = stop - hours * HOUR;
  const sensors = {};
  const sockets = {};
  const solar = [];
  for (let t = start; t <= stop; t += step) {
    if (t > start + 5 * HOUR && t < start + 5.6 * HOUR) continue; // a real-looking data gap
    ENV.forEach(([id], index) => {
      const series = (sensors[id] ||= { co2: [], temperature: [], humidity: [] });
      series.co2.push([t, Math.round(co2At(t, index))]);
      series.temperature.push([t, +tempAt(t, index).toFixed(2)]);
      series.humidity.push([t, +humidityAt(t, index).toFixed(2)]);
    });
    for (const id of SOCKETS) (sockets[id] ||= []).push([t, +powerAt(id, t).toFixed(1)]);
    solar.push([t, solarAt(t)]);
  }
  return { sensors, sockets, solar, events: [{ t: start + 9.2 * HOUR, deviceId: "WS301-01", type: "door" }], start, stop, hours, stepMinutes };
}

const server = new WebSocketServer({ port, host: "127.0.0.1" });
const send = (socket, message) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
const broadcast = (message) => server.clients.forEach((socket) => send(socket, message));

server.on("connection", (socket) => {
  const now = Date.now();
  send(socket, { type: "bridge-status", connected: true, source: "mock", startedAt: new Date(now - HOUR).toISOString(), lastSuccessAt: new Date(now).toISOString(), error: null });
  send(socket, { type: "control-status", connected: true, readOnly: false, writeProtected: false, source: "mock", supportedDevices: SOCKETS });
  send(socket, { type: "outdoor-weather", station: "King's Park", source: "hko", temperature: 29.6, humidity: 74, windSpeed: 3.6, windDirection: 112, receivedAt: new Date(now - 300000).toISOString() });
  send(socket, { type: "solar-radiation", value: solarAt(now), receivedAt: new Date(now - 240000).toISOString(), station: "King's Park", unit: "W/m²", source: "hko" });
  send(socket, { type: "reading-stats", sensorsReporting: 23, readingsToday: 1284, since: new Date(now - 6 * HOUR).toISOString(), at: new Date(now).toISOString() });
  for (const message of telemetryFor(now)) send(socket, message);
  send(socket, { type: "calendar", meetings });
  send(socket, recommendation(now));
  socket.on("message", (data) => {
    let message;
    try { message = JSON.parse(data.toString()); } catch { return; }
    const requestId = String(message.requestId || "");
    if (message.type === "room-history-request") setTimeout(() => send(socket, { type: "room-history", requestId, ...roomHistory(Math.min(48, Number(message.hours) || 24), Number(message.stepMinutes) || 10) }), 300);
    if (message.type === "sensor-history-request") {
      const hours = Number(message.hours) || 1;
      const index = Math.max(0, ENV.findIndex(([id]) => id === message.deviceId));
      const trends = { co2: [], temperature: [], humidity: [] };
      for (let t = Date.now() - hours * HOUR; t <= Date.now(); t += Math.max(60000, hours * 36000)) {
        trends.co2.push({ time: t, value: Math.round(co2At(t, index)) });
        trends.temperature.push({ time: t, value: +tempAt(t, index).toFixed(2) });
        trends.humidity.push({ time: t, value: +humidityAt(t, index).toFixed(2) });
      }
      if (message.deviceId?.startsWith("WS523")) Object.assign(trends, { activePower: trends.co2.map((point) => ({ time: point.time, value: +powerAt(message.deviceId, point.time).toFixed(1) })) });
      send(socket, { type: "sensor-history", requestId: message.requestId, deviceId: message.deviceId, hours, trends });
    }
    if (message.type === "demand-history-request") {
      const span = message.range === "30d" ? 30 * 24 : message.range === "7d" ? 7 * 24 : hkHour(Date.now());
      const samples = [];
      for (let t = Date.now() - span * HOUR; t <= Date.now(); t += Math.max(300000, span * HOUR / 120)) samples.push({ time: new Date(t).toISOString(), value: SOCKETS.reduce((sum, id) => sum + powerAt(id, t), 0) / 1000 });
      send(socket, { type: "demand-history", range: message.range, samples });
    }
    if (message.type === "recommendation-history-request") {
      const entries = [];
      for (let t = Date.now() - 24 * HOUR; t <= Date.now(); t += 10 * 60000) {
        const lps = Math.max(25, people(t) * 9 + 14);
        entries.push({ t: new Date(t).toISOString(), roomPpm: Math.round(roomPpm(t)), occupancy: people(t), occupancySource: "co2", recommendedLps: lps, damperPct: Math.round(lps / 3), baselineLps: 90, peak: Math.round(roomPpm(t) + 20), atMax: false, mode, commandPct: Math.round(lps / 3), shadowPpm: Math.round(roomPpm(t) - 9) });
      }
      const room = [];
      for (let t = Date.now() - 8 * HOUR; t <= Date.now(); t += 10 * 60000) room.push({ t: new Date(t).toISOString(), ppm: Math.round(roomPpm(t)) });
      send(socket, { type: "recommendation-history", requestId, hours: 24, entries, room });
    }
    if (message.type === "calendar-update") {
      if (message.action === "delete") meetings.splice(meetings.findIndex((meeting) => meeting.id === message.meeting?.id) >>> 0, 1);
      else meetings.push({ id: `m${Date.now()}`, ...message.meeting });
      send(socket, { type: "calendar-result", requestId, ok: true });
      broadcast({ type: "calendar", meetings });
      broadcast(recommendation(Date.now()));
    }
    if (message.type === "control-mode-request") {
      const ok = ["L0", "L1"].includes(message.mode);
      if (ok) mode = message.mode;
      send(socket, { type: "control-mode-result", requestId, ok, mode, ...(ok ? {} : { error: "L2 requires FMO authorisation" }) });
      if (ok) broadcast(recommendation(Date.now()));
    }
    if (message.type === "socket-control") {
      send(socket, { type: "control-queued", requestId, deviceId: message.deviceId, action: message.action, position: 1 });
      setTimeout(() => {
        send(socket, { type: "control-result", requestId, deviceId: message.deviceId, action: message.action, ok: true });
        setTimeout(() => {
          socketState.set(message.deviceId, message.action === "on");
          broadcast({ type: "telemetry", deviceId: message.deviceId, source: "mock", receivedAt: new Date().toISOString(), values: { socketStatus: message.action === "on" ? 1 : 0, activePower: +powerAt(message.deviceId, Date.now()).toFixed(1) }, metrics: {} });
        }, 2500);
      }, 1500);
    }
  });
});

setInterval(() => { const now = Date.now(); for (const message of telemetryFor(now)) broadcast(message); }, 60000);
setInterval(() => broadcast(recommendation(Date.now())), 10 * 60000);
console.log(`[Mock bridge] Synthetic ZB202 data on ws://127.0.0.1:${port} — open twin.html?bridgePort=${port}`);
