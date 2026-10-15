import { safetySensorStatus } from "../shared/sensor-status.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import "@phosphor-icons/web/regular";
import { demandAxis } from "../shared/demand-axis.js";
import { bridgeUrl } from "../shared/bridge-url.js";

const THEME_STORAGE_KEY = "zb202-theme";
const DEBUG_MOCK_STORAGE_KEY = "zb202-debug-mock-data";
// Virtual demonstration data, shown only with ?demo=1 or after double-clicking the clock, and always labelled.
const DEBUG_OCCUPIED_SEATS = new Set([0, 1, 2, 3, 6, 8, 9]);
const DEBUG_OFFLINE_SENSORS = new Set(["VS341-03", "AM103-05"]);
const query = new URLSearchParams(window.location.search);
const requestedSensorId = String(query.get("sensor") || "").replaceAll("_", "-").toUpperCase();
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
let activeTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

const THEME_PRESETS = {
  light: {
    background: 0xdfe6ef,
    fog: 0xdfe6ef,
    exposure: 0.92,
    hemisphereSky: 0xf8fbff,
    hemisphereGround: 0x5a6677,
    hemisphereIntensity: 1.35,
    key: 0xffffff,
    keyIntensity: 1.6,
    fill: 0xb8d7ff,
    fillIntensity: 0.65,
    gridCenter: 0xb8c4d4,
    gridLine: 0xd4dce7,
    gridOpacity: 0.35,
  },
  dark: {
    background: 0x0f1216,
    fog: 0x0f1216,
    exposure: 1.03,
    hemisphereSky: 0xe8ebef,
    hemisphereGround: 0x242a31,
    hemisphereIntensity: 1.48,
    key: 0xffffff,
    keyIntensity: 1.72,
    fill: 0x9db4cc,
    fillIntensity: 0.68,
    gridCenter: 0x3b4149,
    gridLine: 0x252a31,
    gridOpacity: 0.4,
  },
};

const MODELS = [
  { id: "archi", name: "Lab-archi.frag", url: "./models/fragments/Lab-archi.frag", label: "Lab Architecture" },
  {
    id: "mep",
    name: "Lab-mep.frag",
    url: "./models/fragments/Lab-mep.frag",
    label: "Lab MEP",
    hiddenCategories: ["IFCCOVERING"],
  },
  { id: "sensor", name: "Sensor.frag", url: "./models/fragments/Sensor.frag", label: "Lab Sensors" },
];

const MODEL = {
  name: MODELS.map((model) => model.name).join(" + "),
  label: "Lab Archi + MEP + Sensors",
};

const I18N = {
  zh: {
    backAria: "返回设备总览", title: "ZB202 空间设备监控", connectionAria: "数据连接状态",
    mockRunning: "模拟数据运行中", viewerAria: "IFC / Fragments 三维模型", model: "模型",
    calibrate: "校准点位", calibrateTitle: "在模型表面拾取世界坐标", resetView: "重置视角", resetTitle: "重置模型视角",
    preparingScene: "正在准备三维场景", initializingRenderer: "初始化渲染器…", loadFailed: "模型加载失败",
    loadRetryHint: "请检查模型文件后重试。", reload: "重新加载", rotateHint: "左键旋转", panHint: "右键平移",
    zoomHint: "滚轮缩放", components: "构件", copy: "复制", copied: "已复制", sidebarAria: "设备实时信息",
    deviceStatus: "设备状态", deviceListAria: "IFC 设备列表", last48Seconds: "最近 48 秒", trendAria: "实时数据趋势图",
    openDevicePanel: "设备面板", closeDevicePanel: "关闭设备面板", statusLegendAria: "设备状态图例",
    lastUpdated: "最后更新", normal: "正常", warning: "注意", fault: "故障", unavailable: "未绑定", dataUnavailable: "数据源未连接",
    noBinding: "当前模型无绑定", objectBinding: "BIM 构件绑定", markerBinding: "空间坐标绑定",
    restoreNormal: "恢复设备正常", simulateFault: "模拟设备故障", readingModel: "读取模型文件…",
    loadingModel: "正在加载 {model}", modelReady: "{count} 个构件 · 模型准备完成",
    loadError: "无法读取 {model}。请通过 npm run dev 启动项目，并确认 Fragments 模型文件存在。",
    supplyTemperature: "送风温度", fanPower: "风机功率", airflow: "送风量", damperPosition: "风阀开度",
    ifcProperties: "IFC 属性", ifcCategory: "IFC 类型", globalId: "GlobalId", expressId: "Express ID",
    allEquipment: "全部", sensors: "传感器", fans: "风机", coils: "盘管", dampers: "风阀", airTerminals: "风口", ducts: "风管", pipes: "管道", mepComponents: "机电构件",
    noProperties: "没有可显示的 IFC 属性", staticBimItem: "静态 BIM 构件", scannedEquipment: "自动扫描设备",
    searchEquipmentPlaceholder: "搜索", searchEquipmentAria: "搜索 IFC 设备", noSearchResults: "没有匹配的 IFC 设备",
    temperature: "室内温度", humidity: "相对湿度", co2: "CO₂",
    dataPanelAria: "传感器数据面板", closeDataPanel: "关闭数据面板", sensorData: "传感器数据",
    componentDetails: "构件详情", componentInfo: "BIM 构件", ifcType: "IFC 类型", identifiers: "标识符",
    earlier: "较早", now: "现在",
    readingsInRange: "所选 {range} 时间范围内有 {count} 条真实记录",
    trendOutsideRange: "所选时间内无记录，显示最近可用数据",
    trendOneReading: "仅有一条记录，暂无法形成趋势",
    trendNoReadings: "暂无历史记录",
    lastUpload: "最后记录", custom: "自定义", mockHistoryNote: "当前显示可用的数据窗口",
    bmsReserved: "AHU 运行数据将在后续版本接入。", aiReserved: "AI 分析模块将在后续版本接入。",
    reservedCopy: "此模块为后续功能预留。", online: "在线", offline: "离线", maintenance: "维护中",
    siteOverview: "场地概览", iotSensorsList: "IoT 传感器列表", closeOverviewPanel: "关闭概览面板",
    siteTemperature: "温度", siteHumidity: "湿度", siteCo2: "CO₂", occupants: "人数",
    modelLayersAria: "模型可见层", historyRangeAria: "历史数据范围", humidityTrendAria: "相对湿度趋势图", co2TrendAria: "CO₂ 趋势图", platformOverviewAria: "平台概览", mainNavigationAria: "主要功能",
  },
  "zh-Hant": {
    backAria: "返回設備總覽", title: "ZB202 空間設備監控", connectionAria: "資料連線狀態",
    mockRunning: "模擬資料運行中", viewerAria: "IFC / Fragments 三維模型", model: "模型",
    calibrate: "校準點位", calibrateTitle: "在模型表面擷取世界座標", resetView: "重設視角", resetTitle: "重設模型視角",
    preparingScene: "正在準備三維場景", initializingRenderer: "初始化渲染器…", loadFailed: "模型載入失敗",
    loadRetryHint: "請檢查模型檔案後重試。", reload: "重新載入", rotateHint: "左鍵旋轉", panHint: "右鍵平移",
    zoomHint: "滾輪縮放", components: "構件", copy: "複製", copied: "已複製", sidebarAria: "設備即時資訊",
    deviceStatus: "設備狀態", deviceListAria: "IFC 設備列表", last48Seconds: "最近 48 秒", trendAria: "即時資料趨勢圖",
    openDevicePanel: "設備面板", closeDevicePanel: "關閉設備面板", statusLegendAria: "設備狀態圖例",
    lastUpdated: "最後更新", normal: "正常", warning: "注意", fault: "故障", unavailable: "未綁定", dataUnavailable: "資料來源未連線",
    noBinding: "目前模型未綁定", objectBinding: "BIM 構件綁定", markerBinding: "空間座標綁定",
    restoreNormal: "恢復設備正常", simulateFault: "模擬設備故障", readingModel: "讀取模型檔案…",
    loadingModel: "正在載入 {model}", modelReady: "{count} 個構件 · 模型準備完成",
    loadError: "無法讀取 {model}。請透過 npm run dev 啟動專案，並確認 Fragments 模型檔案存在。",
    supplyTemperature: "送風溫度", fanPower: "風機功率", airflow: "送風量", damperPosition: "風閥開度",
    ifcProperties: "IFC 屬性", ifcCategory: "IFC 類型", globalId: "GlobalId", expressId: "Express ID",
    allEquipment: "全部", sensors: "感測器", fans: "風機", coils: "盤管", dampers: "風閥", airTerminals: "風口", ducts: "風管", pipes: "管道", mepComponents: "機電構件",
    noProperties: "沒有可顯示的 IFC 屬性", staticBimItem: "靜態 BIM 構件", scannedEquipment: "自動掃描設備",
    searchEquipmentPlaceholder: "搜尋", searchEquipmentAria: "搜尋 IFC 設備", noSearchResults: "沒有符合的 IFC 設備",
    temperature: "室內溫度", humidity: "相對濕度", co2: "CO₂",
    dataPanelAria: "感測器資料面板", closeDataPanel: "關閉資料面板", sensorData: "感測器資料",
    componentDetails: "構件詳情", componentInfo: "BIM 構件", ifcType: "IFC 類型", identifiers: "識別碼",
    earlier: "較早", now: "現在",
    readingsInRange: "所選 {range} 時間範圍內有 {count} 筆真實記錄",
    trendOutsideRange: "所選時間內無記錄，顯示最近可用資料",
    trendOneReading: "僅有一筆記錄，暫無法形成趨勢",
    trendNoReadings: "暫無歷史記錄",
    lastUpload: "最後記錄", custom: "自訂", mockHistoryNote: "目前顯示可用的資料視窗",
    bmsReserved: "AHU 運行資料將於後續版本接入。", aiReserved: "AI 分析模組將於後續版本接入。",
    reservedCopy: "此模組為後續功能預留。", online: "在線", offline: "離線", maintenance: "維護中",
    siteOverview: "場地概覽", iotSensorsList: "IoT 感測器列表", closeOverviewPanel: "關閉概覽面板",
    siteTemperature: "溫度", siteHumidity: "濕度", siteCo2: "CO₂", occupants: "人數",
    modelLayersAria: "模型可見層", historyRangeAria: "歷史資料範圍", humidityTrendAria: "相對濕度趨勢圖", co2TrendAria: "CO₂ 趨勢圖", platformOverviewAria: "平台概覽", mainNavigationAria: "主要功能",
  },
  en: {
    backAria: "Back to device overview", title: "ZB202 Spatial Equipment Monitoring", connectionAria: "Data connection status",
    mockRunning: "Mock data running", viewerAria: "IFC / Fragments 3D model", model: "Model",
    calibrate: "Calibrate Point", calibrateTitle: "Pick world coordinates on the model surface", resetView: "Reset View", resetTitle: "Reset model view",
    preparingScene: "Preparing 3D scene", initializingRenderer: "Initializing renderer…", loadFailed: "Model loading failed",
    loadRetryHint: "Check the model file and try again.", reload: "Reload", rotateHint: "Left-drag to rotate", panHint: "Right-drag to pan",
    zoomHint: "Scroll to zoom", components: "components", copy: "Copy", copied: "Copied", sidebarAria: "Live device information",
    deviceStatus: "Device Status", deviceListAria: "IFC equipment list", last48Seconds: "Last 48 seconds", trendAria: "Live data trend chart",
    openDevicePanel: "Device Panel", closeDevicePanel: "Close device panel", statusLegendAria: "Device status legend",
    lastUpdated: "Last updated", normal: "Normal", warning: "Warning", fault: "Fault", unavailable: "Unbound", dataUnavailable: "Data source unavailable",
    noBinding: "Not bound in this model", objectBinding: "BIM Component Binding", markerBinding: "Spatial Coordinate Binding",
    restoreNormal: "Restore Normal Status", simulateFault: "Simulate Device Fault", readingModel: "Reading model file…",
    loadingModel: "Loading {model}", modelReady: "{count} components · Model ready",
    loadError: "Unable to load {model}. Start the project with npm run dev and confirm the Fragments model file exists.",
    supplyTemperature: "Supply Air Temperature", fanPower: "Fan Power", airflow: "Airflow", damperPosition: "Damper Position",
    ifcProperties: "IFC Properties", ifcCategory: "IFC Type", globalId: "GlobalId", expressId: "Express ID",
    allEquipment: "All", sensors: "Sensors", fans: "Fans", coils: "Coils", dampers: "Dampers", airTerminals: "Air Terminals", ducts: "Ducts", pipes: "Pipes", mepComponents: "MEP",
    noProperties: "No IFC properties available", staticBimItem: "Static BIM Component", scannedEquipment: "Auto-scanned equipment",
    searchEquipmentPlaceholder: "Search", searchEquipmentAria: "Search IFC equipment", noSearchResults: "No matching IFC equipment",
    temperature: "Indoor Temperature", humidity: "Relative Humidity", co2: "CO₂",
    dataPanelAria: "Sensor data panel", closeDataPanel: "Close data panel", sensorData: "Sensor Data",
    componentDetails: "Component Details", componentInfo: "BIM Component", ifcType: "IFC Type", identifiers: "Identifiers",
    readingsInRange: "{count} real readings in the selected {range} window",
    trendOutsideRange: "No readings in this range; showing latest available data",
    trendOneReading: "Only one reading; no trend yet",
    trendNoReadings: "No historical readings yet",
    earlier: "Earlier", now: "Now",
    lastUpload: "Last reading", custom: "Custom", mockHistoryNote: "Showing the available data window",
    bmsReserved: "AHU operating data will be connected in a future release.", aiReserved: "AI analytics will be connected in a future release.",
    reservedCopy: "This space is reserved for a future module.", online: "Online", offline: "Offline", maintenance: "Maintenance",
    siteOverview: "Site Overview", iotSensorsList: "IoT Sensors List", closeOverviewPanel: "Close overview panel",
    siteTemperature: "Temperature", siteHumidity: "Humidity", siteCo2: "CO₂", occupants: "Occupants",
    modelLayersAria: "Model visibility layers", historyRangeAria: "History range", humidityTrendAria: "Relative humidity trend chart", co2TrendAria: "CO₂ trend chart", platformOverviewAria: "Platform overview", mainNavigationAria: "Main navigation",
  },
};

let activeLang = normalizeLanguage(query.get("lang") || "en");

function normalizeLanguage(lang) {
  if (lang === "en") return "en";
  if (lang === "zh-Hant" || lang === "zh-HK" || lang === "zh-TW") return "zh-Hant";
  return "zh";
}

function activeLocale() {
  if (activeLang === "en") return "en-GB";
  return activeLang === "zh-Hant" ? "zh-HK" : "zh-CN";
}

function t(key, values = {}) {
  let text = I18N[activeLang]?.[key] || I18N.zh[key] || key;
  for (const [name, value] of Object.entries(values)) text = text.replace(`{${name}}`, value);
  return text;
}

function getStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function applyTheme(theme, persist = false) {
  activeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = activeTheme;

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
    } catch {
      // The selected theme still applies for this session when storage is unavailable.
    }
  }

  const preset = THEME_PRESETS[activeTheme];
  scene.background.setHex(preset.background);
  scene.fog.color.setHex(preset.fog);
  renderer.toneMappingExposure = preset.exposure;
  hemisphereLight.color.setHex(preset.hemisphereSky);
  hemisphereLight.groundColor.setHex(preset.hemisphereGround);
  hemisphereLight.intensity = preset.hemisphereIntensity;
  keyLight.color.setHex(preset.key);
  keyLight.intensity = preset.keyIntensity;
  fillLight.color.setHex(preset.fill);
  fillLight.intensity = preset.fillIntensity;

  if (state.model) addGrid();
}

const STATUS = {
  normal: { color: 0x20a464 },
  warning: { color: 0xe99a2c },
  fault: { color: 0xe34d59 },
  offline: { color: 0xe34d59 },
  unavailable: { color: 0x8b94a6 },
};

const INFLUX_STALE_AFTER_MS = 15 * 60 * 1000;
const PANEL_TRANSITION_MS = 150;
const MAX_SEEN_TELEMETRY = 5000;
const SOCKET_CONTROL_TIMEOUT_MS = 60000;

const EQUIPMENT_GROUPS = [
  { key: "fans", category: "IFCFAN", label: { zh: "风机", "zh-Hant": "風機", en: "Fan" } },
  { key: "coils", category: "IFCCOIL", label: { zh: "盘管", "zh-Hant": "盤管", en: "Coil" } },
  { key: "dampers", category: "IFCDAMPER", label: { zh: "风阀", "zh-Hant": "風閥", en: "Damper" } },
  { key: "airTerminals", category: "IFCAIRTERMINAL", label: { zh: "风口", "zh-Hant": "風口", en: "Air Terminal" } },
  { key: "airTerminals", category: "IFCAIRTERMINALBOX", label: { zh: "风口箱", "zh-Hant": "風口箱", en: "Air Terminal Box" } },
  { key: "ducts", category: "IFCDUCTSEGMENT", label: { zh: "风管", "zh-Hant": "風管", en: "Duct" } },
  { key: "ducts", category: "IFCDUCTFITTING", label: { zh: "风管管件", "zh-Hant": "風管管件", en: "Duct Fitting" } },
  { key: "pipes", category: "IFCPIPESEGMENT", label: { zh: "空调水管", "zh-Hant": "空調水管", en: "HVAC Pipe" } },
  { key: "pipes", category: "IFCPIPEFITTING", label: { zh: "管道管件", "zh-Hant": "管道管件", en: "Pipe Fitting" } },
];

let DEVICES = [];
let MEP_COMPONENTS = [];

const INFLUX_METRICS = {
  temperature: { label: { zh: "室内温度", "zh-Hant": "室內溫度", en: "Indoor Temperature" }, unit: "°C", icon: "ph-thermometer-simple" },
  humidity: { label: { zh: "相对湿度", "zh-Hant": "相對濕度", en: "Relative Humidity" }, unit: "%", icon: "ph-drop" },
  co2: { label: { zh: "CO₂", "zh-Hant": "CO₂", en: "CO₂" }, unit: "ppm", icon: "ph-atom" },
  battery: { label: { zh: "电池电量", "zh-Hant": "電池電量", en: "Battery" }, unit: "%", icon: "ph-battery-high" },
  light: { label: { zh: "光照度", "zh-Hant": "光照度", en: "Light Level" }, unit: "lx", icon: "ph-sun" },
  pir: { label: { zh: "PIR 状态", "zh-Hant": "PIR 狀態", en: "PIR Status" }, unit: "", icon: "ph-person-simple" },
  pm25: { label: { zh: "PM2.5", "zh-Hant": "PM2.5", en: "PM2.5" }, unit: "µg/m³", icon: "ph-circles-three" },
  pm10: { label: { zh: "PM10", "zh-Hant": "PM10", en: "PM10" }, unit: "µg/m³", icon: "ph-circles-three" },
  pressure: { label: { zh: "大气压力", "zh-Hant": "大氣壓力", en: "Pressure" }, unit: "hPa", icon: "ph-gauge" },
  tvoc: { label: { zh: "TVOC 指数", "zh-Hant": "TVOC 指數", en: "TVOC Index" }, unit: "index", icon: "ph-chart-line" },
  occupancy: { label: { zh: "人体存在", "zh-Hant": "人體存在", en: "Occupancy" }, unit: "", icon: "ph-user-circle" },
  magnetStatus: { label: { zh: "门磁状态", "zh-Hant": "門磁狀態", en: "Magnet Status" }, unit: "", icon: "ph-door" },
  tamperStatus: { label: { zh: "防拆状态", "zh-Hant": "防拆狀態", en: "Tamper Status" }, unit: "", icon: "ph-shield-warning" },
  noiseLaeq: { label: { zh: "等效噪声", "zh-Hant": "等效噪聲", en: "Noise LAeq" }, unit: "dB(A)", icon: "ph-waveform" },
  noiseLai: { label: { zh: "瞬时噪声", "zh-Hant": "瞬時噪聲", en: "Noise LAI" }, unit: "dB(A)", icon: "ph-waveform" },
  noiseLaiMax: { label: { zh: "最大噪声", "zh-Hant": "最大噪聲", en: "Noise LAImax" }, unit: "dB(A)", icon: "ph-waveform" },
  leakageStatus: { label: { zh: "漏水状态", "zh-Hant": "漏水狀態", en: "Leak Status" }, unit: "", icon: "ph-drop" },
  activePower: { label: { zh: "有功功率", "zh-Hant": "有功功率", en: "Active Power" }, unit: "W", icon: "ph-lightning" },
  current: { label: { zh: "电流", "zh-Hant": "電流", en: "Current" }, unit: "mA", icon: "ph-lightning" },
  powerConsumption: { label: { zh: "累计用电", "zh-Hant": "累計用電", en: "Energy" }, unit: "Wh", icon: "ph-plug" },
  powerFactor: { label: { zh: "功率因数", "zh-Hant": "功率因數", en: "Power Factor" }, unit: "%", icon: "ph-gauge" },
  socketStatus: { label: { zh: "插座状态", "zh-Hant": "插座狀態", en: "Socket Status" }, unit: "", icon: "ph-plug" },
  voltage: { label: { zh: "电压", "zh-Hant": "電壓", en: "Voltage" }, unit: "V", icon: "ph-lightning" },
  windSpeed: { label: { zh: "风速", "zh-Hant": "風速", en: "Wind Speed" }, unit: "m/s", icon: "ph-wind" },
  windDirection: { label: { zh: "风向", "zh-Hant": "風向", en: "Wind Direction" }, unit: "°", icon: "ph-navigation-arrow" },
  rainfall: { label: { zh: "降雨量", "zh-Hant": "降雨量", en: "Rainfall" }, unit: "mm", icon: "ph-cloud-rain" },
  weatherCode: { label: { zh: "天气代码", "zh-Hant": "天氣代碼", en: "Weather Code" }, unit: "", icon: "ph-cloud-sun" },
};

