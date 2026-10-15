import "dotenv/config";
import { InfluxDB, Point } from "@influxdata/influxdb-client";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import mqtt from "mqtt";
import { buildSensorHistoryQuery } from "./sensor-history.mjs";
import { buildRoomHistoryQueries, roomHistoryFromRows, roomHistoryWindow } from "./room-history.mjs";
import { SOLAR_URL, SOLAR_MEASUREMENT, parseSolarCsv, solarPoint } from "./hko-solar.mjs";
import { WebSocketServer, WebSocket } from "ws";
import { loadConfig, strategyDataDir } from "./strategy/config.mjs";
import { StrategyService } from "./strategy/service.mjs";
import { buildCo2HistoryQuery, co2RowsToSeries } from "./strategy/influx-history.mjs";
import { fetchHkoOutdoor, fetchHkoWind } from "./strategy/weather.mjs";
import { assessCo2Health, calibrationSummary, correctCo2Samples, correctTelemetry } from "./co2-quality.mjs";

const url = process.env.ZB202_INFLUX_URL;
const token = process.env.ZB202_INFLUX_TOKEN;
const org = process.env.ZB202_INFLUX_ORG;
const bucket = process.env.ZB202_INFLUX_BUCKET || "zb202_iot";
const measurement = process.env.ZB202_INFLUX_MEASUREMENT || "";
const deviceColumn = process.env.ZB202_INFLUX_DEVICE_COLUMN || "devEui";
const pollIntervalMs = Math.max(2000, Number(process.env.ZB202_INFLUX_POLL_INTERVAL_MS) || 10000);
const pollLookback = process.env.ZB202_INFLUX_POLL_LOOKBACK || "-15m";
const historyRange = process.env.ZB202_INFLUX_HISTORY_RANGE || "-24h";
const weatherBucket = process.env.ZB202_WEATHER_INFLUX_BUCKET || "";
const weatherMeasurement = process.env.ZB202_WEATHER_INFLUX_MEASUREMENT || "";
const weatherToken = process.env.ZB202_WEATHER_INFLUX_TOKEN || token;
// Hosting platforms (e.g. Render) assign PORT and need the bridge on all interfaces.
const websocketHost = process.env.ZB202_INFLUX_BRIDGE_HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const websocketPort = Number(process.env.ZB202_INFLUX_BRIDGE_PORT || process.env.PORT || 8787);
// Public deployments either refuse socket control, meeting edits and mode changes (read-only)
// or require an access key with each of those commands.
const readOnly = process.env.ZB202_BRIDGE_READ_ONLY === "true";
const writeKeyDigest = process.env.ZB202_BRIDGE_WRITE_KEY ? createHash("sha256").update(process.env.ZB202_BRIDGE_WRITE_KEY).digest() : null;
// With ZB202_BRIDGE_REQUIRE_KEY=true a bridge without a configured key refuses every control command.
const requireWriteKey = process.env.ZB202_BRIDGE_REQUIRE_KEY === "true";
const writeKeyMatches = (key) => writeKeyDigest
  ? timingSafeEqual(createHash("sha256").update(String(key || "")).digest(), writeKeyDigest)
  : !requireWriteKey;
// Extra browser origins allowed to connect, e.g. https://zb202-digital-twin.vercel.app.
const allowedOrigins = new Set((process.env.ZB202_BRIDGE_ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean));
const bridgeStartedAt = new Date().toISOString();
const mqttBrokerUrl = process.env.ZB202_MQTT_URL || "mqtt://itf.beeerise.com:1889";
const mqttUsername = process.env.ZB202_MQTT_USERNAME || "";
const mqttPassword = process.env.ZB202_MQTT_PASSWORD || "";
const mqttDownlinkDelayMs = Math.max(0, Number(process.env.ZB202_MQTT_DOWNLINK_DELAY_MS || 10000));
const socketDevices = new Map([
  ["WS523-01", "24E124148C450384"],
  ["WS523-02", "24E124148060808D"],
  ["WS523-03", "24E124148060683A"],
  ["WS523-04", "24E1241480609EE5"],
]);
const socketCommands = { on: "080100ff", off: "080000ff" };
const strategyEnabled = process.env.ZB202_STRATEGY_ENABLED !== "false";
const strategyWriteInflux = process.env.ZB202_STRATEGY_INFLUX_WRITE === "true";
const strategyBucket = process.env.ZB202_STRATEGY_INFLUX_BUCKET || bucket;

