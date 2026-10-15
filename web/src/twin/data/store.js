// The active dataset (live or demo) and the request facade the UI uses.
// Live data keeps arriving in the background while demo mode is on.
import { createDataset } from "./devices.js";
import { emit, settings, storage } from "../state.js";

export const live = createDataset("live");
let demo = null;
let demoProvider = null;
let bridgeProvider = null;

export function registerProviders({ bridge, demoFactory }) {
  bridgeProvider = bridge;
  demoProvider = demoFactory;
}

export function data() {
  return settings.demo && demo ? demo : live;
}

export function provider() {
  return settings.demo && demo ? demoProvider.api : bridgeProvider;
}

export async function setDemo(enabled) {
  if (enabled) {
    if (!demo) demo = await demoProvider.create();
    demoProvider.start(demo);
  } else if (demo) {
    demoProvider.stop(demo);
    demo = null; // discard every simulated value
  }
  emit("data", { kind: "dataset" });
}

// Alarm acknowledgement survives reloads in this browser only.
export const alarmStates = storage.getJson("zb202-alarm-states", {});
export function setAlarmState(id, value) {
  alarmStates[id] = value;
  storage.set("zb202-alarm-states", JSON.stringify(alarmStates));
  emit("data", { kind: "alarms" });
}
