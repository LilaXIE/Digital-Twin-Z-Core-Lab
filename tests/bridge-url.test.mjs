import test from "node:test";
import assert from "node:assert/strict";
import { bridgeUrl } from "../web/src/shared/bridge-url.js";

const at = (href) => new URL(href);
const hosted = { VITE_ZB202_BRIDGE_URL: "wss://zb202-bridge.onrender.com" };

test("public page ignores bridge overrides that point elsewhere", () => {
  const page = at("https://zb202-digital-twin.vercel.app/twin?bridge=wss://evil.example.com&bridgePort=9999");
  assert.equal(bridgeUrl(page, hosted), "wss://zb202-bridge.onrender.com");
});

test("public page accepts an override to an allowed bridge host", () => {
  const page = at("https://zb202-digital-twin.vercel.app/twin?bridge=wss://bridge.lab.example.org");
  assert.equal(bridgeUrl(page, { ...hosted, VITE_ZB202_BRIDGE_ALLOWED_HOSTS: "bridge.lab.example.org" }), "wss://bridge.lab.example.org");
});

test("local and LAN pages keep the testing overrides", () => {
  assert.equal(bridgeUrl(at("http://127.0.0.1:5173/twin?bridgePort=8788"), {}), "ws://127.0.0.1:8788");
  assert.equal(bridgeUrl(at("http://192.168.1.20:8080/twin?bridge=ws://192.168.1.30:8787"), {}), "ws://192.168.1.30:8787");
  assert.equal(bridgeUrl(at("http://192.168.1.20:8080/twin"), {}), "ws://192.168.1.20:8787");
});
