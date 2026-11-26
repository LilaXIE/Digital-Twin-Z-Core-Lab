// Environment theme (section 5.2). One metric at a time drives the whole panel (and the floor rings):
// indoor against outdoor now, both over time on one chart, how the chosen range went, where each sensor
// sits, and finally every indoor and outdoor reading at a glance (pressing one charts it).
import { t, formatNumber, clockTime } from "../../i18n.js";
import { ui, settings, setFocusMetric, select, on } from "../../state.js";
import { data, provider } from "../../data/store.js";
import { roomMetric, metricStatus, occupancyInfo, recommendationState, roomSeries, sensorReading, isSuspect } from "../../data/derived.js";
import { registry } from "../../data/devices.js";
import { outdoorHistory } from "../../data/outdoor-history.js";
import { SITE, thresholds } from "../../config/site.js";
import { startReplay } from "../../data/replay.js";
import { sceneState, hoverOutline } from "../../scene/index.js";
import { lineChart, legend, cssVar } from "../charts/timeline.js";
import { escapeHtml, icon, term, toast } from "../dom.js";
import { exportRoomCsv } from "../export.js";
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
const focused = () => METRICS.find((m) => m.key === ui.focusMetric) || METRICS[0];
const unitText = (metric) => (metric.unit === "°C" ? "°" : ` ${metric.unit}`);
const sensorIds = (key) => (key === "pm25" ? ["AM308-01"] : key === "noise" ? registry.devices.filter((d) => d.model === "WS302").map((d) => d.id) : SITE.envSensors);
const sensorField = (key) => (key === "noise" ? "noiseLaeq" : key);

function historyPoints(metricKey, hours) {
  const now = ui.replay ? ui.replay.stop : Date.now();
  const cutoff = now - hours * 3600000;
  if (["co2", "temperature", "humidity"].includes(metricKey)) {
    const history = data().roomHistory;
    const points = roomSeries(history, metricKey).filter((p) => p.t >= cutoff);
    if (points.length) return points;
  }
  // PM2.5 and noise come from single sensors: use the readings received since the page opened.
  const field = sensorField(metricKey);
  const merged = new Map();
  for (const id of sensorIds(metricKey)) for (const sample of data().snapshots.get(id)?.trends[field] || []) {
    if (sample.time < cutoff) continue;
    const bucket = Math.round(sample.time / 600000) * 600000;
    merged.set(bucket, [...(merged.get(bucket) || []), sample.value]);
  }
  return [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([time, values]) => ({ t: time, v: values.reduce((s, v) => s + v, 0) / values.length }));
}

