// Builds one recommendation from the current room state. Pure: used by the bridge service and backtest.
import { ahuStatus, baselineAirflowAt, damperToLps, lpsToDamper } from "./config.mjs";
import { simulateCo2, peakPpm } from "./co2-model.mjs";
import { horizonMinutes, hkTime, meetingAt, nextMeeting, occupancyForecast } from "./occupancy-forecast.mjs";
import { enthalpyDifference } from "./energy.mjs";
import { optimize } from "./optimizer.mjs";

const iso = (tMs) => new Date(tMs).toISOString();

function sample(points, nowMs, everyMinutes) {
  return points.filter((point) => Math.round((point.t - nowMs) / 60000) % everyMinutes === 0);
}

function valueAt(points, tMs) {
  return points.find((point) => point.t >= tMs - 1000)?.ppm ?? points.at(-1).ppm;
}

// The page renders the reason from { code, params } in its own language; zh/en text stays for logs and the CLI.
function reasonCode({ ahu, ahuStartPpm, atMax, exceedAt, meetingNow, upcoming, lps, minLps, people, config }) {
  if (!ahu.running) return { code: "ahu-off", params: { nextStart: ahu.nextStart ? iso(ahu.nextStart) : null, ppmAtStart: ahuStartPpm } };
  if (atMax) return exceedAt ? { code: "at-max-exceed", params: { limit: config.co2.limitPpm, at: iso(exceedAt) } } : { code: "at-max", params: { target: config.co2.targetPpm } };
  const raised = lps > minLps + 0.5;
  if (meetingNow) return { code: "meeting-now", params: { title: meetingNow.title || "", people: meetingNow.people, raised } };
  if (upcoming) return { code: "meeting-upcoming", params: { title: upcoming.title || "", people: upcoming.people, at: upcoming.start, raised } };
  if (!raised) return { code: "headroom", params: {} };
  return { code: "raised", params: { people: Math.round(people), target: config.co2.targetPpm } };
}

function buildReason({ ahu, atMax, exceedAt, meetingNow, upcoming, lps, minLps, people, config }) {
  if (!ahu.running) {
    const at = ahu.nextStart ? hkTime(ahu.nextStart).label : "";
    return { zh: `AHU 已停机${at ? `，下次 ${at} 开机` : ""}`, en: `AHU is off${at ? `; next start ${at}` : ""}` };
  }
  if (atMax) {
    return exceedAt
      ? { zh: `预计 ${hkTime(exceedAt).label} CO₂ 超过 ${config.co2.limitPpm} ppm，新风已达上限`, en: `CO₂ forecast to exceed ${config.co2.limitPpm} ppm at ${hkTime(exceedAt).label}; outdoor air at maximum` }
      : { zh: `新风已达上限，CO₂ 可能高于 ${config.co2.targetPpm} ppm 控制目标`, en: `Outdoor air at maximum; CO₂ may exceed the ${config.co2.targetPpm} ppm target` };
  }
  const raised = lps > minLps + 0.5;
  if (meetingNow) {
    const name = meetingNow.title || "会议";
    return { zh: `${name}进行中（预计 ${meetingNow.people} 人），${raised ? "维持较大新风" : "CO₂ 余量充足"}`, en: `${meetingNow.title || "Meeting"} in progress (${meetingNow.people} expected); ${raised ? "holding higher outdoor air" : "CO₂ headroom is sufficient"}` };
  }
  if (upcoming) {
    const at = hkTime(Date.parse(upcoming.start)).label;
    const name = upcoming.title || "会议";
    return raised
      ? { zh: `${at} ${name}预计 ${upcoming.people} 人，提前加大新风`, en: `${upcoming.title || "Meeting"} at ${at} with ${upcoming.people} expected; increasing outdoor air in advance` }
      : { zh: `${at} ${name}预计 ${upcoming.people} 人，当前 CO₂ 余量充足`, en: `${upcoming.title || "Meeting"} at ${at} with ${upcoming.people} expected; current CO₂ headroom is sufficient` };
  }
  if (!raised) return { zh: "CO₂ 余量充足，保持最小新风量", en: "CO₂ headroom is sufficient; keeping minimum outdoor air" };
  return { zh: `估计 ${Math.round(people)} 人，按需加大新风使 CO₂ 不超过 ${config.co2.targetPpm} ppm`, en: `About ${Math.round(people)} people; raising outdoor air to keep CO₂ at or below ${config.co2.targetPpm} ppm` };
}

