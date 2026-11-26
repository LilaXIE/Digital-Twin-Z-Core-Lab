// Energy theme: no wiring is drawn (the real circuits are not modelled). Each socket that is switched
// on glows instead: a soft warm light around the socket and a ring on the surface below it that
// breathes slowly. Brightness follows the socket's active power; a socket with no fresh reading or
// no load stays dark.
import * as THREE from "three";
import { scene, camera, onBeforeRender, startAnimation, stopAnimation, requestRender } from "./viewer.js";

const glows = new Map();
let group = null;
let visible = false;
let time = 0;

const glowVertex = "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
// Camera-facing light: a bright core fading into a wide soft bloom.
const bulbFragment = /* glsl */`
uniform vec3 uColor; uniform float uLevel; uniform float uPulse;
varying vec2 vUv;
void main() {
  float d = distance(vUv, vec2(0.5)) * 2.0;
  float core = smoothstep(0.32, 0.0, d);
  float bloom = pow(max(0.0, 1.0 - d), 2.4);
  float a = (core * 0.95 + bloom * 0.6) * uLevel * (0.78 + 0.22 * uPulse);
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.97, 0.88), core * 0.7), min(1.0, a));
}`;
// Ring lying on the surface below: a lit pool with a thin brighter edge that slowly expands.
const ringFragment = /* glsl */`
uniform vec3 uColor; uniform float uLevel; uniform float uPulse;
varying vec2 vUv;
void main() {
  float d = distance(vUv, vec2(0.5)) * 2.0;
  float pool = smoothstep(1.0, 0.0, d) * 0.45;
  float r = 0.45 + 0.5 * uPulse;
  float edge = smoothstep(0.07, 0.0, abs(d - r)) * (1.0 - uPulse) * 0.8;
  float a = (pool + edge) * uLevel;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

const material = (fragmentShader, color) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false, toneMapped: false, blending: THREE.NormalBlending,
  uniforms: { uColor: { value: new THREE.Color(color) }, uLevel: { value: 0 }, uPulse: { value: 0 } },
  vertexShader: glowVertex, fragmentShader,
});

// sockets: [{ id, anchor (top of the socket), surfaceY (what it stands on) }]
export function initPowerGlow({ sockets, color = 0xff9f1c }) {
  group = new THREE.Group();
  group.name = "power-glow";
  group.visible = false;
  scene.add(group);
  for (const { id, anchor, surfaceY } of sockets) {
    const bulb = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), material(bulbFragment, color));
    bulb.position.copy(anchor).setY(anchor.y - 0.05);
    bulb.renderOrder = 5;
    const ring = new THREE.Mesh(new THREE.CircleGeometry(0.55, 48), material(ringFragment, color));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(anchor.x, surfaceY + 0.007, anchor.z);
    ring.renderOrder = 4;
    group.add(bulb, ring);
    glows.set(id, { bulb, ring, level: 0, target: 0, phase: Math.random() });
  }
  onBeforeRender((delta) => {
    if (!visible) return;
    time += delta;
    let moving = false;
    for (const glow of glows.values()) {
      glow.level += (glow.target - glow.level) * Math.min(1, delta * 4);
      if (Math.abs(glow.level - glow.target) < 0.004) glow.level = glow.target; else moving = true;
      const pulse = reducedMotion() ? 0.5 : (Math.sin((time / 2.6 + glow.phase) * Math.PI * 2) + 1) / 2;
      for (const mesh of [glow.bulb, glow.ring]) {
        mesh.material.uniforms.uLevel.value = glow.level;
        mesh.material.uniforms.uPulse.value = mesh === glow.ring ? (time / 2.6 + glow.phase) % 1 : pulse;
        mesh.visible = glow.level > 0.004;
      }
      glow.bulb.quaternion.copy(camera.quaternion);
    }
    if (!moving && !anyLit()) stopAnimation("power-glow");
  });
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const anyLit = () => [...glows.values()].some((glow) => glow.target > 0);

// Lit exactly while the socket's latest report says its relay is on (socketStatus in InfluxDB);
// brightness grows with the load: 0.45 with nothing plugged in, up to 1 at 600 W and more.
export function updatePowerGlow(id, power, stale, on) {
  const glow = glows.get(id);
  if (!glow) return;
  const lit = on === true && !stale;
  const watts = Number.isFinite(power) ? Math.max(0, power) : 0;
  glow.target = lit ? 0.45 + 0.55 * Math.min(1, Math.sqrt(watts / 600)) : 0;
  sync();
}

export function setPowerGlowVisible(value) {
  visible = value;
  if (group) group.visible = value;
  sync();
}

function sync() {
  if (visible && (anyLit() || [...glows.values()].some((glow) => glow.level > 0))) startAnimation("power-glow");
  else stopAnimation("power-glow");
  requestRender();
}

export const poweredSocketIds = () => [...glows.entries()].filter(([, glow]) => glow.target > 0).map(([id]) => id);
