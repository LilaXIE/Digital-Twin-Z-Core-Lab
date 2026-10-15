import "@phosphor-icons/web/regular";
import { bridgeUrl } from "../shared/bridge-url.js";
import { bridgeKey, forgetBridgeKey } from "../shared/bridge-key.js";

const THEME_STORAGE_KEY = "zb202-theme";
const HISTORY_HOURS = 24;

const I18N = {
  zh: {
    back: "返回三维孪生", eyebrow: "ZB202 · 预测型新风控制", title: "AI 新风推荐",
    recommended: "推荐新风量", estimatedOccupancy: "估计人数", occupancy: "人数", peak60: "未来 60 分钟 CO₂ 峰值", currentCo2: "当前 CO₂",
    co2Chart: "CO₂ 预测：按推荐运行 vs 按现状运行", occupancyChart: "人数时间线", occupancySub: "过去 6 小时估计 + 未来预测；灰色区域为日程中的会议",
    airflowChart: "推荐新风量变化", airflowSub: "过去 24 小时；悬停可查看对应风阀开度", tableView: "数据表",
    energy: "节能估算（相对现状运行）", today: "今日", week: "本周", savedAir: "节省新风量", savedCooling: "节省冷量", savedElectric: "节省电量",
    calendar: "会议日程", calendarSub: "录入会议后，推荐会提前加大新风", meetingTitle: "名称", meetingPlaceholder: "组会", date: "日期", start: "开始", end: "结束", people: "预计人数", add: "添加",
    basis: "推荐依据", internal: "内部：影子模式与控制级别", controlLevel: "控制级别", exitAuto: "退出自动控制",
    l2Note: "L2（BACnet 写入新风阀）需 FMO 授权并配置写入点位后才能启用。",
    connecting: "连接中", connected: "已连接", disconnected: "数据桥接未连接",
    damper: (pct, now) => `风阀 ${pct}% · 现状 ${now}%`, atMax: "新风已达上限",
    forecastPoints: (a, b) => `30 分钟 ${a} ppm · 60 分钟 ${b} ppm`, average8h: (v, h) => `8 小时平均 ${v} ppm${h < 7.5 ? `（已覆盖 ${h} 小时）` : ""}`,
    occupancyNoteMeasured: "工位传感器实测", occupancyNoteEstimated: "根据 CO₂ 变化估计", updated: (time, mode) => `更新于 ${time} · ${mode}`,
    measured: "实测 CO₂", recommendedSeries: "按推荐运行", baselineSeries: "按现状运行", limit: "限值 800", target: "目标 750", now: "现在",
    occupancyHistory: "估计人数", occupancyForecast: "预测人数", recommendedLps: "推荐新风量", baselineLps: "现状新风量",
    co2Sub: (h) => `预测时域 ${h} 分钟；虚线为 800 ppm 限值和 750 ppm 控制目标`, noData: "暂无数据", time: "时间",
    energySub: (o, cop) => `室外条件：${o}；冷站 COP ${cop}`, outdoorSource: { "hko-kings-park": "天文台京士柏", "weather-station": "气象站", assumed: "假设值" },
    noMeetings: "暂无会议", deleteMeeting: "删除会议", saved: "已保存", invalidTime: "结束时间须晚于开始时间", accessKeyPrompt: "输入访问密钥后即可在此页面编辑会议和切换模式。",
    modes: { L0: "仅推荐显示", L1: "影子模式", L2: "自动控制" },
    stats: { commandPct: "影子风阀指令", shadowPpm: "影子 CO₂", shadowExceedances: "影子超标次数", steps: "影子运行步数", guardActivations: "保护触发次数", rmse30: "30 分钟预测误差 RMSE", rmse60: "60 分钟预测误差 RMSE", occupancySource: "人数来源", calibratedAt: "最近标定" },
    sources: { co2: "CO₂ 反推", vs341: "VS341 工位" },
    basisItems: (r) => [
      `控制目标：预测时域内任一时刻 CO₂ ≤ <b>${r.co2.target} ppm</b>，比 ${r.co2.limit} ppm 限值留 ${r.co2.limit - r.co2.target} ppm 余量（传感器与预测误差）。`,
      `最小新风量 = 2.5 L/s·人 × 人数 + 0.3 L/s·m² × 46.6 m²，当前为 <b>${r.airflow.minLps} L/s</b>。`,
      `预测时域 <b>${r.horizonMinutes} 分钟</b>，每 10 分钟滚动重算；日程中有会议时延长到会议结束（最长 180 分钟）。`,
      `在最小值与风阀全开（${r.airflow.maxLps} L/s）之间，求使预测峰值不超过目标的最小新风量：<b>${r.airflow.recommendedLps} L/s</b>（风阀 ${r.airflow.recommendedDamperPct}%）。`,
      `按现状运行（风阀 ${r.airflow.baselineDamperPct}% ≈ ${r.airflow.baselineLps} L/s）时，预测峰值为 <b>${r.co2.peakBaseline} ppm</b>。`,
      `风阀开度与新风量的换算曲线尚待 BMS 数据标定；在此之前新风量和节能数值为估算。`,
    ],
  },
  en: {
    back: "Back to 3D twin", eyebrow: "ZB202 · Predictive outdoor-air control", title: "AI Outdoor-Air Recommendation",
    recommended: "Recommended outdoor air", estimatedOccupancy: "Estimated occupants", occupancy: "Occupants", peak60: "CO₂ peak, next 60 min", currentCo2: "Current CO₂",
    co2Chart: "CO₂ forecast: recommended vs existing operation", occupancyChart: "Occupancy timeline", occupancySub: "Past 6 hours estimated + forecast; grey bands are scheduled meetings",
    airflowChart: "Recommended outdoor air", airflowSub: "Past 24 hours; hover for damper position", tableView: "Table view",
    energy: "Estimated savings vs existing operation", today: "Today", week: "This week", savedAir: "Outdoor air saved", savedCooling: "Cooling saved", savedElectric: "Electricity saved",
    calendar: "Meeting schedule", calendarSub: "Scheduled meetings let the system ventilate in advance", meetingTitle: "Title", meetingPlaceholder: "Group meeting", date: "Date", start: "Start", end: "End", people: "Expected people", add: "Add",
    basis: "Why this recommendation", internal: "Internal: shadow mode and control level", controlLevel: "Control level", exitAuto: "Exit automatic control",
    l2Note: "L2 (BACnet write to the outdoor-air damper) requires FMO authorisation and a configured write point.",
    connecting: "Connecting", connected: "Connected", disconnected: "Data bridge offline",
    damper: (pct, now) => `Damper ${pct}% · now ${now}%`, atMax: "Outdoor air at maximum",
    forecastPoints: (a, b) => `30 min ${a} ppm · 60 min ${b} ppm`, average8h: (v, h) => `8-hour average ${v} ppm${h < 7.5 ? ` (${h} h covered)` : ""}`,
    occupancyNoteMeasured: "Measured by seat sensors", occupancyNoteEstimated: "Estimated from CO₂ changes", updated: (time, mode) => `Updated ${time} · ${mode}`,
    measured: "Measured CO₂", recommendedSeries: "Recommended", baselineSeries: "Existing operation", limit: "Limit 800", target: "Target 750", now: "Now",
    occupancyHistory: "Estimated occupants", occupancyForecast: "Forecast", recommendedLps: "Recommended", baselineLps: "Existing operation",
    co2Sub: (h) => `${h}-minute horizon; dashed lines mark the 800 ppm limit and 750 ppm target`, noData: "No data yet", time: "Time",
    energySub: (o, cop) => `Outdoor conditions: ${o}; plant COP ${cop}`, outdoorSource: { "hko-kings-park": "HKO King's Park", "weather-station": "weather station", assumed: "assumed" },
    noMeetings: "No meetings scheduled", deleteMeeting: "Delete meeting", saved: "Saved", invalidTime: "End time must be after the start time", accessKeyPrompt: "Enter the access key to edit meetings and switch modes from this page.",
    modes: { L0: "Recommendation only", L1: "Shadow mode", L2: "Automatic control" },
    stats: { commandPct: "Shadow damper command", shadowPpm: "Shadow CO₂", shadowExceedances: "Shadow exceedances", steps: "Shadow steps", guardActivations: "Guard activations", rmse30: "30-min forecast RMSE", rmse60: "60-min forecast RMSE", occupancySource: "Occupancy source", calibratedAt: "Last calibration" },
    sources: { co2: "CO₂-implied", vs341: "VS341 seats" },
    basisItems: (r) => [
      `Target: CO₂ at or below <b>${r.co2.target} ppm</b> at every point of the horizon, ${r.co2.limit - r.co2.target} ppm below the ${r.co2.limit} ppm limit to cover sensor and forecast error.`,
      `Minimum outdoor air = 2.5 L/s per person + 0.3 L/s·m² × 46.6 m², currently <b>${r.airflow.minLps} L/s</b>.`,
      `<b>${r.horizonMinutes}-minute</b> horizon, recalculated every 10 minutes; extended to the end of a scheduled meeting (up to 180 minutes).`,
      `The least airflow between the minimum and a fully open damper (${r.airflow.maxLps} L/s) that keeps the forecast peak at target: <b>${r.airflow.recommendedLps} L/s</b> (damper ${r.airflow.recommendedDamperPct}%).`,
      `Under existing operation (damper ${r.airflow.baselineDamperPct}% ≈ ${r.airflow.baselineLps} L/s) the forecast peak is <b>${r.co2.peakBaseline} ppm</b>.`,
      `The damper-to-airflow curve awaits calibration with BMS data; airflow and savings figures are estimates until then.`,
    ],
  },
};
I18N["zh-Hant"] = {
  ...I18N.zh,
  back: "返回三維孿生", eyebrow: "ZB202 · 預測型新風控制", title: "AI 新風推薦", recommended: "推薦新風量", estimatedOccupancy: "估計人數", occupancy: "人數",
  peak60: "未來 60 分鐘 CO₂ 峰值", co2Chart: "CO₂ 預測：按推薦運行 vs 按現狀運行", occupancyChart: "人數時間線", occupancySub: "過去 6 小時估計 + 未來預測；灰色區域為日程中的會議",
  airflowChart: "推薦新風量變化", airflowSub: "過去 24 小時；懸停可查看對應風閥開度", tableView: "數據表", energy: "節能估算（相對現狀運行）", today: "今日", week: "本週",
  savedAir: "節省新風量", savedCooling: "節省冷量", savedElectric: "節省電量", calendar: "會議日程", calendarSub: "錄入會議後，推薦會提前加大新風", meetingTitle: "名稱",
  meetingPlaceholder: "組會", date: "日期", people: "預計人數", basis: "推薦依據", internal: "內部：影子模式與控制級別", controlLevel: "控制級別", exitAuto: "退出自動控制",
  l2Note: "L2（BACnet 寫入新風閥）需 FMO 授權並配置寫入點位後才能啟用。", connecting: "連接中", connected: "已連接", disconnected: "數據橋接未連接",
  noMeetings: "暫無會議", deleteMeeting: "刪除會議", saved: "已保存", invalidTime: "結束時間須晚於開始時間", accessKeyPrompt: "輸入訪問密鑰後即可在此頁面編輯會議和切換模式。", noData: "暫無數據",
};

