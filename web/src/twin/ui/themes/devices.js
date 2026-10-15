// Devices theme (section 5.4): status summary, search, categories, list or table, layers, AHU.
import { t, pick, formatNumber, ago } from "../../i18n.js";
import { settings, select, ui } from "../../state.js";
import { data } from "../../data/store.js";
import { registry, sensorGroupFor, SENSOR_GROUPS } from "../../data/devices.js";
import { deviceStatus, healthSummary, isSuspect, recommendationState, sensorReading } from "../../data/derived.js";
import { sceneState, setLayerVisible, setSensorMode } from "../../scene/index.js";
import { escapeHtml, icon } from "../dom.js";
import { valueHtml } from "../format.js";
import { ahuHours, dayTime } from "../ai-text.js";

let body = null;
let query = "";
let assetView = "sensors";
let listMode = "list";
const groupFilter = new Set();

export function mount(element) {
  body = element;
  body.innerHTML = `
    <section class="tw-section"><h3>${escapeHtml(t("summary"))}</h3><div class="tw-dist" data-part="summary"></div></section>
    <section class="tw-section">
      <div class="tw-search">${icon("ph-magnifying-glass")}<input type="search" autocomplete="off" placeholder="${escapeHtml(t("searchDevices"))}" aria-label="${escapeHtml(t("searchDevices"))}" data-part="search"></div>
      <div class="tw-toolbar">
        <div class="tw-seg" role="group" data-part="assets"><button type="button" data-asset="sensors">${escapeHtml(t("all"))}</button><button type="button" data-asset="mep">${escapeHtml(t("mep"))}</button></div>
        <div class="tw-seg" role="group" data-part="mode"><button type="button" data-mode="list">${escapeHtml(t("viewList"))}</button><button type="button" data-mode="table">${escapeHtml(t("viewTable"))}</button></div>
      </div>
      <div class="tw-tags" data-part="tags"></div>
      <div data-part="list"></div>
    </section>
    <section class="tw-section" data-part="ahu-section" hidden><h3>${escapeHtml(t("ahu"))}</h3><div class="tw-rows" data-part="ahu"></div></section>
    <section class="tw-section">
      <details class="tw-collapse" data-part="layers"><summary>${escapeHtml(t("layers"))}</summary><div data-part="layers-body"></div></details>
    </section>`;
  const search = body.querySelector('[data-part="search"]');
  search.value = query;
  search.addEventListener("input", () => { query = search.value; renderList(); });
  body.querySelectorAll("[data-asset]").forEach((button) => button.addEventListener("click", () => { assetView = button.dataset.asset; renderList(); }));
  body.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => { listMode = button.dataset.mode; renderList(); }));
  renderLayers();
  update();
}

export function unmount() { body = null; }

function bar(segments, total) {
  return `<div class="tw-dist-bar">${segments.map(([value, color]) => (value ? `<i style="width:${(value / Math.max(1, total)) * 100}%;background:${color}"></i>` : "")).join("")}</div>`;
}

export function summaryHtml() {
  const h = healthSummary();
  const sensorTotal = h.online + h.offline + h.fault;
  const batteryTotal = h.batteryHigh + h.batteryMid + h.batteryLow;
  return `
    <div class="tw-dist-row"><div><span>${escapeHtml(t("sensorStatus"))}</span><span class="tw-num">${sensorTotal}</span></div>
      ${bar([[h.online, "var(--good)"], [h.fault, "var(--poor)"], [h.offline, "var(--offline)"]], sensorTotal)}
      <div class="tw-dist-legend"><span><i class="tw-dot" data-level="good"></i>${escapeHtml(t("online"))} ${h.online}</span><span><i class="tw-dot" data-level="poor"></i>${escapeHtml(t("fault"))} ${h.fault}</span><span><i class="tw-dot" data-level="offline"></i>${escapeHtml(t("offline"))} ${h.offline}</span></div></div>
    ${batteryTotal ? `<div class="tw-dist-row"><div><span>${escapeHtml(t("batteryStatus"))}</span><span class="tw-num">${batteryTotal}</span></div>
      ${bar([[h.batteryHigh, "var(--good)"], [h.batteryMid, "var(--caution)"], [h.batteryLow, "var(--poor)"]], batteryTotal)}
      <div class="tw-dist-legend"><span><i class="tw-dot" data-level="good"></i>≥50% ${h.batteryHigh}</span><span><i class="tw-dot" data-level="caution"></i>20–49% ${h.batteryMid}</span><span><i class="tw-dot" data-level="poor"></i>&lt;20% ${h.batteryLow}</span></div></div>` : ""}`;
}

