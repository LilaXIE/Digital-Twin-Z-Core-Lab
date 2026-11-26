// AI assistant (frontend). Three ways in: the ask box on the Overview, the floating button at the
// bottom right (a compact window) and the full assistant page (the window expanded, or #assistant).
// The AI tab stays the fresh-air control and forecast page; the assistant is the conversational way
// to ask about anything on the twin, that page included.
//
// Every answer arrives with the same rhythm, driven by events from the bridge (data/bridge.js):
//   step      a line per tool call, ticked off when it finishes   { kind: "step", id, label, state }
//   text      the answer, revealed letter by letter               { kind: "text", delta }
//   card      a figure that springs in under the text             { kind: "card", card: { title, value, unit, note, level } }
//   sources   where the answer comes from, as small tags          { kind: "sources", items: [{ label }] }
//   followups questions to ask next, as chips                     { kind: "followups", items: [string] }
//   done / error
// No model is connected yet: the assistant says so plainly and never invents an answer.
import { t, getLang } from "../i18n.js";
import { ui, on } from "../state.js";
import { provider } from "../data/store.js";
import { escapeHtml, icon } from "./dom.js";

const $ = (selector, root = document) => root.querySelector(selector);
let windowEl = null;
let logEl = null;
let pending = null; // { id, message } while an answer is streaming
const thread = [];

const SUGGESTIONS = ["askSuggestAir", "askSuggestSaving", "askSuggestAi", "askSuggestSensors"];

function build() {
  // Ask box on the Overview, just above the tab bar.
  document.body.insertAdjacentHTML("beforeend", `
    <form class="tw-ask" id="ask-box" autocomplete="off" role="search">
      <span class="tw-ask-orb" aria-hidden="true">${icon("ph-sparkle")}</span>
      <input id="ask-input" type="text" maxlength="400" enterkeyhint="send">
      <button type="submit" class="tw-ask-send" data-part="send" disabled>${icon("ph-arrow-up")}</button>
      <div class="tw-ask-suggest" id="ask-suggest"></div>
    </form>
    <button type="button" class="tw-assistant-fab" id="assistant-fab">${icon("ph-sparkle")}</button>
    <section class="tw-assistant" id="assistant" role="dialog" aria-labelledby="assistant-title" hidden>
      <header class="tw-assistant-head">
        <span class="tw-ask-orb" aria-hidden="true">${icon("ph-sparkle")}</span>
        <div><h2 id="assistant-title"></h2><p data-part="sub"></p></div>
        <button type="button" class="tw-icon-button" data-action="new">${icon("ph-note-pencil")}</button>
        <button type="button" class="tw-icon-button" data-action="expand">${icon("ph-arrows-out-simple")}</button>
        <button type="button" class="tw-icon-button" data-action="close">${icon("ph-x")}</button>
      </header>
      <div class="tw-assistant-log" id="assistant-log" aria-live="polite"></div>
      <form class="tw-assistant-input" id="assistant-form" autocomplete="off">
        <textarea rows="1" maxlength="400" enterkeyhint="send"></textarea>
        <button type="submit" class="tw-ask-send" disabled>${icon("ph-arrow-up")}</button>
      </form>
    </section>`);
  windowEl = $("#assistant");
  logEl = $("#assistant-log");

  const box = $("#ask-box");
  const input = $("#ask-input");
  input.addEventListener("input", () => { box.querySelector('[data-part="send"]').disabled = !input.value.trim(); });
  box.addEventListener("submit", (event) => { event.preventDefault(); const q = input.value.trim(); if (!q) return; input.value = ""; input.blur(); box.querySelector('[data-part="send"]').disabled = true; openAssistant(); ask(q); });
  input.addEventListener("focus", () => box.classList.add("is-open"));
  input.addEventListener("blur", () => setTimeout(() => box.classList.remove("is-open"), 160));
  $("#ask-suggest").addEventListener("pointerdown", (event) => {
    const chip = event.target.closest("[data-q]");
    if (!chip) return;
    event.preventDefault();
    input.blur();
    openAssistant();
    ask(chip.dataset.q);
  });

  $("#assistant-fab").addEventListener("click", () => (windowEl.hidden ? openAssistant() : closeAssistant()));
  windowEl.querySelector('[data-action="close"]').addEventListener("click", () => closeAssistant());
  windowEl.querySelector('[data-action="expand"]').addEventListener("click", () => setPage(!windowEl.classList.contains("is-page")));
  windowEl.querySelector('[data-action="new"]').addEventListener("click", () => { cancelPending(); thread.length = 0; renderEmpty(); });
  const form = $("#assistant-form");
  const area = form.querySelector("textarea");
  const grow = () => { area.style.height = "auto"; area.style.height = `${Math.min(area.scrollHeight, 128)}px`; form.querySelector("button").disabled = !area.value.trim(); };
  area.addEventListener("input", grow);
  area.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
  form.addEventListener("submit", (event) => { event.preventDefault(); const q = area.value.trim(); if (!q || pending) return; area.value = ""; grow(); ask(q); });
  logEl.addEventListener("click", (event) => { const chip = event.target.closest("[data-q]"); if (chip && !pending) ask(chip.dataset.q); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !windowEl.hidden) closeAssistant(); });
  window.addEventListener("hashchange", fromHash);
}

