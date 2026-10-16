// Start-up timing: performance marks from opening the page to the room on screen. With
// ?mode=internal a table of the marks is printed once the intro has finished; otherwise nothing is
// printed (the marks stay in the Performance panel for DevTools).
const PREFIX = "tw:";

export function mark(name) {
  try { performance.mark(PREFIX + name); } catch { /* marks are optional */ }
}

export function reportTimings(print) {
  if (!print) return;
  const marks = performance.getEntriesByType("mark").filter((entry) => entry.name.startsWith(PREFIX));
  let previous = 0;
  console.table(marks.map((entry) => {
    const row = { step: entry.name.slice(PREFIX.length), "ms since navigation": Math.round(entry.startTime), "ms since previous": Math.round(entry.startTime - previous) };
    previous = entry.startTime;
    return row;
  }));
}
