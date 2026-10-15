// Small DOM helpers: escaping, number roll-over, panels and popovers that grow from their trigger.
import { reducedMotion } from "../state.js";
import { formatNumber, glossary } from "../i18n.js";

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export const icon = (name, extra = "") => `<i class="ph ${name}${extra ? ` ${extra}` : ""}" aria-hidden="true"></i>`;

// A dotted-underlined term with a glossary explanation (section 13.9).
export function term(key, text) {
  const entry = glossary(key);
  if (!entry) return escapeHtml(text);
  return `<span class="tw-term" tabindex="0" role="button" data-glossary="${key}">${escapeHtml(text ?? entry[0])}</span>`;
}

// Numbers roll from the old value to the new one over 600 ms, only when a new reading arrives.
const rolling = new WeakMap();
export function rollNumber(element, value, { digits = null, format = null } = {}) {
  if (!element) return;
  const render = (v) => (format ? format(v) : formatNumber(v, digits));
  const previous = Number(element.dataset.value);
  element.dataset.value = String(value);
  if (!Number.isFinite(value)) { element.textContent = ""; return; }
  if (!Number.isFinite(previous) || previous === value || reducedMotion()) { element.textContent = render(value); return; }
  cancelAnimationFrame(rolling.get(element));
  const start = performance.now();
  const step = (now) => {
    const x = Math.min(1, (now - start) / 600);
    const eased = 1 - (1 - x) ** 3;
    element.textContent = render(previous + (value - previous) * eased);
    if (x < 1) rolling.set(element, requestAnimationFrame(step));
    else element.textContent = render(value);
  };
  rolling.set(element, requestAnimationFrame(step));
}

// Open an element so it appears to grow out of its trigger (scale + move + fade).
export function growFrom(element, origin, { duration = 450, distance = 1 } = {}) {
  element.hidden = false;
  if (!origin || reducedMotion()) {
    element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 200 : 180, easing: "ease-out" });
    return;
  }
  const target = element.getBoundingClientRect();
  const source = origin.getBoundingClientRect ? origin.getBoundingClientRect() : origin;
  const dx = (source.left + source.width / 2 - (target.left + target.width / 2)) * distance;
  const dy = (source.top + source.height / 2 - (target.top + target.height / 2)) * distance;
  const scale = Math.max(0.12, Math.min(0.6, Math.max(source.width / target.width, source.height / target.height)));
  element.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
    { transform: "none", opacity: 1 },
  ], { duration, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
}

export function shrinkTo(element, origin, { duration = 320 } = {}) {
  if (element.hidden) return Promise.resolve();
  if (!origin || reducedMotion()) {
    const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
    return animation.finished.then(() => { element.hidden = true; }).catch(() => { element.hidden = true; });
  }
  const target = element.getBoundingClientRect();
  const source = origin.getBoundingClientRect ? origin.getBoundingClientRect() : origin;
  const dx = source.left + source.width / 2 - (target.left + target.width / 2);
  const dy = source.top + source.height / 2 - (target.top + target.height / 2);
  const scale = Math.max(0.12, Math.min(0.6, Math.max(source.width / target.width, source.height / target.height)));
  const animation = element.animate([
    { transform: "none", opacity: 1 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
  ], { duration, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
  return animation.finished.then(() => { element.hidden = true; }).catch(() => { element.hidden = true; });
}

// Place a popover next to its trigger, inside the viewport.
export function placeNear(popover, trigger, { align = "end", gap = 8 } = {}) {
  popover.hidden = false;
  popover.style.left = "0px";
  popover.style.top = "0px";
  const anchor = trigger.getBoundingClientRect();
  const box = popover.getBoundingClientRect();
  const margin = 12;
  let left = align === "start" ? anchor.left : align === "center" ? anchor.left + anchor.width / 2 - box.width / 2 : anchor.right - box.width;
  left = Math.max(margin, Math.min(window.innerWidth - box.width - margin, left));
  let top = anchor.bottom + gap;
  if (top + box.height > window.innerHeight - margin) top = Math.max(margin, anchor.top - box.height - gap);
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.transformOrigin = `${anchor.left + anchor.width / 2 - left}px ${anchor.top < top ? 0 : box.height}px`;
}

// Close-on-outside-click / Escape for one popover at a time.
let openPopover = null;
export function openAsPopover(popover, trigger, { onClose, align } = {}) {
  closePopover();
  placeNear(popover, trigger, { align });
  growFrom(popover, trigger, { duration: 250 });
  trigger?.setAttribute("aria-expanded", "true");
  const outside = (event) => { if (!popover.contains(event.target) && !trigger?.contains(event.target)) closePopover(); };
  const escape = (event) => { if (event.key === "Escape") { closePopover(); trigger?.focus(); } };
  window.setTimeout(() => { document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", escape); }, 0);
  openPopover = { popover, trigger, onClose, outside, escape };
}

export function closePopover() {
  if (!openPopover) return false;
  const { popover, trigger, onClose, outside, escape } = openPopover;
  openPopover = null;
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("keydown", escape);
  trigger?.setAttribute("aria-expanded", "false");
  void shrinkTo(popover, trigger, { duration: 200 });
  onClose?.();
  return true;
}
export const popoverOpen = () => Boolean(openPopover);

export function toast(message, { icon: iconName = "ph-check-circle", duration = 2600 } = {}) {
  const element = $("#toast");
  element.innerHTML = `${icon(iconName)}<span>${escapeHtml(message)}</span>`;
  element.hidden = false;
  window.clearTimeout(element._timer);
  element._timer = window.setTimeout(() => { element.hidden = true; }, duration);
}