function relabel() {
  $("#ask-input").placeholder = t("askPlaceholder");
  $("#ask-input").setAttribute("aria-label", t("askPlaceholder"));
  $("#ask-box [data-part='send']").setAttribute("aria-label", t("askSend"));
  $("#ask-suggest").innerHTML = SUGGESTIONS.map((key, index) => `<button type="button" class="tw-chip" data-q="${escapeHtml(t(key))}" style="--i:${index}">${escapeHtml(t(key))}</button>`).join("");
  $("#assistant-fab").setAttribute("aria-label", t("assistantTitle"));
  $("#assistant-fab").title = t("assistantTitle");
  $("#assistant-title").textContent = t("assistantTitle");
  windowEl.querySelector('[data-part="sub"]').textContent = t("assistantSub");
  windowEl.querySelector('[data-action="close"]').setAttribute("aria-label", t("close"));
  windowEl.querySelector('[data-action="new"]').setAttribute("aria-label", t("assistantNew"));
  windowEl.querySelector('[data-action="new"]').title = t("assistantNew");
  const page = windowEl.classList.contains("is-page");
  windowEl.querySelector('[data-action="expand"]').setAttribute("aria-label", t(page ? "collapse" : "expand"));
  windowEl.querySelector('[data-action="expand"]').title = t(page ? "collapse" : "expand");
  $("#assistant-form textarea").placeholder = t("assistantInput");
  if (!thread.length) renderEmpty();
}

function renderEmpty() {
  logEl.innerHTML = `<div class="tw-assistant-empty">
      <span class="tw-ask-orb is-large" aria-hidden="true">${icon("ph-sparkle")}</span>
      <h3>${escapeHtml(t("assistantHello"))}</h3>
      <p>${escapeHtml(t("assistantIntro"))}</p>
      <div class="tw-chips">${SUGGESTIONS.map((key, index) => `<button type="button" class="tw-chip" data-q="${escapeHtml(t(key))}" style="--i:${index}">${escapeHtml(t(key))}</button>`).join("")}</div>
    </div>`;
}

export function openAssistant({ page = false } = {}) {
  if (!windowEl) return;
  if (page) setPage(true);
  if (!windowEl.hidden) return;
  windowEl.hidden = false;
  document.body.toggleAttribute("data-assistant", true);
  $("#assistant-fab").innerHTML = icon("ph-x");
  document.body.toggleAttribute("data-assistant-page", windowEl.classList.contains("is-page"));
  windowEl.classList.remove("is-leaving");
  requestAnimationFrame(() => windowEl.classList.add("is-open"));
  setTimeout(() => $("#assistant-form textarea")?.focus({ preventScroll: true }), 220);
}

export function closeAssistant() {
  if (!windowEl || windowEl.hidden) return;
  windowEl.classList.remove("is-open");
  windowEl.classList.add("is-leaving");
  document.body.removeAttribute("data-assistant");
  document.body.removeAttribute("data-assistant-page");
  $("#assistant-fab").innerHTML = icon("ph-sparkle");
  if (window.location.hash === "#assistant") history.replaceState(null, "", window.location.pathname + window.location.search);
  setTimeout(() => { if (!windowEl.classList.contains("is-open")) { windowEl.hidden = true; windowEl.classList.remove("is-leaving"); setPage(false); } }, 260);
}

function setPage(page) {
  windowEl.classList.toggle("is-page", page);
  document.body.toggleAttribute("data-assistant-page", page && !windowEl.hidden);
  const button = windowEl.querySelector('[data-action="expand"]');
  button.innerHTML = icon(page ? "ph-arrows-in-simple" : "ph-arrows-out-simple");
  button.setAttribute("aria-label", t(page ? "collapse" : "expand"));
  button.title = t(page ? "collapse" : "expand");
}

function fromHash() {
  if (window.location.hash === "#assistant") openAssistant({ page: true });
}

// ---- One exchange ----
function cancelPending() {
  if (!pending) return;
  provider().cancelAssistant?.(pending.id);
  pending.stop?.();
  pending = null;
}

function scrollToEnd() { logEl.scrollTo({ top: logEl.scrollHeight, behavior: "smooth" }); }