const query = (id) => document.getElementById(id);
let lang = (() => {
  try { const value = localStorage.getItem("lang"); return I18N[value] ? value : "zh"; } catch { return "zh"; }
})();
const t = (key) => I18N[lang][key] ?? I18N.en[key];
const state = { recommendation: null, history: [], room: [], meetings: [], socket: null, connection: "connecting", retry: 0, pending: new Map(), writeProtected: false };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

const clock = (tMs) => new Date(tMs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" });
const dateTime = (tMs) => new Date(tMs).toLocaleString(lang === "en" ? "en-GB" : lang === "zh-Hant" ? "zh-HK" : "zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" });
const number = (value, digits = 0) => (Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—");

// ---------- Theme and language ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  query("theme-toggle").innerHTML = `<i class="ph ${theme === "dark" ? "ph-sun" : "ph-moon-stars"}" aria-hidden="true"></i>`;
  render();
}
query("theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Optional. */ }
  applyTheme(next);
});

function applyLanguage(next) {
  lang = I18N[next] ? next : "zh";
  try { localStorage.setItem("lang", lang); } catch { /* Optional. */ }
  query("lang-select").value = lang;
  document.documentElement.lang = lang === "en" ? "en" : lang === "zh-Hant" ? "zh-Hant" : "zh-CN";
  document.title = `ZB202 ${t("title")}`;
  document.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach((element) => element.setAttribute("aria-label", t(element.dataset.i18nAria)));
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  render();
}
query("lang-select").addEventListener("change", (event) => applyLanguage(event.target.value));

