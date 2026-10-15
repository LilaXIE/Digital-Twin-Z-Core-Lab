// ZB202 digital twin: start-up and wiring.
import "./styles/index.css";
import { t, setLang, getLang, htmlLang, formatNumber } from "./i18n.js";
import { settings, ui, on, emit, setView, select, readHash, resolvedTheme, updateSetting, coarsePointer, queryParams } from "./state.js";
import { registerProviders, setDemo, data, provider } from "./data/store.js";
import { connect, bridgeApi } from "./data/bridge.js";
import { demoFactory, activeDemo, previewTime } from "./data/demo.js";
import { registry, deviceById } from "./data/devices.js";
import { deviceStatus, metricStatus, roomMetric, occupancyInfo, seatOccupancy, socketInfo, sensorReading, isSuspect } from "./data/derived.js";
import { SITE } from "./config/site.js";
import { stopReplay } from "./data/replay.js";
import { initScene, runIntro, sceneState, flyToView, offPreset, themeLayers } from "./scene/index.js";
import { getControls, requestRender } from "./scene/viewer.js";
import { applyDaylight } from "./scene/daylight.js";
import { updateMarker, updateSeat, flashMarker, revealMarkers, setDisplayMode, refreshOcclusion } from "./scene/markers.js";
import { updateFlow } from "./scene/flow-lines.js";
import { initHomeDock, renderHomeDock } from "./ui/home-dock.js";
import { captureSnapshot } from "./scene/snapshot.js";
import { initShell, renderShell } from "./ui/shell.js";
import { initPanel, showTheme, relabelTheme, markerReadout, energyTotalReadout } from "./ui/panel.js";
import { initSensorSheet, openSelection } from "./ui/sensor-sheet.js";
import { initAiCard } from "./ui/ai-card.js";
import { initAiPage, openAiPage, closeAiPage } from "./ui/ai-page.js";
import { initAlarms } from "./ui/alarms.js";
import { initSettings } from "./ui/settings.js";
import { initKiosk } from "./ui/kiosk.js";
import { initReplayBar } from "./ui/replay-bar.js";
import { initPointer } from "./ui/pointer.js";
import { initGlossary } from "./ui/glossary.js";
import { initInternal } from "./ui/internal.js";
import { $, $$, toast, closePopover, popoverOpen } from "./ui/dom.js";

const root = document.documentElement;

