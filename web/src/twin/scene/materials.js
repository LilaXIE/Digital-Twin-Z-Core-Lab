// IFC style → PBR material mapping, procedural textures (no downloads, no licences to track),
// and the shader hook shared by every realistic material: dithered cut-away, the ripple/lens
// that reveals the digital layer, and the opening section plane.
import * as THREE from "three";

// Uniforms shared by realistic and digital-layer materials.
export const shared = {
  uRippleCenter: { value: new THREE.Vector3() },
  uRippleRadius: { value: 0 },
  uRippleWidth: { value: 0.25 },
  uRippleFade: { value: 0 },
  uLensCenter: { value: new THREE.Vector3() },
  uLensRadius: { value: 1.2 },
  uLensStrength: { value: 0 },
  uIntroCut: { value: 1e5 },
  uIntroActive: { value: 0 },
  uRealCenter: { value: new THREE.Vector3() },
  uRealRadius: { value: 1e5 },
  uAccent: { value: new THREE.Color(0x2f8cff) },
};

export const MASK_GLSL = /* glsl */`
uniform vec3 uRippleCenter; uniform float uRippleRadius; uniform float uRippleWidth; uniform float uRippleFade;
uniform vec3 uLensCenter; uniform float uLensRadius; uniform float uLensStrength;
uniform float uIntroCut; uniform float uIntroActive; uniform vec3 uRealCenter; uniform float uRealRadius;
uniform vec3 uAccent;
float twRipple(vec3 p) {
  if (uRippleRadius <= 0.0) return 0.0;
  float d = distance(p, uRippleCenter);
  return (1.0 - smoothstep(uRippleRadius - 0.06, uRippleRadius, d)) * uRippleFade;
}
float twFront(vec3 p) {
  if (uRippleRadius <= 0.0) return 0.0;
  float d = distance(p, uRippleCenter);
  return (1.0 - smoothstep(0.0, uRippleWidth, abs(d - uRippleRadius))) * uRippleFade;
}
float twLens(vec3 p) { return (1.0 - smoothstep(uLensRadius * 0.82, uLensRadius, distance(p, uLensCenter))) * uLensStrength; }
float twIntroDigital(vec3 p) {
  if (uIntroActive < 0.5) return 0.0;
  return step(p.y, uIntroCut) * step(uRealRadius, distance(p.xz, uRealCenter.xz));
}
float twDither() { return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); }
`;

let materialSerial = 0;

// flags: { revealable: walls/grating become see-through in the ripple; frontGlow: ripple ring drawn on the surface }
export function enhance(material, { revealable = false, frontGlow = false } = {}) {
  const own = { uFade: { value: 1 }, uRevealable: { value: revealable ? 1 : 0 }, uFrontGlow: { value: frontGlow ? 1 : 0 } };
  material.userData.tw = own;
  const id = ++materialSerial;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, own);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTwWorld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvTwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vTwWorld;\nuniform float uFade; uniform float uRevealable; uniform float uFrontGlow;\n${MASK_GLSL}`)
      .replace("void main() {", `void main() {
  if (vTwWorld.y > uIntroCut) discard;
  if (uIntroActive > 0.5 && distance(vTwWorld.xz, uRealCenter.xz) > uRealRadius) discard;
  float twReveal = uRevealable * max(twRipple(vTwWorld), twLens(vTwWorld));
  float twKeep = uFade * (1.0 - twReveal * 0.94);
  if (twKeep < 0.999 && twDither() > twKeep) discard;`)
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>
  gl_FragColor.rgb += uAccent * twFront(vTwWorld) * uFrontGlow * 0.9;`);
  };
  material.customProgramCacheKey = () => `tw-${revealable ? 1 : 0}${frontGlow ? 1 : 0}-${material.type}`;
  material.userData.twId = id;
  return material;
}

