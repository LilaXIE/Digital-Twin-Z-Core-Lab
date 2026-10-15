// One chart component for every trend in the app: environment timeline, sensor trends, energy,
// and the AI page. History, AI forecast, limit lines, "now" line, meeting bands, replay cursor.
// Data gaps stay gaps. Hover (or press and drag on touch) to read exact times and values.
import { escapeHtml } from "../dom.js";
import { t, dateTime, clockTime, locale } from "../../i18n.js";

const tip = () => document.getElementById("chart-tip");

function niceStep(raw) {
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= raw) ?? 10 * power;
}

const fmt = (value, digits) => value.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits });

function segments(points, gapMs) {
  const result = [];
  let current = [];
  for (const point of points) {
    if (!Number.isFinite(point.v) || (gapMs && current.length && point.t - current.at(-1).t > gapMs)) {
      if (current.length) result.push(current);
      current = [];
      if (!Number.isFinite(point.v)) continue;
    }
    current.push(point);
  }
  if (current.length) result.push(current);
  return result;
}

export function lineChart(container, spec) {
  const width = Math.max(240, container.clientWidth || 320);
  const height = container.clientHeight || 160;
  const margin = { top: 10, right: spec.rightMargin ?? (spec.series.some((s) => s.directLabel) || spec.refs?.length ? 70 : 10), bottom: 22, left: 38 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const all = spec.series.flatMap((series) => series.points.filter((point) => Number.isFinite(point.v)));
  if (!all.length) {
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(spec.label || "")}"><text class="empty" x="${width / 2}" y="${height / 2}" text-anchor="middle">${escapeHtml(spec.emptyText || t("noRecords"))}</text></svg>`;
    return;
  }
  const xMin = spec.xMin ?? Math.min(...all.map((p) => p.t));
  const xMax = spec.xMax ?? Math.max(...all.map((p) => p.t));
  const values = [...all.map((p) => p.v), ...(spec.refs || []).filter((ref) => ref.include !== false).map((ref) => ref.v)];
  let yMin = spec.yMin ?? Math.min(...values);
  let yMax = spec.yMax ?? Math.max(...values);
  if (spec.minSpan && yMax - yMin < spec.minSpan) { const mid = (yMax + yMin) / 2; yMin = mid - spec.minSpan / 2; yMax = mid + spec.minSpan / 2; }
  const step = niceStep((yMax - yMin) / 4 || 1);
  yMin = Math.floor(yMin / step) * step;
  yMax = Math.ceil(yMax / step) * step;
  if (yMax === yMin) yMax = yMin + step;
  const digits = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
  const x = (time) => margin.left + ((time - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (value) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * plotH;

  const ticksY = [];
  for (let value = yMin; value <= yMax + 1e-9; value += step) ticksY.push(value);
  const hour = 3600000;
  const span = (xMax - xMin) / hour;
  const xStep = span > 72 ? 24 * hour : span > 18 ? 6 * hour : span > 8 ? 2 * hour : span > 3 ? hour : 30 * 60000;
  const ticksX = [];
  // Align ticks to Hong Kong time.
  const hk = 8 * hour;
  for (let tick = Math.ceil((xMin + hk) / xStep) * xStep - hk; tick <= xMax; tick += xStep) ticksX.push(tick);
  const tickLabel = (tick) => (xStep >= 24 * hour ? new Date(tick).toLocaleDateString(locale(), { month: "numeric", day: "numeric", timeZone: "Asia/Hong_Kong" }) : clockTime(tick));

  const parts = [];
  for (const band of spec.bands || []) {
    const from = Math.max(xMin, band.from);
    const to = Math.min(xMax, band.to);
    if (to <= from) continue;
    parts.push(`<rect class="band" x="${x(from)}" y="${margin.top}" width="${x(to) - x(from)}" height="${plotH}"></rect><text class="band-label" x="${x(from) + 4}" y="${margin.top + 11}">${escapeHtml(band.label)}</text>`);
  }
  parts.push(`<g class="grid">${ticksY.map((v) => `<line x1="${margin.left}" x2="${margin.left + plotW}" y1="${y(v)}" y2="${y(v)}"></line>`).join("")}</g>`);
  parts.push(`<g class="axis">${ticksY.map((v) => `<text x="${margin.left - 6}" y="${y(v) + 3.5}" text-anchor="end">${spec.tickFormat ? escapeHtml(spec.tickFormat(v)) : fmt(v, digits)}</text>`).join("")}${ticksX.map((tick) => `<text x="${x(tick)}" y="${height - 5}" text-anchor="middle">${tickLabel(tick)}</text>`).join("")}</g>`);
  for (const ref of spec.refs || []) {
    if (ref.v < yMin || ref.v > yMax) continue;
    parts.push(`<line class="ref" x1="${margin.left}" x2="${margin.left + plotW}" y1="${y(ref.v)}" y2="${y(ref.v)}" stroke="${ref.color}"></line><text class="ref-label" x="${margin.left + plotW + 4}" y="${y(ref.v) + 3.5}" fill="${ref.color}">${escapeHtml(ref.label)}</text>`);
  }
  if (spec.nowT && spec.nowT >= xMin && spec.nowT <= xMax) {
    parts.push(`<line class="now" x1="${x(spec.nowT)}" x2="${x(spec.nowT)}" y1="${margin.top}" y2="${margin.top + plotH}"></line><text class="band-label" x="${x(spec.nowT) + 3}" y="${margin.top + plotH - 4}">${escapeHtml(t("nowLine"))}</text>`);
  }
  // fillBetween: { from, to, color } shades the gap between two series that share timestamps
  // (e.g. baseline and recommended energy: the shaded area is the saving).
  if (spec.fillBetween) {
    const upper = spec.series[spec.fillBetween.from]?.points || [];
    const lowerByT = new Map((spec.series[spec.fillBetween.to]?.points || []).map((p) => [p.t, p.v]));
    for (const piece of segments(upper.filter((p) => lowerByT.has(p.t)), spec.fillBetween.gapMs)) {
      if (piece.length < 2) continue;
      const top = piece.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`);
      // Only where the first series is above the second (a saving); where it is below, nothing is shaded.
      const bottom = [...piece].reverse().map((p) => `${x(p.t).toFixed(1)},${y(Math.min(p.v, lowerByT.get(p.t))).toFixed(1)}`);
      parts.push(`<polygon class="area" fill="${spec.fillBetween.color}" points="${[...top, ...bottom].join(" ")}"></polygon>`);
    }
  }
  const usedLabelY = [];
  for (const series of spec.series) {
    const pieces = segments(series.points, series.gapMs);
    for (const piece of pieces) {
      const d = piece.map((p, index) => {
        const px = x(p.t).toFixed(1);
        const py = y(p.v).toFixed(1);
        if (!index) return `M${px},${py}`;
        return series.step ? `H${px}V${py}` : `L${px},${py}`;
      }).join("");
      if (series.area && piece.length > 1) parts.push(`<path class="area" fill="${series.color}" d="${d}L${x(piece.at(-1).t).toFixed(1)},${margin.top + plotH}L${x(piece[0].t).toFixed(1)},${margin.top + plotH}Z"></path>`);
      parts.push(`<path class="line${series.dashed ? " dashed" : ""}" stroke="${series.color}" d="${d}"></path>`);
      if (piece.length === 1) parts.push(`<circle cx="${x(piece[0].t)}" cy="${y(piece[0].v)}" r="2.5" fill="${series.color}"></circle>`);
    }
    const last = pieces.at(-1)?.at(-1);
    if (series.directLabel && last && x(last.t) > margin.left + plotW - 3) {
      let labelY = y(last.v) + 4;
      while (usedLabelY.some((used) => Math.abs(used - labelY) < 12)) labelY += 12;
      usedLabelY.push(labelY);
      parts.push(`<text class="direct-label" x="${x(last.t) + 6}" y="${labelY}">${escapeHtml(series.directLabel)}</text>`);
    }
  }
  if (Number.isFinite(spec.cursorT) && spec.cursorT >= xMin && spec.cursorT <= xMax) {
    parts.push(`<line x1="${x(spec.cursorT)}" x2="${x(spec.cursorT)}" y1="${margin.top}" y2="${margin.top + plotH}" stroke="var(--replay)" stroke-width="2"></line>`);
  }
  parts.push(`<line class="crosshair" x1="0" x2="0" y1="${margin.top}" y2="${margin.top + plotH}" visibility="hidden"></line><g class="dots"></g>`);
  parts.push(`<rect class="hit" x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}" fill="transparent" tabindex="0" aria-label="${escapeHtml(spec.label || "")}"></rect>`);
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(spec.label || "")}">${parts.join("")}</svg>`;

  const svg = container.querySelector("svg");
  const crosshair = svg.querySelector(".crosshair");
  const dots = svg.querySelector(".dots");
  const times = [...new Set(all.map((p) => p.t))].sort((a, b) => a - b);
  const show = (clientX, clientY) => {
    const box = svg.getBoundingClientRect();
    const tAt = xMin + (((clientX - box.left) * (width / box.width) - margin.left) / plotW) * (xMax - xMin);
    let nearest = times[0];
    for (const time of times) if (Math.abs(time - tAt) < Math.abs(nearest - tAt)) nearest = time;
    crosshair.setAttribute("x1", x(nearest));
    crosshair.setAttribute("x2", x(nearest));
    crosshair.setAttribute("visibility", "visible");
    const element = tip();
    element.replaceChildren();
    const heading = document.createElement("time");
    heading.textContent = dateTime(nearest);
    element.append(heading);
    dots.innerHTML = "";
    const tolerance = (xMax - xMin) / 40;
    for (const series of spec.series) {
      let point = null;
      for (const item of series.points) if (Number.isFinite(item.v) && (!point || Math.abs(item.t - nearest) < Math.abs(point.t - nearest))) point = item;
      if (!point || Math.abs(point.t - nearest) > tolerance) continue;
      dots.insertAdjacentHTML("beforeend", `<circle cx="${x(point.t)}" cy="${y(point.v)}" r="3.5" fill="${series.color}"></circle>`);
      const row = document.createElement("div");
      const key = document.createElement("i");
      key.style.color = series.color;
      const value = document.createElement("b");
      value.textContent = series.format ? series.format(point) : `${fmt(point.v, series.digits ?? digits)} ${spec.unit || ""}`;
      const label = document.createElement("span");
      label.textContent = series.label;
      row.append(key, value, label);
      element.append(row);
    }
    element.hidden = false;
    const tipBox = element.getBoundingClientRect();
    element.style.left = `${Math.min(window.innerWidth - tipBox.width - 8, clientX + 14)}px`;
    element.style.top = `${Math.max(8, clientY - tipBox.height - 12)}px`;
  };
  const hide = () => { tip().hidden = true; crosshair.setAttribute("visibility", "hidden"); dots.innerHTML = ""; };
  const hit = svg.querySelector(".hit");
  hit.addEventListener("pointermove", (event) => { if (event.pointerType !== "touch" || hit.hasPointerCapture(event.pointerId)) show(event.clientX, event.clientY); });
  hit.addEventListener("pointerdown", (event) => { if (event.pointerType === "touch") { hit.setPointerCapture(event.pointerId); show(event.clientX, event.clientY); } });
  hit.addEventListener("pointerup", (event) => { if (event.pointerType === "touch") hide(); });
  hit.addEventListener("pointerleave", (event) => { if (event.pointerType !== "touch") hide(); });
  hit.addEventListener("focus", () => { const box = svg.getBoundingClientRect(); show(box.left + box.width * 0.85, box.top + 20); });
  hit.addEventListener("blur", hide);
}

export function legend(items) {
  return `<ul class="tw-legend">${items.map((item) => `<li><i class="${item.dashed ? "dashed" : ""}" style="color:${item.color}"></i>${escapeHtml(item.label)}</li>`).join("")}</ul>`;
}

export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Small sparkline for capsules (no axes).
export function sparkline(points, { width = 220, height = 56, limit = null } = {}) {
  const valid = points.filter((p) => Number.isFinite(p.v));
  if (valid.length < 2) return "";
  const xMin = valid[0].t;
  const xMax = valid.at(-1).t;
  const values = valid.map((p) => p.v).concat(limit !== null ? [limit] : []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.12 || 1;
  const x = (time) => ((time - xMin) / (xMax - xMin || 1)) * width;
  const y = (value) => height - ((value - (min - pad)) / (max - min + 2 * pad)) * height;
  const d = segments(valid, 45 * 60000).map((piece) => piece.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("")).join("");
  const limitLine = limit !== null && limit <= max + pad ? `<line class="tw-spark-limit" x1="0" x2="${width}" y1="${y(limit)}" y2="${y(limit)}"></line>` : "";
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${limitLine}<path class="tw-spark-line" d="${d}"></path></svg>`;
}
