// Walls facing the camera fade (dithered, so no transparency sorting) to show the interior.
// Nothing is deleted; the walls return as the camera moves round.
import * as THREE from "three";
import { camera, getControls, onBeforeRender, startAnimation, stopAnimation } from "./viewer.js";

const walls = [];
let center = new THREE.Vector3();
const FADED = 0.12;
let enabled = true;

export function initCutaway(wallItems, roomCenter) {
  center = roomCenter.clone();
  for (const item of wallItems) {
    const wallCenter = item.box.getCenter(new THREE.Vector3()).sub(center);
    const size = item.box.getSize(new THREE.Vector3());
    // Outward normal from the wall's thin axis, pointing away from the room centre.
    const outward = size.x < size.z ? new THREE.Vector3(Math.sign(wallCenter.x) || 1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(wallCenter.z) || 1);
    const materials = item.meshes.flatMap((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])).filter((m) => m.userData.tw);
    walls.push({ item, outward, materials, value: 1, target: 1 });
  }
  onBeforeRender(update);
  getControls().addEventListener("change", retarget);
  retarget();
}

export function setCutawayEnabled(value) {
  enabled = value;
  retarget();
}

function retarget() {
  const view = camera.position.clone().sub(center).setY(0).normalize();
  let changed = false;
  for (const wall of walls) {
    const target = enabled && wall.outward.dot(view) > 0.3 ? FADED : 1;
    if (target !== wall.target) { wall.target = target; changed = true; }
  }
  if (changed) { startAnimation("cutaway"); lastStep = performance.now(); }
}

let lastStep = 0;
function update() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastStep) / 1000);
  lastStep = now;
  let moving = false;
  for (const wall of walls) {
    if (wall.value === wall.target) continue;
    const speed = dt / 0.3; // 300 ms
    wall.value = wall.target < wall.value ? Math.max(wall.target, wall.value - speed) : Math.min(wall.target, wall.value + speed);
    for (const material of wall.materials) {
      // Real transparency reads cleaner than dithering at 1× resolution; walls are a single layer.
      const transparent = wall.value < 1;
      // Toggling transparency switches the shader's OPAQUE define, so the program must be rebuilt.
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
      material.opacity = wall.value;
      material.depthWrite = wall.value > 0.5;
    }
    moving = true;
  }
  if (!moving) stopAnimation("cutaway");
}

// Walls currently faded (used for marker occlusion: faded walls do not hide markers).
export function fadedWallMeshes() {
  return walls.filter((wall) => wall.target < 1).flatMap((wall) => wall.item.meshes);
}