const missing = [["ZB202_INFLUX_URL", url], ["ZB202_INFLUX_TOKEN", token], ["ZB202_INFLUX_ORG", org]]
  .filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  console.error(`[InfluxDB] Missing ${missing.join(", ")}. Copy .env.example to .env and set the connection values.`);
  process.exit(1);
}

const queryTimeoutMs = Math.max(1000, Number(process.env.ZB202_INFLUX_QUERY_TIMEOUT_MS) || 30000);
const queryApi = new InfluxDB({ url, token, timeout: queryTimeoutMs }).getQueryApi(org);
const solarBucket = process.env.ZB202_SOLAR_INFLUX_BUCKET || weatherBucket || bucket;
const solarClient = new InfluxDB({ url, token: weatherToken, timeout: queryTimeoutMs });
const solarWriteApi = solarClient.getWriteApi(org, solarBucket, "ms");
const solarQueryApi = solarClient.getQueryApi(org);
let latestSolar = null;
let latestOutdoor = null;
let solarWritable = true;
let outdoorPolling = false;
async function pollSolar() {
  const response = await fetch(SOLAR_URL, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HKO HTTP ${response.status}`);
  const observation = parseSolarCsv(await response.text());
  try {
    if (!solarWritable) throw new Error("token has no write access");
    if (latestSolar?.receivedAt !== observation.receivedAt) {
      solarWriteApi.writePoint(solarPoint(observation));
      await solarWriteApi.flush();
    }
    // Read back from InfluxDB so the browser shows the persisted observation.
    const rows = await solarQueryApi.collectRows(`from(bucket: ${JSON.stringify(solarBucket)})
      |> range(start: -48h)
      |> filter(fn: (r) => r._measurement == "${SOLAR_MEASUREMENT}" and r._field == "solarRadiation" and r.station == "King's Park")
      |> last()`);
    const row = rows.sort((a, b) => Date.parse(b._time) - Date.parse(a._time))[0];
    if (!row) throw new Error("no persisted observation");
    latestSolar = { ...observation, value: Number(row._value), receivedAt: row._time };
    console.log(`[HKO] King's Park solar radiation ${latestSolar.value} W/m² persisted and read from InfluxDB`);
  } catch (error) {
    // Without write access, show the HKO observation directly instead of nothing.
    if (error.statusCode === 401 || error.statusCode === 403) solarWritable = false;
    if (latestSolar?.source !== "hko") console.warn(`[HKO] Solar persistence unavailable (${error.message}); serving the HKO feed directly`);
    latestSolar = { ...observation, source: "hko" };
  }
  broadcast(latestSolar);
}

// Outdoor temperature, humidity and wind from HKO King's Park; there is no weather station in InfluxDB.
async function pollOutdoorWeather() {
  const [air, wind] = await Promise.allSettled([fetchHkoOutdoor(), fetchHkoWind()]);
  if (air.status === "rejected" && wind.status === "rejected") throw air.reason;
  const times = [air.value?.t, wind.value?.t].filter(Number.isFinite);
  latestOutdoor = { type: "outdoor-weather", station: "King's Park", source: "hko",
    temperature: air.value?.temperatureC ?? null, humidity: air.value?.humidityPct ?? null,
    windSpeed: wind.value?.windSpeedMs ?? null, windDirection: wind.value?.windDirectionDeg ?? null,
    receivedAt: new Date(times.length ? Math.min(...times) : Date.now()).toISOString() };
  broadcast(latestOutdoor);
}

