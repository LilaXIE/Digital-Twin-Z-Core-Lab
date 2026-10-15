// Overview cards: two docks of glass cards beside the model (added at the user's request after
// plan v0.4). Left: AI outdoor air (existing card), indoor, outdoor; the air story from what the
// room needs to where the air comes from. Right: alarms and devices, then sockets; what needs
// attention first, then what can be switched. The AHU has no data until the BMS is connected, so it
// lives in the Devices theme instead of a simulated card here.
// On Overview these cards replace the status capsules and the alarm capsule (same data, no repeats).
// Narrow screens keep the capsules; every card also opens its full theme panel.
import { t, formatNumber, clockTime, getLang } from "../i18n.js";
import { ui, settings, setView, setFocusMetric, select, on, storage } from "../state.js";
import { data, setAlarmState } from "../data/store.js";
import { roomMetric, metricStatus, occupancyInfo, roomSeries, alarms, ALARM_TITLE, ALARM_ICON, healthSummary, socketDevices, socketInfo, totalPowerKw, todaySummary } from "../data/derived.js";
import { deviceById } from "../data/devices.js";
import { SITE, thresholds } from "../config/site.js";
import { startReplay } from "../data/replay.js";
import { daylightState } from "../scene/daylight.js";
import { sparkline } from "./charts/timeline.js";
import { compassText } from "./format.js";
import { $, escapeHtml, icon, rollNumber } from "./dom.js";
import { controlStatus, confirmSwitch, confirmOpen, pendingSocketIds, socketStateHtml, switchesInteractive } from "./sockets.js";
import { toggleAlarmPopover } from "./alarms.js";
import { todayHtml } from "./today.js";

// Each metric has its own icon so small labels are not the only way to tell them apart (section B6).
const INDOOR_STATS = [
  { key: "temperature", unit: "°C", digits: 1, icon: "ph-thermometer-simple" },
  { key: "humidity", unit: "%", digits: 0, icon: "ph-drop" },
  { key: "pm25", unit: "µg/m³", digits: 0, icon: "ph-circles-three" },
  { key: "noise", unit: "dB(A)", digits: 0, icon: "ph-waveform" },
];
const MAX_ALARMS = 3;

const visible = () => ui.view === "home" && document.documentElement.dataset.tier !== "narrow";
const openButton = (view, label) => `<button type="button" class="tw-icon-button tw-card-open" data-open="${view}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon("ph-arrows-out-simple")}</button>`;
const valueHtml = (value, digits, unit) => `<span class="tw-num">${formatNumber(value, digits)}</span>${unit ? `<span class="tw-unit">${escapeHtml(unit)}</span>` : ""}`;
const setHtml = (element, html) => { if (element && element.dataset.html !== html) { element.dataset.html = html; element.innerHTML = html; } };
// Cards are built once per language; numbers and lists update in place.
const needsBuild = (card) => card.dataset.lang !== getLang() && (card.dataset.lang = getLang());

function stat({ key, label, html, level = null, sub = "", stale = false, title = "", iconName = "" }) {
  return `<button type="button" class="tw-stat${stale ? " is-stale" : ""}" ${key ? `data-metric="${key}"` : 'data-open="environment"'}${title ? ` title="${escapeHtml(title)}"` : ""}>
    <span class="tw-stat-label">${iconName ? icon(iconName) : ""}${escapeHtml(label)}${level ? `<i class="tw-dot" data-level="${level}"></i>` : ""}</span>
    <span class="tw-stat-value">${html}</span>${sub ? `<span class="tw-stat-sub">${escapeHtml(sub)}</span>` : ""}</button>`;
}

