// Standby showcase for the lab display (section 13.7): after 3 idle minutes it cycles
// Overview → Environment → Energy → Devices (≈20 s each), sways the camera gently, plays one ripple
// per round, and stops on the first touch, click or key. Live data throughout; 30 fps cap.
import { settings, ui, setView, select, on, reducedMotion } from "../state.js";
import { SITE } from "../config/site.js";
import { setFrameCap } from "../scene/viewer.js";
import { startSway, stopSway, flyToView, sceneState, pick } from "../scene/index.js";
import { ripple } from "../scene/digital-layer.js";
import { closeAiPage } from "./ai-page.js";
import { closePopover } from "./dom.js";

const ORDER = ["home", "environment", "energy", "devices"];
let idleTimer = 0;
let cycleTimer = 0;
let active = false;
let step = 0;

function resetIdle() {
  window.clearTimeout(idleTimer);
  if (active) stop();
  if (settings.kiosk && sceneState.ready) idleTimer = window.setTimeout(start, SITE.kioskIdleMs);
}

function start() {
  if (active || !settings.kiosk || ui.replay) return;
  active = true;
  step = 0;
  closePopover();
  closeAiPage();
  select(null);
  setFrameCap(30);
  document.getElementById("kiosk-hint").hidden = false;
  advance();
}

function advance() {
  if (!active) return;
  const view = ORDER[step % ORDER.length];
  setView(view);
  window.setTimeout(() => { if (active && !reducedMotion()) startSway(view); }, 1100);
  // One ripple per round, on the floor in the middle of the room.
  if (view === "home" && !reducedMotion()) {
    window.setTimeout(() => {
      if (!active) return;
      const canvas = document.getElementById("twin-canvas").getBoundingClientRect();
      const hit = pick(canvas.left + canvas.width / 2, canvas.top + canvas.height * 0.6, { selectableOnly: false });
      if (hit.surface) ripple(hit.surface);
    }, 6000);
  }
  step += 1;
  cycleTimer = window.setTimeout(() => { stopSway(); advance(); }, SITE.kioskThemeMs);
}

function stop() {
  active = false;
  window.clearTimeout(cycleTimer);
  stopSway();
  setFrameCap(0);
  document.getElementById("kiosk-hint").hidden = true;
  setView("home");
  void flyToView("home", 600);
}

export function initKiosk() {
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(type, resetIdle, { capture: true, passive: true });
  window.addEventListener("pointermove", () => { if (!active) resetIdle(); }, { passive: true });
  on("setting:kiosk", resetIdle);
  on("scene-ready", resetIdle);
  document.addEventListener("visibilitychange", () => { if (document.hidden && active) stop(); });
}
