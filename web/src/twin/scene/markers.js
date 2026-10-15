// Sensor markers (section 9.4): small glass dots drawn in HTML over the canvas, projected every
// rendered frame. Readout labels in the Environment and Energy themes, floor halos for the
// environment sensors, faint person icons over occupied seats.
import * as THREE from "three";
import { camera, scene, getCanvas, onBeforeRender, requestRender, getControls, startAnimation, stopAnimation } from "./viewer.js";

const markers = new Map(); // deviceId → marker
let roomBox = null;
const seats = new Map();
let layer = null;
let floorY = 0;
let displayMode = "all"; // all | model | hidden
let occluders = [];
let excludedOccluders = () => [];
const projected = new THREE.Vector3();

const haloMaterial = (color) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main() { float d = distance(vUv, vec2(0.5)) * 2.0; float a = smoothstep(1.0, 0.25, d) * 0.55 + smoothstep(1.0, 0.92, d) * smoothstep(0.82, 0.9, d) * 0.35; gl_FragColor = vec4(uColor, a * uOpacity); }",
});

export const STATUS_COLORS = { good: 0x1f9d55, caution: 0xe08a00, poor: 0xd23a4b, offline: 0x8a929e, normal: 0x2f8cff, fault: 0xd23a4b, stale: 0x8a929e };

let tableBox = null;
export function initMarkers({ element, floorLevel, meshes, excluded, table = null, room = null }) {
  layer = element;
  floorY = floorLevel;
  tableBox = table;
  roomBox = room;
  occluders = meshes;
  excludedOccluders = excluded || (() => []);
  onBeforeRender(project);
  let timer = null;
  getControls().addEventListener("change", () => { window.clearTimeout(timer); timer = window.setTimeout(checkOcclusion, 160); });
}

export function addMarker(deviceId, anchor, { kind = "sensor", halo = false } = {}) {
  const el = document.createElement("div");
  el.className = `tw-marker tw-marker-${kind}`;
  el.setAttribute("aria-hidden", "true");
  el.dataset.id = deviceId;
  el.innerHTML = kind === "seat"
    ? '<i class="ph ph-user" aria-hidden="true"></i>'
    : '<span class="tw-marker-dot"><span class="tw-marker-core"></span></span><span class="tw-marker-label"></span>';
  layer.appendChild(el);
  const marker = { id: deviceId, kind, anchor: anchor.clone(), el, label: el.querySelector(".tw-marker-label"), visible: true, x: 0, y: 0, onScreen: false, occluded: false, halo: null, haloTarget: 0, haloColor: new THREE.Color() };
  if (halo) {
    // The halo lies on whatever the sensor stands on: the table top, or the floor in front of a wall sensor.
    const onTable = tableBox && anchor.x > tableBox.min.x && anchor.x < tableBox.max.x && anchor.z > tableBox.min.z && anchor.z < tableBox.max.z && anchor.y > tableBox.max.y;
    const position = new THREE.Vector3(anchor.x, onTable ? tableBox.max.y + 0.006 : floorY + 0.008, anchor.z);
    if (!onTable && roomBox) {
      const inset = 0.55;
      position.x = Math.min(roomBox.max.x - inset, Math.max(roomBox.min.x + inset, position.x));
      position.z = Math.min(roomBox.max.z - inset, Math.max(roomBox.min.z + inset, position.z));
    }
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(onTable ? 0.42 : 0.62, 48), haloMaterial(STATUS_COLORS.good));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(position);
    mesh.renderOrder = 3;
    mesh.visible = false;
    scene.add(mesh);
    marker.halo = mesh;
  }
  (kind === "seat" ? seats : markers).set(deviceId, marker);
  return marker;
}

export const markerFor = (id) => markers.get(id);
export const allMarkers = () => [...markers.values()];

function project() {
  if (!layer) return;
  const canvas = getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  camera.updateMatrixWorld();
  for (const marker of [...markers.values(), ...seats.values()]) {
    if (!marker.visible) continue;
    projected.copy(marker.anchor).project(camera);
    const onScreen = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
    marker.onScreen = onScreen;
    marker.x = (projected.x + 1) * 0.5 * width;
    marker.y = (1 - projected.y) * 0.5 * height;
    marker.el.style.transform = `translate3d(${marker.x.toFixed(1)}px, ${marker.y.toFixed(1)}px, 0)`;
    marker.el.classList.toggle("is-offscreen", !onScreen);
  }
}

// Occlusion: a marker behind an opaque component dims and drops its label. Faded walls, glass
// and the see-through grating never hide a marker.
const raycaster = new THREE.Raycaster();
function checkOcclusion() {
  const skip = new Set(excludedOccluders());
  const candidates = occluders.filter((mesh) => mesh.visible && !skip.has(mesh) && !["grating", "glass", "screen"].includes(mesh.userData.key) && mesh.userData.modelId !== "sensor");
  for (const marker of markers.values()) {
    if (!marker.visible) continue;
    const direction = marker.anchor.clone().sub(camera.position);
    const distance = direction.length();
    raycaster.set(camera.position, direction.normalize());
    raycaster.far = distance - 0.08;
    const hit = raycaster.intersectObjects(candidates, false)[0];
    marker.occluded = Boolean(hit);
    marker.el.classList.toggle("is-occluded", marker.occluded);
  }
}
export const refreshOcclusion = () => window.setTimeout(checkOcclusion, 0);

