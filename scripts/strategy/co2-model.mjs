// Single-zone CO₂ mass balance: V · dC/dt = N · G + Q · (C_out − C).
// V in m³, G and Q in L/s, C in ppm. Each step uses the exact solution for constant N and Q.

const litres = (config) => config.room.volumeM3 * 1000;

export function stepCo2(ppm, people, lps, seconds, config) {
  const generation = Math.max(0, people) * config.co2.generationLpsPerPerson * 1e6; // ppm·L/s
  const volume = litres(config);
  if (lps <= 1e-9) return ppm + generation * seconds / volume;
  const steadyState = config.co2.outdoorPpm + generation / lps;
  return steadyState + (ppm - steadyState) * Math.exp(-lps * seconds / volume);
}

// occupancyAt and airflowAt receive the start time (ms) of each simulation step.
export function simulateCo2({ startPpm, startMs, minutes, occupancyAt, airflowAt, config, stepMinutes = config.horizon.simulationStepMinutes }) {
  const points = [{ t: startMs, ppm: startPpm }];
  let ppm = startPpm;
  for (let elapsed = 0; elapsed < minutes; elapsed += stepMinutes) {
    const t = startMs + elapsed * 60000;
    const duration = Math.min(stepMinutes, minutes - elapsed);
    ppm = stepCo2(ppm, occupancyAt(t), airflowAt(t), duration * 60, config);
    points.push({ t: t + duration * 60000, ppm });
  }
  return points;
}

export const peakPpm = (points) => Math.max(...points.slice(1).map((point) => point.ppm));

export function steadyStateLps(people, targetPpm, config) {
  const margin = targetPpm - config.co2.outdoorPpm;
  if (margin <= 0) return Infinity;
  return Math.max(0, people) * config.co2.generationLpsPerPerson * 1e6 / margin;
}

export const timeConstantMinutes = (lps, config) => (lps > 0 ? litres(config) / lps / 60 : Infinity);

// Occupancy implied by a CO₂ change from c0 to c1 over `seconds` with constant airflow `lps`.
export function impliedOccupancy(c0, c1, lps, seconds, config) {
  const perPerson = config.co2.generationLpsPerPerson * 1e6;
  const volume = litres(config);
  if (lps <= 1e-9) return (c1 - c0) * volume / (seconds * perPerson);
  const decay = Math.exp(-lps * seconds / volume);
  const steadyState = (c1 - c0 * decay) / (1 - decay);
  return (steadyState - config.co2.outdoorPpm) * lps / perPerson;
}

// Variance of the implied occupancy given independent sensor noise on c0 and c1.
export function impliedOccupancyVariance(lps, seconds, noisePpm, config) {
  const perPerson = config.co2.generationLpsPerPerson * 1e6;
  const volume = litres(config);
  if (lps <= 1e-9) return 2 * (noisePpm * volume / (seconds * perPerson)) ** 2;
  const decay = Math.exp(-lps * seconds / volume);
  const gain = lps / perPerson / (1 - decay);
  return (gain * noisePpm) ** 2 * (1 + decay ** 2);
}