const SENSOR_GROUPS = [
  { key: "environment", label: "Environment", tagLabel: "Environment", icon: "ph-thermometer-simple", models: ["AM103", "AM308", "WS302"] },
  { key: "occupancy", label: "Occupancy", tagLabel: "Occupancy", icon: "ph-user-circle", models: ["VS341"] },
  { key: "door", label: "Door Contact", tagLabel: "Door Contact", icon: "ph-door-open", models: ["WS301"] },
  { key: "leak", label: "Leak Detection", tagLabel: "Leak Detection", icon: "ph-drop", models: ["WS303"] },
  { key: "socket", label: "Smart Socket", tagLabel: "Smart Socket", icon: "ph-plug", models: ["WS523"] },
  { key: "weather", label: "Weather Station", tagLabel: "Weather Station", icon: "ph-cloud-sun", models: ["WEATHER", "WEATHERSTATION", "WX"] },
  { key: "other", label: "Other Devices", tagLabel: "Other Devices", icon: "ph-dots-three", models: [] },
];

function sensorGroupFor(device) {
  const model = String(device.sensorModel || "").toUpperCase();
  const metricKeys = new Set(device.metrics?.map((metric) => metric.key));
  if (["windSpeed", "windDirection", "rainfall", "weatherCode"].some((key) => metricKeys.has(key))) {
    return SENSOR_GROUPS.find((group) => group.key === "weather");
  }
  return SENSOR_GROUPS.find((group) => group.models.includes(model)) || SENSOR_GROUPS.at(-1);
}

function metricText(metric) {
  return metric.label?.[activeLang] || metric.label?.zh || metric.label?.en || t(metric.labelKey || metric.key);
}

function influxDeviceType(model) {
  const types = {
    VS341: { zh: "人体存在传感器", "zh-Hant": "人體存在感測器", en: "Occupancy Sensor" },
    WS301: { zh: "门磁传感器", "zh-Hant": "門磁感測器", en: "Magnetic Contact Sensor" },
    WS302: { zh: "噪声传感器", "zh-Hant": "噪聲感測器", en: "Noise Sensor" },
    WS303: { zh: "漏水传感器", "zh-Hant": "漏水感測器", en: "Leak Detection Sensor" },
    WS523: { zh: "智能插座", "zh-Hant": "智能插座", en: "Smart Portable Socket" },
    WEATHER: { zh: "室外气象站", "zh-Hant": "室外氣象站", en: "Outdoor Weather Station" },
    WEATHERSTATION: { zh: "室外气象站", "zh-Hant": "室外氣象站", en: "Outdoor Weather Station" },
    WX: { zh: "室外气象站", "zh-Hant": "室外氣象站", en: "Outdoor Weather Station" },
  };
  return types[model] || { zh: "IoT 传感器", "zh-Hant": "IoT 感測器", en: "IoT Sensor" };
}

function telemetryMetric(key, message) {
  const known = INFLUX_METRICS[key];
  return {
    key,
    label: known?.label || { zh: key, "zh-Hant": key, en: key },
    unit: message.metrics?.[key]?.unit ?? known?.unit ?? "",
    icon: known?.icon || "ph-chart-line",
  };
}

function ensureTelemetryDevice(message) {
  const normalizedEui = String(message.devEui || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  const normalizedDeviceId = String(message.deviceId || "").replaceAll("_", "-").toUpperCase();
  let device = DEVICES.find((item) => (normalizedEui && item.devEui === normalizedEui) || item.id.toUpperCase() === normalizedDeviceId);
  if (!device) {
    const id = normalizedDeviceId || normalizedEui;
    if (!id) return null;
    const model = id.split("-")[0];
    const type = influxDeviceType(model);
    device = {
      id,
      name: { zh: `${id} ${type.zh}`, "zh-Hant": `${id} ${type["zh-Hant"]}`, en: `${id} ${type.en}` },
      subtitle: { zh: `${model} · InfluxDB 自动发现`, "zh-Hant": `${model} · InfluxDB 自動發現`, en: `${model} · Discovered from InfluxDB` },
      category: "IOT_SENSOR",
      groupKey: "sensors",
      sensorModel: model,
      devEui: normalizedEui,
      binding: { kind: "data", globalId: null, localId: null },
      metrics: [],
      ifc: { localId: null, category: "IoT Sensor", guid: null, name: id, data: { Source: "InfluxDB", Binding: "No BIM location assigned" } },
    };
    DEVICES.push(device);
    state.snapshots.set(device.id, { deviceId: device.id, status: "unavailable", updatedAt: new Date(), values: {}, trends: {} });
  }
  if (normalizedEui) device.devEui = normalizedEui;
  const snapshot = state.snapshots.get(device.id);
  for (const key of Object.keys(message.values || {})) {
    if (!device.metrics.some((metric) => metric.key === key)) device.metrics.push(telemetryMetric(key, message));
    if (!(key in snapshot.values)) snapshot.values[key] = null;
    if (!snapshot.trends[key]) snapshot.trends[key] = [];
  }
  if (device.sensorModel === "VS341") {
    const priority = { occupancy: 0, battery: 1 };
    device.metrics.sort((a, b) => (priority[a.key] ?? 2) - (priority[b.key] ?? 2));
  }
  if (device.sensorModel === "WS523") {
    const order = ["activePower", "voltage", "current", "powerConsumption", "powerFactor", "socketStatus"];
    device.metrics.sort((a, b) => (order.indexOf(a.key) < 0 ? order.length : order.indexOf(a.key)) - (order.indexOf(b.key) < 0 ? order.length : order.indexOf(b.key)));
  }
  return device;
}

function fallbackSensorDevices() {
  const positions = [
    { model: "AM103", number: "07", devEui: "24E124725E281056", sensorGuid: "22cHeEQV9Ccwk$gYcfob0G", normalizedPosition: [0.29, 0.66, 0.31] },
    { model: "AM103", number: "08", devEui: "24E124725E283167", sensorGuid: "22cHeEQV9Ccwk$gYcfob4i", normalizedPosition: [0.51, 0.83, 0.39] },
    { model: "AM308", number: "01", devEui: "24E124707E093681", sensorGuid: "22cHeEQV9Ccwk$gYcfob4M", normalizedPosition: [0.56, 0.50, 0.54] },
    { model: "AM103", number: "05", devEui: "24E124725E281413", sensorGuid: "22cHeEQV9Ccwk$gYcfob7f", normalizedPosition: [0.43, 0.54, 0.62] },
    { model: "AM103", number: "06", devEui: "24E124725E283152", sensorGuid: "22cHeEQV9Ccwk$gYcfob44", normalizedPosition: [0.68, 0.48, 0.57] },
  ];
  return positions.map(({ model, number, devEui, sensorGuid, normalizedPosition }, index) => {
    return {
      id: `${model}-${number}`,
      name: {
        zh: `${model}-${number} 室内环境传感器`,
        "zh-Hant": `${model}-${number} 室內環境感測器`,
        en: `${model}-${number} Indoor Environment Sensor`,
      },
      subtitle: {
        zh: `${model} · ${model === "AM308" ? "八合一" : "三合一"} · 室内环境`,
        "zh-Hant": `${model} · ${model === "AM308" ? "八合一" : "三合一"} · 室內環境`,
        en: `${model} · ${model === "AM308" ? "8-in-1" : "3-in-1"} · Indoor environment`,
      },
      category: "IOT_SENSOR",
      groupKey: "sensors",
      sensorModel: model,
      devEui,
      binding: { kind: "marker", sensorGuid, normalizedPosition },
      metrics: [
        { key: "temperature", labelKey: "temperature", unit: "°C", value: 22.8 + index * 0.4, variance: 0.18 },
        { key: "humidity", labelKey: "humidity", unit: "%", value: 52 + index * 2, variance: 0.6 },
        { key: "co2", labelKey: "co2", unit: "ppm", value: 610 + index * 45, variance: 8 },
      ],
      ifc: { localId: `MOCK-${number}`, category: "IoT Sensor", guid: null, name: `AM103-${number}`, data: { Source: "Mock data", Binding: "Normalized model coordinate" } },
    };
  });
}

function configuredSafetySensors() {
  const guidById = {
    "VS341-10": "0a62phbxbD4BqJO95RncHd", "VS341-09": "0a62phbxbD4BqJO95RncJc",
    "VS341-08": "0a62phbxbD4BqJO95RncJj", "VS341-07": "0a62phbxbD4BqJO95RncIJ",
    "VS341-06": "0a62phbxbD4BqJO95RncIP", "VS341-05": "0a62phbxbD4BqJO95RncIh",
    "VS341-04": "0a62phbxbD4BqJO95RncIj", "VS341-03": "0a62phbxbD4BqJO95RncIk",
    "VS341-02": "0a62phbxbD4BqJO95RncIl", "VS341-01": "0a62phbxbD4BqJO95RndjG",
    "WS303-01": "0a62phbxbD4BqJO95RndjW", "WS301-01": "0a62phbxbD4BqJO95Rndkh",
    "WS523-02": "0a62phbxbD4BqJO95Rndb6", "WS523-03": "0a62phbxbD4BqJO95Rnddm",
    "WS523-04": "0a62phbxbD4BqJO95RndWz", "WS301-02": "0a62phbxbD4BqJO95RndYm",
    "WS301-03": "0a62phbxbD4BqJO95Rndzx", "WS302-02": "0a62phbxbD4BqJO95Rndva",
  };
  return Object.entries(guidById).map(([id, sensorGuid]) => {
    const model = id.split("-")[0];
    const keys = { VS341: ["occupancy", "battery"], WS301: ["magnetStatus", "tamperStatus", "battery"], WS303: ["leakageStatus", "battery"], WS302: ["noise", "battery"], WS523: ["activePower", "voltage"] }[model] || [];
    const type = influxDeviceType(model);
    return {
      id,
      name: { zh: `${id} ${type.zh}`, "zh-Hant": `${id} ${type["zh-Hant"]}`, en: `${id} ${type.en}` },
      subtitle: { zh: `${model} · ZB202`, "zh-Hant": `${model} · ZB202`, en: `${model} · ZB202` },
      category: "IOT_SENSOR",
      groupKey: "sensors",
      sensorModel: model,
      devEui: "",
      binding: { kind: "marker", sensorGuid },
      metrics: keys.map((key) => telemetryMetric(key, {})),
      ifc: { localId: null, category: "IoT Sensor", guid: sensorGuid, name: id, data: { Source: "IFC", Sensor_ID: id } },
    };
  });
}

async function bindSensorsToIfc(devices, sensorModel) {
  if (!sensorModel) return devices;
  for (const device of devices) {
    const [localId] = await sensorModel.getLocalIdsByGuids([device.binding.sensorGuid]);
    if (localId === undefined) continue;
    const details = await loadIfcItemDetails(localId, "IFCBUILDINGELEMENTPROXY", sensorModel);
    device.binding = { kind: "object", modelId: "sensor", localId, globalId: device.binding.sensorGuid };
    if (details) device.ifc = details;
  }
  return devices;
}

function deviceText(device, field) {
  const localized = device[field];
  if (localized) return localized[activeLang] || localized.zh || localized.en;
  return t(device[`${field}Key`]);
}

const elements = {
  overviewLink: document.getElementById("overview-link"),
  devicePanelButton: document.getElementById("device-panel-btn"),
  devicePanel: document.getElementById("device-panel"),
  devicePanelClose: document.getElementById("device-panel-close"),
  overviewRailClose: document.getElementById("overview-rail-close"),
  overviewRail: document.querySelector(".dt-overview-rail"),
  wrap: document.getElementById("viewer-wrap"),
  canvas: document.getElementById("twin-canvas"),
  loading: document.getElementById("model-loading"),
  loadingTitle: document.getElementById("loading-title"),
  loadingProgress: document.getElementById("loading-progress"),
  loadingMeta: document.getElementById("loading-meta"),
  error: document.getElementById("model-error"),
  errorMessage: document.getElementById("model-error-message"),
  retryButton: document.getElementById("retry-model-btn"),
  resetViewButton: document.getElementById("reset-view-btn"),
  calibrateButton: document.getElementById("calibrate-btn"),
  coordinateToast: document.getElementById("coordinate-toast"),
  coordinateValue: document.getElementById("coordinate-value"),
  copyCoordinateButton: document.getElementById("copy-coordinate-btn"),
  modelName: document.getElementById("model-name"),
  modelLabel: document.querySelector(".dt-model-name"),
  layerToggles: [...document.querySelectorAll("[data-model-layer]")],
  meshCount: document.getElementById("mesh-count"),
  viewerCard: document.querySelector(".dt-viewer-card"),
  technologyLabel: document.querySelector(".dt-side-footer span"),
  equipmentSearch: document.getElementById("equipment-search"),
  equipmentSearchCount: document.getElementById("equipment-search-count"),
  assetListTitle: document.getElementById("asset-list-title"),
  assetViewButtons: [...document.querySelectorAll("[data-asset-view]")],
  deviceList: document.getElementById("device-list"),
  deviceName: document.getElementById("device-name"),
  statusBadge: document.getElementById("status-badge"),
  metricGrid: document.getElementById("metric-grid"),
  componentProperties: document.getElementById("component-properties"),
  dataPanelTitle: document.getElementById("data-panel-title"),
  trendCard: document.getElementById("trend-card"),
  trendLabel: document.getElementById("trend-label"),
  trendValue: document.getElementById("trend-value"),
  trendLine: document.getElementById("trend-line"),
  trendArea: document.getElementById("trend-area"),
  updatedAt: document.getElementById("updated-at"),
  updateRow: document.getElementById("update-row"),
  faultToggle: document.getElementById("fault-toggle"),
  faultButtonText: document.getElementById("fault-button-text"),
  clock: document.getElementById("dt-clock"),
  siteTemperature: document.getElementById("site-temperature"),
  siteHumidity: document.getElementById("site-humidity"),
  siteCo2: document.getElementById("site-co2"),
  siteOccupants: document.getElementById("site-occupants"),
  overviewIndoorTemperature: document.getElementById("overview-indoor-temperature"),
  overviewIndoorHumidity: document.getElementById("overview-indoor-humidity"),
  overviewIndoorCo2: document.getElementById("overview-indoor-co2"),
  alarmDbStatus: document.getElementById("alarm-db-status"),
  alarmLoraStatus: document.getElementById("alarm-lora-status"),
  alarmPanelClose: document.getElementById("alarm-panel-close"),
  reservedTitle: document.getElementById("reserved-title"),
  reservedCopy: document.getElementById("reserved-copy"),
  historyNote: document.getElementById("history-note"),
  historyRangeButtons: [...document.querySelectorAll("[data-history-range]")],
  customHoursControl: document.getElementById("custom-hours-control"),
  customHoursInput: document.getElementById("custom-hours"),
  trendGrid: document.getElementById("trend-grid"),
  trendAxisLabels: document.getElementById("trend-axis-labels"),
  metricTrendCards: [
    { card: document.getElementById("trend-card"), label: document.getElementById("trend-label"), value: document.getElementById("trend-value"), line: document.getElementById("trend-line"), area: document.getElementById("trend-area"), points: document.getElementById("trend-points"), grid: document.getElementById("trend-grid"), axis: document.getElementById("trend-axis-labels") },
    { card: document.getElementById("humidity-trend-card"), label: document.getElementById("humidity-trend-label"), value: document.getElementById("humidity-trend-value"), line: document.getElementById("humidity-trend-line"), area: document.getElementById("humidity-trend-area"), points: document.getElementById("humidity-trend-points"), grid: document.getElementById("humidity-trend-grid"), axis: document.getElementById("humidity-trend-axis-labels") },
    { card: document.getElementById("co2-trend-card"), label: document.getElementById("co2-trend-label"), value: document.getElementById("co2-trend-value"), line: document.getElementById("co2-trend-line"), area: document.getElementById("co2-trend-area"), points: document.getElementById("co2-trend-points"), grid: document.getElementById("co2-trend-grid"), axis: document.getElementById("co2-trend-axis-labels") },
  ],
  viewButtons: [...document.querySelectorAll("[data-view]")],
};

elements.modelLabel.textContent = MODEL.label;
elements.viewerCard.setAttribute("aria-label", "IFC / Fragments 三维模型");
if (elements.technologyLabel) elements.technologyLabel.textContent = "WebGL / Three.js / IFC / Fragments";

const state = {
  model: null,
  modelBox: new THREE.Box3(),
  modelCenter: new THREE.Vector3(),
  modelRadius: 1,
  selectedDeviceId: null,
  selectedItem: null,
  selectedIfcItem: null,
  equipmentQuery: "",
  assetView: "sensors",
  sensorGroupFilters: new Set(SENSOR_GROUPS.map((group) => group.key)),
  calibrating: false,
  boundObjects: new Map(),
  sensorAnchors: new Map(),
  markerObjects: new Map(),
  snapshots: new Map(),
  loadRequest: 0,
  fragmentsModel: null,
  fragmentsModels: new Map(),
  historyRange: "1h",
  customHours: 6,
  liveDevices: new Set(),
  influxConnected: false,
  influxConnectionKnown: false,
  influxConnectedAt: null,
  influxSocket: null,
  influxDiagnostic: "",
  socketControlConnected: false,
  pendingSocketControls: new Map(),
  lastLiveAt: new Map(),
  seenTelemetry: new Set(),
  markerSyncTimer: null,
  markerSyncRunning: false,
  ahuDemo: false,
  ahuSetpoint: 23,
  ahuAppliedSetpoint: 23,
  debugMockData: (() => {
    if (query.get("demo") === "1") return true;
    try { return sessionStorage.getItem(DEBUG_MOCK_STORAGE_KEY) === "true"; }
    catch { return false; }
  })(),
  recommendation: null,
  renderedDebugMockData: null,
  socketDemandRange: "today",
  socketDemandHistory: new Map(),
  socketDemandHistoryLoading: new Set(),
  alarmFilter: "active",
  alarmStates: (() => {
    try { return JSON.parse(localStorage.getItem("zb202-alarm-states") || "{}"); }
    catch { return {}; }
  })(),
  iotOpenedFromOverview: true,
  sensorDisplayMode: "all",
  layerVisibility: Object.fromEntries(MODELS.map((model) => [model.id, true])),
};

function initializeDeviceSnapshots() {
  state.snapshots.clear();
  for (const device of DEVICES) {
  const values = Object.fromEntries(device.metrics.map((metric) => [metric.key, null]));
    state.snapshots.set(device.id, {
      deviceId: device.id,
      status: "unavailable",
      updatedAt: new Date(),
      values,
      trends: Object.fromEntries(device.metrics.map((metric) => [metric.key, []])),
    });
  }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(THEME_PRESETS[activeTheme].background);
scene.fog = new THREE.Fog(THEME_PRESETS[activeTheme].fog, 180, 920);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
camera.position.set(8, 7, 10);

const renderer = new THREE.WebGLRenderer({ canvas: elements.canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = THEME_PRESETS[activeTheme].exposure;

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = "dt-label-layer";
elements.wrap.appendChild(labelRenderer.domElement);

const sensorProximityTag = document.createElement("div");
sensorProximityTag.className = "dt-sensor-proximity-tag";
sensorProximityTag.hidden = true;
elements.wrap.appendChild(sensorProximityTag);
let lastCanvasPointer = null;

function updateSensorProximityTag() {
  if (!lastCanvasPointer || state.sensorDisplayMode === "hidden" || !state.model) {
    sensorProximityTag.hidden = true;
    return;
  }
  const canvasRect = elements.canvas.getBoundingClientRect();
  const wrapRect = elements.wrap.getBoundingClientRect();
  let nearest = null;
  let nearestDistance = 88 * 88;
  for (const [id, anchor] of state.sensorAnchors) {
    const projected = anchor.clone().project(camera);
    if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) continue;
    const x = canvasRect.left + (projected.x + 1) * canvasRect.width / 2;
    const y = canvasRect.top + (1 - projected.y) * canvasRect.height / 2;
    const distance = (lastCanvasPointer.x - x) ** 2 + (lastCanvasPointer.y - y) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = { id, x, y };
    }
  }
  if (!nearest) {
    sensorProximityTag.hidden = true;
    return;
  }
  const device = DEVICES.find((item) => item.id === nearest.id);
  sensorProximityTag.textContent = deviceText(device, "name");
  sensorProximityTag.dataset.status = statusFor(nearest.id);
  sensorProximityTag.hidden = false;
  const x = nearest.x - wrapRect.left + 14;
  const y = nearest.y - wrapRect.top - sensorProximityTag.offsetHeight / 2;
  sensorProximityTag.style.left = `${Math.max(8, Math.min(x, wrapRect.width - sensorProximityTag.offsetWidth - 8))}px`;
  sensorProximityTag.style.top = `${Math.max(8, Math.min(y, wrapRect.height - sensorProximityTag.offsetHeight - 8))}px`;
}

elements.canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  lastCanvasPointer = { x: event.clientX, y: event.clientY };
  updateSensorProximityTag();
});
elements.canvas.addEventListener("pointerleave", () => {
  lastCanvasPointer = null;
  sensorProximityTag.hidden = true;
});

