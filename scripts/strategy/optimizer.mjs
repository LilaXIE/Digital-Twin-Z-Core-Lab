// Finds the least outdoor air that keeps the forecast CO₂ peak at or below the target.
import { simulateCo2, peakPpm } from "./co2-model.mjs";
import { damperToLps, minimumOutdoorAirLps } from "./config.mjs";

function constantTrajectory({ startPpm, nowMs, horizonMinutes, occupancyAt, config }, lps) {
  return simulateCo2({ startPpm, startMs: nowMs, minutes: horizonMinutes, occupancyAt, airflowAt: () => lps, config });
}

// v1: bisection over a constant airflow for the whole horizon. Rolling recalculation every
// 10 minutes turns this into a time-varying schedule.
export function optimizeBisection(input) {
  const { config, occupancyAt, nowMs } = input;
  const target = config.co2.targetPpm;
  const maxLps = damperToLps(config.ventilation.damperMaxPct, config.ventilation.damperCurve);
  const minLps = Math.min(maxLps, Math.max(
    minimumOutdoorAirLps(occupancyAt(nowMs), config),
    damperToLps(config.ventilation.damperMinPct, config.ventilation.damperCurve),
  ));
  const peakFor = (lps) => peakPpm(constantTrajectory(input, lps));

  let lps;
  let atMax = false;
  if (peakFor(maxLps) > target) {
    lps = maxLps;
    atMax = true;
  } else if (peakFor(minLps) <= target) {
    lps = minLps;
  } else {
    let low = minLps;
    let high = maxLps;
    while (high - low > 0.25) {
      const middle = (low + high) / 2;
      if (peakFor(middle) <= target) high = middle; else low = middle;
    }
    lps = high;
  }
  const trajectory = constantTrajectory(input, lps);
  return { method: "bisection", lps, minLps, maxLps, atMax, trajectory, peak: peakPpm(trajectory), plan: [{ t: nowMs, lps }] };
}

// v2: dynamic programming over discrete damper positions in 10-minute steps. Minimises outdoor-air
// cooling energy (weighted by the enthalpy difference) plus a smoothing term on damper changes.
export function optimizeDynamic(input) {
  const { config, occupancyAt, nowMs, startPpm, horizonMinutes, enthalpyDeltaKjPerKg = 0, previousDamperPct = null } = input;
  const { damperCurve, damperMinPct, damperMaxPct, damperStepPct } = config.ventilation;
  const stepMinutes = config.horizon.stepMinutes;
  const steps = Math.max(1, Math.ceil(horizonMinutes / stepMinutes));
  const target = config.co2.targetPpm;
  const levels = [];
  for (let pct = damperMinPct; pct <= damperMaxPct + 1e-9; pct += damperStepPct) levels.push(Math.min(damperMaxPct, pct));
  const lpsByLevel = levels.map((pct) => damperToLps(pct, damperCurve));
  const maxLps = Math.max(...lpsByLevel);
  const bin = config.optimizer.dpCo2BinPpm;
  const smoothing = config.optimizer.dpSmoothingWeight;
  const energyPerLpsStep = config.energy.airDensityKgM3 / 1000 * enthalpyDeltaKjPerKg * stepMinutes * 60 / 3600; // kWh per L/s
  const airPerLpsStep = 1e-4; // Tie-breaker: prefer less air when cooling is free.

  // Per-minute decay factors per damper level; generation per minute per step (inlined stepCo2).
  const volumeLitres = config.room.volumeM3 * 1000;
  const decayByLevel = lpsByLevel.map((lps) => Math.exp(-lps * 60 / volumeLitres));
  const outdoorPpm = config.co2.outdoorPpm;
  let states = new Map([["start", { ppm: startPpm, level: null, cost: 0, path: [] }]]);
  for (let step = 0; step < steps; step += 1) {
    const stepStart = nowMs + step * stepMinutes * 60000;
    const minLps = minimumOutdoorAirLps(occupancyAt(stepStart), config);
    const generation = Array.from({ length: stepMinutes }, (_, minute) => Math.max(0, occupancyAt(stepStart + minute * 60000)) * config.co2.generationLpsPerPerson * 1e6);
    const next = new Map();
    for (const state of states.values()) {
      levels.forEach((pct, levelIndex) => {
        const lps = lpsByLevel[levelIndex];
        if (lps + 1e-9 < Math.min(minLps, maxLps)) return;
        const decay = decayByLevel[levelIndex];
        let ppm = state.ppm;
        let peak = -Infinity;
        for (let minute = 0; minute < stepMinutes; minute += 1) {
          if (lps <= 1e-9) ppm += generation[minute] * 60 / volumeLitres;
          else {
            const steady = outdoorPpm + generation[minute] / lps;
            ppm = steady + (ppm - steady) * decay;
          }
          if (ppm > peak) peak = ppm;
        }
        const previousPct = state.level === null ? previousDamperPct : levels[state.level];
        const change = previousPct === null ? 0 : Math.abs(pct - previousPct);
        const violation = Math.max(0, peak - target);
        const cost = state.cost + lps * (energyPerLpsStep + airPerLpsStep) + smoothing * change / 100 + violation * 1000;
        const key = `${Math.round(ppm / bin)}:${levelIndex}`;
        const existing = next.get(key);
        if (!existing || cost < existing.cost) next.set(key, { ppm, level: levelIndex, cost, path: [...state.path, levelIndex], violation: (state.violation || 0) + violation });
      });
    }
    // Beam pruning keeps the search fast; states are already merged by CO₂ bin.
    states = new Map([...next].sort((a, b) => a[1].cost - b[1].cost).slice(0, 300));
  }
  const best = [...states.values()].sort((a, b) => a.cost - b.cost)[0];
  const plan = best.path.map((levelIndex, step) => ({ t: nowMs + step * stepMinutes * 60000, damperPct: levels[levelIndex], lps: lpsByLevel[levelIndex] }));
  const airflowAt = (t) => plan[Math.min(plan.length - 1, Math.floor((t - nowMs) / (stepMinutes * 60000)))].lps;
  const trajectory = simulateCo2({ startPpm, startMs: nowMs, minutes: horizonMinutes, occupancyAt, airflowAt, config });
  const minLps = Math.min(maxLps, minimumOutdoorAirLps(occupancyAt(nowMs), config));
  return { method: "dp", lps: plan[0].lps, damperPct: plan[0].damperPct, minLps, maxLps, atMax: best.violation > 0, trajectory, peak: peakPpm(trajectory), plan };
}

export function optimize(input) {
  return input.config.optimizer.method === "dp" ? optimizeDynamic(input) : optimizeBisection(input);
}
