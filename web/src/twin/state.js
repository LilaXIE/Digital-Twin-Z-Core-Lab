// Global UI state, user settings and the URL hash. Modules talk through a small event bus.
import { normalizeLanguage } from "./i18n.js";

const query = new URLSearchParams(window.location.search);
const listeners = new Map();

export function on(type, listener) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(listener);
  return () => listeners.get(type).delete(listener);
}

export function emit(type, detail) {
  for (const listener of listeners.get(type) || []) {
    try { listener(detail); } catch (error) { console.error(`[${type}]`, error); }
  }
}

// Storage is optional: private windows, blocked site data and previews all throw or return null.
export const storage = {
  get(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { window.localStorage.setItem(key, value); } catch { /* optional */ } },
  getJson(key, fallback) { try { return JSON.parse(window.localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
};

const media = (q) => window.matchMedia(q);
const prefersReducedTransparency = media("(prefers-reduced-transparency: reduce)");
export const reducedMotion = () => media("(prefers-reduced-motion: reduce)").matches;
export const coarsePointer = () => media("(pointer: coarse)").matches || media("(hover: none)").matches;

function initialLanguage() {
  const fromQuery = query.get("lang");
  if (fromQuery) return normalizeLanguage(fromQuery);
  const stored = storage.get("lang");
  if (stored) return normalizeLanguage(stored);
  const browser = navigator.languages?.[0] || navigator.language || "";
  return /^(zh|en)/i.test(browser) ? normalizeLanguage(browser) : "zh";
}

const storedTheme = storage.get("zb202-theme");
const kioskQuery = query.get("kiosk") === "1";

export const settings = {
  lang: initialLanguage(),
  theme: ["light", "dark", "system"].includes(storedTheme) ? storedTheme : "light",
  transparency: storage.get("zb202-transparency") || (prefersReducedTransparency.matches ? "reduced" : "standard"),
  kiosk: kioskQuery || storage.get("zb202-kiosk") === "on",
  kioskTier: kioskQuery,
  demo: query.get("demo") === "1" || (() => { try { return window.sessionStorage.getItem("zb202-demo") === "on"; } catch { return false; } })(),
  internal: query.get("mode") === "internal",
  // ?quality=high|medium|low pins the tier (useful when checking a particular screen).
  quality: ["high", "medium", "low"].includes(query.get("quality")) ? query.get("quality") : storage.get("zb202-quality-choice") || "auto",
};

export function resolvedTheme() {
  if (settings.theme === "system") return media("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return settings.theme;
}

export function updateSetting(key, value) {
  if (settings[key] === value) return;
  settings[key] = value;
  if (key === "lang") storage.set("lang", value);
  if (key === "theme") storage.set("zb202-theme", value);
  if (key === "transparency") storage.set("zb202-transparency", value);
  if (key === "kiosk" && !settings.kioskTier) storage.set("zb202-kiosk", value ? "on" : "off");
  if (key === "quality") storage.set("zb202-quality-choice", value);
  if (key === "demo") { try { window.sessionStorage.setItem("zb202-demo", value ? "on" : "off"); } catch { /* optional */ } }
  emit("settings", { key, value });
  emit(`setting:${key}`, value);
}

media("(prefers-color-scheme: dark)").addEventListener("change", () => { if (settings.theme === "system") emit("setting:theme", settings.theme); });

// ---- View, focus and selection ----
export const VIEWS = ["home", "environment", "energy", "devices", "ai"];
export const ui = {
  view: "home",
  focusMetric: "co2",
  selection: null, // { kind: "sensor", id } | { kind: "ifc", modelId, localId }
  cameraMoved: false,
  replay: null, // set by data/replay.js while a replay is active
};

export function setView(view, { fromHash = false } = {}) {
  const next = VIEWS.includes(view) ? view : "home";
  if (ui.view === next && !fromHash) { emit("view-repeat", next); return; }
  const previous = ui.view;
  ui.view = next;
  emit("view", { view: next, previous });
  if (!fromHash) writeHash();
}

export function setFocusMetric(metric) {
  if (ui.focusMetric === metric) return;
  ui.focusMetric = metric;
  emit("focus-metric", metric);
}

export function select(selection, { fromHash = false } = {}) {
  const same = JSON.stringify(selection) === JSON.stringify(ui.selection);
  ui.selection = selection;
  if (!same) emit("select", selection);
  if (!fromHash) writeHash();
}

function writeHash() {
  const parts = [];
  if (ui.selection?.kind === "sensor") parts.push(`sensor=${encodeURIComponent(ui.selection.id)}`);
  else if (ui.view !== "home") parts.push(ui.view);
  const hash = parts.length ? `#${parts.join("&")}` : "";
  if (window.location.hash !== hash) history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
}

export function readHash() {
  const hash = window.location.hash.replace(/^#/, "");
  const result = { view: "home", sensor: null };
  for (const part of hash.split("&").filter(Boolean)) {
    const [key, value] = part.split("=");
    if (key === "sensor" && value) result.sensor = decodeURIComponent(value).replaceAll("_", "-").toUpperCase();
    else if (VIEWS.includes(key)) result.view = key;
  }
  // device.html and older links pass ?sensor=AM103_07.
  const legacy = query.get("sensor");
  if (!result.sensor && legacy) result.sensor = legacy.replaceAll("_", "-").toUpperCase();
  return result;
}

export const queryParams = query;
