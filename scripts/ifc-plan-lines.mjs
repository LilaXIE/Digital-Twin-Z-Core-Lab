// Generates the floor-plan line drawing used by the opening animation (npm run bim:plan).
// Walls and columns are cut horizontally like an architectural plan; the door gets its swing,
// columns get grid lines, and the room gets overall dimensions. Coordinates are web-ifc's
// Y-up model space (same as the Fragments conversion); the page aligns them by bounding box.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as WebIFC from "web-ifc";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(process.argv[2] || "models/ifc/lab-archi.ifc");
const output = resolve(process.argv[3] || "web/public/models/plan-lines.json");
const CUT_HEIGHT = 1.2; // metres above the finished floor, as on a plan

const api = new WebIFC.IfcAPI();
api.SetWasmPath(resolve(projectRoot, "node_modules/web-ifc/") + "/", true);
await api.Init();
const modelId = api.OpenModel(readFileSync(input), { COORDINATE_TO_ORIGIN: true });

function meshesOf(type) {
  const ids = api.GetLineIDsWithType(modelId, type);
  const result = [];
  for (let i = 0; i < ids.size(); i += 1) {
    const expressId = ids.get(i);
    const triangles = [];
    const mesh = api.GetFlatMesh(modelId, expressId);
    for (let g = 0; g < mesh.geometries.size(); g += 1) {
      const placed = mesh.geometries.get(g);
      const geometry = api.GetGeometry(modelId, placed.geometryExpressID);
      const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
      const indices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
      const m = placed.flatTransformation;
      const point = (index) => {
        const x = vertices[index * 6], y = vertices[index * 6 + 1], z = vertices[index * 6 + 2];
        return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
      };
      for (let t = 0; t < indices.length; t += 3) triangles.push([point(indices[t]), point(indices[t + 1]), point(indices[t + 2])]);
      geometry.delete();
    }
    mesh.delete?.();
    result.push({ expressId, triangles });
  }
  return result;
}

function bounds(triangles) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const triangle of triangles) for (const p of triangle) for (let k = 0; k < 3; k += 1) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  return { min, max };
}

