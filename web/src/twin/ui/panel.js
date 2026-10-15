// Theme panels (section 5): the camera flies to the theme's preset, scene layers switch, and a
// thick-glass panel slides in from the right (a bottom sheet on narrow screens).
import { t } from "../i18n.js";
import { ui, on, setView } from "../state.js";
import * as environment from "./themes/environment.js";
import * as energy from "./themes/energy.js";
import * as devices from "./themes/devices.js";
import { flyToView, themeLayers, sceneState } from "../scene/index.js";
import { setViewInset } from "../scene/viewer.js";
import { $, growFrom, shrinkTo } from "./dom.js";

const THEMES = { environment, energy, devices };
let mounted = null;
let mountedView = null;

function tabFor(view) { return document.querySelector(`.tw-tab[data-view="${view}"]`); }

export async function showTheme(view, previous) {
  const panel = $("#theme-panel");
  const theme = THEMES[view];
  if (sceneState.ready && view !== "ai") void flyToView(view, 1000);
  themeLayers(view);
  if (!theme) {
    if (mounted) {
      mounted.unmount();
      mounted = null;
      mountedView = null;
      await shrinkTo(panel, tabFor(previous));
    }
    updateViewInset();
    return;
  }
  const wasOpen = !panel.hidden;
  if (mounted && mountedView !== view) mounted.unmount();
  mounted = theme;
  mountedView = view;
  $("#panel-title").textContent = t(theme.titleKey);
  const body = $("#panel-body");
  body.scrollTop = 0;
  panel.hidden = false;
  panel.classList.remove("is-expanded");
  theme.mount(body);
  if (wasOpen) body.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
  else growFrom(panel, tabFor(view), { duration: 450, distance: 0.35 });
  updateViewInset();
}

// Keep the room clear of whichever panel is open (right side, or bottom sheet on narrow screens).
export function updateViewInset() {
  const open = [$("#theme-panel"), $("#sensor-sheet")].filter((element) => !element.hidden);
  if (!open.length) { setViewInset({}); return; }
  const narrow = document.documentElement.dataset.tier === "narrow";
  const width = Math.max(...open.map((element) => element.offsetWidth));
  const height = Math.max(...open.map((element) => element.offsetHeight));
  setViewInset(narrow ? { bottom: height } : { right: width + 16 });
}

export function refreshTheme() { mounted?.update(); }
export function relabelTheme() {
  if (!mounted) return;
  $("#panel-title").textContent = t(mounted.titleKey);
  mounted.mount($("#panel-body"));
}
export const markerReadout = (view, id) => THEMES[view]?.markerReadout?.(id) ?? null;
export const energyTotalReadout = () => energy.totalReadout();

export function initPanel() {
  $("#panel-close").addEventListener("click", () => setView("home"));
  // Narrow screens: drag or tap the grip to raise the sheet to full height.
  for (const sheet of [$("#theme-panel"), $("#sensor-sheet")]) {
    const head = sheet.querySelector(".tw-panel-head");
    let startY = null;
    head.addEventListener("pointerdown", (event) => { if (document.documentElement.dataset.tier === "narrow") startY = event.clientY; });
    head.addEventListener("pointerup", (event) => {
      if (startY === null) return;
      const dy = event.clientY - startY;
      startY = null;
      if (Math.abs(dy) < 6) sheet.classList.toggle("is-expanded");
      else sheet.classList.toggle("is-expanded", dy < 0);
    });
  }
  new MutationObserver(updateViewInset).observe($("#sensor-sheet"), { attributes: true, attributeFilter: ["hidden", "class"] });
  window.addEventListener("resize", updateViewInset);
  on("data", () => refreshTheme());
  let lastTick = 0;
  on("replay-tick", () => {
    // Panels follow the replay at most ~3 times a second (charts are SVG, the scene does the rest).
    const now = performance.now();
    if (now - lastTick < 300 || !(ui.view === "environment" || ui.view === "energy")) return;
    lastTick = now;
    refreshTheme();
  });
  on("replay", () => refreshTheme());
}
