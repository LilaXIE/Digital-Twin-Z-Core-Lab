// Live daylight (section 13.2): sun position from suncalc, cloudiness from measured solar radiation,
// and a CSS sky gradient behind the transparent canvas. A handful of parameters, no sky model.
import * as THREE from "three";
import SunCalc from "suncalc";
import { SITE } from "../config/site.js";
import { setSun, setEnvironment, lights } from "./lighting.js";
import { setLampsOn } from "./night.js";
import { startAnimation, stopAnimation } from "./viewer.js";
import { emit } from "../state.js";

// Light parameters ease from the previous state (2 s for time updates, 1.2 s for a theme change).
let applied = null;
let tween = 0;
function transition(target, duration) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const from = applied;
  applied = target;
  cancelAnimationFrame(tween);
  if (!from || duration <= 0 || reduced) { push(target, true); return; }
  const start = performance.now();
  let lastShadow = 0;
  const id = `daylight-${start}`;
  startAnimation(id);
  const step = (now) => {
    const x = Math.min(1, (now - start) / duration);
    const e = x * x * (3 - 2 * x);
    const blended = {
      direction: from.direction.clone().lerp(target.direction, e).normalize(),
      sunColor: new THREE.Color(from.sunColor).lerp(new THREE.Color(target.sunColor), e),
      sunIntensity: from.sunIntensity + (target.sunIntensity - from.sunIntensity) * e,
      softness: from.softness + (target.softness - from.softness) * e,
      shadowOpacity: from.shadowOpacity + (target.shadowOpacity - from.shadowOpacity) * e,
      castShadow: target.castShadow || from.castShadow,
      envIntensity: from.envIntensity + (target.envIntensity - from.envIntensity) * e,
      tintSky: new THREE.Color(from.tintSky).lerp(new THREE.Color(target.tintSky), e),
      tintGround: new THREE.Color(from.tintGround).lerp(new THREE.Color(target.tintGround), e),
      tintIntensity: from.tintIntensity + (target.tintIntensity - from.tintIntensity) * e,
      exposure: from.exposure + (target.exposure - from.exposure) * e,
    };
    // Shadow maps re-render at most every 200 ms while the light moves.
    const shadowDue = now - lastShadow > 200 || x >= 1;
    if (shadowDue) lastShadow = now;
    push(x >= 1 ? target : blended, shadowDue);
    if (x < 1) tween = requestAnimationFrame(step);
    else stopAnimation(id);
  };
  tween = requestAnimationFrame(step);
}
function push(p, updateShadow) {
  setSun({ direction: p.direction, color: p.sunColor, intensity: p.sunIntensity, softness: p.softness, shadowOpacity: p.shadowOpacity, castShadow: p.castShadow, updateShadow });
  setEnvironment({ intensity: p.envIntensity, tintSky: p.tintSky, tintGround: p.tintGround, tintIntensity: p.tintIntensity, exposure: p.exposure });
}

const DEG = Math.PI / 180;

// Sky keyframes by sun altitude: [zenith, horizon] colours, kept light for readable glass text.
const KEYS = {
  night: ["#c9d3e6", "#e3e8f2"], // light mode after sunset: the "blue hour" stays bright
  dawn: ["#c8d6ee", "#f6e2d2"],
  morning: ["#bcd6f2", "#eef3f8"],
  noon: ["#b4d3f4", "#eef4fa"],
  afternoon: ["#bed5ef", "#f3efe6"],
  dusk: ["#c3cde8", "#f5d9c4"],
};
const DARK_SKY = ["#0a0e1c", "#151a2b"];

