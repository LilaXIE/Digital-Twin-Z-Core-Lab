// Internal mode (?mode=internal): FPS and quality tier readout, coordinate picking.
import { settings, on } from "../state.js";
import { currentFps, currentTier, rendererInfo } from "../scene/quality.js";
import { activeAnimations } from "../scene/viewer.js";
import { setCoordinatePick } from "./pointer.js";
import { t } from "../i18n.js";

export function initInternal() {
  if (!settings.internal) return;
  const hud = document.getElementById("hud");
  hud.hidden = false;
  const update = () => {
    const info = rendererInfo();
    hud.textContent = `${t("fps")} ${currentFps()} · ${currentTier()}\ncalls ${info?.render.calls ?? 0} · tris ${((info?.render.triangles ?? 0) / 1000).toFixed(0)}k\n${activeAnimations().join(", ") || "idle"}`;
  };
  window.setInterval(update, 500);
  on("quality", update);
  const copy = document.getElementById("coordinate-copy");
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(document.getElementById("coordinate-value").textContent); copy.textContent = t("copied"); }
    catch { copy.textContent = t("copy"); }
    window.setTimeout(() => { copy.textContent = t("copy"); }, 1200);
  });
}

export function startCoordinatePick() {
  setCoordinatePick((point) => {
    document.getElementById("coordinate-value").textContent = `[${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)}]`;
    document.getElementById("coordinate").hidden = false;
    setCoordinatePick(null);
  });
}
