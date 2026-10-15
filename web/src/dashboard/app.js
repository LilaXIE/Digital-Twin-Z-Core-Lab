const placeholderDevices = [
  {
    id: "ZB202-HVAC-AHU-01",
    name: { zh: "组合式空调机组", "zh-Hant": "組合式空調機組", en: "Air Handling Unit" },
    location: { zh: "ZB202 顶部机电区", "zh-Hant": "ZB202 頂部機電區", en: "Ceiling MEP Zone, ZB202" },
    status: "normal",
    maintenanceDate: "TBD",
  },
  {
    id: "ZB202-HVAC-FCU-02",
    name: { zh: "风机盘管", "zh-Hant": "風機盤管", en: "Fan Coil Unit" },
    location: { zh: "ZB202 东侧吊顶", "zh-Hant": "ZB202 東側吊頂", en: "East Ceiling, ZB202" },
    status: "warning",
    maintenanceDate: "TBD",
  },
  {
    id: "ZB202-HVAC-VAV-03",
    name: { zh: "VAV 变风量箱", "zh-Hant": "VAV 變風量箱", en: "VAV Terminal Box" },
    location: { zh: "ZB202 西侧风管支路", "zh-Hant": "ZB202 西側風管支路", en: "West Duct Branch, ZB202" },
    status: "normal",
    maintenanceDate: "TBD",
  },
  {
    id: "ZB202-HVAC-EXF-04",
    name: { zh: "排风机", "zh-Hant": "排風機", en: "Exhaust Fan" },
    location: { zh: "ZB202 南侧排风井", "zh-Hant": "ZB202 南側排風井", en: "South Exhaust Shaft, ZB202" },
    status: "alert",
    maintenanceDate: "TBD",
  },
  {
    id: "ZB202-HVAC-CHW-05",
    name: { zh: "冷冻水阀组", "zh-Hant": "冷凍水閥組", en: "Chilled Water Valve Set" },
    location: { zh: "ZB202 管井接口", "zh-Hant": "ZB202 管井介面", en: "Pipe Riser Interface, ZB202" },
    status: "normal",
    maintenanceDate: "TBD",
  },
  {
    id: "ZB202-HVAC-THS-06",
    name: { zh: "温湿度传感器", "zh-Hant": "溫濕度感測器", en: "Temperature & Humidity Sensor" },
    location: { zh: "ZB202 中部监测点", "zh-Hant": "ZB202 中部監測點", en: "Center Monitoring Point, ZB202" },
    status: "alert",
    maintenanceDate: "TBD",
  },
];

import "@phosphor-icons/web/regular";
import { safetySensorStatus } from "../shared/sensor-status.js";
import { bridgeUrl } from "../shared/bridge-url.js";

// Overview and device-detail page behavior.
const THEME_STORAGE_KEY = "zb202-theme";
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
let activeTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
let overviewConnected = false;

