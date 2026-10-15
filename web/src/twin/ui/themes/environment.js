// Environment theme (section 5.2).
import { t, formatNumber, clockTime } from "../../i18n.js";
import { ui, settings, setFocusMetric, on } from "../../state.js";
import { data, provider } from "../../data/store.js";
import { roomMetric, metricStatus, occupancyInfo, recommendationState, roomSeries, sensorReading, isSuspect } from "../../data/derived.js";
import { registry } from "../../data/devices.js";
import { SITE, thresholds } from "../../config/site.js";
import { startReplay } from "../../data/replay.js";
import { lineChart, legend, cssVar } from "../charts/timeline.js";
import { escapeHtml, icon, term } from "../dom.js";
import { compassText } from "../format.js";

const METRICS = [
  { key: "co2", unit: "ppm", digits: 0, icon: "ph-atom", glossary: "co2" },
  { key: "temperature", unit: "°C", digits: 1, icon: "ph-thermometer-simple" },
  { key: "humidity", unit: "%", digits: 0, icon: "ph-drop", glossary: "humidity" },
  { key: "pm25", unit: "µg/m³", digits: 0, icon: "ph-circles-three", glossary: "pm25" },
  { key: "noise", unit: "dB(A)", digits: 0, icon: "ph-waveform", glossary: "dba" },
];
const RANGES = [["1h", 1], ["12h", 12], ["24h", 24]];
let body = null;
let range = { key: "24h", hours: 24 };
let requestedHistory = 0;

const available = () => METRICS.filter((metric) => roomMetric(metric.key).value !== null);

function historyPoints(metricKey, hours) {
  const now = ui.replay ? ui.replay.stop : Date.now();
  const cutoff = now - hours * 3600000;
  if (["co2", "temperature", "humidity"].includes(metricKey)) {
    const history = data().roomHistory;
    const points = roomSeries(history, metricKey).filter((p) => p.t >= cutoff);
    if (points.length) return points;
  }
  // PM2.5 and noise come from single sensors: use the readings received since the page opened.
  const ids = metricKey === "pm25" ? ["AM308-01"] : metricKey === "noise" ? registry.devices.filter((d) => d.model === "WS302").map((d) => d.id) : SITE.envSensors;
  const field = metricKey === "noise" ? "noiseLaeq" : metricKey;
  const merged = new Map();
  for (const id of ids) for (const sample of data().snapshots.get(id)?.trends[field] || []) {
    if (sample.time < cutoff) continue;
    const bucket = Math.round(sample.time / 600000) * 600000;
    merged.set(bucket, [...(merged.get(bucket) || []), sample.value]);
  }
  return [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([time, values]) => ({ t: time, v: values.reduce((s, v) => s + v, 0) / values.length }));
}

function ensureHistory() {
  const dataset = data();
  const needed = Math.min(48, Math.max(24, range.hours));
  const fresh = dataset.roomHistory && Date.now() - dataset.roomHistory.stop < 11 * 60000 && dataset.roomHistory.hours >= needed;
  if (!fresh && !dataset.roomHistoryLoading && Date.now() - requestedHistory > 20000) {
    requestedHistory = Date.now();
    void provider().requestRoomHistory(needed, 10);
  }
}

export function mount(element) {
  body = element;
  body.innerHTML = `
    <section class="tw-section" data-part="switch"></section>
    <section class="tw-section">
      <h3><span data-part="timeline-title"></span><button type="button" class="tw-button tw-button-small" data-action="replay">${icon("ph-play")}<span>${escapeHtml(t("replay"))}</span></button></h3>
      <div class="tw-ranges" role="group" aria-label="${escapeHtml(t("rangeAria"))}" data-part="ranges"></div>
      <div class="tw-chart" data-part="timeline" style="margin-top:10px"></div>
      <div data-part="legend"></div>
      <p class="tw-caption" data-part="timeline-note"></p>
    </section>
    <section class="tw-section"><h3>${escapeHtml(t("indoor"))}</h3><div class="tw-rows" data-part="indoor"></div></section>
    <section class="tw-section" data-part="outdoor-section"><h3>${escapeHtml(t("outdoor"))}<small>${escapeHtml(t("outdoorSource"))}</small></h3><div class="tw-rows" data-part="outdoor"></div></section>
    <section class="tw-section" data-part="trends-section"><h3>${escapeHtml(t("trends"))}</h3><div data-part="trends"></div></section>`;
  body.querySelector('[data-action="replay"]').addEventListener("click", () => void startReplay());
  ensureHistory();
  update();
}

export function unmount() { body = null; }

function renderSwitch() {
  const host = body.querySelector('[data-part="switch"]');
  const metrics = available();
  const html = `<div class="tw-seg tw-metric-switch" role="group" aria-label="${escapeHtml(t("metricSwitch"))}">${metrics.map((metric) => `<button type="button" data-metric="${metric.key}" aria-pressed="${ui.focusMetric === metric.key}">${escapeHtml(t(metric.key === "temperature" ? "tempShort" : metric.key))}</button>`).join("")}</div>`;
  if (host.dataset.html !== html) {
    host.dataset.html = html;
    host.innerHTML = html;
    host.querySelectorAll("[data-metric]").forEach((button) => button.addEventListener("click", () => setFocusMetric(button.dataset.metric)));
  }
}

