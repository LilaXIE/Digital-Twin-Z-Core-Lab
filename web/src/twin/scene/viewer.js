// Renderer, camera and the on-demand frame loop. Nothing renders unless the camera moves,
// data changes or an animation has asked for frames (requestRender / startAnimation).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 400);
camera.position.set(9, 8, 11);

let renderer = null;
let controls = null;
let canvas = null;
let frameRequested = false;
let lastFrameTime = 0;
let frameCap = 0; // ms between frames; 0 = display rate
const animations = new Set();
const beforeRender = new Set();
const afterRender = new Set();
let customRender = null;
let pixelRatioCap = 2;
let renderScale = 1;

// Frame timing for the quality controller and the internal FPS readout.
export const stats = { fps: 0, frames: 0, windowStart: 0, lastFrameMs: 0 };

export function initViewer(canvasElement) {
  canvas = canvasElement;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance", stencil: false });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.localClippingEnabled = false;

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.addEventListener("change", requestRender);
  resize();
  new ResizeObserver(resize).observe(canvas.parentElement);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) requestRender(); });
  return { renderer, controls };
}

export const getRenderer = () => renderer;
export const getControls = () => controls;
export const getCanvas = () => canvas;

export function setPixelRatioCap(cap, scale = 1) {
  pixelRatioCap = cap;
  renderScale = scale;
  resize();
}

// Panels cover part of the screen; the projection centre shifts so the room stays in the free area.
const inset = { right: 0, bottom: 0, current: { x: 0, y: 0 } };
export function setViewInset({ right = 0, bottom = 0 } = {}) {
  inset.right = right;
  inset.bottom = bottom;
  startAnimation("inset");
  requestRender();
}
function applyViewOffset(width, height) {
  const tx = inset.right / 2;
  const ty = inset.bottom / 2;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  inset.current.x += reduced ? tx - inset.current.x : (tx - inset.current.x) * 0.18;
  inset.current.y += reduced ? ty - inset.current.y : (ty - inset.current.y) * 0.18;
  if (Math.abs(tx - inset.current.x) < 0.5 && Math.abs(ty - inset.current.y) < 0.5) { inset.current.x = tx; inset.current.y = ty; stopAnimation("inset"); }
  if (inset.current.x || inset.current.y) camera.setViewOffset(width, height, inset.current.x, inset.current.y, width, height);
  else camera.clearViewOffset();
}

export function resize() {
  if (!renderer) return;
  const parent = canvas.parentElement;
  const width = parent.clientWidth;
  const height = parent.clientHeight;
  if (!width || !height) return;
  // The 3D image may render below native resolution; HTML text above it stays sharp.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap) * renderScale);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  applyViewOffset(width, height);
  camera.updateProjectionMatrix();
  for (const listener of resizeListeners) listener(width, height);
  requestRender();
}
const resizeListeners = new Set();
export const onResize = (listener) => { resizeListeners.add(listener); return () => resizeListeners.delete(listener); };

export function setFrameCap(fps) { frameCap = fps ? 1000 / fps : 0; }

export function requestRender() {
  if (frameRequested || !renderer) return;
  frameRequested = true;
  requestAnimationFrame(frame);
}

export function startAnimation(name) { animations.add(name); requestRender(); }
export function stopAnimation(name) { animations.delete(name); requestRender(); }
export const isAnimating = () => animations.size > 0;
export const activeAnimations = () => [...animations];

export const onBeforeRender = (fn) => { beforeRender.add(fn); return () => beforeRender.delete(fn); };
export const onAfterRender = (fn) => { afterRender.add(fn); return () => afterRender.delete(fn); };
export function setCustomRender(fn) { customRender = fn; requestRender(); }

function frame(now) {
  frameRequested = false;
  if (document.hidden) return;
  if (frameCap && now - lastFrameTime < frameCap - 1) {
    requestRender();
    return;
  }
  const delta = lastFrameTime ? Math.min(0.1, (now - lastFrameTime) / 1000) : 0.016;
  lastFrameTime = now;
  const moving = controls.update(delta);
  if (animations.has("inset")) { applyViewOffset(canvas.clientWidth, canvas.clientHeight); camera.updateProjectionMatrix(); }
  for (const fn of beforeRender) fn(delta, now);
  if (customRender) customRender(renderer, scene, camera);
  else renderer.render(scene, camera);
  for (const fn of afterRender) fn(delta, now);
  measure(now);
  if (moving || animations.size) requestRender();
}

function measure(now) {
  if (!stats.windowStart) stats.windowStart = now;
  stats.frames += 1;
  stats.lastFrameMs = now;
  if (now - stats.windowStart >= 1000) {
    stats.fps = Math.round((stats.frames * 1000) / (now - stats.windowStart));
    stats.frames = 0;
    stats.windowStart = now;
  }
}

// Renders one frame immediately (used by the snapshot exporter).
export function renderNow() {
  controls.update();
  for (const fn of beforeRender) fn(0, performance.now());
  if (customRender) customRender(renderer, scene, camera);
  else renderer.render(scene, camera);
}

// Smooth camera flight: position and target interpolate together.
let flight = null;
export function flyTo(position, target, duration = 1000) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || duration <= 0) {
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
    requestRender();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const fromPosition = camera.position.clone();
    const fromTarget = controls.target.clone();
    const start = performance.now();
    if (flight) flight.cancel();
    const id = `flight-${start}`;
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
    const step = () => {
      const x = Math.min(1, (performance.now() - start) / duration);
      const e = ease(x);
      camera.position.lerpVectors(fromPosition, position, e);
      controls.target.lerpVectors(fromTarget, target, e);
      if (x >= 1) { remove(); resolve(); }
    };
    const remove = onBeforeRender(step);
    flight = { cancel: () => { remove(); stopAnimation(id); resolve(); } };
    startAnimation(id);
    window.setTimeout(() => { stopAnimation(id); }, duration + 50);
  });
}
export const cancelFlight = () => { flight?.cancel(); flight = null; };