// ---------- Line chart ----------
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const tooltip = query("tooltip");

// spec: { series: [{ label, color, points: [{ t, v }], dashed, format }], refs: [{ v, label, color }], bands: [{ from, to, label }],
//         xMin, xMax, yMin, yMax, nowT, unit, extraTooltip(t) }
function lineChart(container, spec) {
  const width = Math.max(280, container.clientWidth);
  const height = container.clientHeight;
  const margin = { top: 12, right: 112, bottom: 24, left: 44 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const all = spec.series.flatMap((series) => series.points);
  if (!all.length) {
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}"><text class="empty" x="${width / 2}" y="${height / 2}" text-anchor="middle">${escapeHtml(t("noData"))}</text></svg>`;
    return;
  }
  const xMin = spec.xMin ?? Math.min(...all.map((point) => point.t));
  const xMax = spec.xMax ?? Math.max(...all.map((point) => point.t));
  const values = [...all.map((point) => point.v), ...(spec.refs || []).map((ref) => ref.v)];
  let yMin = spec.yMin ?? Math.min(...values);
  let yMax = spec.yMax ?? Math.max(...values);
  const step = niceStep((yMax - yMin) / 4 || 1);
  yMin = Math.floor(yMin / step) * step;
  yMax = Math.ceil(yMax / step) * step;
  if (yMax === yMin) yMax = yMin + step;
  const x = (tMs) => margin.left + (tMs - xMin) / (xMax - xMin || 1) * plotW;
  const y = (value) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * plotH;

  const ticksY = [];
  for (let value = yMin; value <= yMax + 1e-9; value += step) ticksY.push(value);
  const hourMs = 3600000;
  const spanHours = (xMax - xMin) / hourMs;
  const xStep = spanHours > 12 ? 4 * hourMs : spanHours > 5 ? hourMs : 30 * 60000;
  const ticksX = [];
  for (let tick = Math.ceil(xMin / xStep) * xStep; tick <= xMax; tick += xStep) ticksX.push(tick);

  const path = (points) => points.map((point, index) => `${index ? "L" : "M"}${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`).join("");
  const parts = [];
  for (const band of spec.bands || []) {
    const from = Math.max(xMin, band.from);
    const to = Math.min(xMax, band.to);
    if (to <= from) continue;
    parts.push(`<rect class="band" x="${x(from)}" y="${margin.top}" width="${x(to) - x(from)}" height="${plotH}"></rect><text class="band-label" x="${x(from) + 4}" y="${margin.top + 12}">${escapeHtml(band.label)}</text>`);
  }
  parts.push(`<g class="grid">${ticksY.map((value) => `<line x1="${margin.left}" x2="${margin.left + plotW}" y1="${y(value)}" y2="${y(value)}"></line>`).join("")}</g>`);
  parts.push(`<g class="axis">${ticksY.map((value) => `<text x="${margin.left - 6}" y="${y(value) + 4}" text-anchor="end">${number(value, step < 1 ? 1 : 0)}</text>`).join("")}${ticksX.map((tick) => `<text x="${x(tick)}" y="${height - 6}" text-anchor="middle">${clock(tick)}</text>`).join("")}</g>`);
  for (const ref of spec.refs || []) {
    if (ref.v < yMin || ref.v > yMax) continue;
    parts.push(`<line class="ref" x1="${margin.left}" x2="${margin.left + plotW}" y1="${y(ref.v)}" y2="${y(ref.v)}" stroke="${ref.color}"></line><text class="ref-label" x="${margin.left + plotW + 4}" y="${y(ref.v) + 4}" fill="${ref.color}">${escapeHtml(ref.label)}</text>`);
  }
  if (spec.nowT && spec.nowT >= xMin && spec.nowT <= xMax) {
    parts.push(`<line class="now" x1="${x(spec.nowT)}" x2="${x(spec.nowT)}" y1="${margin.top}" y2="${margin.top + plotH}"></line><text class="band-label" x="${x(spec.nowT) + 3}" y="${margin.top + plotH - 4}">${escapeHtml(t("now"))}</text>`);
  }
  const labelYs = [];
  for (const series of spec.series) {
    if (!series.points.length) continue;
    parts.push(`<path class="line${series.dashed ? " dashed" : ""}" d="${path(series.points)}" stroke="${series.color}"></path>`);
    if (series.directLabel) {
      const last = series.points.at(-1);
      let labelY = y(last.v) + 4;
      while (labelYs.some((used) => Math.abs(used - labelY) < 12)) labelY += 12;
      labelYs.push(labelY);
      if (x(last.t) > margin.left + plotW - 2) parts.push(`<text class="direct-label" x="${x(last.t) + 6}" y="${labelY}">${escapeHtml(series.directLabel)}</text>`);
    }
  }
  parts.push(`<line class="crosshair" x1="0" x2="0" y1="${margin.top}" y2="${margin.top + plotH}" visibility="hidden"></line><g class="dots"></g>`);
  parts.push(`<rect class="hit" x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}" fill="transparent" tabindex="0"></rect>`);
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(spec.label || "")}">${parts.join("")}</svg>`;

  const svg = container.querySelector("svg");
  const crosshair = svg.querySelector(".crosshair");
  const dots = svg.querySelector(".dots");
  const times = [...new Set(all.map((point) => point.t))].sort((a, b) => a - b);
  const show = (clientX, clientY) => {
    const box = svg.getBoundingClientRect();
    const tAt = xMin + ((clientX - box.left) * (width / box.width) - margin.left) / plotW * (xMax - xMin);
    const nearest = times.reduce((best, time) => (Math.abs(time - tAt) < Math.abs(best - tAt) ? time : best), times[0]);
    const tolerance = (xMax - xMin) / 40;
    crosshair.setAttribute("x1", x(nearest));
    crosshair.setAttribute("x2", x(nearest));
    crosshair.setAttribute("visibility", "visible");
    tooltip.replaceChildren();
    const heading = document.createElement("time");
    heading.textContent = dateTime(nearest);
    tooltip.append(heading);
    dots.innerHTML = "";
    for (const series of spec.series) {
      const point = series.points.reduce((best, item) => (!best || Math.abs(item.t - nearest) < Math.abs(best.t - nearest) ? item : best), null);
      if (!point || Math.abs(point.t - nearest) > tolerance) continue;
      dots.insertAdjacentHTML("beforeend", `<circle class="dot" cx="${x(point.t)}" cy="${y(point.v)}" r="4" fill="${series.color}"></circle>`);
      const row = document.createElement("div");
      const key = document.createElement("i");
      key.style.color = series.color;
      const value = document.createElement("b");
      value.textContent = series.format ? series.format(point) : `${number(point.v)} ${spec.unit || ""}`;
      const label = document.createElement("span");
      label.textContent = series.label;
      row.append(key, value, label);
      tooltip.append(row);
    }
    tooltip.hidden = false;
    const tipBox = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.min(window.innerWidth - tipBox.width - 8, clientX + 14)}px`;
    tooltip.style.top = `${Math.max(8, clientY - tipBox.height - 10)}px`;
  };
  const hide = () => { tooltip.hidden = true; crosshair.setAttribute("visibility", "hidden"); dots.innerHTML = ""; };
  const hit = svg.querySelector(".hit");
  hit.addEventListener("pointermove", (event) => show(event.clientX, event.clientY));
  hit.addEventListener("pointerleave", hide);
  hit.addEventListener("focus", () => { const box = svg.getBoundingClientRect(); show(box.left + box.width * 0.8, box.top + 20); });
  hit.addEventListener("blur", hide);
}

function niceStep(raw) {
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= raw) ?? 10 * power;
}

function legend(element, items) {
  element.replaceChildren(...items.map((item) => {
    const li = document.createElement("li");
    const key = document.createElement("i");
    key.style.color = item.color;
    if (item.dashed) key.className = "dashed";
    li.append(key, document.createTextNode(item.label));
    return li;
  }));
}

function table(element, headers, rows) {
  const tableElement = document.createElement("table");
  const head = tableElement.createTHead().insertRow();
  headers.forEach((header) => { const th = document.createElement("th"); th.textContent = header; head.append(th); });
  const body = tableElement.createTBody();
  rows.forEach((cells) => { const row = body.insertRow(); cells.forEach((cell) => { row.insertCell().textContent = cell; }); });
  element.replaceChildren(tableElement);
}

// ---------- Rendering ----------
function render() {
  renderSummary();
  renderCo2Chart();
  renderOccupancyChart();
  renderAirflowChart();
  renderEnergy();
  renderMeetings();
  renderBasis();
  renderInternal();
}

function renderSummary() {
  const rec = state.recommendation;
  const connection = query("connection");
  connection.dataset.state = state.connection;
  connection.textContent = t(state.connection === "open" ? "connected" : state.connection === "closed" ? "disconnected" : "connecting");
  const reason = query("reason");
  if (!rec || rec.status === "no-data") {
    ["tile-airflow", "tile-occupancy", "tile-peak", "tile-co2"].forEach((id) => { query(id).textContent = "—"; });
    ["tile-damper", "tile-occupancy-note", "tile-forecast-points", "tile-average"].forEach((id) => { query(id).textContent = "—"; });
    reason.textContent = rec ? (lang === "en" ? rec.reasonEn : rec.reason) : t("noData");
    reason.classList.toggle("is-warning", Boolean(rec));
    return;
  }
  query("tile-airflow").innerHTML = `${escapeHtml(rec.airflow.recommendedLps)}<small>L/s</small>`;
  query("tile-damper").textContent = rec.airflow.atMax ? `${t("damper")(rec.airflow.recommendedDamperPct, rec.airflow.baselineDamperPct)} · ${t("atMax")}` : t("damper")(rec.airflow.recommendedDamperPct, rec.airflow.baselineDamperPct);
  query("tile-occupancy-label").textContent = rec.occupancy.measured ? t("occupancy") : t("estimatedOccupancy");
  query("tile-occupancy").textContent = rec.occupancy.current;
  query("tile-occupancy-note").textContent = rec.occupancy.measured ? t("occupancyNoteMeasured") : t("occupancyNoteEstimated");
  query("tile-peak").innerHTML = `${escapeHtml(rec.co2.peakRecommended)}<small>ppm</small>`;
  query("tile-forecast-points").textContent = t("forecastPoints")(rec.co2.at30.recommended, rec.co2.at60.recommended);
  query("tile-co2").innerHTML = `${escapeHtml(rec.co2.current)}<small>ppm</small>`;
  query("tile-average").textContent = rec.co2.average8h === null ? "—" : t("average8h")(rec.co2.average8h, rec.co2.average8hCoverageHours);
  reason.textContent = `${lang === "en" ? rec.reasonEn : rec.reason} · ${t("updated")(clock(Date.parse(rec.generatedAt)), t("modes")[rec.controlMode] || rec.controlMode)}`;
  reason.classList.toggle("is-warning", rec.status === "at-max");
}

function seriesColor(slot) { return cssVar(`--st-series-${slot}`); }

function renderCo2Chart() {
  const rec = state.recommendation;
  const container = query("co2-chart");
  const nowT = rec?.generatedAt ? Date.parse(rec.generatedAt) : Date.now();
  const measured = state.room.map((point) => ({ t: Date.parse(point.t), v: point.ppm })).filter((point) => point.t >= nowT - 3 * 3600000);
  const valid = rec && rec.status !== "no-data";
  const toPoints = (items) => (items || []).map((item) => ({ t: Date.parse(item.t), v: item.ppm }));
  const series = [
    { label: t("measured"), color: seriesColor(3), points: measured, directLabel: null },
    { label: t("recommendedSeries"), color: seriesColor(1), points: valid ? toPoints(rec.co2.forecastRecommended) : [], directLabel: t("recommendedSeries") },
    { label: t("baselineSeries"), color: seriesColor(2), points: valid ? toPoints(rec.co2.forecastBaseline) : [], dashed: true, directLabel: t("baselineSeries") },
  ];
  legend(query("co2-legend"), series.map((item) => ({ label: item.label, color: item.color, dashed: item.dashed })));
  query("co2-sub").textContent = valid ? t("co2Sub")(rec.horizonMinutes) : "—";
  const horizonEnd = valid ? nowT + rec.horizonMinutes * 60000 : nowT + 3600000;
  lineChart(container, {
    label: t("co2Chart"), unit: "ppm", series, nowT, xMin: nowT - 3 * 3600000, xMax: horizonEnd,
    refs: [{ v: 800, label: t("limit"), color: cssVar("--st-critical") }, { v: 750, label: t("target"), color: cssVar("--st-text-muted") }],
    bands: meetingBands(),
  });
  const rows = valid ? rec.co2.forecastRecommended.map((item, index) => [dateTime(Date.parse(item.t)), item.ppm, rec.co2.forecastBaseline[index]?.ppm ?? "—"]) : [];
  table(query("co2-table"), [t("time"), `${t("recommendedSeries")} (ppm)`, `${t("baselineSeries")} (ppm)`], rows);
}

function meetingBands() {
  return state.meetings.map((meeting) => ({ from: Date.parse(meeting.start), to: Date.parse(meeting.end), label: `${meeting.title || t("calendar")} · ${meeting.people}` }));
}

function renderOccupancyChart() {
  const rec = state.recommendation;
  const nowT = rec?.generatedAt ? Date.parse(rec.generatedAt) : Date.now();
  const history = state.history.filter((entry) => Date.parse(entry.t) >= nowT - 6 * 3600000).map((entry) => ({ t: Date.parse(entry.t), v: entry.occupancy }));
  const forecast = rec?.occupancy?.forecast?.map((item) => ({ t: Date.parse(item.t), v: item.n })) || [];
  const color = seriesColor(1);
  const series = [
    { label: t("occupancyHistory"), color, points: history, format: (point) => number(point.v, 1) },
    { label: t("occupancyForecast"), color, points: forecast, dashed: true, format: (point) => number(point.v, 1), directLabel: t("occupancyForecast") },
  ];
  legend(query("occupancy-legend"), series.map((item) => ({ label: item.label, color: item.color, dashed: item.dashed })));
  const xMax = forecast.length ? forecast.at(-1).t : nowT + 3600000;
  lineChart(query("occupancy-chart"), { label: t("occupancyChart"), series, nowT, xMin: nowT - 6 * 3600000, xMax, yMin: 0, yMax: Math.max(4, ...history.map((p) => p.v), ...forecast.map((p) => p.v)), bands: meetingBands() });
  table(query("occupancy-table"), [t("time"), t("occupancyHistory")], [...history, ...forecast].map((point) => [dateTime(point.t), number(point.v, 1)]));
}

function renderAirflowChart() {
  const entries = state.history;
  const recommended = entries.map((entry) => ({ t: Date.parse(entry.t), v: entry.recommendedLps, damper: entry.damperPct }));
  const baseline = entries.map((entry) => ({ t: Date.parse(entry.t), v: entry.baselineLps }));
  const series = [
    { label: t("recommendedLps"), color: seriesColor(1), points: recommended, format: (point) => `${number(point.v)} L/s · ${point.damper}%`, directLabel: t("recommendedLps") },
    { label: t("baselineLps"), color: seriesColor(2), points: baseline, dashed: true, format: (point) => `${number(point.v)} L/s`, directLabel: t("baselineLps") },
  ];
  legend(query("airflow-legend"), series.map((item) => ({ label: item.label, color: item.color, dashed: item.dashed })));
  const nowT = Date.now();
  lineChart(query("airflow-chart"), { label: t("airflowChart"), unit: "L/s", series, xMin: nowT - HISTORY_HOURS * 3600000, xMax: nowT, yMin: 0 });
  table(query("airflow-table"), [t("time"), `${t("recommendedLps")} (L/s)`, "%", `${t("baselineLps")} (L/s)`], entries.map((entry) => [dateTime(Date.parse(entry.t)), entry.recommendedLps, entry.damperPct, entry.baselineLps]));
}

function renderEnergy() {
  const energy = state.recommendation?.energy;
  const set = (id, value, unit, digits = 0) => { query(id).textContent = energy && Number.isFinite(value) ? `${number(value, digits)} ${unit}` : "—"; };
  set("energy-air-today", energy?.savedTodayM3, "m³");
  set("energy-air-week", energy?.savedWeekM3, "m³");
  set("energy-cooling-today", energy?.savedTodayKwhCooling, "kWh", 1);
  set("energy-cooling-week", energy?.savedWeekKwhCooling, "kWh", 1);
  set("energy-electric-today", energy?.savedTodayKwhElectric, "kWh", 2);
  set("energy-electric-week", energy?.savedWeekKwhElectric, "kWh", 2);
  query("energy-sub").textContent = energy ? t("energySub")(t("outdoorSource")[energy.outdoorSource] || energy.outdoorSource, energy.plantCop) : "—";
}

function renderMeetings() {
  const list = query("meetings");
  const now = Date.now();
  const upcoming = state.meetings.filter((meeting) => Date.parse(meeting.end) > now - 86400000);
  if (!upcoming.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = t("noMeetings");
    list.replaceChildren(li);
    return;
  }
  list.replaceChildren(...upcoming.map((meeting) => {
    const li = document.createElement("li");
    li.classList.toggle("is-past", Date.parse(meeting.end) <= now);
    const text = document.createElement("span");
    text.textContent = `${dateTime(Date.parse(meeting.start))}–${clock(Date.parse(meeting.end))} · ${meeting.title || t("calendar")} · ${meeting.people} ${lang === "en" ? "people" : "人"}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.title = t("deleteMeeting");
    remove.setAttribute("aria-label", t("deleteMeeting"));
    remove.innerHTML = '<i class="ph ph-trash" aria-hidden="true"></i>';
    remove.addEventListener("click", () => request({ type: "calendar-update", action: "delete", meeting: { id: meeting.id } }, query("calendar-status")));
    li.append(text, remove);
    return li;
  }));
}

