import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import WebSocket from "ws";
import { buildSensorHistoryQuery } from "../scripts/sensor-history.mjs";

assert.throws(() => buildSensorHistoryQuery({ deviceId: "bad", hours: 24, stop: new Date().toISOString() }));
const query = buildSensorHistoryQuery({ bucket: "test", deviceId: "AM103-01", hours: 720, stop: new Date().toISOString() });
assert.match(query, /aggregateWindow\(every: 4320s, fn: last, createEmpty: false\)/);
let fail = false;
const mock = http.createServer((req, res) => {
  req.resume();
  if (fail) { res.writeHead(503, { "content-type": "application/json" }); res.end('{"message":"test database unavailable"}'); return; }
  res.writeHead(200, { "content-type": "text/csv" });
  res.end(`#datatype,string,long,dateTime:RFC3339,double,string,string\n#group,false,false,false,false,true,true\n#default,_result,,,,,\n,result,table,_time,_value,_field,_measurement\n,,0,${new Date().toISOString()},23.5,temperature,AM103_01\n`);
});
mock.listen(0, "127.0.0.1");
await once(mock, "listening");
const portProbe = net.createServer().listen(0, "127.0.0.1");
await once(portProbe, "listening");
const bridgePort = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const strategyDir = await mkdtemp(path.join(os.tmpdir(), "zb202-strategy-"));
const child = spawn(process.execPath, ["scripts/influxdb-bridge.mjs"], {
  env: { ...process.env, ZB202_INFLUX_URL: `http://127.0.0.1:${mock.address().port}`, ZB202_INFLUX_TOKEN: "test", ZB202_INFLUX_ORG: "test", ZB202_INFLUX_BUCKET: "test", ZB202_INFLUX_MEASUREMENT: "", ZB202_WEATHER_INFLUX_BUCKET: "", ZB202_MQTT_USERNAME: "", ZB202_MQTT_PASSWORD: "", ZB202_INFLUX_BRIDGE_HOST: "127.0.0.1", ZB202_INFLUX_BRIDGE_PORT: String(bridgePort), ZB202_INFLUX_POLL_INTERVAL_MS: "2000", ZB202_INFLUX_QUERY_TIMEOUT_MS: "1000", ZB202_STRATEGY_DATA_DIR: strategyDir, ZB202_STRATEGY_INFLUX_WRITE: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
let socket;
const messages = [];
const deadline = setTimeout(() => child.kill(), 25000);
const waitFor = async (predicate) => {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    const found = messages.find(predicate);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Expected bridge response did not arrive");
};
try {
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (data) => { if (data.toString().includes("WebSocket ready")) resolve(); });
    child.once("error", reject);
    child.once("exit", () => reject(new Error("Bridge exited before becoming ready")));
  });
  socket = new WebSocket(`ws://127.0.0.1:${bridgePort}`);
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await once(socket, "open");
  await waitFor((m) => m.type === "bridge-status" && m.connected && m.lastSuccessAt);
  await waitFor((m) => m.type === "telemetry" && m.values.temperature === 23.5);
  // The mock has no CO₂ data, so the strategy reports that it cannot recommend.
  await waitFor((m) => m.type === "calendar" && Array.isArray(m.meetings));
  await waitFor((m) => m.type === "recommendation" && m.status === "no-data");
  socket.send(JSON.stringify({ type: "recommendation-history-request", requestId: "h1", hours: 24 }));
  await waitFor((m) => m.type === "recommendation-history" && m.requestId === "h1" && Array.isArray(m.entries));
  socket.send(JSON.stringify({ type: "calendar-update", requestId: "c1", action: "upsert", meeting: { start: "bad", end: "bad", people: 3 } }));
  await waitFor((m) => m.type === "calendar-result" && m.requestId === "c1" && !m.ok);
  socket.send(JSON.stringify({ type: "control-mode-request", requestId: "l2", mode: "L2" }));
  await waitFor((m) => m.type === "control-mode-result" && m.requestId === "l2" && !m.ok && m.mode !== "L2");
  socket.send("null"); // Malformed but valid JSON must not crash the bridge.
  socket.send(JSON.stringify({ type: "sensor-history-request", requestId: "bad", deviceId: "invalid", hours: 1 }));
  await waitFor((m) => m.type === "sensor-history" && m.requestId === "bad" && m.error);
  await new Promise((resolve, reject) => {
    const foreign = new WebSocket(`ws://127.0.0.1:${bridgePort}`, { origin: "https://untrusted.example" });
    foreign.once("open", () => { foreign.close(); reject(new Error("Foreign browser origin accepted")); });
    foreign.once("error", (error) => { try { assert.match(error.message, /401|403/); resolve(); } catch (failure) { reject(failure); } });
  });
  fail = true;
  const failed = await waitFor((m) => m.type === "bridge-status" && !m.connected && m.error?.code === 503);
  assert.ok(failed.lastSuccessAt);
  fail = false;
  const afterFailure = messages.length;
  await waitFor((m) => messages.indexOf(m) >= afterFailure && m.type === "bridge-status" && m.connected && m.consecutiveFailures === 0 && !m.error);
  console.log("PASS: telemetry, query diagnostics, failure/recovery, invalid requests, origin protection, bounded history, strategy messages");
} finally {
  clearTimeout(deadline);
  socket?.terminate();
  child.kill();
  await new Promise((resolve) => mock.close(resolve));
  await rm(strategyDir, { recursive: true, force: true });
}