function renderRanges() {
  const host = body.querySelector('[data-part="ranges"]');
  if (!host.dataset.built) {
    host.dataset.built = "1";
    host.innerHTML = `<div class="tw-seg">${RANGES.map(([key]) => `<button type="button" data-range="${key}">${key}</button>`).join("")}</div>
      <label class="tw-custom-hours"><span>${escapeHtml(t("custom"))}</span><input type="number" min="1" max="48" step="1" inputmode="numeric" placeholder="…" aria-label="${escapeHtml(t("custom"))}"><span>${escapeHtml(t("hours"))}</span></label>`;
    host.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
      const [key, hours] = RANGES.find(([k]) => k === button.dataset.range);
      range = { key, hours };
      ensureHistory();
      update();
    }));
    const input = host.querySelector("input");
    input.addEventListener("change", () => {
      const hours = Math.max(1, Math.min(48, Math.round(Number(input.value)) || 6));
      range = { key: "custom", hours };
      input.value = String(hours);
      ensureHistory();
      update();
    });
  }
  host.querySelectorAll("[data-range]").forEach((button) => button.setAttribute("aria-pressed", String(range.key === button.dataset.range)));
}

function renderTimeline() {
  const metric = METRICS.find((m) => m.key === ui.focusMetric) || METRICS[0];
  body.querySelector('[data-part="timeline-title"]').innerHTML = escapeHtml(t("timeline", { metric: t(metric.key) }));
  const hours = ui.replay ? 24 : range.hours;
  const history = historyPoints(metric.key, hours);
  const { rec, stale, valid } = recommendationState();
  const nowT = ui.replay ? null : Date.now();
  const forecast = metric.key === "co2" && valid && !stale && !ui.replay
    ? (rec.co2.forecastRecommended || []).map((p) => ({ t: Date.parse(p.t), v: p.ppm })) : [];
  const series = [
    { label: t("measured"), color: cssVar("--series-1"), points: history.map((p) => ({ t: p.t, v: p.v })), area: true, gapMs: 25 * 60000, digits: metric.digits },
    ...(forecast.length ? [{ label: t("forecast"), color: cssVar("--series-2"), points: forecast, dashed: true, directLabel: t("forecast"), digits: 0 }] : []),
  ];
  const refs = [];
  if (metric.key === "co2") refs.push({ v: thresholds.co2.goodBelow, label: t("limitLine", { v: thresholds.co2.goodBelow }), color: cssVar("--poor"), include: false });
  if (metric.key === "temperature" || metric.key === "humidity") thresholds[metric.key].comfort.forEach((v) => refs.push({ v, label: `${v}${metric.unit === "%" ? "%" : "°"}`, color: cssVar("--text-3"), include: false }));
  const end = ui.replay ? ui.replay.stop : forecast.length ? forecast.at(-1).t : Date.now();
  const start = (ui.replay ? ui.replay.stop : Date.now()) - hours * 3600000;
  const container = body.querySelector('[data-part="timeline"]');
  const dataset = data();
  if (!history.length && dataset.roomHistoryLoading) container.innerHTML = '<div class="tw-skeleton" style="height:100%"></div>';
  else lineChart(container, { label: t("timeline", { metric: t(metric.key) }), unit: metric.unit, series, refs, nowT, xMin: start, xMax: end, cursorT: ui.replay?.t, minSpan: metric.key === "co2" ? 80 : metric.key === "temperature" ? 1 : 4 });
  body.querySelector('[data-part="legend"]').innerHTML = series.length > 1 ? legend(series.map((s) => ({ label: s.label, color: s.color, dashed: s.dashed }))) : "";
  const note = body.querySelector('[data-part="timeline-note"]');
  note.textContent = dataset.roomHistoryError && !history.length ? t("historyFailed") : "";
  body.querySelector('[data-action="replay"]').hidden = Boolean(ui.replay) || !["co2", "temperature", "humidity"].includes(metric.key);
}

function row(iconName, label, html, stale = false) {
  return `<div class="tw-row${stale ? " is-stale" : ""}"><span>${icon(iconName)}${label}</span><strong>${html}</strong></div>`;
}

