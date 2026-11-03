// Notification functions (functions/push.js) against a fake Firestore + Messaging: which alerts go to whom, and what they say.
// Run: node tests/push.test.cjs   (needs `npm install` in functions/)
const path = require("path");
const Module = require("module");
const FN = path.join(__dirname, "../functions");
const docs = new Map(), sent = [];
const snap = (p) => ({ exists: docs.has(p), data: () => docs.get(p), id: p.split("/").pop() });
const fakeDb = { doc: p => ({ get: async () => snap(p), delete: async () => docs.delete(p) }),
  collection: c => ({ get: async () => ({ docs: [...docs.keys()].filter(k => k.startsWith(c + "/") && k.split("/").length === 2).map(snap) }) }) };
const stubs = {
  "firebase-admin/app": { initializeApp(){}, getApps: () => [1] },
  "firebase-admin/firestore": { getFirestore: () => fakeDb },
  "firebase-admin/messaging": { getMessaging: () => ({ sendEachForMulticast: async m => { sent.push(m); return { successCount: m.tokens.length, failureCount: 0, responses: m.tokens.map(() => ({ success: true })) }; } }) },
  "firebase-functions/logger": { info(){} },
  "firebase-functions/v2/firestore": { onDocumentCreated: (o, h) => h, onDocumentUpdated: (o, h) => h },
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
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : `${n} notification checks, no errors`);
  process.exit(errors.length ? 1 : 0);
})();
