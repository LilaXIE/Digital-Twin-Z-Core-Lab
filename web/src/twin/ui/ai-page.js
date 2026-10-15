// AI details (section 7.2), carried over from the local strategy.html with all of its content:
// summary tiles, CO₂ forecast (recommended vs existing), occupancy timeline, airflow history,
// estimated savings, meeting schedule, basis, the former AI card's control mode and supply-air
// setpoint, and the internal shadow-mode section. The card grows into this page (View Transition).
import { t, getLang, clockTime, dateTime } from "../i18n.js";
import { ui, settings, setView, on } from "../state.js";
import { data, provider } from "../data/store.js";
import { recommendationState } from "../data/derived.js";
import { lineChart, legend, cssVar } from "./charts/timeline.js";
import { escapeHtml, icon, term } from "./dom.js";
import { ahuHours, ahuOff, dayTime, reasonText, weekdayName } from "./ai-text.js";
import { SITE } from "../config/site.js";
import { exportSavingsCsv, printWeeklyReport } from "./export.js";
import { controlUnlocked, unlockControl } from "./sockets.js";
import { updateViewInset } from "./panel.js";

const page = () => document.getElementById("ai-page");
let built = false;
let resizeFrame = 0;
const number = (value, digits = 0) => (Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "");

function build() {
  page().innerHTML = `<div class="tw-ai-inner">
    <header class="tw-ai-top">
      <button type="button" class="tw-icon-button" data-action="close" aria-label="${escapeHtml(t("back"))}">${icon("ph-arrow-left")}</button>
      <div><p data-part="eyebrow"></p><h1 id="ai-page-title"></h1></div>
      <span class="tw-pill tw-ai-connection" data-part="connection"></span>
      <button type="button" class="tw-icon-button" data-action="expand" aria-label="${escapeHtml(t("expand"))}" title="${escapeHtml(t("expand"))}">${icon("ph-arrows-out-simple")}</button>
      <button type="button" class="tw-icon-button" data-action="close" aria-label="${escapeHtml(t("close"))}">${icon("ph-x")}</button>
    </header>
    <section class="tw-ai-summary" aria-live="polite" data-part="summary"></section>
    <section class="tw-card" data-part="energy"></section>
    <section class="tw-card"><header><div><h2 data-part="co2-title"></h2><p data-part="co2-sub"></p></div><div data-part="co2-legend"></div></header>
      <div class="tw-chart" style="height:240px" data-part="co2-chart"></div><details class="tw-table-view"><summary data-part="table-label"></summary><div data-part="co2-table"></div></details></section>
    <section class="tw-card" data-part="review"></section>
    <div class="tw-grid-2">
      <section class="tw-card"><header><div><h2 data-part="occ-title"></h2><p data-part="occ-sub"></p></div><div data-part="occ-legend"></div></header><div class="tw-chart" data-part="occ-chart"></div><details class="tw-table-view"><summary data-part="table-label"></summary><div data-part="occ-table"></div></details></section>
      <section class="tw-card"><header><div><h2 data-part="air-title"></h2><p data-part="air-sub"></p></div><div data-part="air-legend"></div></header><div class="tw-chart" data-part="air-chart"></div><details class="tw-table-view"><summary data-part="table-label"></summary><div data-part="air-table"></div></details></section>
    </div>
    <section class="tw-card" data-part="basis"></section>
    <section class="tw-card" data-part="control"></section>
    <section class="tw-card" data-part="calendar"></section>
    <section class="tw-card" data-part="internal" hidden></section>
  </div>`;
  page().querySelectorAll('[data-action="close"]').forEach((button) => button.addEventListener("click", () => setView("home")));
  page().querySelector('[data-action="expand"]').addEventListener("click", () => {
    const full = page().classList.toggle("is-full");
    const button = page().querySelector('[data-action="expand"]');
    button.innerHTML = icon(full ? "ph-arrows-in-simple" : "ph-arrows-out-simple");
    button.setAttribute("aria-label", t(full ? "collapse" : "expand"));
    button.title = t(full ? "collapse" : "expand");
    renderCharts();
    updateViewInset();
  });
  built = true;
}

const recText = reasonText;
const modeName = (mode) => t(`mode${mode}`) || mode;

