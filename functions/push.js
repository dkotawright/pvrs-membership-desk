// Push notifications to staff devices that turned them on (desk → key button → Notifications; pushTokens/{token}).
// The owner's devices get everything; admins' devices get interview bookings and cancellations.
// Alerts say who and what, never message content, reference answers or anything else from the private record.
// Tapping one opens the desk at that applicant's file (/?open=<id>).
// Deploy on its own: firebase deploy --only functions:push   (doesn't need the SMTP secret)
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
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

exports.newApplication = onDocumentCreated({ document: "submissions/{id}", ...OPTS }, async e => {
  const p = e.data?.data()?.person || {};
  await send({ title: "New application", body: `${[p.first, p.last].filter(Boolean).join(" ") || "Someone"} applied online` });
});

// Applicant conversations: the owner plus the squad members added to it (convos/{id}) hear about new messages.
exports.applicantMessage = onDocumentCreated({ document: "portal/{id}/messages/{mid}", ...OPTS }, async e => {
  const m = e.data?.data() || {}, id = e.params.id;
  const cv = await db.doc(`convos/${id}`).get();
  const to = [OWNER_EMAIL, ...((cv.exists && cv.data().members) || [])];
  const name = await nameOf(id);
  if (m.from === "applicant") await send({ to, title: "New message", body: `${name} sent a message`, chat: `a:${id}` });
  else if (m.from === "staff") await send({ to, skip: m.by, title: `Reply to ${name}`, body: `${m.name || "Someone"} replied to ${name}`, chat: `a:${id}` });
});

// Squad channels: everyone in the channel except the author. Says who posted where, not what.
exports.channelPost = onDocumentCreated({ document: "channels/{cid}/posts/{pid}", ...OPTS }, async e => {
  const p = e.data?.data() || {};
  const c = await db.doc(`channels/${e.params.cid}`).get(); if (!c.exists) return;
  const ch = c.data();
  await send({ to: [OWNER_EMAIL, ...(ch.members || [])], skip: p.by, title: `#${ch.name}`, body: `${p.name || "Someone"} posted in #${ch.name}`, chat: `c:${e.params.cid}` });
});

exports.interviewBooking = onDocumentUpdated({ document: "slots/{id}", ...OPTS }, async e => {
  const b = e.data.before.data() || {}, a = e.data.after.data() || {};
  if (!b.bookedBy && a.bookedBy) await send({ everyone: true, title: "Interview booked", body: `${await nameOf(a.bookedBy)} · ${when(a.start)}`, id: a.bookedBy });
  else if (b.bookedBy && !a.bookedBy) await send({ everyone: true, title: "Interview cancelled", body: `${await nameOf(b.bookedBy)} · ${when(b.start)} is open again`, id: b.bookedBy });
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
});
exports.privateUpdate = onDocumentUpdated({ document: "applicants/{id}/private/main", ...OPTS }, async e => {
  const b = e.data.before.data() || {}, a = e.data.after.data() || {}, id = e.params.id;
  await pagesDone(b, a, "pagesign", id, a.secUpdatedBy);
  if (refsIn(b) < REFS_NEEDED && refsIn(a) >= REFS_NEEDED) await send({ title: "References complete", body: `${await nameOf(id)} has ${REFS_NEEDED} references in`, id });
});