// ---- Indoor: CO₂ leads (the metric the AI and the alarms act on), the rest as tiles ----
function renderIndoor() {
  const card = $("#indoor-card");
  if (needsBuild(card)) {
    card.innerHTML = `
      <header class="tw-card-head"><h2 id="indoor-card-title">${icon("ph-house-line")}<span>${escapeHtml(t("indoor"))}</span></h2>${openButton("environment", t("capsuleHint"))}</header>
      <button type="button" class="tw-card-hero" data-metric="co2" data-part="hero">
        <span class="tw-hero-value"><span class="tw-num" data-part="co2"></span><span class="tw-unit">ppm</span></span>
        <span class="tw-hero-side"><span class="tw-hero-label">CO₂</span><span class="tw-pill" data-part="co2-status"></span></span>
      </button>
      <div class="tw-card-spark" data-part="spark"></div>
      <div class="tw-card-caption" data-part="caption-row"><span data-part="caption"></span>
        <button type="button" class="tw-link" data-action="replay">${icon("ph-clock-counter-clockwise")}<span>${escapeHtml(t("replay"))}</span></button></div>
      <div class="tw-card-stats" data-part="stats"></div>
      <p class="tw-card-empty" data-part="empty" hidden>${escapeHtml(t("sNoData"))}</p>`;
    card.querySelector('[data-action="replay"]').addEventListener("click", () => void startReplay());
  }
  const co2 = roomMetric("co2");
  const hasCo2 = co2.value !== null;
  card.querySelector('[data-part="hero"]').hidden = !hasCo2;
  card.querySelector('[data-part="caption-row"]').hidden = !hasCo2;
  if (hasCo2) {
    const valueEl = card.querySelector('[data-part="co2"]');
    if (ui.replay) valueEl.textContent = formatNumber(co2.value, 0);
    else rollNumber(valueEl, co2.value, { digits: 0 });
    valueEl.parentElement.classList.toggle("is-stale", co2.stale);
    const status = metricStatus("co2", co2.value);
    const pill = card.querySelector('[data-part="co2-status"]');
    pill.dataset.level = co2.stale ? "offline" : status.level;
    pill.textContent = co2.stale ? t("stale") : t(status.word);
  }
  const cutoff = (ui.replay ? ui.replay.stop : Date.now()) - 24 * 3600000;
  const points = roomSeries(data().roomHistory, "co2").filter((p) => p.t >= cutoff);
  const spark = hasCo2 ? sparkline(points, { width: 268, height: 40, limit: thresholds.co2.goodBelow }) : "";
  // During replay a cursor marks the replayed moment on the 24-hour curve.
  const span = points.length > 1 ? points.at(-1).t - points[0].t : 0;
  const cursor = ui.replay && span > 0 ? `<i class="tw-spark-cursor" style="left:${Math.max(0, Math.min(100, ((ui.replay.t - points[0].t) / span) * 100)).toFixed(2)}%"></i>` : "";
  setHtml(card.querySelector('[data-part="spark"]'), spark ? spark + cursor : "");
  card.querySelector('[data-part="caption"]').textContent = [points.length > 1 ? t("last24h") : "", co2.sources ? t("sensorsMedian", { n: co2.sources }) : "", co2.excluded ? t("sensorsExcluded", { n: co2.excluded }) : ""].filter(Boolean).join(" · ");
  card.querySelector('[data-action="replay"]').hidden = Boolean(ui.replay) || points.length < 2;

  const tiles = [];
  for (const spec of INDOOR_STATS) {
    const metric = roomMetric(spec.key);
    if (metric.value === null) continue; // no source: no tile, never a dash
    const status = metricStatus(spec.key, metric.value);
    tiles.push(stat({ key: spec.key, label: t(spec.key === "temperature" ? "tempShort" : spec.key), html: valueHtml(metric.value, spec.digits, spec.unit), level: status ? (metric.stale ? "stale" : status.level) : null, title: status ? t(status.word) : "",
      sub: metric.stale ? t("stale") : "", stale: metric.stale, iconName: spec.icon }));
    if (spec.key === "humidity") {
      const occupancy = occupancyInfo();
      if (occupancy) tiles.push(stat({ label: t(occupancy.measured ? "peopleShort" : "peopleEstimatedShort"), html: valueHtml(occupancy.count, 0, ""), iconName: "ph-users-three" }));
    }
  }
  setHtml(card.querySelector('[data-part="stats"]'), tiles.join(""));
  card.querySelector('[data-part="empty"]').hidden = hasCo2 || tiles.length > 0;
}

