// WebSocket connection to the data bridge (scripts/influxdb-bridge.mjs, port 8787).
// The protocol is unchanged; room-history-request and reading-stats are the only additions.
import { bridgeUrl } from "../../shared/bridge-url.js";
import { forgetBridgeKey, memberToken, promptForKey, setMemberToken } from "../../shared/bridge-key.js";
import { live } from "./store.js";
import { deviceById, ingestTelemetry, registry, snapshotFor } from "./devices.js";
import { emit } from "../state.js";
import { t } from "../i18n.js";

const SOCKET_CONTROL_TIMEOUT_MS = 60000;
const MAX_SEEN = 5000;
const seen = new Set();
let socket = null;
let retryAttempt = 0;
let retryTimer = null;
let closing = false;
const pendingReplies = new Map();

const isOpen = () => socket && socket.readyState === WebSocket.OPEN;
const requestId = (type) => `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

function send(message) {
  if (!isOpen()) return false;
  socket.send(JSON.stringify(message));
  return true;
}

function settleReply(message) {
  const pending = pendingReplies.get(message.requestId);
  if (!pending) return;
  pendingReplies.delete(message.requestId);
  window.clearTimeout(pending.timer);
  pending.resolve(message);
}

function awaitReply(id, timeoutMs, fallback) {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => { pendingReplies.delete(id); resolve(fallback); }, timeoutMs);
    pendingReplies.set(id, { resolve, timer });
  });
}

function controlMessage(deviceId, phase, key, vars = {}, level = "pending") {
  live.controlMessage = { deviceId, phase, key, vars: { id: deviceId, ...vars }, level, at: Date.now() };
  emit("data", { kind: "control-phase", deviceId });
}

function handle(message) {
  switch (message.type) {
    case "telemetry": {
      const key = `${message.deviceId || message.devEui}:${message.receivedAt}:${JSON.stringify(message.values)}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value);
      const result = ingestTelemetry(live, message);
      if (!result) return;
      confirmSocketControl(result);
      emit("data", { kind: "telemetry", deviceId: result.device.id, changed: result.changed, sampleTime: result.sampleTime });
      return;
    }
    case "bridge-status":
      live.connection = { ...live.connection, known: true, connected: Boolean(message.connected), retryAt: null,
        diagnostic: message.error ? `Query failed (${message.error.code || message.error.name}): ${message.error.message}. Last success: ${message.lastSuccessAt || "none"}` : "" };
      emit("data", { kind: "connection" });
      return;
    case "control-status":
      live.control = { connected: Boolean(message.connected), readOnly: Boolean(message.readOnly ?? live.control.readOnly), writeProtected: Boolean(message.writeProtected ?? live.control.writeProtected) };
      emit("data", { kind: "control" });
      return;
    case "outdoor-weather": live.outdoor = message; emit("data", { kind: "outdoor" }); return;
    case "solar-radiation": live.radiation = message; emit("data", { kind: "radiation" }); return;
    case "reading-stats": live.readingStats = message; emit("data", { kind: "stats" }); return;
    case "sensor-calibration": live.calibration = message.co2 || null; emit("data", { kind: "calibration" }); return;
    case "sensor-health": live.sensorHealth = message; emit("data", { kind: "sensor-health" }); return;
    case "recommendation":
      live.recommendation = message;
      live.recommendationAt = Date.now();
      if (Array.isArray(message.calendar)) live.meetings = message.calendar;
      emit("data", { kind: "recommendation" });
      return;
    case "recommendation-history":
      live.recHistory = (message.entries || []).filter((entry) => Number.isFinite(Date.parse(entry.t)));
      live.recRoom = (message.room || []).filter((point) => Number.isFinite(Date.parse(point.t)) && Number.isFinite(point.ppm));
      emit("data", { kind: "rec-history" });
      return;
    case "calendar": live.meetings = message.meetings || []; emit("data", { kind: "calendar" }); return;
    case "ai-review": live.aiReview = { savings: message.savings, forecast: message.forecast }; emit("data", { kind: "ai-review" }); return;
    case "device-health": live.deviceHealth = message; emit("data", { kind: "device-health" }); return;
    case "standby-report": live.standby = message; emit("data", { kind: "standby" }); return;
    case "calendar-result":
    case "control-mode-result":
    case "note-result":
      if (message.keyRejected) signedOut();
      settleReply(message);
      return;
    case "feedback-result": settleReply(message); return;
    case "session":
      live.member = message.member ? { name: message.member } : null;
      if (message.token) setMemberToken(message.token);
      if (!message.member) setMemberToken("");
      settleReply(message);
      emit("data", { kind: "control" });
      return;
    case "audit-log": live.auditLog = message.entries || []; emit("data", { kind: "audit-log" }); return;
    case "notes": live.notes = message.notes || []; emit("data", { kind: "notes" }); return;
    case "feedback": live.feedback = message.entries || []; emit("data", { kind: "feedback" }); return;
    case "control-mode": emit("data", { kind: "control-mode", mode: message.mode }); return;
    case "demand-history": {
      const range = ["today", "7d", "30d"].includes(message.range) ? message.range : "today";
      live.demandLoading.delete(range);
      live.demandHistory.set(range, (message.samples || []).map((sample) => ({ time: Date.parse(sample.time), value: Number(sample.value) }))
        .filter((sample) => Number.isFinite(sample.time) && Number.isFinite(sample.value)));
      emit("data", { kind: "demand", range });
      return;
    }
    case "sensor-history": {
      const state = live.sensorHistory;
      if (message.requestId !== state.requestId) return;
      state.loading = false;
      state.error = message.error || null;
      if (!message.error) {
        const snapshot = snapshotFor(live, message.deviceId);
        for (const [key, samples] of Object.entries(message.trends || {})) {
          snapshot.trends[key] = samples.filter((sample) => Number.isFinite(sample.time) && Number.isFinite(sample.value)).sort((a, b) => a.time - b.time);
        }
      }
      emit("data", { kind: "sensor-history", deviceId: message.deviceId });
      return;
    }
    case "room-history":
      settleReply(message);
      return;
    case "control-queued": {
      const pending = live.pendingControls.get(message.requestId);
      if (pending) pending.phase = "queued";
      controlMessage(message.deviceId, "queued", "phaseQueued");
      return;
    }
    case "control-result": {
      const pending = live.pendingControls.get(message.requestId);
      if (!pending) return;
      if (!message.ok) {
        live.pendingControls.delete(message.requestId);
        if (message.keyRejected) signedOut();
        controlMessage(pending.deviceId, "failed", "phaseFailed", { reason: message.error || "Unknown error" }, "error");
        return;
      }
      pending.phase = "sent";
      pending.timeoutId = window.setTimeout(() => {
        if (!live.pendingControls.delete(message.requestId)) return;
        controlMessage(pending.deviceId, "failed", "phaseTimeout", { s: SOCKET_CONTROL_TIMEOUT_MS / 1000 }, "error");
      }, SOCKET_CONTROL_TIMEOUT_MS);
      controlMessage(pending.deviceId, "sent", "phaseSent");
      return;
    }
    default:
  }
}

