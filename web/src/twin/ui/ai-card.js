// AI recommendation card (section 7.1): recommended outdoor air and damper, the 60-minute CO₂ peak
// and the reason. A new recommendation rolls the numbers and sweeps a soft highlight once.
import { t, clockTime } from "../i18n.js";
import { ui, setView, on } from "../state.js";
import { recommendationState } from "../data/derived.js";
import { escapeHtml, icon, rollNumber } from "./dom.js";
import { ahuOff, dayTime, reasonText } from "./ai-text.js";

let lastGenerated = null;

export function renderAiCard() {
  const card = document.getElementById("ai-card");
  const { rec, stale, valid } = recommendationState();
  card.setAttribute("aria-label", t("aiOpen"));
  if (ui.replay) { card.hidden = true; return; }
  card.hidden = false;
  if (!card.dataset.built) {
    card.dataset.built = "1";
    card.innerHTML = `<span class="tw-sweep" aria-hidden="true"></span>
      <header><span>${icon("ph-sparkle")}<span data-part="title"></span></span>${icon("ph-arrows-out-simple")}</header>
      <div class="tw-ai-value"><span class="tw-num" data-part="lps"></span><span class="tw-unit">L/s</span></div>
      <div class="tw-ai-value tw-ai-off" data-part="off" hidden></div>
      <div class="tw-ai-meta"><span data-part="damper"></span><span data-part="peak"></span></div>
      <p class="tw-ai-reason" data-part="reason"></p>
      <p class="tw-ai-note" data-part="note" hidden></p>`;
  }
  card.querySelector('[data-part="title"]').textContent = t("aiTitle");
  const note = card.querySelector('[data-part="note"]');
  const lps = card.querySelector('[data-part="lps"]');
  const off = card.querySelector('[data-part="off"]');
  off.hidden = true;
  if (!rec) {
    lps.textContent = "";
    lps.parentElement.hidden = true;
    card.querySelector('[data-part="damper"]').textContent = "";
    card.querySelector('[data-part="peak"]').textContent = "";
    card.querySelector('[data-part="reason"]').textContent = t("aiWaiting");
    note.hidden = true;
    card.classList.remove("is-stale");
    return;
  }
  if (!valid) {
    lps.parentElement.hidden = true;
    card.querySelector('[data-part="damper"]').textContent = "";
    card.querySelector('[data-part="peak"]').textContent = "";
    card.querySelector('[data-part="reason"]').textContent = reasonText(rec);
    note.hidden = true;
    return;
  }
  // After hours the AHU supplies no outdoor air: say so instead of showing an airflow nobody can set.
  if (ahuOff(rec)) {
    lps.parentElement.hidden = true;
    off.hidden = false;
    off.textContent = t("ahuOffTitle");
    card.querySelector('[data-part="damper"]').textContent = rec.ahu.nextStart ? t("ahuNextStart", { when: dayTime(Date.parse(rec.ahu.nextStart)) }) : "";
    card.querySelector('[data-part="peak"]').textContent = Number.isFinite(rec.ahu.ppmAtNextStart) ? t("ahuStartCo2", { v: rec.ahu.ppmAtNextStart }) : "";
    card.querySelector('[data-part="reason"]').textContent = t("ahuOffNoSavings");
    card.classList.toggle("is-stale", stale);
    note.hidden = !stale;
    note.textContent = stale ? t("aiInterrupted", { time: clockTime(Date.parse(rec.generatedAt)) }) : "";
    lastGenerated = rec.generatedAt;
    return;
  }
  lps.parentElement.hidden = false;
  rollNumber(lps, rec.airflow.recommendedLps, { digits: 0 });
  card.querySelector('[data-part="damper"]').textContent = t("aiDamper", { pct: rec.airflow.recommendedDamperPct });
  card.querySelector('[data-part="peak"]').textContent = `${t("aiPeak")} ${rec.co2.peakRecommended} ppm`;
  card.querySelector('[data-part="reason"]').textContent = reasonText(rec);
  // Interrupted updates keep the last recommendation, greyed, with its time (never a dash).
  card.classList.toggle("is-stale", stale);
  note.hidden = !stale && !rec.airflow.atMax;
  note.textContent = stale ? t("aiInterrupted", { time: clockTime(Date.parse(rec.generatedAt)) }) : t("aiAtMax");
  if (lastGenerated && lastGenerated !== rec.generatedAt && !stale) {
    card.classList.remove("is-sweeping");
    void card.offsetWidth;
    card.classList.add("is-sweeping");
  }
  lastGenerated = rec.generatedAt;
}

export function initAiCard() {
  const card = document.getElementById("ai-card");
  card.addEventListener("click", () => setView("ai"));
  card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setView("ai"); } });
  on("data", (event) => { if (!event || ["recommendation", "dataset", "connection"].includes(event.kind)) renderAiCard(); });
  on("settings", renderAiCard);
  on("replay", renderAiCard);
  window.setInterval(renderAiCard, 60000);
  renderAiCard();
}

export { escapeHtml };
