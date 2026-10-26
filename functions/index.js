// Cloud Functions for the PVRS Membership Desk.
// - notifyPaperwork: emails orientationpaperwork@pvrs.org when confidential vault docs arrive (needs SMTP_PASSWORD).
// - slack*: posts short, non-sensitive pings to Slack (needs SLACK_WEBHOOK_URL).
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();

// Must match public/js/config.js, firestore.rules and storage.rules.
const PAPERWORK_EMAIL = "orientationpaperwork@pvrs.org";
// The Google account that sends the notice. SMTP_PASSWORD is a Google app password for this account,
// set once from Terminal with: firebase functions:secrets:set SMTP_PASSWORD
const SENDER = PAPERWORK_EMAIL;
const SMTP_PASSWORD = defineSecret("SMTP_PASSWORD");
const SLACK_WEBHOOK_URL = defineSecret("SLACK_WEBHOOK_URL");
const SIGN_IN = "https://pvrs-membership.web.app/signin";
const DESK = "https://pvrs-membership.web.app/signin";

const whenET = ms => new Date(ms || Date.now()).toLocaleString("en-US", {
  timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short",
});

async function postSlack(text) {
  const res = await fetch(SLACK_WEBHOOK_URL.value(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack webhook ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function portalName(appId) {
  try {
    const snap = await db.doc(`portal/${appId}`).get();
    return (snap.exists && snap.data().name) || "An applicant";
  } catch (e) {
    logger.warn("portal name lookup failed", e);
    return "An applicant";
  }
}

exports.notifyPaperwork = onDocumentCreated({ document: "vault/{fileId}", secrets: [SMTP_PASSWORD], maxInstances: 2 }, async event => {
  const d = event.data && event.data.data(); if (!d) return;
  const who = d.appName || "an applicant";
  const at = whenET(d.uploadedAt);
  const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: SENDER, pass: SMTP_PASSWORD.value() } });
  await transport.sendMail({
    from: `"PVRS Membership Desk" <${SENDER}>`,
    to: PAPERWORK_EMAIL,
    subject: `New confidential paperwork: ${who}`,
    text: `New confidential paperwork is waiting for you.

Applicant: ${who}
Document: ${d.label || "Confidential paperwork"}
When: ${at} (${d.from === "staff" ? "added by PVRS staff" : "uploaded by the applicant"})

The file isn't attached, to keep it private. To open or print it, sign in at
${SIGN_IN}
with Google as ${PAPERWORK_EMAIL}.

PVRS Membership Desk`,
  });
  logger.info("Paperwork notice sent", { fileId: event.params.fileId });
});

const slackOpts = { secrets: [SLACK_WEBHOOK_URL], maxInstances: 2 };

// New online / paper-imported application (status "new" → desk auto-imports).
exports.slackOnSubmission = onDocumentCreated({ document: "submissions/{id}", ...slackOpts }, async event => {
  const d = event.data && event.data.data(); if (!d || d.status !== "new") return;
  const p = d.person || {};
  const name = [p.first, p.last].filter(Boolean).join(" ") || "Someone";
  const type = p.type || "membership";
  await postSlack(`📋 *New application:* ${name} (${type})\nOpen the desk: ${DESK}`);
  logger.info("Slack: new submission", { id: event.params.id });
});

// Applicant messages only (owner replies already happen in the desk).
exports.slackOnMessage = onDocumentCreated({ document: "portal/{appId}/messages/{msgId}", ...slackOpts }, async event => {
  const d = event.data && event.data.data(); if (!d || d.from !== "applicant") return;
  const who = (d.name || "").trim() || await portalName(event.params.appId);
  const preview = String(d.text || "").replace(/\s+/g, " ").trim().slice(0, 140);
  await postSlack(`💬 *Message from ${who}:*\n${preview}${preview.length >= 140 ? "…" : ""}\nOpen the desk: ${DESK}`);
  logger.info("Slack: applicant message", { appId: event.params.appId });
});

// Document uploaded to the portal (confidential ones are nameless placeholders).
exports.slackOnUpload = onDocumentCreated({ document: "portal/{appId}/files/{fileId}", ...slackOpts }, async event => {
  const d = event.data && event.data.data(); if (!d) return;
  const who = await portalName(event.params.appId);
  const what = d.confidential ? "a secure document" : (d.label || "a document");
  await postSlack(`📎 *Upload from ${who}:* ${what}\nOpen the desk: ${DESK}`);
  logger.info("Slack: portal upload", { appId: event.params.appId });
});

// Interview booked or cancelled on the portal doc.
exports.slackOnInterview = onDocumentUpdated({ document: "portal/{appId}", ...slackOpts }, async event => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  const oldIv = before.interview || null;
  const newIv = after.interview || null;
  const name = after.name || "An applicant";
  if (!oldIv && newIv && newIv.start) {
    const when = whenET(newIv.start);
    const where = newIv.location ? ` · ${newIv.location}` : "";
    await postSlack(`📅 *Interview booked:* ${name}\n${when}${where}\nOpen the desk: ${DESK}`);
    logger.info("Slack: interview booked", { appId: event.params.appId });
  } else if (oldIv && !newIv) {
    await postSlack(`📅 *Interview cancelled:* ${name}\nOpen the desk: ${DESK}`);
    logger.info("Slack: interview cancelled", { appId: event.params.appId });
  }
});

// Squad member asks for desk access.
exports.slackOnAccessRequest = onDocumentCreated({ document: "accessRequests/{email}", ...slackOpts }, async event => {
  const d = event.data && event.data.data(); if (!d || d.status !== "pending") return;
  const who = d.name || event.params.email;
  const note = d.note ? `\nNote: ${String(d.note).slice(0, 200)}` : "";
  await postSlack(`👤 *Access request:* ${who} (${event.params.email})${note}\nApprove in Settings → Team: ${DESK}`);
  logger.info("Slack: access request", { email: event.params.email });
});

// Confidential paperwork landed in the vault (no file name).
exports.slackOnVault = onDocumentCreated({ document: "vault/{fileId}", ...slackOpts }, async event => {
  const d = event.data && event.data.data(); if (!d) return;
  const who = d.appName || "an applicant";
  const kind = d.label || "Confidential paperwork";
  await postSlack(`🔒 *Confidential paperwork* for ${who} (${kind})\nPaperwork account: ${PAPERWORK_EMAIL}`);
  logger.info("Slack: vault file", { fileId: event.params.fileId });
});
