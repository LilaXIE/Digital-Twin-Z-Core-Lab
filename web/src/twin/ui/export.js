// Export and sharing (section D3): CSV downloads, a printable weekly report (save as PDF from the
// print dialog), and QR codes that open a sensor or the current view on a phone.
import qrcode from "qrcode-generator";
import { t, clockTime, dateTime, formatNumber } from "../i18n.js";
import { data, provider } from "../data/store.js";
import { deviceById } from "../data/devices.js";
import { roomSeries, todaySummary, healthSummary } from "../data/derived.js";
import { SITE } from "../config/site.js";
import { escapeHtml, icon, openAsPopover, closePopover } from "./dom.js";
import { pick } from "../i18n.js";

const iso = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 16).replace("T", " ");

export function downloadCsv(filename, header, rows) {
  const quote = (value) => (value === null || value === undefined ? "" : /[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value));
  // BOM so Excel reads the Chinese headers as UTF-8.
  const text = `﻿${[header, ...rows].map((row) => row.map(quote).join(",")).join("\r\n")}\r\n`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

const stamp = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

// Room history (24 h, 10-minute steps): the room median and every environment sensor, offset-corrected.
export function exportRoomCsv() {
  const history = data().roomHistory;
  if (!history?.sensors) return false;
  const times = [...new Set(Object.values(history.sensors).flatMap((metrics) => Object.values(metrics).flatMap((series) => series.map(([time]) => time))))].sort((a, b) => a - b);
  const room = Object.fromEntries(["co2", "temperature", "humidity"].map((key) => [key, new Map(roomSeries(history, key).map((p) => [p.t, p.v]))]));
  const value = (id, key, time) => history.sensors[id]?.[key]?.find(([t0]) => t0 === time)?.[1] ?? "";
  const header = [t("csvTime"), `${t("co2")} (ppm)`, `${t("temperature")} (°C)`, `${t("humidity")} (%)`, ...SITE.envSensors.map((id) => `${id} CO₂ (ppm)`)];
  const rows = times.map((time) => [iso(time), Math.round(room.co2.get(time) ?? NaN) || "", room.temperature.get(time)?.toFixed(1) ?? "", room.humidity.get(time)?.toFixed(0) ?? "", ...SITE.envSensors.map((id) => value(id, "co2", time))]);
  downloadCsv(`ZB202-room-${stamp()}.csv`, header, rows);
  return true;
}

// Hourly baseline and recommended energy behind the savings proof.
export function exportSavingsCsv() {
  const hours = data().aiReview?.savings?.hours;
  if (!hours?.length) return false;
  downloadCsv(`ZB202-savings-${stamp()}.csv`, [t("csvTime"), `${t("baselineSeries")} (kWh)`, `${t("recommendedSeries")} (kWh)`, `${t("savedElectric")} (kWh)`],
    hours.map((h) => [iso(Date.parse(h.t)), h.baselineKwh, h.recommendedKwh, Math.round((h.baselineKwh - h.recommendedKwh) * 10000) / 10000]));
  return true;
}

// ---- QR codes ----
export function qrSvg(text, cellSize = 4) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize, margin: 2, scalable: true });
}

// Public link to a sensor (phones open its card) or to the current view; internal mode is never shared.
export function shareUrl(hash = window.location.hash) {
  const url = new URL(window.location.href);
  url.searchParams.delete("mode");
  url.searchParams.delete("bridge");
  url.searchParams.delete("bridgePort");
  url.hash = hash;
  return url.toString();
}

export function showQr(trigger, { title, url, printable = false }) {
  const popover = document.getElementById("qr-popover");
  popover.innerHTML = `<header><h2>${escapeHtml(title)}</h2><button type="button" class="tw-icon-button" data-action="close" aria-label="${escapeHtml(t("close"))}">${icon("ph-x")}</button></header>
    <div class="tw-qr">${qrSvg(url)}</div><p class="tw-caption tw-qr-url">${escapeHtml(url)}</p>
    <div class="tw-confirm-actions"><button type="button" class="tw-button" data-action="copy">${icon("ph-copy")}${escapeHtml(t("copyLink"))}</button>${printable ? `<button type="button" class="tw-button tw-button-primary" data-action="print">${icon("ph-printer")}${escapeHtml(t("printLabel"))}</button>` : ""}</div>`;
  openAsPopover(popover, trigger, { align: "end" });
  popover.querySelector('[data-action="close"]').addEventListener("click", () => closePopover());
  popover.querySelector('[data-action="copy"]').addEventListener("click", () => { void navigator.clipboard?.writeText(url); });
  popover.querySelector('[data-action="print"]')?.addEventListener("click", () => printHtml(`<div class="tw-print-label"><div class="tw-print-qr">${qrSvg(url, 6)}</div><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(t("labelHint"))}</p><p class="tw-print-url">${escapeHtml(url)}</p></div></div>`));
}

