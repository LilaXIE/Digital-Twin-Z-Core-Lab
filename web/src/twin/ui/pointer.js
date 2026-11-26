// Pointer details (section 13.12) and all scene pointer rules in one place (section 13.4):
// click (< 250 ms, < 5 px) on empty space → ripple; hold (> 400 ms) → lens; drag → orbit.
// Markers are magnetic (28 px, 44 px on touch). Glass sheen follows the pointer; buttons press in.
import { coarsePointer, ui, select, settings, reducedMotion } from "../state.js";
import { getControls } from "../scene/viewer.js";
import { nearestMarker, setHovered, hoveredMarker } from "../scene/markers.js";
import { ripple, lensStart, lensMove, lensEnd } from "../scene/digital-layer.js";
import { pick, hoverOutline, sceneState } from "../scene/index.js";
import { closePopover, popoverOpen } from "./dom.js";
import { showMarkerTip, hideMarkerTip } from "./marker-tip.js";

let press = null;
let lensActive = false;
let picking = null; // internal coordinate pick callback

export function setCoordinatePick(callback) {
  picking = callback;
  document.getElementById("twin-canvas").classList.toggle("is-picking", Boolean(callback));
}

function markerRadius() { return coarsePointer() ? 44 : 28; }

// Liquid glass: light wells up where the glass is pressed (or, on the Overview cards, where the
// pointer enters) and spreads towards the edges, under the content so the data stays readable.
const BLOOM_HOSTS = ".glass-thin, .glass-thick";
const HOVER_BLOOM = ".tw-dock > .glass-thick, .tw-identity.glass-thin";
function glassBloom(glass, x, y, strong) {
  if (reducedMotion() || settings.transparency === "reduced") return;
  const rect = glass.getBoundingClientRect();
  const size = Math.min(Math.hypot(rect.width, rect.height) * (strong ? 1.4 : 1.1), strong ? 640 : 520);
  const light = document.createElement("span");
  light.className = "tw-glass-bloom";
  light.setAttribute("aria-hidden", "true");
  light.style.cssText = `left:${x - rect.left}px;top:${y - rect.top}px;width:${size}px;height:${size}px`;
  glass.appendChild(light);
  const peak = strong ? 1 : 0.6;
  light.animate([
    { transform: "translate(-50%, -50%) scale(0.05)", opacity: peak, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
    { transform: "translate(-50%, -50%) scale(0.55)", opacity: peak * 0.8, offset: 0.35, easing: "cubic-bezier(0.3, 0.4, 0.5, 1)" },
    { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
  ], { duration: strong ? 900 : 1300 }).finished.catch(() => {}).finally(() => light.remove());
}

function bindGlassBlooms() {
  const lastEnter = new WeakMap();
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    const glass = event.target.closest?.(HOVER_BLOOM);
    if (!glass || glass.contains(event.relatedTarget)) return;
    const now = performance.now();
    if (now - (lastEnter.get(glass) || 0) < 900) return; // no bloom storm when skimming along an edge
    lastEnter.set(glass, now);
    glassBloom(glass, event.clientX, event.clientY, false);
  });
  document.addEventListener("pointerdown", (event) => {
    const glass = event.target.closest?.(BLOOM_HOSTS);
    if (glass && getComputedStyle(glass).overflow !== "visible") glassBloom(glass, event.clientX, event.clientY, true);
  });
}

