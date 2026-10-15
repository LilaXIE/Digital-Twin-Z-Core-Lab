// Camera positions for each theme, the "back to default view" check, and the standby sway.
import * as THREE from "three";
import { camera, getControls, flyTo, onBeforeRender, startAnimation, stopAnimation } from "./viewer.js";

let presets = {};
let room = null;

// The door is on the south wall (+Z). Positions are derived from the model so they follow model changes.
export function initPresets({ box, floorY, tableCenter, socketCenter }) {
  room = { box, floorY, center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
  const c = room.center;
  const s = room.size;
  const eye = floorY + 1.2;
  const table = tableCenter || new THREE.Vector3(c.x, floorY + 0.75, c.z);
  const sockets = socketCenter || new THREE.Vector3(c.x, floorY + 0.4, c.z);
  presets = {
    home: { target: new THREE.Vector3(c.x, floorY + 1.4, c.z), position: new THREE.Vector3(c.x - s.x * 1.05, floorY + s.y * 1.25, c.z + s.z * 1.05) },
    // From the door (south), below the 4 m grating, looking down across the meeting table.
    environment: { target: table.clone().setY(table.y - 0.2), position: new THREE.Vector3(table.x + 1.1, floorY + 3.1, room.box.max.z + 4.4) },
    // From the east, looking at the west and south walls where the sockets are.
    energy: { target: new THREE.Vector3(sockets.x + 0.6, floorY + 0.7, sockets.z + 0.4), position: new THREE.Vector3(room.box.max.x + 3.2, floorY + 3.6, c.z + s.z * 0.42) },
    // High, steep view to show the ducts and terminals.
    devices: { target: new THREE.Vector3(c.x, floorY + 2.2, c.z), position: new THREE.Vector3(c.x - s.x * 0.45, floorY + s.y * 2.05, c.z + s.z * 0.55) },
  };
  presets.ai = presets.home;
  const controls = getControls();
  controls.minDistance = 1.2;
  controls.maxDistance = s.length() * 2.6;
  return presets;
}

export const presetFor = (view) => presets[view] || presets.home;

export function flyToView(view, duration = 1000) {
  const preset = presetFor(view);
  return flyTo(preset.position, preset.target, duration);
}

export function jumpToView(view) {
  const preset = presetFor(view);
  camera.position.copy(preset.position);
  getControls().target.copy(preset.target);
  getControls().update();
}

// Distance from the theme's preset, used to show the "back to default view" button.
export function offPreset(view) {
  const preset = presetFor(view);
  return camera.position.distanceTo(preset.position) > 0.6 || getControls().target.distanceTo(preset.target) > 0.4;
}

// Focus on one object: keep the current viewing direction, move in to a comfortable distance.
export function focusBox(box, duration = 1000) {
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 0.35);
  const direction = camera.position.clone().sub(getControls().target).normalize();
  if (direction.y < 0.35) direction.y = 0.35;
  direction.normalize();
  const position = center.clone().addScaledVector(direction, Math.max(2.4, radius * 6));
  return flyTo(position, center, duration);
}

// Standby showcase: a slow ±25° swing around the theme's target (not a full orbit), 120 s per cycle.
let swayRemove = null;
export function startSway(view) {
  stopSway();
  const preset = presetFor(view);
  const offset = preset.position.clone().sub(preset.target);
  const radius = Math.hypot(offset.x, offset.z);
  const baseAngle = Math.atan2(offset.z, offset.x);
  const start = performance.now();
  startAnimation("sway");
  swayRemove = onBeforeRender(() => {
    const t = (performance.now() - start) / 1000;
    const angle = baseAngle + Math.sin((t / 120) * Math.PI * 2) * THREE.MathUtils.degToRad(25);
    camera.position.set(preset.target.x + Math.cos(angle) * radius, preset.target.y + offset.y, preset.target.z + Math.sin(angle) * radius);
    getControls().target.copy(preset.target);
  });
}
export function stopSway() {
  swayRemove?.();
  swayRemove = null;
  stopAnimation("sway");
}

export const roomInfo = () => room;