// The outdoor side of a metric: { value, label, note, points, baseline } or null when there is none.
// Temperature and humidity: HKO King's Park now, Open-Meteo hourly for the curve. CO₂: the outdoor
// baseline calibrated from night-time readings. PM2.5: the CAMS estimate. Noise: nothing outside.
function outdoorFor(key, hours) {
  const dataset = data();
  const now = ui.replay ? ui.replay.stop : Date.now();
  const from = now - hours * 3600000;
  // The points inside the range, with the curve carried to the range's left edge (interpolated from
  // the sample before it), so even a 1-hour range shows the outdoor line across the chart.
  const recent = (all) => {
    const inside = all.filter((p) => p.t >= from && p.t <= now);
    const before = all.filter((p) => p.t < from).at(-1);
    const next = inside[0] || all.find((p) => p.t > now);
    if (before && next) inside.unshift({ t: from, v: before.v + ((next.v - before.v) * (from - before.t)) / Math.max(1, next.t - before.t) });
    else if (before) inside.unshift({ t: from, v: before.v });
    return inside;
  };
  if (key === "temperature" || key === "humidity") {
    const live = dataset.outdoor?.[key];
    const points = dataset.kind === "demo" ? [] : recent(outdoorHistory(key));
    if (Number.isFinite(live) && !ui.replay) points.push({ t: Date.parse(dataset.outdoor.receivedAt) || now, v: live });
    const value = ui.replay ? points.at(-1)?.v ?? null : Number.isFinite(live) ? live : points.at(-1)?.v ?? null;
    if (value === null) return null;
    return { value, label: t("stationShort"), note: "", points };
  }
  if (key === "co2") {
    const ppm = dataset.calibration?.outdoorPpm ?? dataset.sensorHealth?.outdoorPpm;
    // Outdoor CO₂ is steady at the calibrated baseline: drawn as the outdoor line across the range.
    return Number.isFinite(ppm) ? { value: ppm, label: t("outdoorBaseline"), note: t("outdoorBaselineNote"), points: [{ t: from, v: ppm }, { t: now, v: ppm }], baseline: true } : null;
  }
  if (key === "pm25" && dataset.kind !== "demo") {
    const points = recent(outdoorHistory("pm25"));
    return points.length ? { value: points.at(-1).v, label: t("outdoorShort"), note: t("outdoorModel"), points } : null;
  }
  return null;
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
    <section class="tw-section tw-env-now">
      <div class="tw-env-compare" data-part="compare"></div>
      <p class="tw-env-sentence" data-part="sentence"></p>
      <p class="tw-halo-legend" data-part="halo-legend"></p>
    </section>
    <section class="tw-section">
      <h3><span data-part="timeline-title"></span><span class="tw-h3-actions"><button type="button" class="tw-button tw-button-small" data-action="csv" title="${escapeHtml(t("exportCsvHint"))}">${icon("ph-download-simple")}<span>CSV</span></button><button type="button" class="tw-button tw-button-small" data-action="replay">${icon("ph-play")}<span>${escapeHtml(t("replay"))}</span></button></span></h3>
      <div class="tw-ranges" role="group" aria-label="${escapeHtml(t("rangeAria"))}" data-part="ranges"></div>
      <div class="tw-chart" data-part="timeline" style="margin-top:10px"></div>
      <div data-part="legend"></div>
      <div class="tw-env-stats" data-part="stats"></div>
      <p class="tw-caption" data-part="timeline-note"></p>
    </section>
    <section class="tw-section" data-part="spots-section"><h3>${escapeHtml(t("spotsTitle"))}<small>${escapeHtml(t("spotsHint"))}</small></h3><div class="tw-env-spots" data-part="spots"></div></section>
    <section class="tw-section"><h3>${escapeHtml(t("indoor"))}<small>${escapeHtml(t("allReadingsHint"))}</small></h3><div class="tw-rows" data-part="indoor"></div></section>
    <section class="tw-section" data-part="outdoor-section"><h3>${escapeHtml(t("outdoor"))}<small>${escapeHtml(t("outdoorSource"))}</small></h3><div class="tw-rows" data-part="outdoor"></div></section>`;
  body.querySelector('[data-action="replay"]').addEventListener("click", () => void startReplay());
  body.querySelector('[data-action="csv"]').addEventListener("click", () => { if (!exportRoomCsv()) toast(t("loading"), { icon: "ph-hourglass" }); });
  // Rows and sensors are redrawn with the data, so their clicks and hovers are delegated here.
  body.addEventListener("click", (event) => {
    const metricRow = event.target.closest("[data-chart-metric]");
    if (metricRow) { setFocusMetric(metricRow.dataset.chartMetric); body.querySelector('[data-part="switch"]').scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const spot = event.target.closest("[data-spot]");
    if (spot) select({ kind: "sensor", id: spot.dataset.spot });
  });
  body.addEventListener("pointerover", (event) => { const spot = event.target.closest("[data-spot]"); if (spot) hoverOutline(sceneState.deviceItems.get(spot.dataset.spot) || null); });
  body.addEventListener("pointerout", (event) => { if (event.target.closest("[data-spot]") && !event.relatedTarget?.closest?.("[data-spot]")) hoverOutline(null); });
  ensureHistory();
  update();
}

export function unmount() { hoverOutline(null); body = null; }

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

// Indoor now beside outdoor now, the difference between them, and one sentence that reads it.
function renderCompare() {
  const metric = focused();
  const indoor = roomMetric(metric.key);
  const status = metricStatus(metric.key, indoor.value);
  const outside = outdoorFor(metric.key, ui.replay ? 24 : range.hours);
  const number = (value) => `<span class="tw-num">${formatNumber(value, metric.digits)}</span><span class="tw-unit">${escapeHtml(metric.unit)}</span>`;
  const indoorHtml = `<div class="tw-env-side${indoor.stale ? " is-stale" : ""}">
      <small>${escapeHtml(t("indoorShort"))}</small>
      <strong>${indoor.value === null ? "—" : number(indoor.value)}</strong>
      <span class="tw-env-status">${status ? `<i class="tw-dot" data-level="${indoor.stale ? "stale" : status.level}"></i>${escapeHtml(t(indoor.stale ? "stale" : status.word))}` : ""}</span></div>`;
  const outdoorHtml = outside ? `<div class="tw-env-side is-outdoor">
      <small>${escapeHtml(`${t("outdoorShort")} · ${outside.label}`)}</small>
      <strong>${number(outside.value)}</strong>
      <span class="tw-env-status">${escapeHtml(outside.note)}</span></div>`
    : `<div class="tw-env-side is-outdoor is-empty"><small>${escapeHtml(t("outdoorShort"))}</small><strong>—</strong><span class="tw-env-status">${escapeHtml(t("noOutdoorCounterpart"))}</span></div>`;
  let delta = "";
  let sentence = "";
  if (outside && indoor.value !== null) {
    const diff = indoor.value - outside.value;
    const close = Math.abs(diff) < (metric.key === "temperature" ? 0.5 : metric.key === "co2" ? 20 : 2);
    const amount = `${formatNumber(Math.abs(diff), metric.digits)}${unitText(metric)}`;
    delta = `<span class="tw-env-delta" data-sign="${close ? 0 : Math.sign(diff)}">${close ? "≈" : `${diff > 0 ? "+" : "−"}${escapeHtml(amount)}`}</span>`;
    sentence = metric.key === "co2" && !close && diff > 0 ? t("co2AboveOutdoor", { v: amount }) : t(close ? "indoorSimilar" : diff > 0 ? "indoorHigher" : "indoorLower", { v: amount });
  }
  body.querySelector('[data-part="compare"]').innerHTML = indoorHtml + `<span class="tw-env-vs" aria-hidden="true">${delta || "vs"}</span>` + outdoorHtml;
  const line = body.querySelector('[data-part="sentence"]');
  line.textContent = sentence;
  line.hidden = !sentence;
}

// What the coloured rings on the floor mean for the metric shown (section B4).
function renderHaloLegend() {
  const host = body.querySelector('[data-part="halo-legend"]');
  const key = ui.focusMetric;
  const c = thresholds[key];
  let items = null;
  if (key === "co2") items = [["good", `< ${c.goodBelow}`], ["caution", `${c.goodBelow}–${c.poorAbove}`], ["poor", `> ${c.poorAbove}`]];
  else if (key === "temperature" || key === "humidity") items = [["good", `${c.comfort[0]}–${c.comfort[1]}`], ["caution", `${c.caution[0]}–${c.caution[1]}`], ["poor", t("haloOutside")]];
  else if (key === "pm25") items = [["good", `≤ ${c.goodAtMost}`], ["caution", `${c.goodAtMost}–${c.poorAbove}`], ["poor", `> ${c.poorAbove}`]];
  host.hidden = !items;
  if (!items) return;
  const unit = { co2: "ppm", temperature: "°C", humidity: "%", pm25: "µg/m³" }[key];
  host.innerHTML = `<span>${escapeHtml(t("haloLegend"))}</span>${items.map(([level, text]) => `<span><i class="tw-dot" data-level="${level}"></i>${escapeHtml(text)}</span>`).join("")}<span class="tw-unit">${escapeHtml(unit)}</span>`;
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

// Whether a value counts as good (CO₂, PM2.5) or comfortable (temperature, humidity); null for noise.
function inBand(key, value) {
  const c = thresholds[key];
  if (key === "co2") return value < c.goodBelow;
  if (key === "pm25") return value <= c.goodAtMost;
  if (key === "temperature" || key === "humidity") return value >= c.comfort[0] && value <= c.comfort[1];
  return null;
}

function renderTimeline() {
  const metric = focused();
  const hours = ui.replay ? 24 : range.hours;
  const history = historyPoints(metric.key, hours);
  const outside = outdoorFor(metric.key, hours);
  body.querySelector('[data-part="timeline-title"]').textContent = outside ? t("compareTimeline", { metric: t(metric.key) }) : t("timeline", { metric: t(metric.key) });
  const { rec, stale, valid } = recommendationState();
  const nowT = ui.replay ? null : Date.now();
  const forecast = metric.key === "co2" && valid && !stale && !ui.replay
    ? (rec.co2.forecastRecommended || []).map((p) => ({ t: Date.parse(p.t), v: p.ppm })) : [];
  const series = [
    { label: t("indoorShort"), color: cssVar("--series-1"), points: history.map((p) => ({ t: p.t, v: p.v })), area: true, gapMs: 25 * 60000, digits: metric.digits },
    ...(outside?.points.length ? [{ label: outside.baseline ? `${t("outdoorShort")} · ${t("outdoorBaseline")}` : t("outdoorCurve"), color: cssVar("--series-3"), points: outside.points, gapMs: 2.5 * 3600000, digits: metric.digits, directLabel: `${t("outdoorShort")}${outside.baseline ? ` ${Math.round(outside.value)}` : ""}` }] : []),
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
  else lineChart(container, { label: body.querySelector('[data-part="timeline-title"]').textContent, unit: metric.unit, series, refs, nowT, xMin: start, xMax: end, cursorT: ui.replay?.t, minSpan: metric.key === "co2" ? 80 : metric.key === "temperature" ? 1 : 4 });
  body.querySelector('[data-part="legend"]').innerHTML = series.length > 1 ? legend(series.map((s) => ({ label: s.label, color: s.color, dashed: s.dashed }))) : "";
  const note = body.querySelector('[data-part="timeline-note"]');
  note.textContent = dataset.roomHistoryError && !history.length ? t("historyFailed") : "";
  body.querySelector('[data-action="replay"]').hidden = Boolean(ui.replay) || !["co2", "temperature", "humidity"].includes(metric.key);
  renderStats(metric, history, hours);
}

// How the chosen range went indoors: average, low and high (with when), and the share of time in band.
function renderStats(metric, history, hours) {
  const host = body.querySelector('[data-part="stats"]');
  const values = history.filter((p) => Number.isFinite(p.v));
  host.hidden = values.length < 3;
  if (host.hidden) return;
  const low = values.reduce((a, b) => (b.v < a.v ? b : a));
  const high = values.reduce((a, b) => (b.v > a.v ? b : a));
  const average = values.reduce((sum, p) => sum + p.v, 0) / values.length;
  const banded = values.map((p) => inBand(metric.key, p.v)).filter((value) => value !== null);
  const share = banded.length ? Math.round((banded.filter(Boolean).length / banded.length) * 100) : null;
  const tile = (label, value, caption = "", level = "") => `<div class="tw-env-stat"${level ? ` data-level="${level}"` : ""}><small>${escapeHtml(label)}</small><strong>${value}</strong><span>${escapeHtml(caption)}</span></div>`;
  const number = (v) => `<span class="tw-num">${formatNumber(v, metric.digits)}</span><span class="tw-unit">${escapeHtml(metric.unit)}</span>`;
  host.innerHTML = [
    tile(t("statAvg"), number(average), t("statRange", { h: hours })),
    tile(t("statMin"), number(low.v), clockTime(low.t)),
    tile(t("statMax"), number(high.v), clockTime(high.t)),
    share === null ? "" : tile(t(metric.key === "temperature" || metric.key === "humidity" ? "statComfortTime" : "statGoodTime"), `<span class="tw-num">${share}</span><span class="tw-unit">%</span>`, "", share >= 90 ? "good" : share >= 60 ? "caution" : "poor"),
  ].join("");
}

// Each sensor's reading on one shared scale, over the good / comfort band: where in the room it is
// stuffier, warmer or more humid. Hovering outlines the sensor in the model; clicking opens it.
function renderSpots() {
  const metric = focused();
  const readings = sensorIds(metric.key).map((id) => ({ id, ...sensorReading(id, sensorField(metric.key)) })).filter((r) => r.value !== null);
  const section = body.querySelector('[data-part="spots-section"]');
  section.hidden = readings.length < 2;
  if (section.hidden) return;
  const c = thresholds[metric.key] || {};
  const band = metric.key === "co2" ? [null, c.goodBelow] : metric.key === "pm25" ? [null, c.goodAtMost] : c.comfort || null;
  const values = readings.map((r) => r.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (band) { if (band[0] !== null) lo = Math.min(lo, band[0]); if (band[1] !== null) hi = Math.max(hi, band[1]); }
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const at = (v) => `${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`;
  const bandStyle = band ? `left:${band[0] === null ? "0%" : at(band[0])};right:calc(100% - ${band[1] === null ? "100%" : at(band[1])})` : "";
  const room = roomMetric(metric.key).value;
  body.querySelector('[data-part="spots"]').innerHTML = readings.sort((a, b) => b.value - a.value).map((r) => {
    const status = metricStatus(metric.key, r.value);
    const suspect = metric.key === "co2" && isSuspect(r.id);
    return `<button type="button" class="tw-env-spot${ui.selection?.kind === "sensor" && ui.selection.id === r.id ? " is-selected" : ""}${r.stale ? " is-stale" : ""}" data-spot="${r.id}">
      <span class="tw-env-spot-id">${escapeHtml(r.id)}${suspect ? ` <small>${escapeHtml(t("readingSuspect"))}</small>` : ""}</span>
      <span class="tw-env-track" aria-hidden="true">${band ? `<i class="tw-env-band" style="${bandStyle}"></i>` : ""}${room !== null ? `<i class="tw-env-median" style="left:${at(room)}"></i>` : ""}<i class="tw-env-dot" data-level="${r.stale ? "stale" : status?.level || "neutral"}" style="left:${at(r.value)}"></i></span>
      <span class="tw-env-spot-value"><span class="tw-num">${formatNumber(r.value, metric.digits)}</span><span class="tw-unit">${escapeHtml(metric.unit)}</span></span>
    </button>`;
  }).join("") + spotsAxis(lo, hi, metric) + `<p class="tw-caption tw-env-spots-key"><i class="tw-env-key-band"></i>${escapeHtml(t(metric.key === "temperature" || metric.key === "humidity" ? "spotsComfortBand" : "spotsGoodBand"))}<i class="tw-env-key-median"></i>${escapeHtml(t("spotsRoomValue"))}</p>`;
}

// The shared value axis under the sensor rows: round ticks across the scale, and the unit.
function spotsAxis(lo, hi, metric) {
  const raw = (hi - lo) / 4;
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * power).find((c) => c >= raw) ?? 10 * power;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
  const at = (v) => `${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`;
  const digits = step < 1 ? 1 : 0;
  return `<div class="tw-env-spot tw-env-axis" aria-hidden="true"><span></span>
    <span class="tw-env-axis-track">${ticks.map((v) => `<i style="left:${at(v)}"></i><b style="left:${at(v)}">${formatNumber(v, digits)}</b>`).join("")}</span>
    <span class="tw-unit">${escapeHtml(metric.unit)}</span></div>`;
}

function row(iconName, label, html, { stale = false, chart = null, spark = "" } = {}) {
  const tag = chart ? "button" : "div";
  return `<${tag} ${chart ? `type="button" data-chart-metric="${chart}" aria-pressed="${ui.focusMetric === chart}" ` : ""}class="tw-row${stale ? " is-stale" : ""}${chart ? " is-chartable" : ""}"><span>${icon(iconName)}${label}</span>${spark ? `<span class="tw-row-spark">${spark}</span>` : ""}<strong>${html}</strong></${tag}>`;
}

// Every indoor reading; pressing one makes it the panel's metric.
function renderIndoor() {
  const rows = [];
  for (const metric of METRICS) {
    const value = roomMetric(metric.key);
    if (value.value === null) { if (settings.internal) rows.push(row(metric.icon, escapeHtml(t(metric.key)), `<span class="tw-unit">${escapeHtml(t("notConnected"))}</span>`)); continue; }
    const status = metricStatus(metric.key, value.value);
    const label = metric.glossary ? term(metric.glossary, t(metric.key)) : escapeHtml(t(metric.key));
    rows.push(row(metric.icon, `${label}${status ? ` <span class="tw-dot" data-level="${value.stale ? "stale" : status.level}"></span>` : ""}`,
      `<span class="tw-num">${formatNumber(value.value, metric.digits)}</span><span class="tw-unit">${metric.unit}</span>`,
      { stale: value.stale, chart: metric.key }));
  }
  const occupancy = occupancyInfo();
  if (occupancy) {
    // Say where the number comes from: the seat sensors reporting now, or the CO₂ estimate, and when.
    const source = occupancy.measured && occupancy.seats ? t("seatsReporting", { n: occupancy.seats, total: occupancy.totalSeats }) : t(occupancy.measured ? "occupancyMeasuredNote" : "occupancyEstimatedNote");
    const when = Number.isFinite(occupancy.at) && occupancy.at > 0 ? ` · ${t("updatedAtShort", { time: clockTime(occupancy.at) })}` : "";
    rows.push(row("ph-users-three", `${occupancy.measured ? escapeHtml(t("occupancy")) : term("estimated", t("occupancyEstimated"))}<small class="tw-row-note">${escapeHtml(source + when)}</small>`, `<span class="tw-num">${occupancy.count}</span>`));
  }
  body.querySelector('[data-part="indoor"]').innerHTML = rows.join("");
}

function renderOutdoor() {
  const dataset = data();
  const outdoor = dataset.outdoor || {};
  const radiation = dataset.radiation;
  const rows = [];
  if (Number.isFinite(outdoor.temperature)) rows.push(row("ph-thermometer-simple", escapeHtml(t("dryBulb")), `<span class="tw-num">${formatNumber(outdoor.temperature, 1)}</span><span class="tw-unit">°C</span>`, { chart: "temperature" }));
  if (Number.isFinite(outdoor.humidity)) rows.push(row("ph-drop", term("humidity", t("relHumidity")), `<span class="tw-num">${formatNumber(outdoor.humidity, 0)}</span><span class="tw-unit">%</span>`, { chart: "humidity" }));
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

export function update() {
  if (!body) return;
  if (!available().some((m) => m.key === ui.focusMetric) && available().length) setFocusMetric(available()[0].key);
  renderSwitch();
  renderCompare();
  renderHaloLegend();
  renderRanges();
  renderTimeline();
  renderSpots();
  renderIndoor();
  renderOutdoor();
}

// Readout label for an environment sensor marker in this theme.
export function markerReadout(deviceId) {
  const metric = focused();
  const reading = sensorReading(deviceId, sensorField(metric.key));
  if (reading.value === null) return null;
  return { text: formatNumber(reading.value, metric.digits), unit: metric.unit, status: metricStatus(metric.key, reading.value), stale: reading.stale, suspect: metric.key === "co2" && isSuspect(deviceId) };
}

on("focus-metric", () => update());
on("select", () => { if (body) renderSpots(); });
export const titleKey = "envTitle";
export { clockTime };
