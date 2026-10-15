// Replay controls (section 13.5): play / pause, scrub, 0.5× / 1× / 2×, back to live (or Esc).
import { t, getLang } from "../i18n.js";
import { ui, on } from "../state.js";
import { play, pause, seek, setSpeed, stopReplay, replayMarks } from "../data/replay.js";
import { thresholds } from "../config/site.js";
import { escapeHtml, icon, toast } from "./dom.js";
import { startAnimation, stopAnimation } from "../scene/viewer.js";

const bar = () => document.getElementById("replay-bar");

function timeLabel(time) {
  return new Date(time).toLocaleString(getLang() === "en" ? "en-GB" : getLang() === "zh-Hant" ? "zh-HK" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" });
}

function build() {
  const replay = ui.replay;
  bar().innerHTML = `
    <button type="button" class="tw-icon-button" data-action="toggle" aria-label="${escapeHtml(t(replay.playing ? "replayPause" : "replayPlay"))}">${icon(replay.playing ? "ph-pause" : "ph-play")}</button>
    <div class="tw-replay-steps"><button type="button" class="tw-icon-button" data-step="-3600000" aria-label="${escapeHtml(t("replayBackHour"))}" title="${escapeHtml(t("replayBackHour"))}">${icon("ph-skip-back")}</button><button type="button" class="tw-icon-button" data-step="3600000" aria-label="${escapeHtml(t("replayForwardHour"))}" title="${escapeHtml(t("replayForwardHour"))}">${icon("ph-skip-forward")}</button></div>
    <div class="tw-replay-track">${marksHtml(replay)}<input type="range" min="${replay.start}" max="${replay.stop}" step="60000" value="${replay.t}" aria-label="${escapeHtml(t("replayAria"))}" title="${escapeHtml(t("replayKeys"))}"></div>
    <time></time>
    <div class="tw-seg" role="group" aria-label="${escapeHtml(t("replaySpeed"))}">${[0.5, 1, 2].map((speed) => `<button type="button" data-speed="${speed}" aria-pressed="${replay.speed === speed}">${speed}×</button>`).join("")}</div>
    <button type="button" class="tw-button tw-button-small" data-action="live">${escapeHtml(t("backToLive"))}</button>`;
  bar().querySelector('[data-action="toggle"]').addEventListener("click", () => (ui.replay?.playing ? pause() : play()));
  const range = bar().querySelector("input");
  range.addEventListener("input", () => { pause(); seek(Number(range.value)); });
  bar().querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => step(Number(button.dataset.step))));
  bar().querySelectorAll("[data-mark]").forEach((mark) => mark.addEventListener("click", () => { pause(); seek(Number(mark.dataset.mark)); }));
  bar().querySelectorAll("[data-speed]").forEach((button) => button.addEventListener("click", () => setSpeed(Number(button.dataset.speed))));
  bar().querySelector('[data-action="live"]').addEventListener("click", stopReplay);
  sync();
}

// Over-limit CO₂ stretches (red) and door / leak events (ticks) along the track; each one is a seek target.
function marksHtml(replay) {
  const span = replay.stop - replay.start || 1;
  const pct = (time) => (((time - replay.start) / span) * 100).toFixed(2);
  const { over, events } = replayMarks(thresholds.co2.goodBelow);
  return `<div class="tw-replay-marks" aria-hidden="true">${over.map((item) => `<i class="is-over" data-mark="${item.from}" style="left:${pct(item.from)}%;width:${Math.max(0.6, pct(item.to) - pct(item.from))}%" title="${escapeHtml(t("replayOver", { limit: thresholds.co2.goodBelow }))}"></i>`).join("")}${events.map((event) => `<i class="is-event" data-mark="${event.t}" style="left:${pct(event.t)}%" title="${escapeHtml(t({ door: "alarmDoor", leak: "alarmLeak", tamper: "alarmTamper" }[event.type] || "alarmTitle"))}"></i>`).join("")}</div>`;
}

function step(deltaMs) {
  if (!ui.replay) return;
  pause();
  seek(ui.replay.t + deltaMs);
}

function sync() {
  if (!ui.replay) return;
  const range = bar().querySelector("input");
  if (range && document.activeElement !== range) range.value = String(ui.replay.t);
  const time = bar().querySelector("time");
  if (time) time.textContent = timeLabel(ui.replay.t);
}

export function initReplayBar() {
  on("replay", ({ kind }) => {
    if (kind === "loading") toast(t("replayLoading"), { icon: "ph-clock-counter-clockwise" });
    if (kind === "failed") toast(t("replayFailed"), { icon: "ph-warning-circle" });
    if (!ui.replay) { bar().hidden = true; stopAnimation("replay"); document.getElementById("toast").hidden = true; return; }
    bar().hidden = false;
    document.getElementById("toast").hidden = true;
    if (["start", "play", "pause", "speed", "ended"].includes(kind)) build();
    // Continuous rendering while playing; the scene follows the replayed time.
    if (ui.replay.playing) startAnimation("replay"); else stopAnimation("replay");
  });
  on("replay-tick", sync);
  window.addEventListener("keydown", (event) => { if (event.key === "Escape" && ui.replay) { event.stopImmediatePropagation(); stopReplay(); } }, true);
  // Arrow keys step 10 minutes (Shift: one hour); Space plays or pauses. Not while typing in a field.
  window.addEventListener("keydown", (event) => {
    if (!ui.replay || event.target.closest?.("input:not([type=range]), textarea, select, [contenteditable]")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      step((event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 3600000 : 600000));
    } else if (event.key === " " && !event.target.closest?.("button")) {
      event.preventDefault();
      if (ui.replay.playing) pause(); else play();
    }
  });
}
