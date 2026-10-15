// Sensor detail (section 10): grows out of the marker, the camera flies to the device and the
// device gets a soft outline. Readings, history with ranges, trends, BIM properties, and the
// fault simulation (demo mode only).
import { t, pick, ago, formatNumber } from "../i18n.js";
import { ui, settings, select, on, emit } from "../state.js";
import { data, provider } from "../data/store.js";
import { deviceById } from "../data/devices.js";
import { deviceStatus, sensorHealth, sensorReading } from "../data/derived.js";
import { sceneState, focusDevice, focusItem, selectOutline, detailsFor, itemByKey } from "../scene/index.js";
import { markerFor } from "../scene/markers.js";
import { planOutline } from "../scene/intro.js";
import { shareUrl, showQr } from "./export.js";
import { lineChart, cssVar } from "./charts/timeline.js";
import { escapeHtml, icon, term, growFrom, shrinkTo } from "./dom.js";
import { valueHtml, metricLabel } from "./format.js";

const sheet = () => document.getElementById("sensor-sheet");
const RANGES = [["1h", 1], ["12h", 12], ["24h", 24]];
let range = { key: "1h", hours: 1 };
let details = null;
let current = null;

function originFor(selection) {
  if (selection?.kind === "sensor") {
    const marker = markerFor(selection.id);
    if (marker?.onScreen) return { left: marker.x - 8, top: marker.y - 8, width: 16, height: 16 };
  }
  return document.querySelector(`[data-device="${selection?.id}"], [data-ifc="${selection?.key}"]`) || null;
}

export async function openSelection(selection) {
  const element = sheet();
  const wasHidden = element.hidden;
  current = selection;
  details = null;
  if (!selection) { await closeSheet(); return; }
  render();
  if (wasHidden) growFrom(element, originFor(selection), { duration: 450 });
  if (selection.kind === "sensor") {
    const item = sceneState.deviceItems.get(selection.id);
    selectOutline(item || null);
    void focusDevice(selection.id);
    provider().requestSensorHistory(selection.id, range.hours);
    if (item) details = await detailsFor(item);
  } else {
    const item = itemByKey(selection.key);
    selectOutline(item || null);
    if (item) { void focusItem(item); details = await detailsFor(item); }
  }
  if (current === selection) render();
}

export async function closeSheet() {
  const element = sheet();
  selectOutline(null);
  const origin = originFor(current);
  current = null;
  await shrinkTo(element, origin);
}

function header(title) { document.getElementById("sheet-title").textContent = title; }

function bimSection() {
  if (!details) return "";
  return `<details class="tw-collapse" ${settings.internal ? "open" : ""}><summary>${escapeHtml(t("bim"))}</summary><div><dl class="tw-props">
    <div><dt>${escapeHtml(t("ifcType"))}</dt><dd>${escapeHtml(details.category)}</dd></div>
    ${details.guid ? `<div><dt>${escapeHtml(t("globalId"))}</dt><dd>${escapeHtml(details.guid)}</dd></div>` : ""}
    <div><dt>${escapeHtml(t("expressId"))}</dt><dd>${escapeHtml(details.localId)}</dd></div>
    ${details.objectType ? `<div><dt>Type</dt><dd>${escapeHtml(details.objectType)}</dd></div>` : ""}
  </dl></div></details>`;
}

// A small floor plan with the sensor's position, so a close-up still says where in the room it is.
function locationMap(deviceId) {
  const lines = planOutline();
  const anchor = sceneState.anchors.get(deviceId);
  if (!lines?.length || !anchor) return "";
  const xs = lines.flatMap(([, x1, , x2]) => [x1, x2]);
  const zs = lines.flatMap(([, , z1, , z2]) => [z1, z2]);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const pad = 0.4;
  const view = `${(minX - pad).toFixed(2)} ${(minZ - pad).toFixed(2)} ${(maxX - minX + 2 * pad).toFixed(2)} ${(maxZ - minZ + 2 * pad).toFixed(2)}`;
  const path = lines.map(([kind, x1, z1, x2, z2]) => `<line class="is-${kind}" x1="${x1.toFixed(2)}" y1="${z1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${z2.toFixed(2)}"/>`).join("");
  return `<figure class="tw-locmap"><svg viewBox="${view}" role="img" aria-label="${escapeHtml(t("locationMap"))}">${path}
    <circle class="tw-locmap-ring" cx="${anchor.x.toFixed(2)}" cy="${anchor.z.toFixed(2)}" r="0.45"/><circle class="tw-locmap-dot" cx="${anchor.x.toFixed(2)}" cy="${anchor.z.toFixed(2)}" r="0.18"/></svg>
    <figcaption>${escapeHtml(t("locationMapCaption"))}</figcaption></figure>`;
}

