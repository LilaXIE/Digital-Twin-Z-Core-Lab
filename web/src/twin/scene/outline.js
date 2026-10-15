// Selection outline (section 13.8): a soft accent glow around the selected component without
// recolouring it. Implemented as back-face shells pushed out along smoothed normals (no extra
// render pass); the low tier uses plain edge lines instead.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { scene, startAnimation, stopAnimation, requestRender } from "./viewer.js";

const shellVertex = /* glsl */`
uniform float uWidth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  mv.xyz += n * uWidth * max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const shellFragment = "uniform vec3 uColor; uniform float uOpacity; void main() { gl_FragColor = vec4(uColor, uOpacity); }";

let mode = "soft"; // soft | lines
const smoothCache = new WeakMap();
let selected = null;
let hovered = null;

function smoothed(geometry) {
  if (!smoothCache.has(geometry)) {
    const clone = geometry.clone();
    clone.deleteAttribute("uv");
    clone.deleteAttribute("normal");
    const welded = mergeVertices(clone, 1e-4);
    welded.computeVertexNormals();
    clone.dispose();
    smoothCache.set(geometry, welded);
  }
  return smoothCache.get(geometry);
}

function shellMaterial(width, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: { uWidth: { value: width }, uColor: { value: new THREE.Color(0x2f8cff) }, uOpacity: { value: 0 } },
    vertexShader: shellVertex, fragmentShader: shellFragment, side: THREE.BackSide, transparent: true, depthWrite: false, toneMapped: false,
    userData: { opacity },
  });
}

function build(meshes, layers) {
  const group = new THREE.Group();
  group.renderOrder = 8;
  const materials = [];
  for (const mesh of meshes) {
    if (mode === "lines") {
      const material = new THREE.LineBasicMaterial({ color: 0x2f8cff, transparent: true, opacity: 0, depthTest: false, toneMapped: false });
      material.userData.opacity = layers[0][1];
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 35), material);
      lines.renderOrder = 8;
      group.add(lines);
      materials.push(material);
      continue;
    }
    for (const [width, opacity] of layers) {
      const material = shellMaterial(width, opacity);
      const shell = new THREE.Mesh(smoothed(mesh.geometry), material);
      shell.renderOrder = 8;
      group.add(shell);
      materials.push(material);
    }
  }
  scene.add(group);
  return { group, materials };
}

function setOpacity(entry, factor) {
  for (const material of entry.materials) {
    if (material.uniforms) material.uniforms.uOpacity.value = material.userData.opacity * factor;
    else material.opacity = material.userData.opacity * factor;
  }
}

function dispose(entry) {
  if (!entry) return;
  scene.remove(entry.group);
  entry.materials.forEach((material) => material.dispose());
  entry.group.traverse((object) => { if (object.isLineSegments) object.geometry.dispose(); });
}

// 200 ms fade-in, then one gentle pulse over 600 ms.
export function setSelectionOutline(meshes) {
  dispose(selected);
  selected = null;
  if (!meshes?.length) { requestRender(); return; }
  selected = build(meshes, [[0.0026, 0.95], [0.0062, 0.28]]);
  const entry = selected;
  const start = performance.now();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  startAnimation("outline");
  const step = (now) => {
    if (selected !== entry) { stopAnimation("outline"); return; }
    const t = now - start;
    const fade = Math.min(1, t / 200);
    const pulse = reduced ? 0 : t > 200 && t < 800 ? Math.sin(((t - 200) / 600) * Math.PI) * 0.45 : 0;
    setOpacity(entry, fade + pulse);
    requestRender();
    if (t < 820) requestAnimationFrame(step);
    else { setOpacity(entry, 1); stopAnimation("outline"); }
  };
  requestAnimationFrame(step);
}

// Hover outline in the Devices theme: 1 px, 40 % opacity.
export function setHoverOutline(meshes) {
  if (hovered?.meshes === meshes) return;
  dispose(hovered);
  hovered = null;
  if (meshes?.length) {
    hovered = build(meshes, [[0.0014, 0.4]]);
    hovered.meshes = meshes;
    setOpacity(hovered, 1);
  }
  requestRender();
}

export function setOutlineMode(next) { mode = next; }
