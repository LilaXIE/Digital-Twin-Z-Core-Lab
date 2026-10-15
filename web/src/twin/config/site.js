import thresholds from "./thresholds.json";

export { thresholds };

export const SITE = Object.freeze({
  // PolyU, Hung Hom.
  latitude: 22.304,
  longitude: 114.18,
  timeZone: "Asia/Hong_Kong",
  // The door faces south, so IFC +Y is true north. Change here if the model is re-oriented.
  trueNorthDeg: 0,
  // Working hours for the room-state sentence (Hong Kong time).
  workDays: [1, 2, 3, 4, 5],
  workStart: "09:00",
  workEnd: "19:00",
  staleAfterMs: 15 * 60 * 1000,
  solarStaleAfterMs: 30 * 60 * 1000,
  aiStaleAfterMs: 25 * 60 * 1000,
  kioskIdleMs: 3 * 60 * 1000,
  kioskThemeMs: 20 * 1000,
  // Grid carbon intensity for "kg CO₂e saved": CLP Power, 2024 (kg CO₂e per kWh).
  carbonKgPerKwh: 0.38,
  // Room representative values are the median of these five sensors (as the strategy service does).
  envSensors: ["AM103-05", "AM103-06", "AM103-07", "AM103-08", "AM308-01"],
});

const minutesOf = (text) => {
  const [hours, minutes] = text.split(":").map(Number);
  return hours * 60 + minutes;
};

export function hongKongParts(timeMs = Date.now()) {
  const local = new Date(timeMs + 8 * 3600000);
  return { day: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes(), hours: local.getUTCHours() + local.getUTCMinutes() / 60 };
}

export function isWorkingTime(timeMs = Date.now()) {
  const { day, minutes } = hongKongParts(timeMs);
  return SITE.workDays.includes(day) && minutes >= minutesOf(SITE.workStart) && minutes < minutesOf(SITE.workEnd);
}