// ---- Outdoor: HKO King's Park, compared with the room ----
function skyIcon() {
  const daylight = daylightState();
  if (daylight?.dark) return "ph-moon-stars";
  return { skyClear: "ph-sun", skyCloudy: "ph-cloud-sun", skyOvercast: "ph-cloud" }[daylight?.sky] || "ph-cloud-sun";
}

function renderOutdoor() {
  const card = $("#outdoor-card");
  const outdoor = data().outdoor || {};
  const radiation = data().radiation;
  const solar = ui.replay ? ui.replay.solar : radiation && Date.now() - Date.parse(radiation.receivedAt) <= SITE.solarStaleAfterMs ? radiation.value : null;
  const hasTemp = Number.isFinite(outdoor.temperature);
  const any = hasTemp || Number.isFinite(outdoor.humidity) || Number.isFinite(outdoor.windSpeed) || Number.isFinite(solar);
  card.hidden = !any;
  if (!any) return;
  if (needsBuild(card)) {
    card.innerHTML = `
      <header class="tw-card-head"><h2 id="outdoor-card-title"><i class="ph ph-cloud-sun" data-part="sky-icon" aria-hidden="true"></i><span>${escapeHtml(t("outdoor"))}</span></h2>${openButton("environment", t("capsuleHint"))}</header>
      <div class="tw-card-hero is-static" data-part="hero">
        <span class="tw-hero-value"><span class="tw-num" data-part="temp"></span><span class="tw-unit">°C</span></span>
        <span class="tw-hero-side"><span class="tw-hero-label" data-part="sky"></span><small data-part="delta"></small></span>
      </div>
      <div class="tw-card-stats" data-part="stats"></div>
      <p class="tw-card-caption" data-part="source"></p>`;
  }
  card.querySelector('[data-part="sky-icon"]').className = `ph ${skyIcon()}`;
  card.querySelector('[data-part="hero"]').hidden = !hasTemp;
  if (hasTemp) {
    rollNumber(card.querySelector('[data-part="temp"]'), outdoor.temperature, { digits: 1 });
    const daylight = daylightState();
    card.querySelector('[data-part="sky"]').textContent = daylight?.sky && !daylight.dark ? t(daylight.sky) : "";
    const indoor = roomMetric("temperature");
    const delta = indoor.value === null || ui.replay ? null : outdoor.temperature - indoor.value; // replay has no outdoor history to compare
    card.querySelector('[data-part="delta"]').textContent = delta === null ? "" : Math.abs(delta) < 0.5 ? t("sameAsIndoor")
      : t(delta > 0 ? "warmerThanIndoor" : "coolerThanIndoor", { v: formatNumber(Math.abs(delta), 1) });
  }
  const tiles = [];
  if (Number.isFinite(outdoor.humidity)) tiles.push(stat({ label: t("humidity"), html: valueHtml(outdoor.humidity, 0, "%") }));
  if (Number.isFinite(outdoor.windSpeed)) {
    const hasDir = Number.isFinite(outdoor.windDirection);
    // The arrow points where the wind blows to; the label names where it comes from.
    const arrow = hasDir ? `<i class="ph ph-arrow-up tw-wind-arrow" style="transform:rotate(${outdoor.windDirection + 180}deg)" aria-hidden="true"></i>` : "";
    tiles.push(stat({ label: hasDir ? `${t("wind")} · ${compassText(outdoor.windDirection)}` : t("wind"), html: `${arrow}${valueHtml(outdoor.windSpeed, 1, "m/s")}` }));
  }
  if (Number.isFinite(solar)) tiles.push(stat({ label: t("solarShort"), html: valueHtml(Math.round(solar), 0, "W/m²") }));
  setHtml(card.querySelector('[data-part="stats"]'), tiles.join(""));
  const observed = Date.parse(outdoor.receivedAt);
  card.querySelector('[data-part="source"]').textContent = [t("outdoorSource"), Number.isFinite(observed) ? clockTime(observed) : ""].filter(Boolean).join(" · ");
}

