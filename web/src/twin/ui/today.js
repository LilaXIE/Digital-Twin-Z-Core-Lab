// Today's summary (section B2), shared by the Overview card and the alarm popover on narrow screens.
import { t, clockTime, formatNumber } from "../i18n.js";
import { data, provider } from "../data/store.js";
import { escapeHtml, icon, toast } from "./dom.js";

// One-tap comfort feedback (section D2). Anyone may vote (the bridge limits how often); the room's
// readings at that moment are stored with each vote, so complaints can be matched to CO₂ later.
export const VOTES = [["stuffy", "ph-cloud-fog"], ["warm", "ph-thermometer-hot"], ["cold", "ph-snowflake"], ["ok", "ph-smiley"]];
const hkDay = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);

export function feedbackHtml() {
  const today = (data().feedback || []).filter((entry) => hkDay(Date.parse(entry.t)) === hkDay(Date.now()));
  const counts = Object.fromEntries(VOTES.map(([vote]) => [vote, today.filter((entry) => entry.vote === vote).length]));
  return `<div class="tw-feedback"><small>${escapeHtml(t("feedbackAsk"))}</small>
    <div class="tw-feedback-buttons">${VOTES.map(([vote, iconName]) => `<button type="button" data-vote="${vote}">${icon(iconName)}<span>${escapeHtml(t(`vote_${vote}`))}</span>${counts[vote] ? `<b>${counts[vote]}</b>` : ""}</button>`).join("")}</div></div>`;
}

let bound = false;
export function initFeedback() {
  if (bound) return;
  bound = true;
  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-vote]");
    if (!button) return;
    button.disabled = true;
    const result = await provider().sendFeedback?.(button.dataset.vote);
    button.disabled = false;
    toast(t(result?.ok ? "feedbackThanks" : result?.limited ? "feedbackLimited" : "feedbackFailed"), { icon: result?.ok ? "ph-check-circle" : "ph-info" });
  });
}

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

