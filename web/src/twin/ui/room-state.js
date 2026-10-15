// The one-sentence room status (section 4.3). Pure rules so they are easy to change and test.
// in-use: someone is in the room · vacant: working hours, nobody in · after-hours · unknown: no occupancy source.

export function roomState({ working, occupancy, co2, co2Rise30, sockets = [], safety = {}, recommendation = null }) {
  if (!working) {
    const parts = [];
    if (safety.doorsKnown) parts.push(safety.doorsClosed ? "sDoorClosed" : "sDoorOpen");
    if (safety.leakKnown) parts.push(safety.leakFree ? "sNoLeak" : "sLeak");
    return { state: "after-hours", key: "sAfterHours", parts, emphasis: "safety" };
  }
  if (!occupancy) {
    if (!Number.isFinite(co2)) return { state: "unknown", key: "sNoData", emphasis: "environment" };
    const key = co2 < 800 ? "sUnknownGood" : co2 <= 1000 ? "sUnknownCaution" : "sUnknownPoor";
    return { state: "unknown", key, vars: { v: Math.round(co2) }, emphasis: "environment" };
  }
  if (occupancy.count >= 1) {
    const n = Math.round(occupancy.count);
    if (Number.isFinite(co2) && co2 > 1000) return { state: "in-use", key: "sInUseHigh", emphasis: "co2" };
    const raising = recommendation && recommendation.airflow && recommendation.airflow.recommendedLps > recommendation.airflow.baselineLps + 5;
    if (Number.isFinite(co2) && co2 >= 700 && (co2Rise30 > 60 || raising)) return { state: "in-use", key: "sInUseRising", emphasis: "co2" };
    if (!Number.isFinite(co2) || co2 < 800) return { state: "in-use", key: occupancy.measured ? "sInUseGood" : "sInUseGoodEstimated", vars: { n }, emphasis: "co2" };
    return { state: "in-use", key: "sInUseCaution", vars: { n, v: Math.round(co2) }, emphasis: "co2" };
  }
  const reporting = sockets.filter((socket) => socket.power !== null && !socket.stale);
  if (reporting.length) {
    const on = reporting.filter((socket) => socket.power > 5).length;
    return { state: "vacant", key: "sVacantSockets", vars: { total: reporting.length, on }, emphasis: "energy" };
  }
  return { state: "vacant", key: "sVacant", emphasis: "energy" };
}

export function sentenceText(result, t, lang) {
  const main = t(result.key, result.vars || {});
  if (!result.parts?.length) return main;
  const separator = lang === "en" ? " · " : "，";
  return [main, ...result.parts.map((part) => t(part))].join(separator);
}