export function initPointer() {
  const canvas = document.getElementById("twin-canvas");
  const controls = getControls();

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    if (press) {
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (moved > 5 && !lensActive) { press.dragging = true; window.clearTimeout(press.holdTimer); canvas.classList.add("is-dragging"); hideMarkerTip(); }
      if (lensActive) {
        const hit = pick(event.clientX, event.clientY, { selectableOnly: false });
        if (hit.surface) lensMove(hit.surface);
      }
      return;
    }
    if (event.pointerType === "touch" || !sceneState.ready) return;
    const marker = sceneState.sensorMode === "all" ? nearestMarker(event.clientX - rect.left, event.clientY - rect.top, markerRadius()) : null;
    setHovered(marker);
    showMarkerTip(marker, rect);
    let hoverItem = null;
    if (!marker && ui.view === "devices") hoverItem = pick(event.clientX, event.clientY).item;
    hoverOutline(hoverItem && !(ui.selection?.kind === "ifc" && ui.selection.key === `${hoverItem.modelId}:${hoverItem.localId}`) ? hoverItem : null);
    canvas.classList.toggle("is-pointing", Boolean(marker || hoverItem));
  });

  canvas.addEventListener("pointerleave", () => { hideMarkerTip(); if (!press) { setHovered(null); hoverOutline(null); } });
  canvas.addEventListener("wheel", hideMarkerTip, { passive: true });

  canvas.addEventListener("pointerdown", (event) => {
    if (!sceneState.ready || event.button > 0) return;
    if (popoverOpen()) closePopover();
    press = { x: event.clientX, y: event.clientY, time: performance.now(), dragging: false, id: event.pointerId };
    // Hold still for 400 ms: the lens. Orbiting is disabled while the lens is on.
    press.holdTimer = window.setTimeout(() => {
      if (!press || press.dragging || picking) return;
      const hit = pick(press.x, press.y, { selectableOnly: false });
      if (!hit.surface) return;
      lensActive = true;
      controls.enabled = false;
      lensStart(hit.surface);
    }, 400);
  });

  const release = (event) => {
    if (!press || press.id !== event.pointerId) return;
    window.clearTimeout(press.holdTimer);
    canvas.classList.remove("is-dragging");
    const { x, y, time, dragging } = press;
    press = null;
    if (lensActive) { lensActive = false; controls.enabled = true; lensEnd(); return; }
    if (event.type === "pointercancel" || dragging) return;
    const rect = canvas.getBoundingClientRect();
    if (performance.now() - time > 400) return;
    handleClick(x, y, rect, event.pointerType);
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  bindGlassBlooms();

  // Glass sheen and button press feedback.
  let sheenFrame = 0;
  document.addEventListener("pointermove", (event) => {
    if (coarsePointer() || settings.transparency === "reduced") return;
    cancelAnimationFrame(sheenFrame);
    sheenFrame = requestAnimationFrame(() => {
      const glass = event.target.closest?.(".glass-thin, .glass-thick");
      document.querySelectorAll(".is-lit").forEach((element) => { if (element !== glass) element.classList.remove("is-lit"); });
      if (!glass) return;
      const rect = glass.getBoundingClientRect();
      glass.style.setProperty("--px", `${event.clientX - rect.left}px`);
      glass.style.setProperty("--py", `${event.clientY - rect.top}px`);
      glass.classList.add("is-lit");
    });
  }, { passive: true });
  document.addEventListener("pointerdown", (event) => {
    const button = event.target.closest?.(".tw-button, .tw-icon-button, .tw-capsule, .tw-alarm-capsule, .tw-ai-card, .tw-device, .tw-tab, .tw-stat, .tw-tag, .tw-seg button, .tw-segmented button, .tw-feedback-buttons button, .tw-details-toggle, .tw-reset-view");
    button?.classList.add("is-pressed");
    // Pressing a tab or a language option lifts the selection lens out of its bar.
    event.target.closest?.(".tw-tabbar, .tw-segmented")?.classList.add("is-pressing");
    if (coarsePointer()) {
      // Touch: a one-off soft highlight where the finger lands.
      const glass = event.target.closest?.(".glass-thin, .glass-thick");
      if (glass) {
        const rect = glass.getBoundingClientRect();
        glass.style.setProperty("--px", `${event.clientX - rect.left}px`);
        glass.style.setProperty("--py", `${event.clientY - rect.top}px`);
        glass.classList.add("is-touch-lit");
        window.setTimeout(() => glass.classList.remove("is-touch-lit"), 450);
      }
    }
  });
  const unpress = () => document.querySelectorAll(".is-pressed, .is-pressing").forEach((element) => element.classList.remove("is-pressed", "is-pressing"));
  document.addEventListener("pointerup", unpress);
  document.addEventListener("pointercancel", unpress);
}

function handleClick(clientX, clientY, rect, pointerType) {
  if (picking) {
    const hit = pick(clientX, clientY, { selectableOnly: false });
    if (hit.surface) picking(hit.surface);
    return;
  }
  // A marker within the magnetic radius wins; clicking it never triggers the digital layer.
  const marker = sceneState.sensorMode === "all" ? (pointerType === "touch" ? nearestMarker(clientX - rect.left, clientY - rect.top, markerRadius()) : hoveredMarker() || nearestMarker(clientX - rect.left, clientY - rect.top, markerRadius())) : null;
  if (marker && (marker.kind === "sensor" || marker.kind === "seat")) {
    marker.el.classList.remove("is-flashing");
    void marker.el.offsetWidth;
    marker.el.classList.add("is-flashing");
    select({ kind: "sensor", id: marker.id });
    return;
  }
  const hit = pick(clientX, clientY);
  if (hit.item) {
    if (hit.deviceId) select({ kind: "sensor", id: hit.deviceId });
    else select({ kind: "ifc", key: `${hit.item.modelId}:${hit.item.localId}` });
    return;
  }
  if (hit.surface) ripple(hit.surface);
}