// "Applied" only once the device itself reports the new state.
function confirmSocketControl({ device, snapshot }) {
  const status = snapshot.values.socketStatus;
  if (!Number.isFinite(status)) return;
  for (const [id, pending] of live.pendingControls) {
    if (pending.deviceId !== device.id || pending.phase !== "sent") continue;
    if ((snapshot.metricUpdatedAt.socketStatus || 0) <= pending.baselineTelemetryAt || (status > 0) !== pending.desired) continue;
    window.clearTimeout(pending.timeoutId);
    live.pendingControls.delete(id);
    controlMessage(device.id, "applied", "phaseApplied", { state: t(pending.desired ? "stateOn" : "stateOff") }, "success");
  }
}

export function connect() {
  if (socket && socket.readyState < WebSocket.CLOSING) return;
  try {
    socket = new WebSocket(bridgeUrl());
  } catch (error) {
    console.warn("Data bridge unavailable", error);
    scheduleReconnect();
    return;
  }
  socket.addEventListener("open", () => {
    retryAttempt = 0;
    // A member stays logged in across reconnects for this tab (the token expires after 12 hours).
    if (memberToken()) send({ type: "resume", token: memberToken(), requestId: requestId("resume") });
    emit("data", { kind: "socket-open" });
  });
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message && typeof message === "object") handle(message);
  });
  socket.addEventListener("close", () => {
    socket = null;
    live.connection = { ...live.connection, known: true, connected: false, diagnostic: "Browser lost the connection to the data bridge; reconnecting" };
    live.control = { ...live.control, connected: false };
    live.member = null; // the next connection resumes the session from the token
    for (const pending of live.pendingControls.values()) window.clearTimeout(pending.timeoutId);
    live.pendingControls.clear();
    live.demandLoading.clear();
    live.sensorHistory.loading = false;
    scheduleReconnect();
    emit("data", { kind: "connection" });
  });
  socket.addEventListener("error", () => socket?.close());
}

function signedOut() {
  live.member = null;
  setMemberToken("");
  forgetBridgeKey();
  emit("data", { kind: "control" });
}

const loginLabels = () => ({ title: t("loginTitle"), field: t("keyField"), cancel: t("cancel"), unlock: t("login") });

