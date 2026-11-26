// Energy schedule (Energy theme): today's plan for every energy system in the room on one 24-hour
// timeline (air-conditioning AHU, AI fresh air, lighting, socket power and meetings) with a "now"
// line and each system's live state beside it.
//   AHU hours and the fresh-air plan come from the strategy service's recommendation; lighting and
//   socket hours from SITE.energySchedule; socket state from the sockets' own reports in InfluxDB.
import { t, clockTime } from "../i18n.js";
import { SITE, hongKongParts } from "../config/site.js";
import { data } from "../data/store.js";
import { recommendationState, socketDevices, socketInfo } from "../data/derived.js";
import { escapeHtml, icon } from "./dom.js";

const DAY = 86400000;
const hkDayStart = (ms) => Math.floor((ms + 8 * 3600000) / DAY) * DAY - 8 * 3600000;
const minutesOf = (text) => { const [h, m] = text.split(":").map(Number); return h * 60 + m; };

// "08:00"–"18:00" windows of a weekday/weekend schedule for the given Hong Kong day.
function windowsFor(schedule, dayStart) {
  const weekday = SITE.workDays.includes(hongKongParts(dayStart + 12 * 3600000).day);
  return (schedule?.[weekday ? "weekday" : "weekend"] || []).map(([from, to]) => [dayStart + minutesOf(from) * 60000, dayStart + minutesOf(to) * 60000]);
}
const inWindows = (windows, ms) => windows.some(([a, b]) => ms >= a && ms < b);

// One bar on the track, split at "now" so the part already past is quieter.
function bars(from, to, dayStart, now, { kind = "on", strength = 1, title = "" } = {}) {
  const clip = (ms) => Math.min(dayStart + DAY, Math.max(dayStart, ms));
  const a = clip(from);
  const b = clip(to);
  if (b <= a) return "";
  const pieces = now > a && now < b ? [[a, now, true], [now, b, false]] : [[a, b, b <= now]];
  return pieces.map(([x, y, past]) => `<i class="tw-sched-bar is-${kind}${past ? " is-past" : ""}" style="left:${(((x - dayStart) / DAY) * 100).toFixed(3)}%;width:${(((y - x) / DAY) * 100).toFixed(3)}%;--strength:${strength.toFixed(2)}"${title ? ` title="${escapeHtml(title)}"` : ""}></i>`).join("");
}

function row(key, iconName, name, state, level, track) {
  return `<div class="tw-sched-row" data-row="${key}">
    <div class="tw-sched-name">${icon(iconName)}<span><strong>${escapeHtml(name)}</strong><small><i class="tw-dot" data-level="${level}"></i>${escapeHtml(state)}</small></span></div>
    <div class="tw-sched-track">${track}</div></div>`;
}