function renderSummary() {
  const { rec, valid, stale } = recommendationState();
  const dataset = data();
  const connection = page().querySelector('[data-part="connection"]');
  const connected = dataset.kind === "demo" || dataset.connection.connected;
  connection.dataset.level = connected ? "good" : "offline";
  connection.textContent = connected ? t("connected") : t("disconnected");
  page().querySelector('[data-part="eyebrow"]').textContent = t("aiPageEyebrow");
  page().querySelector("#ai-page-title").textContent = t("aiTitle");
  const host = page().querySelector('[data-part="summary"]');
  if (!rec || !valid) {
    host.innerHTML = `<p class="tw-ai-reason-line${rec ? " is-warning" : ""}">${escapeHtml(rec ? recText(rec) : t("noData"))}</p>`;
    return;
  }
  const tile = (label, value, unit, note, main = false) => `<article class="tw-tile${main ? " is-main" : ""}"><span>${label}</span><strong><span class="tw-num">${escapeHtml(value)}</span>${unit ? `<span class="tw-unit">${unit}</span>` : ""}</strong><small>${escapeHtml(note)}</small></article>`;
  const average = rec.co2.average8h === null || rec.co2.average8h === undefined ? "" : rec.co2.average8hCoverageHours < 7.5 ? t("average8hPartial", { v: rec.co2.average8h, h: rec.co2.average8hCoverageHours }) : t("average8h", { v: rec.co2.average8h });
  const off = ahuOff(rec);
  host.innerHTML = [
    off
      ? tile(escapeHtml(t("ahuState")), t("ahuOffTitle"), "", rec.ahu.nextStart ? t("ahuNextStart", { when: dayTime(Date.parse(rec.ahu.nextStart)) }) : "", true)
      : tile(term("airflow", t("recommended")), rec.airflow.recommendedLps, "L/s", `${t("damperNow", { pct: rec.airflow.recommendedDamperPct, now: rec.ahu?.assumedDamperPct ?? rec.airflow.baselineDamperPct })}${rec.airflow.atMax ? ` · ${t("aiAtMax")}` : ""}`, true),
    tile(rec.occupancy.measured ? escapeHtml(t("occupancy")) : term("estimated", t("occupancyEstimated")), rec.occupancy.current, "", rec.occupancy.measured ? t("occupancyMeasuredNote") : t("occupancyEstimatedNote")),
    off && Number.isFinite(rec.ahu.ppmAtNextStart)
      ? tile(escapeHtml(t("ahuStartCo2Tile")), rec.ahu.ppmAtNextStart, "ppm", rec.ahu.nextStart ? dayTime(Date.parse(rec.ahu.nextStart)) : "")
      : tile(escapeHtml(t("peak60")), rec.co2.peakRecommended, "ppm", t("forecastPoints", { a: rec.co2.at30.recommended, b: rec.co2.at60.recommended })),
    tile(term("co2", t("currentCo2")), rec.co2.current, "ppm", average),
  ].join("") + `<p class="tw-ai-reason-line${rec.status === "at-max" || stale ? " is-warning" : ""}">${escapeHtml(recText(rec))} · ${escapeHtml(settings.internal ? t("updatedAt", { time: clockTime(Date.parse(rec.generatedAt)), mode: modeName(rec.controlMode) }) : t("updatedAtShort", { time: clockTime(Date.parse(rec.generatedAt)) }))}${stale ? ` · ${escapeHtml(t("aiInterrupted", { time: clockTime(Date.parse(rec.generatedAt)) }))}` : ""}</p>`;
}

