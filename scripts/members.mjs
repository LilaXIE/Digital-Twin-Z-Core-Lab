// Members and visitors (Phase D1). Visitors see the room; members log in with their own access key
// and may switch sockets, edit meetings, change the control mode and leave notes. The bridge checks
// every write on the server, records it in the audit log, and keeps meeting titles from visitors.
//
// ZB202_MEMBER_KEYS="alice:key-one,bob:key-two" names each member; the older single
// ZB202_BRIDGE_WRITE_KEY still works and logs in as "lab".
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const digest = (value) => createHash("sha256").update(String(value ?? "")).digest();

export function parseMembers(env = process.env) {
  const members = [];
  for (const pair of String(env.ZB202_MEMBER_KEYS || "").split(",")) {
    const index = pair.indexOf(":");
    if (index < 1) continue;
    const name = pair.slice(0, index).trim();
    const key = pair.slice(index + 1).trim();
    if (name && key) members.push({ name, digest: digest(key) });
  }
  if (env.ZB202_BRIDGE_WRITE_KEY) members.push({ name: "lab", digest: digest(env.ZB202_BRIDGE_WRITE_KEY) });
  return members;
}

const b64 = (value) => Buffer.from(value).toString("base64url");

export function createMemberAuth({ members = [], secret = randomBytes(32), ttlMs = 12 * 3600000, now = () => Date.now() } = {}) {
  const sign = (payload) => createHmac("sha256", secret).update(payload).digest("base64url");
  return {
    hasMembers: members.length > 0,
    // The member whose key this is, or null. Every key is compared so timing does not reveal which one matched.
    memberForKey(key) {
      const candidate = digest(key);
      let found = null;
      for (const member of members) if (timingSafeEqual(candidate, member.digest) && !found) found = member.name;
      return found;
    },
    login(key) {
      const name = this.memberForKey(key);
      if (!name) return null;
      const expiresAt = now() + ttlMs;
      const payload = b64(JSON.stringify({ name, exp: expiresAt }));
      return { name, expiresAt: new Date(expiresAt).toISOString(), token: `${payload}.${sign(payload)}` };
    },
    // A token from login(), while it has not expired and its member still exists.
    verify(token) {
      const [payload, signature] = String(token || "").split(".");
      if (!payload || !signature) return null;
      const expected = Buffer.from(sign(payload));
      const given = Buffer.from(signature);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      try {
        const { name, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
        return exp > now() && members.some((member) => member.name === name) ? name : null;
      } catch { return null; }
    },
  };
}

// What a visitor may see of a message: meeting titles are private to members.
export function forVisitor(message) {
  if (message?.type === "calendar") return { ...message, meetings: (message.meetings || []).map((meeting) => ({ ...meeting, title: "" })) };
  if (message?.type === "recommendation") {
    const strip = (meeting) => (meeting ? { ...meeting, title: "" } : meeting);
    const params = message.reasonCode?.params;
    return {
      ...message,
      calendar: (message.calendar || []).map(strip),
      meeting: strip(message.meeting),
      reasonCode: params && "title" in params ? { ...message.reasonCode, params: { ...params, title: "" } } : message.reasonCode,
      // The legacy sentences may contain a title; visitors' pages word the reason from reasonCode.
      ...(message.meeting ? { reason: "", reasonEn: "" } : {}),
    };
  }
  return message;
}