async function pollOutdoor() {
  if (outdoorPolling) return;
  outdoorPolling = true;
  const results = await Promise.allSettled([pollSolar(), pollOutdoorWeather()]);
  for (const result of results) if (result.status === "rejected") console.error(`[HKO] Outdoor ingestion failed: ${result.reason.message}`);
  outdoorPolling = false;
}
const strategyConfig = loadConfig();
const strategyWriteApi = strategyEnabled && strategyWriteInflux ? new InfluxDB({ url, token, timeout: queryTimeoutMs }).getWriteApi(org, strategyBucket, "s") : null;
const strategy = strategyEnabled ? new StrategyService({
  config: strategyConfig,
  dataDir: process.env.ZB202_STRATEGY_DATA_DIR || strategyDataDir,
  // Optional write-back of each recommendation; off unless ZB202_STRATEGY_INFLUX_WRITE=true.
  writePoint: strategyWriteApi ? async (entry) => {
    strategyWriteApi.writePoint(new Point("zb202-ai-recommendation").tag("mode", entry.mode)
      .floatField("recommended_lps", entry.lps).intField("damper_pct", entry.damperPct).floatField("baseline_lps", entry.baselineLps)
      .intField("room_co2_ppm", entry.roomPpm).floatField("occupancy_estimate", entry.occupancy).intField("peak_ppm", entry.peak)
      .timestamp(new Date(entry.t)));
    await strategyWriteApi.flush();
  } : null,
}) : null;
let strategyStarted = false;
const weatherQueryApi = weatherBucket ? new InfluxDB({ url, token: weatherToken, timeout: queryTimeoutMs }).getQueryApi(org) : null;
// Plain HTTP answers health checks; WebSocket upgrades go to the bridge.
const httpServer = createServer((req, res) => {
  const healthy = req.url === "/healthz";
  res.writeHead(healthy ? 200 : 426, { "content-type": "application/json" });
  res.end(JSON.stringify(healthy ? { ...databaseStatus(), readOnly, writeProtected: Boolean(writeKeyDigest) || requireWriteKey } : { error: "WebSocket upgrade required" }));
});
const websocketServer = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024,
  verifyClient({ origin, req }) {
    if (!origin) return true; // Non-browser monitoring clients.
    if (allowedOrigins.has(origin)) return true;
    try { return new URL(origin).hostname === new URL(`http://${req.headers.host}`).hostname; }
    catch { return false; }
  } });
const historyByDevice = new Map();
const seenRows = new Set();
const maxSeenRows = 10000;
let databaseConnected = false;
let hasLoadedHistory = false;
let polling = false;
let lastQuerySuccessAt = null;
let lastQueryError = null;
let consecutiveFailures = 0;
let mqttConnected = false;
let processingDownlink = false;
const downlinkQueue = [];

const mqttClient = !readOnly && mqttUsername && mqttPassword
  ? mqtt.connect(mqttBrokerUrl, {
      username: mqttUsername,
      password: mqttPassword,
      protocolVersion: 4,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      clientId: `ZB202-DT-control-${process.pid}-${Math.random().toString(16).slice(2, 10)}`,
    })
  : null;

if (mqttClient) {
  mqttClient.on("connect", () => {
    mqttConnected = true;
    console.log(`[MQTT] Connected to ${mqttBrokerUrl}`);
    broadcast({ type: "control-status", connected: true, source: "mqtt" });
  });
  mqttClient.on("reconnect", () => { mqttConnected = false; });
  mqttClient.on("close", () => {
    mqttConnected = false;
    broadcast({ type: "control-status", connected: false, source: "mqtt" });
  });
  mqttClient.on("error", (error) => console.error(`[MQTT] ${error.message}`));
} else if (readOnly) {
  console.log("[Bridge] Read-only mode: socket control, meeting edits and mode changes are refused.");
} else {
  console.warn("[MQTT] Socket control disabled: set ZB202_MQTT_USERNAME and ZB202_MQTT_PASSWORD.");
}

const fluxString = (value) => JSON.stringify(String(value));

function buildQuery(range) {
  const measurementFilter = measurement
    ? `\n  |> filter(fn: (r) => r._measurement == ${fluxString(measurement)})`
    : "";
  return `from(bucket: ${fluxString(bucket)})
  |> range(start: ${range})${measurementFilter}
  |> tail(n: 24)`;
}

function buildInventoryQuery() {
  const measurementFilter = measurement
    ? `\n  |> filter(fn: (r) => r._measurement == ${fluxString(measurement)})`
    : "";
  return `from(bucket: ${fluxString(bucket)})
  |> range(start: 0)${measurementFilter}
  |> last()`;
}

function buildWeatherQuery(range) {
  const measurementFilter = weatherMeasurement
    ? `\n  |> filter(fn: (r) => r._measurement == ${fluxString(weatherMeasurement)})`
    : `\n  |> filter(fn: (r) => r._measurement =~ /(?i:weather|outdoor|meteorological|aws|wx)/)`;
  return `from(bucket: ${fluxString(weatherBucket)})
  |> range(start: ${range})${measurementFilter}
  |> tail(n: 96)`;
}

