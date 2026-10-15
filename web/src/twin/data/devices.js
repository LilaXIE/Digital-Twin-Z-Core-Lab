// Device registry (from the sensor IFC and the equipment plan) and the datasets that hold readings.
// Live and demo data are separate datasets: switching demo off simply switches back to live.
import { safetySensorStatus } from "../../shared/sensor-status.js";
import { SITE } from "../config/site.js";

export const METRICS = {
  temperature: { label: { zh: "室内温度", "zh-Hant": "室內溫度", en: "Indoor temperature" }, unit: "°C", icon: "ph-thermometer-simple", digits: 1 },
  humidity: { label: { zh: "相对湿度", "zh-Hant": "相對濕度", en: "Relative humidity" }, unit: "%", icon: "ph-drop", digits: 1, glossary: "humidity" },
  co2: { label: { zh: "CO₂", "zh-Hant": "CO₂", en: "CO₂" }, unit: "ppm", icon: "ph-atom", digits: 0, glossary: "co2" },
  battery: { label: { zh: "电池电量", "zh-Hant": "電池電量", en: "Battery" }, unit: "%", icon: "ph-battery-high", digits: 0 },
  light: { label: { zh: "光照度", "zh-Hant": "光照度", en: "Light level" }, unit: "lx", icon: "ph-sun", digits: 0 },
  pir: { label: { zh: "PIR 状态", "zh-Hant": "PIR 狀態", en: "PIR status" }, unit: "", icon: "ph-person-simple", binary: "pir" },
  pm25: { label: { zh: "PM2.5", "zh-Hant": "PM2.5", en: "PM2.5" }, unit: "µg/m³", icon: "ph-circles-three", digits: 0, glossary: "pm25" },
  pm10: { label: { zh: "PM10", "zh-Hant": "PM10", en: "PM10" }, unit: "µg/m³", icon: "ph-circles-three", digits: 0 },
  pressure: { label: { zh: "大气压力", "zh-Hant": "大氣壓力", en: "Pressure" }, unit: "hPa", icon: "ph-gauge", digits: 1 },
  tvoc: { label: { zh: "TVOC 指数", "zh-Hant": "TVOC 指數", en: "TVOC index" }, unit: "", icon: "ph-chart-line", digits: 0 },
  occupancy: { label: { zh: "人体存在", "zh-Hant": "人體存在", en: "Occupancy" }, unit: "", icon: "ph-user-circle", binary: "occupancy" },
  magnetStatus: { label: { zh: "门磁状态", "zh-Hant": "門磁狀態", en: "Door contact" }, unit: "", icon: "ph-door", binary: "door" },
  tamperStatus: { label: { zh: "防拆状态", "zh-Hant": "防拆狀態", en: "Tamper status" }, unit: "", icon: "ph-shield-warning", binary: "tamper" },
  noiseLaeq: { label: { zh: "等效噪声", "zh-Hant": "等效噪音", en: "Noise LAeq" }, unit: "dB(A)", icon: "ph-waveform", digits: 1, glossary: "dba" },
  noiseLai: { label: { zh: "瞬时噪声", "zh-Hant": "瞬時噪音", en: "Noise LAI" }, unit: "dB(A)", icon: "ph-waveform", digits: 1, glossary: "dba" },
  noiseLaiMax: { label: { zh: "最大噪声", "zh-Hant": "最大噪音", en: "Noise LAImax" }, unit: "dB(A)", icon: "ph-waveform", digits: 1, glossary: "dba" },
  leakageStatus: { label: { zh: "漏水状态", "zh-Hant": "漏水狀態", en: "Leak status" }, unit: "", icon: "ph-drop", binary: "leak" },
  activePower: { label: { zh: "有功功率", "zh-Hant": "有功功率", en: "Active power" }, unit: "W", icon: "ph-lightning", digits: 1, glossary: "power" },
  current: { label: { zh: "电流", "zh-Hant": "電流", en: "Current" }, unit: "mA", icon: "ph-lightning", digits: 0 },
  powerConsumption: { label: { zh: "累计用电", "zh-Hant": "累計用電", en: "Energy" }, unit: "Wh", icon: "ph-plug", digits: 0, glossary: "power" },
  powerFactor: { label: { zh: "功率因数", "zh-Hant": "功率因數", en: "Power factor" }, unit: "%", icon: "ph-gauge", digits: 0 },
  socketStatus: { label: { zh: "插座状态", "zh-Hant": "插座狀態", en: "Socket status" }, unit: "", icon: "ph-plug", binary: "socket" },
  voltage: { label: { zh: "电压", "zh-Hant": "電壓", en: "Voltage" }, unit: "V", icon: "ph-lightning", digits: 1 },
  windSpeed: { label: { zh: "风速", "zh-Hant": "風速", en: "Wind speed" }, unit: "m/s", icon: "ph-wind", digits: 1 },
  windDirection: { label: { zh: "风向", "zh-Hant": "風向", en: "Wind direction" }, unit: "°", icon: "ph-navigation-arrow", digits: 0 },
  rainfall: { label: { zh: "降雨量", "zh-Hant": "降雨量", en: "Rainfall" }, unit: "mm", icon: "ph-cloud-rain", digits: 1 },
};

