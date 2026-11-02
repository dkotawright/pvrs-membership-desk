// Push notifications to staff devices that turned them on (desk → key button → Notifications; pushTokens/{token}).
// The owner's devices get everything; admins' devices get interview bookings and cancellations.
// Alerts say who and what, never message content or anything from the private record.
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

const nameOf = async id => { const p = id ? await db.doc(`portal/${id}`).get() : null; return (p && p.exists && p.data().name) || "An applicant"; };
const when = ms => new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function send({ title, body, everyone = false }){
  const snap = await db.collection("pushTokens").get();
  const tokens = snap.docs.filter(d => everyone || d.data().email === OWNER_EMAIL).map(d => d.id);
  if (!tokens.length) return;
  const res = await getMessaging().sendEachForMulticast({ tokens, notification: { title, body },
    webpush: { notification: { icon: "/img/icon-192.png", badge: "/img/icon-192.png" }, fcmOptions: { link: DESK } } });
  // Forget devices that uninstalled or revoked permission.
  const dead = res.responses.map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code || "") ? tokens[i] : null)).filter(Boolean);
  await Promise.all(dead.map(t => db.doc(`pushTokens/${t}`).delete().catch(() => {})));
  logger.info("push sent", { title, sent: res.successCount, failed: res.failureCount, removed: dead.length });
}

exports.newApplication = onDocumentCreated({ document: "submissions/{id}", ...OPTS }, async e => {
  const p = e.data?.data()?.person || {};
  await send({ title: "New application", body: `${[p.first, p.last].filter(Boolean).join(" ") || "Someone"} applied online` });
});

exports.applicantMessage = onDocumentCreated({ document: "portal/{id}/messages/{mid}", ...OPTS }, async e => {
  if (e.data?.data()?.from !== "applicant") return;
  await send({ title: "New message", body: `${await nameOf(e.params.id)} sent a message` });
});

exports.interviewBooking = onDocumentUpdated({ document: "slots/{id}", ...OPTS }, async e => {
  const b = e.data.before.data() || {}, a = e.data.after.data() || {};
  if (!b.bookedBy && a.bookedBy) await send({ everyone: true, title: "Interview booked", body: `${await nameOf(a.bookedBy)} · ${when(a.start)}` });
  else if (b.bookedBy && !a.bookedBy) await send({ everyone: true, title: "Interview cancelled", body: `${await nameOf(b.bookedBy)} · ${when(b.start)} is open again` });
});

exports.referenceAnswered = onDocumentCreated({ document: "refResponses/{token}", ...OPTS }, async e => {
  const l = await db.doc(`refLinks/${e.params.token}`).get();
  const d = l.exists ? l.data() : {};
  await send({ title: "Reference answered", body: `${d.refName || "A reference"} answered for ${d.applicant || "an applicant"}` });
});

exports.documentUploaded = onDocumentCreated({ document: "portal/{id}/files/{fid}", ...OPTS }, async e => {
  const f = e.data?.data() || {};
  await send({ title: "Document uploaded", body: `${await nameOf(e.params.id)} sent ${f.confidential ? "a secure document" : "a document"}` });
});
