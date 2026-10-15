// Camera positions for each theme, the "back to default view" check, and the standby sway.
import * as THREE from "three";
import { camera, getControls, flyTo, onCameraStep, startAnimation, stopAnimation } from "./viewer.js";

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
    // From the door side (south), lower than before so the meeting table, people and sensors sit in
    // the middle of the picture rather than the ducts and the ladder (section B4).
    home: { target: new THREE.Vector3(c.x + 0.3, floorY + 1.5, c.z + 0.4), position: new THREE.Vector3(c.x - s.x * 0.75, floorY + s.y * 1.12, room.box.max.z + s.z * 1.3) },
    // From the door (south), below the 4 m grating, looking down across the meeting table.
    environment: { target: table.clone().setY(table.y - 0.2), position: new THREE.Vector3(table.x - 0.9, floorY + 3.1, room.box.max.z + 4.4) },
    // From the door side, below the 4 m grating and west of the ladder, looking along the west wall:
    // all sockets and the lines to the total meter are in view (the old east view looked through the ladder).
    energy: { target: new THREE.Vector3(room.box.min.x + 0.8, floorY + 0.4, c.z - 0.2), position: new THREE.Vector3(c.x + 1.5, floorY + 3.3, room.box.max.z + 5.0) },
    // High, steep view to show the ducts and terminals.
    devices: { target: new THREE.Vector3(c.x, floorY + 2.2, c.z), position: new THREE.Vector3(c.x - s.x * 0.45, floorY + s.y * 2.05, c.z + s.z * 0.55) },
  };
  presets.ai = presets.home; // the AI drawer insets the view instead (ui/panel.js updateViewInset)
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
  // Far enough to see where in the room the object is, not just its surface.
  const position = center.clone().addScaledVector(direction, Math.max(3.6, radius * 8));
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
  swayRemove = onCameraStep(() => {
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
