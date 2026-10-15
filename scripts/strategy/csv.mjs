// Reads simple "time,value[,value…]" CSV files (people logs, BMS exports). Times without an
// offset are treated as Hong Kong local time.
import { readFile } from "node:fs/promises";

export function parseTime(text) {
  const value = String(text || "").trim().replace(/^"|"$/g, "");
  if (!value) return NaN;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(value)) return Date.parse(value);
  const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return NaN;
  const [, y, mo, d, h, mi, s = "0"] = match;
  return Date.UTC(+y, +mo - 1, +d, +h - 8, +mi, +s);
}

// Returns [{ t, values: { column: number } }] sorted by time.
export async function readTimeSeriesCsv(file) {
  const lines = (await readFile(file, "utf8")).replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  const header = lines.shift().split(",").map((name) => name.trim());
  const rows = [];
  for (const line of lines) {
    const fields = line.split(",");
    const t = parseTime(fields[0]);
    if (!Number.isFinite(t)) continue;
    const values = {};
    header.slice(1).forEach((name, index) => {
      const value = Number(fields[index + 1]);
      if (Number.isFinite(value)) values[name] = value;
    });
    rows.push({ t, values });
  }
  return rows.sort((a, b) => a.t - b.t);
}

// Value of `column` in effect at tMs (step interpolation), or null.
export function valueAt(rows, column, tMs) {
  let result = null;
  for (const row of rows) {
    if (row.t > tMs) break;
    if (column in row.values) result = row.values[column];
  }
  return result;
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else { args[key] = next; i += 1; }
  }
  return args;
}