export const SENSOR_GROUPS = [
  { key: "environment", labelKey: "catEnvironment", icon: "ph-thermometer-simple", models: ["AM103", "AM308"] },
  { key: "occupancy", labelKey: "catOccupancy", icon: "ph-user-circle", models: ["VS341"] },
  { key: "door", labelKey: "catDoor", icon: "ph-door-open", models: ["WS301"] },
  { key: "leak", labelKey: "catLeak", icon: "ph-drop", models: ["WS303"] },
  { key: "socket", labelKey: "catSocket", icon: "ph-plug", models: ["WS523"] },
  { key: "noise", labelKey: "noise", icon: "ph-waveform", models: ["WS302"] },
  { key: "weather", labelKey: "catWeather", icon: "ph-cloud-sun", models: ["WEATHER", "WEATHERSTATION", "WX"] },
  { key: "other", labelKey: "catOther", icon: "ph-dots-three", models: [] },
];

const TYPES = {
  AM103: { zh: "室内环境传感器（三合一）", "zh-Hant": "室內環境感測器（三合一）", en: "Indoor environment sensor (3-in-1)" },
  AM308: { zh: "室内环境传感器（八合一）", "zh-Hant": "室內環境感測器（八合一）", en: "Indoor environment sensor (8-in-1)" },
  VS341: { zh: "人体存在传感器", "zh-Hant": "人體存在感測器", en: "Occupancy sensor" },
  WS301: { zh: "门磁传感器", "zh-Hant": "門磁感測器", en: "Magnetic contact sensor" },
  WS302: { zh: "噪声传感器", "zh-Hant": "噪音感測器", en: "Noise sensor" },
  WS303: { zh: "漏水传感器", "zh-Hant": "漏水感測器", en: "Leak detection sensor" },
  WS523: { zh: "智能插座", "zh-Hant": "智能插座", en: "Smart portable socket" },
};
export const deviceType = (model) => TYPES[model] || { zh: "IoT 传感器", "zh-Hant": "IoT 感測器", en: "IoT sensor" };

export function sensorGroupFor(device) {
  const keys = new Set(device.metrics.map((metric) => metric.key));
  if (["windSpeed", "windDirection", "rainfall"].some((key) => keys.has(key))) return SENSOR_GROUPS.find((group) => group.key === "weather");
  return SENSOR_GROUPS.find((group) => group.models.includes(device.model)) || SENSOR_GROUPS.at(-1);
}

const METRIC_ORDER = {
  VS341: ["occupancy", "battery"],
  WS301: ["magnetStatus", "battery", "tamperStatus"],
  WS303: ["leakageStatus", "battery"],
  WS523: ["activePower", "voltage", "current", "powerConsumption", "powerFactor", "socketStatus"],
  AM103: ["co2", "temperature", "humidity", "battery"],
  AM308: ["co2", "temperature", "humidity", "pm25", "pm10", "tvoc", "pressure", "light", "pir", "battery"],
};

function sortMetrics(device) {
  const order = METRIC_ORDER[device.model];
  if (!order) return;
  const rank = (key) => (order.indexOf(key) < 0 ? order.length : order.indexOf(key));
  device.metrics.sort((a, b) => rank(a.key) - rank(b.key));
}

