// Replay controls (section 13.5): play / pause, scrub, 0.5× / 1× / 2×, back to live (or Esc).
import { t, getLang } from "../i18n.js";
import { ui, on } from "../state.js";
import { play, pause, seek, setSpeed, stopReplay } from "../data/replay.js";
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
    <input type="range" min="${replay.start}" max="${replay.stop}" step="60000" value="${replay.t}" aria-label="${escapeHtml(t("replayAria"))}">
    <time></time>
    <div class="tw-seg" role="group" aria-label="${escapeHtml(t("replaySpeed"))}">${[0.5, 1, 2].map((speed) => `<button type="button" data-speed="${speed}" aria-pressed="${replay.speed === speed}">${speed}×</button>`).join("")}</div>
    <button type="button" class="tw-button tw-button-small" data-action="live">${escapeHtml(t("backToLive"))}</button>`;
  bar().querySelector('[data-action="toggle"]').addEventListener("click", () => (ui.replay?.playing ? pause() : play()));
  const range = bar().querySelector("input");
  range.addEventListener("input", () => { pause(); seek(Number(range.value)); });
  bar().querySelectorAll("[data-speed]").forEach((button) => button.addEventListener("click", () => setSpeed(Number(button.dataset.speed))));
  bar().querySelector('[data-action="live"]').addEventListener("click", stopReplay);
  sync();
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
}