// ---- Language, theme, transparency, layout tier ----
let hkFonts = null;
function applyLanguage(lang, animate = false) {
  const apply = () => {
    setLang(lang);
    root.lang = htmlLang();
    if (getLang() === "zh-Hant" && !hkFonts) hkFonts = import("./styles/fonts-hk.css");
    $$("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });
    $$("[data-i18n-aria]").forEach((element) => element.setAttribute("aria-label", t(element.dataset.i18nAria)));
    $$("[data-i18n-title]").forEach((element) => { element.title = t(element.dataset.i18nTitle); });
    document.title = `ZB202 · ${t("appTitle")}`;
    relabelTheme();
    renderShell();
    renderHomeDock();
  };
  // 150 ms cross-fade, no full-page flash.
  if (animate && document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(apply);
  else apply();
}

let lastTheme = null;
function applyTheme(immediate = false) {
  const theme = resolvedTheme();
  root.dataset.theme = theme;
  if (sceneState.ready) updateDaylight({ immediate, duration: lastTheme && lastTheme !== theme ? 1200 : 2000 });
  lastTheme = theme;
}

function applyTier() {
  // Large-screen sizing from 1920 px (or 1600 px with ?kiosk=1); smaller screens keep the standard scale.
  const kiosk = window.innerWidth >= 1920 || (settings.kioskTier && window.innerWidth >= 1600);
  root.dataset.tier = kiosk ? "kiosk" : window.innerWidth < 1280 ? "narrow" : "standard";
  root.dataset.touch = String(coarsePointer());
  renderHomeDock();
}

// ---- Daylight: real time, replayed time, or the demo time preview ----
let lastShadowAt = 0;
function updateDaylight({ immediate = false, duration = 2000 } = {}) {
  if (!sceneState.ready) return;
  const dataset = data();
  let timeMs = Date.now();
  let radiation = dataset.radiation && Date.now() - Date.parse(dataset.radiation.receivedAt) <= SITE.solarStaleAfterMs ? dataset.radiation.value : null;
  if (ui.replay) { timeMs = ui.replay.t; radiation = ui.replay.solar; }
  else if (activeDemo()?.preview.timeOfDay != null) { timeMs = previewTime(activeDemo().preview.timeOfDay); radiation = activeDemo().preview.solar; }
  applyDaylight({ timeMs, radiation, dark: resolvedTheme() === "dark", immediate, duration });
}

// ---- Scene bindings: markers, halos, seats, flows follow data, theme and replay ----
const ENV_MODELS = ["AM103", "AM308"];
function updateSceneBindings() {
  if (!sceneState.ready) return;
  for (const device of registry.devices) {
    if (!sceneState.anchors.has(device.id)) continue;
    if (device.model === "VS341") {
      const occupied = seatOccupancy(device.id);
      const seatState = occupied === true ? "occupied" : occupied === false ? "vacant" : "unknown";
      updateSeat(device.id, ui.view !== "energy" && !ui.replay ? seatState : null, { selected: ui.selection?.kind === "sensor" && ui.selection.id === device.id });
      continue;
    }
    const status = deviceStatus(device.id);
    let markerStatus = status === "normal" ? "normal" : status === "fault" ? "fault" : "offline";
    let label = null;
    let halo = null;
    let stale = false;
    if (ui.view === "environment" && ENV_MODELS.includes(device.model)) {
      const readout = markerReadout("environment", device.id);
      if (readout) {
        label = readout;
        stale = readout.stale;
        markerStatus = readout.stale ? "offline" : readout.suspect ? "suspect" : readout.status?.level || "normal";
        halo = readout.stale || readout.suspect ? "offline" : readout.status?.level || null;
      } else markerStatus = "offline";
    } else if (ui.view === "energy" && device.model === "WS523") {
      label = markerReadout("energy", device.id);
      stale = Boolean(label?.stale);
    } else if (ENV_MODELS.includes(device.model) && status === "normal") {
      // Elsewhere an environment sensor's dot shows its own CO₂ state.
      const reading = sensorReading(device.id, "co2");
      if (reading.value !== null) { markerStatus = reading.stale ? "offline" : isSuspect(device.id) ? "suspect" : metricStatus("co2", reading.value)?.level || "normal"; stale = reading.stale; }
    }
    updateMarker(device.id, { status: markerStatus, label, halo, stale, selected: ui.selection?.kind === "sensor" && ui.selection.id === device.id });
  }
  const total = ui.view === "energy" ? energyTotalReadout() : null;
  updateMarker("total-power", { status: "normal", label: total ? { text: `Σ ${total.text}`, unit: total.unit } : null, wanted: Boolean(total), stale: total?.stale });
  for (const device of registry.devices.filter((d) => d.model === "WS523")) {
    const info = socketInfo(device.id);
    updateFlow(device.id, info.power, info.stale);
  }
  requestRender();
}

// ---- Views and selection ----
function onView({ view, previous }) {
  document.body.dataset.view = view;
  closePopover();
  if (view === "ai") openAiPage(); else closeAiPage();
  if (view === "home" && ui.selection && previous !== "home") select(null);
  void showTheme(view, previous);
  sceneState.userMoved = false;
  $("#reset-view").hidden = true;
  updateSceneBindings();
  refreshOcclusion();
}

function onSelect(selection) {
  void openSelection(selection);
  updateSceneBindings();
}

function handleEscape(event) {
  if (event.key !== "Escape") return;
  if (popoverOpen()) return;
  if (ui.selection) { select(null); return; }
  if (ui.view !== "home") setView("home");
}

// ---- Snapshot (section 13.10) ----
async function snapshot() {
  const flash = $("#flash");
  flash.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 120, easing: "ease-out" });
  const values = ["co2", "temperature", "humidity"].map((key) => {
    const metric = roomMetric(key);
    if (metric.value === null) return null;
    const status = metricStatus(key, metric.value);
    const css = getComputedStyle(root);
    return { label: t(key), value: formatNumber(metric.value, key === "temperature" ? 1 : 0), unit: { co2: "ppm", temperature: "°C", humidity: "%" }[key],
      status: metric.stale ? t("stale") : t(status.word), color: css.getPropertyValue(`--${metric.stale ? "offline" : status.level}`).trim() };
  }).filter(Boolean);
  const occupancy = occupancyInfo();
  if (occupancy) values.push({ label: t(occupancy.measured ? "occupancy" : "occupancyEstimated"), value: String(occupancy.count), unit: "", status: "", color: getComputedStyle(root).getPropertyValue("--accent").trim() });
  const css = getComputedStyle(root);
  const result = await captureSnapshot({
    room: "ZB202", subtitle: t("appTitle"), theme: t({ home: "tabHome", environment: "tabEnvironment", energy: "tabEnergy", devices: "tabDevices", ai: "tabAi" }[ui.view]),
    values, demo: settings.demo ? t("badgeDemo") : null, replayLabel: ui.replay ? t("badgeReplay", { time: new Date(ui.replay.t).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Hong_Kong" }) }) : null,
    footer: t("snapshotFooter"), timeMs: ui.replay ? ui.replay.t : Date.now(), skyTop: css.getPropertyValue("--sky-top").trim() || "#b9d4f2", skyBottom: css.getPropertyValue("--sky-bottom").trim() || "#eef3f8",
    dark: resolvedTheme() === "dark", font: css.getPropertyValue("--font-ui").trim() || "sans-serif",
  });
  // The thumbnail flies into the camera button.
  const thumb = $("#snapshot-thumb");
  const button = $("#snapshot-btn").getBoundingClientRect();
  thumb.src = result.thumbnail;
  thumb.style.width = `${Math.min(320, window.innerWidth * 0.3)}px`;
  thumb.style.left = `${window.innerWidth / 2 - Math.min(320, window.innerWidth * 0.3) / 2}px`;
  thumb.style.top = `${window.innerHeight / 2 - 100}px`;
  thumb.hidden = false;
  const box = thumb.getBoundingClientRect();
  await thumb.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${button.left - box.left}px, ${button.top - box.top}px) scale(0.12)`, opacity: 0.2 }], { duration: 500, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }).finished.catch(() => {});
  thumb.hidden = true;
  toast(t("snapshotSaved"));
}

// ---- Start-up ----
async function boot() {
  applyTier();
  applyLanguage(settings.lang);
  applyTheme(true);
  root.dataset.transparency = settings.transparency;
  registerProviders({ bridge: bridgeApi, demoFactory });
  if (settings.demo) await setDemo(true);

  initGlossary();
  initShell();
  initPanel();
  initSensorSheet();
  initAiCard();
  initHomeDock();
  initAiPage();
  initAlarms();
  initSettings();
  initReplayBar();
  initKiosk();
  initInternal();

  on("setting:lang", (lang) => applyLanguage(lang, true));
  on("setting:theme", () => applyTheme());
  on("setting:transparency", (value) => { root.dataset.transparency = value; });
  on("setting:demo", async (enabled) => { stopReplay(); await setDemo(enabled); updateSceneBindings(); updateDaylight(); requestHistory(true); });
  on("view", onView);
  on("select", onSelect);
  on("focus-metric", updateSceneBindings);
  on("replay", () => { updateSceneBindings(); updateDaylight({ duration: 300 }); renderShell(); });
  on("replay-tick", () => {
    updateSceneBindings();
    const now = performance.now();
    if (now - lastShadowAt > 200) { lastShadowAt = now; updateDaylight({ immediate: true }); } // shadows at most every 200 ms
  });
  on("data", (event) => {
    if (event?.kind === "telemetry" && event.changed?.length && !event.demo && !ui.replay) flashMarker(event.deviceId);
    if (event?.kind === "radiation" || (event?.kind === "telemetry" && event.preview)) updateDaylight();
    if (event?.kind === "socket-open") requestHistory(true);
    updateSceneBindings();
  });
  window.addEventListener("keydown", handleEscape);
  window.addEventListener("resize", applyTier);
  $("#reset-view").addEventListener("click", () => { sceneState.userMoved = false; $("#reset-view").hidden = true; void flyToView(ui.view === "ai" ? "home" : ui.view); });
  $("#snapshot-btn").addEventListener("click", () => void snapshot());
  $("#reload-btn").addEventListener("click", () => window.location.reload());

  connect();
  if (!settings.demo) window.setTimeout(() => requestHistory(), 1500);
  window.setInterval(() => requestHistory(true), 10 * 60000);
  window.setInterval(() => updateDaylight(), 10 * 60000);

  const percent = $("#intro-percent");
  try {
    await initScene({ canvas: $("#twin-canvas"), markerLayer: $("#marker-layer"), onProgress: (value) => { percent.textContent = `${Math.round(value * 100)}%`; } });
  } catch (error) {
    console.error("Model loading failed", error);
    $("#intro-error").hidden = false;
    $("#intro-text").textContent = t("loadFailed");
    return;
  }
  percent.textContent = "100%";
  $("#intro-skip").hidden = false;
  updateDaylight({ immediate: true });
  setDisplayMode("all");
  updateSceneBindings();
  getControls().addEventListener("end", () => {
    if (sceneState.userMoved && offPreset(ui.view === "ai" ? "home" : ui.view)) $("#reset-view").hidden = false;
  });
  initPointer();
  document.body.classList.add("ui-entering");
  await runIntro({
    onMarkers: (immediate) => revealMarkers(immediate),
    onUi: () => {
      document.body.dataset.phase = "ready";
      requestAnimationFrame(() => document.body.classList.remove("ui-entering"));
      $("#intro").hidden = true;
    },
  });
  emit("scene-ready");
  if (settings.internal) window.__twin = { sceneState, ui, data, registry, shared: (await import("./scene/materials.js")).shared, requestRender };
  // Deep links: twin.html#environment, twin.html#sensor=AM103-05 (device.html and overview.html land here too).
  const target = readHash();
  if (target.sensor && deviceById(target.sensor)) { setView(target.view === "home" ? "devices" : target.view, { fromHash: true }); select({ kind: "sensor", id: target.sensor }, { fromHash: true }); }
  else if (target.view !== "home") setView(target.view, { fromHash: true });
  else themeLayers("home");
  refreshOcclusion();
}

let lastHistoryRequest = 0;
function requestHistory(force = false) {
  if (!force && Date.now() - lastHistoryRequest < 60000) return;
  lastHistoryRequest = Date.now();
  if (provider().isOpen()) void provider().requestRoomHistory(24, 10);
}

window.addEventListener("hashchange", () => {
  const target = readHash();
  if (target.sensor) select({ kind: "sensor", id: target.sensor }, { fromHash: true });
  else { select(null, { fromHash: true }); setView(target.view, { fromHash: true }); }
});

void boot();
export { updateSetting, queryParams };