// CO₂ sensors: raw reading, calibration offset and the health check's verdict.
function qualitySection(device, snapshot) {
  const calibration = data().calibration;
  const offset = calibration?.offsets?.[device.id];
  if (offset === undefined) return "";
  const raw = snapshot?.corrections?.co2?.raw;
  const health = sensorHealth(device.id);
  const reasons = health?.state === "suspect" ? health.reasons.map((reason) => t({ "below-outdoor": "healthBelowOutdoor", flatline: "healthFlatline", deviates: "healthDeviates" }[reason] || reason, { v: calibration.outdoorPpm })) : [];
  const row = (label, value) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;
  return `<section class="tw-section"><h3>${escapeHtml(t("dataQuality"))}</h3>
    ${reasons.length ? `<p class="tw-caption is-warning">${icon("ph-warning")} ${escapeHtml(reasons.join(" · "))} · ${escapeHtml(t("excludedFromRoom"))}</p>` : ""}
    <dl class="tw-props">
      ${Number.isFinite(raw) ? row(t("rawReading"), `${formatNumber(raw, 0)} ppm`) : ""}
      ${row(t("correction"), `${offset > 0 ? "−" : offset < 0 ? "+" : "±"}${formatNumber(Math.abs(offset), 0)} ppm`)}
      ${calibration.calibratedAt ? row(t("calibratedOn"), escapeHtml(new Date(calibration.calibratedAt).toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" }))) : ""}
    </dl></section>`;
}