// ---- Today: open alarms first, then how the air has been today (section B2) ----
const deviceLabel = (id) => (id === "dataService" ? t("dataService") : id);
function alarmDetail(alarm) {
  if (alarm.detailKey === "raw") return alarm.detailVars.text || "";
  return alarm.detailKey ? t(alarm.detailKey, alarm.detailVars) : "";
}

function renderAlarmCard() {
  const card = $("#alarm-card");
  if (needsBuild(card)) {
    card.innerHTML = `
      <header class="tw-card-head"><h2 id="alarm-card-title">${icon("ph-calendar-check")}<span>${escapeHtml(t("todayTitle"))}</span></h2>
        <button type="button" class="tw-link" data-action="all" aria-haspopup="dialog">${escapeHtml(t("viewAll"))}${icon("ph-caret-right")}</button></header>
      <div data-part="alarms"></div>
      <div class="tw-today" data-part="today"></div>
      <div class="tw-health" data-part="health"></div>`;
    card.querySelector('[data-action="all"]').addEventListener("click", (event) => toggleAlarmPopover(event.currentTarget));
  }
  const active = alarms().filter((alarm) => alarm.state === "active");
  card.classList.toggle("has-alarms", active.length > 0);
  card.classList.toggle("is-critical", active.some((alarm) => alarm.level === "critical"));
  // Each alarm row holds two sibling buttons (open, acknowledge) rather than a button inside a button.
  const list = active.length
    ? active.slice(0, MAX_ALARMS).map((alarm) => `
      <div class="tw-alarm-row${alarm.level === "critical" ? " is-critical" : ""}">
        <button type="button" class="tw-alarm-open" data-device="${escapeHtml(alarm.deviceId)}">
          ${icon(ALARM_ICON[alarm.type] || "ph-warning-circle")}
          <span><strong>${escapeHtml(t(ALARM_TITLE[alarm.type] || alarm.type))}</strong><small>${escapeHtml(deviceLabel(alarm.deviceId))}${alarmDetail(alarm) ? ` · ${escapeHtml(alarmDetail(alarm))}` : ""}</small></span>
        </button>
        <button type="button" class="tw-icon-button tw-ack" data-ack="${escapeHtml(alarm.id)}" aria-label="${escapeHtml(t("acknowledge"))}" title="${escapeHtml(t("acknowledge"))}">${icon("ph-check")}</button>
      </div>`).join("") + (active.length > MAX_ALARMS ? `<button type="button" class="tw-link tw-more" data-action="more">${escapeHtml(t("moreAlarms", { n: active.length - MAX_ALARMS }))}</button>` : "")
    : `<div class="tw-card-ok">${icon("ph-check-circle")}<span><strong>${escapeHtml(t("allClear"))}</strong><small>${escapeHtml(t("noOpenAlarms"))}</small></span></div>`;
  setHtml(card.querySelector('[data-part="alarms"]'), list);
  setHtml(card.querySelector('[data-part="today"]'), todayHtml(todaySummary()));

  const h = healthSummary();
  const total = h.online + h.offline + h.fault;
  const low = h.batteryLow;
  setHtml(card.querySelector('[data-part="health"]'), `
    <div class="tw-health-head"><span>${escapeHtml(t("devicesOnline"))}</span><strong><span class="tw-num">${h.online}</span><span class="tw-unit">/ ${total}</span></strong></div>
    <div class="tw-dist-legend">${h.fault ? `<span><i class="tw-dot" data-level="poor"></i>${escapeHtml(t("fault"))} ${h.fault}</span>` : ""}${h.offline ? `<span><i class="tw-dot" data-level="offline"></i>${escapeHtml(t("offline"))} ${h.offline}</span>` : ""}${low ? `<span class="is-caution">${icon("ph-battery-warning")}${escapeHtml(t("batteryLowCount", { n: low }))}</span>` : ""}</div>
`);
}