export function setDisplayMode(mode) {
  displayMode = mode;
  for (const marker of markers.values()) setVisible(marker, mode === "all" && marker.wanted !== false);
  for (const seat of seats.values()) setVisible(seat, mode === "all" && seat.wanted === true);
  requestRender();
}

function setVisible(marker, visible) {
  marker.visible = visible;
  marker.el.hidden = !visible;
}

// state: { status, label: { text, unit } | null, wanted, halo: colourKey | null, selected }
export function updateMarker(id, state) {
  const marker = markers.get(id);
  if (!marker) return;
  marker.wanted = state.wanted !== false;
  setVisible(marker, displayMode === "all" && marker.wanted);
  marker.el.dataset.status = state.status;
  marker.el.classList.toggle("has-label", Boolean(state.label));
  marker.el.classList.toggle("is-selected", Boolean(state.selected));
  marker.el.classList.toggle("is-stale", Boolean(state.stale));
  if (state.label) {
    const text = `${state.label.text}${state.label.unit ? `<small>${state.label.unit}</small>` : ""}`;
    if (marker.label.innerHTML !== text) marker.label.innerHTML = text;
  }
  if (marker.halo) {
    const show = Boolean(state.halo) && displayMode === "all";
    marker.haloTarget = show ? 1 : 0;
    if (show) marker.haloColor.setHex(STATUS_COLORS[state.halo] ?? STATUS_COLORS.offline);
    startAnimation("halos");
  }
}

export function updateSeat(id, occupied) {
  const seat = seats.get(id);
  if (!seat) return;
  seat.wanted = occupied === true;
  setVisible(seat, displayMode === "all" && seat.wanted);
}

// Halo colour fades over 300 ms (no flicker between replay samples).
let lastHaloStep = performance.now();
onBeforeRender(() => {
  const now = performance.now();
  const step = Math.min(1, (now - lastHaloStep) / 300);
  lastHaloStep = now;
  let moving = false;
  for (const marker of markers.values()) {
    if (!marker.halo) continue;
    const uniforms = marker.halo.material.uniforms;
    const k = Math.min(1, step * 3);
    const opacity = uniforms.uOpacity.value + (marker.haloTarget - uniforms.uOpacity.value) * k;
    uniforms.uOpacity.value = Math.abs(opacity - marker.haloTarget) < 0.01 ? marker.haloTarget : opacity;
    uniforms.uColor.value.lerp(marker.haloColor, k);
    const colorGap = Math.abs(uniforms.uColor.value.r - marker.haloColor.r) + Math.abs(uniforms.uColor.value.g - marker.haloColor.g) + Math.abs(uniforms.uColor.value.b - marker.haloColor.b);
    if (colorGap < 0.004) uniforms.uColor.value.copy(marker.haloColor);
    marker.halo.visible = uniforms.uOpacity.value > 0.005;
    if (uniforms.uOpacity.value !== marker.haloTarget || colorGap >= 0.004) moving = true;
  }
  if (!moving) stopAnimation("halos");
});

// One-off ring when a new reading arrives (400 ms). No ring for stale or offline markers.
export function flashMarker(id) {
  const marker = markers.get(id);
  if (!marker || !marker.visible || marker.el.dataset.status === "offline") return;
  marker.el.classList.remove("is-flashing");
  void marker.el.offsetWidth;
  marker.el.classList.add("is-flashing");
  window.setTimeout(() => marker.el.classList.remove("is-flashing"), 450);
}

export function pulseMarker(id) {
  const marker = markers.get(id);
  if (!marker) return;
  marker.el.classList.remove("is-pulsing");
  void marker.el.offsetWidth;
  marker.el.classList.add("is-pulsing");
  window.setTimeout(() => marker.el.classList.remove("is-pulsing"), 1300);
}

// Magnetic hover: the nearest visible marker within the radius (screen px).
export function nearestMarker(x, y, radius) {
  let best = null;
  let bestDistance = radius * radius;
  for (const marker of markers.values()) {
    if (!marker.visible || !marker.onScreen) continue;
    const distance = (marker.x - x) ** 2 + (marker.y - y) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = marker; }
  }
  return best;
}

let hovered = null;
export function setHovered(marker) {
  if (hovered === marker) return;
  hovered?.el.classList.remove("is-hovered");
  hovered = marker;
  hovered?.el.classList.add("is-hovered");
}
export const hoveredMarker = () => hovered;

// Staggered reveal used by the opening sequence (60 ms apart).
export function revealMarkers(immediate = false) {
  const list = [...markers.values()].sort((a, b) => a.anchor.z - b.anchor.z);
  layer.classList.add("is-revealing");
  list.forEach((marker, index) => {
    marker.el.style.setProperty("--reveal-delay", immediate ? "0ms" : `${index * 60}ms`);
  });
  requestAnimationFrame(() => layer.classList.add("is-revealed"));
}