// From the former AI card: auto/manual mode and the supply-air setpoint. Read-only without AHU
// data and FMO authorisation (demo mode shows the virtual values).
function renderControl() {
  const host = page().querySelector('[data-part="control"]');
  const { rec } = recommendationState();
  const demo = rec?.demo;
  const recommendedDamper = rec?.airflow?.recommendedDamperPct;
  // The mode switch can never be used before AHU data and FMO authorisation exist, so customers see
  // a plain statement instead of two disabled buttons; internal mode keeps the full detail.
  const showSwitch = Boolean(demo) || settings.internal;
  host.innerHTML = `<header><div><h2>${escapeHtml(t("aiControlMode"))}</h2><p>${escapeHtml(demo ? t("badgeDemo") : settings.internal ? t("aiControlReadOnly") : t("aiAdviceOnly"))}</p></div>
      ${showSwitch ? `<div class="tw-seg" role="group" aria-label="${escapeHtml(t("aiControlMode"))}">
        <button type="button" ${demo ? "" : "disabled"} aria-pressed="${Boolean(demo?.autoMode)}">${icon("ph-sparkle")} ${escapeHtml(t("aiAutoMode"))}</button>
        <button type="button" ${demo ? "" : "disabled"} aria-pressed="${demo ? !demo.autoMode : true}">${icon("ph-hand")} ${escapeHtml(t("aiManualMode"))}</button>
      </div>` : ""}</header>
    <div class="tw-control-rec">
      ${demo || settings.internal ? `<div><span>${escapeHtml(t("aiSupplySetpoint"))}</span>${demo ? `<strong><span class="tw-num">${demo.supplySetpoint.recommended.toFixed(1)}</span><span class="tw-unit">°C</span></strong><span>${escapeHtml(t("aiCurrentSetpoint", { v: `${demo.supplySetpoint.current.toFixed(1)}°C` }))}</span><br><em class="${demo.supplySetpoint.executed ? "" : "is-waiting"}">${escapeHtml(t(demo.supplySetpoint.executed ? "aiExecuted" : "aiAwaiting"))}</em>` : `<p class="tw-caption">${escapeHtml(t("aiSetpointUnavailable"))}</p>`}</div>` : ""}
      <div><span>${term("damper", t("aiDamperRec"))}</span>${ahuOff(rec) ? `<p class="tw-caption">${escapeHtml(t("ahuOffNoSavings"))}</p>` : Number.isFinite(recommendedDamper) ? `<strong><span class="tw-num">${recommendedDamper}</span><span class="tw-unit">%</span></strong><span>${escapeHtml(t("aiCurrentPosition", { v: `${rec.ahu?.assumedDamperPct ?? rec.airflow.baselineDamperPct}%` }))}</span>` : `<p class="tw-caption">${escapeHtml(t("noData"))}</p>`}</div>
    </div>`;
  if (demo) host.querySelectorAll(".tw-seg button").forEach((button, index) => button.addEventListener("click", () => { demo.autoMode = index === 0; renderControl(); }));
}

function meetingBands() {
  return data().meetings.map((meeting) => ({ from: Date.parse(meeting.start), to: Date.parse(meeting.end), label: `${meeting.title || t("meetingDefault")} · ${meeting.people}` }));
}

