// Simulated AHU readings for the Overview panel. There is no AHU data feed and no BMS write access
// yet, so every value here is labelled "Simulated" on screen. The model is deliberately simple but
// consistent with the live data: return air follows the room temperature, the fresh-air damper
// follows the AI recommendation, and the unit is on standby outside working hours.
import { isWorkingTime } from "../config/site.js";
import { data } from "./store.js";
import { roomMetric, recommendationState, occupancyInfo } from "./derived.js";

export const SETPOINT_RANGE = { min: 13, max: 20, step: 0.5 };
const RESPONSE_SECONDS = 120; // supply air settles towards a new setpoint over a few minutes

let setpoint = 16;
let change = { at: 0, from: 16 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wave = (now, periodMs, amplitude) => Math.sin((now / periodMs) * Math.PI * 2) * amplitude;

function supplyFor(now) {
  const settled = setpoint + wave(now, 7 * 60000, 0.25);
  if (!change.at) return settled;
  const progress = 1 - Math.exp(-(now - change.at) / 1000 / RESPONSE_SECONDS);
  return change.from + (settled - change.from) * progress;
}

export function ahuState(now = Date.now()) {
  const indoor = roomMetric("temperature").value;
  const outdoor = data().outdoor?.temperature;
  const returnAir = (Number.isFinite(indoor) ? indoor : 24.5) + 0.4 + wave(now, 15 * 60000, 0.15);
  const { rec, stale, valid } = recommendationState();
  const followsAi = Boolean(rec && valid && !stale && Number.isFinite(rec.airflow?.recommendedDamperPct));
  const running = isWorkingTime(now);
  if (!running) {
    return { running, setpoint, supply: returnAir - 0.6, returnAir, damper: 0, valve: 0, fanHz: 0, followsAi: false };
  }
  const damper = followsAi ? rec.airflow.recommendedDamperPct : 20;
  const supply = supplyFor(now);
  const people = occupancyInfo()?.count ?? 2;
  const outdoorLoad = Number.isFinite(outdoor) ? (outdoor - 24) * 1.5 : 6;
  const valve = clamp(18 + (returnAir - setpoint) * 5 + outdoorLoad + damper * 0.25 + wave(now, 11 * 60000, 2), 0, 100);
  const fanHz = clamp(30 + people * 1.2 + (returnAir - 24) * 2 + wave(now, 9 * 60000, 0.6), 25, 50);
  return { running, setpoint, supply, returnAir, damper, valve, fanHz, followsAi };
}

export function setAhuSetpoint(value, now = Date.now()) {
  const next = clamp(Math.round(value / SETPOINT_RANGE.step) * SETPOINT_RANGE.step, SETPOINT_RANGE.min, SETPOINT_RANGE.max);
  if (next === setpoint) return setpoint;
  change = { at: now, from: supplyFor(now) };
  setpoint = next;
  return setpoint;
}
