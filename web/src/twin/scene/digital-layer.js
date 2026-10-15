// The digital layer (section 13.4): component outlines, MEP in translucent accent, sensor IDs and
// a vertical data line from each sensor. Hidden until a ripple, the lens or the opening reveals it.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { scene, camera, getCanvas, onBeforeRender, startAnimation, stopAnimation, requestRender } from "./viewer.js";
import { shared, MASK_GLSL } from "./materials.js";

let edges = null;
let ghost = null;
let dataLines = null;
const labels = [];
let layerElement = null;
let effectActive = false;

const vertexShader = "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }";
const digitalFragment = /* glsl */`
uniform vec3 uColor; uniform float uOpacity;
varying vec3 vW;
${MASK_GLSL}
void main() {
  float m = max(max(twRipple(vW), twLens(vW)), twIntroDigital(vW));
  float f = twFront(vW);
  float a = uOpacity * clamp(m + f * 0.9, 0.0, 1.0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * (1.0 + f * 0.8), a);
}`;

function digitalMaterial(opacity, { depthTest = true } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uColor: { value: new THREE.Color(0x2f8cff) }, uOpacity: { value: opacity } },
    vertexShader, fragmentShader: digitalFragment, transparent: true, depthWrite: false, depthTest, toneMapped: false,
  });
}

export function initDigitalLayer({ items, sensorAnchors, topY, element }) {
  layerElement = element;
  const edgeGeometries = [];
  const ghostGeometries = [];
  for (const item of items.values()) {
    if (item.modelId === "sensor") continue; // sensors are shown by their ID labels instead
    for (const mesh of item.meshes) {
      if (mesh.userData.key === "grating") continue;
      const base = mesh.geometry.clone();
      base.deleteAttribute("uv");
      base.deleteAttribute("normal");
      const welded = mergeVertices(base, 1e-4);
      edgeGeometries.push(new THREE.EdgesGeometry(welded, 30));
      if (item.modelId === "mep") {
        welded.computeVertexNormals();
        ghostGeometries.push(welded);
      }
      base.dispose();
    }
  }
  edges = new THREE.LineSegments(mergeGeometries(edgeGeometries.filter((g) => g.attributes.position.count)), digitalMaterial(0.9));
  edges.renderOrder = 6;
  edges.frustumCulled = false;
  scene.add(edges);
  if (ghostGeometries.length) {
    ghost = new THREE.Mesh(mergeGeometries(ghostGeometries), digitalMaterial(0.32, { depthTest: false }));
    ghost.renderOrder = 7;
    ghost.frustumCulled = false;
    scene.add(ghost);
  }
  // Data lines: straight up from each sensor to a "data plane" at the top of the room. The LoRaWAN
  // gateway position is not known yet, so no network topology is drawn.
  const positions = [];
  for (const { anchor } of sensorAnchors) positions.push(anchor.x, anchor.y, anchor.z, anchor.x, topY, anchor.z);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  dataLines = new THREE.LineSegments(lineGeometry, digitalMaterial(0.75));
  dataLines.renderOrder = 6;
  scene.add(dataLines);
  for (const { id, anchor } of sensorAnchors) {
    const el = document.createElement("span");
    el.className = "tw-digital-label";
    el.textContent = id;
    el.hidden = true;
    layerElement.appendChild(el);
    labels.push({ el, anchor });
  }
  onBeforeRender(updateLabels);
}

const projected = new THREE.Vector3();
function digitalStrength(point) {
  const ripple = shared.uRippleRadius.value > 0 && point.distanceTo(shared.uRippleCenter.value) < shared.uRippleRadius.value ? shared.uRippleFade.value : 0;
  const lens = point.distanceTo(shared.uLensCenter.value) < shared.uLensRadius.value ? shared.uLensStrength.value : 0;
  const intro = shared.uIntroActive.value > 0.5 && point.y < shared.uIntroCut.value && Math.hypot(point.x - shared.uRealCenter.value.x, point.z - shared.uRealCenter.value.z) > shared.uRealRadius.value ? 1 : 0;
  return Math.max(ripple, lens, intro);
}
function updateLabels() {
  if (!effectActive && !labels.some((label) => !label.el.hidden)) return;
  const canvas = getCanvas();
  for (const label of labels) {
    const strength = effectActive ? digitalStrength(label.anchor) : 0;
    label.el.hidden = strength < 0.05;
    if (label.el.hidden) continue;
    projected.copy(label.anchor).project(camera);
    label.el.style.opacity = strength.toFixed(2);
    label.el.style.transform = `translate3d(${((projected.x + 1) * 0.5 * canvas.clientWidth).toFixed(1)}px, ${((1 - projected.y) * 0.5 * canvas.clientHeight).toFixed(1)}px, 0)`;
  }
}

let rippleTimer = 0;
// Click on empty space: a ring grows to ~6 m in 900 ms, holds 600 ms, then the layer fades in 500 ms.
export function ripple(point) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  cancelAnimationFrame(rippleTimer);
  shared.uRippleCenter.value.copy(point);
  const start = performance.now();
  const grow = reduced ? 0 : 900;
  const hold = reduced ? 300 : 600;
  const fade = reduced ? 300 : 500;
  const maxRadius = 6;
  effectActive = true;
  startAnimation("ripple");
  const step = (now) => {
    const t = now - start;
    const growX = grow ? Math.min(1, t / grow) : 1;
    shared.uRippleRadius.value = maxRadius * (1 - (1 - growX) ** 3);
    shared.uRippleFade.value = t < grow + hold ? 1 : Math.max(0, 1 - (t - grow - hold) / fade);
    requestRender();
    if (t < grow + hold + fade) rippleTimer = requestAnimationFrame(step);
    else {
      shared.uRippleRadius.value = 0;
      shared.uRippleFade.value = 0;
      effectActive = shared.uLensStrength.value > 0;
      stopAnimation("ripple");
    }
  };
  rippleTimer = requestAnimationFrame(step);
}

let lensTimer = 0;
export function lensStart(point) {
  shared.uLensCenter.value.copy(point);
  effectActive = true;
  animateLens(1, 150);
}
export function lensMove(point) {
  shared.uLensCenter.value.copy(point);
  requestRender();
}
export function lensEnd() { animateLens(0, 300); }
function animateLens(target, duration) {
  cancelAnimationFrame(lensTimer);
  const from = shared.uLensStrength.value;
  const start = performance.now();
  startAnimation("lens");
  const step = (now) => {
    const x = Math.min(1, (now - start) / duration);
    shared.uLensStrength.value = from + (target - from) * x;
    requestRender();
    if (x < 1) lensTimer = requestAnimationFrame(step);
    else {
      if (target === 0) { effectActive = shared.uRippleFade.value > 0; stopAnimation("lens"); }
    }
  };
  lensTimer = requestAnimationFrame(step);
}

export function setDigitalIntro(active) { effectActive = active || effectActive; }
