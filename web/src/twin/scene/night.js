// Night lighting (section 13.6): the six recessed fixtures glow warm white and cast soft pools
// of light on the floor. The pools are additive decals rather than six real lights.
import * as THREE from "three";
import { scene, startAnimation, stopAnimation, requestRender } from "./viewer.js";

const lamps = [];
let lampsOn = null;
let floorY = 0;

function poolTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,226,186,0.85)");
  gradient.addColorStop(0.45, "rgba(255,214,166,0.32)");
  gradient.addColorStop(1, "rgba(255,206,150,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function initNight(lampItems, floorLevel) {
  floorY = floorLevel;
  const texture = poolTexture();
  // Order lamps along the room so they light up one after another.
  const sorted = [...lampItems].sort((a, b) => a.box.getCenter(new THREE.Vector3()).z - b.box.getCenter(new THREE.Vector3()).z);
  for (const item of sorted) {
    const lens = item.meshes.flatMap((mesh) => (Array.isArray(mesh.material) ? [mesh.material[1]] : [])).filter(Boolean);
    const center = item.box.getCenter(new THREE.Vector3());
    const size = item.box.getSize(new THREE.Vector3());
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(size.x, size.z) * 2.6, Math.min(size.x, size.z) * 4.2 + 1.2), new THREE.MeshBasicMaterial({
      map: texture, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    pool.rotation.x = -Math.PI / 2;
    if (size.x > size.z) pool.rotation.z = Math.PI / 2;
    pool.position.set(center.x, floorY + 0.012, center.z);
    pool.renderOrder = 2;
    pool.visible = false;
    scene.add(pool);
    lamps.push({ lens, pool, level: 0 });
  }
}

function setLevel(lamp, level) {
  lamp.level = level;
  for (const material of lamp.lens) material.emissiveIntensity = level * 1.8;
  lamp.pool.material.opacity = level * 0.55;
  lamp.pool.visible = level > 0.001;
}

// Lamps switch in sequence (80 ms apart, 300 ms each); no flicker.
export function setLampsOn(on, { immediate = false } = {}) {
  if (lampsOn === on) return;
  lampsOn = on;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (immediate || reduced) {
    lamps.forEach((lamp) => setLevel(lamp, on ? 1 : 0));
    requestRender();
    return;
  }
  const start = performance.now();
  const id = `lamps-${start}`;
  startAnimation(id);
  const order = on ? lamps : [...lamps].reverse();
  const step = () => {
    const elapsed = performance.now() - start;
    let finished = true;
    order.forEach((lamp, index) => {
      const x = Math.min(1, Math.max(0, (elapsed - index * 80) / 300));
      if (x < 1) finished = false;
      setLevel(lamp, on ? x : 1 - x);
    });
    requestRender();
    if (!finished && lampsOn === on) requestAnimationFrame(step);
    else stopAnimation(id);
  };
  requestAnimationFrame(step);
}

export const lampsAreOn = () => Boolean(lampsOn);