const controls = new OrbitControls(camera, elements.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.screenSpacePanning = true;
controls.maxPolarAngle = Math.PI * 0.93;

const hemisphereLight = new THREE.HemisphereLight(0xf8fbff, 0x5a6677, 1.35);
scene.add(hemisphereLight);
const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(12, 22, 16);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xb8d7ff, 0.65);
fillLight.position.set(-16, 8, -10);
scene.add(fillLight);

const modelGroup = new THREE.Group();
modelGroup.name = "loaded-model";
scene.add(modelGroup);

let fragments = null;
let renderedFaces = null;

async function ensureFragments() {
  if (fragments) return fragments;
  const [fragmentModule, workerModule] = await Promise.all([
    import("@thatopen/fragments"),
    import("@thatopen/fragments/worker?url"),
  ]);
  renderedFaces = fragmentModule.RenderedFaces;
  fragments = new fragmentModule.FragmentsModels(workerModule.default);
  return fragments;
}

const helpersGroup = new THREE.Group();
helpersGroup.name = "digital-twin-overlays";
scene.add(helpersGroup);
const occupancyGroup = new THREE.Group();
occupancyGroup.name = "occupancy-seat-overlays";

let pointerDownPosition = null;
let gridHelper = null;

function formatNumber(value) {
  if (Math.abs(value) >= 100) return Math.round(value).toLocaleString(activeLocale());
  return value.toFixed(1);
}

function statusFor(deviceId) {
  if (state.debugMockData) {
    if (DEBUG_OFFLINE_SENSORS.has(deviceId)) return "offline";
    return deviceId === "WS523-03" ? "fault" : "normal";
  }
  return state.snapshots.get(deviceId)?.status || "unavailable";
}

function sensorIsOnline(deviceId) {
  return ["normal", "warning", "fault"].includes(statusFor(deviceId));
}

function sensorStatusFromValues(device, values) {
  return safetySensorStatus(device.sensorModel, values) || "normal";
}

function presentationStatus(status) {
  if (status === "normal") return { key: "online", className: "normal" };
  if (status === "warning") return { key: "maintenance", className: "warning" };
  if (status === "offline") return { key: "offline", className: "unavailable" };
  if (status === "unavailable") return { key: "dataUnavailable", className: "unavailable" };
  return { key: "fault", className: "fault" };
}

function occupancyValueFor(deviceId) {
  if (!sensorIsOnline(deviceId)) return undefined;
  if (state.debugMockData) {
    const seat = occupancyGroup.children.find((item) => item.userData.deviceId === deviceId);
    return seat ? Number(DEBUG_OCCUPIED_SEATS.has(seat.userData.seatIndex)) : undefined;
  }
  return state.snapshots.get(deviceId)?.values.occupancy;
}

function sensorEventLabel(device, snapshot) {
  const key = { VS341: "occupancy", WS301: "magnetStatus", WS303: "leakageStatus" }[device.sensorModel];
  if (!key) return "";
  const labels = activeLang === "en"
    ? { occupancy: ["Vacant", "Occupied"], magnetStatus: ["Closed", "Open"], leakageStatus: ["Dry", "Water detected"] }
    : { occupancy: ["未占用", "已占用"], magnetStatus: ["门关", "门开"], leakageStatus: ["无水浸", "检测到水浸"] };
  const value = key === "occupancy" ? occupancyValueFor(device.id) : sensorIsOnline(device.id) ? snapshot?.values[key] : undefined;
  return Number.isFinite(value) ? labels[key][value > 0 ? 1 : 0] : activeLang === "en" ? "Unknown" : "未知";
}

function unwrapIfcValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) {
    return unwrapIfcValue(value.value);
  }
  return value;
}

function readableIfcValue(value) {
  const unwrapped = unwrapIfcValue(value);
  if (unwrapped === null || unwrapped === undefined || unwrapped === "") return null;
  if (typeof unwrapped === "boolean") return unwrapped ? "True" : "False";
  if (typeof unwrapped === "number" || typeof unwrapped === "string") return String(unwrapped);
  return null;
}

function equipmentGroupForCategory(category) {
  return EQUIPMENT_GROUPS.find((group) => group.category === category);
}

function groupForScannedCategory(category) {
  const exact = equipmentGroupForCategory(category);
  if (exact) return exact;
  if (/DUCT/i.test(category)) return { key: "ducts", category, label: { zh: "风管", "zh-Hant": "風管", en: "Duct" } };
  if (/PIPE/i.test(category)) return { key: "pipes", category, label: { zh: "管道", "zh-Hant": "管道", en: "Pipe" } };
  return { key: "mepComponents", category, label: { zh: "机电构件", "zh-Hant": "機電構件", en: "MEP Component" } };
}

function localizedGroupLabel(group) {
  return group?.label[activeLang] || group?.label.zh || group?.label.en || "IFC";
}

function metricsForCategory(category, localId) {
  const seed = localId % 97;
  if (category === "IFCFAN") {
    return [
      { key: "fanPower", labelKey: "fanPower", unit: "W", value: 280 + seed * 2.4, variance: 5.5 },
      { key: "airflow", labelKey: "airflow", unit: "L/s", value: 170 + seed * 0.8, variance: 2.2 },
      { key: "supplyTemperature", labelKey: "supplyTemperature", unit: "°C", value: 17 + (seed % 20) * 0.1, variance: 0.22 },
    ];
  }
  if (category === "IFCDAMPER") {
    return [
      { key: "damperPosition", labelKey: "damperPosition", unit: "%", value: 45 + (seed % 45), variance: 0.8 },
      { key: "airflow", labelKey: "airflow", unit: "L/s", value: 120 + seed * 0.7, variance: 2.2 },
    ];
  }
  return [
    { key: "airflow", labelKey: "airflow", unit: "L/s", value: 130 + seed * 0.7, variance: 2.2 },
    { key: "supplyTemperature", labelKey: "supplyTemperature", unit: "°C", value: 14 + (seed % 60) * 0.1, variance: 0.2 },
  ];
}

async function loadIfcItemDetails(localId, categoryHint = null, fragmentsModel = state.fragmentsModel) {
  if (!fragmentsModel) return null;
  const item = fragmentsModel.getItem(localId);
  const safely = (task, fallback = null) => Promise.resolve().then(task).catch(() => fallback);
  const [attributes, category, guid] = await Promise.all([
    safely(() => item.getAttributes(), {}),
    categoryHint ? Promise.resolve(categoryHint) : safely(() => item.getCategory(), "IFC"),
    safely(() => item.getGuid()),
  ]);
  let data = [];
  try {
    data = await fragmentsModel.getItemsData([localId], {
      attributesDefault: true,
      relations: {
        ContainedInStructure: { attributes: true, relations: false },
        HasAssignments: { attributes: true, relations: false },
        IsDefinedBy: { attributes: true, relations: true },
        DefinesOccurrence: { attributes: true, relations: true },
      },
    });
  } catch {
    data = [];
  }
  const attributeObject = attributes?.object || {};
  const itemData = data[0] || attributeObject;
  return {
    localId,
    category: category || categoryHint || "IFC",
    guid: guid || readableIfcValue(attributeObject.GlobalId),
    name: readableIfcValue(attributeObject.Name) || readableIfcValue(itemData.Name) || `${category || categoryHint || "IFC"} #${localId}`,
    data: itemData,
  };
}

async function scanIfcEquipment(model, modelId) {
  if (modelId !== "mep") return [];
  const categories = await model.getItemsOfCategories([
    /IFC(FAN|COIL|DAMPER|AIRTERMINAL|DUCT|PIPE|FLOW|VALVE|PUMP|UNITARY|EQUIPMENT|BUILDINGELEMENTPROXY)/i,
  ]);
  const records = [];
  for (const [category, localIds] of Object.entries(categories)) {
    const group = groupForScannedCategory(category);
    for (const localId of localIds) records.push({ localId, group });
  }

  const devices = await Promise.all(records.map(async ({ localId, group }) => {
    const item = model.getItem(localId);
    const [attributes, guid] = await Promise.all([item.getAttributes(), item.getGuid()]);
    const attributeObject = attributes?.object || {};
    const name = readableIfcValue(attributeObject.Name)
      || readableIfcValue(attributeObject.ObjectType)
      || `${localizedGroupLabel(group)} #${localId}`;
    return {
      id: guid || `${modelId}-${group.category}-${localId}`,
      name: { zh: name, "zh-Hant": name, en: name },
      subtitle: {
        zh: `${group.label.zh} · IFC 自动扫描 · 模拟遥测`,
        "zh-Hant": `${group.label["zh-Hant"]} · IFC 自動掃描 · 模擬遙測`,
        en: `${group.label.en} · IFC auto-scan · Simulated telemetry`,
      },
      category: group.category,
      groupKey: group.key,
      binding: { kind: "object", globalId: guid, localId, modelId },
      metrics: metricsForCategory(group.category, localId),
      ifc: { localId, category: group.category, guid, name, data: attributeObject },
    };
  }));

  return devices.sort((a, b) => {
    const categoryOrder = EQUIPMENT_GROUPS.findIndex((group) => group.category === a.category)
      - EQUIPMENT_GROUPS.findIndex((group) => group.category === b.category);
    return categoryOrder || deviceText(a, "name").localeCompare(deviceText(b, "name"), activeLocale());
  });
}

function showLoading(model, percent = 0, meta = t("readingModel")) {
  elements.error.classList.add("hidden");
  elements.loading.classList.remove("hidden");
  elements.loadingTitle.textContent = t("loadingModel", { model: model.label });
  elements.loadingProgress.style.width = `${Math.max(3, percent)}%`;
  elements.loadingMeta.textContent = meta;
}

function showError(message) {
  elements.loading.classList.add("hidden");
  elements.error.classList.remove("hidden");
  elements.errorMessage.textContent = message;
}

async function clearCurrentModel() {
  for (const fragmentsModel of state.fragmentsModels.values()) {
    modelGroup.remove(fragmentsModel.object);
    await fragments.disposeModel(fragmentsModel.modelId);
  }
  state.model = null;
  state.fragmentsModel = null;
  state.fragmentsModels.clear();
  state.selectedItem = null;
  state.selectedDeviceId = null;
  state.selectedIfcItem = null;
  for (const marker of state.markerObjects.values()) marker.label.material.dispose();
  helpersGroup.clear();
  state.boundObjects.clear();
  state.sensorAnchors.clear();
  sensorProximityTag.hidden = true;
  state.markerObjects.clear();
  if (gridHelper) {
    scene.remove(gridHelper);
    gridHelper.geometry.dispose();
    gridHelper.material.dispose();
    gridHelper = null;
  }
}

function fitCameraToModel(animate = false) {
  if (!state.model) return;
  const center = state.modelCenter.clone();
  const radius = Math.max(state.modelRadius, 0.1);
  const direction = new THREE.Vector3(-1.05, 0.72, -1.05).normalize();
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 0.94;
  const targetPosition = center.clone().add(direction.multiplyScalar(distance));

  camera.near = Math.max(radius / 1000, 0.01);
  camera.far = Math.max(radius * 60, 1000);
  camera.updateProjectionMatrix();

  if (animate) {
    animateCamera(targetPosition, center);
  } else {
    camera.position.copy(targetPosition);
    controls.target.copy(center);
    controls.update();
  }

  controls.minDistance = radius * 0.04;
  controls.maxDistance = radius * 12;
}

function animateCamera(destination, target) {
  camera.position.copy(destination);
  controls.target.copy(target);
  controls.update();
}

async function findBindingObject(device) {
  if (!state.model || device.binding.kind !== "object") return null;
  if (Number.isInteger(device.binding.localId)) return device.binding.localId;
  const fragmentsModel = state.fragmentsModels.get(device.binding.modelId) || state.fragmentsModel;
  if (!device.binding.globalId || !fragmentsModel) return null;
  const [localId] = await fragmentsModel.getLocalIdsByGuids([device.binding.globalId]);
  return localId ?? null;
}

function statusLightTexture(color) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  const glow = context.createRadialGradient(32, 32, 6, 32, 32, 30);
  glow.addColorStop(0, color);
  glow.addColorStop(0.35, `${color}80`);
  glow.addColorStop(1, `${color}00`);
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  context.fillStyle = color;
  context.beginPath();
  context.arc(32, 32, 10, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const onlineLightTexture = statusLightTexture("#35d586");
const offlineLightTexture = statusLightTexture("#8b94a6");

function createMarker(device, worldPosition = null) {
  const element = document.createElement("div");
  element.className = "dt-sensor-online-dot";
  element.classList.toggle("is-offline", !sensorIsOnline(device.id));
  element.setAttribute("aria-hidden", "true");

  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sensorIsOnline(device.id) ? onlineLightTexture : offlineLightTexture,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  label.renderOrder = 30;
  label.name = `marker-${device.id}`;
  if (worldPosition) {
    label.position.copy(worldPosition);
    label.position.x += 0.035;
    label.position.y += 0.025;
  } else {
    const [nx, ny, nz] = device.binding.normalizedPosition;
    const size = state.modelBox.getSize(new THREE.Vector3());
    label.position.set(
      state.modelBox.min.x + size.x * nx,
      state.modelBox.min.y + size.y * ny,
      state.modelBox.min.z + size.z * nz,
    );
  }
  helpersGroup.add(label);
  label.visible = state.sensorDisplayMode === "all" && device.sensorModel !== "VS341";
  state.markerObjects.set(device.id, {
    label,
    element,
    modelId: device.binding.modelId || null,
    localId: Number.isInteger(device.binding.localId) ? device.binding.localId : null,
    fixedAnchor: label.position.clone(),
    showStatusLight: device.sensorModel !== "VS341",
  });
}

let nearbyMarkerId = null;
elements.wrap.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch" || state.sensorDisplayMode !== "all") return;
  let nearestId = null;
  let nearestDistance = 44 * 44;
  for (const [id, marker] of state.markerObjects) {
    if (!marker.label.visible) continue;
    const rect = marker.element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const distance = (event.clientX - x) ** 2 + (event.clientY - y) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = id;
    }
  }
  if (nearbyMarkerId === nearestId) return;
  if (nearbyMarkerId) state.markerObjects.get(nearbyMarkerId)?.element.classList.remove("is-near");
  nearbyMarkerId = nearestId;
  if (nearbyMarkerId) state.markerObjects.get(nearbyMarkerId)?.element.classList.add("is-near");
});
elements.wrap.addEventListener("pointerleave", () => {
  if (nearbyMarkerId) state.markerObjects.get(nearbyMarkerId)?.element.classList.remove("is-near");
  nearbyMarkerId = null;
});

async function syncSensorMarkerAnchors() {
  const sensorModel = state.fragmentsModels.get("sensor");
  if (!sensorModel) return;
  sensorModel.object.updateWorldMatrix(true, true);
  const markers = [...state.markerObjects].filter(([id]) => state.boundObjects.has(id));
  const boxes = await sensorModel.getBoxes(markers.map(([id]) => state.boundObjects.get(id)));
  for (const [index, [deviceId, marker]] of markers.entries()) {
    const box = boxes[index];
    if (!box || state.markerObjects.get(deviceId) !== marker) continue;
    const center = box.getCenter(new THREE.Vector3());
    state.sensorAnchors.set(deviceId, center.clone());
    center.y = box.max.y + 0.025;
    center.x += 0.035;
    helpersGroup.worldToLocal(center);
    marker.fixedAnchor.copy(center);
    marker.label.position.copy(center);
  }
}

function scheduleSensorMarkerSync(delay = 0) {
  window.clearTimeout(state.markerSyncTimer);
  state.markerSyncTimer = window.setTimeout(() => {
    syncSensorMarkerAnchors()
      .then(() => scheduleSensorOcclusionCheck())
      .catch((error) => console.warn("Failed to sync sensor markers", error));
  }, delay);
}

let sensorOcclusionTimer = null;
let sensorOcclusionRunning = false;
let sensorOcclusionPending = false;
async function updateSensorOcclusion() {
  if (sensorOcclusionRunning) {
    sensorOcclusionPending = true;
    return;
  }
  if (!state.markerObjects.size) return;
  sensorOcclusionRunning = true;
  try {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const rect = elements.canvas.getBoundingClientRect();
    const models = [...state.fragmentsModels.values()].filter((model) => model.object.visible);
    for (const marker of state.markerObjects.values()) {
      if (!marker.label.visible) continue;
      const point = marker.label.getWorldPosition(new THREE.Vector3());
      const projected = point.clone().project(camera);
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) {
        marker.element.style.visibility = "hidden";
        continue;
      }
      // Tiny online lights remain readable through building geometry.
      if (marker.element.classList.contains("dt-sensor-online-dot")) {
        marker.element.style.visibility = "";
        continue;
      }
      const mouse = new THREE.Vector2(
        rect.left + (projected.x + 1) * rect.width / 2,
        rect.top + (1 - projected.y) * rect.height / 2,
      );
      const markerDistance = camera.position.distanceTo(point);
      const tolerance = Math.max(state.modelRadius * 0.012, 0.05);
      let occluded = false;
      for (const model of models) {
        const hit = await model.raycast({ camera, mouse, dom: elements.canvas });
        if (hit?.point && camera.position.distanceTo(hit.point) < markerDistance - tolerance) {
          occluded = true;
          break;
        }
      }
      marker.element.style.visibility = occluded ? "hidden" : "";
    }
  } finally {
    sensorOcclusionRunning = false;
    if (sensorOcclusionPending) {
      sensorOcclusionPending = false;
      scheduleSensorOcclusionCheck();
    }
  }
}

function scheduleSensorOcclusionCheck() {
  window.clearTimeout(sensorOcclusionTimer);
  sensorOcclusionTimer = window.setTimeout(() => {
    updateSensorOcclusion().catch((error) => console.warn("Sensor occlusion check failed", error));
  }, 150);
}

function resolveMobileMarkerCollisions() {
  const compact = window.innerWidth <= 1180 && window.matchMedia("(pointer: coarse)").matches;
  const markers = [...state.markerObjects.values()];
  markers.forEach((marker) => marker.element.classList.remove("is-collided"));
  if (!compact) return;

  const visible = markers
    .filter((marker) => marker.label.visible && marker.element.getClientRects().length)
    .sort((a, b) => {
      const selectedDelta = Number(b.element.classList.contains("selected")) - Number(a.element.classList.contains("selected"));
      return selectedDelta || a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top;
    });
  const placed = [];
  for (const marker of visible) {
    const rect = marker.element.getBoundingClientRect();
    const overlaps = placed.some((other) => !(
      rect.right + 4 < other.left || rect.left - 4 > other.right ||
      rect.bottom + 4 < other.top || rect.top - 4 > other.bottom
    ));
    if (overlaps && !marker.element.classList.contains("selected")) marker.element.classList.add("is-collided");
    else placed.push(rect);
  }
}

