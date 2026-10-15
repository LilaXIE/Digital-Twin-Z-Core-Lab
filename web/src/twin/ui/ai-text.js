// Recommendation wording. The bridge sends a reason code with parameters (scripts/strategy/recommend.mjs)
// and the page words it in the current language; older or demo messages fall back to their own text.
import { t, getLang, clockTime, locale } from "../i18n.js";

const HK_DAY = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);

// "18:00" today, "明天 08:00" tomorrow, otherwise "周一 08:00" (Hong Kong time).
export function dayTime(ms) {
  if (!Number.isFinite(ms)) return "";
  const now = Date.now();
  const time = clockTime(ms);
  if (HK_DAY(ms) === HK_DAY(now)) return time;
  if (HK_DAY(ms) === HK_DAY(now + 86400000)) return `${t("tomorrow")} ${time}`;
  const weekday = new Date(ms).toLocaleDateString(locale(), { weekday: "short", timeZone: "Asia/Hong_Kong" });
  return `${weekday} ${time}`;
}

export const weekdayName = (ms) => new Date(ms).toLocaleDateString(locale(), { weekday: "short", timeZone: "Asia/Hong_Kong" });

// "08:00–18:00" from an AHU schedule's weekday windows.
export function ahuHours(schedule) {
  return (schedule?.weekday || []).map(([start, end]) => `${start}–${end}`).join(", ");
}

export function reasonText(rec) {
  const code = rec?.reasonCode?.code;
  const p = rec?.reasonCode?.params || {};
  const name = p.title || t("meetingDefault");
  switch (code) {
    case "ahu-off": return t("rAhuOff", { when: dayTime(Date.parse(p.nextStart)) });
    case "at-max-exceed": return t("rAtMaxExceed", { at: clockTime(Date.parse(p.at)), limit: p.limit });
    case "at-max": return t("rAtMax", { target: p.target });
    case "meeting-now": return t(p.raised ? "rMeetingNowRaised" : "rMeetingNow", { name, people: p.people });
    case "meeting-upcoming": return t(p.raised ? "rMeetingSoonRaised" : "rMeetingSoon", { name, people: p.people, at: clockTime(Date.parse(p.at)) });
    case "headroom": return t("rHeadroom");
    case "raised": return t("rRaised", { people: p.people, target: p.target });
    case "no-data": return t("rNoData");
    default: return getLang() === "en" ? rec?.reasonEn || "" : rec?.reason || "";
  }
}

export const ahuOff = (rec) => rec?.ahu?.running === false;
