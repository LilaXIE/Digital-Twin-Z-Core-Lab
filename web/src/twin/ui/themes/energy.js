// Energy theme (section 5.3). Socket switches really switch lab sockets over MQTT, so every
// switch asks for confirmation first and then shows queued → sent → applied (or the failure).
import { t, formatNumber } from "../../i18n.js";
import { settings } from "../../state.js";
import { data, provider } from "../../data/store.js";
import { socketDevices, socketInfo, totalPowerKw } from "../../data/derived.js";
import { sceneState } from "../../scene/index.js";
import { lineChart, cssVar } from "../charts/timeline.js";
import { escapeHtml, icon, term, rollNumber, openAsPopover, closePopover } from "../dom.js";

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
      <div class="tw-chart" data-part="demand" style="margin-top:10px"></div>
    </section>`;
  body.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => { demandRange = button.dataset.range; requestDemand(true); update(); }));
  requestDemand();
  update();
}

export function unmount() { body = null; closePopover(); }

function requestDemand(force = false) {
  const key = `${data().kind}:${demandRange}`;
  if (!force && requested.has(key)) return;
  requested.add(key);
  provider().requestDemandHistory(demandRange);
}

function controlAvailability() {
  const dataset = data();
  if (dataset.kind === "live" && dataset.control.readOnly) return { ok: false, reason: t("reasonReadOnly") };
  if (dataset.kind === "live" && !dataset.connection.connected && dataset.connection.known) return { ok: false, reason: t("reasonBridge") };
  if (!dataset.control.connected) return { ok: false, reason: t("reasonMqtt") };
  return { ok: true };
}

function renderSockets() {
  const host = body.querySelector('[data-part="sockets"]');
  const devices = socketDevices();
  const infos = devices.map((device) => ({ device, info: socketInfo(device.id) })).filter(({ info }) => info.hasData || settings.internal);
  const availability = controlAvailability();
  const pending = new Set([...data().pendingControls.values()].map((item) => item.deviceId));
  const placed = new Set(sceneState.anchors.keys());
  const anyOn = infos.some(({ info }) => info.on);
  const allOn = infos.length > 0 && infos.every(({ info }) => info.on);
  const rows = infos.map(({ device, info }) => `
    <div class="tw-socket${info.on === false ? " is-off" : ""}" data-socket="${device.id}">
      <span><strong>${escapeHtml(device.id)}</strong><small>${escapeHtml(placed.has(device.id) ? t("catSocket") : t("notPlaced"))}</small></span>
      <span class="tw-socket-power">${info.power !== null ? `<span class="tw-num">${formatNumber(info.power, info.power >= 100 ? 0 : 1)}</span><span class="tw-unit">W</span>` : ""}</span>
      <label class="tw-switch${pending.has(device.id) ? " is-pending" : ""}"><input type="checkbox" role="switch" ${info.on ? "checked" : ""} ${!availability.ok || pending.has(device.id) || info.on === null ? "disabled" : ""} aria-label="${escapeHtml(device.id)}"><span></span></label>
    </div>`).join("");
  const all = infos.length > 1 ? `
    <div class="tw-socket is-all"><span><strong>${escapeHtml(t("allSockets"))}</strong></span><span></span>
      <label class="tw-switch"><input type="checkbox" role="switch" data-all ${allOn ? "checked" : ""} ${!availability.ok || pending.size ? "disabled" : ""} aria-label="${escapeHtml(t("allSockets"))}"><span></span></label></div>` : "";
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
  const status = body.querySelector('[data-part="control-status"]');
  const message = data().controlMessage;
  if (!availability.ok) { status.className = "tw-caption"; status.textContent = `${t("controlUnavailable")} · ${availability.reason}`; }
  else if (message && Date.now() - message.at < 120000) { status.className = `tw-caption is-${message.level}`; status.textContent = t(message.key, message.vars); }
  else { status.className = "tw-caption"; status.textContent = data().kind === "demo" ? t("demoControl") : ""; }
}

// The confirmation grows out of the switch that was pressed.
function confirmSwitch(trigger, ids, desired, question) {
  if (!ids.length) return;
  const popover = document.getElementById("confirm-popover");
  popover.innerHTML = `<p>${escapeHtml(question)}</p><div class="tw-confirm-actions"><button type="button" class="tw-button" data-action="cancel">${escapeHtml(t("cancel"))}</button><button type="button" class="tw-button tw-button-primary" data-action="confirm">${escapeHtml(t("confirm"))}</button></div>`;
  const status = body?.querySelector('[data-part="control-status"]');
  if (status) { status.className = "tw-caption is-pending"; status.textContent = t("phaseConfirm"); }
  openAsPopover(popover, trigger, { align: "end", onClose: () => update() });
  popover.querySelector('[data-action="cancel"]').addEventListener("click", () => closePopover());
  popover.querySelector('[data-action="confirm"]').addEventListener("click", async () => {
    closePopover();
    for (const id of ids) await provider().socketControl(id, desired);
  });
  popover.querySelector('[data-action="confirm"]').focus();
}

function renderDemand() {
  body.querySelectorAll("[data-range]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.range === demandRange)));
  const dataset = data();
  const samples = dataset.demandHistory.get(demandRange) || [];
  const container = body.querySelector('[data-part="demand"]');
  if (!samples.length && dataset.demandLoading.has(demandRange)) { container.innerHTML = '<div class="tw-skeleton" style="height:100%"></div>'; return; }
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
  if (!document.getElementById("confirm-popover").hidden) return; // do not redraw under an open confirmation
  renderSockets();
  renderDemand();
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
