// Settings menu (section 6.3), grown out of the gear button.
import { t } from "../i18n.js";
import { settings, updateSetting, on } from "../state.js";
import { activeDemo, demoFactory } from "../data/demo.js";
import { data } from "../data/store.js";
import { currentTier, applyTier, TIERS } from "../scene/quality.js";
import { escapeHtml, openAsPopover, closePopover } from "./dom.js";
import { startCoordinatePick } from "./internal.js";

function seg(name, options, value) {
  return `<div class="tw-seg" role="group" data-setting="${name}">${options.map(([key, label]) => `<button type="button" data-value="${key}" aria-pressed="${String(value) === String(key)}">${escapeHtml(label)}</button>`).join("")}</div>`;
}

function render() {
  const menu = document.getElementById("settings-menu");
  const demo = activeDemo();
  const hours = demo?.preview.timeOfDay;
  menu.innerHTML = `<header><h2>${escapeHtml(t("settingsTitle"))}</h2></header>
    <div class="tw-menu-row"><span>${escapeHtml(t("language"))}</span>${seg("lang", [["zh", "简"], ["zh-Hant", "繁"], ["en", "EN"]], settings.lang)}</div>
    <div class="tw-menu-row"><span>${escapeHtml(t("appearance"))}</span>${seg("theme", [["light", t("themeLight")], ["dark", t("themeDark")], ["system", t("themeSystem")]], settings.theme)}</div>
    <div class="tw-menu-row"><span>${escapeHtml(t("transparency"))}</span>${seg("transparency", [["standard", t("standard")], ["reduced", t("reduced")]], settings.transparency)}</div>
    <div class="tw-menu-row"><span>${escapeHtml(t("kiosk"))}</span><label class="tw-switch"><input type="checkbox" role="switch" data-toggle="kiosk" ${settings.kiosk ? "checked" : ""}><span></span></label></div>
    <div class="tw-menu-row"><span>${escapeHtml(t("demoMode"))}<small>${escapeHtml(t("demoHint"))}</small></span><label class="tw-switch"><input type="checkbox" role="switch" data-toggle="demo" ${settings.demo ? "checked" : ""}><span></span></label></div>
    ${demo ? `
      <div class="tw-menu-row"><span>${escapeHtml(t("valuePreview"))}<small>${demo.preview.co2 !== null ? `${demo.preview.co2} ppm` : ""}</small></span><input type="range" min="420" max="1400" step="10" value="${demo.preview.co2 ?? 600}" data-preview="co2" aria-label="${escapeHtml(t("valuePreview"))}"></div>
      <div class="tw-menu-row"><span>${escapeHtml(t("timePreview"))}<small>${hours === null || hours === undefined ? "" : `${String(Math.floor(hours)).padStart(2, "0")}:${String(Math.round((hours % 1) * 60)).padStart(2, "0")}`}</small></span><input type="range" min="0" max="23.75" step="0.25" value="${hours ?? 12}" data-preview="timeOfDay" aria-label="${escapeHtml(t("timePreview"))}"></div>` : ""}
    ${settings.internal ? `
      <div class="tw-menu-row"><span>${escapeHtml(t("quality"))}</span>${seg("quality", [["auto", t("qualityAuto")], ["high", t("qualityHigh")], ["medium", t("qualityMedium")], ["low", t("qualityLow")]], settings.quality)}</div>
      <div class="tw-menu-row"><span>${escapeHtml(t("engineering"))}</span><button type="button" class="tw-button tw-button-small" data-action="pick">${escapeHtml(t("pickCoordinate"))}</button></div>
      <div class="tw-menu-row"><span>${escapeHtml(t("diagnostics"))}<small>${escapeHtml(data().connection.diagnostic || (data().connection.connected ? t("connected") : t("disconnected")))}</small></span></div>` : ""}`;
  menu.querySelectorAll("[data-setting] button").forEach((button) => button.addEventListener("click", () => {
    const name = button.closest("[data-setting]").dataset.setting;
    updateSetting(name, button.dataset.value);
    if (name === "quality") applyTier(button.dataset.value === "auto" ? currentTier() : button.dataset.value);
    render();
  }));
  menu.querySelectorAll("[data-toggle]").forEach((input) => input.addEventListener("change", () => { updateSetting(input.dataset.toggle, input.checked); window.setTimeout(render, 50); }));
  menu.querySelectorAll("[data-preview]").forEach((input) => input.addEventListener("input", () => {
    const dataset = activeDemo();
    if (!dataset) return;
    demoFactory.setPreview(dataset, input.dataset.preview, Number(input.value));
    input.closest(".tw-menu-row").querySelector("small").textContent = input.dataset.preview === "co2" ? `${input.value} ppm` : `${String(Math.floor(input.value)).padStart(2, "0")}:${String(Math.round((input.value % 1) * 60)).padStart(2, "0")}`;
  }));
  menu.querySelector('[data-action="pick"]')?.addEventListener("click", () => { closePopover(); startCoordinatePick(); });
}

export function initSettings() {
  const button = document.getElementById("settings-btn");
  button.addEventListener("click", () => {
    const menu = document.getElementById("settings-menu");
    if (!menu.hidden) { closePopover(); return; }
    render();
    openAsPopover(menu, button, { align: "end" });
  });
  on("settings", () => { if (!document.getElementById("settings-menu").hidden) render(); });
}

export { TIERS };