function table(element, headers, rows) {
  element.innerHTML = `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function renderCharts() {
  const root = page();
  const { rec, valid } = recommendationState();
  const dataset = data();
  root.querySelectorAll('[data-part="table-label"]').forEach((el) => { el.textContent = t("tableView"); });
  // CO₂: recommended vs existing operation.
  const nowT = rec?.generatedAt ? Date.parse(rec.generatedAt) : Date.now();
  const measured = dataset.recRoom.map((p) => ({ t: Date.parse(p.t), v: p.ppm })).filter((p) => p.t >= nowT - 3 * 3600000);
  const toPoints = (items) => (items || []).map((item) => ({ t: Date.parse(item.t), v: item.ppm }));
  const co2Series = [
    { label: t("measured"), color: cssVar("--series-3"), points: measured },
    { label: t("recommendedSeries"), color: cssVar("--series-1"), points: valid ? toPoints(rec.co2.forecastRecommended) : [], directLabel: t("recommendedSeries") },
    { label: t("baselineSeries"), color: cssVar("--series-2"), points: valid ? toPoints(rec.co2.forecastBaseline) : [], dashed: true, directLabel: t("baselineSeries") },
  ];
  root.querySelector('[data-part="co2-title"]').textContent = t("co2Chart");
  root.querySelector('[data-part="co2-sub"]').textContent = valid ? t("co2Sub", { h: rec.horizonMinutes }) : "";
  root.querySelector('[data-part="co2-legend"]').innerHTML = legend(co2Series);
  lineChart(root.querySelector('[data-part="co2-chart"]'), {
    label: t("co2Chart"), unit: "ppm", series: co2Series, nowT, xMin: nowT - 3 * 3600000, xMax: valid ? nowT + rec.horizonMinutes * 60000 : nowT + 3600000,
    refs: [{ v: 800, label: t("limitLine", { v: 800 }), color: cssVar("--poor") }, { v: 750, label: t("targetLine", { v: 750 }), color: cssVar("--text-3") }], bands: meetingBands(), emptyText: t("noData"),
  });
  table(root.querySelector('[data-part="co2-table"]'), [t("time"), `${t("recommendedSeries")} (ppm)`, `${t("baselineSeries")} (ppm)`], valid ? rec.co2.forecastRecommended.map((item, index) => [dateTime(Date.parse(item.t)), item.ppm, rec.co2.forecastBaseline[index]?.ppm ?? ""]) : []);
  // Occupancy timeline.
  const history = dataset.recHistory.filter((entry) => Date.parse(entry.t) >= nowT - 6 * 3600000).map((entry) => ({ t: Date.parse(entry.t), v: entry.occupancy }));
  const forecast = rec?.occupancy?.forecast?.map((item) => ({ t: Date.parse(item.t), v: item.n })) || [];
  const occSeries = [
    // People are counted in whole numbers everywhere; the curve itself keeps the estimate's shape.
    { label: t("occupancyEstimated"), color: cssVar("--series-1"), points: history, format: (p) => number(p.v, 0) },
    { label: t("occupancyForecast"), color: cssVar("--series-1"), points: forecast, dashed: true, format: (p) => number(p.v, 0), directLabel: t("occupancyForecast") },
  ];
  root.querySelector('[data-part="occ-title"]').textContent = t("occupancyChart");
  root.querySelector('[data-part="occ-sub"]').textContent = t("occupancySub");
  root.querySelector('[data-part="occ-legend"]').innerHTML = legend(occSeries);
  lineChart(root.querySelector('[data-part="occ-chart"]'), { label: t("occupancyChart"), series: occSeries, nowT, xMin: nowT - 6 * 3600000, xMax: forecast.length ? forecast.at(-1).t : nowT + 3600000, yMin: 0, yMax: Math.max(4, ...history.map((p) => p.v), ...forecast.map((p) => p.v)), bands: meetingBands(), emptyText: t("noData") });
  table(root.querySelector('[data-part="occ-table"]'), [t("time"), t("occupancyEstimated")], [...history, ...forecast].map((p) => [dateTime(p.t), number(p.v, 0)]));
  // Recommended airflow, past 24 hours (hover shows the damper position).
  const entries = dataset.recHistory;
  const airSeries = [
    { label: t("recommendedLps"), color: cssVar("--series-1"), points: entries.map((e) => ({ t: Date.parse(e.t), v: e.recommendedLps, damper: e.damperPct })), format: (p) => `${number(p.v)} L/s · ${p.damper}%`, directLabel: t("recommendedLps") },
    { label: t("baselineLps"), color: cssVar("--series-2"), points: entries.map((e) => ({ t: Date.parse(e.t), v: e.baselineLps })), dashed: true, format: (p) => `${number(p.v)} L/s`, directLabel: t("baselineLps") },
  ];
  root.querySelector('[data-part="air-title"]').textContent = t("airflowChart");
  // The axis covers the hours that actually have recommendations, and the subtitle says how many.
  const firstT = entries.length ? Date.parse(entries[0].t) : Date.now();
  const airStart = Math.max(Date.now() - 24 * 3600000, firstT);
  const airHours = Math.max(1, Math.round((Date.now() - airStart) / 3600000));
  root.querySelector('[data-part="air-sub"]').textContent = t("airflowSubHours", { h: airHours });
  root.querySelector('[data-part="air-legend"]').innerHTML = legend(airSeries);
  lineChart(root.querySelector('[data-part="air-chart"]'), { label: t("airflowChart"), unit: "L/s", series: airSeries, xMin: airStart, xMax: Date.now(), yMin: 0, emptyText: t("noData") });
  table(root.querySelector('[data-part="air-table"]'), [t("time"), `${t("recommendedLps")} (L/s)`, "%", `${t("baselineLps")} (L/s)`], entries.map((e) => [dateTime(Date.parse(e.t)), e.recommendedLps, e.damperPct, e.baselineLps]));
}

// Savings proof (section C1): baseline and recommended operation as two curves, the shaded gap is the
// saving; totals with a range for the uncalibrated assumptions; today and this week from the bridge.
function renderEnergy() {
  const energy = recommendationState().rec?.energy;
  const review = data().aiReview?.savings;
  const host = page().querySelector('[data-part="energy"]');
  const cell = (value, unit, digits) => (energy && Number.isFinite(value) ? `<span class="tw-num">${number(value, digits)}</span> <span class="tw-unit">${unit}</span>` : `<span class="tw-unit">${escapeHtml(t("noData"))}</span>`);
  const source = energy ? ({ "hko-kings-park": t("sourceHko"), "weather-station": t("sourceStation"), assumed: t("sourceAssumed") }[energy.outdoorSource] || energy.outdoorSource) : "";
  // A week that started before the bridge's history says from which day it counts.
  const since = energy?.coveredSince ? Date.parse(energy.coveredSince) : NaN;
  const partial = Number.isFinite(since) && energy.weekStart && since - Date.parse(energy.weekStart) > 12 * 3600000;
  const weekLabel = partial ? t("weekSince", { day: weekdayName(since) }) : t("week");
  const totals = review?.totals;
  const headline = totals && totals.baselineKwh > 0 ? `
    <div class="tw-proof-head">
      <div><small>${escapeHtml(t("proofSaved", { d: review.days.length || 7 }))}</small><strong><span class="tw-num">${number(totals.savedKwh, 1)}</span><span class="tw-unit">kWh</span></strong>
        <span>${escapeHtml(t("proofRange", { low: number(totals.savedKwhLow, 1), high: number(totals.savedKwhHigh, 1) }))}</span></div>
      <div><small>${escapeHtml(t("proofShare"))}</small><strong><span class="tw-num">${totals.savedSharePct ?? ""}</span><span class="tw-unit">%</span></strong><span>${escapeHtml(t("proofOfBaseline", { v: number(totals.baselineKwh, 1) }))}</span></div>
      <div><small>${escapeHtml(t("proofCarbon"))}</small><strong><span class="tw-num">${number(totals.savedKwh * SITE.carbonKgPerKwh, 1)}</span><span class="tw-unit">kg CO₂e</span></strong><span>${escapeHtml(t("proofCarbonBasis", { f: SITE.carbonKgPerKwh }))}</span></div>
    </div>
    <div class="tw-chart" style="height:180px" data-part="proof-chart"></div>` : `<p class="tw-caption">${escapeHtml(t(review ? "proofNoHours" : "loading"))}</p>`;
  host.innerHTML = `<header><div><h2>${escapeHtml(t("energySaved"))}</h2><p>${energy ? escapeHtml(t("energySub", { source, cop: energy.plantCop })) : ""}</p></div>
      <span class="tw-h3-actions"><button type="button" class="tw-button tw-button-small" data-action="savings-csv">${icon("ph-download-simple")}<span>CSV</span></button><button type="button" class="tw-button tw-button-small" data-action="report">${icon("ph-printer")}<span>${escapeHtml(t("weeklyReport"))}</span></button></span></header>
    ${headline}
    <table class="tw-energy"><thead><tr><th></th><th>${escapeHtml(t("today"))}</th><th>${escapeHtml(weekLabel)}</th></tr></thead><tbody>
      <tr><th>${escapeHtml(t("savedAir"))}</th><td>${cell(energy?.savedTodayM3, "m³", 0)}</td><td>${cell(energy?.savedWeekM3, "m³", 0)}</td></tr>
      <tr><th>${escapeHtml(t("savedCooling"))}</th><td>${cell(energy?.savedTodayKwhCooling, "kWh", 1)}</td><td>${cell(energy?.savedWeekKwhCooling, "kWh", 1)}</td></tr>
      <tr><th>${term("power", t("savedElectric"))}</th><td>${cell(energy?.savedTodayKwhElectric, "kWh", 2)}</td><td>${cell(energy?.savedWeekKwhElectric, "kWh", 2)}</td></tr>
    </tbody></table>
    <details class="tw-table-view"><summary>${escapeHtml(t("proofMethodTitle"))}</summary><p class="tw-caption">${escapeHtml(t("proofMethod", { pct: review?.assumptions?.baselineDamperPct ?? 30, cop: review?.assumptions?.plantCop ?? 4.5 }))}</p></details>`;
  host.querySelector('[data-action="savings-csv"]').addEventListener("click", () => exportSavingsCsv());
  host.querySelector('[data-action="report"]').addEventListener("click", () => void printWeeklyReport());
  const chart = host.querySelector('[data-part="proof-chart"]');
  if (chart) {
    const toPoints = (key) => review.hours.map((h) => ({ t: Date.parse(h.t), v: h[key] }));
    lineChart(chart, {
      label: t("energySaved"), unit: "kWh", yMin: 0, rightMargin: 10,
      series: [
        { label: t("baselineSeries"), color: cssVar("--series-2"), points: toPoints("baselineKwh"), dashed: true, gapMs: 70 * 60000, digits: 2 },
        { label: t("recommendedSeries"), color: cssVar("--series-1"), points: toPoints("recommendedKwh"), gapMs: 70 * 60000, digits: 2 },
      ],
      fillBetween: { from: 0, to: 1, color: cssVar("--good"), gapMs: 70 * 60000 },
    });
  }
}

// Forecast review (section C2): what the model predicted an hour ahead against what was measured.
function renderReview() {
  const review = data().aiReview?.forecast;
  const host = page().querySelector('[data-part="review"]');
  const stat = (label, value) => `<div><small>${escapeHtml(label)}</small><strong class="tw-num">${escapeHtml(value)}</strong></div>`;
  const ppm = (value, signed = false) => (value === null || value === undefined ? "" : `${signed && value > 0 ? "+" : ""}${value} ppm`);
  host.innerHTML = `<header><div><h2>${escapeHtml(t("reviewTitle"))}</h2><p>${escapeHtml(t("reviewSub", { h: review?.hours ?? 24 }))}</p></div></header>
    ${review ? `<div class="tw-today-grid">${stat(t("reviewMae60"), ppm(review.mae60))}${stat(t("reviewMae30"), ppm(review.mae30))}${stat(t("reviewBias"), ppm(review.bias60, true))}</div>
      <div class="tw-chart" style="height:180px" data-part="review-chart"></div>
      <p class="tw-caption">${escapeHtml(t("reviewNote", { n: review.samples60 }))}</p>` : `<p class="tw-caption">${escapeHtml(t("loading"))}</p>`}`;
  const chart = host.querySelector('[data-part="review-chart"]');
  if (chart) {
    const points = review.points.map((p) => ({ t: Date.parse(p.t), actual: p.actual, predicted: p.predicted }));
    const series = [
      { label: t("measured"), color: cssVar("--series-3"), points: points.map((p) => ({ t: p.t, v: p.actual })), gapMs: 25 * 60000 },
      { label: t("reviewPredicted"), color: cssVar("--series-1"), points: points.map((p) => ({ t: p.t, v: p.predicted })), dashed: true, gapMs: 25 * 60000 },
    ];
    lineChart(chart, { label: t("reviewTitle"), unit: "ppm", series, minSpan: 40, rightMargin: 10, emptyText: t("reviewEmpty") });
  }
}

function renderCalendar() {
  const host = page().querySelector('[data-part="calendar"]');
  const meetings = data().meetings.filter((meeting) => Date.parse(meeting.end) > Date.now() - 86400000);
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const unlocked = controlUnlocked();
  if (!host.dataset.built || host.dataset.lang !== getLang() || host.dataset.unlocked !== String(unlocked)) {
    host.dataset.built = "1";
    host.dataset.lang = getLang();
    host.dataset.unlocked = String(unlocked);
    host.innerHTML = `<header><div><h2>${escapeHtml(t("calendar"))}</h2><p>${escapeHtml(t("calendarSub"))}</p></div></header>
      <p class="tw-caption" data-part="calendar-locked" ${unlocked ? "hidden" : ""}>${escapeHtml(t("calendarLocked"))} <button type="button" class="tw-link" data-action="unlock">${icon("ph-lock-key")}${escapeHtml(t("login"))}</button></p>
      <form class="tw-calendar-form" ${unlocked ? "" : "hidden"}>
        <label><span>${escapeHtml(t("meetingTitle"))}</span><input name="title" maxlength="80" placeholder="${escapeHtml(t("meetingPlaceholder"))}"></label>
        <label><span>${escapeHtml(t("date"))}</span><input name="date" type="date" required value="${today}"></label>
        <label><span>${escapeHtml(t("start"))}</span><input name="start" type="time" step="300" required></label>
        <label><span>${escapeHtml(t("end"))}</span><input name="end" type="time" step="300" required></label>
        <label><span>${escapeHtml(t("expectedPeople"))}</span><input name="people" type="number" min="1" max="10" value="8" required></label>
        <button type="submit" class="tw-button tw-button-primary">${escapeHtml(t("add"))}</button>
      </form>
      <p class="tw-caption" data-part="calendar-status" role="status"></p>
      <ul class="tw-meetings" data-part="meetings"></ul>`;
    host.querySelector('[data-action="unlock"]').addEventListener("click", async () => { await unlockControl(); renderCalendar(); });
    const form = host.querySelector("form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = host.querySelector('[data-part="calendar-status"]');
      const start = new Date(`${form.date.value}T${form.start.value}:00+08:00`);
      const end = new Date(`${form.date.value}T${form.end.value}:00+08:00`);
      if (!(end > start)) { status.className = "tw-caption is-error"; status.textContent = t("invalidTime"); return; }
      const result = await provider().writeRequest({ type: "calendar-update", action: "upsert", meeting: { title: form.title.value.trim(), start: start.toISOString(), end: end.toISOString(), people: Number(form.people.value) } });
      if (!result) return;
      status.className = `tw-caption ${result.ok ? "is-success" : "is-error"}`;
      status.textContent = result.ok ? t("saved") : result.error || "Error";
    });
  }
  const list = host.querySelector('[data-part="meetings"]');
  list.innerHTML = meetings.length ? meetings.map((meeting) => `<li class="${Date.parse(meeting.end) <= Date.now() ? "is-past" : ""}"><span>${escapeHtml(`${dateTime(Date.parse(meeting.start))}–${clockTime(Date.parse(meeting.end))} · ${meeting.title || t("meetingDefault")} · ${meeting.people} ${getLang() === "en" ? "people" : "人"}`)}</span>${unlocked ? `<button type="button" class="tw-icon-button" data-delete="${escapeHtml(meeting.id)}" aria-label="${escapeHtml(t("deleteMeeting"))}" title="${escapeHtml(t("deleteMeeting"))}">${icon("ph-trash")}</button>` : ""}</li>`).join("")
    : `<li>${escapeHtml(t("noMeetings"))}</li>`;
  list.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
    const result = await provider().writeRequest({ type: "calendar-update", action: "delete", meeting: { id: button.dataset.delete } });
    const status = host.querySelector('[data-part="calendar-status"]');
    if (result) { status.className = `tw-caption ${result.ok ? "is-success" : "is-error"}`; status.textContent = result.ok ? t("saved") : result.error || "Error"; }
  }));
}

function renderBasis() {
  const { rec, valid } = recommendationState();
  const host = page().querySelector('[data-part="basis"]');
  if (!rec || !valid) { host.innerHTML = `<header><div><h2>${escapeHtml(t("basis"))}</h2></div></header><p class="tw-caption">${escapeHtml(t("noData"))}</p>`; return; }
  // The templates are local; bridge values are coerced to numbers before insertion.
  const n = Number;
  const safe = { horizonMinutes: n(rec.horizonMinutes), co2: { target: n(rec.co2.target), limit: n(rec.co2.limit), peakBaseline: n(rec.co2.peakBaseline) },
    airflow: { minLps: n(rec.airflow.minLps), maxLps: n(rec.airflow.maxLps), recommendedLps: n(rec.airflow.recommendedLps), recommendedDamperPct: n(rec.airflow.recommendedDamperPct), baselineDamperPct: n(rec.airflow.baselineDamperPct), baselineLps: n(rec.airflow.baselineLps) },
    ahu: { assumedDamperPct: n(rec.ahu?.assumedDamperPct ?? rec.airflow.baselineDamperPct), assumedLps: n(rec.ahu?.assumedLps ?? rec.airflow.baselineLps), offLps: n(rec.ahu?.offLps ?? 0),
      hours: escapeHtml(ahuHours(rec.ahu?.schedule) || "—"), source: rec.ahu?.source === "bms" ? "bms" : "inferred" } };
  host.innerHTML = `<header><div><h2>${escapeHtml(t("basis"))}</h2></div></header><ul class="tw-basis">${t("basisItems", safe).map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

// Internal mode only: shadow-mode record and control levels L0 / L1 / L2.
function renderInternal() {
  const host = page().querySelector('[data-part="internal"]');
  host.hidden = !settings.internal;
  if (!settings.internal) return;
  const { rec } = recommendationState();
  const internal = rec?.internal;
  const stat = (label, value) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  const items = internal ? [
    stat(t("statCommand"), internal.shadow.commandPct === null ? "" : `${internal.shadow.commandPct}%`),
    stat(t("statShadowPpm"), internal.shadow.ppm === null ? "" : `${internal.shadow.ppm} ppm`),
    stat(t("statExceed"), internal.shadow.shadowExceedances), stat(t("statSteps"), internal.shadow.steps), stat(t("statGuards"), internal.shadow.guardActivations),
    stat(t("statRmse30"), internal.forecastAccuracy.rmse30 === null ? `n=${internal.forecastAccuracy.samples30}` : `${internal.forecastAccuracy.rmse30} ppm (n=${internal.forecastAccuracy.samples30})`),
    stat(t("statRmse60"), internal.forecastAccuracy.rmse60 === null ? `n=${internal.forecastAccuracy.samples60}` : `${internal.forecastAccuracy.rmse60} ppm (n=${internal.forecastAccuracy.samples60})`),
    stat(t("statSource"), { co2: t("sourceCo2"), vs341: t("sourceVs341") }[internal.occupancySource] || internal.occupancySource),
    stat(t("statCalibrated"), internal.calibratedAt ? dateTime(Date.parse(internal.calibratedAt)) : ""),
  ].join("") : "";
  const mode = rec?.controlMode;
  const connected = data().kind === "demo" || data().connection.connected;
  host.innerHTML = `<header><div><h2>${escapeHtml(t("internal"))}</h2></div></header><dl class="tw-stats">${items}</dl>
    <div class="tw-toolbar" style="margin-top:12px"><span class="tw-caption" style="margin:0">${escapeHtml(t("controlLevel"))}</span>
      <div class="tw-seg" role="group">${["L0", "L1", "L2"].map((level) => `<button type="button" data-mode="${level}" aria-pressed="${mode === level}" title="${escapeHtml(modeName(level))}" ${!connected || (level === "L2" && !internal?.l2Available) ? "disabled" : ""}>${level}</button>`).join("")}</div>
      <button type="button" class="tw-button tw-button-danger tw-button-small" data-action="exit-auto" ${mode !== "L2" ? "disabled" : ""}>${escapeHtml(t("exitAuto"))}</button></div>
    <p class="tw-caption" data-part="control-status" role="status"></p><p class="tw-caption">${escapeHtml(t("l2Note"))}</p>`;
  const status = host.querySelector('[data-part="control-status"]');
  const send = async (mode) => {
    const result = await provider().writeRequest({ type: "control-mode-request", mode });
    if (result) { status.className = `tw-caption ${result.ok ? "is-success" : "is-error"}`; status.textContent = result.ok ? t("saved") : result.error || "Error"; }
  };
  host.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => send(button.dataset.mode)));
  host.querySelector('[data-action="exit-auto"]').addEventListener("click", () => send("L1"));
}

