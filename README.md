# ZB202 Digital Twin

[简体中文](docs/README.zh-CN.md)

A digital twin for environmental monitoring in the ZB202 laboratory. The frontend displays BIM models and sensor readings, with live data supplied by a local InfluxDB bridge.

## Getting started

Requires Node.js 20.19+. Run these commands from the project root:

```sh
npm install
cp .env.example .env
npm run dev
```

Add your InfluxDB token and connection details to `.env`. On Windows, double-click `start-zb202.bat`; on macOS, double-click `start-zb202.command`.

Open [the 3D twin](http://127.0.0.1:5173/twin.html). The old overview (`overview.html`), AI page (`strategy.html`) and device links (`device.html`) now open the matching part of the twin: `twin.html#devices`, `twin.html#ai` and `twin.html#sensor=AM103-05`.

### Page options

- `?lang=zh|zh-Hant|en`: language (otherwise the last choice, then the browser language).
- `?demo=1`: demo mode with virtual data, always labelled "Demo data". Also in Settings.
- `?kiosk=1`: lab display: standby showcase after 3 idle minutes, medium quality to start, large-screen sizing from 1600 px wide.
- `?mode=internal`: engineering tools (coordinate pick, quality tier and FPS readout, bridge diagnostics, unconnected modules, AI shadow-mode record).
- `?quality=high|medium|low`: pin the rendering quality tier.
- `?bridge=wss://host` or `?bridgePort=8788`: use another data bridge.

The interface follows [the UI/UX redesign plan](docs/ui-redesign-plan.md); [the implementation notes](docs/ui-redesign-implementation.md) record what was verified and where it differs from the plan.

## Commands

- `npm run dev`: start the frontend development server and local data bridge.
- `npm run build`: build the static frontend into `dist/`.
- `npm run serve:lan`: serve `dist/` on the local network; build first.
- `npm run test:bridge`: check the running data bridge with read-only telemetry requests.
- `npm run test:resilience`: test database failure and recovery using an isolated mock service.
- `npm run bim:convert`: convert IFC source models to Fragments.
- `npm run bim:plan`: regenerate the floor-plan drawing used by the opening animation (`web/public/models/plan-lines.json`).
- `npm run fonts:css`: regenerate the self-hosted font faces (`web/src/twin/styles/fonts*.css`).
- `npm run test:ui`: unit tests for the room-history bridge message and the one-line room status rules.
- `npm run bridge:mock`: a synthetic data bridge on port 8788 for interface work without InfluxDB (open `twin.html?bridgePort=8788`).
- `npm run test:strategy`: unit tests for the AI ventilation strategy.
- `npm run strategy:backtest -- --days 14`: replay InfluxDB history through the strategy (`--synthetic` works offline).
- `npm run strategy:calibrate -- --days 60`: estimate sensor offsets, outdoor CO₂ and decay airflow; add `--write` to save.

## Project structure

```text
ZB202_DT/
├── data/device-inventory/        # Historical device inventory backups (CSV/XLSX)
├── docs/                         # Architecture, troubleshooting and Chinese README
├── models/
│   ├── ifc/                      # IFC source models
│   └── rvt/                      # Editable Revit source models
├── scripts/                     # Development, data bridge and conversion tools
├── tests/                       # Bridge and resilience checks
├── web/
│   ├── public/
│   │   ├── fonts/                # Self-hosted Inter (Latin); Noto Sans comes from npm at build time
│   │   └── models/               # Fragments models and the opening plan drawing
│   ├── src/
│   │   ├── shared/               # Bridge URL / access key and sensor status helpers
│   │   └── twin/
│   │       ├── app.js            # Start-up and wiring
│   │       ├── config/           # Site settings and environment thresholds (thresholds.json)
│   │       ├── data/             # Bridge, live and demo datasets, derived values, replay
│   │       ├── scene/            # Renderer, materials, lighting, daylight, markers, effects
│   │       ├── ui/               # Shell, theme panels, sensor sheet, AI, alarms, settings
│   │       └── styles/           # Tokens, glass, motion, components, fonts
│   ├── index.html                # Default entry point
│   ├── twin.html                 # The digital twin
│   ├── overview.html             # Redirects to twin.html#devices
│   ├── strategy.html             # Redirects to twin.html#ai
│   └── device.html               # Redirect for legacy device links
├── .env.example                  # Connection configuration template
├── package.json                  # Commands and dependencies
├── start-zb202.bat               # Windows launcher
├── start-zb202.command           # macOS launcher
└── vite.config.js                # Frontend build configuration
```

The frontend loads the Architecture, MEP and Sensor Fragments models. Keep their IFC and Revit sources for future model updates. See [the BIM conversion workflow](docs/architecture/bim-fragments.md).

## AI outdoor-air recommendation

The bridge recalculates every 10 minutes the least outdoor airflow that keeps forecast CO₂ at or below 750 ppm (limit 800 ppm). It combines a single-zone CO₂ model, a CO₂-based occupancy estimate, the meeting schedule and the HKO King's Park outdoor conditions. It runs in shadow mode (L1) by default and never writes to the BMS. Open the AI card in the 3D twin (or [twin.html#ai](http://127.0.0.1:5173/twin.html#ai)). Method and open questions: [the strategy document](docs/strategy/ai-recommendation-strategy.md).

- `scripts/strategy/`: engine modules. Each recommendation is broadcast as a `recommendation` WebSocket message.
- `data/strategy/calibration.json`: calibration results that override the defaults in `scripts/strategy/config.mjs`.
- `data/strategy/calendar.json`: meetings entered on the AI page.
- `data/strategy/shadow-log.jsonl`: a local log of every recommendation and shadow command. It is not committed.
- Virtual demo data on the 3D twin appears only in demo mode (`?demo=1` or Settings) and is always labelled "Demo data"; turning demo mode off discards it.

## Outdoor solar radiation

Every 10 minutes, the bridge collects the one-minute average global solar radiation (W/m²) at King's Park from the [Hong Kong Observatory feed](https://data.weather.gov.hk/weatherAPI/hko_data/regional-weather/latest_1min_solar.csv). It converts observation times from Hong Kong time to UTC, writes the observations to InfluxDB, then reads them back for the frontend. If the token cannot write, the bridge shows the HKO observation directly. Outdoor temperature, humidity and wind also come from HKO King's Park unless a weather station reports through InfluxDB.

The measurement is `hko-solar-radiation`, the field is `solarRadiation`, and the station tag is `King's Park`. The weather bucket is used by default; override it with `ZB202_SOLAR_INFLUX_BUCKET`. The weather token needs read and write access. Observations older than 30 minutes are shown as missing. Weather readings appear in the Environment theme (and drive the scene's live daylight) and are excluded from the device list.

## File maintenance and hosting

Run the project locally or serve the built frontend on your local network. GitHub Pages is disabled and its deployment workflow has been removed.

The public site at [zb202-digital-twin.vercel.app](https://zb202-digital-twin.vercel.app) is the static frontend on Vercel (`vercel.json`). Vercel cannot run the data bridge, so a read-only bridge runs on Render (`render.yaml`):

1. In Render, choose New > Blueprint, select this repository and enter `ZB202_INFLUX_TOKEN` when prompted.
2. In the Vercel project, set `VITE_ZB202_BRIDGE_URL` to the Render address with `wss://` (for example `wss://zb202-bridge.onrender.com`), then redeploy with `vercel deploy --prod`.

Socket control, meeting edits and mode changes on the public site need the access key in `ZB202_BRIDGE_WRITE_KEY`; the page asks for it once per browser session. Socket control also needs `ZB202_MQTT_USERNAME` and `ZB202_MQTT_PASSWORD`. `ZB202_BRIDGE_REQUIRE_KEY=true` refuses control commands until a key is set; `ZB202_BRIDGE_READ_ONLY=true` refuses them all. On Render's free plan, meetings saved on the public bridge are lost when the service restarts. `ZB202_BRIDGE_ALLOWED_ORIGINS` lists the frontend origins allowed to connect. To try another bridge, add `?bridge=wss://host` to any page URL. Render's free plan sleeps after 15 minutes without visitors and takes about 30 seconds to wake.

- `.env` stores the current local configuration; `.env.example` is the configuration template. Never commit real credentials.
- `data/device-inventory/` contains historical backups for manual reference; it is not the live telemetry source.
- `node_modules/` contains reinstallable dependencies; `dist/` contains generated build output. Both are ignored by Git.
- Keep the root Windows/macOS launchers for convenient startup and `web/device.html` for compatibility with legacy links.
