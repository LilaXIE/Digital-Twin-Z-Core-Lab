// Portrait phones (section B7): a plain 2D page instead of "please rotate". It shows the status line,
// the four room values, the AI recommendation, the 24-hour CO₂ curve and today's summary, and does not
// load the 3D model at all (faster on mobile data). Turning the phone sideways opens the 3D twin.
import { t, formatNumber, clockTime, ago } from "../i18n.js";
import { on, ui } from "../state.js";
import { data } from "../data/store.js";
import { roomMetric, metricStatus, occupancyInfo, recommendationState, roomSeries, todaySummary, lastReadingAt, sensorReading, deviceStatus } from "../data/derived.js";
import { deviceById } from "../data/devices.js";
import { pick } from "../i18n.js";
import { valueHtml, metricLabel } from "./format.js";
import { thresholds } from "../config/site.js";
import { sparkline } from "./charts/timeline.js";
import { ahuOff, dayTime, reasonText } from "./ai-text.js";
import { feedbackHtml, todayHtml } from "./today.js";
import { escapeHtml, icon } from "./dom.js";

export const phoneQuery = window.matchMedia("(orientation: portrait) and (max-width: 760px)");

const VALUES = [
  { key: "co2", unit: "ppm", digits: 0, icon: "ph-atom" },
  { key: "temperature", unit: "°C", digits: 1, icon: "ph-thermometer-simple" },
  { key: "humidity", unit: "%", digits: 0, icon: "ph-drop" },
  { key: "occupancy", unit: "", digits: 0, icon: "ph-users-three" },
];

function valueTile(spec) {
  if (spec.key === "occupancy") {
    const info = occupancyInfo();
    if (!info) return "";
    return `<div class="tw-m-tile">${icon(spec.icon)}<small>${escapeHtml(t(info.measured ? "occupancy" : "occupancyEstimated"))}</small><strong class="tw-num">${formatNumber(info.count, 0)}</strong></div>`;
  }
  const metric = roomMetric(spec.key);
  if (metric.value === null) return "";
  const status = metricStatus(spec.key, metric.value);
  const level = metric.stale ? "offline" : status?.level || "good";
  return `<div class="tw-m-tile${metric.stale ? " is-stale" : ""}">${icon(spec.icon)}<small>${escapeHtml(t(spec.key))}</small>
    <strong><span class="tw-num">${formatNumber(metric.value, spec.digits)}</span><span class="tw-unit">${spec.unit}</span></strong>
    <span class="tw-m-status"><i class="tw-dot" data-level="${level}"></i>${escapeHtml(metric.stale ? t("stale") : status ? t(status.word) : "")}</span></div>`;
}

function aiHtml() {
  const { rec, stale, valid } = recommendationState();
  if (!rec) return `<p class="tw-caption">${escapeHtml(t("aiWaiting"))}</p>`;
  if (!valid) return `<p>${escapeHtml(reasonText(rec))}</p>`;
  const main = ahuOff(rec)
    ? `<strong class="tw-m-ai-value">${escapeHtml(t("ahuOffTitle"))}</strong><small>${escapeHtml(rec.ahu.nextStart ? t("ahuNextStart", { when: dayTime(Date.parse(rec.ahu.nextStart)) }) : "")}</small>`
    : `<strong class="tw-m-ai-value"><span class="tw-num">${rec.airflow.recommendedLps}</span><span class="tw-unit">L/s</span></strong><small>${escapeHtml(t("aiDamper", { pct: rec.airflow.recommendedDamperPct }))}</small>`;
  return `${main}<p class="${stale ? "is-stale" : ""}">${escapeHtml(ahuOff(rec) ? t("ahuOffNoSavings") : reasonText(rec))}</p>`;
}

// #sensor=AM103-05 (from a sensor's QR label): that sensor's readings at the top of the page.
function sensorCard() {
  const id = decodeURIComponent((window.location.hash.match(/sensor=([^&]+)/) || [])[1] || "");
  const device = deviceById(id);
  if (!device) return "";
  const rows = device.metrics.map((metric) => ({ metric, reading: sensorReading(device.id, metric.key) })).filter(({ reading }) => reading.value !== null);
  const snapshot = data().snapshots.get(device.id);
  const online = deviceStatus(device.id) === "normal";
  return `<section class="tw-m-card tw-m-sensor"><h2>${icon("ph-cpu")}${escapeHtml(pick(device.name))}</h2>
    <small><i class="tw-dot" data-level="${online ? "good" : "offline"}"></i> ${escapeHtml(snapshot?.updatedAt ? t("lastRecord", { ago: ago(snapshot.updatedAt) }) : t("noRecord"))}</small>
    <div class="tw-m-grid">${rows.map(({ metric, reading }) => `<div class="tw-m-tile${reading.stale ? " is-stale" : ""}">${icon(metric.icon)}<small>${escapeHtml(metricLabel(metric))}</small><strong>${valueHtml(metric, reading.value)}</strong></div>`).join("")}</div></section>`;
}

export function renderMobile() {
  const host = document.getElementById("mobile-view");
  if (!host || host.hidden) return;
  const last = lastReadingAt();
  const points = roomSeries(data().roomHistory, "co2").filter((p) => p.t >= Date.now() - 24 * 3600000);
  host.innerHTML = `
    <header class="tw-m-head"><h1>ZB202</h1><span>${escapeHtml(last ? `${t("live")} · ${t("updatedAgo", { ago: ago(last) })}` : t("connecting"))}</span><small>${escapeHtml(`${t("hkTime")} ${clockTime(Date.now())}`)}</small></header>
    ${sensorCard()}
    <p class="tw-m-sentence">${escapeHtml(document.getElementById("sentence")?.textContent || "")}</p>
    <section class="tw-m-grid">${VALUES.map(valueTile).join("")}</section>
    <section class="tw-m-card"><h2>${icon("ph-sparkle")}${escapeHtml(t("aiTitle"))}</h2>${aiHtml()}</section>
    ${points.length > 1 ? `<section class="tw-m-card"><h2>${icon("ph-chart-line")}CO₂ · ${escapeHtml(t("last24h"))}</h2>${sparkline(points, { width: 320, height: 72, limit: thresholds.co2.goodBelow })}</section>` : ""}
    <section class="tw-m-card">${feedbackHtml()}</section>
    <section class="tw-m-card tw-today"><h2>${icon("ph-calendar-check")}${escapeHtml(t("todayTitle"))}</h2>${todayHtml(todaySummary())}</section>
    <p class="tw-m-rotate">${icon("ph-device-rotate")}${escapeHtml(t("rotateFor3d"))}</p>`;
}

export function initMobile() {
  const host = document.getElementById("mobile-view");
  const apply = () => {
    const phone = phoneQuery.matches;
    document.body.toggleAttribute("data-mobile", phone);
    document.documentElement.toggleAttribute("data-phone", phone); // fixed 16 px base (tokens.css)
    host.hidden = !phone;
    renderMobile();
  };
  phoneQuery.addEventListener("change", apply);
  window.addEventListener("hashchange", renderMobile);
  on("data", renderMobile);
  on("settings", renderMobile);
  window.setInterval(renderMobile, 30000);
  apply();
  return ui;
}
