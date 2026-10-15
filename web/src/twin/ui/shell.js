// The home layer (section 4): identity, up to four status capsules, the one-line status,
// mode badges, the alarm capsule, the language switch, tools and the tab bar.
import { t, ago, clockTime, formatNumber, getLang, pick } from "../i18n.js";
import { ui, settings, setView, setFocusMetric, emit, on, updateSetting, coarsePointer } from "../state.js";
import { data } from "../data/store.js";
import { roomMetric, metricStatus, occupancyInfo, lastReadingAt, alarms, socketDevices, socketInfo, safetyFacts, recommendationState, roomSeries } from "../data/derived.js";
import { isWorkingTime, thresholds } from "../config/site.js";
import { roomState, sentenceText } from "./room-state.js";
import { $, $$, escapeHtml, rollNumber, term } from "./dom.js";
import { sparkline } from "./charts/timeline.js";
import { daylightState } from "../scene/daylight.js";
import { startReplay } from "../data/replay.js";

const CAPSULES = [
  { key: "co2", unit: "ppm", digits: 0, glossary: "co2" },
  { key: "temperature", unit: "°", digits: 1 },
  { key: "humidity", unit: "%", digits: 0, glossary: "humidity" },
  { key: "occupancy", unit: "", digits: 0, glossary: "estimated" },
];

function capsuleData(spec) {
  if (spec.key === "occupancy") {
    const info = occupancyInfo();
    if (!info) return null; // no occupancy source: the capsule is not shown at all
    return { value: info.count, label: t(info.measured ? "occupancy" : "occupancyEstimated"), measured: info.measured, at: info.at, stale: false, status: null };
  }
  const metric = roomMetric(spec.key);
  if (metric.value === null) return null;
  return { value: metric.value, label: t(spec.key), at: metric.at, stale: metric.stale, status: metricStatus(spec.key, metric.value) };
}

function renderCapsules() {
  const host = $("#capsules");
  const items = CAPSULES.map((spec) => ({ spec, info: capsuleData(spec) })).filter((item) => item.info);
  const ids = items.map((item) => item.spec.key).join(",");
  if (host.dataset.ids !== ids) {
    host.dataset.ids = ids;
    host.innerHTML = items.map(({ spec }) => `
      <div class="tw-capsule-wrap" role="listitem" data-key="${spec.key}">
        <button type="button" class="tw-capsule glass-thin" data-capsule="${spec.key}" aria-describedby="capsule-detail-${spec.key}">
          ${spec.key === "occupancy" ? '<i class="ph ph-users-three tw-capsule-icon" aria-hidden="true"></i>' : '<span class="tw-dot" aria-hidden="true"></span>'}
          <span class="tw-capsule-value"><span class="tw-num" data-role="value"></span><span class="tw-unit">${spec.unit}</span></span>
          <span class="tw-capsule-label" data-role="label"></span>
        </button>
        <div class="tw-capsule-detail glass-thin">
          <div id="capsule-detail-${spec.key}" role="tooltip" data-role="detail"></div>
          ${spec.key === "co2" ? `<button type="button" class="tw-button tw-button-small" data-action="replay"><i class="ph ph-clock-counter-clockwise" aria-hidden="true"></i><span data-i18n="replay24h">${escapeHtml(t("replay24h"))}</span></button>` : ""}
        </div>
      </div>`).join("");
    for (const wrap of $$(".tw-capsule-wrap", host)) bindCapsule(wrap);
  }
  for (const { spec, info } of items) {
    const wrap = host.querySelector(`[data-key="${spec.key}"]`);
    const button = wrap.querySelector(".tw-capsule");
    const level = info.stale ? "stale" : info.status?.level || "stale";
    const dot = button.querySelector(".tw-dot");
    if (dot) dot.dataset.level = level;
    button.classList.toggle("is-stale", info.stale);
    const valueEl = button.querySelector('[data-role="value"]');
    if (ui.replay) valueEl.textContent = formatNumber(info.value, spec.digits); // replay jumps to each real sample
    else rollNumber(valueEl, info.value, { digits: spec.digits });
    const statusWord = info.stale ? t("stale") : info.status ? t(info.status.word) : "";
    // The word beside the dot is the status; the unit tells the metrics apart (occupancy has its icon).
    button.querySelector('[data-role="label"]').textContent = spec.key === "occupancy" ? (info.measured ? "" : t("estimatedShort")) : statusWord;
    button.setAttribute("aria-label", `${info.label} ${formatNumber(info.value, spec.digits)} ${spec.unit} ${statusWord} · ${t("capsuleHint")}`);
    renderCapsuleDetail(wrap.querySelector('[data-role="detail"]'), spec, info);
    const replayButton = wrap.querySelector('[data-action="replay"]');
    if (replayButton) replayButton.hidden = Boolean(ui.replay);
  }
}

