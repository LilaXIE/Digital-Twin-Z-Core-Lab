// Read-only InfluxDB history used for start-up warm-up, backtest and calibration.
// Each ZB202 device is stored as its own measurement (e.g. AM103_05, field co2_ppm).

const q = JSON.stringify;
const measurementSet = (ids) => `[${ids.map((id) => q(id)).join(", ")}]`;

export function buildCo2HistoryQuery({ bucket, sensors, start, stop, everyMinutes = 10 }) {
  return `import "array"
sensors = ${measurementSet(sensors)}
from(bucket: ${q(bucket)})
  |> range(start: time(v: ${q(new Date(start).toISOString())}), stop: time(v: ${q(new Date(stop).toISOString())}))
  |> filter(fn: (r) => contains(value: r._measurement, set: sensors) and r._field =~ /(?i)^co2/)
  |> aggregateWindow(every: ${everyMinutes}m, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value", "_measurement"])`;
}

// Raw events (VS341 occupancy, WS301 door, WS302 noise, indoor temperature/humidity).
export function buildEventHistoryQuery({ bucket, measurements, fieldPattern, start, stop }) {
  return `from(bucket: ${q(bucket)})
  |> range(start: time(v: ${q(new Date(start).toISOString())}), stop: time(v: ${q(new Date(stop).toISOString())}))
  |> filter(fn: (r) => contains(value: r._measurement, set: ${measurementSet(measurements)}) and r._field =~ /${fieldPattern}/)
  |> keep(columns: ["_time", "_value", "_measurement", "_field"])`;
}

// Rows → [{ t, readings: { sensorId: ppm } }] sorted by window end time.
export function co2RowsToSeries(rows) {
  const byTime = new Map();
  for (const row of rows) {
    const t = Date.parse(row._time);
    const value = Number(row._value);
    if (!Number.isFinite(t) || !Number.isFinite(value)) continue;
    const entry = byTime.get(t) || { t, readings: {} };
    entry.readings[String(row._measurement).toUpperCase()] = value;
    byTime.set(t, entry);
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

// Rows → { sensorId: [{ t, value }] } per field.
export function eventRowsBySensor(rows, fieldMatch = () => true) {
  const result = {};
  for (const row of rows) {
    if (!fieldMatch(String(row._field))) continue;
    const t = Date.parse(row._time);
    const value = Number(row._value);
    if (!Number.isFinite(t) || !Number.isFinite(value)) continue;
    (result[String(row._measurement).toUpperCase()] ||= []).push({ t, value });
  }
  for (const events of Object.values(result)) events.sort((a, b) => a.t - b.t);
  return result;
}

// Queries in day-sized chunks so long ranges do not time out.
export async function queryChunked(queryApi, buildQuery, { start, stop, chunkHours = 24 }) {
  const rows = [];
  for (let from = start; from < stop; from += chunkHours * 3600000) {
    const to = Math.min(stop, from + chunkHours * 3600000);
    rows.push(...await queryApi.collectRows(buildQuery(from, to)));
  }
  return rows;
}

// Loads everything the backtest and calibration need for [start, stop).
export async function loadStrategyHistory({ queryApi, bucket, config, start, stop }) {
  // Align to the 10-minute grid so chunk boundaries do not create partial aggregation windows.
  const grid = 10 * 60000;
  start = Math.floor(start / grid) * grid;
  stop = Math.floor(stop / grid) * grid;
  const co2Rows = await queryChunked(queryApi, (from, to) => buildCo2HistoryQuery({ bucket, sensors: config.co2.sensors, start: from, stop: to }), { start, stop });
  const eventMeasurements = [...config.occupancy.occupancySensors, ...config.occupancy.doorSensors, ...config.occupancy.noiseSensors];
  const eventRows = await queryChunked(queryApi, (from, to) => buildEventHistoryQuery({ bucket, measurements: eventMeasurements, fieldPattern: "(?i)^(occupancy|magnet_?status|noise_?laeq.*)$", start: from, stop: to }), { start, stop, chunkHours: 72 });
  return {
    series: co2RowsToSeries(co2Rows),
    occupancyEvents: eventRowsBySensor(eventRows, (field) => /^occupancy$/i.test(field)),
    doorEvents: eventRowsBySensor(eventRows, (field) => /^magnet_?status$/i.test(field)),
    noiseEvents: eventRowsBySensor(eventRows, (field) => /^noise_?laeq/i.test(field)),
  };
}

// Latest event value per sensor at or before tMs (events sorted by time).
export function latestEventsAt(eventsBySensor, tMs) {
  const result = {};
  for (const [id, events] of Object.entries(eventsBySensor || {})) {
    let low = 0;
    let high = events.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (events[middle].t <= tMs) { found = middle; low = middle + 1; } else high = middle - 1;
    }
    if (found >= 0) result[id] = events[found];
  }
  return result;
}
