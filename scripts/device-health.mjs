// Data health per device (Phase C3): how often each device reported in the last 24 hours, its longest
// silence and, for devices that report on a fixed interval, how complete the day is.

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// Models that report on a fixed interval. Seats (VS341), doors (WS301) and the leak sensor (WS303)
// report on events, so a completeness figure would mean nothing for them.
const PERIODIC_MODELS = ["AM103", "AM308", "WS302", "WS523"];
const PERIODIC_MAX_MINUTES = 30;

// One uplink per distinct timestamp of a measurement (unique _time rows from InfluxDB).
export function buildUplinkQuery({ bucket, hours = 24 }) {
  return `from(bucket: ${JSON.stringify(bucket)})
  |> range(start: -${Math.max(1, Math.round(hours))}h)
  |> filter(fn: (r) => r._measurement =~ /^(AM103|AM308|VS341|WS301|WS302|WS303|WS523)_\\d{2}$/)
  |> group(columns: ["_measurement"])
  |> keep(columns: ["_time", "_measurement"])
  |> unique(column: "_time")`;
}

// rows: [{ _measurement, _time }]. Returns { "AM103-05": { uplinks, intervalMinutes, longestGapMinutes, completeness, last } }.
export function deviceHealthFromRows(rows, { nowMs, hours = 24 }) {
  const from = nowMs - hours * 3600000;
  const byDevice = new Map();
  for (const row of rows) {
    const t = Date.parse(row._time);
    if (!Number.isFinite(t)) continue;
    const id = String(row._measurement || "").toUpperCase().replaceAll("_", "-");
    (byDevice.get(id) || byDevice.set(id, []).get(id)).push(t);
  }
  const result = {};
  for (const [id, times] of byDevice) {
    const sorted = [...new Set(times)].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((t, index) => t - sorted[index]);
    const interval = median(gaps);
    // Silence before the first and after the last uplink counts too.
    const edges = [sorted[0] - from, nowMs - sorted.at(-1)];
    const longest = Math.max(0, ...gaps, ...edges);
    let completeness = null;
    if (PERIODIC_MODELS.includes(id.split("-")[0]) && interval !== null && interval <= PERIODIC_MAX_MINUTES * 60000) {
      const allowance = interval * 2;
      const missing = [...gaps, ...edges].reduce((sum, gap) => sum + Math.max(0, gap - allowance), 0);
      completeness = Math.max(0, Math.min(1, 1 - missing / (hours * 3600000)));
    }
    result[id] = {
      uplinks: sorted.length,
      intervalMinutes: interval === null ? null : Math.round(interval / 60000),
      longestGapMinutes: Math.round(longest / 60000),
      completeness: completeness === null ? null : Math.round(completeness * 1000) / 10,
      last: new Date(sorted.at(-1)).toISOString(),
    };
  }
  return result;
}