async function bindDevices() {
  for (const device of DEVICES) {
    const target = await findBindingObject(device);
    if (target === null) continue;
    state.boundObjects.set(device.id, target);
    if (device.binding.modelId === "sensor") {
      const boxes = await state.fragmentsModels.get("sensor").getBoxes([target]);
      if (boxes.length) {
        const box = boxes.reduce((combined, item) => combined.union(item), new THREE.Box3());
        const anchor = box.getCenter(new THREE.Vector3());
        state.sensorAnchors.set(device.id, anchor);
        const indicatorAnchor = anchor.clone();
        indicatorAnchor.y = box.max.y;
        createMarker(device, indicatorAnchor);
      }
    }
  }
  await updateAllVisualStates();
}

async function createOccupancySeats() {
  occupancyGroup.clear();
  const archiModel = state.fragmentsModels.get("archi");
  if (!archiModel) return;

  const furniture = await archiModel.getItemsOfCategories([/^IFCFURNISHINGELEMENT$/i]);
  let tableBox = null;
  for (const localId of furniture.IFCFURNISHINGELEMENT || []) {
    const item = archiModel.getItem(localId);
    const attributes = await item.getAttributes();
    const name = readableIfcValue(attributes?.object?.Name) || "";
    if (!/Monza[-_ ]?Table[-_ ]?Rectangular/i.test(name)) continue;
    const boxes = await archiModel.getBoxes([localId]);
    if (boxes.length) tableBox = boxes.reduce((combined, box) => combined.union(box), new THREE.Box3());
    break;
  }
  if (!tableBox) return;

  const columns = 2;
  const rows = 5;
  const tableSize = tableBox.getSize(new THREE.Vector3());
  const seatWidth = tableSize.x / columns;
  const seatDepth = tableSize.z / rows;
  const inset = Math.min(seatWidth, seatDepth) * 0.055;
  const overlayY = tableBox.max.y + Math.max(state.modelRadius * 0.003, 0.018);
  const slabHeight = Math.max(state.modelRadius * 0.006, 0.035);
  // Configure transparency before the first render so fills remain stable at every distance.
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: 0xbadcf0,
    transparent: true,
    opacity: 0.22,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const iconCanvas = document.createElement("canvas");
  iconCanvas.width = iconCanvas.height = 256;
  const context = iconCanvas.getContext("2d");
  context.fillStyle = "#168bff";
  context.beginPath();
  context.arc(128, 128, 116, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#fff";
  context.lineWidth = 10;
  context.stroke();
  context.beginPath();
  context.arc(128, 98, 29, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(72, 182);
  context.bezierCurveTo(78, 126, 178, 126, 184, 182);
  context.stroke();
  const iconTexture = new THREE.CanvasTexture(iconCanvas);
  iconTexture.colorSpace = THREE.SRGBColorSpace;
  const iconMaterial = new THREE.MeshBasicMaterial({
    map: iconTexture,
    depthTest: false,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x168fe5,
    transparent: true,
    opacity: 0.62,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const seatIndex = row * columns + column;
      const seat = new THREE.Group();
      seat.name = `occupancy-seat-${seatIndex + 1}`;
      seat.userData.seatIndex = seatIndex;

      const overlaySize = Math.min(seatWidth, seatDepth) - inset * 2;
      const overlayWidth = overlaySize;
      const overlayDepth = overlaySize;
      const geometry = new THREE.BoxGeometry(overlayWidth, slabHeight, overlayDepth);
      const fill = new THREE.Mesh(geometry, fillMaterial.clone());
      fill.position.y = slabHeight / 2;
      fill.renderOrder = 20;
      seat.add(fill);
      seat.userData.fill = fill;

      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial.clone());
      outline.position.y = slabHeight / 2;
      outline.renderOrder = 21;
      seat.add(outline);
      seat.userData.outline = outline;

      seat.position.set(
        tableBox.min.x + seatWidth * (column + 0.5),
        overlayY,
        tableBox.min.z + seatDepth * (row + 0.5),
      );
      const iconSize = Math.min(overlayWidth, overlayDepth) * 0.32;
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(iconSize, iconSize), iconMaterial);
      icon.rotation.x = -Math.PI / 2;
      // Opposite table sides face inward; rotate in the icon's own plane.
      icon.rotateZ(column === 0 ? -Math.PI / 2 : Math.PI / 2);
      icon.position.y = slabHeight + 0.003;
      icon.renderOrder = 23;
      seat.add(icon);
      seat.userData.icon = icon;
      seat.visible = false;
      occupancyGroup.add(seat);
    }
  }
  // Split by table side, then sort along its length: five sensors per side.
  const sensors = DEVICES.filter((device) => device.sensorModel === "VS341" && state.sensorAnchors.has(device.id))
    .sort((a, b) => state.sensorAnchors.get(a.id).x - state.sensorAnchors.get(b.id).x);
  for (let column = 0; column < columns; column += 1) {
    const sideSensors = sensors.slice(column * rows, (column + 1) * rows)
      .sort((a, b) => state.sensorAnchors.get(a.id).z - state.sensorAnchors.get(b.id).z);
    sideSensors.forEach((device, row) => {
      occupancyGroup.children[row * columns + column].userData.deviceId = device.id;
    });
  }
  helpersGroup.add(occupancyGroup);
  renderOccupancySeats();
}

function renderOccupancySeats() {
  const overlaysVisible = state.sensorDisplayMode === "all" && state.layerVisibility.archi;
  occupancyGroup.visible = overlaysVisible;
  for (const seat of occupancyGroup.children) {
    const value = occupancyValueFor(seat.userData.deviceId);
    const occupied = Number.isFinite(value) && value > 0;
    const online = sensorIsOnline(seat.userData.deviceId);
    seat.userData.occupied = occupied;
    seat.visible = overlaysVisible;
    seat.userData.fill.material.color.setHex(!online ? 0x9aa3b0 : occupied ? 0x70b2d8 : 0xbadcf0);
    seat.userData.outline.material.color.setHex(online ? 0x168fe5 : 0x8b94a6);
    seat.userData.fill.material.opacity = !online ? 0.24 : occupied ? 0.58 : 0.14;
    seat.userData.icon.visible = online && occupied;
    seat.userData.occupancyStatus = !online ? "offline" : occupied ? "occupied" : Number.isFinite(value) ? "vacant" : "unknown";
  }
}

async function styleBoundObject(deviceId) {
  const target = state.boundObjects.get(deviceId);
  if (target === undefined) return;
  const status = statusFor(deviceId);
  const selected = state.selectedDeviceId === deviceId && elements.devicePanel.classList.contains("is-open");
  const device = DEVICES.find((item) => item.id === deviceId);
  const fragmentsModel = state.fragmentsModels.get(device?.binding.modelId) || state.fragmentsModel;
  if (!fragmentsModel) return;
  if (device.binding.modelId === "sensor") {
    if (!selected) return;
    const occupancy = device.sensorModel === "VS341";
    const seeThrough = true;
    const color = 0x2f7df4;
    await fragmentsModel.highlight([target], {
      color: new THREE.Color(color),
      opacity: occupancy ? 0.8 : 1,
      transparent: seeThrough,
      depthTest: !seeThrough,
      depthWrite: !seeThrough,
      renderedFaces: renderedFaces.TWO,
    });
  } else if (state.selectedDeviceId === deviceId || status !== "normal") {
    await fragmentsModel.highlight([target], {
      color: status === "normal" ? new THREE.Color(0x2f7df4) : new THREE.Color(STATUS[status].color),
      opacity: 1,
      transparent: selected,
      depthTest: !selected,
      depthWrite: !selected,
      renderedFaces: renderedFaces.TWO,
    });
  }
}

let visualUpdateQueue = null;
let visualUpdatePending = false;
function updateAllVisualStates() {
  visualUpdatePending = true;
  if (!visualUpdateQueue) {
    visualUpdateQueue = (async () => {
      try {
        while (visualUpdatePending && !pageClosing) {
          visualUpdatePending = false;
          await applyAllVisualStates();
        }
      } finally { visualUpdateQueue = null; }
    })();
  }
  return visualUpdateQueue;
}

let lastVisualSignature = "";
async function applyAllVisualStates() {
  if (pageClosing) return;
  const signature = JSON.stringify([activeTheme, state.selectedDeviceId, state.selectedIfcItem,
    elements.devicePanel.classList.contains("is-open"),
    [...state.fragmentsModels.values()].map((model) => model.modelId),
    DEVICES.map((device) => [device.id, statusFor(device.id), device.binding.modelId, device.binding.localId])]);
  if (signature === lastVisualSignature) return;
  for (const [modelId, fragmentsModel] of state.fragmentsModels) {
    const localIds = DEVICES
      .filter((device) => device.binding.modelId === modelId && state.boundObjects.has(device.id))
      .map((device) => state.boundObjects.get(device.id));
    if (localIds.length) await fragmentsModel.resetHighlight(localIds);
    if (pageClosing) return;
  }
  for (const device of DEVICES) {
    if (device.binding.modelId === "sensor" || state.selectedDeviceId === device.id || statusFor(device.id) !== "normal") {
      await styleBoundObject(device.id);
      if (pageClosing) return;
    }
    const marker = state.markerObjects.get(device.id);
    if (marker) {
      marker.label.visible = state.sensorDisplayMode === "all" && marker.showStatusLight;
      marker.element.classList.toggle("is-offline", !sensorIsOnline(device.id));
      marker.label.material.map = sensorIsOnline(device.id) ? onlineLightTexture : offlineLightTexture;
    }
  }
  renderOccupancySeats();
  scheduleSensorOcclusionCheck();
  if (state.fragmentsModels.size) await fragments.update(true);
  lastVisualSignature = signature;
}

async function focusDevice(device) {
  let box = null;
  const target = state.boundObjects.get(device.id) ?? device.binding.localId;
  const marker = state.markerObjects.get(device.id);

  const fragmentsModel = state.fragmentsModels.get(device.binding.modelId) || state.fragmentsModel;
  if (target !== undefined && fragmentsModel) {
    const boxes = await fragmentsModel.getBoxes([target]);
    if (boxes.length) box = boxes.reduce((combined, item) => combined.union(item), new THREE.Box3());
  }
  if (!box && marker) {
    const position = marker.label.getWorldPosition(new THREE.Vector3());
    box = new THREE.Box3(position.clone(), position.clone());
  }
  if (!box) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const focusRadius = Math.max(size.length() * 0.5, state.modelRadius * 0.1);
  const direction = camera.position.clone().sub(controls.target).normalize();
  const destination = center.clone().add(direction.multiplyScalar(focusRadius * 5.4));
  animateCamera(destination, center);
  controls.enablePan = true;
  elements.deviceName.title = deviceText(device, "name");
}

function normalizedSearchText(value) {
  return String(value || "").normalize("NFKD").toLocaleLowerCase(activeLocale()).trim();
}

function visibleDevices() {
  const collection = state.assetView === "mep" ? MEP_COMPONENTS : DEVICES.filter((device) => sensorGroupFor(device).key !== "weather");
  const queryText = normalizedSearchText(state.equipmentQuery);
  return collection.filter((device) => {
    if (device.debugOnly && !state.debugMockData) return false;
    if (state.assetView !== "mep" && !state.sensorGroupFilters.has(sensorGroupFor(device).key)) return false;
    if (!queryText) return true;
    const searchable = [
      deviceText(device, "name"),
      deviceText(device, "subtitle"),
      device.id,
      device.category,
      device.binding.globalId,
      device.binding.localId,
    ].map(normalizedSearchText).join(" ");
    return searchable.includes(queryText);
  });
}

function renderSensorCategoryTags() {
  const container = document.getElementById("sensor-category-tags");
  if (!container) return;
  container.hidden = state.assetView === "mep";
  if (container.hidden) return;
  const availableGroups = SENSOR_GROUPS.filter((group) => group.key !== "weather" && DEVICES.some((device) => sensorGroupFor(device).key === group.key));
  const allSelected = availableGroups.every((group) => state.sensorGroupFilters.has(group.key));
  const tags = [{ key: "all", tagLabel: "All sensors", icon: "ph-squares-four", selected: allSelected }, ...availableGroups.map((group) => ({
    ...group,
    selected: state.sensorGroupFilters.has(group.key),
  }))];
  container.innerHTML = tags.map((group) => `
    <button type="button" class="dt-sensor-tag${group.selected ? " active" : ""}" data-sensor-group="${group.key}" aria-label="${group.tagLabel}" title="${group.tagLabel}" aria-pressed="${group.selected}">
      <i class="ph ${group.icon}" aria-hidden="true"></i>
    </button>
  `).join("");
  container.querySelectorAll("[data-sensor-group]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.sensorGroup;
    if (key === "all") {
      const shouldSelectAll = !availableGroups.every((group) => state.sensorGroupFilters.has(group.key));
      availableGroups.forEach((group) => shouldSelectAll ? state.sensorGroupFilters.add(group.key) : state.sensorGroupFilters.delete(group.key));
    } else if (state.sensorGroupFilters.has(key)) {
      state.sensorGroupFilters.delete(key);
    } else {
      state.sensorGroupFilters.add(key);
    }
    renderDeviceList();
  }));
}

function renderDeviceList() {
  elements.deviceList.innerHTML = "";
  elements.deviceList.classList.toggle("is-grouped", state.assetView !== "mep");
  renderSensorCategoryTags();
  const matchedDevices = visibleDevices();
  const total = state.assetView === "mep" ? MEP_COMPONENTS.length : DEVICES.length;
  elements.assetListTitle.textContent = state.assetView === "mep" ? "MEP Components" : t("iotSensorsList");
  if (elements.equipmentSearchCount) {
    elements.equipmentSearchCount.textContent = `${matchedDevices.length}/${total}`;
  }
  if (!matchedDevices.length) {
    const empty = document.createElement("p");
    empty.className = "dt-device-empty";
    empty.textContent = t("noSearchResults");
    elements.deviceList.appendChild(empty);
    return;
  }
  const appendDevice = (device, target = elements.deviceList) => {
    if (state.assetView === "mep") {
      const button = document.createElement("button");
      button.type = "button";
      const selected = state.selectedIfcItem?.localId === device.binding.localId && state.selectedIfcItem?.modelId === device.binding.modelId;
      button.className = `dt-device-item bim${selected ? " selected" : ""}`;
      button.innerHTML = `
        <span class="dt-device-copy">
          <strong>${escapeHtml(deviceText(device, "name"))}</strong>
          <small>${localizedGroupLabel(groupForScannedCategory(device.category))} · ${escapeHtml(device.category)}</small>
        </span>
        <span class="dt-device-state" aria-label="BIM"><i class="ph ph-cube" aria-hidden="true"></i></span>
      `;
      button.querySelector("strong").title = deviceText(device, "name");
      button.querySelector("small").title = `${localizedGroupLabel(groupForScannedCategory(device.category))} · ${device.category}`;
      button.addEventListener("click", async () => {
        await selectIfcItem(device.binding.localId, device.binding.modelId);
        focusDevice(device).catch((error) => console.error("Failed to focus MEP component", error));
      });
      target.appendChild(button);
      return;
    }
    const snapshot = state.snapshots.get(device.id);
    const bound = device.binding.kind === "marker" || state.boundObjects.has(device.id) || state.liveDevices.has(device.id);
    const status = statusFor(device.id);
    const button = document.createElement("button");
    button.type = "button";
    const online = !["offline", "unavailable"].includes(status);
    const eventLabel = sensorEventLabel(device, snapshot);
    const eventKey = { VS341: "occupancy", WS301: "magnetStatus", WS303: "leakageStatus" }[device.sensorModel];
    const eventValue = eventKey === "occupancy" ? occupancyValueFor(device.id) : online ? snapshot?.values[eventKey] : undefined;
    const eventActive = Number.isFinite(eventValue) && eventValue > 0;
    const eventIcon = !Number.isFinite(eventValue) ? "ph-question"
      : { VS341: eventActive ? "ph-user-circle" : "ph-circle",
          WS301: eventActive ? "ph-door-open" : "ph-door",
          WS303: eventActive ? "ph-drop" : "ph-drop-slash" }[device.sensorModel];
    const fullName = deviceText(device, "name");
    const sensorName = fullName.startsWith(device.id) ? fullName.slice(device.id.length).trim() : fullName;
    button.dataset.deviceId = device.id;
    button.dataset.modelBound = String(state.boundObjects.has(device.id));
    button.className = `dt-device-item dt-sensor-item ${online ? "normal" : "unavailable"}${state.selectedDeviceId === device.id ? " selected" : ""}`;
    button.innerHTML = `
      <span class="dt-device-copy">
        <strong>${escapeHtml(device.id)}</strong>
        <small>${escapeHtml(sensorName)}</small>
      </span>
      <span class="dt-device-event ${eventActive ? "is-active" : ""}" role="img" aria-label="${escapeHtml(eventLabel)}" ${eventLabel ? "" : "hidden"}><i class="ph ${eventIcon || "ph-question"}" aria-hidden="true"></i></span>
      <span class="dt-device-state" aria-label="${t(online ? "online" : "offline")}" title="${t(online ? "online" : "offline")}"><span class="dt-device-status"></span></span>
    `;
    button.querySelector("small").title = fullName;
    if (eventLabel) button.querySelector(".dt-device-event").title = state.debugMockData ? `${eventLabel} · Virtual demo` : `${eventLabel} · ${snapshot.updatedAt.toLocaleString(activeLocale())}`;
    button.addEventListener("click", () => {
      selectDevice(device.id, true);
      setDevicePanelOpen(true);
    });
    target.appendChild(button);
  };
  if (state.assetView === "mep") {
    matchedDevices.forEach((device) => appendDevice(device));
    return;
  }
  for (const group of SENSOR_GROUPS) {
    const devices = matchedDevices.filter((device) => sensorGroupFor(device).key === group.key);
    if (!devices.length) continue;
    const section = document.createElement("section");
    section.className = "dt-device-group";
    section.innerHTML = `<header><span>${group.label}</span></header><div class="dt-device-group-list"></div>`;
    const list = section.querySelector(".dt-device-group-list");
    devices.sort((a, b) => a.id.localeCompare(b.id)).forEach((device) => appendDevice(device, list));
    elements.deviceList.appendChild(section);
  }
}