// ---- Procedural textures ----
function canvasTexture(size, draw, { repeat = 1, color = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d"), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const textures = {};
function terrazzo() {
  return textures.terrazzo ||= canvasTexture(512, (ctx, size) => {
    const random = seeded(7);
    ctx.fillStyle = "#d9dbdc";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i += 1) {
      const shade = 150 + Math.floor(random() * 90);
      ctx.fillStyle = random() < 0.12 ? `rgba(${shade - 40},${shade - 44},${shade - 50},0.75)` : `rgba(${shade},${shade},${shade + 4},0.55)`;
      const r = 0.6 + random() * 2.6;
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, r, r * (0.5 + random() * 0.5), random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
function speckle(name, base, spread, seed) {
  return textures[name] ||= canvasTexture(256, (ctx, size) => {
    const random = seeded(seed);
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = base + (random() - 0.5) * spread;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }, { color: false });
}
function grating() {
  // Pressed-in grating, 33 × 11 mm mesh: bearing bars one way, cross bars the other.
  return textures.grating ||= canvasTexture(128, (ctx, size) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#fff";
    const bars = 4;
    for (let i = 0; i < bars; i += 1) ctx.fillRect((i * size) / bars, 0, size / 22, size);
    for (let i = 0; i < bars * 3; i += 1) ctx.fillRect(0, (i * size) / (bars * 3), size, size / 40);
  }, { color: false });
}
function grain() {
  return textures.grain ||= canvasTexture(256, (ctx, size) => {
    const random = seeded(23);
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      ctx.fillStyle = `rgba(${random() < 0.5 ? 0 : 255},${random() < 0.5 ? 0 : 255},128,${0.04 + random() * 0.05})`;
      ctx.fillRect(0, y, size, 1);
    }
  }, { color: false });
}

// UV scale (texture repeats per metre) is applied by the loader's box projection.
const library = {};
function make(name, create) { return () => (library[name] ||= create()); }

export const MATERIALS = {
  wallPaint: make("wallPaint", () => new THREE.MeshStandardMaterial({ color: 0xe9e4db, roughness: 0.92, metalness: 0, roughnessMap: speckle("paintRough", 228, 40, 3) })),
  columnPaint: make("columnPaint", () => new THREE.MeshStandardMaterial({ color: 0xece9e3, roughness: 0.88, metalness: 0 })),
  floor: make("floor", () => new THREE.MeshStandardMaterial({ color: 0xc4beb3, map: terrazzo(), roughness: 0.5, metalness: 0, roughnessMap: speckle("floorRough", 150, 60, 11) })),
  concrete: make("concrete", () => new THREE.MeshStandardMaterial({ color: 0xc4c4c2, roughness: 0.85, metalness: 0, roughnessMap: speckle("concreteRough", 210, 50, 13) })),
  hplWhite: make("hplWhite", () => new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.55, metalness: 0, roughnessMap: speckle("hplRough", 150, 22, 5) })),
  hplBlack: make("hplBlack", () => new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.58, metalness: 0, roughnessMap: speckle("hplRough", 150, 22, 5) })),
  aluminium: make("aluminium", () => new THREE.MeshStandardMaterial({ color: 0xd6d8da, roughness: 0.32, metalness: 1 })),
  blackAluminium: make("blackAluminium", () => new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.38, metalness: 0.9 })),
  chrome: make("chrome", () => new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.18, metalness: 1 })),
  paintedMetal: make("paintedMetal", () => new THREE.MeshStandardMaterial({ color: 0x6d7074, roughness: 0.5, metalness: 0.35 })),
  galvanized: make("galvanized", () => new THREE.MeshStandardMaterial({ color: 0xc0bfbb, roughness: 0.42, metalness: 0.85, roughnessMap: speckle("galvRough", 170, 70, 17) })),
  grating: make("grating", () => new THREE.MeshStandardMaterial({ color: 0xbdbcb8, roughness: 0.45, metalness: 0.8, alphaMap: grating(), transparent: true, depthWrite: false, side: THREE.DoubleSide })),
  lacquer: make("lacquer", () => new THREE.MeshStandardMaterial({ color: 0x5a5545, roughness: 0.35, metalness: 0, normalMap: grain(), normalScale: new THREE.Vector2(0.15, 0.15) })),
  tvBlack: make("tvBlack", () => new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.3, metalness: 0.1 })),
  screen: make("screen", () => new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, reflectivity: 0.6 })),
  glass: make("glass", () => new THREE.MeshPhysicalMaterial({ color: 0xf2f7f6, roughness: 0.05, metalness: 0, transmission: 0.9, thickness: 0.006, ior: 1.5, transparent: true, opacity: 1, depthWrite: false })),
  insulation: make("insulation", () => new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.95 })),
  plainWhite: make("plainWhite", () => new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.7 })),
  plainGrey: make("plainGrey", () => new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 0.7 })),
  duct: make("duct", () => new THREE.MeshStandardMaterial({ color: 0xbfc1c2, roughness: 0.38, metalness: 0.85, roughnessMap: speckle("galvRough", 170, 70, 17) })),
  copper: make("copper", () => new THREE.MeshStandardMaterial({ color: 0xc9845a, roughness: 0.35, metalness: 1 })),
  powderWhite: make("powderWhite", () => new THREE.MeshStandardMaterial({ color: 0xf5f5f3, roughness: 0.55, metalness: 0.1 })),
  lampFrame: make("lampFrame", () => new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.5, metalness: 0.1 })),
  lampLens: make("lampLens", () => new THREE.MeshStandardMaterial({ color: 0xf9f8f4, roughness: 0.4, emissive: new THREE.Color(0xfff1dc), emissiveIntensity: 0 })),
  ahu: make("ahu", () => new THREE.MeshStandardMaterial({ color: 0xa8acb0, roughness: 0.45, metalness: 0.5 })),
  sensorPlastic: make("sensorPlastic", () => new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.42, metalness: 0 })),
  sensorGlass: make("sensorGlass", () => new THREE.MeshPhysicalMaterial({ color: 0x0f1012, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 })),
};

