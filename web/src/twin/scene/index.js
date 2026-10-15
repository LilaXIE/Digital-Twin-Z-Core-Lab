// Scene assembly and the API the UI uses (fly to a theme, focus a device, pick, layers, snapshot).
import * as THREE from "three";
import { initViewer, scene, camera, getControls, getCanvas, requestRender, onBeforeRender } from "./viewer.js";
import { loadModels, itemDetails } from "./model-loader.js";
import { initLighting, noteCameraMotion } from "./lighting.js";
import { initNight } from "./night.js";
import { initPresets, flyToView, focusBox, presetFor, offPreset, startSway, stopSway, jumpToView } from "./camera-presets.js";
import { initCutaway, fadedWallMeshes } from "./cutaway.js";
import { initMarkers, addMarker, setDisplayMode } from "./markers.js";
import { initFlowLines, setFlowsVisible } from "./flow-lines.js";
import { initDigitalLayer } from "./digital-layer.js";
import { startPlan, setPlanProgress, alignPlan, failPlan, playIntro } from "./intro.js";
import { setSelectionOutline, setHoverOutline } from "./outline.js";
import { applyTier, initialTier, startMeasuring } from "./quality.js";
import { registry } from "../data/devices.js";

export const sceneState = {
  ready: false,
  result: null,
  floorY: 0,
  roomBox: new THREE.Box3(),
  anchors: new Map(), // deviceId → Vector3 (top of the sensor)
  deviceItems: new Map(), // deviceId → display item
  layerVisibility: { archi: true, mep: true, sensor: true },
  sensorMode: "all",
  totalNode: null,
};

export async function initScene({ canvas, markerLayer, onProgress }) {
  initViewer(canvas);
  await startPlan(markerLayer);
  let result;
  try {
    result = await loadModels({ onProgress: (value, spec) => { setPlanProgress(value); onProgress?.(value, spec); } });
  } catch (error) {
    failPlan();
    throw error;
  }
  sceneState.result = result;
  for (const group of Object.values(result.groups)) scene.add(group);
  const archiBox = new THREE.Box3().setFromObject(result.groups.archi);
  sceneState.roomBox.copy(archiBox);
  const slab = result.byCategory.get("IFCSLAB")?.[0];
  sceneState.floorY = slab ? slab.box.max.y : archiBox.min.y;
  const floorY = sceneState.floorY;
  alignPlan(archiBox);

  initLighting(archiBox);
  initNight(result.lamps, floorY);

  // Bind IFC sensors (by GlobalId) to their display items; the marker sits on top of each one.
  const sensorModel = result.models.get("sensor");
  const sensorDevices = registry.devices.filter((device) => device.sensorGuid);
  const localIds = sensorModel ? await sensorModel.getLocalIdsByGuids(sensorDevices.map((device) => device.sensorGuid)) : [];
  sensorDevices.forEach((device, index) => {
    const localId = localIds[index];
    const item = localId == null ? null : result.items.get(`sensor:${localId}`);
    if (!item) return;
    device.binding = { modelId: "sensor", localId };
    sceneState.deviceItems.set(device.id, item);
    const center = item.box.getCenter(new THREE.Vector3());
    sceneState.anchors.set(device.id, new THREE.Vector3(center.x, item.box.max.y + 0.03, center.z));
  });

  const table = (result.byCategory.get("IFCFURNISHINGELEMENT") || []).find((item) => /Table/i.test(item.name));
  const tableCenter = table ? table.box.getCenter(new THREE.Vector3()).setY(table.box.max.y) : null;
  const socketAnchors = registry.devices.filter((device) => device.model === "WS523" && sceneState.anchors.has(device.id)).map((device) => ({ id: device.id, anchor: sceneState.anchors.get(device.id) }));
  const socketCenter = socketAnchors.length ? socketAnchors.reduce((sum, item) => sum.add(item.anchor), new THREE.Vector3()).multiplyScalar(1 / socketAnchors.length) : null;
  initPresets({ box: archiBox, floorY, tableCenter, socketCenter });
  initCutaway(result.walls, archiBox.getCenter(new THREE.Vector3()));

  // The total-demand node sits just inside the door (south wall, +Z).
  const door = result.byCategory.get("IFCDOOR")?.[0];
  const doorCenter = door ? door.box.getCenter(new THREE.Vector3()) : archiBox.getCenter(new THREE.Vector3()).setZ(archiBox.max.z);
  const nodePosition = new THREE.Vector3(doorCenter.x - 1.1, floorY, archiBox.max.z - 0.55);
  sceneState.totalNode = initFlowLines({ sockets: socketAnchors, nodePosition, box: archiBox, floorY });

  const markerAnchors = [...sceneState.anchors.entries()].map(([id, anchor]) => ({ id, anchor }));
  initDigitalLayer({ items: result.items, sensorAnchors: markerAnchors, topY: Math.min(archiBox.max.y, floorY + 4.2), element: markerLayer });

  const allMeshes = Object.values(result.groups).flatMap((group) => group.children);
  initMarkers({ element: markerLayer, floorLevel: floorY, meshes: allMeshes, excluded: fadedWallMeshes, table: table?.box || null, room: archiBox });
  for (const device of registry.devices) {
    const anchor = sceneState.anchors.get(device.id);
    if (!anchor) continue;
    if (device.model === "VS341") {
      // Occupancy: no marker, only a faint person above an occupied seat.
      const tableTop = table ? table.box.max.y : floorY + 0.75;
      addMarker(device.id, new THREE.Vector3(anchor.x, tableTop + 0.32, anchor.z), { kind: "seat" });
    } else {
      addMarker(device.id, anchor, { halo: ["AM103", "AM308"].includes(device.model) });
    }
  }
  addMarker("total-power", sceneState.totalNode.clone().setY(floorY + 0.25), { kind: "node" });

  // Manual orbiting shows "back to default view"; flights do not count.
  getControls().addEventListener("start", () => { sceneState.userMoved = true; stopSway(); });
  getControls().addEventListener("change", noteCameraMotion);
  applyTier(initialTier());
  // MEP items for the Devices list.
  registry.mep = (result.byCategory.get("IFCFLOWSEGMENT") || []).concat(result.byCategory.get("IFCFLOWTERMINAL") || [], result.byCategory.get("IFCFLOWFITTING") || [], (result.byCategory.get("IFCBUILDINGELEMENTPROXY") || []).filter((item) => item.modelId === "mep"))
    .map((item) => ({ key: `${item.modelId}:${item.localId}`, name: item.name, category: item.category, modelId: item.modelId, localId: item.localId, guid: item.guid }));
  sceneState.ready = true;
  requestRender();
  return result;
}