function liveSocketDemandSeries() {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cutoff = state.socketDemandRange === "today"
    ? todayStart.getTime()
    : now - (state.socketDemandRange === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;
  const events = new Map();
  for (const device of DEVICES.filter((item) => item.sensorModel === "WS523")) {
    const samples = state.snapshots.get(device.id)?.trends.activePower || [];
    for (const sample of samples) {
      if (!Number.isFinite(sample.time) || !Number.isFinite(sample.value)) continue;
      if (!events.has(sample.time)) events.set(sample.time, new Map());
      events.get(sample.time).set(device.id, sample.value);
    }
  }
  const latest = new Map();
  const series = [];
  for (const [time, updates] of [...events.entries()].sort((a, b) => a[0] - b[0])) {
    for (const [deviceId, value] of updates) latest.set(deviceId, value);
    if (time < cutoff || !latest.size) continue;
    const totalKilowatts = [...latest.values()].reduce((sum, value) => sum + value, 0) / 1000;
    series.push({ time, value: totalKilowatts });
  }
  return series.slice(-72);
}

function demandTimeLabel(time) {
  const date = new Date(time);
  if (state.socketDemandRange === "today") return date.toLocaleTimeString(activeLocale(), { hour: "2-digit", minute: "2-digit", hour12: false });
  return date.toLocaleDateString(activeLocale(), { month: "short", day: "numeric" });
}

function requestSocketDemandHistory(range = state.socketDemandRange) {
  if (state.debugMockData || state.socketDemandHistoryLoading.has(range)) return;
  const socket = state.influxSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  state.socketDemandHistoryLoading.add(range);
  socket.send(JSON.stringify({ type: "demand-history-request", range }));
  window.setTimeout(() => {
    if (state.socketDemandHistoryLoading.delete(range)) renderSocketDemandChart(state.debugMockData);
  }, 35000);
}

function renderSocketDemandChart(mock) {
  const chart = document.querySelector(".dt-demand-chart");
  const { width, height } = chart.getBoundingClientRect();
  const chartWidth = width > 0 && height > 0 ? (width / height) * 100 : 300;
  chart.setAttribute("viewBox", `0 0 ${chartWidth} 100`);
  const mockRanges = {
    today: { values: [0.72, 0.74, 0.69, 0.78, 0.75, 0.86, 0.82, 0.93, 0.89, 0.91, 0.79, 0.75, 0.78, 0.74], labels: ["00:00", "12:00", "Now"] },
    "7d": { values: [0.76, 0.82, 0.79, 0.91, 0.87, 0.94, 0.88], labels: ["Mon", "Thu", "Sun"] },
    "30d": { values: [0.71, 0.74, 0.8, 0.77, 0.84, 0.9, 0.86, 0.93, 0.88, 0.96, 0.92, 0.98], labels: ["30d ago", "15d", "Today"] },
  };
  document.querySelectorAll("[data-demand-range]").forEach((button) => {
    const active = button.dataset.demandRange === state.socketDemandRange;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = false;
  });
  const requestedSeries = state.socketDemandHistory.get(state.socketDemandRange);
  const liveSeries = mock
    ? []
    : requestedSeries || (state.socketDemandRange === "today" ? liveSocketDemandSeries() : []);
  if (!mock && !liveSeries.length) {
    const loading = state.socketDemandHistoryLoading.has(state.socketDemandRange);
    chart.innerHTML = `<text class="dt-demand-empty" x="${chartWidth / 2}" y="52" text-anchor="middle">${loading ? "Loading power history…" : "No power history for this range"}</text>`;
    chart.setAttribute("aria-label", loading ? "Loading InfluxDB electrical demand history" : "No InfluxDB electrical demand history for this range");
    return;
  }
  const values = mock ? mockRanges[state.socketDemandRange].values : liveSeries.map((sample) => sample.value);
  const labels = mock
    ? mockRanges[state.socketDemandRange].labels
    : [liveSeries[0], liveSeries[Math.floor((liveSeries.length - 1) / 2)], liveSeries.at(-1)].map((sample) => demandTimeLabel(sample.time));
  if (values.length === 1) values.unshift(values[0]);
  const left = 28, right = chartWidth - 4, top = 5, bottom = 79;
  const observedMax = Math.max(...values);
  const min = 0;
  const { max, ticks, digits } = demandAxis(observedMax);
  const formatTick = (value) => Number(value.toFixed(digits)).toLocaleString(activeLocale(), {
    maximumFractionDigits: digits,
  });
  const x = (index) => left + (index / (values.length - 1)) * (right - left);
  const y = (value) => bottom - ((value - min) / (max - min)) * (bottom - top);
  const points = values.map((value, index) => [x(index), y(value)]);
  const line = points.map(([px, py], index) => `${index ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  chart.innerHTML = `
    <g class="dt-demand-grid">${ticks.map((tick) => `<line x1="${left}" y1="${y(tick)}" x2="${right}" y2="${y(tick)}"></line><text x="${left - 5}" y="${y(tick) + 3}" text-anchor="end">${formatTick(tick)}</text>`).join("")}</g>
    <path class="dt-demand-area" d="${line} L${right} ${bottom} L${left} ${bottom} Z"></path>
    <path class="dt-demand-line" d="${line}"></path>
    <g class="dt-demand-axis"><text x="${left}" y="96" text-anchor="start">${labels[0]}</text><text x="${(left + right) / 2}" y="96" text-anchor="middle">${labels[1]}</text><text x="${right}" y="96" text-anchor="end">${labels[2]}</text></g>
  `;
  chart.setAttribute("aria-label", `${state.socketDemandRange} ${mock ? "virtual" : "InfluxDB"} electrical demand trend`);
}

function renderDebugDashboardData() {
  const demoDeviceCount = DEVICES.filter((device) => !device.debugOnly || state.debugMockData).length;
  const signature = `${state.debugMockData}:${demoDeviceCount}`;
  if (state.renderedDebugMockData === signature) return;
  state.renderedDebugMockData = signature;
  const mock = state.debugMockData;
  renderOccupancySeats();

  const socketPowers = mock ? ["420 W", "160 W", "0 W", "310 W", "0 W", "90 W"] : Array(6).fill("—");
  document.querySelectorAll(".dt-socket-grid small").forEach((element, index) => { element.textContent = socketPowers[index]; });
  document.querySelectorAll(".dt-socket-grid input").forEach((input, index) => {
    input.disabled = !mock;
    input.checked = mock && [0, 1, 3, 5].includes(index);
  });
  syncSocketMaster();
  document.querySelector(".dt-demand-row strong").textContent = mock ? "0.98" : "—";
  renderSocketDemandChart(mock);

  document.querySelectorAll(".dt-mode-toggle button").forEach((button, index) => {
    button.disabled = !mock;
    button.classList.toggle("active", mock && index === 0);
  });
  document.querySelector(".dt-mode-toggle").hidden = !mock;
  document.getElementById("ai-reason").hidden = mock;
  document.getElementById("demo-badge").hidden = !mock;
  if (mock) {
    document.querySelector(".dt-recommendations").innerHTML = `
    <div><span>Recommended supply-air setpoint</span><strong>22.5<small>°C</small></strong><p>Current setpoint 23.0°C</p><em class="waiting">Awaiting execution</em></div>
    <div><span>Recommended outdoor-air damper</span><strong>46<small>%</small></strong><p>Current position 32%</p><em>Executed successfully</em></div>
  `;
  } else {
    renderAiRecommendation();
  }

  const healthData = mock
    ? { sensor: [Math.max(0, demoDeviceCount - 3), 2, 1], battery: [Math.max(0, demoDeviceCount - 5), 4, 1] }
    : { sensor: [0, 0, 0], battery: [0, 0, 0] };
  const healthColors = {
    sensor: ["#18ad78", "#9aabc0", "#ef476f"],
    battery: ["#18ad78", "#f0a51a", "#ef476f"],
  };
  document.querySelectorAll("[data-health-chart]").forEach((chart) => {
    const key = chart.dataset.healthChart;
    const values = healthData[key];
    chart.querySelectorAll("li b").forEach((value, index) => { value.textContent = mock ? values[index] : "—"; });
    drawDonutChart(chart.querySelector("canvas"), values, healthColors[key]);
  });
  document.querySelector(".dt-alert-list").innerHTML = mock ? `
    <button type="button" class="warning"><i class="ph ph-wifi-slash"></i><span><strong>Occupancy sensor offline</strong><small>VS341-03 · Gray seat · Occupancy unavailable</small></span></button>
    <button type="button" class="warning"><i class="ph ph-wifi-slash"></i><span><strong>Environment sensor offline</strong><small>AM103-05 · Gray status light</small></span></button>
    <button type="button" class="warning"><i class="ph ph-battery-warning"></i><span><strong>Battery replacement required</strong><small>WS523-03 · maintenance due</small></span></button>
  ` : "";

  const outdoorMockLines = [
    '<strong>31.8<small>°C</small></strong><em>Apparent 36°</em>',
    '<strong>68<small>%</small></strong>',
    '<strong class="wind-value" aria-label="Wind from ESE at 4.2 metres per second"><em>4.2<small> m/s</small></em><i class="ph ph-arrow-up dt-wind-arrow" style="--wind-direction:112.5deg" aria-hidden="true"></i></strong>',
    '<strong>820<small> W/m²</small></strong>',
  ];
  document.querySelectorAll(".dt-outdoor-grid .dt-metric-line").forEach((line, index) => {
    line.innerHTML = mock ? outdoorMockLines[index] : "<strong>—</strong>";
  });

}

const CONTROL_MODE_LABELS = { L0: "Recommendation only", L1: "Shadow mode", L2: "Automatic control" };

function renderAiRecommendation() {
  if (state.debugMockData) return;
  const rec = state.recommendation;
  const reason = document.getElementById("ai-reason");
  const container = document.querySelector(".dt-recommendations");
  if (!rec || rec.status === "no-data") {
    reason.textContent = rec ? rec.reasonEn : "Waiting for the first recommendation";
    container.innerHTML = `
      <div><span>Recommended outdoor air</span><strong>—</strong><p>—</p></div>
      <div><span>CO₂ peak, next 60 min</span><strong>—</strong><p>—</p></div>`;
    return;
  }
  const occupantsLabel = rec.occupancy.measured ? "Occupants" : "Estimated occupants";
  const time = new Date(rec.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  reason.textContent = rec.reasonEn;
  reason.title = `${CONTROL_MODE_LABELS[rec.controlMode] || rec.controlMode} · updated ${time}`;
  container.innerHTML = `
    <div><span>Recommended outdoor air</span><strong>${escapeHtml(rec.airflow.recommendedLps)}<small>L/s</small></strong><p>Damper ${escapeHtml(rec.airflow.recommendedDamperPct)}% · now ${escapeHtml(rec.airflow.baselineDamperPct)}%</p>${rec.airflow.atMax ? '<em class="waiting">Outdoor air at maximum</em>' : ""}</div>
    <div><span>CO₂ peak, next 60 min</span><strong>${escapeHtml(rec.co2.peakRecommended)}<small>ppm</small></strong><p>${occupantsLabel} ${escapeHtml(rec.occupancy.current)}</p></div>`;
}

function renderAhuData() {
  const mock = state.debugMockData;
  const demo = state.ahuDemo;
  const setpoint = `${state.ahuSetpoint.toFixed(1)}°C`;
  const ahuValues = demo ? [setpoint, "22.3 °C", "23.4 °C"] : mock ? [setpoint, "17.8 °C", "24.1 °C"] : ["—", "—", "—"];
  document.querySelectorAll(".dt-ahu-control strong, .dt-air-readings strong").forEach((element, index) => { element.textContent = ahuValues[index]; });
  const ahuMeterValues = demo ? ["48%", "11%", "40 Hz"] : mock ? ["46%", "32%", "38 Hz"] : ["—", "—", "—"];
  const ahuMeterWidths = demo ? ["48%", "11%", "66.7%"] : mock ? ["46%", "32%", "63%"] : ["0", "0", "0"];
  document.querySelectorAll(".dt-ahu-meters b").forEach((element, index) => { element.textContent = ahuMeterValues[index]; });
  document.querySelectorAll(".dt-ahu-meters u").forEach((element, index) => { element.style.width = ahuMeterWidths[index]; });
  const ahuRange = document.querySelector(".dt-ahu-control input");
  ahuRange.disabled = !(mock || demo);
  ahuRange.value = mock || demo ? String(state.ahuSetpoint) : "18";
  const button = document.querySelector(".dt-ahu-control button");
  button.disabled = !(mock || demo);
  button.innerHTML = `<i class="ph ph-paper-plane-tilt"></i>${(mock || demo) && state.ahuAppliedSetpoint === state.ahuSetpoint && button.dataset.applied === "true" ? "Applied" : "Control"}`;
  ahuRange.setAttribute("aria-label", demo ? "Demo temperature setpoint" : mock ? "Zone temperature setpoint" : "Zone temperature setpoint unavailable");
}

document.querySelector(".dt-ahu-control input").addEventListener("input", (event) => {
  if (!(state.ahuDemo || state.debugMockData)) return;
  state.ahuSetpoint = Number(event.currentTarget.value);
  document.querySelector(".dt-ahu-control button").dataset.applied = "false";
  renderAhuData();
});
document.querySelector(".dt-ahu-control button").addEventListener("click", (event) => {
  if (!(state.ahuDemo || state.debugMockData)) return;
  state.ahuAppliedSetpoint = state.ahuSetpoint;
  event.currentTarget.dataset.applied = "true";
  renderAhuData();
});

function drawDonutChart(canvas, values, colors) {
  const context = canvas.getContext("2d");
  const density = Math.min(window.devicePixelRatio || 1, 2);
  const size = 78;
  canvas.width = size * density;
  canvas.height = size * density;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  context.scale(density, density);
  context.clearRect(0, 0, size, size);
  const total = values.reduce((sum, value) => sum + value, 0);
  const center = size / 2;
  const radius = 28;
  context.lineWidth = 10;
  context.lineCap = "butt";
  if (!total) {
    context.strokeStyle = "#dbe3ee";
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.stroke();
    return;
  }
  let start = -Math.PI / 2;
  values.forEach((value, index) => {
    if (!value) return;
    const end = start + (value / total) * Math.PI * 2;
    context.strokeStyle = colors[index];
    context.beginPath();
    context.arc(center, center, radius, start, end);
    context.stroke();
    start = end;
  });
}

function renderSiteOverview() {
  renderDebugDashboardData();
  renderAhuData();
  const snapshots = [...state.snapshots.values()];
  const metricValues = (keys) => snapshots.flatMap((snapshot) => keys
    .filter((key) => Number.isFinite(snapshot.values[key]))
    .map((key) => snapshot.values[key]));
  const average = (values) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  const temperature = average(metricValues(["temperature", "supplyTemperature"]));
  const humidity = average(metricValues(["humidity"]));
  const co2 = average(metricValues(["co2"]));
  if (elements.siteTemperature) elements.siteTemperature.textContent = temperature === null ? "—" : `${formatNumber(temperature)} °C`;
  if (elements.siteHumidity) elements.siteHumidity.textContent = humidity === null ? "—" : `${formatNumber(humidity)} %`;
  if (elements.siteCo2) elements.siteCo2.textContent = co2 === null ? "—" : `${formatNumber(co2)} ppm`;
  const occupancyDevices = DEVICES.filter((device) => device.sensorModel === "VS341");
  const occupancySnapshots = occupancyDevices
    .filter((device) => sensorIsOnline(device.id))
    .map((device) => state.snapshots.get(device.id))
    .filter((snapshot) => Number.isFinite(snapshot?.values.occupancy));
  const occupiedCount = occupancySnapshots.reduce((sum, snapshot) => sum + (snapshot.values.occupancy > 0 ? 1 : 0), 0);
  const unknownOccupancyCount = occupancyDevices.length - occupancySnapshots.length;
  const occupancySummary = occupancySnapshots.length ? `${occupiedCount} people` : "—";
  const occupancyExplanation = `${occupiedCount} sensors detect presence based on their latest InfluxDB readings; ${occupancySnapshots.length} of ${occupancyDevices.length} have readings; ${unknownOccupancyCount} have no data`;
  if (elements.siteOccupants) {
    elements.siteOccupants.textContent = state.debugMockData
      ? `${DEBUG_OCCUPIED_SEATS.size} people`
      : occupancySummary;
    elements.siteOccupants.title = state.debugMockData ? "" : occupancyExplanation;
  }

  const sourceDeviceId = "AM103-07";
  const sourceSnapshot = state.snapshots.get(sourceDeviceId);
  const sourceValue = (key, unit) => Number.isFinite(sourceSnapshot?.values[key])
    ? `${formatNumber(sourceSnapshot.values[key])}<small> ${unit}</small>`
    : "—";
  elements.overviewIndoorTemperature.innerHTML = state.debugMockData ? "24.2 °C" : sourceValue("temperature", "°C");
  elements.overviewIndoorHumidity.innerHTML = state.debugMockData ? "62.2 %" : sourceValue("humidity", "%");
  elements.overviewIndoorCo2.innerHTML = state.debugMockData ? "517 ppm" : sourceValue("co2", "ppm");
  const pm25 = average(metricValues(["pm25"]));
  const noise = average(metricValues(["noiseLaeq"]));
  const extraIndoorValues = state.debugMockData
    ? ["9 µg/m³", "48 dB(A)", "7 people"]
    : [
      pm25 === null ? "—" : `${formatNumber(pm25)} µg/m³`,
      noise === null ? "—" : `${formatNumber(noise)} dB(A)`,
      occupancySummary,
    ];
  document.querySelectorAll(".dt-indoor-grid .dt-metric-line strong").forEach((element, index) => {
    if (index >= 3) element.innerHTML = extraIndoorValues[index - 3].replace(/^([\d.]+) (.+)$/, "$1<small> $2</small>");
    if (index === 5) element.title = state.debugMockData ? "Virtual demo: 7 occupied, 2 vacant, 1 offline (VS341-03); 10 seats total" : occupancyExplanation;
  });

  if (!state.debugMockData) {
    const weatherDevice = DEVICES.find((device) => sensorGroupFor(device).key === "weather");
    const weatherSnapshot = weatherDevice ? state.snapshots.get(weatherDevice.id) : null;
    const weatherValues = weatherSnapshot?.values || {};
    const windDirection = Number(weatherValues.windDirection);
    const hasWindDirection = Number.isFinite(weatherValues.windDirection);
    const windArrow = hasWindDirection
      ? `<i class="ph ph-arrow-up dt-wind-arrow" style="--wind-direction:${windDirection}deg" aria-hidden="true"></i>`
      : "";
    const weatherLines = [
      Number.isFinite(weatherValues.temperature) ? `<strong>${formatNumber(weatherValues.temperature)}<small>°C</small></strong>` : "<strong>—</strong>",
      Number.isFinite(weatherValues.humidity) ? `<strong>${formatNumber(weatherValues.humidity)}<small>%</small></strong>` : "<strong>—</strong>",
      Number.isFinite(weatherValues.windSpeed) ? `<strong class="wind-value" aria-label="Wind ${hasWindDirection ? `from ${Math.round(windDirection)} degrees ` : ""}at ${formatNumber(weatherValues.windSpeed)} metres per second"><em>${formatNumber(weatherValues.windSpeed)}<small> m/s</small></em>${windArrow}</strong>` : "<strong>—</strong>",
      Number.isFinite(state.radiation?.value)
        ? `<strong>${Math.round(state.radiation.value)}<small> W/m²</small></strong>` : "<strong>—</strong>",
    ];
    document.querySelectorAll(".dt-outdoor-grid .dt-metric-line").forEach((line, index) => { line.innerHTML = weatherLines[index]; });
  }

  if (!state.debugMockData) {
    const socketDevices = DEVICES.filter((device) => device.sensorModel === "WS523").sort((a, b) => a.id.localeCompare(b.id));
    document.querySelectorAll(".dt-socket-grid small").forEach((element, index) => {
      const input = document.querySelectorAll(".dt-socket-grid input[data-socket-device]")[index];
      const device = socketDevices.find((item) => item.id === input?.dataset.socketDevice);
      const socketSnapshot = state.snapshots.get(device?.id);
      const power = socketSnapshot?.values.activePower;
      element.textContent = Number.isFinite(power) ? `${formatNumber(power)} W` : "—";
      if (input) {
        const pending = [...state.pendingSocketControls.values()].find((item) => item.deviceId === input.dataset.socketDevice);
        input.checked = Number(socketSnapshot?.values.socketStatus) > 0;
        input.disabled = !device || !state.socketControlConnected || Boolean(pending);
        input.classList.toggle("pending", Boolean(pending));
        input.setAttribute("aria-busy", String(Boolean(pending)));
      }
    });
    syncSocketMaster();
    const totalPower = socketDevices.reduce((sum, device) => {
      const power = state.snapshots.get(device.id)?.values.activePower;
      return sum + (Number.isFinite(power) ? power : 0);
    }, 0);
    document.querySelector(".dt-demand-row strong").textContent = socketDevices.length ? (totalPower / 1000).toFixed(2) : "—";
    renderSocketDemandChart(false);

    const online = DEVICES.filter((device) => state.snapshots.get(device.id)?.status === "normal").length;
    const fault = DEVICES.filter((device) => state.snapshots.get(device.id)?.status === "fault").length;
    const offline = DEVICES.filter((device) => ["offline", "unavailable"].includes(state.snapshots.get(device.id)?.status)).length;
    const batteries = snapshots.map((snapshot) => snapshot.values.battery).filter(Number.isFinite);
    const healthData = {
      sensor: [online, offline, fault],
      battery: [batteries.filter((value) => value >= 50).length, batteries.filter((value) => value >= 20 && value < 50).length, batteries.filter((value) => value < 20).length],
    };
    const healthColors = { sensor: ["#18ad78", "#9aabc0", "#ef476f"], battery: ["#18ad78", "#f0a51a", "#ef476f"] };
    document.querySelectorAll("[data-health-chart]").forEach((chart) => {
      const values = healthData[chart.dataset.healthChart];
      chart.querySelectorAll("li b").forEach((element, index) => { element.textContent = String(values[index]); });
      drawDonutChart(chart.querySelector("canvas"), values, healthColors[chart.dataset.healthChart]);
    });

    const now = Date.now();
    const freshDevices = DEVICES.filter((device) => {
      const at = state.lastLiveAt.get(device.id);
      return Number.isFinite(at) && now - at <= INFLUX_STALE_AFTER_MS;
    });
    const setConnectionStatus = (element, connected, detail) => {
      if (!element) return;
      element.classList.toggle("online", connected);
      element.classList.toggle("offline", !connected);
      element.title = detail;
    };
    setConnectionStatus(elements.alarmDbStatus, state.influxConnected, state.influxConnected ? "InfluxDB connected" : "InfluxDB disconnected");
    setConnectionStatus(elements.alarmLoraStatus, freshDevices.length > 0, `${freshDevices.length}/${DEVICES.length} devices reporting within 15 minutes`);

    const alarms = [];
    const addAlarm = (type, level, title, device, detail) => alarms.push({ id: `${type}:${device.id}`, type, level, title, deviceId: device.id, detail });
    for (const device of DEVICES) {
      const values = state.snapshots.get(device.id)?.values || {};
      if (values.magnetStatus > 0) addAlarm("door", "critical", "Door contact opened", device, "Door magnetic contact alarm");
      if (values.leakageStatus > 0) addAlarm("leak", "critical", "Water leakage detected", device, "Leak detector alarm");
      if (values.tamperStatus > 0) addAlarm("tamper", "critical", "Sensor tamper detected", device, "Device enclosure or installation changed");
      if (Number.isFinite(values.battery) && values.battery < 20) addAlarm("battery", "warning", "Battery replacement required", device, `${formatNumber(values.battery)}% remaining`);
      if (device.sensorModel === "WS523" && Number.isFinite(values.activePower) && values.activePower > 2500) addAlarm("socket-load", "critical", "Socket load exceeds threshold", device, `${formatNumber(values.activePower)} W`);
      if (device.sensorModel === "WS523" && Number.isFinite(values.voltage) && (values.voltage < 200 || values.voltage > 250)) addAlarm("socket-voltage", "warning", "Socket voltage abnormal", device, `${formatNumber(values.voltage)} V`);
    }
    if (!state.influxConnected) alarms.unshift({ id: "connection:database", type: "connection", level: "critical", title: "InfluxDB connection lost", deviceId: "Data service", detail: state.influxDiagnostic || "Telemetry and history are unavailable" });
    const withState = alarms.map((alarm) => ({ ...alarm, state: state.alarmStates[alarm.id] || "active" }));
    const filtered = withState.filter((alarm) => state.alarmFilter === "all" || alarm.state === state.alarmFilter);
    const alertList = document.querySelector(".dt-alert-list");
    alertList.innerHTML = filtered.length ? filtered.map((alarm) => `
      <article class="dt-alert-item ${alarm.level} ${alarm.state}" data-alarm-id="${alarm.id}">
        <i class="ph ${alarm.type === "battery" ? "ph-battery-warning" : alarm.type.startsWith("socket") ? "ph-plug" : alarm.type === "door" ? "ph-door-open" : alarm.type === "leak" ? "ph-drop" : "ph-warning-circle"}"></i>
        <span><strong>${alarm.title}</strong><small>${escapeHtml(alarm.deviceId)} · ${escapeHtml(alarm.detail)}</small></span>
        <button type="button" data-alarm-action="${alarm.state === "active" ? "acknowledged" : "active"}">${alarm.state === "active" ? "Acknowledge" : "Reopen"}</button>
      </article>
    `).join("") : `<p class="dt-alert-empty">No ${state.alarmFilter === "all" ? "current" : state.alarmFilter} alarms</p>`;
    alertList.querySelectorAll("[data-alarm-action]").forEach((button) => button.addEventListener("click", () => {
      const item = button.closest("[data-alarm-id]");
      state.alarmStates[item.dataset.alarmId] = button.dataset.alarmAction;
      localStorage.setItem("zb202-alarm-states", JSON.stringify(state.alarmStates));
      renderSiteOverview();
    }));
    alertList.setAttribute("aria-label", alarms.length ? `${alarms.length} live alarms` : "No active InfluxDB alarms");
  }
}

function requestSensorHistory() {
  const device = DEVICES.find((item) => item.id === state.selectedDeviceId);
  if (!device || state.influxSocket?.readyState !== WebSocket.OPEN) return;
  state.sensorHistoryRequestId = `${device.id}:${Date.now()}:${Math.random()}`;
  state.sensorHistoryLoading = true;
  state.sensorHistoryError = null;
  const requestId = state.sensorHistoryRequestId;
  window.setTimeout(() => {
    if (state.sensorHistoryRequestId === requestId && state.sensorHistoryLoading) {
      state.sensorHistoryLoading = false;
      state.sensorHistoryError = "History request timed out";
      renderSelectedDevice();
    }
  }, 35000);
  state.influxSocket.send(JSON.stringify({ type: "sensor-history-request", requestId: state.sensorHistoryRequestId, deviceId: device.id, devEui: device.devEui, hours: historyWindowMs() / 3600000 }));
}

function historyWindowMs() {
  if (state.historyRange === "1h") return 60 * 60 * 1000;
  if (state.historyRange === "12h") return 12 * 60 * 60 * 1000;
  if (state.historyRange === "24h") return 24 * 60 * 60 * 1000;
  if (state.historyRange === "custom") return state.customHours * 60 * 60 * 1000;
  return null;
}

function samplesInSelectedRange(samples) {
  const windowMs = historyWindowMs();
  if (!windowMs) return samples;
  const cutoff = Date.now() - windowMs;
  return samples.filter((sample) => sample.time >= cutoff);
}

function binaryMetricLabel(key, value) {
  if (key === "socketStatus") return activeLang === "en" ? (value > 0 ? "On" : "Off") : (value > 0 ? "开启" : "关闭");
  if (key === "magnetStatus") return activeLang === "en" ? (value > 0 ? "Open" : "Closed") : (value > 0 ? "开" : "闭");
  return activeLang === "en" ? (value > 0 ? "1 person" : "0 people") : `${value > 0 ? 1 : 0}人`;
}

function trendScale(metric, values) {
  if (["magnetStatus", "occupancy", "socketStatus"].includes(metric?.key)) return { min: 0, max: 1, span: 1, decimals: 0 };
  const scaleByMetric = {
    temperature: { minimumSpan: 0.4, decimals: 1 },
    humidity: { minimumSpan: 1, decimals: 1 },
    co2: { minimumSpan: 20, decimals: 0 },
  };
  const config = scaleByMetric[metric?.key] || { minimumSpan: 1, decimals: 1 };
  const observedMin = Math.min(...values);
  const observedMax = Math.max(...values);
  const observedSpan = observedMax - observedMin;
  const span = Math.max(config.minimumSpan, observedSpan * 1.24);
  const center = (observedMin + observedMax) / 2;
  return {
    min: center - span / 2,
    max: center + span / 2,
    span,
    decimals: config.decimals,
  };
}

function sparklinePath(samples, metric, useSelectedRange = true) {
  const width = 360;
  const height = 140;
  const left = ["magnetStatus", "occupancy", "socketStatus"].includes(metric?.key) ? 62 : 40;
  const right = 8;
  const top = 10;
  const bottom = 28;
  const plotBottom = height - bottom;
  const values = samples.map((sample) => sample.value);
  const scale = trendScale(metric, values);
  const windowMs = useSelectedRange ? historyWindowMs() : null;
  const latestTime = Date.now();
  let domainStart = windowMs ? latestTime - windowMs : samples[0].time;
  let domainEnd = windowMs ? latestTime : samples.at(-1).time;
  if (domainEnd <= domainStart) domainEnd = domainStart + 1;
  let points = samples.map((sample) => {
    const xRatio = Math.max(0, Math.min(1, (sample.time - domainStart) / (domainEnd - domainStart)));
    const x = left + xRatio * (width - left - right);
    const y = top + (1 - (sample.value - scale.min) / scale.span) * (plotBottom - top);
    return [x, y];
  });
  if (points.length === 1) points = [[(left + width - right) / 2, points[0][1]]];
  const binary = ["magnetStatus", "occupancy", "socketStatus"].includes(metric?.key);
  const line = points.map(([x, y], index) => index === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : binary ? `H${x.toFixed(1)} V${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = points.length > 1 ? `${line} L${points.at(-1)[0].toFixed(1)},${plotBottom} L${points[0][0].toFixed(1)},${plotBottom} Z` : "";
  const tickValues = binary ? [1, 0] : [scale.max, (scale.max + scale.min) / 2, scale.min];
  const ticks = tickValues.map((value, index) => ({
    value,
    y: top + (index / (tickValues.length - 1)) * (plotBottom - top),
  }));
  return { line, area, points, ticks, decimals: scale.decimals, left, right: width - right, top, plotBottom };
}

function renderMetricTrend(snapshot, chart, metric) {
  const history = metric ? snapshot.trends[metric.key] || [] : [];
  const selectedSamples = samplesInSelectedRange(history);
  const outsideRange = false;
  const samples = outsideRange ? history : selectedSamples;
  const values = samples.map((sample) => sample.value);
  chart.card.hidden = !metric;
  if (!metric) return;
  chart.label.textContent = metricText(metric);
  let message = chart.card.querySelector(".dt-trend-message");
  if (!message) {
    message = document.createElement("p");
    message.className = "dt-trend-message";
    chart.card.appendChild(message);
  }
  message.textContent = state.sensorHistoryLoading ? "Loading selected range…" : state.sensorHistoryError ? "History query failed; try again" : !samples.length ? "No readings in the selected range"
    : [outsideRange ? t("trendOutsideRange") : "", samples.length === 1 ? t("trendOneReading") : ""].filter(Boolean).join(" · ");
  message.hidden = !message.textContent;
  if (!samples.length) {
    const cachedOccupancy = metric.key === "occupancy" ? snapshot.values[metric.key] : null;
    chart.value.textContent = Number.isFinite(cachedOccupancy)
      ? binaryMetricLabel(metric.key, cachedOccupancy)
      : "—";
    chart.line.setAttribute("d", "");
    chart.area.setAttribute("d", "");
    chart.points.innerHTML = "";
    chart.grid.innerHTML = `<line x1="40" y1="10" x2="352" y2="10"></line><line x1="40" y1="61" x2="352" y2="61"></line><line x1="40" y1="112" x2="352" y2="112"></line><line x1="40" y1="10" x2="40" y2="112"></line>`;
    chart.axis.innerHTML = `<text x="40" y="132" text-anchor="start">-${state.historyRange === "custom" ? `${state.customHours}h` : state.historyRange}</text><text x="352" y="132" text-anchor="end">${t("now")}</text>`;
    if (["magnetStatus", "occupancy", "socketStatus"].includes(metric.key)) {
      chart.axis.innerHTML += `<text x="34" y="13" text-anchor="end">${binaryMetricLabel(metric.key, 1)}</text><text x="34" y="115" text-anchor="end">${binaryMetricLabel(metric.key, 0)}</text>`;
    }
    return;
  }
  const paths = sparklinePath(samples, metric, !outsideRange);
  const delta = values.at(-1) - values[0];
  const deltaClass = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const deltaSign = delta > 0 ? "+" : "";
  chart.value.innerHTML = `${formatNumber(values.at(-1))} ${metric.unit}${samples.length > 1 ? `<small class="dt-trend-delta ${deltaClass}">Δ ${deltaSign}${formatNumber(delta)} ${metric.unit}</small>` : ""}`;
  if (["magnetStatus", "occupancy", "socketStatus"].includes(metric.key)) chart.value.textContent = binaryMetricLabel(metric.key, values.at(-1));
  chart.line.setAttribute("d", paths.line);
  chart.area.setAttribute("d", paths.area);
  chart.points.innerHTML = "";
  chart.grid.innerHTML = paths.ticks.map((tick) => `
    <line x1="${paths.left}" y1="${tick.y}" x2="${paths.right}" y2="${tick.y}"></line>
  `).join("") + `<line x1="${paths.left}" y1="${paths.top}" x2="${paths.left}" y2="${paths.plotBottom}"></line>`;
  const rangeLabel = outsideRange ? t("earlier") : `-${state.historyRange === "custom" ? `${state.customHours}h` : state.historyRange}`;
  const endLabel = outsideRange
    ? new Date(samples.at(-1).time).toLocaleTimeString(activeLocale(), { hour: "2-digit", minute: "2-digit" })
    : t("now");
  chart.axis.innerHTML = paths.ticks.map((tick) => `
    <text x="${paths.left - 6}" y="${tick.y + 3}" text-anchor="end">${["magnetStatus", "occupancy", "socketStatus"].includes(metric.key) ? binaryMetricLabel(metric.key, tick.value) : tick.value.toFixed(paths.decimals)}</text>
  `).join("") + `
    <text x="${paths.left}" y="132" text-anchor="start">${rangeLabel}</text>
    <text x="${paths.right}" y="132" text-anchor="end">${endLabel}</text>
  `;
}

function renderSelectedDevice() {
  const device = DEVICES.find((item) => item.id === state.selectedDeviceId);
  if (!device) {
    const item = state.selectedItem;
    elements.dataPanelTitle.textContent = t("componentDetails");
    elements.deviceName.textContent = item?.name || t("noProperties");
    elements.deviceName.title = elements.deviceName.textContent;
    elements.statusBadge.textContent = "";
    elements.statusBadge.setAttribute("aria-label", "BIM");
    elements.statusBadge.title = "BIM";
    elements.statusBadge.className = "dt-status-badge bim";
    elements.metricGrid.hidden = true;
    elements.componentProperties.hidden = !item;
    elements.componentProperties.innerHTML = item ? `
      <h3>${t("componentDetails")}</h3>
      <dl>
        <div><dt>${t("ifcType")}</dt><dd>${escapeHtml(item.category || "—")}</dd></div>
        <div><dt>${t("globalId")}</dt><dd>${escapeHtml(item.guid || "—")}</dd></div>
        <div><dt>${t("expressId")}</dt><dd>${escapeHtml(item.localId ?? "—")}</dd></div>
      </dl>
    ` : "";
    elements.componentProperties.querySelectorAll("dd").forEach((value) => { value.title = value.textContent; });
    elements.metricTrendCards.forEach((chart) => { chart.card.hidden = true; });
    elements.updateRow.hidden = true;
    elements.historyNote.closest(".dt-history-toolbar").hidden = true;
    elements.faultToggle.hidden = true;
    return;
  }
  elements.dataPanelTitle.textContent = t("sensorData");
  elements.componentProperties.hidden = true;
  elements.componentProperties.innerHTML = "";
  elements.historyNote.closest(".dt-history-toolbar").hidden = false;
  const storedSnapshot = state.snapshots.get(device.id);
  const snapshot = device.sensorModel === "VS341"
    ? { ...storedSnapshot, values: { ...storedSnapshot.values, occupancy: occupancyValueFor(device.id) } }
    : storedSnapshot;
  const bound = device.binding.kind === "marker" || state.boundObjects.has(device.id) || state.liveDevices.has(device.id);
  const displayStatus = statusFor(device.id);
  const presentedStatus = presentationStatus(displayStatus);
  const occupancyMetric = device.sensorModel === "VS341";

  elements.deviceName.textContent = deviceText(device, "name");
  elements.deviceName.title = elements.deviceName.textContent;
  elements.statusBadge.textContent = "";
  elements.statusBadge.setAttribute("aria-label", t(presentedStatus.key));
  elements.statusBadge.title = t(presentedStatus.key);
  elements.statusBadge.className = `dt-status-badge ${presentedStatus.className}`;
  elements.metricGrid.hidden = false;
  elements.metricTrendCards.forEach((chart) => { chart.card.hidden = false; });
  elements.updateRow.hidden = false;
  elements.faultToggle.hidden = true;

  const displayedMetrics = device.metrics.filter((metric) => !(device.sensorModel === "WS301" && metric.key === "tamperStatus"));
  elements.metricGrid.innerHTML = displayedMetrics.map((metric) => `
    <div class="dt-metric" data-metric="${metric.key}" role="group" aria-label="${metricText(metric)}" title="${metricText(metric)}">
      <i class="ph ${metric.icon || INFLUX_METRICS[metric.key]?.icon || "ph-chart-line"} dt-metric-icon" aria-hidden="true"></i>
      <span>${metricText(metric)}</span>
      <strong>${Number.isFinite(snapshot.values[metric.key]) ? ["magnetStatus", "occupancy", "socketStatus"].includes(metric.key) ? binaryMetricLabel(metric.key, snapshot.values[metric.key]) : `${formatNumber(snapshot.values[metric.key])}<small>${metric.unit}</small>` : "—"}</strong>
    </div>
  `).join("");

  elements.metricTrendCards.forEach((chart, index) => renderMetricTrend(snapshot, chart, displayedMetrics[index]));
  const primarySamples = samplesInSelectedRange(snapshot.trends[device.metrics[0].key]);
  const selectedRangeLabel = state.historyRange === "custom" ? `${state.customHours}h` : state.historyRange;
  elements.historyNote.textContent = state.sensorHistoryLoading ? `Loading ${selectedRangeLabel} history…` : state.sensorHistoryError ? "History query failed; try again" : t("readingsInRange", { count: primarySamples.length, range: selectedRangeLabel });
  elements.updatedAt.textContent = state.lastLiveAt.has(device.id)
    ? occupancyMetric ? snapshot.updatedAt.toLocaleString(activeLocale(), { hour12: false }) : snapshot.updatedAt.toLocaleTimeString(activeLocale(), { hour12: false })
    : "—";
  elements.faultButtonText.textContent = snapshot.status === "fault" ? t("restoreNormal") : t("simulateFault");
  elements.faultToggle.classList.toggle("is-recovery", snapshot.status === "fault");
  elements.faultToggle.disabled = !bound;
}

let telemetryRenderTimer = null;
function scheduleTelemetryRender() {
  if (telemetryRenderTimer !== null) return;
  telemetryRenderTimer = window.setTimeout(() => {
    telemetryRenderTimer = null;
    if (!document.hidden) renderUI();
  }, 100);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) renderUI();
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function renderUI() {
  renderOccupancySeats();
  renderDeviceList();
  renderSelectedDevice();
  renderSiteOverview();
  updateAllVisualStates().catch((error) => { if (!pageClosing) console.error("Failed to style BIM components", error); });
}

function applyLanguage(lang) {
  activeLang = normalizeLanguage(lang);
  localStorage.setItem("lang", activeLang);
  document.documentElement.lang = activeLang === "en" ? "en" : activeLang === "zh-Hant" ? "zh-Hant" : "zh-CN";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.title = t(element.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
  elements.viewerCard.setAttribute("aria-label", t("viewerAria"));
  elements.overviewLink.href = `overview.html?lang=${activeLang}`;
  if (!elements.error.classList.contains("hidden")) {
    elements.errorMessage.textContent = t("loadError", { model: MODEL.name });
  }
  renderUI();
}

function setDashboardPanelsVisible(visible) {
  const workspace = elements.wrap.closest(".dt-workspace");
  workspace.classList.toggle("dashboard-collapsed", !visible);
  document.querySelector('[data-view="overview"]')?.setAttribute("aria-expanded", String(visible));
}

function setActivePlatformView(view) {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
}

function setDevicePanelOpen(open) {
  const workspace = elements.wrap.closest(".dt-workspace");
  workspace.classList.toggle("panel-open", open);
  elements.devicePanel.classList.toggle("is-open", open);
  elements.devicePanel.setAttribute("aria-hidden", String(!open));
  elements.devicePanel.inert = !open;
  controls.enablePan = true;
  void updateAllVisualStates();
  elements.devicePanelButton.setAttribute("aria-expanded", String(open));
  if (open) {
    const sensor = DEVICES.find((device) => device.id === state.selectedDeviceId);
    if (sensor) {
      state.iotOpenedFromOverview = true;
      state.assetView = "sensors";
      state.equipmentQuery = "";
      elements.equipmentSearch.value = "";
      state.sensorGroupFilters.add(sensorGroupFor(sensor).key);
      elements.assetViewButtons.forEach((button) => {
        const active = button.dataset.assetView === "sensors";
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
      workspace.classList.remove("alarm-focus");
      workspace.classList.add("right-panel-open");
      elements.overviewRail.setAttribute("aria-hidden", "false");
      renderDeviceList();
    }
    setDashboardPanelsVisible(false);
    setActivePlatformView("sensors");
  } else if (elements.devicePanelButton.classList.contains("active")) {
    setActivePlatformView(null);
  }
  if (open) elements.devicePanelClose.focus({ preventScroll: true });
  else elements.devicePanelButton.focus({ preventScroll: true });
  scheduleSensorMarkerSync(320);
}

function scrollSelectedSensorIntoList() {
  const selectedRow = elements.deviceList.querySelector(".dt-device-item.selected");
  if (!selectedRow) return;
  const listRect = elements.deviceList.getBoundingClientRect();
  const rowRect = selectedRow.getBoundingClientRect();
  if (rowRect.bottom > listRect.bottom) elements.deviceList.scrollTop += rowRect.bottom - listRect.bottom;
  else if (rowRect.top < listRect.top) elements.deviceList.scrollTop += rowRect.top - listRect.top;
}

async function selectDevice(deviceId, focus = false) {
  const device = DEVICES.find((item) => item.id === deviceId);
  if (!device) return;
  if (state.selectedIfcItem) await clearStandaloneIfcSelection();
  state.selectedDeviceId = deviceId;
  requestSensorHistory();
  state.selectedItem = device.ifc;
  renderUI();
  await updateAllVisualStates();
  if (focus) {
    scrollSelectedSensorIntoList();
    state.sensorDisplayMode = "all";
    state.layerVisibility.sensor = true;
    const sensorModel = state.fragmentsModels.get("sensor");
    if (sensorModel) sensorModel.object.visible = true;
    for (const marker of state.markerObjects.values()) marker.label.visible = marker.showStatusLight;
    const toggle = elements.layerToggles.find((item) => item.dataset.modelLayer === "sensor");
    if (toggle) {
      toggle.dataset.sensorMode = "all";
      toggle.setAttribute("aria-label", "All: sensors, occupancy and online indicators");
      toggle.title = toggle.getAttribute("aria-label");
      toggle.querySelector("span").textContent = "All";
      toggle.querySelector("i").className = "ph ph-eye";
    }
    focusDevice(device).catch((error) => console.error("Failed to focus BIM component", error));
  }
  if (device.binding.kind !== "object") return;
  try {
    const fragmentsModel = state.fragmentsModels.get(device.binding.modelId) || state.fragmentsModel;
    const details = await loadIfcItemDetails(device.binding.localId, device.category, fragmentsModel);
    if (state.selectedDeviceId === deviceId && details) {
      state.selectedItem = details;
      renderSelectedDevice();
    }
  } catch (error) {
    console.error("Failed to load IFC properties", error);
  }
}

async function clearStandaloneIfcSelection() {
  if (!state.selectedIfcItem) return;
  const { localId, modelId } = state.selectedIfcItem;
  const fragmentsModel = state.fragmentsModels.get(modelId);
  state.selectedIfcItem = null;
  if (fragmentsModel) await fragmentsModel.resetHighlight([localId]);
}

async function selectIfcItem(localId, modelId) {
  await clearStandaloneIfcSelection();
  state.selectedDeviceId = null;
  state.selectedIfcItem = { localId, modelId };
  state.selectedItem = {
    localId,
    category: "IFC",
    guid: null,
    name: `IFC #${localId}`,
    data: {},
  };
  setDevicePanelOpen(true);
  renderUI();
  const fragmentsModel = state.fragmentsModels.get(modelId) || state.fragmentsModel;
  await updateAllVisualStates();
  await fragmentsModel.highlight([localId], {
    color: new THREE.Color(0x2f7df4),
    opacity: 1,
    transparent: false,
    renderedFaces: renderedFaces.TWO,
  });
  try {
    const details = await loadIfcItemDetails(localId, null, fragmentsModel);
    if (!state.selectedDeviceId && state.selectedItem?.localId === localId && details) {
      state.selectedItem = details;
      renderSelectedDevice();
    }
  } catch (error) {
    console.error("Failed to inspect IFC component", error);
  }
}

async function isNonSelectableIfcItem(fragmentsModel, localId) {
  const item = fragmentsModel.getItem(localId);
  const [categoryResult, attributesResult] = await Promise.allSettled([
    item.getCategory(),
    item.getAttributes(),
  ]);
  const category = categoryResult.status === "fulfilled" ? String(categoryResult.value || "") : "";
  const attributes = attributesResult.status === "fulfilled" ? attributesResult.value?.object || {} : {};
  const name = [attributes.Name, attributes.ObjectType, attributes.PredefinedType]
    .map((value) => readableIfcValue(value) || "")
    .join(" ");
  const isWall = /^IFCWALL(?:STANDARDCASE)?$/i.test(category)
    || /(?:^|\b)basic\s+wall\b|\bwall[-_: ]/i.test(name);
  const isFloor = /^IFCSLAB$/i.test(category)
    || /(?:^|\b)(?:floor|flooring|slab)(?:\b|[-_: ])/i.test(name);
  const isFurniture = /^IFC(?:FURNISHINGELEMENT|FURNITURE|SYSTEMFURNITUREELEMENT)$/i.test(category)
    || /(?:^|\b)(?:table|desk|chair|furniture)(?:\b|[-_: ])/i.test(name);
  return isWall || isFloor || isFurniture;
}

function setFault(deviceId, shouldFault) {
  const snapshot = state.snapshots.get(deviceId);
  if (!snapshot) return;
  snapshot.status = shouldFault ? "fault" : "normal";
  snapshot.updatedAt = new Date();
  renderUI();
}

function updateMockData() {
  if (document.hidden) return;
  const connectivityChanged = updateDeviceConnectivity();
  if (connectivityChanged) {
    renderDeviceList();
    updateAllVisualStates().catch((error) => console.error("Failed to sync offline sensor state", error));
  }
  renderSelectedDevice();
  renderSiteOverview();
  const clockNow = new Date();
  const clockOptions = { timeZone: "Asia/Hong_Kong" };
  elements.clock.querySelector(".dt-clock-time").textContent = clockNow.toLocaleTimeString(activeLocale(), {
    ...clockOptions, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  elements.clock.querySelector(".dt-clock-date").textContent = clockNow.toLocaleDateString(activeLocale(), {
    ...clockOptions, year: "numeric", month: "short", day: "numeric",
  });
  elements.clock.dateTime = clockNow.toISOString();
  elements.clock.title = "Hong Kong · UTC+8";
}

function updateDeviceConnectivity() {
  if (!state.influxConnectionKnown) return false;
  let changed = false;
  for (const device of DEVICES) {
    const snapshot = state.snapshots.get(device.id);
    if (!snapshot) continue;
    // InfluxDB currently has telemetry but no device connectivity field.
    // A quiet sensor is not necessarily offline; only database evidence can
    // establish that it exists, and absent evidence stays unavailable.
    const nextStatus = !state.influxConnected || !state.liveDevices.has(device.id)
      ? "unavailable"
      : sensorStatusFromValues(device, snapshot.values);
    if (snapshot.status !== nextStatus) {
      snapshot.status = nextStatus;
      changed = true;
    }
  }
  return changed;
}

let bridgeRetryAttempt = 0;
let bridgeReconnectTimer = null;
let pageClosing = false;
function connectInfluxBridge() {
  if (state.influxSocket && state.influxSocket.readyState < WebSocket.CLOSING) return;
  let socket;
  try {
    socket = new WebSocket(bridgeUrl());
    state.influxSocket = socket;
  } catch (error) {
    console.warn("InfluxDB bridge unavailable", error);
    return;
  }
  socket.addEventListener("open", () => { bridgeRetryAttempt = 0; });
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (!message || typeof message !== "object") return;
    if (message.type === "sensor-history") {
      if (message.requestId !== state.sensorHistoryRequestId || message.deviceId !== state.selectedDeviceId) return;
      state.sensorHistoryLoading = false;
      state.sensorHistoryError = message.error || null;
      const snapshot = state.snapshots.get(message.deviceId);
      if (snapshot && !message.error) {
        for (const metric of DEVICES.find((device) => device.id === message.deviceId)?.metrics || []) {
          snapshot.trends[metric.key] = (message.trends[metric.key] || []).sort((a, b) => a.time - b.time);
        }
      }
      renderSelectedDevice();
      return;
    }
    if (message.type === "recommendation") {
      state.recommendation = message;
      renderAiRecommendation();
      return;
    }
    if (message.type === "solar-radiation") {
      state.radiation = message;
      renderSiteOverview();
      return;
    }
    if (message.type === "bridge-status") {
      const wasConnected = state.influxConnected;
      state.influxConnected = Boolean(message.connected);
      state.influxConnectionKnown = true;
      if (state.influxConnected && !wasConnected) {
        const bridgeStartedAt = Date.parse(message.startedAt);
        state.influxConnectedAt = Number.isFinite(bridgeStartedAt) ? bridgeStartedAt : Date.now();
      }
      updateDeviceConnectivity();
      state.influxDiagnostic = message.error ? `Query failed (${message.error.code || message.error.name}): ${message.error.message}. Last success: ${message.lastSuccessAt || "none"}` : "";
      if (wasConnected !== state.influxConnected || message.error) scheduleTelemetryRender();
      if (state.influxConnected && !wasConnected) { requestSocketDemandHistory(state.socketDemandRange); requestSensorHistory(); }
      return;
    }
    if (message.type === "demand-history") {
      const range = ["today", "7d", "30d"].includes(message.range) ? message.range : "today";
      state.socketDemandHistoryLoading.delete(range);
      const samples = (message.samples || [])
        .map((sample) => ({ time: Date.parse(sample.time), value: Number(sample.value) }))
        .filter((sample) => Number.isFinite(sample.time) && Number.isFinite(sample.value));
      state.socketDemandHistory.set(range, samples);
      renderSocketDemandChart(state.debugMockData);
      return;
    }
    if (message.type === "control-status") {
      state.socketControlConnected = Boolean(message.connected);
      const status = document.getElementById("socket-control-status");
      if (status && message.readOnly) {
        status.className = "dt-socket-control-status";
        status.textContent = "Read-only view: socket control is available on the local bridge only";
      }
      renderUI();
      return;
    }
    if (message.type === "control-queued") {
      const status = document.getElementById("socket-control-status");
      if (status) {
        status.className = "dt-socket-control-status pending";
        status.textContent = `${message.deviceId} command queued${message.position > 1 ? ` (${message.position})` : ""}`;
      }
      return;
    }
    if (message.type === "control-result") {
      const pending = state.pendingSocketControls.get(message.requestId);
      if (!pending) return;
      const status = document.getElementById("socket-control-status");
      if (!message.ok) {
        state.pendingSocketControls.delete(message.requestId);
        if (status) {
          status.className = "dt-socket-control-status error";
          status.textContent = `${pending.deviceId} control failed: ${message.error || "Unknown error"}`;
        }
        renderUI();
        return;
      }
      pending.phase = "awaiting-telemetry";
      pending.timeoutId = window.setTimeout(() => {
        if (!state.pendingSocketControls.has(message.requestId)) return;
        state.pendingSocketControls.delete(message.requestId);
        const timeoutStatus = document.getElementById("socket-control-status");
        if (timeoutStatus) {
          timeoutStatus.className = "dt-socket-control-status error";
          timeoutStatus.textContent = `${pending.deviceId} did not confirm within ${SOCKET_CONTROL_TIMEOUT_MS / 1000}s`;
        }
        renderUI();
      }, SOCKET_CONTROL_TIMEOUT_MS);
      if (status) {
        status.className = "dt-socket-control-status pending";
        status.textContent = `${pending.deviceId} command sent; waiting for device status`;
      }
      renderUI();
      return;
    }
    if (message.type !== "telemetry") return;
    const device = ensureTelemetryDevice(message);
    const snapshot = device && state.snapshots.get(device.id);
    if (!device || !snapshot) return;
    device.debugOnly = false;
    const telemetryKey = `${device.id}:${message.receivedAt}:${JSON.stringify(message.values)}`;
    if (state.seenTelemetry.has(telemetryKey)) return;
    state.seenTelemetry.add(telemetryKey);
    if (state.seenTelemetry.size > MAX_SEEN_TELEMETRY) {
      state.seenTelemetry.delete(state.seenTelemetry.values().next().value);
    }
    const sampleTime = Date.parse(message.receivedAt);
    if (!Number.isFinite(sampleTime)) return;
    snapshot.metricUpdatedAt ||= {};
    for (const metric of device.metrics) {
      if (message.values?.[metric.key] == null) continue;
      const value = Number(message.values?.[metric.key]);
      if (!Number.isFinite(value)) continue;
      if (sampleTime >= (snapshot.metricUpdatedAt[metric.key] || 0)) {
        snapshot.values[metric.key] = value;
        snapshot.metricUpdatedAt[metric.key] = sampleTime;
      }
      snapshot.trends[metric.key].push({ value, time: sampleTime });
      snapshot.trends[metric.key] = snapshot.trends[metric.key].filter((sample) => sample.time >= Date.now() - Math.max(historyWindowMs(), 86400000)).slice(-2000);
    }
    snapshot.status = sensorStatusFromValues(device, snapshot.values);
    snapshot.updatedAt = new Date(Math.max(state.lastLiveAt.get(device.id) || 0, sampleTime));
    state.liveDevices.add(device.id);
    state.lastLiveAt.set(device.id, snapshot.updatedAt.getTime());
    const socketStatus = Number(message.values?.socketStatus);
    if (Number.isFinite(socketStatus)) {
      const confirmed = [...state.pendingSocketControls.entries()].find(([, pending]) => (
        pending.deviceId === device.id
        && pending.phase === "awaiting-telemetry"
        && snapshot.updatedAt.getTime() > pending.baselineTelemetryAt
        && (socketStatus > 0) === pending.desired
      ));
      if (confirmed) {
        const [requestId, pending] = confirmed;
        window.clearTimeout(pending.timeoutId);
        state.pendingSocketControls.delete(requestId);
        const status = document.getElementById("socket-control-status");
        if (status) {
          status.className = "dt-socket-control-status success";
          status.textContent = `${pending.deviceId} ${pending.desired ? "ON" : "OFF"} confirmed by device`;
        }
      }
    }
    scheduleTelemetryRender();
  });
  socket.addEventListener("close", () => {
    state.influxConnected = false;
    state.influxDiagnostic = "Browser lost the connection to the local data bridge; reconnecting";
    state.influxConnectionKnown = true;
    state.influxSocket = null;
    state.socketControlConnected = false;
    for (const pending of state.pendingSocketControls.values()) window.clearTimeout(pending.timeoutId);
    state.pendingSocketControls.clear();
    updateDeviceConnectivity();
    state.socketDemandHistoryLoading.clear();
    state.sensorHistoryLoading = false;
    renderUI();
    if (!pageClosing) {
      window.clearTimeout(bridgeReconnectTimer);
      bridgeReconnectTimer = window.setTimeout(connectInfluxBridge, Math.min(30000, 1000 * 2 ** bridgeRetryAttempt++) + Math.random() * 500);
    }
  });
  socket.addEventListener("error", () => socket.close());
}

function addGrid() {
  if (gridHelper) {
    scene.remove(gridHelper);
    gridHelper.geometry.dispose();
    gridHelper.material.dispose();
    gridHelper = null;
  }
  const size = state.modelBox.getSize(new THREE.Vector3());
  const gridSize = Math.max(size.x, size.z) * 1.35;
  const divisions = 24;
  const preset = THEME_PRESETS[activeTheme];
  gridHelper = new THREE.GridHelper(gridSize, divisions, preset.gridCenter, preset.gridLine);
  gridHelper.position.set(state.modelCenter.x, state.modelBox.min.y - Math.max(state.modelRadius * 0.006, 0.01), state.modelCenter.z);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = preset.gridOpacity;
  scene.add(gridHelper);
}

async function loadFragmentsModel(model, requestId, modelIndex) {
  await ensureFragments();
  const response = await fetch(model.url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (requestId !== state.loadRequest) return;

  const fragmentsModel = await fragments.load(buffer, {
    modelId: `${model.label}-${requestId}`,
    camera,
    onProgress(event) {
      if (requestId !== state.loadRequest) return;
      const itemPercent = Math.round(event.progress * 100);
      const percent = Math.round(((modelIndex + event.progress) / MODELS.length) * 100);
      showLoading(MODEL, percent, `${model.label} · ${event.stage} · ${itemPercent}%`);
    },
  });
  if (requestId !== state.loadRequest) {
    await fragments.disposeModel(fragmentsModel.modelId);
    return;
  }

  state.fragmentsModels.set(model.id, fragmentsModel);
  modelGroup.add(fragmentsModel.object);
  fragmentsModel.object.visible = state.layerVisibility[model.id] !== false;
  fragmentsModel.useCamera(camera);
  if (model.hiddenCategories?.length) {
    const hiddenItems = await fragmentsModel.getItemsOfCategories(
      model.hiddenCategories.map((category) => new RegExp(`^${category}$`)),
    );
    const hiddenLocalIds = model.hiddenCategories.flatMap((category) => hiddenItems[category] || []);
    if (hiddenLocalIds.length) await fragmentsModel.setVisible(hiddenLocalIds, false);
  }
  return (await fragmentsModel.getGuids()).length;
}

async function finalizeFederatedModel(componentCount) {
  state.fragmentsModel = state.fragmentsModels.get("mep") || state.fragmentsModels.values().next().value;
  state.model = modelGroup;
  state.modelBox.makeEmpty();
  for (const fragmentsModel of state.fragmentsModels.values()) state.modelBox.union(fragmentsModel.box);
  state.modelBox.getCenter(state.modelCenter);
  state.modelRadius = Math.max(state.modelBox.getBoundingSphere(new THREE.Sphere()).radius, 1);
  showLoading(MODEL, 94, t("scannedEquipment"));
  DEVICES = await bindSensorsToIfc([...fallbackSensorDevices(), ...configuredSafetySensors()], state.fragmentsModels.get("sensor"));
  MEP_COMPONENTS = await scanIfcEquipment(state.fragmentsModels.get("mep"), "mep");
  initializeDeviceSnapshots();
  // This socket is in the equipment plan but has no item in the sensor IFC.
  ensureTelemetryDevice({ deviceId: "WS523-01", values: {} });
  const initialDevice = DEVICES.find((device) => device.id.toUpperCase() === requestedSensorId) || DEVICES[0];
  state.selectedDeviceId = initialDevice?.id || null;
  state.selectedItem = initialDevice?.ifc || null;
  addGrid();
  fitCameraToModel(false);
  await fragments.update(true);
  await bindDevices();
  await createOccupancySeats();
  scheduleSensorOcclusionCheck();
  if (initialDevice) {
    await selectDevice(initialDevice.id, Boolean(requestedSensorId));
    if (requestedSensorId) setDevicePanelOpen(true);
  }
  elements.meshCount.textContent = componentCount.toLocaleString(activeLocale());
  elements.loadingProgress.style.width = "100%";
  elements.loadingMeta.textContent = t("modelReady", { count: componentCount.toLocaleString(activeLocale()) });
  elements.loading.classList.add("hidden");
  renderUI();
  connectInfluxBridge();
}

async function loadModel() {
  const model = MODEL;
  const requestId = ++state.loadRequest;
  await clearCurrentModel();
  showLoading(model);
  elements.modelName.textContent = model.name;
  elements.meshCount.textContent = "0";

  try {
    let componentCount = 0;
    for (const [index, layer] of MODELS.entries()) {
      componentCount += await loadFragmentsModel(layer, requestId, index);
      if (requestId !== state.loadRequest) return;
    }
    await finalizeFederatedModel(componentCount);
  } catch (error) {
    if (requestId !== state.loadRequest) return;
    console.error("Fragments loading failed", error);
    showError(t("loadError", { model: model.name }));
    renderUI();
  }
}

async function handleCanvasSelection(event, doubleClick = false) {
  if (!state.model) return;
  if (doubleClick && !state.calibrating) {
    const rect = elements.canvas.getBoundingClientRect();
    const markerRaycaster = new THREE.Raycaster();
    markerRaycaster.setFromCamera(new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    ), camera);
    const markers = [...state.markerObjects.entries()].filter(([, marker]) => marker.label.visible);
    const hit = markerRaycaster.intersectObjects(markers.map(([, marker]) => marker.label))[0];
    const deviceId = hit && markers.find(([, marker]) => marker.label === hit.object)?.[0];
    if (deviceId) {
      await selectDevice(deviceId, true);
      setDevicePanelOpen(true);
      requestAnimationFrame(scrollSelectedSensorIntoList);
      return;
    }
  }
  let result = null;
  let hitModelId = null;
  let hitDistance = Infinity;
  let hitPriority = Infinity;
  for (const [modelId, fragmentsModel] of state.fragmentsModels) {
    if (!fragmentsModel.object.visible) continue;
    if (!state.calibrating && modelId === "archi") continue;
    const candidate = await fragmentsModel.raycast({
      camera,
      mouse: new THREE.Vector2(event.clientX, event.clientY),
      dom: elements.canvas,
    });
    if (candidate && await isNonSelectableIfcItem(fragmentsModel, candidate.localId)) continue;
    const candidateDistance = candidate?.point ? camera.position.distanceToSquared(candidate.point) : Infinity;
    const candidatePriority = modelId === "sensor" ? 0 : 1;
    if (candidate && (!result || candidatePriority < hitPriority || (candidatePriority === hitPriority && candidateDistance < hitDistance))) {
      result = candidate;
      hitModelId = modelId;
      hitDistance = candidateDistance;
      hitPriority = candidatePriority;
    }
  }
  if (!result) return;
  if (state.calibrating) {
    const point = result.point;
    const value = `[${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)}]`;
    elements.coordinateValue.textContent = value;
    elements.coordinateToast.classList.remove("hidden");
    state.calibrating = false;
    elements.calibrateButton.classList.remove("active");
    elements.wrap.classList.remove("is-calibrating");
    return;
  }
  const device = DEVICES.find((item) => item.binding.modelId === hitModelId && state.boundObjects.get(item.id) === result.localId);
  if (device) {
    await selectDevice(device.id, doubleClick);
    setDevicePanelOpen(true);
    requestAnimationFrame(scrollSelectedSensorIntoList);
  } else {
    selectIfcItem(result.localId, hitModelId);
  }
}

function resizeRenderer() {
  const width = elements.wrap.clientWidth;
  const height = elements.wrap.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  labelRenderer.setSize(width, height);
  scheduleSensorMarkerSync(80);
}

elements.retryButton.addEventListener("click", loadModel);
elements.layerToggles.forEach((toggle) => {
  if (toggle.dataset.modelLayer === "sensor") {
    toggle.addEventListener("click", async () => {
      const modes = ["all", "model", "hidden"];
      state.sensorDisplayMode = modes[(modes.indexOf(state.sensorDisplayMode) + 1) % modes.length];
      const modelVisible = state.sensorDisplayMode !== "hidden";
      state.layerVisibility.sensor = modelVisible;
          const fragmentsModel = state.fragmentsModels.get("sensor");
      if (fragmentsModel) fragmentsModel.object.visible = modelVisible;
      for (const marker of state.markerObjects.values()) marker.label.visible = state.sensorDisplayMode === "all" && marker.showStatusLight;
      renderOccupancySeats();

      const modeMeta = {
        all: { icon: "ph-eye", label: "All: sensors, occupancy and online indicators" },
        model: { icon: "ph-cube", label: "Sensor only: occupancy and online indicators hidden" },
        hidden: { icon: "ph-eye-slash", label: "Sensor: hidden" },
      }[state.sensorDisplayMode];
      toggle.dataset.sensorMode = state.sensorDisplayMode;
      toggle.setAttribute("aria-label", modeMeta.label);
      toggle.title = modeMeta.label;
      toggle.querySelector("i").className = `ph ${modeMeta.icon}`;
      toggle.querySelector("span").textContent = { all: "All", model: "Sensor", hidden: "Hidden" }[state.sensorDisplayMode];
      if (fragmentsModel) await fragments.update(true);
      scheduleSensorOcclusionCheck();
      updateSensorProximityTag();
    });
    return;
  }

  toggle.addEventListener("change", async () => {
    state.layerVisibility[toggle.dataset.modelLayer] = toggle.checked;
    const fragmentsModel = state.fragmentsModels.get(toggle.dataset.modelLayer);
    if (fragmentsModel) fragmentsModel.object.visible = toggle.checked;
    toggle.closest("label")?.classList.toggle("is-off", !toggle.checked);
    renderOccupancySeats();
    if (fragmentsModel) await fragments.update(true);
    scheduleSensorOcclusionCheck();
  });
});

function syncSocketMaster() {
  const master = document.getElementById("socket-master");
  const sockets = [...document.querySelectorAll(".dt-socket-grid input[data-socket-device]")];
  const relevantSockets = state.debugMockData
    ? sockets
    : sockets.filter((input) => DEVICES.some((device) => device.id === input.dataset.socketDevice && device.sensorModel === "WS523"));
  master.disabled = state.debugMockData
    ? false
    : !state.socketControlConnected || !relevantSockets.length || state.pendingSocketControls.size > 0;
  master.checked = relevantSockets.length > 0 && relevantSockets.every((input) => input.checked);
  master.indeterminate = relevantSockets.some((input) => input.checked) && !master.checked;
}

function sendSocketControl(input, desired, previous = !desired) {
  const deviceId = input.dataset.socketDevice;
  const socket = state.influxSocket;
  if (!deviceId || !state.socketControlConnected || !socket || socket.readyState !== WebSocket.OPEN) {
    input.checked = previous;
    const status = document.getElementById("socket-control-status");
    if (status) {
      status.className = "dt-socket-control-status error";
      status.textContent = "Socket control service is unavailable";
    }
    syncSocketMaster();
    return;
  }
  const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const snapshot = state.snapshots.get(deviceId);
  state.pendingSocketControls.set(requestId, {
    deviceId,
    desired,
    previous,
    phase: "queued",
    baselineTelemetryAt: snapshot?.updatedAt?.getTime?.() || 0,
    timeoutId: null,
  });
  input.checked = previous;
  input.disabled = true;
  input.classList.add("pending");
  input.setAttribute("aria-busy", "true");
  socket.send(JSON.stringify({ type: "socket-control", requestId, deviceId, action: desired ? "on" : "off" }));
  syncSocketMaster();
}

document.getElementById("socket-master").addEventListener("change", (event) => {
  const desired = event.currentTarget.checked;
  document.querySelectorAll(".dt-socket-grid input[data-socket-device]").forEach((input) => {
    if (input.disabled || input.checked === desired) return;
    const previous = input.checked;
    sendSocketControl(input, desired, previous);
  });
  syncSocketMaster();
});

document.querySelectorAll(".dt-socket-grid input[data-socket-device]").forEach((input) => input.addEventListener("change", (event) => {
  if (state.debugMockData) {
    syncSocketMaster();
    return;
  }
  sendSocketControl(event.currentTarget, event.currentTarget.checked, !event.currentTarget.checked);
}));

document.querySelectorAll("[data-demand-range]").forEach((button) => {
  button.addEventListener("click", () => {
    state.socketDemandRange = button.dataset.demandRange;
    requestSocketDemandHistory(state.socketDemandRange);
    renderSocketDemandChart(state.debugMockData);
  });
});

document.querySelectorAll("[data-alarm-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.alarmFilter = button.dataset.alarmFilter;
    document.querySelectorAll("[data-alarm-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderSiteOverview();
  });
});

document.querySelectorAll(".dt-mode-toggle button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".dt-mode-toggle button").forEach((item) => item.classList.toggle("active", item === button));
  });
});
systemThemeQuery.addEventListener("change", (event) => {
  if (!getStoredTheme()) applyTheme(event.matches ? "dark" : "light");
});
window.addEventListener("storage", (event) => {
  if (event.key === THEME_STORAGE_KEY && (event.newValue === "light" || event.newValue === "dark")) {
    applyTheme(event.newValue);
  }
  if (event.key === "lang" && event.newValue) {
    applyLanguage(event.newValue);
  }
});
function setPlatformView(view) {
  if (view === "ai") {
    window.location.href = "strategy.html";
    return;
  }
  if (view === "bms") return;
  const workspace = elements.wrap.closest(".dt-workspace");
  if (workspace.classList.contains("view-transitioning")) return;
  if (view === "sensors") {
    if (workspace.classList.contains("right-panel-open")) {
      setPlatformView("overview");
      return;
    }
    state.iotOpenedFromOverview = true;
    state.assetView = "sensors";
    elements.assetViewButtons.forEach((button) => { const active = button.dataset.assetView === "sensors"; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
    workspace.classList.remove("alarm-focus");
    workspace.classList.add("right-panel-open");
    elements.overviewRail.setAttribute("aria-hidden", "false");
    const device = DEVICES.find((item) => item.id === state.selectedDeviceId && sensorGroupFor(item).key !== "weather") || DEVICES.find((item) => sensorGroupFor(item).key !== "weather");
    if (device) void selectDevice(device.id, true);
    setDevicePanelOpen(true);
    scheduleSensorMarkerSync(PANEL_TRANSITION_MS + 20);
    return;
  }
  if (view === "alerts" && workspace.classList.contains("alarm-focus")) {
    setPlatformView("overview");
    return;
  }
  const returningFromAlerts = view === "overview" && workspace.classList.contains("alarm-focus")
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (returningFromAlerts) {
    workspace.classList.add("view-transitioning");
    setDashboardPanelsVisible(false);
    setActivePlatformView("overview");
    window.setTimeout(() => {
      workspace.classList.remove("alarm-focus");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setDashboardPanelsVisible(true);
        window.setTimeout(() => workspace.classList.remove("view-transitioning"), PANEL_TRANSITION_MS);
        scheduleSensorMarkerSync(PANEL_TRANSITION_MS + 20);
      }));
    }, PANEL_TRANSITION_MS);
    return;
  }
  const enteringAlertsFromOverview = view === "alerts"
    && document.querySelector('[data-view="overview"]')?.classList.contains("active")
    && !workspace.classList.contains("dashboard-collapsed")
    && !workspace.classList.contains("right-panel-open")
    && !workspace.classList.contains("panel-open")
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (enteringAlertsFromOverview) {
    workspace.classList.add("view-transitioning");
    setDashboardPanelsVisible(false);
    setActivePlatformView("alerts");
    window.setTimeout(() => {
      workspace.classList.add("alarm-focus");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setDashboardPanelsVisible(true);
        window.setTimeout(() => workspace.classList.remove("view-transitioning"), PANEL_TRANSITION_MS);
        document.querySelector(".dt-alert-card")?.scrollIntoView({ block: "nearest" });
        scheduleSensorMarkerSync(PANEL_TRANSITION_MS + 20);
      }));
    }, PANEL_TRANSITION_MS);
    return;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sensorRailOpen = workspace.classList.contains("right-panel-open");
  const overviewVisible = document.querySelector('[data-view="overview"]')?.classList.contains("active")
    && !workspace.classList.contains("dashboard-collapsed");
  if (!reducedMotion && !workspace.classList.contains("panel-open")
    && ((view === "sensors" && overviewVisible && !sensorRailOpen)
      || (view === "overview" && sensorRailOpen)
      || (view === "sensors" && sensorRailOpen && state.iotOpenedFromOverview))) {
    workspace.classList.add("view-transitioning");
    if (!sensorRailOpen) {
      state.iotOpenedFromOverview = true;
      setDashboardPanelsVisible(false);
      setActivePlatformView("sensors");
      window.setTimeout(() => {
        workspace.classList.add("right-panel-open");
        elements.overviewRail.setAttribute("aria-hidden", "false");
        window.setTimeout(() => workspace.classList.remove("view-transitioning"), PANEL_TRANSITION_MS);
        scheduleSensorMarkerSync(PANEL_TRANSITION_MS + 20);
      }, PANEL_TRANSITION_MS);
    } else {
      workspace.classList.remove("right-panel-open");
      elements.overviewRail.setAttribute("aria-hidden", "true");
      setActivePlatformView("overview");
      window.setTimeout(() => {
        setDashboardPanelsVisible(true);
        window.setTimeout(() => workspace.classList.remove("view-transitioning"), PANEL_TRANSITION_MS);
        scheduleSensorMarkerSync(PANEL_TRANSITION_MS + 20);
      }, PANEL_TRANSITION_MS);
    }
    return;
  }
  workspace.classList.toggle("alarm-focus", view === "alerts");
  if (view === "overview") {
    const overviewButton = document.querySelector('[data-view="overview"]');
    const isCurrentView = overviewButton?.classList.contains("active");
    const isCollapsed = workspace.classList.contains("dashboard-collapsed");
    // Returning from IoT must dismiss its right-hand rail before restoring
    // the Overview dashboard; otherwise both layouts remain mounted together.
    const wasSensorRailOpen = workspace.classList.contains("right-panel-open");
    workspace.classList.remove("right-panel-open");
    elements.overviewRail.setAttribute("aria-hidden", "true");
    if (elements.devicePanel.classList.contains("is-open")) {
      setDevicePanelOpen(false);
      setDashboardPanelsVisible(true);
    } else {
      setDashboardPanelsVisible(wasSensorRailOpen || !(isCurrentView && !isCollapsed));
    }
    setActivePlatformView("overview");
  } else if (view === "sensors") {
    const opening = !workspace.classList.contains("right-panel-open");
    if (opening) {
      const overviewButton = document.querySelector('[data-view="overview"]');
      state.iotOpenedFromOverview = Boolean(overviewButton?.classList.contains("active"))
        && !workspace.classList.contains("dashboard-collapsed");
    }
    if (elements.devicePanel.classList.contains("is-open")) setDevicePanelOpen(false);
    workspace.classList.toggle("right-panel-open", opening);
    elements.overviewRail.setAttribute("aria-hidden", String(!opening));
    setDashboardPanelsVisible(opening ? false : state.iotOpenedFromOverview);
    setActivePlatformView(opening ? "sensors" : state.iotOpenedFromOverview ? "overview" : null);
  } else if (view === "alerts") {
    workspace.classList.remove("right-panel-open");
    elements.overviewRail.setAttribute("aria-hidden", "true");
    setDevicePanelOpen(false);
    setDashboardPanelsVisible(true);
    document.querySelector(".dt-alert-card")?.scrollIntoView({ block: "nearest" });
  }
  if (view !== "overview" && view !== "sensors") {
    setActivePlatformView(view);
  }
  scheduleSensorMarkerSync(PANEL_TRANSITION_MS + 20);
}