function renderCapsuleDetail(element, spec, info) {
  const history = data().roomHistory;
  const points = spec.key === "occupancy" ? [] : roomSeries(history, spec.key).map((p) => ({ t: p.t, v: p.v }));
  const limit = spec.key === "co2" ? thresholds.co2.goodBelow : null;
  const title = spec.glossary ? term(spec.key === "occupancy" && info.measured ? null : spec.glossary, info.label) : escapeHtml(info.label);
  element.innerHTML = `
    <header><span>${title}</span><span>${points.length ? escapeHtml(t("last24h")) : ""}</span></header>
    ${points.length ? sparkline(points, { limit }) : ""}
    <p>${escapeHtml(info.at ? ago(info.at) : "")}</p>`;
}

let openDetail = null;
function bindCapsule(wrap) {
  const button = wrap.querySelector(".tw-capsule");
  const open = () => { if (coarsePointer() || document.documentElement.dataset.tier === "narrow") return; openDetail?.classList.remove("is-open"); wrap.classList.add("is-open"); openDetail = wrap; };
  const close = () => { wrap.classList.remove("is-open"); if (openDetail === wrap) openDetail = null; };
  wrap.addEventListener("pointerenter", open);
  wrap.addEventListener("pointerleave", close);
  button.addEventListener("focus", open);
  // Focus may move from the capsule to the replay button inside the detail without closing it.
  wrap.addEventListener("focusout", (event) => { if (!wrap.contains(event.relatedTarget)) close(); });
  wrap.querySelector('[data-action="replay"]')?.addEventListener("click", () => { close(); void startReplay(); });
  button.addEventListener("click", () => {
    close();
    const key = wrap.dataset.key;
    if (key !== "occupancy") setFocusMetric(key);
    setView("environment");
  });
}

function renderSentence() {
  const element = $("#sentence");
  if (ui.replay) { element.textContent = ""; return; }
  const co2 = roomMetric("co2");
  const history = data().roomHistory;
  let rise = null;
  const series = roomSeries(history, "co2");
  if (series.length > 3 && Date.now() - series.at(-1).t < 30 * 60000) {
    const recent = series.at(-1).v;
    const earlier = series.find((p) => p.t >= series.at(-1).t - 30 * 60000)?.v;
    if (Number.isFinite(earlier)) rise = recent - earlier;
  }
  const { rec, stale, valid } = recommendationState();
  const result = roomState({
    working: isWorkingTime(),
    occupancy: occupancyInfo(),
    co2: co2.stale ? null : co2.value,
    co2Rise30: rise,
    sockets: socketDevices().map((device) => socketInfo(device.id)),
    safety: safetyFacts(),
    recommendation: valid && !stale ? rec : null,
  });
  ui.roomState = result;
  const text = sentenceText(result, t, getLang());
  if (element.textContent !== text) element.textContent = text;
}

function renderIdentity() {
  const dataset = data();
  const live = $("#live-status");
  const last = lastReadingAt();
  const label = live.querySelector("span");
  live.classList.remove("is-delayed", "is-connecting");
  if (ui.replay) {
    label.textContent = t("badgeReplay", { time: clockTime(ui.replay.t) });
  } else if (!dataset.connection.connected && !last) {
    live.classList.add("is-connecting");
    label.textContent = dataset.connection.known ? t("bridgeDown") : t("connecting");
  } else if (!last) {
    live.classList.add("is-connecting");
    label.textContent = t("waitingData");
  } else if (Date.now() - last > 15 * 60000 || !dataset.connection.connected) {
    live.classList.add("is-delayed");
    label.textContent = t("dataDelayed", { time: clockTime(last) });
  } else {
    label.textContent = `${t("live")} · ${t("updatedAgo", { ago: ago(last) })}`;
  }
  const outdoor = dataset.outdoor;
  const daylight = daylightState();
  const temperature = Number.isFinite(outdoor?.temperature) ? `${formatNumber(outdoor.temperature, 0)}°` : null;
  const sky = daylight?.sky && !daylight.dark ? t(daylight.sky) : null;
  $("#outdoor-line").textContent = temperature ? (sky ? t("outdoorLineSky", { temp: temperature, sky }) : t("outdoorLine", { temp: temperature })) : "";
  const clock = $("#hk-clock");
  const now = Date.now();
  clock.textContent = `${t("hkTime")} ${clockTime(now)}`;
  clock.dateTime = new Date(now).toISOString();
  const stats = dataset.readingStats;
  const statsLine = $("#stats-line");
  statsLine.hidden = !stats;
  if (stats) statsLine.textContent = t("statsLine", { sensors: stats.sensorsReporting, readings: stats.readingsToday.toLocaleString("en-US") });
}