// Plane y = h through one triangle → at most one segment in plan (x, z).
function slice(triangle, h) {
  const points = [];
  for (let i = 0; i < 3; i += 1) {
    const a = triangle[i];
    const b = triangle[(i + 1) % 3];
    if ((a[1] - h) * (b[1] - h) < 0) {
      const t = (h - a[1]) / (b[1] - a[1]);
      points.push([a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return points.length === 2 ? [points[0][0], points[0][1], points[1][0], points[1][1]] : null;
}

const round = (value) => Math.round(value * 1000) / 1000;
const key = (s) => s.map((v) => Math.round(v * 200)).join(",");
function sectionSegments(elements, h) {
  const seen = new Set();
  const segments = [];
  for (const element of elements) {
    for (const triangle of element.triangles) {
      const segment = slice(triangle, h);
      if (!segment || Math.hypot(segment[2] - segment[0], segment[3] - segment[1]) < 0.004) continue;
      const forward = key(segment);
      const backward = key([segment[2], segment[3], segment[0], segment[1]]);
      if (seen.has(forward) || seen.has(backward)) continue;
      seen.add(forward);
      segments.push(segment.map(round));
    }
  }
  return segments;
}

const walls = [...meshesOf(WebIFC.IFCWALLSTANDARDCASE), ...meshesOf(WebIFC.IFCWALL)];
const columns = meshesOf(WebIFC.IFCCOLUMN);
const doors = meshesOf(WebIFC.IFCDOOR);
const slabs = meshesOf(WebIFC.IFCSLAB);
const all = [...walls, ...columns, ...doors, ...slabs];
const box = bounds(all.flatMap((element) => element.triangles));
const doorBoxes = doors.map((door) => bounds(door.triangles));
const floorY = doorBoxes.length ? Math.min(...doorBoxes.map((b) => b.min[1])) : box.min[1];
const cut = floorY + CUT_HEIGHT;

const lines = [];
const add = (kind, segment) => lines.push([kind, ...segment]);

// Grid through the column centres, extended past the room like a drawing grid.
const columnCentres = columns.map((column) => { const b = bounds(column.triangles); return [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2]; });
const unique = (values) => values.sort((a, b) => a - b).filter((value, index, list) => index === 0 || Math.abs(value - list[index - 1]) > 0.8);
const gridX = unique(columnCentres.map((c) => c[0]));
const gridZ = unique(columnCentres.map((c) => c[1]));
const margin = 0.9;
const labels = [];
gridX.forEach((x, index) => {
  add("grid", [x, box.min[2] - margin, x, box.max[2] + margin].map(round));
  labels.push({ kind: "grid", x: round(x), z: round(box.min[2] - margin - 0.28), text: String(index + 1) });
});
gridZ.forEach((z, index) => {
  add("grid", [box.min[0] - margin, z, box.max[0] + margin, z].map(round));
  labels.push({ kind: "grid", x: round(box.min[0] - margin - 0.28), z: round(z), text: String.fromCharCode(65 + index) });
});

for (const segment of sectionSegments(walls, cut)) add("wall", segment);
for (const segment of sectionSegments(columns, cut)) add("column", segment);

// Door: leaf at 90° and the swing arc, opening into the room.
const roomCentre = [(box.min[0] + box.max[0]) / 2, (box.min[2] + box.max[2]) / 2];
for (const b of doorBoxes) {
  const alongX = b.max[0] - b.min[0] >= b.max[2] - b.min[2];
  const width = alongX ? b.max[0] - b.min[0] : b.max[2] - b.min[2];
  const wallLine = alongX ? (b.min[2] + b.max[2]) / 2 : (b.min[0] + b.max[0]) / 2;
  const inward = alongX ? Math.sign(roomCentre[1] - wallLine) : Math.sign(roomCentre[0] - wallLine);
  const hinge = alongX ? [b.min[0], wallLine] : [wallLine, b.min[2]];
  const leafEnd = alongX ? [hinge[0], wallLine + inward * width] : [wallLine + inward * width, hinge[1]];
  add("door", [...hinge, ...leafEnd].map(round));
  const steps = 18;
  for (let i = 0; i < steps; i += 1) {
    const a0 = (i / steps) * Math.PI / 2;
    const a1 = ((i + 1) / steps) * Math.PI / 2;
    const point = (angle) => alongX
      ? [hinge[0] + Math.sin(angle) * width, wallLine + inward * Math.cos(angle) * width]
      : [wallLine + inward * Math.cos(angle) * width, hinge[1] + Math.sin(angle) * width];
    add("door", [...point(a0), ...point(a1)].map(round));
  }
}

// Overall dimensions, offset outside the walls, with tick marks.
const dimOffset = 0.55;
const tick = 0.12;
const dimZ = box.max[2] + dimOffset;
const dimX = box.max[0] + dimOffset;
add("dim", [box.min[0], dimZ, box.max[0], dimZ].map(round));
add("dim", [box.min[0], dimZ - tick, box.min[0], dimZ + tick].map(round));
add("dim", [box.max[0], dimZ - tick, box.max[0], dimZ + tick].map(round));
labels.push({ kind: "dim", x: round(roomCentre[0]), z: round(dimZ + 0.22), text: String(Math.round((box.max[0] - box.min[0]) * 1000)) });
add("dim", [dimX, box.min[2], dimX, box.max[2]].map(round));
add("dim", [dimX - tick, box.min[2], dimX + tick, box.min[2]].map(round));
add("dim", [dimX - tick, box.max[2], dimX + tick, box.max[2]].map(round));
labels.push({ kind: "dim", x: round(dimX + 0.22), z: round(roomCentre[1]), text: String(Math.round((box.max[2] - box.min[2]) * 1000)), rotate: true });

// Bounding box of everything in the model, matched against the loaded Fragments model's box.
const modelMin = [Infinity, Infinity, Infinity];
const modelMax = [-Infinity, -Infinity, -Infinity];
api.StreamAllMeshes(modelId, (mesh) => {
  for (let g = 0; g < mesh.geometries.size(); g += 1) {
    const placed = mesh.geometries.get(g);
    const geometry = api.GetGeometry(modelId, placed.geometryExpressID);
    const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
    const m = placed.flatTransformation;
    for (let i = 0; i < vertices.length; i += 6) {
      const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
      const p = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
      for (let k = 0; k < 3; k += 1) { modelMin[k] = Math.min(modelMin[k], p[k]); modelMax[k] = Math.max(modelMax[k], p[k]); }
    }
    geometry.delete();
  }
});
api.CloseModel(modelId);
const order = { grid: 0, wall: 1, column: 2, door: 3, dim: 4 };
lines.sort((a, b) => order[a[0]] - order[b[0]]);
const result = {
  source: "lab-archi.ifc",
  generatedBy: "npm run bim:plan",
  cutHeight: CUT_HEIGHT,
  floorY: round(floorY),
  bbox: { min: box.min.map(round), max: box.max.map(round) },
  modelBox: { min: modelMin.map(round), max: modelMax.map(round) },
  lines,
  labels,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(result));
console.log(`Plan lines: ${lines.length} segments (${Object.entries(lines.reduce((counts, line) => ({ ...counts, [line[0]]: (counts[line[0]] || 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(", ")}) → ${output}`);
