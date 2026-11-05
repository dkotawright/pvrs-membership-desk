// Notification functions (functions/push.js) against a fake Firestore + Messaging: which alerts go to whom, and what they say.
// Run: node tests/push.test.cjs   (needs `npm install` in functions/)
const path = require("path");
const Module = require("module");
const FN = path.join(__dirname, "../functions");
const docs = new Map(), sent = [];
const snap = (p) => ({ exists: docs.has(p), data: () => docs.get(p), id: p.split("/").pop() });
const fakeDb = { doc: p => ({ get: async () => snap(p), delete: async () => docs.delete(p), set: async (d, o) => docs.set(p, o && o.merge ? { ...(docs.get(p) || {}), ...d } : d) }),
  collection: c => { const all = () => [...docs.keys()].filter(k => k.startsWith(c + "/") && k.split("/").length === 2).map(snap);
    return { get: async () => ({ docs: all() }), where: (f, _op, v) => ({ get: async () => ({ docs: all().filter(x => x.data()[f] === v) }) }) }; } };
const stubs = {
  "firebase-admin/app": { initializeApp(){}, getApps: () => [1] },
  "firebase-admin/firestore": { getFirestore: () => fakeDb },
  "firebase-admin/messaging": { getMessaging: () => ({ sendEachForMulticast: async m => { sent.push(m); return { successCount: m.tokens.length, failureCount: 0, responses: m.tokens.map(() => ({ success: true })) }; } }) },
  "firebase-functions/logger": { info(){} },
  "firebase-functions/v2/firestore": { onDocumentCreated: (o, h) => h, onDocumentUpdated: (o, h) => h, onDocumentWritten: (o, h) => h },
  "firebase-functions/v2/scheduler": { onSchedule: (o, h) => h },
};
const load = Module._load;
Module._load = function(req, ...rest){ return stubs[req] || load.call(this, req, ...rest); };
const P = require(path.join(FN, "push.js"));
const errors = []; let n = 0;
const check = (cond, msg) => { n++; if (!cond) errors.push(msg); };
const ev = (data, params = {}) => ({ data: { data: () => data }, params });
const upd = (before, after, params = {}) => ({ data: { before: { data: () => before }, after: { data: () => after } }, params });
const last = () => sent[sent.length - 1];

