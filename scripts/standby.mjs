// Standby power (Phase C5): what each socket draws outside working hours, and what that adds up to
// over a year if nothing changes.

const HOUR = 3600000;

export function buildSocketHourlyQuery({ bucket, days = 7 }) {
  return `from(bucket: ${JSON.stringify(bucket)})
  |> range(start: -${Math.max(1, Math.round(days))}d)
  |> filter(fn: (r) => r._measurement =~ /^WS523_\\d{2}$/ and r._field =~ /(?i)^active[_ -]?power$/)
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value", "_measurement"])`;
}

const minutesOf = (text) => {
  const [hours, minutes] = String(text).split(":").map(Number);
  return hours * 60 + minutes;
};

// Working hours (Hong Kong time); everything else counts as standby.
export function isWorkingHour(tMs, { workDays = [1, 2, 3, 4, 5], workStart = "09:00", workEnd = "19:00" } = {}) {
  const local = new Date(tMs + 8 * HOUR);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return workDays.includes(local.getUTCDay()) && minutes >= minutesOf(workStart) && minutes < minutesOf(workEnd);
}

// rows: hourly means [{ _measurement, _time, _value }] in W. aggregateWindow stamps each window with its
// end, so the hour a value describes starts one hour earlier.
export function standbyReport(rows, { hours = {}, carbonKgPerKwh = 0.38 } = {}) {
  const work = { workDays: [1, 2, 3, 4, 5], workStart: "09:00", workEnd: "19:00", ...hours };
  const workingHoursPerWeek = work.workDays.length * (minutesOf(work.workEnd) - minutesOf(work.workStart)) / 60;
  const standbyHoursPerYear = (168 - workingHoursPerWeek) * 52.18;
  const sockets = new Map();
  for (const row of rows) {
    const end = Date.parse(row._time);
    const value = Number(row._value);
    if (!Number.isFinite(end) || !Number.isFinite(value)) continue;
    const id = String(row._measurement || "").toUpperCase().replaceAll("_", "-");
    const entry = sockets.get(id) || { standby: [], working: [] };
    (isWorkingHour(end - HOUR, work) ? entry.working : entry.standby).push(value);
    sockets.set(id, entry);
  }
  const mean = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);
  const list = [...sockets].map(([id, entry]) => {
    const standbyW = mean(entry.standby);
    const yearKwh = standbyW === null ? null : standbyW * standbyHoursPerYear / 1000;
    return {
      id,
      standbyW: standbyW === null ? null : Math.round(standbyW * 10) / 10,
      workingW: mean(entry.working) === null ? null : Math.round(mean(entry.working) * 10) / 10,
      standbyHours: entry.standby.length,
      yearKwh: yearKwh === null ? null : Math.round(yearKwh),
      yearKgCo2e: yearKwh === null ? null : Math.round(yearKwh * carbonKgPerKwh),
    };
  }).sort((a, b) => (b.yearKwh ?? -1) - (a.yearKwh ?? -1));
  const total = list.reduce((sum, item) => sum + (item.yearKwh || 0), 0);
  return { sockets: list, totalYearKwh: Math.round(total), totalYearKgCo2e: Math.round(total * carbonKgPerKwh), standbyHoursPerYear: Math.round(standbyHoursPerYear), work };
}