// ---- Printing (the browser's print dialog also saves as PDF) ----
export function printHtml(html) {
  const host = document.getElementById("print-report");
  host.innerHTML = html;
  document.body.classList.add("is-printing");
  const done = () => { document.body.classList.remove("is-printing"); host.innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}

const waitFor = (check, ms = 4000) => new Promise((resolve) => {
  const start = Date.now();
  const tick = () => (check() || Date.now() - start > ms ? resolve() : window.setTimeout(tick, 150));
  tick();
});

// One page for the week: air quality today, the AI's savings and forecast accuracy, standby power and data health.
export async function printWeeklyReport() {
  const dataset = data();
  if (!dataset.aiReview) provider().requestAiReview?.(7, 24);
  if (!dataset.standby) provider().requestStandbyReport?.();
  if (!dataset.deviceHealth) provider().requestDeviceHealth?.();
  await waitFor(() => data().aiReview && data().standby && data().deviceHealth);
  const summary = todaySummary();
  const savings = data().aiReview?.savings;
  const forecast = data().aiReview?.forecast;
  const standby = data().standby;
  const health = data().deviceHealth;
  const h = healthSummary();
  const row = (label, value) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
  const issues = Object.entries(health?.devices || {}).filter(([, item]) => item.completeness !== null && item.completeness < 95).map(([id]) => id);
  const html = `<article class="tw-print-report">
    <header><h1>${escapeHtml(t("reportTitle"))}</h1><p>${escapeHtml(t("reportFor", { from: savings ? dateTime(Date.parse(savings.from)) : "", to: dateTime(Date.now()) }))}</p></header>
    <h2>${escapeHtml(t("todayTitle"))}</h2><table>
      ${summary ? row(t("iaqBasisShort"), `${Math.round(summary.average8h)} ppm · ${t({ excellent: "iaqExcellent", good: "iaqGood", below: "iaqBelow" }[summary.iaqClass])}`) : ""}
      ${summary ? row(t("todayCompliance"), summary.compliance === null ? t("todayNoWorkingData") : `${Math.round(summary.compliance * 100)}%`) : ""}
      ${summary ? row(t("todayExceed"), `${summary.events.length}${summary.events.length ? ` (${summary.events.map((e) => `${clockTime(e.start)} · ${Math.round(e.peak)} ppm`).join("; ")})` : ""}`) : ""}
    </table>
    <h2>${escapeHtml(t("energySaved"))}</h2><table>
      ${savings?.totals ? row(t("proofSaved", { d: savings.days.length || 7 }), `${formatNumber(savings.totals.savedKwh, 1)} kWh (${t("proofRange", { low: formatNumber(savings.totals.savedKwhLow, 1), high: formatNumber(savings.totals.savedKwhHigh, 1) })})`) : ""}
      ${savings?.totals ? row(t("proofShare"), `${savings.totals.savedSharePct ?? ""}%`) : ""}
      ${savings?.totals ? row(t("proofCarbon"), `${formatNumber(savings.totals.savedKwh * SITE.carbonKgPerKwh, 1)} kg CO₂e`) : ""}
      ${forecast ? row(t("reviewMae60"), forecast.mae60 === null ? "" : `${forecast.mae60} ppm (n=${forecast.samples60})`) : ""}
    </table>
    <p class="tw-print-note">${escapeHtml(t("proofMethod", { pct: savings?.assumptions?.baselineDamperPct ?? 30, cop: savings?.assumptions?.plantCop ?? 4.5 }))}</p>
    <h2>${escapeHtml(t("standbyTitle"))}</h2><table>
      ${(standby?.sockets || []).map((item) => row(item.id, t("standbyRow", { w: formatNumber(item.standbyW ?? 0, 1), kwh: item.yearKwh ?? 0 }))).join("")}
      ${standby ? row(t("reportTotal"), t("standbyTotal", { kwh: standby.totalYearKwh, kg: Math.round(standby.totalYearKwh * SITE.carbonKgPerKwh) })) : ""}
    </table>
    <h2>${escapeHtml(t("healthTitle"))}</h2><table>
      ${row(t("devicesOnline"), `${h.online} / ${h.total}`)}
      ${row(t("healthIssues", { n: issues.length }), issues.join(", ") || t("healthNoIssues"))}
      ${h.batteryLow ? row(t("batteryStatus"), t("batteryLowCount", { n: h.batteryLow })) : ""}
    </table>
    <footer>${escapeHtml(t("snapshotFooter"))} · ${escapeHtml(dateTime(Date.now()))}</footer></article>`;
  printHtml(html);
}

export const sensorTitle = (id) => { const device = deviceById(id); return device ? pick(device.name) : id; };