elements.viewButtons.forEach((button) => button.addEventListener("click", () => setPlatformView(button.dataset.view)));
elements.devicePanelClose.addEventListener("click", () => setDevicePanelOpen(false));
elements.alarmPanelClose.addEventListener("click", () => setPlatformView("overview"));
elements.overviewRailClose.addEventListener("click", () => {
  if (state.iotOpenedFromOverview) {
    setPlatformView("overview");
    return;
  }
  elements.wrap.closest(".dt-workspace").classList.remove("right-panel-open");
  elements.overviewRail.setAttribute("aria-hidden", "true");
  setDevicePanelOpen(false);
  setDashboardPanelsVisible(state.iotOpenedFromOverview);
  setActivePlatformView(state.iotOpenedFromOverview ? "overview" : null);
});
document.querySelector("[data-action='reset']")?.addEventListener("click", () => fitCameraToModel(true));
elements.historyRangeButtons.forEach((button) => button.addEventListener("click", () => {
  state.historyRange = button.dataset.historyRange;
  elements.historyRangeButtons.forEach((item) => item.classList.toggle("active", item === button));
  elements.customHoursControl.classList.remove("active");
  requestSensorHistory();
  renderSelectedDevice();
}));
function applyCustomHours() {
  const value = Math.round(Number(elements.customHoursInput.value));
  state.customHours = Math.max(1, Math.min(720, Number.isFinite(value) ? value : 6));
  elements.customHoursInput.value = String(state.customHours);
  if (state.historyRange === "custom") { requestSensorHistory(); renderSelectedDevice(); }
}
elements.customHoursInput.addEventListener("focus", () => {
  state.historyRange = "custom";
  elements.historyRangeButtons.forEach((item) => item.classList.remove("active"));
  elements.customHoursControl.classList.add("active");
  requestSensorHistory();
  renderSelectedDevice();
});
elements.customHoursInput.addEventListener("change", applyCustomHours);
elements.customHoursInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    applyCustomHours();
    elements.customHoursInput.blur();
  }
});
elements.equipmentSearch.addEventListener("input", () => {
  state.equipmentQuery = elements.equipmentSearch.value;
  renderDeviceList();
});
elements.assetViewButtons.forEach((button) => button.addEventListener("click", () => {
  state.assetView = button.dataset.assetView;
  state.equipmentQuery = "";
  elements.equipmentSearch.value = "";
  elements.assetViewButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
  renderDeviceList();
}));
elements.clock.addEventListener("dblclick", (event) => {
  event.preventDefault();
  state.ahuDemo = false;
  state.debugMockData = !state.debugMockData;
  state.renderedDebugMockData = null;
  try { sessionStorage.setItem(DEBUG_MOCK_STORAGE_KEY, String(state.debugMockData)); } catch { /* Session storage is optional. */ }
  renderUI();
  console.info(`[ZB202 debug] Virtual dashboard data ${state.debugMockData ? "enabled" : "disabled"}.`);
});
document.querySelector(".dt-brand h1").addEventListener("dblclick", (event) => {
  event.preventDefault();
  state.ahuDemo = !state.ahuDemo;
  state.debugMockData = false;
  state.renderedDebugMockData = null;
  try { sessionStorage.setItem(DEBUG_MOCK_STORAGE_KEY, "false"); } catch { /* Session storage is optional. */ }
  renderUI();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.devicePanel.classList.contains("is-open")) setDevicePanelOpen(false);
});
elements.resetViewButton?.addEventListener("click", () => fitCameraToModel(true));
elements.faultToggle.addEventListener("click", () => {
  const snapshot = state.snapshots.get(state.selectedDeviceId);
  if (!snapshot) return;
  setFault(state.selectedDeviceId, snapshot.status !== "fault");
});
elements.calibrateButton?.addEventListener("click", () => {
  state.calibrating = !state.calibrating;
  elements.calibrateButton.classList.toggle("active", state.calibrating);
  elements.wrap.classList.toggle("is-calibrating", state.calibrating);
  elements.coordinateToast.classList.add("hidden");
});
elements.copyCoordinateButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.coordinateValue.textContent);
  elements.copyCoordinateButton.textContent = t("copied");
  window.setTimeout(() => { elements.copyCoordinateButton.textContent = t("copy"); }, 1200);
});
elements.canvas.addEventListener("pointerdown", (event) => {
  pointerDownPosition = { x: event.clientX, y: event.clientY };
});
elements.canvas.addEventListener("pointerup", (event) => {
  if (!pointerDownPosition) return;
  const distance = Math.hypot(event.clientX - pointerDownPosition.x, event.clientY - pointerDownPosition.y);
  pointerDownPosition = null;
  if (distance < 10) handleCanvasSelection(event).catch((error) => console.error("BIM selection failed", error));
});
elements.canvas.addEventListener("pointercancel", () => { pointerDownPosition = null; });
elements.canvas.addEventListener("dblclick", (event) => {
  if (event.button !== 0) return;
  handleCanvasSelection(event, true).catch((error) => console.error("Sensor double-click selection failed", error));
});
controls.addEventListener("change", () => {
  if (state.fragmentsModels.size) fragments.update();
  scheduleSensorMarkerSync(200);
  scheduleSensorOcclusionCheck();
  updateSensorProximityTag();
});
window.addEventListener("beforeunload", () => {
  pageClosing = true;
  visualUpdatePending = false;
  window.clearTimeout(bridgeReconnectTimer);
  window.clearTimeout(telemetryRenderTimer);
  state.influxSocket?.close();
  resizeObserver.disconnect();
  demandChartResizeObserver.disconnect();
  controls.dispose();
  renderer.dispose();
  fragments?.dispose();
});

