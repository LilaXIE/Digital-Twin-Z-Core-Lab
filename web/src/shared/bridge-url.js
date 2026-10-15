// Resolves the data bridge WebSocket URL, in order of precedence:
// ?bridge=wss://host (full URL), ?bridgePort=8788 (bridge on this host),
// VITE_ZB202_BRIDGE_URL at build time (hosted deployments), then this host on port 8787.
// The two query overrides only apply on local or private hosts, or (for ?bridge=) to an allowed
// bridge host, so a shared link cannot point the public page at someone else's server.

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^.]+\.local)$/i;

export function isLocalHost(hostname = window.location.hostname) {
  return LOCAL_HOST.test(hostname);
}

// Hosts the page may connect to through ?bridge=: the configured bridge plus VITE_ZB202_BRIDGE_ALLOWED_HOSTS.
export function allowedBridgeHosts(env = import.meta.env) {
  const hosts = String(env.VITE_ZB202_BRIDGE_ALLOWED_HOSTS || "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  try { if (env.VITE_ZB202_BRIDGE_URL) hosts.push(new URL(env.VITE_ZB202_BRIDGE_URL).hostname.toLowerCase()); } catch { /* invalid build setting */ }
  return new Set(hosts);
}

export function bridgeUrl(location = window.location, env = import.meta.env) {
  const params = new URLSearchParams(location.search);
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const overridable = Boolean(env.DEV) || isLocalHost(location.hostname);
  const explicit = params.get("bridge");
  if (explicit && /^wss?:\/\//i.test(explicit)) {
    try {
      if (overridable || allowedBridgeHosts(env).has(new URL(explicit).hostname.toLowerCase())) return explicit;
    } catch { /* ignore malformed override */ }
  }
  const port = Number(params.get("bridgePort"));
  if (overridable && Number.isInteger(port) && port > 0 && port < 65536) return `${scheme}://${location.hostname}:${port}`;
  const configured = env.VITE_ZB202_BRIDGE_URL;
  if (configured) return configured;
  return `${scheme}://${location.hostname}:8787`;
}