const i18n = {
  zh: {
    "overview.eyebrow": "ZB202 / 建筑数字孪生",
    "overview.title": "空间设备总览",
    "overview.viewCard": "卡片",
    "overview.viewTable": "表格",
    "overview.roomView": "房间视图",
    "detail.back": "← 返回总览",
    "detail.eyebrow": "ZB202 / 设备档案",
    "detail.basicInfo": "基础信息",
    "detail.maintenanceTitle": "检修记录",
    "detail.maintenanceNote": "预留后端检修明细、责任人和工单编号。",
    "detail.modelTitle": "BIM模型与状态叠加视图",
    "detail.modelSubtitle": "该区域用于承载三维模型、状态颜色叠加与关键告警注释。",
    "detail.modelPlaceholder": "BIM 3D 容器预留位",
    "detail.modelPlaceholderHint": "后续在此挂接模型渲染器与IoT实时状态流",
    "detail.switchToTable": "看数据表",
    "detail.switchToVisual": "看模型",
    "common.room": "房间",
    "common.devices": "设备数",
    "common.name": "设备名",
    "common.id": "编号",
    "common.location": "位置",
    "common.status": "状态",
    "common.model": "型号",
    "common.type": "类型",
    "common.devEui": "DevEUI",
    "common.profile": "配置",
    "common.decoder": "Decoder",
    "common.latestValues": "最新数据",
    "common.lastMaintenance": "最近检修",
    "common.statusLabel": "状态",
    "common.locationLabel": "位置",
    "common.maintenanceLabel": "检修",
    "common.field": "字段",
    "common.value": "信息",
    "common.tbd": "待接入",
    "status.normal": "在线",
    "status.warning": "告警",
    "status.alert": "离线",
    "status.unavailable": "数据不可用",
    "status.fault": "告警",
    "theme.day": "日间模式",
    "theme.night": "夜间模式",
    "theme.switchToDay": "切换至日间模式",
    "theme.switchToNight": "切换至夜间模式",
  },
  "zh-Hant": {
    "overview.eyebrow": "ZB202 / 建築數位孿生",
    "overview.title": "空間設備總覽",
    "overview.viewCard": "卡片",
    "overview.viewTable": "表格",
    "overview.roomView": "房間視圖",
    "detail.back": "← 返回總覽",
    "detail.eyebrow": "ZB202 / 設備檔案",
    "detail.basicInfo": "基礎資訊",
    "detail.maintenanceTitle": "檢修紀錄",
    "detail.maintenanceNote": "預留後端檢修明細、負責人和工單編號。",
    "detail.modelTitle": "BIM 模型與狀態疊加視圖",
    "detail.modelSubtitle": "此區域用於承載三維模型、狀態顏色疊加與重要警報註解。",
    "detail.modelPlaceholder": "BIM 3D 容器預留位",
    "detail.modelPlaceholderHint": "後續在此連接模型渲染器與 IoT 即時狀態流",
    "detail.switchToTable": "看資料表",
    "detail.switchToVisual": "看模型",
    "common.room": "房間",
    "common.devices": "設備數",
    "common.name": "設備名稱",
    "common.id": "編號",
    "common.location": "位置",
    "common.status": "狀態",
    "common.model": "型號",
    "common.type": "類型",
    "common.devEui": "DevEUI",
    "common.profile": "設定",
    "common.decoder": "Decoder",
    "common.latestValues": "最新資料",
    "common.lastMaintenance": "最近檢修",
    "common.statusLabel": "狀態",
    "common.locationLabel": "位置",
    "common.maintenanceLabel": "檢修",
    "common.field": "欄位",
    "common.value": "資訊",
    "common.tbd": "待接入",
    "status.normal": "線上",
    "status.warning": "警報",
    "status.alert": "離線",
    "status.unavailable": "資料不可用",
    "status.fault": "警報",
    "theme.day": "日間模式",
    "theme.night": "夜間模式",
    "theme.switchToDay": "切換至日間模式",
    "theme.switchToNight": "切換至夜間模式",
  },
  en: {
    "overview.eyebrow": "ZB202 / Building Digital Twin",
    "overview.title": "Indoor Environment Sensors",
    "overview.viewCard": "Card",
    "overview.viewTable": "Table",
    "overview.roomView": "Room View",
    "detail.back": "← Back to Overview",
    "detail.eyebrow": "ZB202 / Device Profile",
    "detail.basicInfo": "Basic Information",
    "detail.maintenanceTitle": "Maintenance Records",
    "detail.maintenanceNote": "Reserved for maintenance history, owners, and work-order IDs.",
    "detail.modelTitle": "BIM Model and Status Overlay",
    "detail.modelSubtitle": "This area is reserved for 3D model rendering, status overlay, and key warning annotations.",
    "detail.modelPlaceholder": "Reserved BIM 3D Canvas",
    "detail.modelPlaceholderHint": "Connect your renderer and IoT live stream here later",
    "detail.switchToTable": "Table View",
    "detail.switchToVisual": "Model View",
    "detail.openTwin": "Open in Digital Twin",
    "detail.readingsEyebrow": "Latest InfluxDB Reading",
    "detail.readingsTitle": "Indoor Environment",
    "detail.readingsNote": "Open the digital twin to view live status and historical trends.",
    "common.room": "Room",
    "common.devices": "Sensors",
    "common.name": "Name",
    "common.id": "ID",
    "common.location": "Location",
    "common.status": "Status",
    "common.model": "Model",
    "common.type": "Type",
    "common.devEui": "DevEUI",
    "common.profile": "Profile",
    "common.decoder": "Decoder",
    "common.latestValues": "Latest Values",
    "common.lastMaintenance": "Last Maintenance",
    "common.statusLabel": "Status",
    "common.locationLabel": "Location",
    "common.maintenanceLabel": "Maintenance",
    "common.field": "Field",
    "common.value": "Value",
    "common.tbd": "TBD",
    "status.normal": "Online",
    "status.warning": "Warning",
    "status.alert": "Offline",
    "status.unavailable": "Data unavailable",
    "status.fault": "Alarm",
    "theme.day": "Day mode",
    "theme.night": "Night mode",
    "theme.switchToDay": "Switch to day mode",
    "theme.switchToNight": "Switch to night mode",
  },
};

