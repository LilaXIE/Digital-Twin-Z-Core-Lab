// Occupancy forecast: N̂(t+k) = w(k)·N_now + (1 − w(k))·N_prior(t+k), w(k) = exp(−k / 30 min),
// raised to the expected head count during scheduled meetings.

const HK_OFFSET_MS = 8 * 3600000; // Hong Kong has no daylight saving.

export function hkTime(tMs) {
  const local = new Date(tMs + HK_OFFSET_MS);
  return {
    day: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60,
    dateKey: local.toISOString().slice(0, 10),
    label: local.toISOString().slice(11, 16),
  };
}

// Start of the Hong Kong calendar day (or Monday-based week) containing tMs.
export function hkDayStart(tMs) {
  return Math.floor((tMs + HK_OFFSET_MS) / 86400000) * 86400000 - HK_OFFSET_MS;
}
export function hkWeekStart(tMs) {
  const dayStart = hkDayStart(tMs);
  return dayStart - ((hkTime(tMs).day + 6) % 7) * 86400000;
}

const toMinutes = (text) => {
  const [hours, minutes] = String(text).split(":").map(Number);
  return hours * 60 + minutes;
};

export function scheduledPriorAt(tMs, config) {
  const { day, minutes } = hkTime(tMs);
  const windows = day === 0 || day === 6 ? config.occupancy.weekendPrior : config.occupancy.weekdayPrior;
  let people = 0;
  for (const window of windows || []) {
    if (minutes >= toMinutes(window.start) && minutes < toMinutes(window.end)) people = Math.max(people, window.people);
  }
  return people;
}

const meetingTimes = (meeting) => ({ start: Date.parse(meeting.start), end: Date.parse(meeting.end) });

export function meetingAt(tMs, meetings = []) {
  let found = null;
  for (const meeting of meetings) {
    const { start, end } = meetingTimes(meeting);
    if (tMs >= start && tMs < end && (!found || meeting.people > found.people)) found = meeting;
  }
  return found;
}

// Default 60 min; extend to cover a meeting that is under way or starts within it, capped at 180 min.
export function horizonMinutes(nowMs, meetings, config) {
  const { defaultMinutes, maxMinutes, stepMinutes } = config.horizon;
  let horizon = defaultMinutes;
  const defaultEnd = nowMs + defaultMinutes * 60000;
  for (const meeting of meetings || []) {
    const { start, end } = meetingTimes(meeting);
    if (start <= defaultEnd && end > defaultEnd) horizon = Math.max(horizon, (end - nowMs) / 60000);
  }
  return Math.min(maxMinutes, Math.ceil(horizon / stepMinutes) * stepMinutes);
}

export function occupancyForecast({ nowMs, current, meetings = [], config }) {
  const decay = config.occupancy.forecastDecayMinutes;
  return (tMs) => {
    const k = Math.max(0, (tMs - nowMs) / 60000);
    const weight = Math.exp(-k / decay);
    const blended = weight * current + (1 - weight) * scheduledPriorAt(tMs, config);
    const meeting = meetingAt(tMs, meetings);
    return meeting ? Math.max(blended, meeting.people) : blended;
  };
}

export function nextMeeting(nowMs, untilMs, meetings = []) {
  return (meetings || [])
    .map((meeting) => ({ meeting, ...meetingTimes(meeting) }))
    .filter(({ start, end }) => end > nowMs && start < untilMs)
    .sort((a, b) => a.start - b.start)[0]?.meeting || null;
}
