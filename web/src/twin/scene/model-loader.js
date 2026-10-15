// Loads the three Fragments models and builds the realistic display layer from their geometry.
// Fragments renders with Lambert materials only, so each geometry sample is rebuilt as an ordinary
// three.js mesh with a PBR material (chosen from the IFC style). Coordinates stay identical, every
// Revit family is kept, and the Fragments models remain the data source for IFC properties.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { camera } from "./viewer.js";
import { materialFor, materialKeyFor, UV_SCALE } from "./materials.js";

export const MODELS = [
  { id: "archi", url: "./models/fragments/Lab-archi.frag", label: "Lab Architecture", weight: 0.62 },
  { id: "mep", url: "./models/fragments/Lab-mep.frag", label: "Lab MEP", weight: 0.16 },
  { id: "sensor", url: "./models/fragments/Sensor.frag", label: "Lab Sensors", weight: 0.22 },
];

let fragments = null;
async function ensureFragments() {
  if (fragments) return fragments;
  const [module, worker] = await Promise.all([import("@thatopen/fragments"), import("@thatopen/fragments/worker?url")]);
  fragments = new module.FragmentsModels(worker.default);
  return fragments;
}

const readable = (value) => {
  while (value && typeof value === "object" && "value" in value) value = value.value;
  return value === null || value === undefined ? "" : String(value);
};

// World-space box projection: the dominant normal axis picks the plane for the UVs.
function boxProjectUvs(geometry, scale) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (ny >= nx && ny >= nz) { uv[i * 2] = x * scale; uv[i * 2 + 1] = z * scale; }
    else if (nx >= nz) { uv[i * 2] = z * scale; uv[i * 2 + 1] = y * scale; }
    else { uv[i * 2] = x * scale; uv[i * 2 + 1] = y * scale; }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function geometryFromMeshData(data, modelMatrix) {
  if (!data.positions?.length || !data.indices?.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(data.positions), 3));
  if (data.normals?.length) {
    const normals = new Float32Array(data.normals.length);
    for (let i = 0; i < normals.length; i += 1) normals[i] = data.normals[i] / 32767;
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  }
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  const matrix = new THREE.Matrix4().multiplyMatrices(modelMatrix, data.transform);
  geometry.applyMatrix4(matrix);
  if (!data.normals?.length) geometry.computeVertexNormals();
  else {
    const normal = geometry.attributes.normal;
    const v = new THREE.Vector3();
    for (let i = 0; i < normal.count; i += 1) { v.fromBufferAttribute(normal, i).normalize(); normal.setXYZ(i, v.x, v.y, v.z); }
  }
  return geometry;
}

// Lamps get a separate emissive lens: the downward-facing faces at the bottom of the fixture.
function splitLampLens(geometry) {
  const index = geometry.index;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  geometry.computeBoundingBox();
  const bottom = geometry.boundingBox.min.y;
  const lens = [];
  const frame = [];
  const n = new THREE.Vector3();
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
    n.set(normal.getX(a) + normal.getX(b) + normal.getX(c), normal.getY(a) + normal.getY(b) + normal.getY(c), normal.getZ(a) + normal.getZ(b) + normal.getZ(c)).normalize();
    const y = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    (n.y < -0.8 && y - bottom < 0.03 ? lens : frame).push(a, b, c);
  }
  geometry.setIndex(frame.concat(lens));
  geometry.clearGroups();
  geometry.addGroup(0, frame.length, 0);
  geometry.addGroup(frame.length, lens.length, 1);
  return lens.length > 0;
}

