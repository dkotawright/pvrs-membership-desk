// Calendar feed (Nov 20): a private .ics link the owner subscribes to in Apple or Google Calendar.
// GET https://us-central1-pvrs-membership.cloudfunctions.net/cal-feed?k=<token>
// The token lives in calFeed/main (owner-only in the rules; made in Settings → Calendar feed). Wrong or missing
// token, or the feed turned off: 404 and nothing else. The feed carries booked interview and orientation times with
// the person's INITIALS only (Dkota's choice): no names, emails, phone numbers, results or notes.
// Deploy on its own: firebase deploy --only functions:cal
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");

if (!getApps().length) initializeApp();
const DAY = 864e5;

const initialsOf = name => { const w = String(name || "").trim().split(/\s+/).filter(Boolean); return w.length ? (w.map(x => x[0].toUpperCase()).filter(c => /[A-Z]/.test(c)).slice(0, 3).join(".") + ".") : "?"; };
const icsEsc = s => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const sameToken = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); };

// Pure: slots + names → calendar text (tested in tests/push.test.cjs).
function buildFeed({ slots = [], oslots = [], names = new Map(), now = Date.now() }){
  const ev = [];
  const add = (s, kind) => { if (!s.bookedBy || !s.start || s.start < now - 30 * DAY || s.start > now + 180 * DAY) return;
    const mins = +s.duration > 0 ? +s.duration : kind === "or" ? 60 : 30;
    ev.push(["BEGIN:VEVENT", `UID:${kind}-${s.id}@pvrs-membership`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(s.start)}`, `DTEND:${stamp(s.start + mins * 6e4)}`,
      `SUMMARY:${icsEsc(`${kind === "or" ? "Orientation" : "Interview"}: ${initialsOf(names.get(s.bookedBy))}`)}`, ...(s.location ? [`LOCATION:${icsEsc(s.location)}`] : []), "END:VEVENT"].join("\r\n")); };
  slots.forEach(s => add(s, "iv")); oslots.forEach(s => add(s, "or"));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PVRS//Membership Desk//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:PVRS interviews and orientation", "X-PUBLISHED-TTL:PT1H", ...ev, "END:VCALENDAR", ""].join("\r\n");
}

const feed = onRequest({ invoker: "public", maxInstances: 2, cors: false }, async (req, res) => {
  res.set("Cache-Control", "private, max-age=300");
  if (req.method !== "GET") { res.status(405).send(""); return; }
  const db = getFirestore();
  const cfg = await db.doc("calFeed/main").get();
  if (!cfg.exists || !cfg.data().on || !sameToken(req.query.k, cfg.data().token)) { res.status(404).send("Not found"); return; }
  const [sl, os, apps] = await Promise.all([db.collection("slots").get(), db.collection("orientSlots").get(), db.collection("applicants").get()]);
  const names = new Map(apps.docs.map(d => [d.id, d.data().name || ""]));
  res.set("Content-Type", "text/calendar; charset=utf-8");
  res.send(buildFeed({ slots: sl.docs.map(d => ({ id: d.id, ...d.data() })), oslots: os.docs.map(d => ({ id: d.id, ...d.data() })), names }));
});

module.exports = { feed, buildFeed, initialsOf };