const resizeObserver = new ResizeObserver(resizeRenderer);
resizeObserver.observe(elements.wrap);
const demandChartResizeObserver = new ResizeObserver(() => renderSocketDemandChart(state.debugMockData));
demandChartResizeObserver.observe(document.querySelector(".dt-demand-chart"));


function animate(now = 0) {
  if (pageClosing) return;
  requestAnimationFrame(animate);
  if (document.hidden) return;
  controls.update();
  // Size in pixels, position in model coordinates; draw lights and geometry together.
  camera.updateMatrixWorld();
  const lightPosition = new THREE.Vector3();
  const viewportHeight = elements.canvas.clientHeight || 1;
  for (const marker of state.markerObjects.values()) {
    if (!marker.label.visible) continue;
    marker.label.getWorldPosition(lightPosition).applyMatrix4(camera.matrixWorldInverse);
    const scale = 16 * 2 * Math.max(-lightPosition.z, camera.near)
      * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / viewportHeight;
    marker.label.scale.set(scale, scale, 1);
  }
  renderer.render(scene, camera);
  // Project status lights using the same camera frame as the model.
  labelRenderer.render(scene, camera);
  resolveMobileMarkerCollisions();
}

applyTheme(activeTheme);
applyLanguage(activeLang);
resizeRenderer();
loadModel();
animate();
updateMockData();
window.setInterval(updateMockData, 2000);
