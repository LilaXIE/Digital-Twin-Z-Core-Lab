// Alarms (section 6.1): no tab of their own. A capsule top right; new alarms drop a banner for
// 6 s and pulse the sensor's marker; the capsule opens a popover with status and the list.
import { t, pick } from "../i18n.js";
import { on, select, setView } from "../state.js";
import { setAlarmState } from "../data/store.js";
import { alarms, ALARM_TITLE, ALARM_ICON, todaySummary } from "../data/derived.js";
import { startReplay } from "../data/replay.js";
import { todayHtml } from "./today.js";
import { deviceById } from "../data/devices.js";
import { pulseMarker } from "../scene/markers.js";
import { summaryHtml } from "./themes/devices.js";
import { escapeHtml, icon, openAsPopover, closePopover } from "./dom.js";

let filter = "active";
const seen = new Set();
let primed = false;
let bannerTimer = 0;

function detail(alarm) {
  if (alarm.detailKey === "raw") return alarm.detailVars.text || "";
  if (alarm.detailKey) return t(alarm.detailKey, alarm.detailVars);
  return "";
}
const deviceLabel = (id) => (id === "dataService" ? t("dataService") : id);

function listHtml() {
  const list = alarms().filter((alarm) => filter === "all" || alarm.state === filter);
  if (!list.length) {
    return filter === "active"
      ? `<div class="tw-empty is-good">${icon("ph-check-circle")}<span>${escapeHtml(t("allClear"))}</span></div>`
      : `<div class="tw-empty">${icon("ph-bell-slash")}<span>${escapeHtml(t("alarmNoneFiltered", { filter: t(filter === "acknowledged" ? "alarmAcknowledged" : "alarmAll") }))}</span></div>`;
  }
  return list.map((alarm) => `
    <div class="tw-alarm-item${alarm.level === "critical" ? " is-critical" : ""}${alarm.state === "acknowledged" ? " is-acknowledged" : ""}" data-alarm="${escapeHtml(alarm.id)}" data-device="${escapeHtml(alarm.deviceId)}">
      <button type="button" class="tw-alarm-open" data-open>${icon(ALARM_ICON[alarm.type] || "ph-warning-circle")}
      <span><strong>${escapeHtml(t(ALARM_TITLE[alarm.type] || alarm.type))}</strong><small>${escapeHtml(deviceLabel(alarm.deviceId))}${detail(alarm) ? ` · ${escapeHtml(detail(alarm))}` : ""}</small></span></button>
      <button type="button" class="tw-button tw-button-small" data-ack="${alarm.state === "active" ? "acknowledged" : "active"}">${escapeHtml(t(alarm.state === "active" ? "acknowledge" : "reopen"))}</button>
    </div>`).join("");
}

function renderPopover() {
  const popover = document.getElementById("alarm-popover");
  popover.innerHTML = `<header><h2 id="alarm-popover-title">${escapeHtml(t("alarmTitle"))}</h2><button type="button" class="tw-icon-button" data-action="close" aria-label="${escapeHtml(t("close"))}">${icon("ph-x")}</button></header>
    <div class="tw-dist">${summaryHtml()}</div>
    <div class="tw-toolbar"><div class="tw-seg" role="group">${[["active", "alarmActive"], ["acknowledged", "alarmAcknowledged"], ["all", "alarmAll"]].map(([key, label]) => `<button type="button" data-filter="${key}" aria-pressed="${filter === key}">${escapeHtml(t(label))}</button>`).join("")}</div></div>
    <div data-part="list">${listHtml()}</div>
    <section class="tw-today" data-part="today"><h3>${escapeHtml(t("todayTitle"))}</h3>${todayHtml(todaySummary())}</section>`;
  popover.querySelectorAll("[data-replay-at]").forEach((button) => button.addEventListener("click", () => { closePopover(); void startReplay({ at: Number(button.dataset.replayAt) }); }));
  popover.querySelector('[data-action="close"]').addEventListener("click", () => closePopover());
  popover.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { filter = button.dataset.filter; renderPopover(); }));
  popover.querySelectorAll("[data-alarm] [data-open]").forEach((button) => button.addEventListener("click", () => {
    const id = button.closest("[data-alarm]").dataset.device;
    if (!deviceById(id)) return;
    closePopover();
    if (["environment", "energy", "devices"].includes(document.body.dataset.view) === false) setView("devices");
    select({ kind: "sensor", id });
  }));
  popover.querySelectorAll("[data-ack]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    setAlarmState(button.closest("[data-alarm]").dataset.alarm, button.dataset.ack);
  }));
}