export function renderAiPage() {
  if (page().hidden) return;
  if (!built) build();
  renderSummary();
  renderControl();
  renderCharts();
  renderEnergy();
  renderReview();
  renderCalendar();
  renderBasis();
  renderInternal();
}

// The card grows into the full page (shared-element View Transition) and shrinks back on close.
export function openAiPage() {
  const card = document.getElementById("ai-card");
  const show = () => {
    card.style.viewTransitionName = "none";
    page().hidden = false;
    page().style.viewTransitionName = "ai-surface";
    renderAiPage();
    updateViewInset();
    page().querySelector('[data-action="close"]')?.focus({ preventScroll: true });
  };
  provider().requestRecommendationHistory(24);
  provider().requestAiReview?.(7, 24);
  if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(show).ready.catch(() => {}); // a quick second tap skips the transition
  else show();
}

export function closeAiPage() {
  if (page().hidden) return;
  const card = document.getElementById("ai-card");
  const hide = () => {
    page().hidden = true;
    updateViewInset();
    page().style.viewTransitionName = "none";
    card.style.viewTransitionName = "";
  };
  if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !card.hidden) document.startViewTransition(hide).ready.catch(() => {});
  else hide();
}

export function initAiPage() {
  on("data", (event) => { if (!page().hidden && (!event || ["recommendation", "rec-history", "ai-review", "calendar", "connection", "dataset", "control-mode", "control"].includes(event.kind))) renderAiPage(); });
  on("settings", () => { if (!page().hidden) { built = false; renderAiPage(); } });
  window.addEventListener("resize", () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { if (!page().hidden) renderCharts(); }); });
}

export { ui };
