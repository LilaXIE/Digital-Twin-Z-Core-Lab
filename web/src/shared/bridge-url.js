// Resolves the data bridge WebSocket URL, in order of precedence:
// ?bridge=wss://host (full URL), ?bridgePort=8788 (bridge on this host),
// VITE_ZB202_BRIDGE_URL at build time (hosted deployments), then this host on port 8787.
export function bridgeUrl() {
  const params = new URLSearchParams(window.location.search);
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const explicit = params.get("bridge");
  if (explicit && /^wss?:\/\//i.test(explicit)) return explicit;
  const port = Number(params.get("bridgePort"));
  if (Number.isInteger(port) && port > 0 && port < 65536) return `${scheme}://${window.location.hostname}:${port}`;
  const configured = import.meta.env.VITE_ZB202_BRIDGE_URL;
  if (configured) return configured;
  return `${scheme}://${window.location.hostname}:8787`;
}
