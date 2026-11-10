// Push notifications to staff devices that turned them on (desk → key button → Notifications; pushTokens/{token}).
// The owner's devices get everything; admins' devices get interview bookings and cancellations.
// Alerts say who and what, never message content, reference answers or anything else from the private record.
// Tapping one opens the desk at that applicant's file (/?open=<id>).
// Deploy on its own: firebase deploy --only functions:push   (doesn't need the SMTP secret)
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const { buildMorning } = require("./morning");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) initializeApp();
const db = getFirestore();
// Must match public/js/config.js and the rules.
const OWNER_EMAIL = "dkota@pvrs.org";
const DESK = "https://pvrs-membership.web.app/";
const OPTS = { maxInstances: 2 };
const REFS_NEEDED = 3;   // must match shared.js
const PAGES = { app: "Application", iv: "Interview", checks: "Checks", board: "Board", onb: "Onboard" };

const get = (o, path) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const nameOf = async id => { if (!id) return "An applicant"; const a = await db.doc(`applicants/${id}`).get(); return (a.exists && a.data().name) || "An applicant"; };
const byWho = async email => {
  if (!email || email === "online application") return "";
  if (email === OWNER_EMAIL) return "you";
  const s = await db.doc(`staff/${email}`).get();
  return (s.exists && s.data().name) || email;
};
const when = ms => new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
// References that count as received (same rule as refList/refStatus in shared.js).
const refsIn = sec => [1, 2, 3, 4].filter(i => { const r = get(sec || {}, `refs.r${i}`) || {}; return r.name && String(r.name).trim() && r.returned && !r.replace; }).length;

// `to` = exact list of emails (chat); otherwise the owner, plus everyone when `everyone`. `skip` = the person who caused it.
async function send({ title, body, id = "", chat = "", everyone = false, to = null, skip = "" }){
  const snap = await db.collection("pushTokens").get();
  const want = e => e !== skip && (to ? to.includes(e) : (everyone || e === OWNER_EMAIL));
  const tokens = snap.docs.filter(d => want(d.data().email)).map(d => d.id);
  if (!tokens.length) return;
  const link = DESK + (chat ? `?chat=${encodeURIComponent(chat)}` : id ? `?open=${encodeURIComponent(id)}` : "");
  const res = await getMessaging().sendEachForMulticast({ tokens, notification: { title, body },
    webpush: { notification: { icon: "/img/icon-192.png", badge: "/img/icon-192.png" }, fcmOptions: { link } } });
  // Forget devices that uninstalled or revoked permission.
  const dead = res.responses.map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code || "") ? tokens[i] : null)).filter(Boolean);
  await Promise.all(dead.map(t => db.doc(`pushTokens/${t}`).delete().catch(() => {})));
  logger.info("push sent", { title, sent: res.successCount, failed: res.failureCount, removed: dead.length });
}

// Applicants who turned on alerts in their portal (applicantTokens/{token}). Generic wording only: nothing about checks,
// votes or decisions, and a decline never triggers anything (see portalChanged).
async function sendApplicant(appId, { title, body }){
  const snap = await db.collection("applicantTokens").where("appId", "==", appId).get();
  const tokens = snap.docs.map(d => d.id);
  if (!tokens.length) return;
  const res = await getMessaging().sendEachForMulticast({ tokens, notification: { title, body },
    webpush: { notification: { icon: "/img/icon-192.png", badge: "/img/icon-192.png" }, fcmOptions: { link: DESK } } });
  const dead = res.responses.map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code || "") ? tokens[i] : null)).filter(Boolean);
  await Promise.all(dead.map(t => db.doc(`applicantTokens/${t}`).delete().catch(() => {})));
}
const doneCount = pd => (pd.steps || []).filter(s => s.state === "done").length;
exports.portalChanged = onDocumentUpdated({ document: "portal/{id}", ...OPTS }, async e => {
  const b = e.data.before.data() || {}, a = e.data.after.data() || {}, id = e.params.id;
  if (!b.bookingOpen && a.bookingOpen) await sendApplicant(id, { title: "Interview times are open", body: "You can pick your interview time in your PVRS portal." });
  if (doneCount(a) > doneCount(b)) await sendApplicant(id, { title: "Your application moved forward", body: "Open your PVRS portal to see what's next." });
  if (!b.orientation && a.orientation) await sendApplicant(id, { title: "Orientation is open", body: "Your background check is complete. Pick your orientation time in your PVRS portal." });
  if (!b.checkin && a.checkin) await sendApplicant(id, { title: "Quick check-in", body: "How's it going so far? Tell us in your PVRS portal." });
  const asked = pd => ((pd.orientation || {}).items || []).filter(i => i.req).length;
  if (b.orientation && asked(a) > asked(b)) await sendApplicant(id, { title: "Document needed", body: "PVRS asked for an orientation document. Details are in your portal." });
  if ((a.docs || []).length > (b.docs || []).length) await sendApplicant(id, { title: "Document needed", body: "PVRS asked for a document. Details are in your portal." });
});