function scheduleReconnect() {
  if (closing) return;
  window.clearTimeout(retryTimer);
  const delay = Math.min(30000, 1000 * 2 ** retryAttempt++) + Math.random() * 500;
  live.connection.retryAt = Date.now() + delay;
  retryTimer = window.setTimeout(connect, delay);
}

window.addEventListener("beforeunload", () => { closing = true; window.clearTimeout(retryTimer); socket?.close(); });

// ---- Request API (the demo provider implements the same functions) ----
export const bridgeApi = {
  kind: "live",
  isOpen,
  requestSensorHistory(deviceId, hours) {
    const device = deviceById(deviceId);
    if (!device || !isOpen()) return;
    const state = live.sensorHistory;
    state.requestId = `${deviceId}:${Date.now()}:${Math.random()}`;
    state.deviceId = deviceId;
    state.loading = true;
    state.error = null;
    const id = state.requestId;
    window.setTimeout(() => {
      if (state.requestId === id && state.loading) { state.loading = false; state.error = "timeout"; emit("data", { kind: "sensor-history", deviceId }); }
    }, 35000);
    send({ type: "sensor-history-request", requestId: id, deviceId, devEui: device.devEui, hours });
  },
  requestDemandHistory(range) {
    if (live.demandLoading.has(range) || !isOpen()) return;
    live.demandLoading.add(range);
    send({ type: "demand-history-request", range });
    window.setTimeout(() => { if (live.demandLoading.delete(range)) emit("data", { kind: "demand", range }); }, 35000);
  },
  async requestRoomHistory(hours = 24, stepMinutes = 10) {
    if (!isOpen()) return null;
    const id = requestId("room-history");
    live.roomHistoryLoading = true;
    emit("data", { kind: "room-history" });
    send({ type: "room-history-request", requestId: id, hours, stepMinutes });
    const reply = await awaitReply(id, 60000, { error: "timeout" });
    live.roomHistoryLoading = false;
    live.roomHistoryError = reply.error || null;
    if (!reply.error) live.roomHistory = reply;
    emit("data", { kind: "room-history" });
    return reply.error ? null : reply;
  },
  requestRecommendationHistory(hours = 24) {
    send({ type: "recommendation-history-request", requestId: requestId("rec-history"), hours });
  },
  requestDeviceHealth() { send({ type: "device-health-request", requestId: requestId("device-health") }); },
  requestStandbyReport() { send({ type: "standby-report-request", requestId: requestId("standby") }); },
  requestAiReview(days = 7, hours = 24) {
    send({ type: "ai-review-request", requestId: requestId("ai-review"), days, hours });
  },
  // Members log in once with their own key; protected bridges refuse writes from visitors.
  async login() {
    if (live.member) return true;
    if (!isOpen()) return false;
    const key = await promptForKey(t("loginPrompt"), loginLabels());
    if (!key) return false;
    const id = requestId("login");
    send({ type: "login", key, requestId: id });
    const reply = await awaitReply(id, 15000, { member: null, error: "timeout" });
    return Boolean(reply.member);
  },
  logout() {
    send({ type: "logout" });
    signedOut();
  },
  async ensureMember() {
    return !live.control.writeProtected || Boolean(live.member) || this.login();
  },
  async sendFeedback(vote) {
    if (!isOpen()) return { ok: false };
    const id = requestId("feedback");
    send({ type: "feedback", vote, requestId: id });
    return awaitReply(id, 15000, { ok: false, error: "timeout" });
  },
  requestAuditLog() { send({ type: "audit-log-request" }); },
  async socketControl(deviceId, desired) {
    if (!(await this.ensureMember())) return false;
    if (!live.control.connected || !isOpen()) {
      controlMessage(deviceId, "failed", "phaseFailed", { reason: t("reasonMqtt") }, "error");
      return false;
    }
    const id = crypto.randomUUID?.() || requestId("socket");
    const snapshot = snapshotFor(live, deviceId);
    live.pendingControls.set(id, { deviceId, desired, phase: "queued", baselineTelemetryAt: snapshot.metricUpdatedAt.socketStatus || 0, timeoutId: null });
    controlMessage(deviceId, "queued", "phaseQueued");
    send({ type: "socket-control", requestId: id, deviceId, action: desired ? "on" : "off" });
    return true;
  },
  async writeRequest(message) {
    if (!(await this.ensureMember())) return null;
    if (!isOpen()) return { ok: false, error: t("disconnected") };
    const id = requestId(message.type);
    send({ ...message, requestId: id });
    return awaitReply(id, 30000, { ok: false, error: "timeout" });
  },
};

export const supportedSocketIds = () => registry.devices.filter((device) => device.model === "WS523").map((device) => device.id).sort();