function demandRangeConfig(range) {
  if (range === "7d") return { start: "-7d", every: "30m" };
  if (range === "30d") return { start: "-30d", every: "2h" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return { start: `time(v: ${fluxString(today.toISOString())})`, every: "5m" };
}

function buildDemandHistoryQuery(range) {
  const { start, every } = demandRangeConfig(range);
  return `from(bucket: ${fluxString(bucket)})
  |> range(start: ${start})
  |> filter(fn: (r) => r._field =~ /(?i:^active[_ -]?power$)/)
  |> aggregateWindow(every: ${every}, fn: mean, createEmpty: false)
  |> group(columns: ["_time"])
  |> sum(column: "_value")
  |> sort(columns: ["_time"])`;
}

async function sendSensorHistory(socket, message) {
  const hours = Number(message.hours);
  const stop = new Date().toISOString();
  try {
    const rows = await queryApi.collectRows(buildSensorHistoryQuery({ bucket, measurement, deviceColumn, devEui: message.devEui, deviceId: message.deviceId, hours, stop }));
    const trends = {};
    for (const row of rows) {
      const field = normalizeField(row._field);
      const time = Date.parse(row._time);
      const value = Number(row._value);
      if (!field || !Number.isFinite(time) || !Number.isFinite(value)) continue;
      (trends[field.key] ||= []).push({ time, value });
    }
    if (trends.co2) trends.co2 = correctCo2Samples(message.deviceId, trends.co2, strategyConfig);
    send(socket, { type: "sensor-history", requestId: message.requestId, deviceId: message.deviceId, hours, trends });
  } catch (error) {
    send(socket, { type: "sensor-history", requestId: message.requestId, deviceId: message.deviceId, hours, trends: {}, error: error.message });
  }
}

async function sendDemandHistory(socket, requestedRange) {
  const range = ["today", "7d", "30d"].includes(requestedRange) ? requestedRange : "today";
  try {
    const rows = await queryApi.collectRows(buildDemandHistoryQuery(range));
    const samples = rows
      .map((row) => ({ time: row._time, value: Number(row._value) / 1000 }))
      .filter((sample) => Number.isFinite(Date.parse(sample.time)) && Number.isFinite(sample.value));
    send(socket, { type: "demand-history", range, samples });
  } catch (error) {
    send(socket, { type: "demand-history", range, samples: [], error: error.message });
  }
}

// One-day replay: room environment, socket power, solar radiation and alarm events in one response.
// Results are cached per window so repeated replays and several viewers share one query.
const roomHistoryCache = new Map();
async function sendRoomHistory(socket, message) {
  const window = roomHistoryWindow({ hours: message.hours, stepMinutes: message.stepMinutes });
  const requestId = String(message.requestId || "");
  const cacheKey = `${window.hours}:${window.stepMinutes}:${window.stop}`;
  try {
    if (!roomHistoryCache.has(cacheKey)) {
      const queries = buildRoomHistoryQueries({ bucket, solarBucket, solarMeasurement: SOLAR_MEASUREMENT, ...window });
      const task = (async () => {
        const [env, power, solar, events] = await Promise.all([
          queryApi.collectRows(queries.env),
          queryApi.collectRows(queries.power),
          solarQueryApi.collectRows(queries.solar).catch(() => []),
          queryApi.collectRows(queries.events),
        ]);
        const history = roomHistoryFromRows({ env, power, solar, events });
        for (const [id, metrics] of Object.entries(history.sensors)) if (metrics.co2) metrics.co2 = correctCo2Samples(id, metrics.co2, strategyConfig);
        return history;
      })();
      roomHistoryCache.set(cacheKey, task);
      task.catch(() => roomHistoryCache.delete(cacheKey));
      for (const key of roomHistoryCache.keys()) if (roomHistoryCache.size > 4 && key !== cacheKey) roomHistoryCache.delete(key);
    }
    const history = await roomHistoryCache.get(cacheKey);
    send(socket, { type: "room-history", requestId, ...window, ...history });
  } catch (error) {
    send(socket, { type: "room-history", requestId, ...window, sensors: {}, sockets: {}, solar: [], events: [], error: error.message });
  }
}

// "23 sensors · 1,2xx readings today": counted in InfluxDB (one reading = one stored field value).
let latestReadingStats = null;
async function pollReadingStats() {
  const today = new Date(Date.now() + 8 * 3600000);
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - 8 * 3600000).toISOString();
  const rows = await queryApi.collectRows(`from(bucket: ${fluxString(bucket)})
  |> range(start: time(v: ${fluxString(start)}))
  |> filter(fn: (r) => r._measurement =~ /^(AM103|AM308|VS341|WS301|WS302|WS303|WS523)_\\d{2}$/)
  |> count()
  |> group(columns: ["_measurement"])
  |> sum()`);
  const sensors = new Set(rows.filter((row) => Number(row._value) > 0).map((row) => row._measurement));
  const readings = rows.reduce((sum, row) => sum + (Number(row._value) || 0), 0);
  latestReadingStats = { type: "reading-stats", sensorsReporting: sensors.size, readingsToday: readings, since: start, at: new Date().toISOString() };
  broadcast(latestReadingStats);
}