const statusClassMap = {
  normal: "ok",
  warning: "warn",
  alert: "alert",
  unavailable: "unavailable",
  fault: "alert",
};

const query = new URLSearchParams(window.location.search);
const initialLang = query.get("lang") || "en";
let activeLang = normalizeLanguage(initialLang);
let isDeviceTableMode = false;

function normalizeLanguage(lang) {
  if (lang === "en") return "en";
  if (lang === "zh-Hant" || lang === "zh-HK" || lang === "zh-TW") return "zh-Hant";
  return "zh";
}

function t(key) {
  return i18n[activeLang]?.[key] || i18n.zh[key] || key;
}

function applyI18nText() {
  document.documentElement.lang = activeLang === "en" ? "en" : activeLang === "zh-Hant" ? "zh-Hant" : "zh-CN";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });
}

function updateDeviceModeButton() {
  const toggleBtn = document.getElementById("detail-view-toggle");
  if (!toggleBtn) return;
  toggleBtn.textContent = isDeviceTableMode ? t("detail.switchToVisual") : t("detail.switchToTable");
}

function applyLanguage(lang) {
  activeLang = normalizeLanguage(lang);
  localStorage.setItem("lang", activeLang);

  const select = document.getElementById("lang-select");
  if (select) select.value = activeLang;

  applyI18nText();
  updateDeviceModeButton();
  updateThemeControl();

  const backLink = document.getElementById("back-link");
  if (backLink) backLink.href = `overview.html?lang=${activeLang}`;

  const roomViewLink = document.getElementById("room-view-link");
  if (roomViewLink) {
    roomViewLink.href = `twin.html?lang=${activeLang}`;
    roomViewLink.setAttribute("aria-label", t("overview.roomView"));
    roomViewLink.title = t("overview.roomView");
  }

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set("lang", activeLang);
  window.history.replaceState(null, "", currentUrl);
}

function addLanguageControl(onChange) {
  const select = document.getElementById("lang-select");
  if (!select) return;

  select.addEventListener("change", () => {
    applyLanguage(select.value);
    if (typeof onChange === "function") onChange();
  });
}

function getStoredTheme() {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  return value === "light" || value === "dark" ? value : null;
}

function updateThemeControl() {
  const toggle = document.getElementById("theme-toggle");
  const icon = document.getElementById("theme-icon");
  const label = document.getElementById("theme-toggle-label");
  if (!toggle || !icon || !label) return;

  const isDark = activeTheme === "dark";
  const actionLabel = t(isDark ? "theme.switchToDay" : "theme.switchToNight");
  label.textContent = t(isDark ? "theme.day" : "theme.night");
  icon.className = `ph ${isDark ? "ph-sun" : "ph-moon-stars"}`;
  toggle.setAttribute("aria-label", actionLabel);
  toggle.title = actionLabel;
}

function applyTheme(theme, persist = false) {
  activeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = activeTheme;
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
  updateThemeControl();
}

function attachThemeControl() {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    applyTheme(activeTheme === "dark" ? "light" : "dark", true);
  });
}

window.addEventListener("storage", (event) => {
  if (event.key === THEME_STORAGE_KEY && (event.newValue === "light" || event.newValue === "dark")) {
    applyTheme(event.newValue);
  }
  if (event.key === "lang" && event.newValue && normalizeLanguage(event.newValue) !== activeLang) {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("lang", normalizeLanguage(event.newValue));
    window.location.replace(nextUrl);
  }
});

