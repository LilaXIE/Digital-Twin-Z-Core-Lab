// Shared value formatting for panels and the sensor sheet.
import { t, formatNumber, pick } from "../i18n.js";
import { escapeHtml } from "./dom.js";

const BINARY = {
  occupancy: ["vacant", "occupied"],
  door: ["doorClosed", "doorOpen"],
  leak: ["leakNo", "leakYes"],
  socket: ["off", "on"],
  tamper: ["off", "on"],
  pir: ["off", "on"],
};

export function binaryText(kind, value) {
  const labels = BINARY[kind];
  if (!labels || !Number.isFinite(value)) return t("unknown");
  return t(labels[value > 0 ? 1 : 0]);
}

// HTML for a metric value with its unit (unit is smaller and lighter).
export function valueHtml(metric, value) {
  if (!Number.isFinite(value)) return "";
  if (metric.binary) return escapeHtml(binaryText(metric.binary, value));
  return `<span class="tw-num">${formatNumber(value, metric.digits ?? null)}</span>${metric.unit ? `<span class="tw-unit">${escapeHtml(metric.unit)}</span>` : ""}`;
}

export const metricLabel = (metric) => pick(metric.label);

export function compassText(degrees) {
  if (!Number.isFinite(degrees)) return "";
  const names = t("compass");
  return names[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}