function send(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > 1024 * 1024) { socket.close(1013, "Client is too slow"); return; }
  socket.send(JSON.stringify(message), (error) => { if (error) socket.terminate(); });
}

function broadcast(message) {
  for (const socket of websocketServer.clients) send(socket, message);
}

function normalizeSocketId(value) {
  return String(value || "").trim().replaceAll("_", "-").toUpperCase();
}

function publishSocketCommand(deviceId, action) {
  return new Promise((resolve, reject) => {
    if (!mqttClient || !mqttConnected) {
      reject(new Error("MQTT control service is not connected"));
      return;
    }
    const devEui = socketDevices.get(deviceId);
    const commandHex = socketCommands[action];
    const topic = `/ZB202/milesight/downlink/${devEui}`;
    const payload = JSON.stringify({
      confirmed: true,
      fport: 85,
      data: Buffer.from(commandHex, "hex").toString("base64"),
    });
    const publishTimeout = setTimeout(() => reject(new Error("MQTT publish timed out")), 10000);
    mqttClient.publish(topic, payload, { qos: 0, retain: false }, (error) => {
      clearTimeout(publishTimeout);
      if (error) reject(error);
      else resolve({ topic });
    });
  });
}

async function processDownlinkQueue() {
  if (processingDownlink || !downlinkQueue.length) return;
  processingDownlink = true;
  const item = downlinkQueue.shift();
  try {
    await publishSocketCommand(item.deviceId, item.action);
    send(item.socket, { type: "control-result", requestId: item.requestId, deviceId: item.deviceId, action: item.action, ok: true });
  } catch (error) {
    send(item.socket, { type: "control-result", requestId: item.requestId, deviceId: item.deviceId, action: item.action, ok: false, error: error.message });
  } finally {
    setTimeout(() => {
      processingDownlink = false;
      processDownlinkQueue();
    }, downlinkQueue.length ? mqttDownlinkDelayMs : 0);
  }
}

function enqueueSocketControl(socket, message) {
  const deviceId = normalizeSocketId(message.deviceId);
  const action = String(message.action || "").toLowerCase();
  const requestId = String(message.requestId || "");
  if (!socketDevices.has(deviceId) || !socketCommands[action] || !requestId) {
    send(socket, { type: "control-result", requestId, deviceId, action, ok: false, error: "Invalid or unsupported socket command" });
    return;
  }
  if (downlinkQueue.length >= 16 || downlinkQueue.some((item) => item.deviceId === deviceId)) {
    send(socket, { type: "control-result", requestId, deviceId, action, ok: false, error: "Control queue busy; retry after the pending command" });
    return;
  }
  downlinkQueue.push({ socket, requestId, deviceId, action });
  send(socket, { type: "control-queued", requestId, deviceId, action, position: downlinkQueue.length + (processingDownlink ? 1 : 0) });
  processDownlinkQueue();
}

function rememberRow(rowKey) {
  if (seenRows.has(rowKey)) return false;
  seenRows.add(rowKey);
  if (seenRows.size > maxSeenRows) seenRows.delete(seenRows.values().next().value);
  return true;
}

function databaseStatus() {
  return { type: "bridge-status", connected: databaseConnected, source: "influxdb", bucket,
    startedAt: bridgeStartedAt, lastSuccessAt: lastQuerySuccessAt, error: lastQueryError,
    consecutiveFailures, queryTimeoutMs };
}
function updateDatabaseStatus(connected) {
  databaseConnected = connected;
  strategy?.setBridgeHealthy(connected);
  broadcast(databaseStatus());
}