// UV repeats per metre for box projection.
export const UV_SCALE = { floor: 0.55, concrete: 0.8, wallPaint: 1.2, hplWhite: 1.5, hplBlack: 1.5, grating: 30, galvanized: 2, duct: 2, lacquer: 1.2 };

// IFC surface styles, matched by colour (0–255) and alpha within one model.
const STYLE_COLORS = {
  archi: [
    ["transparent", 120, 120, 120, 0], ["blue", 120, 120, 120, 255], ["concrete", 192, 192, 192, 255], ["insulation", 127, 127, 127, 255],
    ["air", 255, 255, 255, 255], ["aluminium", 244, 244, 244, 255], ["plaster", 249, 249, 249, 255], ["paintedMetal", 104, 104, 104, 255],
    ["hplWhite", 238, 238, 238, 255], ["blackAluminium", 25, 25, 25, 255], ["hplBlack", 20, 20, 20, 255], ["tvBlack", 49, 49, 49, 255],
    ["screen", 157, 157, 157, 26], ["lacquer", 90, 85, 69, 255], ["glass", 236, 240, 239, 20], ["galvanized", 189, 187, 185, 255],
  ],
  sensor: [["sensorPlastic", 250, 250, 250, 255], ["sensorGlass", 20, 20, 20, 255]],
};

function styleFor(modelId, rgba) {
  const styles = STYLE_COLORS[modelId];
  if (!styles || !rgba) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const [name, r, g, b, a] of styles) {
    const distance = Math.abs(r - rgba.r) + Math.abs(g - rgba.g) + Math.abs(b - rgba.b) + Math.abs(a - rgba.a) * 0.5;
    if (distance < bestDistance) { bestDistance = distance; best = name; }
  }
  return bestDistance <= 12 ? best : null;
}

// Category and name decide first (walls are always paint, coverings are the 4 m grating), then the IFC style.
export function materialKeyFor({ modelId, category, name, rgba }) {
  const style = styleFor(modelId, rgba);
  // Walls and columns carry the placeholder "transparent" style in this IFC, so category decides first.
  if (modelId === "archi") {
    if (/WALL/.test(category)) return style === "insulation" ? "insulation" : "wallPaint";
    if (category === "IFCSLAB") return "floor";
    if (category === "IFCCOLUMN") return "columnPaint";
    if (category === "IFCCOVERING") return "grating";
    if (category === "IFCBUILDINGELEMENTPROXY") return style === "paintedMetal" ? "paintedMetal" : "galvanized";
    if (style === "transparent") return null;
    return ({ concrete: "concrete", aluminium: /cabiet|Cristaleira/i.test(name) ? "chrome" : "aluminium", plaster: "wallPaint", paintedMetal: "paintedMetal",
      hplWhite: "hplWhite", blackAluminium: "blackAluminium", hplBlack: "hplBlack", tvBlack: "tvBlack", screen: "screen", lacquer: "lacquer",
      glass: "glass", galvanized: "galvanized", insulation: "insulation", air: "plainWhite", blue: "plainGrey" })[style] || "plainWhite";
  }
  if (modelId === "mep") {
    if (/Lighting Fixture/i.test(name)) return "lampFrame";
    if (/Pipe|CU\b|Soldered/i.test(name)) return "copper";
    if (/Duct|Bend|Tee|Taper|Shoe|Branch/i.test(name)) return "duct";
    if (/Diffuser|Grille/i.test(name)) return "powderWhite";
    if (/AHU/i.test(name)) return "ahu";
    return "galvanized";
  }
  if (modelId === "sensor") return style === "sensorGlass" ? "sensorGlass" : "sensorPlastic";
  return "plainWhite";
}

const instances = new Map();
// One enhanced material per (key, variant); walls get their own instance so each can fade on its own.
export function materialFor(key, { unique = null, revealable = false, frontGlow = false } = {}) {
  const cacheKey = `${key}:${unique ?? ""}:${revealable}:${frontGlow}`;
  if (!instances.has(cacheKey)) {
    const base = MATERIALS[key]?.() || MATERIALS.plainWhite();
    const material = unique === null && !revealable && !frontGlow ? base : base.clone();
    material.name = key;
    instances.set(cacheKey, enhance(material, { revealable, frontGlow }));
  }
  return instances.get(cacheKey);
}

export function allMaterials() { return [...instances.values()]; }

// Low tier: glass without the transmission pass.
export function setGlassQuality(high) {
  for (const material of instances.values()) {
    if (material.name !== "glass") continue;
    material.transmission = high ? 0.9 : 0;
    material.opacity = high ? 1 : 0.22;
    material.needsUpdate = true;
  }
}
