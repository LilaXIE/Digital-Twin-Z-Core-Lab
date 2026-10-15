// Today's summary (section B2), shared by the Overview card and the alarm popover on narrow screens.
import { t, clockTime, formatNumber } from "../i18n.js";
import { escapeHtml, icon } from "./dom.js";

// HK EPD IAQ Certification: 8-hour average CO₂ below 800 ppm is "Excellent", below 1000 ppm "Good".
const IAQ_BADGE = { excellent: ["ph-medal", "iaqExcellent"], good: ["ph-check-circle", "iaqGood"], below: ["ph-warning", "iaqBelow"] };

export function todayHtml(summary) {
  if (!summary) return `<p class="tw-card-caption">${escapeHtml(t("todayWaiting"))}</p>`;
  const [badgeIcon, badgeKey] = IAQ_BADGE[summary.iaqClass] || [];
  const badge = badgeKey ? `<div class="tw-iaq-badge" data-class="${summary.iaqClass}">${icon(badgeIcon)}<span><strong>${escapeHtml(t(badgeKey))}</strong><small>${escapeHtml(t("iaqBasis", { v: Math.round(summary.average8h) }))}</small></span></div>` : "";
  const compliance = summary.compliance === null ? t("todayNoWorkingData") : `${Math.round(summary.compliance * 100)}%`;
  const events = summary.events.length
    ? summary.events.map((event) => `<button type="button" class="tw-event-row" data-replay-at="${event.start}">${icon("ph-trend-up")}<span>${escapeHtml(`${clockTime(event.start)}–${clockTime(event.end + 600000)}`)}</span><small>${escapeHtml(t("eventPeak", { v: formatNumber(Math.round(event.peak), 0), m: event.minutes }))}</small></button>`).join("")
    : "";
  return `${badge}
    <div class="tw-today-grid">
      <div><small>${escapeHtml(t("todayCompliance"))}</small><strong class="tw-num">${escapeHtml(compliance)}</strong></div>
      <div><small>${escapeHtml(t("todayExceed"))}</small><strong class="tw-num">${summary.events.length}</strong></div>
      <div><small>${escapeHtml(t("todayCompleteness"))}</small><strong class="tw-num">${Math.round(summary.completeness * 100)}%</strong></div>
    </div>
    ${events ? `<div class="tw-events"><small>${escapeHtml(t("todayEvents", { limit: summary.limit }))}</small>${events}</div>` : ""}`;
}