// 7:30 AM reminders: the owner's summary (only if there's something to say), each interviewer's interviews, and a
// day-before reminder for applicants who turned on alerts.
// Interview coordinators (staff role "coordinator"): they run scheduling, so they hear what the owner hears about interviews and messages.
const coordinators = async () => (await db.collection("staff").get()).docs.filter(d => d.data().role === "coordinator").map(d => d.id);
async function runMorning(now){
  const appDocs = (await db.collection("applicants").get()).docs;
  const apps = await Promise.all(appDocs.map(async d => { const sec = await db.doc(`applicants/${d.id}/private/main`).get(); return { id: d.id, ...(sec.exists ? sec.data() : {}), ...d.data() }; }));
  const slots = (await db.collection("slots").get()).docs.map(d => d.data());
  const portals = (await db.collection("portal").get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const m = buildMorning({ apps, slots, now, portals, coordinators: await coordinators() });
  if (m.owner) await send({ to: [OWNER_EMAIL], ...m.owner });
  for (const [email, lines] of m.interviewers) for (const l of lines) await send({ to: [email], ...l });
  for (const x of m.applicants) await sendApplicant(x.id, x);
}
exports.morning = onSchedule({ schedule: "30 7 * * *", timeZone: "America/New_York", maxInstances: 1 }, () => runMorning(Date.now()));

// Orientation bookings, trainer sign-offs and check-ins go to the owner (who runs orientation).
exports.orientBooking = onDocumentUpdated({ document: "orientSlots/{id}", ...OPTS }, async e => {
  const b = e.data.before.data() || {}, a = e.data.after.data() || {};
  if (!b.bookedBy && a.bookedBy) await send({ title: "Orientation booked", body: `${await nameOf(a.bookedBy)} · ${when(a.start)}`, id: a.bookedBy });
  else if (b.bookedBy && !a.bookedBy) await send({ title: "Orientation cancelled", body: `${await nameOf(b.bookedBy)} · ${when(b.start)} is open again`, id: b.bookedBy });
});
exports.signoffChanged = onDocumentWritten({ document: "signoffs/{id}", ...OPTS }, async e => {
  const b = e.data.before?.data() || {}, a = e.data.after?.data(); if (!a) return;
  const added = (a.trainers || []).filter(x => !(b.trainers || []).includes(x));
  if (added.length) await send({ to: added, title: "New member to sign off", body: `You're a trainer for ${a.name || "a new member"}. Open Sign-offs in the desk.` });
  const newly = Object.keys(a.done || {}).filter(k => !(b.done || {})[k]);
  for (const k of newly) { const item = (a.items || []).find(x => x.key === k), d = a.done[k];
    await send({ skip: d.by, title: "Trainer sign-off", body: `${d.name || "A trainer"} signed off ${item?.label || "an item"} for ${a.name || "a new member"}`, id: e.params.id }); }
});
exports.checkinAnswered = onDocumentCreated({ document: "portal/{id}/checkins/{n}", ...OPTS }, async e => {
  await send({ title: `${e.params.n}-day check-in`, body: `${await nameOf(e.params.id)} answered their check-in`, id: e.params.id });
});

exports.newApplication = onDocumentCreated({ document: "submissions/{id}", ...OPTS }, async e => {
  const p = e.data?.data()?.person || {};
  await send({ title: "New application", body: `${[p.first, p.last].filter(Boolean).join(" ") || "Someone"} applied online` });
});

// Applicant conversations: the owner plus the squad members added to it (convos/{id}) hear about new messages.
exports.applicantMessage = onDocumentCreated({ document: "portal/{id}/messages/{mid}", ...OPTS }, async e => {
  const m = e.data?.data() || {}, id = e.params.id;
  const cv = await db.doc(`convos/${id}`).get();
  const to = [...new Set([OWNER_EMAIL, ...(await coordinators()), ...((cv.exists && cv.data().members) || [])])];
  const name = await nameOf(id);
  if (m.from === "applicant") await send({ to, title: "New message", body: `${name} sent a message`, chat: `a:${id}` });
  else if (m.from === "staff") {
    await send({ to, skip: m.by, title: `Reply to ${name}`, body: `${m.name || "Someone"} replied to ${name}`, chat: `a:${id}` });
    await sendApplicant(id, { title: "New message from PVRS", body: "You have a new message in your applicant portal." });
  }
});

// Squad channels: everyone in the channel except the author. Says who posted where, not what.
exports.channelPost = onDocumentCreated({ document: "channels/{cid}/posts/{pid}", ...OPTS }, async e => {
  const p = e.data?.data() || {};
  const c = await db.doc(`channels/${e.params.cid}`).get(); if (!c.exists) return;
  const ch = c.data();
  await send({ to: [OWNER_EMAIL, ...(ch.members || [])], skip: p.by, title: `#${ch.name}`, body: `${p.name || "Someone"} posted in #${ch.name}`, chat: `c:${e.params.cid}` });
});

// Bookings: the owner, admins, and the interviewers assigned to that applicant (members never hear about applicants).
const bookingCrew = async appId => {
  const admins = (await db.collection("staff").get()).docs.filter(d => ["admin", "coordinator"].includes(d.data().role)).map(d => d.id);
  const a = appId ? await db.doc(`applicants/${appId}`).get() : null;
  return [OWNER_EMAIL, ...admins, ...((a && a.exists && a.data().interviewers) || [])];
};
// A time an interviewer offered (slots/{id}.host): booking it assigns them to that applicant and adds them to the
// conversation. Cancelling takes them off again, but only if the booking is what put them there.
async function setHost(appId, email, name, on){
  const ref = db.doc(`applicants/${appId}`), a = await ref.get(); if (!a.exists) return;
  const cur = a.data().interviewers || [], cvRef = db.doc(`convos/${appId}`), cv = await cvRef.get(), cvd = cv.exists ? cv.data() : { members: [], names: {} };
  if (on) {
    if (cur.includes(email)) return;
    await ref.set({ interviewers: [...cur, email], hostFromBooking: email }, { merge: true });
    await cvRef.set({ members: [...new Set([...(cvd.members || []), email])], names: { ...(cvd.names || {}), [email]: name || email.split("@")[0] }, updatedAt: Date.now() }, { merge: true });
  } else if (a.data().hostFromBooking === email) {
    await ref.set({ interviewers: cur.filter(x => x !== email), hostFromBooking: "" }, { merge: true });
    if (cv.exists) await cvRef.set({ members: (cvd.members || []).filter(x => x !== email), updatedAt: Date.now() }, { merge: true });
  }
}
exports.interviewBooking = onDocumentUpdated({ document: "slots/{id}", ...OPTS }, async e => {
  const b = e.data.before.data() || {}, a = e.data.after.data() || {};
  if (!b.bookedBy && a.bookedBy && a.host) await setHost(a.bookedBy, a.host, a.hostName, true);
  if (b.bookedBy && !a.bookedBy && b.host) await setHost(b.bookedBy, b.host, b.hostName, false);
  if (!b.bookedBy && a.bookedBy) await send({ to: await bookingCrew(a.bookedBy), title: "Interview booked", body: `${await nameOf(a.bookedBy)} · ${when(a.start)}`, id: a.bookedBy });
  else if (b.bookedBy && !a.bookedBy) await send({ to: await bookingCrew(b.bookedBy), title: "Interview cancelled", body: `${await nameOf(b.bookedBy)} · ${when(b.start)} is open again`, id: b.bookedBy });
});

exports.referenceAnswered = onDocumentCreated({ document: "refResponses/{token}", ...OPTS }, async e => {
  const l = await db.doc(`refLinks/${e.params.token}`).get();
  const d = l.exists ? l.data() : {};
  await send({ title: "Reference check answered", body: `${d.refName || "A reference"} answered for ${d.applicant || "an applicant"}`, id: d.appId || "" });
});

exports.documentUploaded = onDocumentCreated({ document: "portal/{id}/files/{fid}", ...OPTS }, async e => {
  const f = e.data?.data() || {};
  await send({ title: "Document uploaded", body: `${await nameOf(e.params.id)} sent ${f.confidential ? "a secure document" : "a document"}`, id: e.params.id });
});

exports.accessRequest = onDocumentCreated({ document: "accessRequests/{email}", ...OPTS }, async e => {
  const r = e.data?.data() || {};
  await send({ title: "Desk access request", body: `${r.name || e.params.email} asked for access (Settings → Team)` });
});

// Page sign-offs: Application and Interview live on the applicant doc (signoff.*), the rest in the private record (pagesign.*).
async function pagesDone(before, after, root, id, by){
  for (const k of Object.keys(PAGES)) {
    if (!get(before, `${root}.${k}.done`) && get(after, `${root}.${k}.done`)) {
      const who = await byWho(by);
      await send({ title: `${PAGES[k]} page complete`, body: `${await nameOf(id)}${who ? ` · marked by ${who}` : ""}`, id });
    }
  }
}
exports.pageCompleteShared = onDocumentUpdated({ document: "applicants/{id}", ...OPTS }, async e => {
  const b = e.data.before.data() || {}, a = e.data.after.data() || {};
  await pagesDone(b, a, "signoff", e.params.id, a.updatedBy);
  // Newly assigned interviewers hear about it.
  const added = (a.interviewers || []).filter(x => !(b.interviewers || []).includes(x));
  if (added.length) await send({ to: added, title: "Interview assigned", body: `You're interviewing ${a.name || "an applicant"}`, id: e.params.id });
});
exports.privateUpdate = onDocumentUpdated({ document: "applicants/{id}/private/main", ...OPTS }, async e => {
  const b = e.data.before.data() || {}, a = e.data.after.data() || {}, id = e.params.id;
  await pagesDone(b, a, "pagesign", id, a.secUpdatedBy);
  if (refsIn(b) < REFS_NEEDED && refsIn(a) >= REFS_NEEDED) await send({ title: "References complete", body: `${await nameOf(id)} has ${REFS_NEEDED} references in`, id });
});
