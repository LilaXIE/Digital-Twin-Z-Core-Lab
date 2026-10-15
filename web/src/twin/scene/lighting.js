// Base lighting: a procedural studio environment (three.js RoomEnvironment, no HDRI download),
// one sun light with soft shadows that only recompute when the sun moves, a shadow-catcher floor,
// a tint light for time-of-day colour, and optional ambient occlusion on the high tier.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { scene, camera, getRenderer, requestRender, setCustomRender, onResize } from "./viewer.js";

export const lights = {};
let roomBox = null;
let composer = null;
let aoPass = null;
let aoMode = "off"; // "off" | "always" | "static"
let cameraStill = true;

export function initLighting(box) {
  roomBox = box.clone();
  const renderer = getRenderer();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.62;
  pmrem.dispose();

  const tint = new THREE.HemisphereLight(0xf2f6ff, 0xd9d2c4, 0.35);
  scene.add(tint);

  const sun = new THREE.DirectionalLight(0xfff3e2, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  const size = box.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.z) * 0.95;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.5, far: Math.max(size.x, size.y, size.z) * 4 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  // The room sits on a surface that only shows shadows, like a model on a table.
  const center = box.getCenter(new THREE.Vector3());
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 4, size.z * 4), new THREE.ShadowMaterial({ color: 0x1d2633, opacity: 0.22, transparent: true, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, box.min.y - 0.002, center.z);
  ground.receiveShadow = true;
  ground.renderOrder = -1;
  scene.add(ground);

  Object.assign(lights, { sun, tint, ground, center, size });
  setSun({ direction: new THREE.Vector3(-0.4, 0.8, 0.45).normalize(), color: 0xfff3e2, intensity: 2, softness: 0.4, shadowOpacity: 0.22 });
  onResize((width, height) => composer?.setSize(width, height));
  return lights;
}

export function setSun({ direction, color, intensity, softness = 0.4, shadowOpacity = 0.22, castShadow = true, updateShadow = true }) {
  const { sun, center, size, ground } = lights;
  const distance = Math.max(size.x, size.y, size.z) * 1.8;
  sun.position.copy(center).addScaledVector(direction, distance);
  sun.target.position.copy(center);
  sun.target.updateMatrixWorld();
  sun.color.set(color);
  sun.intensity = intensity;
  sun.castShadow = castShadow && intensity > 0.05;
  sun.shadow.radius = 1.5 + softness * 9;
  ground.material.opacity = shadowOpacity;
  if (updateShadow) getRenderer().shadowMap.needsUpdate = true;
  requestRender();
}

export function setEnvironment({ intensity, tintSky, tintGround, tintIntensity, exposure }) {
  scene.environmentIntensity = intensity;
  lights.tint.color.set(tintSky);
  lights.tint.groundColor.set(tintGround);
  lights.tint.intensity = tintIntensity;
  if (exposure !== undefined) getRenderer().toneMappingExposure = exposure;
  requestRender();
}

export function setShadowMapSize(size) {
  const { sun } = lights;
  if (sun.shadow.mapSize.x === size) return;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
  getRenderer().shadowMap.needsUpdate = true;
  requestRender();
}

// Ambient occlusion (GTAO). "static" renders AO only once the camera has settled.
export async function setAmbientOcclusion(mode) {
  aoMode = mode;
  if (mode === "off") { setCustomRender(null); return; }
  if (!composer) {
    const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { OutputPass }] = await Promise.all([
      import("three/addons/postprocessing/EffectComposer.js"), import("three/addons/postprocessing/RenderPass.js"),
      import("three/addons/postprocessing/GTAOPass.js"), import("three/addons/postprocessing/OutputPass.js"),
    ]);
    const renderer = getRenderer();
    const size = renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
    const renderPass = new RenderPass(scene, camera);
    renderPass.clearAlpha = 0;
    composer.addPass(renderPass);
    aoPass = new GTAOPass(scene, camera, size.x, size.y);
    aoPass.output = GTAOPass.OUTPUT.Default;
    aoPass.blendIntensity = 0.85;
    aoPass.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
    aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(aoPass);
    composer.addPass(new OutputPass());
  }
  setCustomRender((renderer) => {
    const useAo = aoMode === "always" || (aoMode === "static" && cameraStill);
    if (useAo) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.render();
    } else renderer.render(scene, camera);
  });
}

// The camera module reports motion so "static" AO can switch off while orbiting.
let stillTimer = null;
export function noteCameraMotion() {
  if (aoMode !== "static") return;
  cameraStill = false;
  window.clearTimeout(stillTimer);
  stillTimer = window.setTimeout(() => { cameraStill = true; requestRender(); }, 350);
}

export const roomBounds = () => roomBox;
