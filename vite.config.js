import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "web",
  base: "./",
  // Same paths as the rewrites in vercel.json (outdoor curves, data/outdoor-history.js).
  server: {
    proxy: {
      "/api/open-meteo/weather": { target: "https://api.open-meteo.com", changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/open-meteo\/weather/, "/v1") },
      "/api/open-meteo/air": { target: "https://air-quality-api.open-meteo.com", changeOrigin: true, rewrite: (path) => path.replace(/^\/api\/open-meteo\/air/, "/v1") },
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        index: resolve(process.cwd(), "web/index.html"),
        overview: resolve(process.cwd(), "web/overview.html"),
        device: resolve(process.cwd(), "web/device.html"),
        twin: resolve(process.cwd(), "web/twin.html"),
        strategy: resolve(process.cwd(), "web/strategy.html"),
      },
    },
  },
});