const normalized = (value) => String(value || "").normalize("NFKD").toLowerCase();

function latestSummary(device) {
  const metric = device.metrics.find((m) => !["battery", "tamperStatus"].includes(m.key) && sensorReading(device.id, m.key).value !== null);
  if (!metric) return "";
  return valueHtml(metric, sensorReading(device.id, metric.key).value);
}

function statusLevel(id) {
  const status = deviceStatus(id);
  if (status === "normal" && isSuspect(id)) return "caution";
  return status === "normal" ? "good" : status === "fault" ? "poor" : "offline";
}
const statusText = (id) => (deviceStatus(id) === "normal" && isSuspect(id) ? t("readingSuspect")
  : ({ normal: t("statusNormal"), fault: t("statusFault"), offline: t("statusOffline"), unavailable: t("statusUnavailable") })[deviceStatus(id)] || "");

function renderList() {
  if (!body) return;
  body.querySelectorAll("[data-asset]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.asset === assetView)));
  body.querySelectorAll("[data-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === listMode)));
  const q = normalized(query.trim());
  const list = body.querySelector('[data-part="list"]');
  const tags = body.querySelector('[data-part="tags"]');
  if (assetView === "mep") {
    tags.innerHTML = "";
    const items = registry.mep.filter((item) => !q || normalized(`${item.name} ${item.category} ${item.guid}`).includes(q));
    list.innerHTML = items.length ? items.map((item) => `
      <button type="button" class="tw-device${ui.selection?.kind === "ifc" && ui.selection.key === item.key ? " is-selected" : ""}" data-ifc="${escapeHtml(item.key)}">
        ${icon("ph-cube")}<span><strong>${escapeHtml(item.name.split(":")[0])}</strong><small>${escapeHtml(item.category)}</small></span><span></span>
      </button>`).join("") : emptyResult();
    list.querySelectorAll("[data-ifc]").forEach((button) => button.addEventListener("click", () => select({ kind: "ifc", key: button.dataset.ifc })));
    return;
  }
  const devices = registry.devices.filter((device) => sensorGroupFor(device).key !== "weather" && (sceneState.anchors.has(device.id) || data().snapshots.get(device.id)?.updatedAt));
  const groups = SENSOR_GROUPS.filter((group) => devices.some((device) => sensorGroupFor(device).key === group.key));
  tags.innerHTML = groups.map((group) => `<button type="button" class="tw-tag" data-group="${group.key}" aria-pressed="${groupFilter.has(group.key)}">${icon(group.icon)}${escapeHtml(t(group.labelKey))}</button>`).join("");
  tags.querySelectorAll("[data-group]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.group;
    if (groupFilter.has(key)) groupFilter.delete(key); else groupFilter.add(key);
    renderList();
  }));
  const visible = devices.filter((device) => (!groupFilter.size || groupFilter.has(sensorGroupFor(device).key))
    && (!q || normalized(`${device.id} ${pick(device.name)} ${device.devEui}`).includes(q))).sort((a, b) => a.id.localeCompare(b.id));
  if (!visible.length) { list.innerHTML = emptyResult(); return; }
  if (listMode === "table") {
    list.innerHTML = `<div class="tw-table-wrap"><table class="tw-table"><thead><tr><th>${escapeHtml(t("colName"))}</th><th>${escapeHtml(t("colId"))}</th><th>${escapeHtml(t("colStatus"))}</th><th>${escapeHtml(t("colLatest"))}</th></tr></thead><tbody>
      ${visible.map((device) => `<tr data-device="${device.id}" tabindex="0"><td>${escapeHtml(pick(device.type))}</td><td>${escapeHtml(device.id)}</td><td><span class="tw-dot" data-level="${statusLevel(device.id)}"></span> ${escapeHtml(statusText(device.id))}</td><td>${latestSummary(device)}</td></tr>`).join("")}
    </tbody></table></div>`;
  } else {
    list.innerHTML = groups.filter((group) => visible.some((device) => sensorGroupFor(device).key === group.key)).map((group) => `
      <div class="tw-device-group"><h4>${escapeHtml(t(group.labelKey))}</h4>
        ${visible.filter((device) => sensorGroupFor(device).key === group.key).map((device) => `
          <button type="button" class="tw-device${ui.selection?.kind === "sensor" && ui.selection.id === device.id ? " is-selected" : ""}" data-device="${device.id}">
            <span class="tw-dot" data-level="${statusLevel(device.id)}" aria-label="${escapeHtml(statusText(device.id))}"></span>
            <span><strong>${escapeHtml(device.id)}</strong><small>${escapeHtml(pick(device.type))}</small></span>
            <span class="tw-device-value">${latestSummary(device)}</span>
          </button>`).join("")}
      </div>`).join("");
  }
  list.querySelectorAll("[data-device]").forEach((row) => {
    const open = () => select({ kind: "sensor", id: row.dataset.device });
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" && row.tagName === "TR") open(); });
  });
}

