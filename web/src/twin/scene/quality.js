// Adaptive quality (section 13.13): three tiers, measured automatically, never auto-raised.
import { setPixelRatioCap, stats, onAfterRender, getRenderer } from "./viewer.js";
import { setShadowMapSize, setAmbientOcclusion } from "./lighting.js";
import { setGlassQuality } from "./materials.js";
import { setOutlineMode } from "./outline.js";
import { emit, settings, storage } from "../state.js";

export const TIERS = {
  high: { dpr: 2, scale: 1, shadow: 2048, ao: "always", outline: "soft", glass: true },
  medium: { dpr: 1.5, scale: 1, shadow: 2048, ao: "static", outline: "soft", glass: true },
  low: { dpr: 1, scale: 1, shadow: 1024, ao: "off", outline: "lines", glass: false },
};
const ORDER = ["high", "medium", "low"];
const TARGET_FPS = 50;
let tier = null;
let measuring = false;
let slowSince = null;

export function initialTier() {
  if (settings.quality && settings.quality !== "auto") return settings.quality;
  const stored = storage.get("zb202-quality");
  if (ORDER.includes(stored)) return stored;
  return settings.kioskTier ? "medium" : "high";
}

export function applyTier(next, { remember = false } = {}) {
  tier = next;
  const config = TIERS[next];
  // On 4K screens the low tier renders the 3D image at 0.75× and stretches it; text stays native.
  const fourK = window.screen.width * (window.devicePixelRatio || 1) >= 3200;
  setPixelRatioCap(config.dpr, next === "low" && fourK ? 0.75 : config.scale);
  setShadowMapSize(config.shadow);
  void setAmbientOcclusion(config.ao);
  setGlassQuality(config.glass);
  setOutlineMode(config.outline);
  document.documentElement.dataset.quality = next;
  if (remember) storage.set("zb202-quality", next);
  emit("quality", next);
}

// Frame time is only meaningful while frames are continuous, so only consecutive frames count.
let lastFrame = 0;
const samples = [];
onAfterRender((delta, now) => {
  if (!measuring || settings.quality !== "auto") return;
  const gap = now - lastFrame;
  lastFrame = now;
  if (gap <= 0 || gap > 120) return;
  samples.push(gap);
  if (samples.length > 90) samples.shift();
  if (samples.length < 60) return;
  const fps = 1000 / (samples.reduce((sum, value) => sum + value, 0) / samples.length);
  if (fps < TARGET_FPS) {
    slowSince ??= now;
    if (now - slowSince > 3000) downgrade();
  } else slowSince = null;
});

function downgrade() {
  const index = ORDER.indexOf(tier);
  slowSince = null;
  samples.length = 0;
  if (index < ORDER.length - 1) applyTier(ORDER[index + 1], { remember: true });
}

export function startMeasuring() { measuring = true; }
export const currentTier = () => tier;
export const currentFps = () => stats.fps;
export const rendererInfo = () => getRenderer()?.info;