function ask(question) {
  if (pending) return;
  if (!thread.length) logEl.innerHTML = "";
  thread.push({ role: "user", text: question });
  logEl.insertAdjacentHTML("beforeend", `<div class="tw-msg is-user"><p>${escapeHtml(question)}</p></div>`);
  logEl.insertAdjacentHTML("beforeend", `<div class="tw-msg is-assistant is-thinking">
      <ol class="tw-steps" data-part="steps"></ol>
      <div class="tw-answer" data-part="text"></div>
      <div class="tw-answer-cards" data-part="cards"></div>
      <div class="tw-sources" data-part="sources"></div>
      <div class="tw-chips" data-part="followups"></div>
    </div>`);
  const message = logEl.lastElementChild;
  scrollToEnd();
  const writer = typewriter(message.querySelector('[data-part="text"]'));
  const onEvent = (event) => handle(message, writer, event);
  const id = provider().askAssistant?.(question, { lang: getLang(), view: ui.view }, onEvent);
  pending = { id, message, stop: writer.stop };
  if (id) return;
  // Not connected: show the one honest step and say so.
  onEvent({ kind: "step", id: "connect", label: t("assistantStepConnect"), state: "run" });
  setTimeout(() => {
    onEvent({ kind: "step", id: "connect", label: t("assistantStepConnect"), state: "fail" });
    onEvent({ kind: "text", delta: t("assistantOffline") });
    onEvent({ kind: "done" });
  }, 700);
}

function handle(message, writer, event) {
  const part = (name) => message.querySelector(`[data-part="${name}"]`);
  switch (event.kind) {
    case "step": {
      const steps = part("steps");
      let row = steps.querySelector(`[data-step="${CSS.escape(String(event.id))}"]`);
      if (!row) { steps.insertAdjacentHTML("beforeend", `<li data-step="${escapeHtml(String(event.id))}"><i class="tw-step-mark" aria-hidden="true"></i><span></span></li>`); row = steps.lastElementChild; }
      row.querySelector("span").textContent = event.label || "";
      row.dataset.state = event.state || "run";
      break;
    }
    case "text":
      message.classList.remove("is-thinking");
      writer.push(event.delta || "");
      break;
    case "card": {
      const c = event.card || {};
      part("cards").insertAdjacentHTML("beforeend", `<article class="tw-answer-card"${c.level ? ` data-level="${escapeHtml(c.level)}"` : ""}><small>${escapeHtml(c.title || "")}</small><strong><span class="tw-num">${escapeHtml(String(c.value ?? ""))}</span>${c.unit ? `<span class="tw-unit">${escapeHtml(c.unit)}</span>` : ""}</strong>${c.note ? `<span>${escapeHtml(c.note)}</span>` : ""}</article>`);
      break;
    }
    case "sources":
      writer.then(() => { part("sources").innerHTML = (event.items || []).map((item, index) => `<span class="tw-source" style="--i:${index}">${icon("ph-database")}${escapeHtml(item.label || "")}</span>`).join(""); scrollToEnd(); });
      break;
    case "followups":
      writer.then(() => { part("followups").innerHTML = (event.items || []).map((q, index) => `<button type="button" class="tw-chip" data-q="${escapeHtml(q)}" style="--i:${index}">${escapeHtml(q)}</button>`).join(""); scrollToEnd(); });
      break;
    case "error":
      message.classList.remove("is-thinking");
      writer.push(event.message || t("assistantError"));
      // falls through
    case "done":
      writer.then(() => { message.classList.remove("is-thinking"); message.classList.add("is-done"); thread.push({ role: "assistant", text: writer.text() }); pending = null; });
      break;
    default:
      break;
  }
  scrollToEnd();
}

// Reveals text at a steady pace (a timer, not animation frames, so a busy 3D frame never stalls
// it); speeds up when a long reply is waiting.
function typewriter(element) {
  let queue = "";
  let shown = "";
  let timer = 0;
  let waiters = [];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tick = () => {
    const step = reduced ? queue.length : 1 + Math.floor(queue.length / 18);
    shown += queue.slice(0, step);
    queue = queue.slice(step);
    element.textContent = shown;
    if (queue) timer = setTimeout(tick, 24);
    else { timer = 0; const done = waiters; waiters = []; done.forEach((fn) => fn()); }
  };
  return {
    push(text) { queue += text; if (!timer) timer = setTimeout(tick, 24); },
    then(fn) { if (!queue && !timer) fn(); else waiters.push(fn); },
    text: () => shown + queue,
    stop() { clearTimeout(timer); timer = 0; queue = ""; waiters = []; },
  };
}

export function initAssistant() {
  build();
  relabel();
  fromHash();
  on("settings", relabel);
}
