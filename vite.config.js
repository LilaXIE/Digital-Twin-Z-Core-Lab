import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "web",
  base: "./",
  // The outdoor-curve relay (api/open-meteo.js, a Vercel function) served by the dev server too.
  plugins: [{
    name: "open-meteo-relay",
    configureServer(server) {
      server.middlewares.use("/api/open-meteo", async (req, res) => {
        const { default: handler } = await import("./api/open-meteo.js");
        const reply = {
          status(code) { res.statusCode = code; return reply; },
          setHeader: (key, value) => res.setHeader(key, value),
          json(value) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(value)); },
          send(body) { res.end(body); },
        };
        await handler({ url: req.originalUrl }, reply);
      });
    },
  }],
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
