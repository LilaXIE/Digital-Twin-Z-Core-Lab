// Same-origin relay for the Environment panel's outdoor curves (web/src/twin/data/outdoor-history.js).
// Vercel's rewrite proxy cannot complete the TLS handshake with api.open-meteo.com, so this function
// fetches it from Node instead. Only the two Open-Meteo endpoints the page uses are allowed, and the
// answer is cached at the edge for 10 minutes.
//   /api/open-meteo?source=weather&<Open-Meteo query>   → api.open-meteo.com/v1/forecast
//   /api/open-meteo?source=air&<Open-Meteo query>       → air-quality-api.open-meteo.com/v1/air-quality
const TARGETS = {
  weather: "https://api.open-meteo.com/v1/forecast",
  air: "https://air-quality-api.open-meteo.com/v1/air-quality",
};

export default async function handler(request, response) {
  const url = new URL(request.url, "http://localhost");
  const target = TARGETS[url.searchParams.get("source")];
  if (!target) { response.status(400).json({ error: "unknown source" }); return; }
  url.searchParams.delete("source");
  try {
    const upstream = await fetch(`${target}?${url.searchParams}`, { signal: AbortSignal.timeout(12000) });
    const body = await upstream.text();
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    if (upstream.ok) response.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    response.status(upstream.status).send(body);
  } catch (error) {
    response.status(502).json({ error: error.message });
  }
}