function renderIndoor() {
  const rows = [];
  for (const metric of METRICS) {
    const value = roomMetric(metric.key);
    if (value.value === null) { if (settings.internal) rows.push(row(metric.icon, escapeHtml(t(metric.key)), `<span class="tw-unit">${escapeHtml(t("notConnected"))}</span>`)); continue; }
    const status = metricStatus(metric.key, value.value);
    const label = metric.glossary ? term(metric.glossary, t(metric.key)) : escapeHtml(t(metric.key));
    rows.push(row(metric.icon, `${label}${status ? ` <span class="tw-dot" data-level="${value.stale ? "stale" : status.level}"></span>` : ""}`,
      `<span class="tw-num">${formatNumber(value.value, metric.digits)}</span><span class="tw-unit">${metric.unit}</span>`, value.stale));
  }
  const occupancy = occupancyInfo();
  if (occupancy) rows.push(row("ph-users-three", occupancy.measured ? escapeHtml(t("occupancy")) : term("estimated", t("occupancyEstimated")), `<span class="tw-num">${occupancy.count}</span>`));
  body.querySelector('[data-part="indoor"]').innerHTML = rows.join("");
}

function renderOutdoor() {
  const dataset = data();
  const outdoor = dataset.outdoor || {};
  const radiation = dataset.radiation;
  const rows = [];
  if (Number.isFinite(outdoor.temperature)) rows.push(row("ph-thermometer-simple", escapeHtml(t("dryBulb")), `<span class="tw-num">${formatNumber(outdoor.temperature, 1)}</span><span class="tw-unit">°C</span>`));
  if (Number.isFinite(outdoor.humidity)) rows.push(row("ph-drop", term("humidity", t("relHumidity")), `<span class="tw-num">${formatNumber(outdoor.humidity, 0)}</span><span class="tw-unit">%</span>`));
  if (Number.isFinite(outdoor.windSpeed)) {
    const direction = Number.isFinite(outdoor.windDirection) ? `<i class="ph ph-arrow-up" style="display:inline-block;transform:rotate(${outdoor.windDirection + 180}deg)" aria-hidden="true"></i> ` : "";
    const text = Number.isFinite(outdoor.windDirection) ? t("windText", { dir: compassText(outdoor.windDirection), speed: formatNumber(outdoor.windSpeed, 1) }) : `${formatNumber(outdoor.windSpeed, 1)} m/s`;
    rows.push(row("ph-wind", escapeHtml(t("wind")), `${direction}${escapeHtml(text)}`));
  }
  // Solar radiation older than 30 minutes counts as missing (as before).
  const radiationValue = ui.replay ? ui.replay.solar : radiation && Date.now() - Date.parse(radiation.receivedAt) <= SITE.solarStaleAfterMs ? radiation.value : null;
  if (Number.isFinite(radiationValue)) rows.push(row("ph-sun", term("solar", t("solar")), `<span class="tw-num">${Math.round(radiationValue)}</span><span class="tw-unit">W/m²</span>`));
  body.querySelector('[data-part="outdoor"]').innerHTML = rows.join("");
  body.querySelector('[data-part="outdoor-section"]').hidden = !rows.length;
}

function renderTrends() {
  const others = ["temperature", "humidity", "co2"].filter((key) => key !== ui.focusMetric).slice(0, 2);
  const host = body.querySelector('[data-part="trends"]');
  if (host.dataset.keys !== others.join()) {
    host.dataset.keys = others.join();
    host.innerHTML = others.map((key) => `<div class="tw-chart-head"><span class="tw-caption" style="margin:0">${escapeHtml(t(key))}</span></div><div class="tw-chart is-small" data-trend="${key}"></div>`).join("");
  }
  const hours = ui.replay ? 24 : range.hours;
  const start = (ui.replay ? ui.replay.stop : Date.now()) - hours * 3600000;
  let any = false;
  for (const key of others) {
    const metric = METRICS.find((m) => m.key === key);
    const points = historyPoints(key, hours);
    any ||= points.length > 0;
    lineChart(host.querySelector(`[data-trend="${key}"]`), { label: t(key), unit: metric.unit, series: [{ label: t(key), color: cssVar("--series-3"), points, gapMs: 25 * 60000, digits: metric.digits }], xMin: start, xMax: ui.replay ? ui.replay.stop : Date.now(), cursorT: ui.replay?.t, rightMargin: 10, minSpan: key === "co2" ? 80 : key === "temperature" ? 1 : 4 });
  }
  body.querySelector('[data-part="trends-section"]').hidden = !any;
}

export function update() {
  if (!body) return;
  if (!available().some((m) => m.key === ui.focusMetric) && available().length) setFocusMetric(available()[0].key);
  renderSwitch();
  renderRanges();
  renderTimeline();
  renderIndoor();
  renderOutdoor();
  renderTrends();
}

// Readout label for an environment sensor marker in this theme.
export function markerReadout(deviceId) {
  const metric = METRICS.find((m) => m.key === ui.focusMetric) || METRICS[0];
  const field = metric.key === "noise" ? "noiseLaeq" : metric.key;
  const reading = sensorReading(deviceId, field);
  if (reading.value === null) return null;
  return { text: formatNumber(reading.value, metric.digits), unit: metric.unit, status: metricStatus(metric.key, reading.value), stale: reading.stale, suspect: metric.key === "co2" && isSuspect(deviceId) };
}

on("focus-metric", () => update());
export const titleKey = "envTitle";
export { clockTime };
