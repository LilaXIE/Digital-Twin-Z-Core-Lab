// Room-level history for the one-day replay and the 24-hour capsule curves.
// Each ZB202 device is stored as its own InfluxDB measurement (e.g. AM103_05, field co2_ppm).

export const ROOM_ENV_SENSORS = ["AM103_05", "AM103_06", "AM103_07", "AM103_08", "AM308_01"];
export const ROOM_SOCKETS = ["WS523_01", "WS523_02", "WS523_03", "WS523_04", "WS523_05", "WS523_06"];
export const ROOM_EVENT_SENSORS = ["WS301_01", "WS301_02", "WS301_03", "WS303_01"];

const q = JSON.stringify;
const set = (ids) => `[${ids.map((id) => q(id)).join(", ")}]`;

export function roomHistoryWindow({ hours, stepMinutes, stop = Date.now() }) {
  const safeHours = Math.min(48, Math.max(1, Math.round(Number(hours) || 24)));
  const safeStep = Math.min(60, Math.max(5, Math.round(Number(stepMinutes) || 10)));
  const grid = safeStep * 60000;
  const end = Math.ceil(stop / grid) * grid;
  return { hours: safeHours, stepMinutes: safeStep, start: end - safeHours * 3600000, stop: end };
}

const range = (start, stop) => `range(start: time(v: ${q(new Date(start).toISOString())}), stop: time(v: ${q(new Date(stop).toISOString())}))`;

export function buildRoomHistoryQueries({ bucket, solarBucket = bucket, solarMeasurement, start, stop, stepMinutes }) {
  return {
    env: `from(bucket: ${q(bucket)})
  |> ${range(start, stop)}
  |> filter(fn: (r) => contains(value: r._measurement, set: ${set(ROOM_ENV_SENSORS)}) and r._field =~ /(?i)^(co2|temperature|relative_humidity|humidity)/)
  |> aggregateWindow(every: ${stepMinutes}m, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value", "_measurement", "_field"])`,
    power: `from(bucket: ${q(bucket)})
  |> ${range(start, stop)}
  |> filter(fn: (r) => contains(value: r._measurement, set: ${set(ROOM_SOCKETS)}) and r._field =~ /(?i)^active[_ -]?power$/)
  |> aggregateWindow(every: ${stepMinutes}m, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value", "_measurement", "_field"])`,
    solar: `from(bucket: ${q(solarBucket)})
  |> ${range(start, stop)}
  |> filter(fn: (r) => r._measurement == ${q(solarMeasurement)} and r._field == "solarRadiation")
  |> aggregateWindow(every: ${stepMinutes}m, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value"])`,
    events: `from(bucket: ${q(bucket)})
  |> ${range(start, stop)}
  |> filter(fn: (r) => contains(value: r._measurement, set: ${set(ROOM_EVENT_SENSORS)}) and r._field =~ /(?i)^(magnet_?status|leakage_?status|tamper_?status)$/)
  |> keep(columns: ["_time", "_value", "_measurement", "_field"])
  |> sort(columns: ["_time"])`,
  };
}

const deviceId = (measurement) => String(measurement || "").toUpperCase().replaceAll("_", "-");
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

function envKey(field) {
  const compact = String(field).toLowerCase();
  if (compact.startsWith("co2")) return "co2";
  if (compact.startsWith("temp")) return "temperature";
  if (compact.includes("humidity")) return "humidity";
  return null;
}

function eventType(field) {
  const compact = String(field).toLowerCase().replace(/[^a-z]/g, "");
  if (compact.startsWith("magnet")) return "door";
  if (compact.startsWith("leakage")) return "leak";
  if (compact.startsWith("tamper")) return "tamper";
  return null;
}

// Rows → compact series of [timeMs, value] pairs; alarm events are the transitions into an active state.
export function roomHistoryFromRows({ env = [], power = [], solar = [], events = [] }) {
  const sensors = {};
  for (const row of env) {
    const key = envKey(row._field);
    const t = Date.parse(row._time);
    const value = Number(row._value);
    if (!key || !Number.isFinite(t) || !Number.isFinite(value)) continue;
    ((sensors[deviceId(row._measurement)] ||= {})[key] ||= []).push([t, round(value, key === "co2" ? 0 : 2)]);
  }
  const sockets = {};
  for (const row of power) {
    const t = Date.parse(row._time);
    const value = Number(row._value);
    if (!Number.isFinite(t) || !Number.isFinite(value)) continue;
    (sockets[deviceId(row._measurement)] ||= []).push([t, round(value, 1)]);
  }
  const solarSeries = solar
    .map((row) => [Date.parse(row._time), Number(row._value)])
    .filter(([t, value]) => Number.isFinite(t) && Number.isFinite(value))
    .map(([t, value]) => [t, Math.round(value)]);
  const alarmEvents = [];
  const lastState = new Map();
  for (const row of events) {
    const type = eventType(row._field);
    const t = Date.parse(row._time);
    const value = Number(row._value);
    if (!type || !Number.isFinite(t) || !Number.isFinite(value)) continue;
    const key = `${row._measurement}:${type}`;
    const active = value > 0;
    if (active && lastState.get(key) !== true) alarmEvents.push({ t, deviceId: deviceId(row._measurement), type });
    lastState.set(key, active);
  }
  const sortSeries = (series) => series.sort((a, b) => a[0] - b[0]);
  for (const metrics of Object.values(sensors)) Object.values(metrics).forEach(sortSeries);
  Object.values(sockets).forEach(sortSeries);
  return { sensors, sockets, solar: sortSeries(solarSeries), events: alarmEvents.sort((a, b) => a.t - b.t) };
}