function normalizeDevice(row) {
  for (const name of [deviceColumn, "devEui", "deviceEui", "dev_eui", "device_eui"]) {
    const value = String(row[name] || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    if (value) return { devEui: value, deviceId: "" };
  }
  const deviceId = String(row._measurement || "").trim();
  return { devEui: "", deviceId: /^[a-zA-Z0-9_-]{1,80}$/.test(deviceId) ? deviceId : "" };
}

function normalizeField(field) {
  const rawField = String(field || "").trim();
  const compact = rawField.toLowerCase().replace(/[^a-z0-9]/g, "");
  const knownFields = {
    temperaturec: ["temperature", "°C"], temperature: ["temperature", "°C"], temp: ["temperature", "°C"],
    relativehumiditypct: ["humidity", "%"], humidity: ["humidity", "%"], relativehumidity: ["humidity", "%"], rh: ["humidity", "%"],
    co2ppm: ["co2", "ppm"], co2: ["co2", "ppm"], co2concentration: ["co2", "ppm"],
    batterypct: ["battery", "%"], lightlevel: ["light", "lx"], pir: ["pir", ""],
    pm25ugm3: ["pm25", "µg/m³"], pm10ugm3: ["pm10", "µg/m³"], pressurehpa: ["pressure", "hPa"],
    tvocindex: ["tvoc", "index"], occupancy: ["occupancy", ""], magnetstatus: ["magnetStatus", ""],
    tamperstatus: ["tamperStatus", ""], noiselaeqdb: ["noiseLaeq", "dB(A)"], noiselaidb: ["noiseLai", "dB(A)"],
    noiselaimaxdb: ["noiseLaiMax", "dB(A)"], leakagestatus: ["leakageStatus", ""],
    activepower: ["activePower", "W"], current: ["current", "mA"], powerconsumption: ["powerConsumption", "Wh"],
    powerfactor: ["powerFactor", "%"], socketstatus: ["socketStatus", ""], voltage: ["voltage", "V"],
    windspeed: ["windSpeed", "m/s"], windspeedms: ["windSpeed", "m/s"], windspeedmps: ["windSpeed", "m/s"],
    winddirection: ["windDirection", "°"], winddirectiondeg: ["windDirection", "°"], winddir: ["windDirection", "°"],
    winddirction: ["windDirection", "°"],
    rainfall: ["rainfall", "mm"], rainfallmm: ["rainfall", "mm"], precipitation: ["rainfall", "mm"],
    weathercode: ["weatherCode", ""], conditioncode: ["weatherCode", ""],
  };
  const known = knownFields[compact];
  if (known) return { key: known[0], unit: known[1], sourceField: rawField };
  const key = rawField.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, letter) => letter.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
  return key ? { key, unit: "", sourceField: rawField } : null;
}

function acceptRow(row) {
  if (row._measurement === SOLAR_MEASUREMENT) return null;
  const { devEui, deviceId } = normalizeDevice(row);
  const field = normalizeField(row._field);
  const value = Number(row._value);
  const receivedAtMs = Date.parse(row._time);
  if ((!devEui && !deviceId) || !field || !Number.isFinite(value) || !Number.isFinite(receivedAtMs)) return null;
  const receivedAt = new Date(receivedAtMs).toISOString();
  const deviceKey = devEui || deviceId;
  const rowKey = `${deviceKey}:${receivedAt}:${field.key}`;
  if (!rememberRow(rowKey)) return null;

  const history = historyByDevice.get(deviceKey) || [];
  let telemetry = history.find((entry) => entry.receivedAt === receivedAt);
  if (!telemetry) {
    telemetry = { type: "telemetry", devEui, deviceId, values: {}, metrics: {}, receivedAt, source: "influxdb" };
    history.push(telemetry);
  }
  telemetry.values[field.key] = value;
  telemetry.metrics[field.key] = { unit: field.unit, sourceField: field.sourceField };
  history.sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
  historyByDevice.set(deviceKey, history.slice(-24));
  return telemetry;
}

