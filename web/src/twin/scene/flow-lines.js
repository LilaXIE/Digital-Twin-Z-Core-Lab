// Energy theme (section 5.3): a thin line of light runs from each socket that draws power to the
// "total demand" node by the door. Speed follows the socket's active power; no power, no line.
import * as THREE from "three";
import { scene, onBeforeRender, startAnimation, stopAnimation, requestRender } from "./viewer.js";

const flows = new Map();
let group = null;
let node = null;
let visible = false;
let time = 0;

const vertexShader = "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const fragmentShader = /* glsl */`
uniform vec3 uColor; uniform float uTime; uniform float uSpeed; uniform float uLength; uniform float uActive; uniform float uStatic;
varying vec2 vUv;
void main() {
  float along = vUv.x * uLength;
  float s = fract((along - uTime * uSpeed) / 0.42);
  float dash = smoothstep(0.0, 0.18, s) * smoothstep(0.62, 0.4, s);
  // Reduced motion: static arrow-like ticks instead of motion.
  float ticks = smoothstep(0.0, 0.1, fract(along / 0.42)) * smoothstep(0.5, 0.3, fract(along / 0.42));
  float glow = mix(dash, ticks, uStatic);
  float alpha = (0.16 + glow * 0.84) * uActive;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor * (1.0 + glow * 1.4), alpha);
}`;

function routeFor(start, target, box, floorY) {
  const inset = 0.14;
  const y = floorY + 0.05;
  const points = [start.clone(), new THREE.Vector3(start.x, y, start.z)];
  const nearX = Math.min(Math.abs(start.x - box.min.x), Math.abs(start.x - box.max.x));
  const nearZ = Math.min(Math.abs(start.z - box.min.z), Math.abs(start.z - box.max.z));
  const clampX = (x) => Math.min(box.max.x - inset, Math.max(box.min.x + inset, x));
  const clampZ = (z) => Math.min(box.max.z - inset, Math.max(box.min.z + inset, z));
  if (nearX <= nearZ) {
    // On a side wall: run along it to the door wall, then along the door wall.
    const wallX = clampX(Math.abs(start.x - box.min.x) < Math.abs(start.x - box.max.x) ? box.min.x : box.max.x);
    points.push(new THREE.Vector3(wallX, y, start.z), new THREE.Vector3(wallX, y, clampZ(target.z)), new THREE.Vector3(target.x, y, clampZ(target.z)));
  } else {
    const wallZ = clampZ(Math.abs(start.z - box.min.z) < Math.abs(start.z - box.max.z) ? box.min.z : box.max.z);
    const sideX = clampX(target.x < (box.min.x + box.max.x) / 2 ? box.min.x : box.max.x);
    points.push(new THREE.Vector3(start.x, y, wallZ), new THREE.Vector3(sideX, y, wallZ), new THREE.Vector3(sideX, y, clampZ(target.z)), new THREE.Vector3(target.x, y, clampZ(target.z)));
  }
  points.push(new THREE.Vector3(target.x, y, target.z));
  return points.filter((point, index, list) => index === 0 || point.distanceTo(list[index - 1]) > 0.01);
}

export function initFlowLines({ sockets, nodePosition, box, floorY, color = 0x2f8cff }) {
  group = new THREE.Group();
  group.name = "energy-flow";
  group.visible = false;
  scene.add(group);
  node = new THREE.Mesh(new THREE.CircleGeometry(0.16, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
  node.rotation.x = -Math.PI / 2;
  node.position.copy(nodePosition).setY(floorY + 0.06);
  group.add(node);
  for (const { id, anchor } of sockets) {
    const points = routeFor(anchor, nodePosition, box, floorY);
    const path = new THREE.CurvePath();
    for (let i = 1; i < points.length; i += 1) path.add(new THREE.LineCurve3(points[i - 1], points[i]));
    const length = path.getLength();
    const geometry = new THREE.TubeGeometry(path, Math.max(24, Math.round(length * 24)), 0.012, 6, false);
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uSpeed: { value: 0.3 }, uLength: { value: length }, uActive: { value: 0 }, uStatic: { value: 0 } },
      vertexShader, fragmentShader,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 4;
    group.add(mesh);
    flows.set(id, { mesh, material, power: 0, stale: true });
  }
  onBeforeRender((delta) => {
    if (!visible) return;
    time += delta;
    for (const flow of flows.values()) flow.material.uniforms.uTime.value = time;
  });
  return node.position.clone();
}

// power in watts; stale data stops the flow (line stays faint, no motion).
export function updateFlow(id, power, stale) {
  const flow = flows.get(id);
  if (!flow) return;
  flow.power = Number.isFinite(power) ? power : 0;
  flow.stale = stale;
  flow.material.uniforms.uActive.value = flow.power > 0.5 ? (stale ? 0.35 : 1) : 0;
  flow.material.uniforms.uSpeed.value = stale ? 0 : 0.12 + Math.min(1.6, flow.power / 220);
  syncAnimation();
}

export function setFlowsVisible(value) {
  visible = value;
  if (group) group.visible = value;
  syncAnimation();
}

function syncAnimation() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const flow of flows.values()) flow.material.uniforms.uStatic.value = reduced ? 1 : 0;
  // Continuous rendering only while the Energy theme shows a socket that is actually drawing power.
  const moving = visible && !reduced && [...flows.values()].some((flow) => flow.power > 0.5 && !flow.stale);
  if (moving) startAnimation("flow"); else stopAnimation("flow");
  requestRender();
}

export const flowSocketIds = () => [...flows.keys()];