export async function loadModels({ onProgress }) {
  await ensureFragments();
  const result = { models: new Map(), items: new Map(), groups: {}, box: new THREE.Box3(), byCategory: new Map(), lamps: [], walls: [], gratings: [] };
  let done = 0;
  for (const spec of MODELS) {
    const response = await fetch(spec.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${spec.url}`);
    const buffer = await response.arrayBuffer();
    const model = await fragments.load(buffer, {
      modelId: spec.id,
      camera,
      onProgress(event) { onProgress?.(Math.min(0.92, done + spec.weight * 0.6 * (event?.progress ?? 0)), spec); },
    });
    result.models.set(spec.id, model);
    await fragments.update(true);
    onProgress?.(done + spec.weight * 0.65, spec);
    await buildDisplayLayer(spec.id, model, result);
    done += spec.weight;
    onProgress?.(Math.min(0.99, done), spec);
  }
  for (const group of Object.values(result.groups)) result.box.expandByObject(group);
  return result;
}

async function buildDisplayLayer(modelId, model, result) {
  const group = new THREE.Group();
  group.name = `display-${modelId}`;
  result.groups[modelId] = group;
  const localIds = await model.getItemsIdsWithGeometry();
  const categories = await model.getItemsOfCategories([/.*/]);
  const categoryOf = new Map();
  for (const [category, ids] of Object.entries(categories)) for (const id of ids) categoryOf.set(id, category);
  const [guids, attributes, elements, geometries] = await Promise.all([
    model.getGuidsByLocalIds(localIds),
    Promise.all(localIds.map((id) => model.getItem(id).getAttributes().catch(() => null))),
    fragments.editor.getElements(model.modelId, localIds).catch(() => []),
    model.getItemsGeometry(localIds),
  ]);
  const elementOf = new Map(elements.map((element) => [element.localId, element]));
  model.object.updateWorldMatrix(true, true);
  const modelMatrix = model.object.matrixWorld;

  localIds.forEach((localId, index) => {
    const category = categoryOf.get(localId) || "IFC";
    const name = readable(attributes[index]?.object?.Name) || readable(attributes[index]?.object?.ObjectType) || `${category} #${localId}`;
    const element = elementOf.get(localId);
    const item = { modelId, localId, category, name, guid: guids[index], meshes: [], box: new THREE.Box3() };
    const isWall = /WALL/.test(category);
    const isLamp = modelId === "mep" && /Lighting Fixture/i.test(name);
    // Samples of one component that share a material are merged: one draw call per component and material.
    const byMaterial = new Map();
    for (const data of geometries[index] || []) {
      const geometry = geometryFromMeshData(data, modelMatrix);
      if (!geometry) continue;
      const sample = element?.core.samples?.[data.sampleId];
      const raw = sample ? element.core.materials?.[sample.material] : null;
      const key = materialKeyFor({ modelId, category, name, rgba: raw });
      if (!key) { geometry.dispose(); continue; }
      boxProjectUvs(geometry, UV_SCALE[key] ?? 1);
      if (!byMaterial.has(key)) byMaterial.set(key, []);
      byMaterial.get(key).push(geometry);
    }
    for (const [key, parts] of byMaterial) {
      const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
      if (parts.length > 1) parts.forEach((part) => part.dispose());
      if (!geometry) continue;
      let material;
      if (isLamp && splitLampLens(geometry)) material = [materialFor("lampFrame"), materialFor("lampLens", { unique: `${localId}` })];
      else material = materialFor(key, { unique: isWall ? `${localId}` : null, revealable: isWall || key === "grating", frontGlow: modelId === "archi" && (isWall || key === "floor" || key === "columnPaint") });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${modelId}:${localId}`;
      mesh.userData = { modelId, localId, category, key };
      mesh.castShadow = !isWall && key !== "grating" && key !== "glass" && key !== "floor";
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      item.meshes.push(mesh);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      item.box.union(geometry.boundingBox);
    }
    if (!item.meshes.length) return;
    result.items.set(`${modelId}:${localId}`, item);
    if (!result.byCategory.has(category)) result.byCategory.set(category, []);
    result.byCategory.get(category).push(item);
    if (isWall) result.walls.push(item);
    if (isLamp) result.lamps.push(item);
    if (category === "IFCCOVERING") result.gratings.push(item);
  });
}

export const fragmentsInstance = () => fragments;

// IFC properties for the BIM section of the sensor sheet.
export async function itemDetails(model, localId, known = {}) {
  try {
    const item = model.getItem(localId);
    const [attributes, guid] = await Promise.all([item.getAttributes().catch(() => null), known.guid ? Promise.resolve(known.guid) : item.getGuid().catch(() => null)]);
    const object = attributes?.object || {};
    return { localId, category: known.category || "IFC", guid: guid || readable(object.GlobalId), name: readable(object.Name) || `IFC #${localId}`, objectType: readable(object.ObjectType) };
  } catch {
    return null;
  }
}