async function collectPollingRows(api, query) {
  try { return await api.collectRows(query); }
  catch (error) {
    // Retry a reset connection once; permission and Flux errors need correction.
    if (!["ECONNRESET", "EPIPE"].includes(error.code)) throw error;
    console.warn(`[InfluxDB] Connection reset; retrying read query once (${error.code})`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    return api.collectRows(query);
  }
}

// Flags CO₂ sensors whose corrected readings look implausible; flagged sensors leave the room value.
let latestSensorHealth = null;
let sensorHealthSignature = "";
function refreshSensorHealth() {
  const history = {};
  for (const [deviceKey, entries] of historyByDevice) {
    const points = entries.filter((entry) => Number.isFinite(entry.values.co2))
      .map((entry) => correctTelemetry(entry, strategyConfig))
      .map((entry) => ({ t: Date.parse(entry.receivedAt), ppm: entry.values.co2 }));
    if (points.length) history[deviceKey] = points;
  }
  const sensors = assessCo2Health({ history, nowMs: Date.now(), config: strategyConfig });
  strategy?.setExcludedSensors(Object.entries(sensors).filter(([, item]) => item.state === "suspect").map(([id]) => id));
  const signature = JSON.stringify(Object.entries(sensors).map(([id, item]) => [id, item.state, item.reasons]));
  latestSensorHealth = { type: "sensor-health", outdoorPpm: strategyConfig.co2.outdoorPpm, sensors, at: new Date().toISOString() };
  if (signature !== sensorHealthSignature) {
    sensorHealthSignature = signature;
    broadcast(latestSensorHealth);
  }
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const range = hasLoadedHistory ? pollLookback : historyRange;
    const recentRows = await collectPollingRows(queryApi, buildQuery(range));
    const inventoryRows = hasLoadedHistory ? [] : await collectPollingRows(queryApi, buildInventoryQuery());
    let weatherRows = [];
    if (weatherQueryApi) {
      try {
        weatherRows = await collectPollingRows(weatherQueryApi, buildWeatherQuery(range));
      } catch (error) {
        console.error(`[Weather] ${error.message}`);
      }
    }
    const rows = [...inventoryRows, ...recentRows, ...weatherRows];
    const changedTelemetry = new Set();
    for (const row of rows) {
      const telemetry = acceptRow(row);
      if (telemetry) changedTelemetry.add(telemetry);
    }
    for (const telemetry of changedTelemetry) {
      strategy?.ingestTelemetry(telemetry); // the strategy applies the offsets itself
      broadcast(correctTelemetry(telemetry, strategyConfig));
    }
    refreshSensorHealth();
    if (!databaseConnected) console.log(`[InfluxDB] Connected to ${url}; loaded ${rows.length} rows from ${bucket}${weatherBucket ? ` + ${weatherBucket}` : ""}`);
    hasLoadedHistory = true;
    consecutiveFailures = 0;
    lastQueryError = null;
    lastQuerySuccessAt = new Date().toISOString();
    updateDatabaseStatus(true);
  } catch (error) {
    consecutiveFailures += 1;
    lastQueryError = { name: error.name, code: error.code || error.statusCode || null, message: error.message };
    console.error(`[InfluxDB] Query failed (${consecutiveFailures}): ${error.message}`);
    updateDatabaseStatus(false);
  } finally {
    polling = false;
  }
}

async function handleStrategyMessage(socket, message) {
  const requestId = String(message.requestId || "");
  if (!strategy) {
    send(socket, { type: "strategy-error", requestId, error: "AI ventilation strategy is disabled" });
    return;
  }
  if (message.type === "recommendation-history-request") {
    const hours = Math.min(192, Math.max(1, Number(message.hours) || 24));
    send(socket, { type: "recommendation-history", requestId, hours, entries: strategy.recommendationHistory(hours), room: strategy.roomCo2History() });
    return;
  }
  if (message.type === "calendar-update") {
    try {
      const meetings = await strategy.updateCalendar(message);
      send(socket, { type: "calendar-result", requestId, ok: true });
      broadcast({ type: "calendar", meetings });
      if (strategyStarted) void runStrategyTick();
    } catch (error) {
      send(socket, { type: "calendar-result", requestId, ok: false, error: error.message });
    }
    return;
  }
  try {
    const mode = await strategy.setControlMode(String(message.mode || ""));
    send(socket, { type: "control-mode-result", requestId, ok: true, mode });
    broadcast({ type: "control-mode", mode });
    if (strategyStarted) void runStrategyTick();
  } catch (error) {
    send(socket, { type: "control-mode-result", requestId, ok: false, mode: strategy.controller.mode, error: error.message });
  }
}

let strategyTicking = false;
async function runStrategyTick() {
  if (strategyTicking) return;
  strategyTicking = true;
  try { await strategy.tick(); }
  catch (error) { console.error(`[Strategy] Recalculation failed: ${error.message}`); }
  finally { strategyTicking = false; }
}

// Seeds the occupancy filter and 8-hour average from InfluxDB, then recalculates every 10 minutes.
async function startStrategy() {
  strategyStarted = true;
  try {
    const stop = Date.now();
    const rows = await queryApi.collectRows(buildCo2HistoryQuery({ bucket, sensors: strategyConfig.co2.sensors, start: stop - 8 * 3600000, stop }));
    strategy.warmUp(co2RowsToSeries(rows));
  } catch (error) {
    console.warn(`[Strategy] Warm-up history unavailable: ${error.message}`);
  }
  await runStrategyTick();
  const stepMs = strategyConfig.horizon.stepMinutes * 60000;
  const schedule = () => setTimeout(async () => { await runStrategyTick(); schedule(); }, stepMs - (Date.now() % stepMs) + 30000);
  schedule();
  console.log(`[Strategy] AI ventilation recommendations running in ${strategy.controller.mode} mode (${strategyConfig.optimizer.method}).`);
}

