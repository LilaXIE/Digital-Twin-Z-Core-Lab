import test from "node:test";
import assert from "node:assert/strict";
import { createMemberAuth, forVisitor, parseMembers } from "../scripts/members.mjs";

test("members log in with their own key and get a signed, expiring token", () => {
  let nowMs = Date.parse("2026-10-16T09:00:00Z");
  const members = parseMembers({ ZB202_MEMBER_KEYS: "alice:one, bob:two", ZB202_BRIDGE_WRITE_KEY: "legacy" });
  assert.deepEqual(members.map((m) => m.name), ["alice", "bob", "lab"]);
  const auth = createMemberAuth({ members, secret: "s", ttlMs: 3600000, now: () => nowMs });
  assert.equal(auth.login("wrong"), null);
  const session = auth.login("two");
  assert.equal(session.name, "bob");
  assert.equal(auth.verify(session.token), "bob");
  assert.equal(auth.memberForKey("legacy"), "lab");
  const [payload] = session.token.split(".");
  assert.equal(auth.verify(`${payload}.forged`), null);
  nowMs += 2 * 3600000;
  assert.equal(auth.verify(session.token), null, "expired");
  assert.equal(createMemberAuth({ members: [] }).hasMembers, false);
});

test("visitors do not see meeting titles", () => {
  const meeting = { id: "m", title: "Thesis review", start: "x", end: "y", people: 6 };
  assert.equal(forVisitor({ type: "calendar", meetings: [meeting] }).meetings[0].title, "");
  const rec = forVisitor({ type: "recommendation", calendar: [meeting], meeting, reason: "Thesis review 进行中", reasonEn: "Thesis review in progress", reasonCode: { code: "meeting-now", params: { title: "Thesis review", people: 6 } } });
  assert.equal(rec.calendar[0].title, "");
  assert.equal(rec.meeting.title, "");
  assert.equal(rec.reasonCode.params.title, "");
  assert.equal(rec.reason, "");
  assert.equal(rec.meeting.people, 6);
  const telemetry = { type: "telemetry", values: { co2: 500 } };
  assert.equal(forVisitor(telemetry), telemetry);
});