function showBanner(alarm) {
  const banner = document.getElementById("alarm-banner");
  banner.className = `tw-banner glass-thick${alarm.level === "critical" ? " is-critical" : ""}`;
  banner.innerHTML = `${icon(ALARM_ICON[alarm.type] || "ph-warning-circle")}<span><strong>${escapeHtml(t("newAlarm"))} · ${escapeHtml(t(ALARM_TITLE[alarm.type] || alarm.type))}</strong><small>${escapeHtml(deviceLabel(alarm.deviceId))}${deviceById(alarm.deviceId) ? ` · ${escapeHtml(pick(deviceById(alarm.deviceId).type))}` : ""}</small></span>`;
  banner.hidden = false;
  banner.animate([{ transform: "translate(-50%, -140%)", opacity: 0 }, { transform: "translate(-50%, 0)", opacity: 1 }], { duration: 450, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
  pulseMarker(alarm.deviceId);
  window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => {
    // The banner retracts into the alarm capsule (or the Overview alarm card, which replaces it there).
    const capsuleElement = document.getElementById("alarm-capsule");
    const capsule = (capsuleElement.offsetParent ? capsuleElement : document.getElementById("alarm-card")).getBoundingClientRect();
    const box = banner.getBoundingClientRect();
    const dx = capsule.left + capsule.width / 2 - (box.left + box.width / 2);
    const dy = capsule.top + capsule.height / 2 - (box.top + box.height / 2);
    banner.animate([{ transform: "translate(-50%, 0)", opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(0.2)`, opacity: 0 }], { duration: 450, easing: "cubic-bezier(0.32, 0.72, 0, 1)" })
      .finished.then(() => { banner.hidden = true; }).catch(() => { banner.hidden = true; });
  }, 6000);
}

function detectNew() {
  const current = alarms().filter((alarm) => alarm.state === "active" && alarm.type !== "connection");
  // Alarms present when the page opens are not "new"; only later arrivals drop a banner.
  const fresh = primed ? current.filter((alarm) => !seen.has(alarm.id)) : [];
  current.forEach((alarm) => seen.add(alarm.id));
  if (fresh.length) showBanner(fresh[0]);
}

// Opens the alarm list from the capsule, or from "View all" on the Overview alarm card.
export function toggleAlarmPopover(trigger) {
  const popover = document.getElementById("alarm-popover");
  if (!popover.hidden) { closePopover(); return; }
  renderPopover();
  openAsPopover(popover, trigger, { align: "end" });
}

export function initAlarms() {
  const capsule = document.getElementById("alarm-capsule");
  capsule.addEventListener("click", () => toggleAlarmPopover(capsule));
  on("data", (event) => {
    if (event?.kind === "telemetry" || event?.kind === "fault" || event?.kind === "alarms" || event?.kind === "dataset") {
      if (event.kind === "dataset") { seen.clear(); primed = false; }
      detectNew();
      if (!document.getElementById("alarm-popover").hidden) renderPopover();
    }
  });
  on("replay-tick", ({ newEvents }) => {
    for (const event of newEvents || []) showBanner({ id: `replay:${event.deviceId}:${event.t}`, type: event.type, level: "critical", deviceId: event.deviceId });
  });
  window.setTimeout(() => { detectNew(); primed = true; }, 8000);
}