// "Show details" brings back the indoor, outdoor and socket cards; the choice is remembered per browser.
const DETAILS_KEY = "zb202-home-details";
function applyDetails(open) {
  document.body.toggleAttribute("data-home-details", open);
  const button = $("#home-details-toggle");
  button.setAttribute("aria-expanded", String(open));
  button.querySelector("span").textContent = t(open ? "hideDetails" : "showDetails");
  button.querySelector("i").className = `ph ${open ? "ph-caret-up" : "ph-caret-down"}`;
}

// ---- Sockets: total power first, then each socket with its own switch ----
function renderSocketCard() {
  const card = $("#socket-card");
  if (needsBuild(card)) {
    card.innerHTML = `
      <header class="tw-card-head"><h2 id="socket-card-title">${icon("ph-plug")}<span>${escapeHtml(t("sockets"))}</span></h2>
        <span class="tw-card-head-actions"><button type="button" class="tw-link" data-action="all-sockets"></button>${openButton("energy", t("openEnergy"))}</span></header>
      <div class="tw-card-hero is-static" data-part="hero">
        <span class="tw-hero-value"><span class="tw-num" data-part="total"></span><span class="tw-unit">kW</span></span>
        <span class="tw-hero-side"><span class="tw-hero-label">${escapeHtml(t("totalPowerShort"))}</span><small data-part="count"></small></span>
      </div>
      <div class="tw-socket-grid" data-part="sockets"></div>
      <p class="tw-card-caption" data-part="status" aria-live="polite"></p>`;
    card.querySelector('[data-action="all-sockets"]').addEventListener("click", (event) => {
      const infos = socketInfos();
      const desired = !infos.some(({ info }) => info.on);
      const targets = infos.filter(({ info }) => info.on !== desired && info.on !== null).map(({ device }) => device.id);
      confirmSwitch(event.currentTarget, targets, desired, t(desired ? "confirmAllOn" : "confirmAllOff"), { status: card.querySelector('[data-part="status"]'), onClose: renderSocketCard });
    });
  }
  if (confirmOpen()) return; // do not redraw under an open confirmation
  const infos = socketInfos();
  card.hidden = !infos.length;
  if (!infos.length) return;
  const total = totalPowerKw();
  card.querySelector('[data-part="hero"]').hidden = !total;
  if (total) {
    const totalEl = card.querySelector('[data-part="total"]');
    rollNumber(totalEl, total.value, { digits: 2 });
    totalEl.parentElement.classList.toggle("is-stale", total.stale);
  }
  const on = infos.filter(({ info }) => info.on).length;
  card.querySelector('[data-part="count"]').textContent = t("socketsOnCount", { on, n: infos.length });
  const interactive = switchesInteractive();
  const pending = pendingSocketIds();
  const host = card.querySelector('[data-part="sockets"]');
  host.innerHTML = infos.map(({ device, info }) => `
    <div class="tw-socket-tile${info.on === false ? " is-off" : ""}${info.stale ? " is-stale" : ""}" data-socket="${device.id}">
      <span class="tw-socket-name">${escapeHtml(device.id)}</span>
      <span class="tw-socket-power">${info.power !== null ? valueHtml(info.power, info.power >= 100 ? 0 : 1, "W") : ""}</span>
      ${interactive ? `<label class="tw-switch${pending.has(device.id) ? " is-pending" : ""}"><input type="checkbox" role="switch" ${info.on ? "checked" : ""} ${pending.has(device.id) || info.on === null ? "disabled" : ""} aria-label="${escapeHtml(device.id)}"><span></span></label>` : socketStateHtml(info)}
    </div>`).join("");
  host.querySelectorAll("input").forEach((input) => input.addEventListener("click", (event) => {
    event.preventDefault(); // the state changes only after confirmation and the device's own report
    const id = input.closest("[data-socket]").dataset.socket;
    confirmSwitch(input.closest(".tw-switch"), [id], input.checked, t(input.checked ? "confirmOn" : "confirmOff", { id }), { status: card.querySelector('[data-part="status"]'), onClose: renderSocketCard });
  }));
  const allButton = card.querySelector('[data-action="all-sockets"]');
  allButton.hidden = infos.length < 2 || !interactive || pending.size > 0;
  allButton.textContent = t(on ? "allOff" : "allOn");
  controlStatus(card.querySelector('[data-part="status"]'));
}