function deviceUrl(deviceId) {
  const sensorId = deviceId.replaceAll("_", "-");
  return `twin.html?lang=${activeLang}&sensor=${encodeURIComponent(sensorId)}`;
}

function getDeviceText(value) {
  if (typeof value === "string") return value;
  return value?.[activeLang] || value?.zh || value?.en || "-";
}

function getStatusText(status) {
  return t(`status.${status}`);
}

function getMaintenanceText(rawValue) {
  return rawValue === "TBD" ? t("common.tbd") : rawValue;
}

function formatLatestValues(values) {
  if (!values || typeof values !== "object") return t("common.tbd");
  return Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" / ");
}

const METRIC_INFO = {
  temperature: { label: { zh: "温度", "zh-Hant": "溫度", en: "Temperature" }, unit: "°C" },
  humidity: { label: { zh: "湿度", "zh-Hant": "濕度", en: "Humidity" }, unit: "%" },
  co2: { label: { zh: "CO₂", "zh-Hant": "CO₂", en: "CO₂" }, unit: "ppm" },
  battery: { label: { zh: "电量", "zh-Hant": "電量", en: "Battery" }, unit: "%" },
  light: { label: { zh: "光照", "zh-Hant": "光照", en: "Light" }, unit: "lx" },
  pir: { label: { zh: "PIR", "zh-Hant": "PIR", en: "PIR" }, unit: "" },
  pm25: { label: { zh: "PM2.5", "zh-Hant": "PM2.5", en: "PM2.5" }, unit: "µg/m³" },
  pm10: { label: { zh: "PM10", "zh-Hant": "PM10", en: "PM10" }, unit: "µg/m³" },
  pressure: { label: { zh: "气压", "zh-Hant": "氣壓", en: "Pressure" }, unit: "hPa" },
  tvoc: { label: { zh: "TVOC 指数", "zh-Hant": "TVOC 指數", en: "TVOC Index" }, unit: "index" },
  occupancy: { label: { zh: "占用状态", "zh-Hant": "佔用狀態", en: "Occupancy" }, unit: "" },
  magnetStatus: { label: { zh: "门磁状态", "zh-Hant": "門磁狀態", en: "Magnet Status" }, unit: "" },
  tamperStatus: { label: { zh: "防拆状态", "zh-Hant": "防拆狀態", en: "Tamper Status" }, unit: "" },
  noiseLaeq: { label: { zh: "等效噪声", "zh-Hant": "等效噪聲", en: "Noise LAeq" }, unit: "dB(A)" },
  noiseLai: { label: { zh: "瞬时噪声", "zh-Hant": "瞬時噪聲", en: "Noise LAI" }, unit: "dB(A)" },
  noiseLaiMax: { label: { zh: "最大噪声", "zh-Hant": "最大噪聲", en: "Noise LAImax" }, unit: "dB(A)" },
  leakageStatus: { label: { zh: "漏水状态", "zh-Hant": "漏水狀態", en: "Leak Status" }, unit: "" },
  activePower: { label: { zh: "有功功率", "zh-Hant": "有功功率", en: "Active Power" }, unit: "W" },
  current: { label: { zh: "电流", "zh-Hant": "電流", en: "Current" }, unit: "mA" },
  powerConsumption: { label: { zh: "累计用电", "zh-Hant": "累計用電", en: "Energy" }, unit: "Wh" },
  powerFactor: { label: { zh: "功率因数", "zh-Hant": "功率因數", en: "Power Factor" }, unit: "%" },
  socketStatus: { label: { zh: "插座状态", "zh-Hant": "插座狀態", en: "Socket Status" }, unit: "" },
  voltage: { label: { zh: "电压", "zh-Hant": "電壓", en: "Voltage" }, unit: "V" },
};

function metricLabel(key) {
  const label = METRIC_INFO[key]?.label;
  if (label) return getDeviceText(label);
  return key.replace(/^./, (letter) => letter.toUpperCase());
}

