// Three-layer occupancy estimate: measured VS341 count, CO₂-implied count (Kalman filtered), schedule prior.
import { impliedOccupancy, impliedOccupancyVariance } from "./co2-model.mjs";

export class OccupancyEstimator {
  constructor(config) {
    this.config = config;
    this.state = null; // { t, ppm, lps, x, p }
  }

  // input: { t, roomPpm, lps, measured: { available, count }, doorEvent, noiseDb, priorPeople }
  update({ t, roomPpm, lps, measured = null, doorEvent = false, noiseDb = null, priorPeople = 0 }) {
    const { kalman, meetingNoiseDb } = this.config.occupancy;
    const max = this.config.room.maxOccupancy;
    const meetingLikely = Number.isFinite(noiseDb) && noiseDb >= meetingNoiseDb;
    let implied = null;

    if (!this.state || !Number.isFinite(roomPpm) || t - this.state.t > 30 * 60000 || t <= this.state.t) {
      // Start (or restart after a gap) from the schedule prior with wide uncertainty.
      this.state = { t, ppm: roomPpm, lps, x: priorPeople, p: 4 };
    } else {
      const seconds = (t - this.state.t) / 1000;
      const steps = seconds / 600;
      let q = (doorEvent ? kalman.doorProcessVariance : kalman.processVariance) * steps;
      if (meetingLikely) q += kalman.doorProcessVariance * steps;
      let x = this.state.x;
      let p = this.state.p + q;
      // Airflow during the interval is the value in effect at its start.
      implied = impliedOccupancy(this.state.ppm, roomPpm, this.state.lps, seconds, this.config);
      const r = Math.max(kalman.measurementFloorVariance, impliedOccupancyVariance(this.state.lps, seconds, kalman.sensorNoisePpm, this.config));
      const gain = p / (p + r);
      x += gain * (implied - x);
      p *= 1 - gain;
      this.state = { t, ppm: roomPpm, lps, x: Math.min(max, Math.max(0, x)), p };
    }

    const co2Estimate = this.state.x;
    // VS341 seat sensors miss people at the central table, so their count is a lower bound.
    const useMeasured = Boolean(measured?.available);
    if (useMeasured && measured.count > this.state.x) this.state = { ...this.state, x: Math.min(max, measured.count) };
    const current = this.state.x;
    return {
      current,
      // "Measured" only when the seat count itself determines the figure shown.
      measured: useMeasured && measured.count >= co2Estimate - 0.5,
      source: useMeasured && measured.count >= co2Estimate - 0.5 ? "vs341" : "co2",
      co2Estimate,
      implied,
      variance: this.state.p,
      // Upper estimate used for forecasting, so the optimiser does not ride on an uncertain low estimate.
      forecastCurrent: Math.min(max, current + (this.config.occupancy.forecastSafetySigma ?? 1) * Math.sqrt(this.state.p)),
      meetingLikely,
    };
  }

  // Airflow applied from the last update until the next one, when it differs from the value passed in.
  setAirflow(lps) { if (this.state) this.state.lps = lps; }
}