function makeDevice(id, { devEui = "", sensorGuid = null, keys = [] } = {}) {
  const model = id.split("-")[0];
  const type = deviceType(model);
  const device = {
    id,
    model,
    devEui,
    name: { zh: `${id} ${type.zh}`, "zh-Hant": `${id} ${type["zh-Hant"]}`, en: `${id} ${type.en}` },
    type,
    sensorGuid,
    binding: null, // { modelId: "sensor", localId } once bound to the IFC
    metrics: keys.map((key) => metricDescriptor(key)),
  };
  sortMetrics(device);
  return device;
}

export function metricDescriptor(key, unit) {
  const known = METRICS[key];
  return { key, unit: unit ?? known?.unit ?? "", label: known?.label || { zh: key, "zh-Hant": key, en: key }, icon: known?.icon || "ph-chart-line", binary: known?.binary || null, digits: known?.digits ?? 1, glossary: known?.glossary || null };
}

// Sensors placed in lab-sensor.ifc (GlobalIds) plus the equipment-plan socket WS523-01 that is not in the IFC.
const IFC_SENSORS = [
  ["AM103-07", "22cHeEQV9Ccwk$gYcfob0G", "24E124725E281056"], ["AM103-08", "22cHeEQV9Ccwk$gYcfob4i", "24E124725E283167"],
  ["AM308-01", "22cHeEQV9Ccwk$gYcfob4M", "24E124707E093681"], ["AM103-05", "22cHeEQV9Ccwk$gYcfob7f", "24E124725E281413"],
  ["AM103-06", "22cHeEQV9Ccwk$gYcfob44", "24E124725E283152"],
  ["VS341-10", "0a62phbxbD4BqJO95RncHd"], ["VS341-09", "0a62phbxbD4BqJO95RncJc"], ["VS341-08", "0a62phbxbD4BqJO95RncJj"],
  ["VS341-07", "0a62phbxbD4BqJO95RncIJ"], ["VS341-06", "0a62phbxbD4BqJO95RncIP"], ["VS341-05", "0a62phbxbD4BqJO95RncIh"],
  ["VS341-04", "0a62phbxbD4BqJO95RncIj"], ["VS341-03", "0a62phbxbD4BqJO95RncIk"], ["VS341-02", "0a62phbxbD4BqJO95RncIl"],
  ["VS341-01", "0a62phbxbD4BqJO95RndjG"], ["WS303-01", "0a62phbxbD4BqJO95RndjW"], ["WS301-01", "0a62phbxbD4BqJO95Rndkh"],
  ["WS523-02", "0a62phbxbD4BqJO95Rndb6"], ["WS523-03", "0a62phbxbD4BqJO95Rnddm"], ["WS523-04", "0a62phbxbD4BqJO95RndWz"],
  ["WS301-02", "0a62phbxbD4BqJO95RndYm"], ["WS301-03", "0a62phbxbD4BqJO95Rndzx"], ["WS302-02", "0a62phbxbD4BqJO95Rndva"],
];
const DEFAULT_KEYS = {
  AM103: ["co2", "temperature", "humidity", "battery"], AM308: ["co2", "temperature", "humidity", "battery"],
  VS341: ["occupancy", "battery"], WS301: ["magnetStatus", "battery"], WS303: ["leakageStatus", "battery"],
  WS302: ["noiseLaeq", "battery"], WS523: ["activePower", "voltage", "socketStatus"],
};

export const registry = {
  devices: [
    ...IFC_SENSORS.map(([id, sensorGuid, devEui = ""]) => makeDevice(id, { sensorGuid, devEui, keys: DEFAULT_KEYS[id.split("-")[0]] })),
    makeDevice("WS523-01", { keys: DEFAULT_KEYS.WS523 }),
  ],
  mep: [], // IFC MEP components, filled by the scene loader
};

export const deviceById = (id) => registry.devices.find((device) => device.id === id);