function formatTelemetryValue(key, rawValue, suppliedUnit) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return String(rawValue ?? "—");
  const unit = suppliedUnit ?? METRIC_INFO[key]?.unit ?? "";
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted}${unit === "%" ? "" : " "}${unit}`.trim();
}

function discoveredDevice(message) {
  const rawId = String(message.deviceId || message.devEui || "InfluxDB sensor");
  const id = rawId.replaceAll("-", "_").toUpperCase();
  const model = id.split("_")[0];
  const typeByModel = {
    VS341: { zh: "人体存在传感器", "zh-Hant": "人體存在感測器", en: "Occupancy Sensor" },
    WS301: { zh: "门磁传感器", "zh-Hant": "門磁感測器", en: "Magnetic Contact Sensor" },
    WS302: { zh: "噪声传感器", "zh-Hant": "噪聲感測器", en: "Noise Sensor" },
    WS303: { zh: "漏水传感器", "zh-Hant": "漏水感測器", en: "Leak Detection Sensor" },
    WS523: { zh: "智能插座", "zh-Hant": "智能插座", en: "Smart Portable Socket" },
  };
  const type = typeByModel[model] || { zh: "IoT 传感器", "zh-Hant": "IoT 感測器", en: "IoT Sensor" };
  return {
    id,
    name: { zh: `${id.replaceAll("_", "-")} ${type.zh}`, "zh-Hant": `${id.replaceAll("_", "-")} ${type["zh-Hant"]}`, en: `${id.replaceAll("_", "-")} ${type.en}` },
    model,
    type,
    devEui: String(message.devEui || ""),
    profile: "InfluxDB",
    decoder: model,
    location: { zh: "ZB202 · 新接入点位", "zh-Hant": "ZB202 · 新接入點位", en: "ZB202 · Newly discovered point" },
    status: "alert",
    latestValues: {},
  };
}

function renderMetricGrid(values) {
  return Object.entries(values || {}).map(([key, value]) => `
    <div class="device-metric">
      <span>${metricLabel(key)}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function renderOverview(devices) {
  const cardRoot = document.getElementById("card-view");
  const tableBody = document.getElementById("device-table-body");
  const countEl = document.getElementById("device-count");

  if (!cardRoot || !tableBody || !countEl) return;

  countEl.textContent = String(devices.length);

  cardRoot.innerHTML = devices
    .map((device) => {
      const statusText = getStatusText(device.status);
      const statusClass = statusClassMap[device.status] || statusClassMap.normal;

      return `
      <a class="device-card" href="${deviceUrl(device.id)}" aria-label="${getDeviceText(device.name)} · ${statusText}">
        <div class="device-card-header">
          <div>
            <h3>${getDeviceText(device.name)}</h3>
            <p class="muted">${device.id}${device.model ? ` · ${device.model}` : ""}</p>
          </div>
          <span class="status"><i class="dot ${statusClass}"></i>${statusText}</span>
        </div>
        <p class="device-location">${getDeviceText(device.location)}</p>
        <div class="device-metrics">${renderMetricGrid(device.latestValues)}</div>
      </a>`;
    })
    .join("");

  tableBody.innerHTML = devices
    .map((device) => {
      const statusText = getStatusText(device.status);
      const statusClass = statusClassMap[device.status] || statusClassMap.normal;

      return `
      <tr class="device-table-row" data-href="${deviceUrl(device.id)}" tabindex="0" role="link" aria-label="${getDeviceText(device.name)} · ${statusText}">
        <td>${getDeviceText(device.name)}</td>
        <td>${device.id}</td>
        <td><span class="status"><i class="dot ${statusClass}"></i>${statusText}</span></td>
        <td>${formatLatestValues(device.latestValues)}</td>
      </tr>`;
    })
    .join("");

  tableBody.querySelectorAll(".device-table-row").forEach((row) => {
    const openDevice = () => window.location.assign(row.dataset.href);
    row.addEventListener("click", openDevice);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openDevice();
    });
  });
}

