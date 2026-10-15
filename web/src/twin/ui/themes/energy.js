// Energy theme (section 5.3). Socket switches really switch lab sockets over MQTT, so every
// switch asks for confirmation first and then shows queued → sent → applied (or the failure).
import { t, formatNumber } from "../../i18n.js";
import { settings } from "../../state.js";
import { SITE } from "../../config/site.js";
import { data, provider } from "../../data/store.js";
import { socketDevices, socketInfo, totalPowerKw } from "../../data/derived.js";
import { sceneState } from "../../scene/index.js";
import { lineChart, cssVar } from "../charts/timeline.js";
import { escapeHtml, icon, term, rollNumber, closePopover } from "../dom.js";
import { controlStatus, confirmSwitch as confirmSockets, confirmOpen, pendingSocketIds, socketStateHtml, switchesInteractive } from "../sockets.js";

let body = null;
let demandRange = "today";
let requested = new Set();

export function mount(element) {
  body = element;
  body.innerHTML = `
    <section class="tw-section">
      <h3>${term("power", t("totalPower"))}</h3>
      <div class="tw-big"><strong class="tw-num" data-part="total"></strong><span>kW</span></div>
    </section>
    <section class="tw-section">
      <h3>${escapeHtml(t("sockets"))}</h3>
      <div data-part="sockets"></div>
      <p class="tw-caption" data-part="control-status" aria-live="polite"></p>
    </section>
    <section class="tw-section">
      <h3>${escapeHtml(t("demandChart"))}</h3>
      <div class="tw-seg" role="group" data-part="ranges">
        <button type="button" data-range="today">${escapeHtml(t("today"))}</button>
        <button type="button" data-range="7d">${escapeHtml(t("days7"))}</button>
        <button type="button" data-range="30d">${escapeHtml(t("days30"))}</button>
      </div>
      <p class="tw-energy-total" data-part="kwh"></p>
      <div class="tw-chart" data-part="demand" style="margin-top:10px"></div>
      <p class="tw-caption" data-part="demand-note"></p>
    </section>
    <section class="tw-section"><h3>${escapeHtml(t("standbyTitle"))}<small>${escapeHtml(t("standbyWindow"))}</small></h3><div data-part="standby"></div></section>`;
  body.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => { demandRange = button.dataset.range; requestDemand(true); update(); }));
  requestDemand();
  provider().requestStandbyReport?.();
  update();
}

// Standby (section C5): what each socket draws after hours and at weekends, and over a year.
function renderStandby() {
  const host = body.querySelector('[data-part="standby"]');
  const report = data().standby;
  if (!report) { host.innerHTML = `<p class="tw-caption">${escapeHtml(t("loading"))}</p>`; return; }
  if (!report.sockets?.length) { host.innerHTML = `<p class="tw-caption">${escapeHtml(t("noPowerHistory"))}</p>`; return; }
  const max = Math.max(1, ...report.sockets.map((item) => item.yearKwh || 0));
  host.innerHTML = `<div class="tw-standby">${report.sockets.map((item) => `
      <div class="tw-standby-row"><span>${escapeHtml(item.id)}</span>
        <span class="tw-standby-bar" aria-hidden="true"><i style="width:${(((item.yearKwh || 0) / max) * 100).toFixed(1)}%"></i></span>
        <strong>${escapeHtml(t("standbyRow", { w: formatNumber(item.standbyW ?? 0, 1), kwh: item.yearKwh ?? 0 }))}</strong></div>`).join("")}</div>
    <p class="tw-energy-total">${escapeHtml(t("standbyTotal", { kwh: report.totalYearKwh, kg: Math.round(report.totalYearKwh * SITE.carbonKgPerKwh) }))}</p>
    <p class="tw-caption">${escapeHtml(t("standbyNote", { h: report.standbyHoursPerYear }))}</p>`;
}

// kWh between two times from kW samples (trapezoids; gaps over an hour are not bridged).
function energyKwh(samples, from, to) {
  let kwh = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (b.time <= from || a.time >= to || b.time - a.time > 3600000) continue;
    const start = Math.max(a.time, from);
    const end = Math.min(b.time, to);
    kwh += ((a.value + b.value) / 2) * ((end - start) / 3600000);
  }
  return kwh;
}

