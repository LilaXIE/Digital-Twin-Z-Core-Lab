// Meeting calendar stored in data/strategy/calendar.json and edited from the page.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_MEETINGS = 500;

export function validateMeeting(input, maxOccupancy = 10) {
  if (!input || typeof input !== "object") throw new Error("Meeting is required");
  const start = Date.parse(input.start);
  const end = Date.parse(input.end);
  const people = Number(input.people);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Invalid meeting time");
  if (end <= start || end - start > 12 * 3600000) throw new Error("Meeting must end after it starts and last at most 12 hours");
  if (!Number.isInteger(people) || people < 1 || people > maxOccupancy) throw new Error(`Expected people must be 1–${maxOccupancy}`);
  const title = String(input.title || "").trim().slice(0, 80);
  const id = /^[a-zA-Z0-9-]{1,64}$/.test(String(input.id || "")) ? String(input.id) : randomUUID();
  return { id, title, start: new Date(start).toISOString(), end: new Date(end).toISOString(), people };
}

export class Calendar {
  constructor(file, { maxOccupancy = 10 } = {}) {
    this.file = file;
    this.maxOccupancy = maxOccupancy;
    this.meetings = [];
  }

  async load() {
    try {
      const data = JSON.parse(await readFile(this.file, "utf8"));
      this.meetings = (data.meetings || []).flatMap((meeting) => {
        try { return [validateMeeting(meeting, this.maxOccupancy)]; } catch { return []; }
      });
    } catch (error) {
      if (error.code !== "ENOENT") console.warn(`[Strategy] Calendar unreadable: ${error.message}`);
      this.meetings = [];
    }
    return this.meetings;
  }

  async save() {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ meetings: this.meetings }, null, 2)}\n`);
    await rename(temporary, this.file);
  }

  // message: { action: "upsert" | "delete", meeting }
  async apply(message) {
    if (message.action === "delete") {
      const id = String(message.meeting?.id || message.id || "");
      const before = this.meetings.length;
      this.meetings = this.meetings.filter((meeting) => meeting.id !== id);
      if (this.meetings.length === before) throw new Error("Meeting not found");
    } else if (message.action === "upsert") {
      const meeting = validateMeeting(message.meeting, this.maxOccupancy);
      const index = this.meetings.findIndex((item) => item.id === meeting.id);
      if (index >= 0) this.meetings[index] = meeting;
      else if (this.meetings.length >= MAX_MEETINGS) throw new Error("Calendar is full");
      else this.meetings.push(meeting);
    } else {
      throw new Error("Unsupported calendar action");
    }
    // Drop meetings that ended more than 30 days ago.
    const cutoff = Date.now() - 30 * 86400000;
    this.meetings = this.meetings.filter((meeting) => Date.parse(meeting.end) > cutoff).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    await this.save();
    return this.meetings;
  }
}