function renderBasis() {
  const rec = state.recommendation;
  const list = query("basis");
  if (!rec || rec.status === "no-data") { list.innerHTML = `<li>${escapeHtml(t("noData"))}</li>`; return; }
  // The template text is local; bridge values are coerced to numbers before insertion.
  const n = (value) => Number(value);
  const safe = {
    horizonMinutes: n(rec.horizonMinutes),
    co2: { target: n(rec.co2.target), limit: n(rec.co2.limit), peakBaseline: n(rec.co2.peakBaseline) },
    airflow: { minLps: n(rec.airflow.minLps), maxLps: n(rec.airflow.maxLps), recommendedLps: n(rec.airflow.recommendedLps), recommendedDamperPct: n(rec.airflow.recommendedDamperPct), baselineDamperPct: n(rec.airflow.baselineDamperPct), baselineLps: n(rec.airflow.baselineLps) },
  };
  list.innerHTML = t("basisItems")(safe).map((item) => `<li>${item}</li>`).join("");
}

function renderInternal() {
  const rec = state.recommendation;
  const internal = rec?.internal;
  const stats = query("internal-stats");
  const labels = t("stats");
  const items = internal ? [
    [labels.commandPct, internal.shadow.commandPct === null ? "—" : `${internal.shadow.commandPct}%`],
    [labels.shadowPpm, internal.shadow.ppm === null ? "—" : `${internal.shadow.ppm} ppm`],
    [labels.shadowExceedances, internal.shadow.shadowExceedances],
    [labels.steps, internal.shadow.steps],
    [labels.guardActivations, internal.shadow.guardActivations],
    [labels.rmse30, internal.forecastAccuracy.rmse30 === null ? `— (n=${internal.forecastAccuracy.samples30})` : `${internal.forecastAccuracy.rmse30} ppm (n=${internal.forecastAccuracy.samples30})`],
    [labels.rmse60, internal.forecastAccuracy.rmse60 === null ? `— (n=${internal.forecastAccuracy.samples60})` : `${internal.forecastAccuracy.rmse60} ppm (n=${internal.forecastAccuracy.samples60})`],
    [labels.occupancySource, t("sources")[internal.occupancySource] || internal.occupancySource],
    [labels.calibratedAt, internal.calibratedAt ? dateTime(Date.parse(internal.calibratedAt)) : "—"],
  ] : [];
  stats.replaceChildren(...items.map(([label, value]) => {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    wrapper.append(dt, dd);
    return wrapper;
  }));
  const mode = rec?.controlMode;
  document.querySelectorAll(".st-segmented button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
    button.title = t("modes")[button.dataset.mode];
    button.disabled = state.connection !== "open" || (button.dataset.mode === "L2" && !internal?.l2Available);
  });
  query("exit-auto").disabled = mode !== "L2";
}