const socketInfos = () => socketDevices().map((device) => ({ device, info: socketInfo(device.id) })).filter(({ info }) => info.hasData || settings.internal);

export function renderHomeDock() {
  document.body.toggleAttribute("data-replay", Boolean(ui.replay));
  if ($("#home-details-toggle")) applyDetails(document.body.hasAttribute("data-home-details")); // relabels after a language change
  if (!visible()) return;
  renderIndoor();
  renderOutdoor();
  if (ui.replay) return; // live-only cards are hidden during replay
  renderAlarmCard();
  renderSocketCard();
}

// The docks start just below the identity card and the top-right actions, whatever their height.
function trackTops() {
  const root = document.documentElement;
  const update = () => {
    root.style.setProperty("--dock-left-top", `${Math.round($("#identity").getBoundingClientRect().bottom + 12)}px`);
    root.style.setProperty("--dock-right-top", `${Math.round($(".tw-actions").getBoundingClientRect().bottom + 12)}px`);
  };
  const observer = new ResizeObserver(update);
  observer.observe($("#identity"));
  observer.observe($(".tw-actions"));
  window.addEventListener("resize", update);
  update();
}

// A hidden scrollbar needs a cue: fade the bottom edge while more cards are below.
function trackOverflow(dock) {
  const update = () => dock.classList.toggle("is-overflowing", dock.scrollTop + dock.clientHeight < dock.scrollHeight - 4);
  dock.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(dock);
  for (const child of dock.children) new ResizeObserver(update).observe(child);
}

export function initHomeDock() {
  trackTops();
  trackOverflow($("#dock-left"));
  trackOverflow($("#dock-right"));
  for (const dock of [$("#dock-left"), $("#dock-right")]) {
    dock.addEventListener("click", (event) => {
      const metric = event.target.closest("[data-metric]");
      const open = event.target.closest("[data-open]");
      if (metric) { setFocusMetric(metric.dataset.metric); setView("environment"); return; }
      if (open) { setView(open.dataset.open); return; }
      const ack = event.target.closest("[data-ack]");
      if (ack) { event.stopPropagation(); setAlarmState(ack.dataset.ack, "acknowledged"); return; }
      if (event.target.closest('[data-action="more"]')) { toggleAlarmPopover(event.target.closest('[data-action="more"]')); return; }
      const replayAt = event.target.closest("[data-replay-at]");
      if (replayAt) { void startReplay({ at: Number(replayAt.dataset.replayAt) }); return; }
      const row = event.target.closest(".tw-alarm-open");
      if (row && deviceById(row.dataset.device)) { setView("devices"); select({ kind: "sensor", id: row.dataset.device }); }
    });
  }
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "home-details-toggle";
  toggle.className = "tw-details-toggle glass-thin";
  toggle.innerHTML = '<i class="ph ph-caret-down" aria-hidden="true"></i><span></span>';
  $("#dock-left").append(toggle);
  toggle.addEventListener("click", () => {
    const open = !document.body.hasAttribute("data-home-details");
    storage.set(DETAILS_KEY, open ? "1" : "");
    applyDetails(open);
    renderHomeDock();
  });
  applyDetails(storage.get(DETAILS_KEY) === "1");
  on("data", renderHomeDock);
  on("replay", renderHomeDock);
  on("replay-tick", () => { if (visible()) { renderIndoor(); renderOutdoor(); } });
  on("view", renderHomeDock);
  on("settings", renderHomeDock);
  // "x minutes ago" and working-hours changes.
  window.setInterval(() => { if (visible() && !ui.replay && !document.hidden) renderAlarmCard(); }, 3000);
  renderHomeDock();
}