function emptyResult() {
  return `<div class="tw-empty">${icon("ph-magnifying-glass")}<span>${escapeHtml(query.trim() ? t("noResults", { q: query.trim() }) : t("noDevices"))}</span></div>`;
}

// Without BMS data the AHU shows only what is known: its (inferred) hours and whether it runs now.
function ahuScheduleHtml(info) {
  const state = info.running ? t("ahuRunningState") : t("ahuOffTitle");
  const next = info.running ? (info.nextStop ? t("ahuNextStop", { when: dayTime(Date.parse(info.nextStop)) }) : "") : (info.nextStart ? t("ahuNextStart", { when: dayTime(Date.parse(info.nextStart)) }) : "");
  return `<div class="tw-row"><span>${escapeHtml(t("ahuState"))}</span><strong><span class="tw-dot" data-level="${info.running ? "good" : "offline"}"></span> ${escapeHtml(state)}</strong></div>
    ${next ? `<div class="tw-row"><span></span><span class="tw-caption" style="margin:0">${escapeHtml(next)}</span></div>` : ""}
    <div class="tw-row"><span>${escapeHtml(t("ahuHoursLine", { hours: ahuHours(info.schedule) }))}</span></div>
    ${info.source === "bms" ? "" : `<p class="tw-caption">${escapeHtml(t("ahuHoursInferred"))}</p>`}
    <div class="tw-empty">${icon("ph-hard-drives")}<span>${escapeHtml(t("ahuBmsPending"))}</span></div>`;
}

function renderAhu() {
  const ahu = data().ahu;
  const schedule = recommendationState().rec?.ahu;
  const section = body.querySelector('[data-part="ahu-section"]');
  section.hidden = !ahu && !schedule && !settings.internal;
  const host = body.querySelector('[data-part="ahu"]');
  if (!ahu && schedule) { host.innerHTML = ahuScheduleHtml(schedule); return; }
  if (!ahu) { host.innerHTML = `<div class="tw-empty">${icon("ph-hard-drives")}<span>${escapeHtml(t("bmsReservedCopy"))}</span></div>`; return; }
  const row = (label, value, unit) => `<div class="tw-row"><span>${escapeHtml(label)}</span><strong><span class="tw-num">${formatNumber(value, 1)}</span><span class="tw-unit">${unit}</span></strong></div>`;
  host.innerHTML = [row(t("ahuSupply"), ahu.supply, "°C"), row(t("ahuReturn"), ahu.return, "°C"), row(t("ahuWater"), ahu.water, "%"), row(t("ahuOa"), ahu.oa, "%"), row(t("ahuFan"), ahu.fan, "Hz"), row(t("ahuSetpoint"), ahu.setpoint, "°C")].join("");
}

function renderLayers() {
  const host = body.querySelector('[data-part="layers-body"]');
  const toggle = (layer, label) => `<div class="tw-layer-row"><span>${escapeHtml(label)}</span><label class="tw-switch"><input type="checkbox" role="switch" data-layer="${layer}" ${sceneState.layerVisibility[layer] ? "checked" : ""}><span></span></label></div>`;
  host.innerHTML = `${toggle("archi", t("layerArchi"))}${toggle("mep", t("layerMep"))}
    <div class="tw-layer-row"><span>${escapeHtml(t("layerSensors"))}</span><div class="tw-seg" role="group">
      ${[["all", "sensorModeAll"], ["model", "sensorModeModel"], ["hidden", "sensorModeHidden"]].map(([mode, key]) => `<button type="button" data-sensor-mode="${mode}" aria-pressed="${sceneState.sensorMode === mode}">${escapeHtml(t(key))}</button>`).join("")}
    </div></div>`;
  host.querySelectorAll("[data-layer]").forEach((input) => input.addEventListener("change", () => setLayerVisible(input.dataset.layer, input.checked)));
  host.querySelectorAll("[data-sensor-mode]").forEach((button) => button.addEventListener("click", () => { setSensorMode(button.dataset.sensorMode); renderLayers(); }));
}

export function update() {
  if (!body) return;
  body.querySelector('[data-part="summary"]').innerHTML = summaryHtml();
  if (document.activeElement?.closest?.('[data-part="list"]') === null || !body.contains(document.activeElement)) renderList();
  renderAhu();
}

export const titleKey = "devicesTitle";
export { ago };