// "Today 0.92 kWh · same time yesterday 1.10 kWh" (Hong Kong days).
function renderKwh() {
  const host = body.querySelector('[data-part="kwh"]');
  const today = data().demandHistory.get("today") || [];
  const week = data().demandHistory.get("7d") || [];
  const now = Date.now();
  const dayStart = Math.floor((now + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000;
  if (today.length < 2) { host.hidden = true; return; }
  // Seven days at 30-minute steps give "the same time yesterday". Asked for once today's curve is in,
  // because the bridge runs one demand query at a time.
  if (!week.length && !requested.has(`${data().kind}:7d-compare`) && !data().demandLoading.size) {
    requested.add(`${data().kind}:7d-compare`);
    provider().requestDemandHistory("7d");
  }
  host.hidden = false;
  const kwhToday = energyKwh(today, dayStart, now);
  const kwhYesterday = week.length > 1 ? energyKwh(week, dayStart - 86400000, now - 86400000) : null;
  const parts = [t("kwhToday", { v: formatNumber(kwhToday, 2) })];
  if (kwhYesterday !== null && kwhYesterday > 0) parts.push(t("kwhYesterday", { v: formatNumber(kwhYesterday, 2), d: `${kwhToday >= kwhYesterday ? "+" : "−"}${Math.round(Math.abs(kwhToday / kwhYesterday - 1) * 100)}%` }));
  host.textContent = parts.join(" · ");
}

export function unmount() { body = null; closePopover(); }

function requestDemand(force = false) {
  const key = `${data().kind}:${demandRange}`;
  if (!force && requested.has(key)) return;
  requested.add(key);
  provider().requestDemandHistory(demandRange);
}

function renderSockets() {
  const host = body.querySelector('[data-part="sockets"]');
  const devices = socketDevices();
  const infos = devices.map((device) => ({ device, info: socketInfo(device.id) })).filter(({ info }) => info.hasData || settings.internal);
  const interactive = switchesInteractive();
  const pending = pendingSocketIds();
  const placed = new Set(sceneState.anchors.keys());
  const anyOn = infos.some(({ info }) => info.on);
  const allOn = infos.length > 0 && infos.every(({ info }) => info.on);
  const rows = infos.map(({ device, info }) => `
    <div class="tw-socket${info.on === false ? " is-off" : ""}" data-socket="${device.id}">
      <span><strong>${escapeHtml(device.id)}</strong><small>${escapeHtml(placed.has(device.id) || !settings.internal ? t("catSocket") : t("notPlaced"))}</small></span>
      <span class="tw-socket-power">${info.power !== null ? `<span class="tw-num">${formatNumber(info.power, info.power >= 100 ? 0 : 1)}</span><span class="tw-unit">W</span>` : ""}</span>
      ${interactive ? `<label class="tw-switch${pending.has(device.id) ? " is-pending" : ""}"><input type="checkbox" role="switch" ${info.on ? "checked" : ""} ${pending.has(device.id) || info.on === null ? "disabled" : ""} aria-label="${escapeHtml(device.id)}"><span></span></label>` : socketStateHtml(info)}
    </div>`).join("");
  // "All" only where switching works; it still asks for confirmation.
  const all = infos.length > 1 && interactive ? `
    <div class="tw-socket is-all"><span><strong>${escapeHtml(t("allSockets"))}</strong></span><span></span>
      <label class="tw-switch"><input type="checkbox" role="switch" data-all ${allOn ? "checked" : ""} ${pending.size ? "disabled" : ""} aria-label="${escapeHtml(t("allSockets"))}"><span></span></label></div>` : "";
  host.innerHTML = all + rows;
  const allInput = host.querySelector("[data-all]");
  if (allInput) allInput.indeterminate = anyOn && !allOn;
  host.querySelectorAll("[data-socket] input").forEach((input) => input.addEventListener("click", (event) => {
    event.preventDefault(); // the state changes only after confirmation and the device's own report
    const id = input.closest("[data-socket]").dataset.socket;
    confirmSwitch(input.closest(".tw-switch"), [id], !input.checked ? false : true, t(input.checked ? "confirmOn" : "confirmOff", { id }));
  }));
  allInput?.addEventListener("click", (event) => {
    event.preventDefault();
    const desired = !allOn;
    const targets = infos.filter(({ info }) => info.on !== desired && info.on !== null).map(({ device }) => device.id);
    confirmSwitch(allInput.closest(".tw-switch"), targets, desired, t(desired ? "confirmAllOn" : "confirmAllOff"));
  });
  controlStatus(body.querySelector('[data-part="control-status"]'));
}

function confirmSwitch(trigger, ids, desired, question) {
  confirmSockets(trigger, ids, desired, question, { status: body?.querySelector('[data-part="control-status"]'), onClose: () => update() });
}

function renderDemand() {
  body.querySelectorAll("[data-range]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.range === demandRange)));
  const dataset = data();
  const samples = dataset.demandHistory.get(demandRange) || [];
  const container = body.querySelector('[data-part="demand"]');
  if (!samples.length && dataset.demandLoading.has(demandRange)) { container.innerHTML = '<div class="tw-skeleton" style="height:100%"></div>'; return; }
  body.querySelector('[data-part="demand-note"]').textContent = t("demandUnit");
  renderKwh();
  lineChart(container, { label: t("demandChart"), unit: "kW", emptyText: t("noPowerHistory"), yMin: 0, rightMargin: 10,
    series: [{ label: t("totalPower"), color: cssVar("--series-1"), points: samples.map((s) => ({ t: s.time, v: s.value })), area: true, digits: 2 }] });
}

export function update() {
  if (!body) return;
  const total = totalPowerKw();
  const totalEl = body.querySelector('[data-part="total"]');
  totalEl.closest(".tw-section").hidden = !total;
  if (total) {
    rollNumber(totalEl, total.value, { digits: 2 });
    totalEl.style.color = total.stale ? "var(--text-3)" : "";
  }
  if (confirmOpen()) return; // do not redraw under an open confirmation
  renderSockets();
  renderDemand();
  renderStandby();
}

export function markerReadout(deviceId) {
  const info = socketInfo(deviceId);
  if (info.power === null) return null;
  return { text: formatNumber(info.power, info.power >= 100 ? 0 : 1), unit: "W", stale: info.stale, status: info.on === false ? null : { level: "good" } };
}

export function totalReadout() {
  const total = totalPowerKw();
  return total ? { text: formatNumber(total.value, 2), unit: "kW", stale: total.stale } : null;
}

export const titleKey = "energyTitle";
export { icon };