export function runIntro({ onUi, onMarkers }) {
  const preset = presetFor("home");
  return playIntro({ box: sceneState.roomBox, floorY: sceneState.floorY, home: preset, onUi, onMarkers }).then(() => startMeasuring());
}

export function setLayerVisible(layer, visible) {
  sceneState.layerVisibility[layer] = visible;
  const group = sceneState.result?.groups[layer];
  if (!group) return;
  if (layer === "mep") {
    // Lamps stay visible with the MEP layer off (they light the room at night).
    for (const mesh of group.children) mesh.visible = visible || /Lighting Fixture/i.test(sceneState.result.items.get(mesh.name)?.name || "");
  } else group.visible = visible;
  requestRender();
}

export function setSensorMode(mode) {
  sceneState.sensorMode = mode;
  setLayerVisible("sensor", mode !== "hidden");
  setDisplayMode(mode);
}

export function themeLayers(view) {
  setFlowsVisible(view === "energy");
}

// Raycast against the display layer. Walls, floor and furniture are context, not selectable.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
export function pick(clientX, clientY, { selectableOnly = true } = {}) {
  const canvas = getCanvas();
  const rect = canvas.getBoundingClientRect();
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const faded = new Set(fadedWallMeshes());
  const candidates = Object.entries(sceneState.result.groups)
    .filter(([id]) => sceneState.layerVisibility[id])
    .flatMap(([, group]) => group.children)
    .filter((mesh) => mesh.visible && !faded.has(mesh) && mesh.userData.key !== "grating");
  const hits = raycaster.intersectObjects(candidates, false);
  const surface = hits[0]?.point || raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -sceneState.floorY), new THREE.Vector3());
  if (!selectableOnly) return { surface };
  for (const hit of hits) {
    const { modelId, localId, category } = hit.object.userData;
    if (modelId === "archi") break;
    const item = sceneState.result.items.get(`${modelId}:${localId}`);
    const deviceId = [...sceneState.deviceItems].find(([, value]) => value === item)?.[0];
    return { surface, item, deviceId, category };
  }
  return { surface, item: null };
}

export function focusDevice(deviceId) {
  const item = sceneState.deviceItems.get(deviceId);
  const anchor = sceneState.anchors.get(deviceId);
  if (item) return focusBox(item.box);
  if (anchor) return focusBox(new THREE.Box3(anchor.clone().subScalar(0.2), anchor.clone().addScalar(0.2)));
  return Promise.resolve();
}

export function focusItem(item) { return focusBox(item.box); }

export function selectOutline(item) { setSelectionOutline(item ? item.meshes : null); }
export function hoverOutline(item) { setHoverOutline(item ? item.meshes : null); }

export function detailsFor(item) {
  const model = sceneState.result?.models.get(item.modelId);
  return model ? itemDetails(model, item.localId, { category: item.category, guid: item.guid }) : Promise.resolve(null);
}

export const itemByKey = (key) => sceneState.result?.items.get(key);
export { flyToView, offPreset, startSway, stopSway, jumpToView, onBeforeRender };