function connectOverviewBridge(devices) {
  const lastSeenAt = new Map();
  let renderTimer = null;
  let socket = null;
  let reconnectTimer = null;
  let retryAttempt = 0;
  let closing = false;

  const scheduleRender = () => {
    clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => renderOverview(devices), 50);
  };

  const updateStatuses = () => {
    for (const device of devices) {
      if (!overviewConnected || !lastSeenAt.has(device.id)) {
        device.status = "unavailable";
      } else {
        device.status = safetySensorStatus(device.model, device.rawValues) || "normal";
      }
    }
    scheduleRender();
  };

  const connect = () => {
    socket = new WebSocket(bridgeUrl());
    socket.addEventListener("open", () => { retryAttempt = 0; });
    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message !== "object") return;
      if (message.type === "bridge-status") {
        if (overviewConnected === Boolean(message.connected)) return;
        overviewConnected = Boolean(message.connected);
        updateStatuses();
        return;
      }
      if (message.type !== "telemetry") return;
      const normalizedEui = String(message.devEui || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
      const normalizedDeviceId = String(message.deviceId || "").replaceAll("-", "_").toUpperCase();
      let device = devices.find((item) => (normalizedEui && item.devEui === normalizedEui) || item.id.toUpperCase() === normalizedDeviceId);
      if (!device) {
        device = discoveredDevice(message);
        devices.push(device);
      }
      const receivedAt = Date.parse(message.receivedAt);
      if (!Number.isFinite(receivedAt)) return;
      if (receivedAt < (lastSeenAt.get(device.id) || 0)) return;
      lastSeenAt.set(device.id, receivedAt);
      device.rawValues ||= {};
      Object.assign(device.rawValues, message.values || {});
      for (const [key, value] of Object.entries(message.values || {})) {
        device.latestValues[key] = formatTelemetryValue(key, value, message.metrics?.[key]?.unit);
      }
      updateStatuses();
    });
    socket.addEventListener("close", () => {
      overviewConnected = false;
      updateStatuses();
      if (!closing) reconnectTimer = window.setTimeout(connect, Math.min(30000, 1000 * 2 ** retryAttempt++) + Math.random() * 500);
    });
    socket.addEventListener("error", () => socket.close());
  };

  window.addEventListener("beforeunload", () => {
    closing = true;
    clearTimeout(reconnectTimer);
    clearTimeout(renderTimer);
    socket?.close();
  });
  updateStatuses();
  connect();
}

function attachViewSwitch() {
  const viewButtons = Array.from(document.querySelectorAll(".seg"));
  const cardView = document.getElementById("card-view");
  const tableView = document.getElementById("table-view");

  if (!cardView || !tableView) return;

  viewButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      viewButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      cardView.classList.toggle("hidden", view !== "card");
      tableView.classList.toggle("hidden", view !== "table");
    });
  });
}

function renderDetailTable(devices) {
  const tbody = document.getElementById("detail-device-table-body");
  if (!tbody) return;

  const deviceId = query.get("deviceId");
  const device = devices.find((item) => item.id === deviceId) || devices[0];
  const statusText = getStatusText(device.status);
  const statusClass = statusClassMap[device.status] || statusClassMap.normal;

  tbody.innerHTML = `
    <tr>
      <td>${t("common.name")}</td>
      <td>${getDeviceText(device.name)}</td>
    </tr>
    <tr>
      <td>${t("common.id")}</td>
      <td>${device.id}</td>
    </tr>
    <tr>
      <td>${t("common.model")}</td>
      <td>${device.model || "-"}</td>
    </tr>
    <tr>
      <td>${t("common.type")}</td>
      <td>${getDeviceText(device.type)}</td>
    </tr>
    <tr>
      <td>${t("common.devEui")}</td>
      <td>${device.devEui || "-"}</td>
    </tr>
    <tr>
      <td>${t("common.profile")}</td>
      <td>${device.profile || "-"}</td>
    </tr>
    <tr>
      <td>${t("common.decoder")}</td>
      <td>${device.decoder || "-"}</td>
    </tr>
    <tr>
      <td>${t("common.location")}</td>
      <td>${getDeviceText(device.location)}</td>
    </tr>
    <tr>
      <td>${t("common.status")}</td>
      <td><span class="status"><i class="dot ${statusClass}"></i>${statusText}</span></td>
    </tr>
    <tr>
      <td>${t("common.lastMaintenance")}</td>
      <td>${getMaintenanceText(device.maintenanceDate)}</td>
    </tr>
    <tr>
      <td>${t("common.latestValues")}</td>
      <td>${formatLatestValues(device.latestValues)}</td>
    </tr>`;
}

