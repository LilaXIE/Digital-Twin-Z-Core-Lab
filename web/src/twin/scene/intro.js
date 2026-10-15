// Opening sequence (section 13.3): plan → section → realistic → sensors.
// While loading, the floor plan draws itself in step with the real loading progress. Then a
// section plane rises and grows the building, the realistic finish spreads from the centre, and
// the sensors light up. First visit ≈ 3 s after loading; later visits 0.6 s; skippable.
import * as THREE from "three";
import { scene, camera, getControls, startAnimation, stopAnimation, requestRender, flyTo } from "./viewer.js";
import { shared } from "./materials.js";
import { setDigitalIntro } from "./digital-layer.js";
import { storage, reducedMotion } from "../state.js";

const SEEN_KEY = "zb202-intro-seen";
let plan = null;
let planGroup = null;
let lineMaterial = null;
let labelElements = [];
let labelLayer = null;
let progressTarget = 0;
let progressShown = 0;
let skipRequested = false;
let planOffset = { x: 0, z: 0 };

const colors = { grid: 0x9fb2c8, wall: 0x2f6fd6, column: 0x2f6fd6, door: 0x5a8fe0, dim: 0x7c8ea6 };

export async function startPlan(layer) {
  labelLayer = layer;
  try {
    const response = await fetch("./models/plan-lines.json");
    if (!response.ok) throw new Error(String(response.status));
    plan = await response.json();
  } catch {
    plan = null;
    return null;
  }
  const positions = [];
  const vertexColors = [];
  const y = plan.floorY + 0.004;
  for (const [kind, x1, z1, x2, z2] of plan.lines) {
    positions.push(x1, y, z1, x2, y, z2);
    const color = new THREE.Color(colors[kind] ?? colors.wall);
    vertexColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.setDrawRange(0, 0);
  lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
  planGroup = new THREE.Group();
  planGroup.name = "intro-plan";
  planGroup.add(new THREE.LineSegments(geometry, lineMaterial));
  planGroup.renderOrder = 10;
  scene.add(planGroup);
  for (const label of plan.labels) {
    const el = document.createElement("span");
    el.className = `tw-plan-label is-${label.kind}`;
    el.textContent = label.text;
    el.hidden = true;
    labelLayer.appendChild(el);
    labelElements.push({ el, position: new THREE.Vector3(label.x, y, label.z), share: plan.lines.findIndex((line) => line[0] === (label.kind === "grid" ? "wall" : "dim")) / plan.lines.length });
  }
  // Frame the drawing from above and slightly south while the model loads.
  const min = new THREE.Vector3(...plan.modelBox.min);
  const max = new THREE.Vector3(...plan.modelBox.max);
  const center = min.clone().add(max).multiplyScalar(0.5).setY(plan.floorY);
  const size = max.clone().sub(min);
  camera.position.set(center.x - size.x * 0.4, plan.floorY + size.length() * 1.25, center.z + size.z * 1.05);
  getControls().target.copy(center);
  getControls().update();
  startAnimation("intro-plan");
  const tick = () => {
    if (!planGroup) return;
    progressShown += (progressTarget - progressShown) * 0.12;
    const count = Math.round(progressShown * plan.lines.length) * 2;
    planGroup.children[0].geometry.setDrawRange(0, count);
    projectLabels();
    requestRender();
    if (planGroup && progressShown < 0.999) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return plan;
}

function projectLabels() {
  if (!labelLayer) return;
  const canvas = labelLayer.parentElement.querySelector("canvas");
  const v = new THREE.Vector3();
  camera.updateMatrixWorld();
  for (const label of labelElements) {
    label.el.hidden = progressShown < label.share + 0.02;
    if (label.el.hidden) continue;
    v.copy(label.position).applyMatrix4(planGroup.matrixWorld).project(camera);
    label.el.style.transform = `translate3d(${((v.x + 1) * 0.5 * canvas.clientWidth).toFixed(1)}px, ${((1 - v.y) * 0.5 * canvas.clientHeight).toFixed(1)}px, 0)`;
  }
}

// Loading progress (0–1) is the drawing progress: no fake timer.
export function setPlanProgress(value) { progressTarget = Math.max(progressTarget, Math.min(1, value)); }

export function failPlan() {
  if (!planGroup) return;
  lineMaterial.vertexColors = false;
  lineMaterial.color.set(0x9aa3ad);
  lineMaterial.needsUpdate = true;
  progressTarget = progressShown;
  stopAnimation("intro-plan");
  requestRender();
}

// Align the drawing (web-ifc space) to the loaded model (Fragments space) by bounding box,
// moving the camera with it so nothing jumps.
export function alignPlan(archiBox) {
  if (!planGroup || !plan) return;
  const offset = archiBox.min.clone().sub(new THREE.Vector3(...plan.modelBox.min));
  planOffset = { x: offset.x, z: offset.z };
  planGroup.position.copy(offset);
  planGroup.updateMatrixWorld(true);
  camera.position.add(offset);
  getControls().target.add(offset);
  getControls().update();
}

export function requestSkip() { skipRequested = true; }

// Walls, columns and doors of the floor plan in model space, for the sensor sheet's location map.
export function planOutline() {
  if (!plan) return null;
  return plan.lines.filter(([kind]) => kind === "wall" || kind === "column" || kind === "door")
    .map(([kind, x1, z1, x2, z2]) => [kind, x1 + planOffset.x, z1 + planOffset.z, x2 + planOffset.x, z2 + planOffset.z]);
}

// The sequence itself. onUi() reveals the interface; onMarkers() lights the sensors.
export async function playIntro({ box, floorY, home, onUi, onMarkers }) {
  progressTarget = 1;
  const firstVisit = storage.get(SEEN_KEY) !== "1";
  storage.set(SEEN_KEY, "1");
  const reduced = reducedMotion();
  const top = box.max.y + 0.1;
  const center = box.getCenter(new THREE.Vector3());
  const maxRadius = Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) * 0.6;
  shared.uRealCenter.value.copy(center);
  const finish = () => {
    shared.uIntroActive.value = 0;
    shared.uIntroCut.value = 1e5;
    shared.uRealRadius.value = 1e5;
    setDigitalIntro(false);
    removePlan();
    requestRender();
  };
  const skipListeners = () => {
    const skip = () => requestSkip();
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });
    return () => { window.removeEventListener("pointerdown", skip); window.removeEventListener("keydown", skip); };
  };
  if (reduced) {
    finish();
    camera.position.copy(home.position);
    getControls().target.copy(home.target);
    getControls().update();
    onMarkers(true);
    onUi(true);
    return;
  }
  const detach = skipListeners();
  shared.uIntroActive.value = 1;
  shared.uIntroCut.value = floorY;
  shared.uRealRadius.value = firstVisit ? 0 : 1e5;
  setDigitalIntro(firstVisit);
  startAnimation("intro");
  const riseMs = firstVisit ? 900 : 600;
  const realMs = firstVisit ? 800 : 0;
  const totalMs = riseMs + realMs + (firstVisit ? 700 : 0);
  void flyTo(home.position, home.target, firstVisit ? riseMs + realMs + 900 : 700);
  if (!firstVisit) onUi(false);
  const start = performance.now();
  let markersShown = false;
  let uiShown = !firstVisit;
  await new Promise((resolve) => {
    // A tab in the background gets no animation frames; finish on a timer so start-up (deep links,
    // the standby timer) never waits for the tab to be shown.
    let done = false;
    const fallback = window.setTimeout(() => { if (!done) { done = true; skipRequested = true; resolve(); } }, totalMs + 1500);
    const step = (now) => {
      if (done) return;
      const t = skipRequested ? totalMs : now - start;
      const rise = Math.min(1, t / riseMs);
      shared.uIntroCut.value = floorY + (top - floorY) * (1 - (1 - rise) ** 2);
      if (firstVisit) {
        const real = realMs ? Math.min(1, Math.max(0, (t - riseMs) / realMs)) : 1;
        shared.uRealRadius.value = maxRadius * real * real;
        if (planGroup) lineMaterial.opacity = 0.95 * (1 - Math.min(1, Math.max(0, (t - riseMs - realMs * 0.5) / 600)));
      } else if (planGroup) lineMaterial.opacity = 0.95 * (1 - rise);
      if (!markersShown && t >= riseMs + realMs) { markersShown = true; onMarkers(skipRequested); }
      if (!uiShown && t >= riseMs + realMs) { uiShown = true; onUi(skipRequested); }
      requestRender();
      if (t < totalMs) requestAnimationFrame(step);
      else { done = true; window.clearTimeout(fallback); resolve(); }
    };
    requestAnimationFrame(step);
  });
  if (!markersShown) onMarkers(true);
  if (!uiShown) onUi(true);
  if (skipRequested) {
    camera.position.copy(home.position);
    getControls().target.copy(home.target);
    getControls().update();
  }
  detach();
  stopAnimation("intro");
  finish();
}

function removePlan() {
  if (!planGroup) return;
  scene.remove(planGroup);
  planGroup.children[0].geometry.dispose();
  lineMaterial.dispose();
  planGroup = null;
  labelElements.forEach((label) => label.el.remove());
  labelElements = [];
  stopAnimation("intro-plan");
}

export const firstVisit = () => storage.get(SEEN_KEY) !== "1";