websocketServer.on("connection", (socket) => {
  if (latestSolar) send(socket, latestSolar);
  if (latestOutdoor) send(socket, latestOutdoor);
  if (latestReadingStats) send(socket, latestReadingStats);
  socket.failedKeys = 0;
  socket.isAlive = true;
  socket.on("pong", () => { socket.isAlive = true; });
  socket.on("error", (error) => console.warn(`[Bridge] Client error: ${error.message}`));
  send(socket, databaseStatus());
  const pendingHistory = new Set();
  send(socket, { type: "control-status", connected: mqttConnected, readOnly, writeProtected: Boolean(writeKeyDigest) || requireWriteKey, source: "mqtt", supportedDevices: [...socketDevices.keys()] });
  for (const history of historyByDevice.values()) for (const telemetry of history) send(socket, correctTelemetry(telemetry, strategyConfig));
  send(socket, calibrationSummary(strategyConfig));
  if (latestSensorHealth) send(socket, latestSensorHealth);
  if (strategy) {
    send(socket, { type: "calendar", meetings: strategy.calendar.meetings });
    if (strategy.latest) send(socket, strategy.latest);
  }
  socket.on("message", (data) => {
    let message;
    try { message = JSON.parse(data.toString()); } catch { return; }
    if (!message || typeof message !== "object") return;
    const resultType = { "socket-control": "control-result", "calendar-update": "calendar-result", "control-mode-request": "control-mode-result" }[message.type];
    if (resultType && (readOnly || !writeKeyMatches(message.key))) {
      const keyRejected = !readOnly;
      const error = keyRejected ? "Access key required or incorrect" : "This bridge is read-only; use the local bridge for control";
      send(socket, { type: resultType, requestId: String(message.requestId || ""), deviceId: message.deviceId, action: message.action, ok: false, keyRejected, error });
      // Limit key guessing on one connection.
      if (keyRejected && message.key && ++socket.failedKeys >= 5) socket.close(1008, "Too many incorrect access keys");
      return;
    }
    if (message.type === "socket-control") enqueueSocketControl(socket, message);
    if (["recommendation-history-request", "calendar-update", "control-mode-request"].includes(message.type)) void handleStrategyMessage(socket, message);
    if (["sensor-history-request", "demand-history-request", "room-history-request"].includes(message.type)) {
      if (pendingHistory.has(message.type)) {
        send(socket, message.type === "sensor-history-request"
          ? { type: "sensor-history", requestId: message.requestId, deviceId: message.deviceId, hours: message.hours, trends: {}, error: "History query busy; retry shortly" }
          : message.type === "room-history-request"
            ? { type: "room-history", requestId: String(message.requestId || ""), sensors: {}, sockets: {}, solar: [], events: [], error: "History query busy; retry shortly" }
            : { type: "demand-history", range: message.range, samples: [], error: "History query busy; retry shortly" });
        return;
      }
      pendingHistory.add(message.type);
      const task = message.type === "sensor-history-request" ? sendSensorHistory(socket, message)
        : message.type === "room-history-request" ? sendRoomHistory(socket, message)
          : sendDemandHistory(socket, message.range);
      void task.finally(() => pendingHistory.delete(message.type));
    }
  });
});

await new Promise((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(websocketPort, websocketHost, resolve);
});
if (strategy) {
  await strategy.init();
  strategy.onRecommendation(broadcast);
}
console.log(`[Bridge] WebSocket ready at ws://${websocketHost}:${websocketPort}`);
const heartbeat = setInterval(() => {
  for (const socket of websocketServer.clients) {
    if (!socket.isAlive) { socket.terminate(); continue; }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);
websocketServer.on("close", () => clearInterval(heartbeat));
void pollOutdoor();
setInterval(pollOutdoor, 10 * 60 * 1000);
const refreshReadingStats = () => pollReadingStats().catch((error) => console.warn(`[InfluxDB] Reading count unavailable: ${error.message}`));
setTimeout(refreshReadingStats, 5000);
setInterval(refreshReadingStats, 10 * 60 * 1000);
async function pollLoop() {
  await poll();
  if (strategy && !strategyStarted && hasLoadedHistory) {
    void startStrategy().catch((error) => console.error(`[Strategy] Start failed: ${error.message}`));
  }
  setTimeout(pollLoop, Math.min(60000, pollIntervalMs * 2 ** Math.min(consecutiveFailures, 3)));
}
void pollLoop();
