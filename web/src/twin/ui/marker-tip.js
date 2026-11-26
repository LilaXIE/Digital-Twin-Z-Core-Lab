// Hover card for scene markers: as soon as the pointer rests on a sensor (or a seat), a small glass
// card beside it names the device: its ID, what kind of sensor it is and its state. The readings
// themselves open with a click (the sensor sheet).
import { t, pick } from "../i18n.js";
import { deviceById } from "../data/devices.js";
import { deviceState, seatOccupancy } from "../data/derived.js";
import { escapeHtml } from "./dom.js";
import { onAfterRender, getCanvas } from "../scene/viewer.js";
import { hoveredMarker } from "../scene/markers.js";
import { on } from "../state.js";

let tip = null;
let shownId = null;
let hideTimer = 0;

function element() {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "tw-marker-tip glass-thick";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.appendChild(tip);
  return tip;
}

function content(id, kind) {
  const device = deviceById(id);
  if (!device) return null;
  const state = deviceState(id);
  let stateText = t(state.key);
  if (kind === "seat" && state.online) {
    const occupied = seatOccupancy(id);
    stateText = occupied === null ? t(state.key) : t(occupied ? "occupied" : "vacant");
  }
  return `<strong class="tw-num">${escapeHtml(device.id)}</strong>
    <span class="tw-marker-tip-type">${escapeHtml(pick(device.type))}</span>
    <span class="tw-marker-tip-state"><i class="tw-dot" data-level="${state.level}"></i>${escapeHtml(stateText)}</span>
    <small>${escapeHtml(t("hoverOpenHint"))}</small>`;
}

// marker: { id, kind, x, y } in canvas pixels, or null to hide.
export function showMarkerTip(marker, canvasRect) {
  const card = element();
  window.clearTimeout(hideTimer);
  if (!marker || !["sensor", "seat"].includes(marker.kind)) { hideMarkerTip(); return; }
  if (shownId !== marker.id || card.hidden) {
    const html = content(marker.id, marker.kind);
    if (!html) { hideMarkerTip(); return; }
    card.innerHTML = html;
    shownId = marker.id;
    card.hidden = false;
    card.classList.remove("is-shown");
    void card.offsetWidth; // restart the pop-in
    card.classList.add("is-shown");
  }
  place(card, marker, canvasRect);
}

function place(card, marker, rect) {
  const gap = 18;
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  const x = rect.left + marker.x;
  const y = rect.top + marker.y;
  // Right of the marker by default; left when that would leave the window. Vertically centred.
  const right = x + gap + width <= window.innerWidth - 8;
  const left = right ? x + gap : x - gap - width;
  const top = Math.min(window.innerHeight - height - 8, Math.max(8, y - height / 2));
  card.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  card.style.setProperty("--tip-origin", right ? "left center" : "right center");
}

// A new view or an opened sheet takes over: the card goes.
on("view", () => hideMarkerTip());
on("select", () => hideMarkerTip());

// The card follows its marker while the camera eases or sways.
onAfterRender(() => {
  if (!tip || tip.hidden || !shownId) return;
  const marker = hoveredMarker();
  if (!marker || marker.id !== shownId) return;
  if (!marker.onScreen) { hideMarkerTip(); return; }
  place(tip, marker, getCanvas().getBoundingClientRect());
});

export function hideMarkerTip() {
  if (!tip || tip.hidden) return;
  shownId = null;
  tip.classList.remove("is-shown");
  hideTimer = window.setTimeout(() => { tip.hidden = true; }, 140);
}