const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t)));
const smooth = (edge0, edge1, x) => { const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

// Haurwitz clear-sky global horizontal irradiance (W/m²).
export function clearSkyIrradiance(zenithRad) {
  const cos = Math.cos(zenithRad);
  return cos <= 0 ? 0 : 1098 * cos * Math.exp(-0.057 / cos);
}

export function sunState(timeMs) {
  const position = SunCalc.getPosition(new Date(timeMs), SITE.latitude, SITE.longitude);
  // suncalc azimuth: 0 = south, positive towards west. Scene: south = +Z, east = +X, north = −Z.
  const azimuth = position.azimuth + SITE.trueNorthDeg * DEG;
  const altitude = position.altitude;
  const horizontal = Math.cos(altitude);
  const direction = new THREE.Vector3(-Math.sin(azimuth) * horizontal, Math.sin(altitude), Math.cos(azimuth) * horizontal).normalize();
  const noon = SunCalc.getTimes(new Date(timeMs), SITE.latitude, SITE.longitude).solarNoon.getTime();
  return { altitude, altitudeDeg: altitude / DEG, direction, morning: timeMs < noon };
}

// k = measured ÷ clear-sky radiation. Unknown (null) below 5° altitude or without fresh radiation.
export function clearnessIndex(radiation, altitude) {
  if (!Number.isFinite(radiation) || altitude < 5 * DEG) return null;
  const clear = clearSkyIrradiance(Math.PI / 2 - altitude);
  return clear > 0 ? Math.min(1.2, Math.max(0, radiation / clear)) : null;
}

export const skyWord = (k) => (k === null ? null : k >= 0.7 ? "skyClear" : k >= 0.3 ? "skyCloudy" : "skyOvercast");

let current = null;

export function applyDaylight({ timeMs, radiation, dark, immediate = false, duration = 2000 }) {
  const sun = sunState(timeMs);
  const k = clearnessIndex(radiation, sun.altitude);
  const cloud = k === null ? 0 : k >= 0.7 ? 0 : k >= 0.3 ? 0.5 : 1; // 0 clear … 1 overcast
  const altitudeDeg = sun.altitudeDeg;
  const isNight = altitudeDeg < -2;
  let sky;
  if (dark) sky = DARK_SKY;
  else if (isNight) sky = KEYS.night;
  else {
    const low = sun.morning ? KEYS.dawn : KEYS.dusk;
    const mid = sun.morning ? KEYS.morning : KEYS.afternoon;
    const a = altitudeDeg < 8 ? [KEYS.night, low, smooth(-2, 8, altitudeDeg)] : altitudeDeg < 30 ? [low, mid, smooth(8, 30, altitudeDeg)] : [mid, KEYS.noon, smooth(30, 70, altitudeDeg)];
    sky = [0, 1].map((i) => mix(a[0][i], a[1][i], a[2]).getStyle());
    if (cloud > 0) {
      // Cloud pulls the sky towards neutral grey and flattens the gradient.
      const grey = ["#d3d8de", "#e6e8eb"];
      sky = sky.map((color, i) => mix(color, grey[i], cloud * 0.75).getStyle());
    }
  }
  const root = document.documentElement;
  root.style.setProperty("--sky-top", new THREE.Color(sky[0]).getStyle());
  root.style.setProperty("--sky-bottom", new THREE.Color(sky[1]).getStyle());
  root.classList.toggle("sky-instant", immediate);

  const lowSun = sun.direction.y > 0.05 ? sun.direction : new THREE.Vector3(sun.direction.x, 0.05, sun.direction.z).normalize();
  if (dark) {
    // Night: no sun, a dim cool environment, and the room lit by its own lamps.
    transition({ direction: lowSun, sunColor: 0x9fb4ff, sunIntensity: 0, castShadow: false, softness: 1, shadowOpacity: 0.04,
      envIntensity: 0.2, tintSky: 0x8a96c8, tintGround: 0x5a4c3a, tintIntensity: 0.55, exposure: 1.08 }, immediate ? 0 : duration);
    setLampsOn(true, { immediate });
  } else {
    const daylightFactor = smooth(-1, 12, altitudeDeg);
    const warm = 1 - smooth(4, 35, altitudeDeg);
    const strength = [1, 0.55, 0.25][Math.round(cloud * 2)];
    transition({ direction: lowSun, sunColor: mix(0xfff2e2, 0xffb36b, warm), sunIntensity: 2.3 * strength * daylightFactor, castShadow: daylightFactor > 0.02,
      softness: [0.12, 0.55, 0.95][Math.round(cloud * 2)], shadowOpacity: [0.26, 0.15, 0.05][Math.round(cloud * 2)] * daylightFactor,
      envIntensity: 0.5 + 0.18 * daylightFactor - warm * 0.06, tintSky: mix(0xeef3ff, 0xffe3c8, warm * daylightFactor), tintGround: 0xd8d0c2, tintIntensity: 0.3, exposure: 1 }, immediate ? 0 : duration);
    // After sunset in light mode the lamps come on but the background stays bright.
    setLampsOn(isNight || altitudeDeg < 2, { immediate });
  }
  const next = { k, sky: skyWord(k), altitudeDeg, isNight, dark };
  const changed = !current || current.sky !== next.sky || current.isNight !== next.isNight || current.dark !== next.dark;
  current = next;
  if (changed) emit("daylight", next);
  return next;
}

export const daylightState = () => current;
export { lights };