export function scheduleHtml(now = Date.now()) {
  const dayStart = hkDayStart(now);
  const { rec, stale, valid } = recommendationState();
  const live = rec && valid && !stale;
  const rows = [];

  // Air-conditioning (AHU): its operating hours, running now or not, and the next switch.
  const ahuWindows = windowsFor(rec?.ahu?.schedule || SITE.energySchedule.ahu, dayStart);
  const ahuOn = live ? Boolean(rec.ahu?.running) : inWindows(ahuWindows, now);
  const next = live ? (ahuOn ? rec.ahu?.nextStop : rec.ahu?.nextStart) : null;
  const ahuState = `${t(ahuOn ? "schedRunning" : "schedStopped")}${next && Date.parse(next) < dayStart + DAY ? ` · ${t(ahuOn ? "schedNextStop" : "schedNextStart", { time: clockTime(Date.parse(next)) })}` : ""}`;
  rows.push(row("ahu", "ph-fan", t("schedAhu"), ahuState, ahuOn ? "good" : "idle",
    ahuWindows.map(([a, b]) => bars(a, b, dayStart, now, { kind: "ahu", title: `${clockTime(a)}–${clockTime(b)}` })).join("")));

  // AI fresh air: what the AI asked for so far today (its logged recommendations) and its plan from
  // now on. Each value holds until the next change; stronger colour = more outdoor air.
  const history = (data().recHistory || []).map((entry) => ({ t: Date.parse(entry.t), lps: entry.recommendedLps }))
    .filter((item) => Number.isFinite(item.t) && Number.isFinite(item.lps) && item.t >= dayStart && item.t < now);
  const plan = live ? (rec.airflow?.plan || []).map((item) => ({ t: Date.parse(item.t), lps: item.lps })).filter((item) => Number.isFinite(item.t) && item.t >= now) : [];
  const steps = [...history, ...(live ? [{ t: now, lps: rec.airflow.recommendedLps }] : []), ...plan].sort((x, y) => x.t - y.t);
  if (steps.length) {
    const max = Math.max(1, rec?.airflow?.maxLps || 0, ...steps.map((item) => item.lps));
    const track = steps.map((item, index) => {
      const window = ahuWindows.find(([a, b]) => item.t >= a && item.t < b);
      if (!window) return "";
      const end = Math.min(steps[index + 1]?.t ?? window[1], window[1]);
      return bars(item.t, end, dayStart, now, { kind: "air", strength: 0.3 + 0.7 * Math.min(1, item.lps / max), title: t("schedPlanTip", { time: clockTime(item.t), lps: item.lps }) });
    }).join("");
    rows.push(row("air", "ph-wind", t("schedFreshAir"), live && ahuOn ? `${rec.airflow.recommendedLps} L/s` : t("schedStopped"), live && ahuOn ? "good" : "idle", track));
  }

  // Lighting: on in its scheduled hours.
  const lightWindows = windowsFor(SITE.energySchedule.lighting, dayStart);
  const lightOn = inWindows(lightWindows, now);
  rows.push(row("lighting", "ph-lightbulb", t("schedLighting"), t(lightOn ? "schedOnPlan" : "schedOffPlan"), lightOn ? "good" : "idle",
    lightWindows.map(([a, b]) => bars(a, b, dayStart, now, { kind: "light", title: `${clockTime(a)}–${clockTime(b)}` })).join("")));

  // Socket power: supplied in working hours, standby cut outside them. The state is the sockets'
  // own latest reports.
  const sockWindows = windowsFor(SITE.energySchedule.sockets, dayStart);
  const infos = socketDevices().map((device) => socketInfo(device.id)).filter((info) => info.hasData);
  const on = infos.filter((info) => info.on === true).length;
  const cut = [];
  let cursor = dayStart;
  for (const [a, b] of sockWindows) { if (a > cursor) cut.push([cursor, a]); cursor = Math.max(cursor, b); }
  if (cursor < dayStart + DAY) cut.push([cursor, dayStart + DAY]);
  rows.push(row("sockets", "ph-plug", t("schedSockets"), infos.length ? t("schedSocketsOn", { on, n: infos.length }) : "", on ? "good" : "idle",
    sockWindows.map(([a, b]) => bars(a, b, dayStart, now, { kind: "power", title: `${clockTime(a)}–${clockTime(b)}` })).join("")
    + cut.map(([a, b]) => bars(a, b, dayStart, now, { kind: "cut", title: t("schedLegendCut") })).join("")));

  // Meetings booked today: the AI plans fresh air ahead of them.
  const meetings = (data().meetings || []).map((m) => ({ a: Date.parse(m.start), b: Date.parse(m.end), title: m.title || t("meetingDefault") }))
    .filter((m) => m.b > dayStart && m.a < dayStart + DAY);
  if (meetings.length) {
    const current = meetings.find((m) => now >= m.a && now < m.b);
    rows.push(row("meetings", "ph-calendar-dots", t("schedMeetings"), current ? current.title : t("schedMeetingsCount", { n: meetings.length }), current ? "good" : "idle",
      meetings.map((m) => bars(m.a, m.b, dayStart, now, { kind: "meet", title: `${clockTime(m.a)}–${clockTime(m.b)} · ${m.title}` })).join("")));
  }

  const nowFraction = Math.min(1, Math.max(0, (now - dayStart) / DAY));
  const ticks = [0, 6, 12, 18, 24].map((h) => `<span style="left:${(h / 24) * 100}%">${String(h).padStart(2, "0")}</span>`).join("");
  return `<div class="tw-sched" style="--now:${nowFraction.toFixed(4)}">
      ${rows.join("")}
      <div class="tw-sched-row tw-sched-axis-row"><div></div><div class="tw-sched-axis">${ticks}</div></div>
      <span class="tw-sched-now" aria-hidden="true"><b>${escapeHtml(clockTime(now))}</b></span>
    </div>
    <p class="tw-sched-legend"><span><i class="is-ahu"></i>${escapeHtml(t("schedLegendOn"))}</span><span><i class="is-cut"></i>${escapeHtml(t("schedLegendCut"))}</span><span><i class="is-now"></i>${escapeHtml(t("schedNow"))}</span></p>`;
}
