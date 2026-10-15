// One-day replay: 24 seconds per day at 1×, real samples only, gaps stay gaps.
import { emit, ui } from "../state.js";
import { provider } from "./store.js";
import { SITE } from "../config/site.js";

let cache = null;
let frame = 0;
let lastFrameAt = 0;
let starting = false;

const HOUR = 3600000;
const SPEED_HOURS_PER_SECOND = 1;

// Latest sample at or before t, unless it is older than 1.5 steps (a gap).
function sampleAt(series, t, stepMs) {
  if (!series?.length) return null;
  let low = 0;
  let high = series.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (series[middle][0] <= t) { found = middle; low = middle + 1; } else high = middle - 1;
  }
  if (found < 0) return null;
  return t - series[found][0] <= stepMs * 1.5 ? series[found][1] : null;
}

function evaluate(t) {
  const history = cache;
  const stepMs = history.stepMinutes * 60000;
  const sensors = {};
  for (const [id, metrics] of Object.entries(history.sensors || {})) {
    sensors[id] = {};
    for (const [key, series] of Object.entries(metrics)) sensors[id][key] = sampleAt(series, t, stepMs);
  }
  for (const [id, series] of Object.entries(history.sockets || {})) (sensors[id] ||= {}).activePower = sampleAt(series, t, stepMs);
  const room = {};
  for (const key of ["co2", "temperature", "humidity"]) {
    const values = SITE.envSensors.map((id) => sensors[id]?.[key]).filter(Number.isFinite);
    // Median, as for live values (data/derived.js roomMetric).
    const sorted = values.sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    room[key] = sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null;
  }
  const events = (history.events || []).filter((event) => event.t <= t && event.t > t - stepMs);
  return { sensors, room, solar: sampleAt(history.solar, t, stepMs * 3), events };
}

function tick(nowMs) {
  const replay = ui.replay;
  if (!replay) return;
  if (replay.playing) {
    const elapsed = lastFrameAt ? Math.min(100, nowMs - lastFrameAt) : 16;
    const next = replay.t + (elapsed / 1000) * SPEED_HOURS_PER_SECOND * HOUR * replay.speed;
    if (next >= replay.stop) { seek(replay.stop); replay.playing = false; emit("replay", { kind: "ended" }); }
    else seek(next, false);
  }
  lastFrameAt = nowMs;
  frame = replay.playing ? requestAnimationFrame(tick) : 0;
}

export function seek(t, notify = true) {
  const replay = ui.replay;
  if (!replay) return;
  const clamped = Math.max(replay.start, Math.min(replay.stop, t));
  const previousEvents = replay.events?.map((event) => `${event.deviceId}:${event.t}`) || [];
  Object.assign(replay, { t: clamped }, evaluate(clamped));
  const fresh = replay.events.filter((event) => !previousEvents.includes(`${event.deviceId}:${event.t}`));
  emit("replay-tick", { t: clamped, newEvents: fresh });
  if (notify) emit("replay", { kind: "seek" });
}

// at (ms): start half an hour before that moment, e.g. an over-limit event from the today summary.
export async function startReplay({ at = null } = {}) {
  if (ui.replay || starting) return true;
  starting = true;
  emit("replay", { kind: "loading" });
  // The response is cached; a second replay starts immediately.
  try {
    if (!cache || Date.now() - cache.stop > 15 * 60000) cache = await provider().requestRoomHistory(24, 10);
  } finally {
    starting = false;
  }
  if (!cache) { emit("replay", { kind: "failed" }); return false; }
  const from = Number.isFinite(at) ? Math.max(cache.start, Math.min(cache.stop, at - 30 * 60000)) : cache.start;
  ui.replay = { start: cache.start, stop: cache.stop, t: from, playing: true, speed: 1, events: [] };
  seek(from, false);
  emit("replay", { kind: "start" });
  play();
  return true;
}

export function play() {
  const replay = ui.replay;
  if (!replay) return;
  if (replay.t >= replay.stop) seek(replay.start, false);
  replay.playing = true;
  lastFrameAt = 0;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(tick);
  emit("replay", { kind: "play" });
}

export function pause() {
  if (!ui.replay) return;
  ui.replay.playing = false;
  cancelAnimationFrame(frame);
  frame = 0;
  emit("replay", { kind: "pause" });
}

export function setSpeed(speed) {
  if (!ui.replay) return;
  ui.replay.speed = speed;
  emit("replay", { kind: "speed" });
}

export function stopReplay() {
  if (!ui.replay) return;
  cancelAnimationFrame(frame);
  frame = 0;
  ui.replay = null;
  emit("replay", { kind: "stop" });
}

export function clearReplayCache() { cache = null; }
