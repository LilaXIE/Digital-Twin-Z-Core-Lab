// Control levels: L0 recommendation only, L1 shadow mode (logged, never written), L2 BACnet write.
// L2 protections are implemented here and exercised in shadow mode; no BACnet writer ships yet.
import { damperToLps, lpsToDamper } from "./config.mjs";
import { stepCo2 } from "./co2-model.mjs";

export const CONTROL_MODES = ["L0", "L1", "L2"];

// Safety limits applied to every command before it could be written (and to every shadow command).
export function applyGuards({ desiredPct, previousPct, measuredPpm, minPct = 0, config }) {
  const { damperMinPct, damperMaxPct } = config.ventilation;
  const reasons = [];
  if (Number.isFinite(measuredPpm) && measuredPpm > config.co2.safetyPpm) {
    return { pct: damperMaxPct, reasons: ["co2-safety"] };
  }
  const lower = Math.min(damperMaxPct, Math.max(damperMinPct, minPct));
  let pct = Math.min(damperMaxPct, Math.max(lower, desiredPct));
  if (pct !== desiredPct) reasons.push("limit");
  if (Number.isFinite(previousPct)) {
    const step = config.control.maxDamperChangePctPerStep;
    const limited = Math.min(previousPct + step, Math.max(previousPct - step, pct));
    if (limited !== pct) reasons.push("rate-limit");
    pct = limited;
  }
  return { pct, reasons };
}

export function shouldRelease({ nowMs, lastDataMs, bridgeHealthy, config }) {
  if (!bridgeHealthy) return "bridge-unhealthy";
  if (!Number.isFinite(lastDataMs) || nowMs - lastDataMs > config.control.dataGapReleaseMinutes * 60000) return "data-gap";
  return null;
}

// Placeholder until FMO authorises a BACnet point, priority and approval process.
export class UnconfiguredBacnetWriter {
  get configured() { return false; }
  async write() { throw new Error("BACnet writer not configured"); }
  async relinquish() { /* Nothing has been written. */ }
}

export class Controller {
  constructor(config, { writer = new UnconfiguredBacnetWriter(), log = () => {} } = {}) {
    this.config = config;
    this.writer = writer;
    this.log = log;
    this.mode = config.control.mode === "L2" ? "L1" : config.control.mode; // L2 is never entered at start-up.
    this.previousCommandPct = null;
    this.shadow = null; // { t, ppm, lps }
    this.stats = { steps: 0, shadowExceedances: 0, guardActivations: 0 };
    this.writing = false;
  }

  canEnterL2() {
    return Boolean(this.config.control.l2Authorised && this.writer.configured && this.config.control.bacnetPriority);
  }

  async setMode(mode, reason = "user") {
    if (!CONTROL_MODES.includes(mode)) throw new Error("Unknown control mode");
    if (mode === "L2" && !this.canEnterL2()) throw new Error("L2 requires FMO authorisation and a configured BACnet writer");
    if (this.mode === "L2" && mode !== "L2") await this.release(reason);
    this.mode = mode;
    this.log({ event: "mode", mode, reason });
    return this.mode;
  }

  async release(reason) {
    if (!this.writing) return;
    try {
      await this.writer.relinquish(this.config.control.bacnetPriority);
      this.log({ event: "bacnet-relinquish", reason, priority: this.config.control.bacnetPriority });
    } catch (error) {
      this.log({ event: "bacnet-relinquish-failed", reason, error: error.message });
    }
    this.writing = false;
  }

  // Advances the shadow CO₂ trajectory: what the room would read had the shadow command been applied.
  advanceShadow({ nowMs, measuredPpm, people }) {
    if (!this.shadow || nowMs - this.shadow.t > 30 * 60000) {
      this.shadow = { t: nowMs, ppm: measuredPpm, lps: null };
      return this.shadow.ppm;
    }
    const seconds = (nowMs - this.shadow.t) / 1000;
    const ppm = this.shadow.lps === null ? measuredPpm : stepCo2(this.shadow.ppm, people, this.shadow.lps, seconds, this.config);
    this.shadow = { ...this.shadow, t: nowMs, ppm };
    return ppm;
  }

  // recommendation: { damperPct, minLps }; context: { nowMs, measuredPpm, people, lastDataMs, bridgeHealthy }
  async step(recommendation, context) {
    const curve = this.config.ventilation.damperCurve;
    const releaseReason = shouldRelease({ ...context, config: this.config });
    const result = { mode: this.mode, commandPct: null, guards: [], released: null, written: false, shadowPpm: null };
    if (this.mode === "L0") return result;

    const shadowPpm = this.advanceShadow(context);
    const guarded = applyGuards({
      desiredPct: recommendation.damperPct,
      previousPct: this.previousCommandPct,
      measuredPpm: context.measuredPpm,
      minPct: lpsToDamper(recommendation.minLps, curve),
      config: this.config,
    });
    result.commandPct = guarded.pct;
    result.guards = guarded.reasons;
    result.shadowPpm = shadowPpm;
    this.previousCommandPct = guarded.pct;
    this.shadow.lps = damperToLps(guarded.pct, curve);
    this.stats.steps += 1;
    if (shadowPpm > this.config.co2.limitPpm) this.stats.shadowExceedances += 1;
    if (guarded.reasons.length) this.stats.guardActivations += 1;

    if (this.mode === "L2") {
      if (releaseReason) {
        await this.release(releaseReason);
        result.released = releaseReason;
        this.mode = "L1";
        this.log({ event: "mode", mode: "L1", reason: releaseReason });
      } else {
        try {
          await this.writer.write(guarded.pct, this.config.control.bacnetPriority);
          this.writing = true;
          result.written = true;
          this.log({ event: "bacnet-write", pct: guarded.pct, priority: this.config.control.bacnetPriority, point: this.config.control.bacnetPoint });
        } catch (error) {
          this.log({ event: "bacnet-write-failed", pct: guarded.pct, error: error.message });
          await this.release("write-failed");
          this.mode = "L1";
        }
      }
    }
    result.mode = this.mode;
    return result;
  }
}