export function createDataset(kind) {
  return {
    kind,
    snapshots: new Map(),
    connection: { known: false, connected: false, diagnostic: "", retryAt: null },
    control: { connected: false, readOnly: false, writeProtected: false },
    outdoor: null,
    radiation: null,
    readingStats: null,
    recommendation: null,
    recommendationAt: 0,
    calibration: null, // { offsets: { "AM103-08": -130 }, outdoorPpm, calibratedAt }
    sensorHealth: null, // { sensors: { "AM103-08": { state, reasons, ppm, at } }, outdoorPpm }
    recHistory: [],
    aiReview: null, // { savings, forecast } from scripts/strategy/review.mjs
    deviceHealth: null, // { devices: { id: { uplinks, longestGapMinutes, completeness, ... } }, events } (scripts/device-health.mjs)
    standby: null, // { sockets: [{ id, standbyW, yearKwh, ... }], totalYearKwh } (scripts/standby.mjs)
    recRoom: [],
    meetings: [],
    demandHistory: new Map(),
    demandLoading: new Set(),
    roomHistory: null,
    roomHistoryLoading: false,
    roomHistoryError: null,
    pendingControls: new Map(),
    controlMessage: null,
    sensorHistory: { requestId: null, deviceId: null, loading: false, error: null },
    faults: new Set(),
  };
}

export function snapshotFor(dataset, id) {
  if (!dataset.snapshots.has(id)) dataset.snapshots.set(id, { status: "unavailable", updatedAt: null, values: {}, metricUpdatedAt: {}, trends: {} });
  return dataset.snapshots.get(id);
}

// Matches a bridge telemetry message to a device, discovering new devices from InfluxDB.
export function deviceForTelemetry(message) {
  const devEui = String(message.devEui || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  const deviceId = String(message.deviceId || "").replaceAll("_", "-").toUpperCase();
  let device = registry.devices.find((item) => (devEui && item.devEui === devEui) || item.id === deviceId);
  if (!device) {
    const id = deviceId || devEui;
    if (!id) return null;
    device = makeDevice(id, { devEui });
    registry.devices.push(device);
  }
  if (devEui) device.devEui = devEui;
  let added = false;
  for (const key of Object.keys(message.values || {})) {
    if (device.metrics.some((metric) => metric.key === key)) continue;
    device.metrics.push(metricDescriptor(key, message.metrics?.[key]?.unit));
    added = true;
  }
  if (added) sortMetrics(device);
  return device;
}

export function ingestTelemetry(dataset, message, trendWindowMs = 26 * 3600000) {
  const device = deviceForTelemetry(message);
  if (!device) return null;
  const sampleTime = Date.parse(message.receivedAt);
  if (!Number.isFinite(sampleTime)) return null;
  const snapshot = snapshotFor(dataset, device.id);
  const changed = [];
  for (const [key, raw] of Object.entries(message.values || {})) {
    if (raw == null) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const trend = (snapshot.trends[key] ||= []);
    if (!trend.some((sample) => sample.time === sampleTime)) {
      trend.push({ time: sampleTime, value });
      if (trend.length > 1 && trend.at(-2).time > sampleTime) trend.sort((a, b) => a.time - b.time);
      const cutoff = Date.now() - trendWindowMs;
      while (trend.length && trend[0].time < cutoff) trend.shift();
      if (trend.length > 3000) trend.splice(0, trend.length - 3000);
    }
    if (sampleTime >= (snapshot.metricUpdatedAt[key] || 0)) {
      if (snapshot.values[key] !== value) changed.push(key);
      snapshot.values[key] = value;
      snapshot.metricUpdatedAt[key] = sampleTime;
    }
  }
  // Bridge offset corrections: the raw reading behind each corrected value.
  for (const [key, correction] of Object.entries(message.corrections || {})) {
    if (sampleTime >= (snapshot.metricUpdatedAt[key] || 0) - 1) (snapshot.corrections ||= {})[key] = correction;
  }
  snapshot.updatedAt = Math.max(snapshot.updatedAt || 0, sampleTime);
  snapshot.status = deviceStatusFromValues(device, snapshot.values);
  return { device, snapshot, changed, sampleTime };
}

export function deviceStatusFromValues(device, values) {
  return safetySensorStatus(device.model, values) || "normal";
}

export function isFresh(timeMs, now = Date.now()) {
  return Number.isFinite(timeMs) && now - timeMs <= SITE.staleAfterMs;
}