function syncDetailModeUI() {
  const mainView = document.getElementById("device-main-view");
  const tableMode = document.getElementById("device-table-mode");
  if (!mainView || !tableMode) return;

  mainView.classList.toggle("hidden", isDeviceTableMode);
  tableMode.classList.toggle("hidden", !isDeviceTableMode);
  updateDeviceModeButton();
}

function attachDeviceModeToggle() {
  const toggleBtn = document.getElementById("detail-view-toggle");
  if (!toggleBtn) return;

  toggleBtn.addEventListener("click", () => {
    isDeviceTableMode = !isDeviceTableMode;
    syncDetailModeUI();
  });
}

function initCubeInteraction() {
  const stage = document.getElementById("cube-stage");
  const cube = document.getElementById("cube");
  if (!stage || !cube) return;

  let rotX = -22;
  let rotY = 35;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function paint() {
    cube.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  }

  stage.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    rotY += dx * 0.45;
    rotX -= dy * 0.45;
    rotX = Math.max(-89, Math.min(89, rotX));
    lastX = event.clientX;
    lastY = event.clientY;
    paint();
  });

  stage.addEventListener("pointerup", () => {
    dragging = false;
  });

  stage.addEventListener("pointercancel", () => {
    dragging = false;
  });

  paint();
}

function renderDeviceDetail(devices) {
  const titleEl = document.getElementById("device-title");
  const listEl = document.getElementById("device-info-list");
  const readingGrid = document.getElementById("detail-reading-grid");
  if (!titleEl || !listEl || !readingGrid) return;

  const deviceId = query.get("deviceId");
  const device = devices.find((item) => item.id === deviceId) || devices[0];
  const statusText = getStatusText(device.status);
  const statusClass = statusClassMap[device.status] || statusClassMap.normal;

  titleEl.textContent = getDeviceText(device.name);

  listEl.innerHTML = `
    <div><dt>${t("common.id")}</dt><dd>${device.id}</dd></div>
    <div><dt>${t("common.model")}</dt><dd>${device.model || "-"}</dd></div>
    <div><dt>${t("common.type")}</dt><dd>${getDeviceText(device.type)}</dd></div>
    <div><dt>${t("common.devEui")}</dt><dd>${device.devEui || "-"}</dd></div>
    <div><dt>${t("common.decoder")}</dt><dd>${device.decoder || "-"}</dd></div>
    <div><dt>${t("common.location")}</dt><dd>${getDeviceText(device.location)}</dd></div>
    <div><dt>${t("common.status")}</dt><dd><span class="status"><i class="dot ${statusClass}"></i>${statusText}</span></dd></div>
  `;

  readingGrid.innerHTML = Object.entries(device.latestValues || {}).map(([key, value]) => `
    <div class="detail-reading">
      <span>${key === "co2" ? "CO₂" : key.replace(/^./, (letter) => letter.toUpperCase())}</span>
      <strong>${value}</strong>
    </div>
  `).join("");

  const twinLink = document.getElementById("twin-view-link");
  if (twinLink) twinLink.href = `twin.html?lang=${activeLang}`;
}

async function loadDevices() {
  // Backend integration target: GET /api/devices.
  // During frontend development, data/devices.js provides the same shape.
  return window.ZB202_DEVICE_DATA || placeholderDevices;
}

(async function init() {
  const page = document.body.dataset.page;
  const devices = await loadDevices();

  applyTheme(activeTheme);
  applyLanguage(activeLang);
  systemThemeQuery.addEventListener("change", (event) => {
    if (!getStoredTheme()) applyTheme(event.matches ? "dark" : "light");
  });

  if (page === "overview") {
    renderOverview(devices);
    attachViewSwitch();
    addLanguageControl(() => {
      renderOverview(devices);
    });
    attachThemeControl();
    connectOverviewBridge(devices);
  }

  if (page === "device") {
    renderDeviceDetail(devices);
    addLanguageControl(() => {
      renderDeviceDetail(devices);
    });
  }
})();