function renderBadges() {
  const host = $("#badges");
  const badges = [];
  if (settings.demo) badges.push(`<span class="tw-badge is-demo"><i class="ph ph-flask" aria-hidden="true"></i>${escapeHtml(t("badgeDemo"))}</span>`);
  if (ui.replay) {
    const time = new Date(ui.replay.t).toLocaleString(getLang() === "en" ? "en-GB" : getLang() === "zh-Hant" ? "zh-HK" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" });
    badges.push(`<span class="tw-badge is-replay"><i class="ph ph-clock-counter-clockwise" aria-hidden="true"></i>${escapeHtml(t("badgeReplay", { time }))}</span>`);
  }
  const html = badges.join("");
  if (host.innerHTML !== html) host.innerHTML = html;
}

function renderAlarmCapsule() {
  const active = alarms().filter((alarm) => alarm.state === "active");
  const button = $("#alarm-capsule");
  button.classList.toggle("has-alarms", active.length > 0);
  button.classList.toggle("is-critical", active.some((alarm) => alarm.level === "critical"));
  $("#alarm-text").textContent = active.length ? t("alarmsCount", { n: active.length }) : t("allClear");
}

// ---- Tab bar with a sliding glass thumb (drag it to another tab on touch or mouse) ----
function moveThumb(container, target, thumb) {
  if (!target) return;
  const box = container.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  thumb.style.width = `${rect.width}px`;
  thumb.style.transform = `translateX(${rect.left - box.left}px)`;
}

function renderTabs() {
  const tabbar = $("#tabbar");
  for (const tab of $$(".tw-tab", tabbar)) tab.setAttribute("aria-selected", String(tab.dataset.view === ui.view));
  moveThumb(tabbar, tabbar.querySelector(`[data-view="${ui.view}"]`), tabbar.querySelector(".tw-tab-thumb"));
  document.body.dataset.view = ui.view;
}

function bindTabs() {
  const tabbar = $("#tabbar");
  const thumb = tabbar.querySelector(".tw-tab-thumb");
  const tabs = $$(".tw-tab", tabbar);
  tabs.forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));
  tabbar.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const index = tabs.findIndex((tab) => tab.dataset.view === ui.view);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    setView(tabs[next].dataset.view);
  });
  let drag = null;
  tabbar.addEventListener("pointerdown", (event) => {
    const box = tabbar.getBoundingClientRect();
    drag = { id: event.pointerId, startX: event.clientX, moved: false, box };
  });
  tabbar.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && Math.abs(event.clientX - drag.startX) < 8) return;
    drag.moved = true;
    tabbar.classList.add("is-dragging");
    tabbar.setPointerCapture(event.pointerId);
    const width = thumb.getBoundingClientRect().width;
    const x = Math.max(5, Math.min(drag.box.width - width - 5, event.clientX - drag.box.left - width / 2));
    thumb.style.transition = "none";
    thumb.style.transform = `translateX(${x}px) scale(1.06)`;
  });
  const finish = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const moved = drag.moved;
    drag = null;
    tabbar.classList.remove("is-dragging");
    thumb.style.transition = "";
    if (!moved) return;
    const nearest = tabs.reduce((best, tab) => {
      const rect = tab.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - event.clientX);
      return !best || distance < best.distance ? { tab, distance } : best;
    }, null);
    if (nearest) { if (nearest.tab.dataset.view === ui.view) renderTabs(); else setView(nearest.tab.dataset.view); }
    event.preventDefault();
  };
  tabbar.addEventListener("pointerup", finish);
  tabbar.addEventListener("pointercancel", finish);
  window.addEventListener("resize", renderTabs);
}

function renderLang() {
  const host = $("#lang-switch");
  for (const button of $$("button", host)) button.setAttribute("aria-checked", String(button.dataset.lang === getLang()));
  moveThumb(host, host.querySelector(`[data-lang="${getLang()}"]`), host.querySelector(".tw-seg-thumb"));
}

function bindLang() {
  for (const button of $$("#lang-switch button")) button.addEventListener("click", () => updateSetting("lang", button.dataset.lang));
}

let frame = 0;
export function renderShell() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    renderIdentity();
    renderBadges();
    renderCapsules();
    renderSentence();
    renderAlarmCapsule();
    renderTabs();
    renderLang();
  });
}

export function initShell() {
  bindTabs();
  bindLang();
  on("data", renderShell);
  on("view", renderShell);
  on("replay", renderShell);
  on("replay-tick", renderShell);
  on("settings", renderShell);
  on("daylight", renderShell);
  window.setInterval(renderShell, 20000); // keeps "x min ago" and the clock current
  renderShell();
}

export { pick, emit };