// ---------- Bridge ----------
// Commands that change meetings or the control mode need the access key on a protected bridge.
const WRITE_TYPES = new Set(["calendar-update", "control-mode-request"]);

async function request(message, statusElement) {
  let key = "";
  if (WRITE_TYPES.has(message.type)) {
    key = await bridgeKey(state.writeProtected, t("accessKeyPrompt"));
    if (key === null) return;
  }
  const socket = state.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    if (statusElement) { statusElement.textContent = t("disconnected"); statusElement.classList.add("is-error"); }
    return;
  }
  const requestId = `${message.type}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  if (statusElement) state.pending.set(requestId, statusElement);
  socket.send(JSON.stringify({ ...message, requestId, ...(key ? { key } : {}) }));
}

function settle(message) {
  const element = state.pending.get(message.requestId);
  if (!element) return;
  state.pending.delete(message.requestId);
  if (message.keyRejected) forgetBridgeKey();
  element.textContent = message.ok ? t("saved") : message.error || "Error";
  element.classList.toggle("is-error", !message.ok);
}

function connect() {
  const socket = new WebSocket(bridgeUrl());
  state.socket = socket;
  socket.addEventListener("open", () => {
    state.retry = 0;
    state.connection = "open";
    request({ type: "recommendation-history-request", hours: HISTORY_HOURS });
    renderSummary();
    renderInternal();
  });
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (!message || typeof message !== "object") return;
    if (message.type === "recommendation") {
      state.recommendation = message;
      if (Array.isArray(message.calendar)) state.meetings = message.calendar;
      request({ type: "recommendation-history-request", hours: HISTORY_HOURS });
      render();
    } else if (message.type === "recommendation-history") {
      state.history = (message.entries || []).filter((entry) => Number.isFinite(Date.parse(entry.t)));
      state.room = (message.room || []).filter((point) => Number.isFinite(Date.parse(point.t)) && Number.isFinite(point.ppm));
      renderCo2Chart();
      renderOccupancyChart();
      renderAirflowChart();
    } else if (message.type === "calendar") {
      state.meetings = message.meetings || [];
      renderMeetings();
      renderCo2Chart();
      renderOccupancyChart();
    } else if (message.type === "control-status") {
      state.writeProtected = Boolean(message.writeProtected);
    } else if (message.type === "calendar-result" || message.type === "control-mode-result") {
      settle(message);
    }
  });
  socket.addEventListener("close", () => {
    state.connection = "closed";
    renderSummary();
    renderInternal();
    const delay = Math.min(30000, 1000 * 2 ** state.retry) * (0.75 + Math.random() * 0.5);
    state.retry += 1;
    setTimeout(connect, delay);
  });
}

// ---------- Forms ----------
const form = query("calendar-form");
{
  const now = new Date(Date.now() + 8 * 3600000);
  form.date.value = now.toISOString().slice(0, 10);
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const status = query("calendar-status");
  const start = new Date(`${form.date.value}T${form.start.value}:00+08:00`);
  const end = new Date(`${form.date.value}T${form.end.value}:00+08:00`);
  if (!(end > start)) { status.textContent = t("invalidTime"); status.classList.add("is-error"); return; }
  request({ type: "calendar-update", action: "upsert", meeting: { title: form.title.value.trim(), start: start.toISOString(), end: end.toISOString(), people: Number(form.people.value) } }, status);
});
document.querySelectorAll(".st-segmented button").forEach((button) => {
  button.addEventListener("click", () => request({ type: "control-mode-request", mode: button.dataset.mode }, query("control-status")));
});
query("exit-auto").addEventListener("click", () => request({ type: "control-mode-request", mode: "L1" }, query("control-status")));

let resizeFrame = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { renderCo2Chart(); renderOccupancyChart(); renderAirflowChart(); });
}).observe(document.body);

applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
applyLanguage(lang);
connect();