function render() {
  const body = document.getElementById("sheet-body");
  if (!current) return;
  if (current.kind === "ifc") {
    const item = itemByKey(current.key);
    header(t("componentDetails"));
    body.innerHTML = `<section class="tw-section"><h3>${escapeHtml(item?.name || details?.name || "")}</h3>${bimSection() || '<div class="tw-skeleton" style="height:80px"></div>'}</section>`;
    body.querySelector("details")?.setAttribute("open", "");
    return;
  }
  const device = deviceById(current.id);
  if (!device) return;
  header(pick(device.name));
  const status = deviceStatus(device.id);
  const snapshot = data().snapshots.get(device.id);
  const statusLevel = status === "normal" ? "normal" : status === "fault" ? "fault" : "offline";
  const statusText = ({ normal: t("statusNormal"), fault: t("statusFault"), offline: t("statusOffline"), unavailable: t("statusUnavailable") })[status];
  const metrics = device.metrics.filter((metric) => !(device.model === "WS301" && metric.key === "tamperStatus"));
  const readings = metrics.map((metric) => ({ metric, reading: sensorReading(device.id, metric.key) })).filter(({ reading }) => reading.value !== null || settings.internal);
  const trendMetrics = metrics.filter((metric) => (snapshot?.trends[metric.key] || []).length).filter((metric) => metric.key !== "battery").slice(0, 3);
  const history = data().sensorHistory;
  const loading = history.deviceId === device.id && history.loading;
  body.innerHTML = `
    ${locationMap(device.id)}
    <div class="tw-sheet-status">
      <span class="tw-pill" data-level="${statusLevel}"><span class="tw-dot" data-level="${statusLevel === "normal" ? "good" : statusLevel === "fault" ? "poor" : "offline"}"></span>${escapeHtml(statusText)}</span>
      <span>${escapeHtml(snapshot?.updatedAt ? t("lastRecord", { ago: ago(snapshot.updatedAt) }) : t("noRecord"))}</span>
      <button type="button" class="tw-button tw-button-small" data-action="qr">${icon("ph-qr-code")}<span>${escapeHtml(t("qrCode"))}</span></button>
    </div>
    ${readings.length ? `<div class="tw-metric-grid">${readings.map(({ metric, reading }) => `
      <div class="tw-metric${reading.stale ? " is-stale" : ""}"><span>${icon(metric.icon)}${metric.glossary ? term(metric.glossary, metricLabel(metric)) : escapeHtml(metricLabel(metric))}</span>
      <strong>${reading.value !== null ? valueHtml(metric, reading.value) : `<span class="tw-unit">${escapeHtml(t("notConnected"))}</span>`}</strong></div>`).join("")}</div>` : ""}
    <section class="tw-section">
      <h3>${escapeHtml(t("history"))}</h3>
      <div class="tw-ranges"><div class="tw-seg">${RANGES.map(([key]) => `<button type="button" data-range="${key}" aria-pressed="${range.key === key}">${key}</button>`).join("")}</div>
        <label class="tw-custom-hours"><span>${escapeHtml(t("custom"))}</span><input type="number" min="1" max="720" step="1" inputmode="numeric" value="${range.key === "custom" ? range.hours : ""}" placeholder="…" aria-label="${escapeHtml(t("custom"))}"><span>${escapeHtml(t("hours"))}</span></label></div>
      <p class="tw-caption${history.error && history.deviceId === device.id ? " is-error" : ""}">${escapeHtml(loading ? t("loading") : history.error && history.deviceId === device.id ? t("historyFailed") : t("readingsInRange", { range: range.key === "custom" ? `${range.hours}h` : range.key, count: countInRange(snapshot, metrics[0]) }))}</p>
      ${trendMetrics.map((metric) => `<div class="tw-chart-head" style="margin-top:12px"><span class="tw-caption" style="margin:0">${escapeHtml(metricLabel(metric))}</span></div><div class="tw-chart is-small" data-trend="${metric.key}"></div>`).join("") || (loading ? '<div class="tw-skeleton" style="height:120px;margin-top:12px"></div>' : `<div class="tw-empty">${icon("ph-chart-line")}<span>${escapeHtml(t("noRecords"))}</span></div>`)}
    </section>
    ${data().kind === "live" ? qualitySection(device, snapshot) : ""}
    ${bimSection()}
    ${settings.demo ? `<button type="button" class="tw-button ${data().faults?.has(device.id) ? "" : "tw-button-danger"}" data-action="fault" style="margin-top:14px;width:100%">${icon("ph-warning")}${escapeHtml(t(data().faults?.has(device.id) ? "restoreNormal" : "simulateFault"))}</button>` : ""}`;
  const now = Date.now();
  for (const metric of trendMetrics) {
    const points = (snapshot.trends[metric.key] || []).filter((s) => s.time >= now - range.hours * 3600000).map((s) => ({ t: s.time, v: s.value }));
    lineChart(body.querySelector(`[data-trend="${metric.key}"]`), {
      label: metricLabel(metric), unit: metric.unit, xMin: now - range.hours * 3600000, xMax: now, rightMargin: 10,
      series: [{ label: metricLabel(metric), color: cssVar("--series-1"), points, step: Boolean(metric.binary), area: !metric.binary, digits: metric.digits, format: metric.binary ? (p) => (p.v > 0 ? t("on") : t("off")) : null }],
      yMin: metric.binary ? 0 : undefined, yMax: metric.binary ? 1 : undefined, minSpan: metric.key === "co2" ? 40 : metric.key === "temperature" ? 0.6 : 2,
      tickFormat: metric.binary ? (v) => (v >= 1 ? t("on") : v <= 0 ? t("off") : "") : null,
    });
  }
  body.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
    const [key, hours] = RANGES.find(([k]) => k === button.dataset.range);
    range = { key, hours };
    provider().requestSensorHistory(device.id, hours);
    render();
  }));
  const input = body.querySelector(".tw-custom-hours input");
  input.addEventListener("change", () => {
    range = { key: "custom", hours: Math.max(1, Math.min(720, Math.round(Number(input.value)) || 6)) };
    provider().requestSensorHistory(device.id, range.hours);
    render();
  });
  body.querySelector('[data-action="qr"]').addEventListener("click", (event) => showQr(event.currentTarget, { title: pick(device.name), url: shareUrl(`#sensor=${device.id}`), printable: true }));
  body.querySelector('[data-action="fault"]')?.addEventListener("click", () => {
    const faults = data().faults;
    if (faults.has(device.id)) faults.delete(device.id); else faults.add(device.id);
    emit("data", { kind: "fault", deviceId: device.id });
  });
}

function countInRange(snapshot, metric) {
  if (!metric) return 0;
  const cutoff = Date.now() - range.hours * 3600000;
  return (snapshot?.trends[metric.key] || []).filter((sample) => sample.time >= cutoff).length;
}

export function initSensorSheet() {
  document.getElementById("sheet-close").addEventListener("click", () => select(null));
  on("data", (event) => {
    if (!current || sheet().hidden) return;
    if (document.activeElement?.closest?.("#sheet-body input")) return;
    if (["sensor-history", "fault", "dataset", "sensor-health", "calibration"].includes(event?.kind) || (event?.kind === "telemetry" && (event.deviceId === current.id || event.demo))) render();
  });
  on("settings", () => { if (current) render(); });
}

export const currentSelection = () => current;
export { formatNumber };