// input: { nowMs, roomPpm, occupancy: { current, measured }, meetings, config, outdoor, indoor, baselineLps?, previousDamperPct? }
// forecastToAhuStart: while the AHU is off, also simulate CO₂ up to its next start (skipped in backfills).
export function buildRecommendation({ nowMs, roomPpm, occupancy, meetings = [], config, outdoor, indoor, baselineLps, previousDamperPct = null, forecastToAhuStart = true }) {
  const curve = config.ventilation.damperCurve;
  const baselineAt = baselineLps === undefined ? (t) => baselineAirflowAt(t, config) : () => baselineLps;
  const baseline = baselineAt(nowMs);
  const horizon = horizonMinutes(nowMs, meetings, config);
  const occupancyAt = occupancyForecast({ nowMs, current: occupancy.forecastCurrent ?? occupancy.current, meetings, config });
  const enthalpyDeltaKjPerKg = outdoor && indoor ? enthalpyDifference(outdoor, indoor) : 0;
  const result = optimize({ startPpm: roomPpm, nowMs, horizonMinutes: horizon, occupancyAt, config, enthalpyDeltaKjPerKg, previousDamperPct });

  const damperPct = result.damperPct ?? Math.min(config.ventilation.damperMaxPct, Math.ceil(lpsToDamper(result.lps, curve) - 1e-9));
  const baselineTrajectory = simulateCo2({ startPpm: roomPpm, startMs: nowMs, minutes: horizon, occupancyAt, airflowAt: baselineAt, config });
  const step = config.horizon.outputStepMinutes;
  const exceedAt = result.trajectory.find((point, index) => index > 0 && point.ppm > config.co2.limitPpm)?.t ?? null;
  const meetingNow = meetingAt(nowMs, meetings);
  const upcoming = meetingNow ? null : nextMeeting(nowMs, nowMs + horizon * 60000, meetings);
  const ahu = ahuStatus(nowMs, config);
  let ahuStartPpm = null;
  if (!ahu.running && ahu.nextStart && forecastToAhuStart) {
    const minutes = Math.min(80 * 60, Math.round((ahu.nextStart - nowMs) / 60000));
    const untilStart = simulateCo2({ startPpm: roomPpm, startMs: nowMs, minutes, occupancyAt, airflowAt: baselineAt, config, stepMinutes: 10 });
    ahuStartPpm = Math.round(untilStart.at(-1).ppm);
  }
  const reasonInput = { ahu, ahuStartPpm, atMax: result.atMax, exceedAt, meetingNow, upcoming, lps: result.lps, minLps: result.minLps, people: occupancy.current, config };
  const reason = buildReason(reasonInput);

  const forecastTimes = sample(result.trajectory, nowMs, step).map((point) => point.t);
  return {
    type: "recommendation",
    status: !ahu.running ? "ahu-off" : result.atMax ? "at-max" : "ok",
    generatedAt: iso(nowMs),
    horizonMinutes: horizon,
    occupancy: {
      current: Math.round(occupancy.current),
      measured: Boolean(occupancy.measured),
      forecast: forecastTimes.map((t) => ({ t: iso(t), n: Math.round(occupancyAt(t) * 10) / 10 })),
    },
    co2: {
      current: Math.round(roomPpm),
      limit: config.co2.limitPpm,
      target: config.co2.targetPpm,
      forecastRecommended: sample(result.trajectory, nowMs, step).map((point) => ({ t: iso(point.t), ppm: Math.round(point.ppm) })),
      forecastBaseline: sample(baselineTrajectory, nowMs, step).map((point) => ({ t: iso(point.t), ppm: Math.round(point.ppm) })),
      peakRecommended: Math.round(result.peak),
      peakBaseline: Math.round(peakPpm(baselineTrajectory)),
      at30: { recommended: Math.round(valueAt(result.trajectory, nowMs + 30 * 60000)), baseline: Math.round(valueAt(baselineTrajectory, nowMs + 30 * 60000)) },
      at60: { recommended: Math.round(valueAt(result.trajectory, nowMs + 60 * 60000)), baseline: Math.round(valueAt(baselineTrajectory, nowMs + 60 * 60000)) },
      exceedAt: exceedAt ? iso(exceedAt) : null,
    },
    airflow: {
      recommendedLps: Math.ceil(result.lps),
      recommendedDamperPct: damperPct,
      minLps: Math.round(result.minLps),
      maxLps: Math.round(result.maxLps),
      baselineLps: Math.round(baseline),
      baselineDamperPct: Math.round(lpsToDamper(baseline, curve)),
      atMax: result.atMax,
      method: result.method,
      plan: result.plan.map((item) => ({ t: iso(item.t), lps: Math.round(item.lps), damperPct: item.damperPct ?? damperPct })),
    },
    meeting: meetingNow || upcoming || null,
    ahu: { running: ahu.running, nextStart: ahu.nextStart ? iso(ahu.nextStart) : null, nextStop: ahu.nextStop ? iso(ahu.nextStop) : null,
      source: ahu.source, schedule: config.ventilation.ahuSchedule, ppmAtNextStart: ahuStartPpm,
      assumedDamperPct: config.ventilation.baselineDamperPct, assumedLps: Math.round(damperToLps(config.ventilation.baselineDamperPct, curve)), offLps: config.ventilation.ahuOffLps },
    reasonCode: reasonCode(reasonInput),
    reason: reason.zh,
    reasonEn: reason.en,
    // Unrounded values for logging and savings; the page does not display these.
    exact: { lps: result.lps, minLps: result.minLps, baselineLps: baseline, damperPct, peak: result.peak, enthalpyDeltaKjPerKg },
  };
}
