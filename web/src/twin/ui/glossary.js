// Term explanations (section 13.9): hover on desktop, tap on touch; tap elsewhere to close.
import { glossary } from "../i18n.js";
import { escapeHtml, placeNear, growFrom } from "./dom.js";
import { coarsePointer } from "../state.js";

let current = null;

function show(trigger) {
  const entry = glossary(trigger.dataset.glossary);
  if (!entry) return;
  const tip = document.getElementById("glossary-tip");
  tip.innerHTML = `<strong>${escapeHtml(entry[0])}</strong>${escapeHtml(entry[1])}`;
  placeNear(tip, trigger, { align: "center", gap: 6 });
  if (current !== trigger) growFrom(tip, trigger, { duration: 200 });
  current = trigger;
}

function hide() {
  document.getElementById("glossary-tip").hidden = true;
  current = null;
}

export function initGlossary() {
  document.addEventListener("pointerover", (event) => {
    if (coarsePointer()) return;
    const trigger = event.target.closest?.("[data-glossary]");
    if (trigger) show(trigger);
  });
  document.addEventListener("pointerout", (event) => {
    if (coarsePointer()) return;
    const trigger = event.target.closest?.("[data-glossary]");
    if (trigger && !trigger.contains(event.relatedTarget)) hide();
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-glossary]");
    if (trigger) {
      event.stopPropagation();
      if (current === trigger && coarsePointer()) hide(); else show(trigger);
      return;
    }
    if (current) hide();
  }, true);
  document.addEventListener("focusin", (event) => { if (event.target.matches?.("[data-glossary]")) show(event.target); });
  document.addEventListener("focusout", (event) => { if (event.target.matches?.("[data-glossary]")) hide(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
}