(async () => {
  docs.set("pushTokens/ownerTok", { email: "dkota@pvrs.org" });
  docs.set("pushTokens/adminTok", { email: "admin@pvrs.org" });
  docs.set("applicants/a1", { name: "Jack Gradzewicz" });
  docs.set("staff/admin@pvrs.org", { name: "Casey Admin" });
  docs.set("refLinks/t1", { appId: "a1", applicant: "Jack Gradzewicz", refName: "Duke McCauley" });

  await P.newApplication(ev({ person: { first: "Jack", last: "Gradzewicz", dlNumber: "235105522" } }));
  check(last().notification.body === "Jack Gradzewicz applied online" && last().tokens.join() === "ownerTok", "new application: " + JSON.stringify(last()));
  check(!JSON.stringify(last()).includes("235105522"), "license number leaked");

  await P.referenceAnswered(ev({ answers: { other: "secret answer" } }, { token: "t1" }));
  check(/Duke McCauley answered for Jack Gradzewicz/.test(last().notification.body) && /open=a1/.test(last().webpush.fcmOptions.link), "reference: " + JSON.stringify(last()));
  check(!JSON.stringify(last()).includes("secret answer"), "reference answer leaked");

  let k = sent.length;
  await P.privateUpdate(upd({ pagesign: {} }, { pagesign: { checks: { done: "2026-11-03" } }, secUpdatedBy: "dkota@pvrs.org" }, { id: "a1" }));
  check(sent.length === k + 1 && last().notification.title === "Checks page complete" && /marked by you/.test(last().notification.body), "checks sign-off: " + JSON.stringify(last()));
  k = sent.length;
  await P.privateUpdate(upd({ pagesign: { checks: { done: "x" } } }, { pagesign: { checks: { done: "x" } } }, { id: "a1" }));
  check(sent.length === k, "unchanged sign-off sent again");

  await P.pageCompleteShared(upd({ signoff: {} }, { signoff: { iv: { done: "2026-11-03" } }, updatedBy: "admin@pvrs.org" }, { id: "a1" }));
  check(last().notification.title === "Interview page complete" && /Casey Admin/.test(last().notification.body), "interview sign-off: " + JSON.stringify(last()));

  const r = n => ({ name: "R" + n, returned: "2026-11-01" });
  k = sent.length;
  await P.privateUpdate(upd({ refs: { r1: r(1), r2: r(2) } }, { refs: { r1: r(1), r2: r(2), r3: r(3) } }, { id: "a1" }));
  check(sent.length === k + 1 && last().notification.title === "References complete", "references complete: " + JSON.stringify(last()));
  k = sent.length;
  await P.privateUpdate(upd({ refs: { r1: r(1), r2: r(2), r3: r(3) } }, { refs: { r1: r(1), r2: r(2), r3: r(3), r4: r(4) } }, { id: "a1" }));
  check(sent.length === k, "4th reference re-sent References complete");

  docs.set("staff/admin@pvrs.org", { name: "Casey Admin", role: "admin" });
  docs.set("pushTokens/ivTok", { email: "iv@pvrs.org" }); docs.set("pushTokens/memTok", { email: "mem@pvrs.org" });
  docs.set("applicants/a1", { name: "Jack Gradzewicz", interviewers: ["iv@pvrs.org"] });
  await P.interviewBooking(upd({ start: 1e12 }, { start: 1e12, bookedBy: "a1" }));
  check(last().notification.title === "Interview booked" && last().tokens.sort().join() === "adminTok,ivTok,ownerTok", "booking goes to owner, admins and that applicant's interviewers only: " + last().tokens);
  await P.pageCompleteShared(upd({ name: "Jack Gradzewicz", interviewers: [] }, { name: "Jack Gradzewicz", interviewers: ["iv@pvrs.org"] }, { id: "a1" }));
  check(last().notification.title === "Interview assigned" && last().tokens.join() === "ivTok" && /You're interviewing Jack/.test(last().notification.body), "assigned interviewer alerted: " + JSON.stringify(last()));

  await P.accessRequest(ev({ name: "Casey New" }, { email: "casey@pvrs.org" }));
  check(/Casey New asked for access/.test(last().notification.body) && last().tokens.join() === "ownerTok", "access request");

  // chat: channel posts go to members except the author; applicant messages to the owner + people added
  docs.set("channels/c1", { name: "interview-team", members: ["dkota@pvrs.org", "admin@pvrs.org"] });
  await P.channelPost(ev({ text: "secret plan", by: "admin@pvrs.org", name: "Casey" }, { cid: "c1", pid: "p1" }));
  check(last().tokens.join() === "ownerTok" && /Casey posted in #interview-team/.test(last().notification.body) && /chat=c%3Ac1/.test(last().webpush.fcmOptions.link), "channel post: " + JSON.stringify(last()));
  check(!JSON.stringify(last()).includes("secret plan"), "channel text leaked");
  docs.set("convos/a1", { members: ["admin@pvrs.org"] });
  await P.applicantMessage(ev({ from: "applicant", text: "hi", by: "jack@example.com" }, { id: "a1" }));
  check(last().tokens.sort().join() === "adminTok,ownerTok" && /Jack Gradzewicz sent a message/.test(last().notification.body), "applicant message to convo: " + JSON.stringify(last()));
  await P.applicantMessage(ev({ from: "staff", text: "hello", by: "dkota@pvrs.org", name: "Dkota" }, { id: "a1" }));
  check(last().tokens.join() === "adminTok" && /Dkota replied to Jack/.test(last().notification.body), "staff reply skips the author: " + JSON.stringify(last()));
  // applicants who turned on alerts: generic wording, and a decline never buzzes them
  docs.set("applicantTokens/appTok", { appId: "a1", email: "jack@example.com" });
  await P.applicantMessage(ev({ from: "staff", text: "private reply text", by: "dkota@pvrs.org", name: "Dkota" }, { id: "a1" }));
  check(last().tokens.join() === "appTok" && /new message/.test(last().notification.body) && !JSON.stringify(last()).includes("private reply text"), "applicant alert: " + JSON.stringify(last()));
  await P.portalChanged(upd({ bookingOpen: false, steps: [] }, { bookingOpen: true, steps: [] }, { id: "a1" }));
  check(last().notification.title === "Interview times are open" && last().tokens.join() === "appTok", "booking open alert");
  k = sent.length;
  const stepsA = [{ label: "Review", state: "done" }, { label: "Board review", state: "current", detail: "with the membership committee" }];
  await P.portalChanged(upd({ bookingOpen: true, steps: stepsA, docs: [] }, { bookingOpen: false, steps: stepsA.map(x => ({ ...x, detail: "you'll receive a letter" })), docs: [] }, { id: "a1" }));
  check(sent.length === k, "a decline must not send the applicant anything");
  // a time an interviewer offered: booking assigns them, cancelling un-assigns
  docs.set("applicants/a3", { name: "Sam Host", interviewers: [] }); docs.delete("convos/a3");
  await P.interviewBooking(upd({ start: 2e12, host: "iv@pvrs.org", hostName: "Ivy" }, { start: 2e12, bookedBy: "a3", host: "iv@pvrs.org", hostName: "Ivy" }));
  check((docs.get("applicants/a3").interviewers || []).join() === "iv@pvrs.org" && docs.get("convos/a3").members.join() === "iv@pvrs.org", "booking assigns the host: " + JSON.stringify(docs.get("applicants/a3")));
  await P.interviewBooking(upd({ start: 2e12, bookedBy: "a3", host: "iv@pvrs.org", hostName: "Ivy" }, { start: 2e12, host: "iv@pvrs.org", hostName: "Ivy" }));
  check((docs.get("applicants/a3").interviewers || []).length === 0 && docs.get("convos/a3").members.length === 0, "cancelling un-assigns the host");
  docs.set("applicants/a3", { name: "Sam Host", interviewers: ["iv@pvrs.org"] });
  await P.interviewBooking(upd({ start: 2e12, bookedBy: "a3", host: "iv@pvrs.org" }, { start: 2e12, host: "iv@pvrs.org" }));
  check(docs.get("applicants/a3").interviewers.join() === "iv@pvrs.org", "cancelling keeps someone the owner assigned by hand");
  // morning summary
  const { buildMorning } = require(path.join(FN, "morning.js"));
  const NOW = Date.parse("2026-11-04T12:30:00Z"), D = 864e5;
  const mm = buildMorning({ now: NOW, apps: [
    { id: "x1", name: "Jack G", interviewers: ["iv@pvrs.org"], refs: { r1: { name: "Late Ref", contacted: "2026-10-20" }, r2: { name: "Fresh Ref", contacted: "2026-11-02" }, r3: { name: "Done Ref", contacted: "2026-10-01", returned: "2026-10-05" } }, onb: { cprExpires: "2026-11-20" }, updatedAt: NOW },
    { id: "x2", name: "Old File", updatedAt: NOW - 20 * D },
    { id: "x3", name: "Declined", status: "declined", updatedAt: NOW - 20 * D, refs: { r1: { name: "R", contacted: "2026-10-01" } } } ],
    slots: [{ start: NOW + D, bookedBy: "x1", location: "Station" }, { start: NOW + D, bookedBy: "x3" }, { start: NOW + 5 * D, bookedBy: "x2" }] });
  check(mm.owner && mm.owner.body === "1 interview tomorrow · 1 reference overdue · 1 card expiring · 1 file with no movement", "morning owner: " + JSON.stringify(mm.owner));
  check(mm.interviewers.get("iv@pvrs.org").length === 1 && /Jack G at 7:30 AM · Station/.test(mm.interviewers.get("iv@pvrs.org")[0].body), "morning interviewer: " + JSON.stringify([...mm.interviewers]));
  check(mm.applicants.length === 1 && mm.applicants[0].id === "x1" && /tomorrow at 7:30 AM/.test(mm.applicants[0].body), "morning applicant: " + JSON.stringify(mm.applicants));
  check(buildMorning({ now: NOW, apps: [], slots: [] }).owner === null, "nothing to say means no morning alert");
  // orientation
  await P.portalChanged(upd({ steps: [] }, { steps: [], orientation: { total: 3, done: 0 } }, { id: "a1" }));
  check(last().notification.title === "Orientation is open" && last().tokens.join() === "appTok", "orientation open alert");
  const mo = buildMorning({ now: NOW, apps: [{ id: "o1", name: "New One", updatedAt: NOW }, { id: "o2", name: "Waiting On Sterling", updatedAt: NOW }, { id: "o3", name: "Late", updatedAt: NOW }], slots: [],
    portals: [{ id: "o1", orient: { start: NOW + D, location: "Station" }, orientation: { due: "2026-11-11", done: 1, total: 3 } }, { id: "o2", orient: { start: NOW + D } }, { id: "o3", orientation: { due: "2026-11-01", done: 0, total: 3 } }] });
  check(mo.owner && mo.owner.body === "1 orientation tomorrow · 1 behind on orientation", "morning orientation: " + JSON.stringify(mo.owner));
  check(mo.applicants.map(x => x.id + ":" + x.title).join() === "o1:Orientation tomorrow,o1:Orientation due soon", "applicant orientation reminders (nobody before Sterling): " + JSON.stringify(mo.applicants));
  k = sent.length;
  await P.signoffChanged({ data: { before: { data: () => ({ trainers: [], done: {} }) }, after: { data: () => ({ name: "New One", trainers: ["iv@pvrs.org"], items: [], done: {} }) } }, params: { id: "o1" } });
  check(last().tokens.join() === "ivTok" && /trainer for New One/.test(last().notification.body), "new trainer alert: " + JSON.stringify(last()));
  await P.signoffChanged({ data: { before: { data: () => ({ trainers: ["iv@pvrs.org"], done: {} }) }, after: { data: () => ({ name: "New One", trainers: ["iv@pvrs.org"], items: [{ key: "rig", label: "Rig walkthrough" }], done: { rig: { by: "iv@pvrs.org", name: "Ivy" } } }) } }, params: { id: "o1" } });
  check(last().tokens.join() === "ownerTok" && /Ivy signed off Rig walkthrough for New One/.test(last().notification.body), "sign-off alert: " + JSON.stringify(last()));
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : `${n} notification checks, no errors`);
  process.exit(errors.length ? 1 : 0);
})();
