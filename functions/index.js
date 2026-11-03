// Emails the paperwork account when confidential (medical / Social Security) paperwork arrives in the vault.
// No attachment and no file name: just who it's for, what kind, and a link to sign in and open it.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

// Must match public/js/config.js, firestore.rules and storage.rules.
const PAPERWORK_EMAIL = "orientationpaperwork@pvrs.org";
// The Google account that sends the notice. SMTP_PASSWORD is a Google app password for this account,
// set once from Terminal with: firebase functions:secrets:set SMTP_PASSWORD
const SENDER = PAPERWORK_EMAIL;
const PAPERWORK_EMAIL_ON = false;   // see the note above notifyPaperwork
const SIGN_IN = "https://pvrs-membership.web.app/signin";

// OFF (Nov 3, 2026): pvrs.org blocks Google app passwords, so SMTP_PASSWORD was never set, and the Firebase CLI refuses
// to deploy ANY function from this file while a declared secret is missing (it blocked Med Control). To bring this back,
// set the secret (firebase functions:secrets:set SMTP_PASSWORD) and set PAPERWORK_EMAIL_ON to true.
const SMTP_PASSWORD = PAPERWORK_EMAIL_ON ? defineSecret("SMTP_PASSWORD") : null;
if (PAPERWORK_EMAIL_ON) exports.notifyPaperwork = onDocumentCreated({ document: "vault/{fileId}", secrets: [SMTP_PASSWORD], maxInstances: 2 }, async event => {
  const d = event.data && event.data.data(); if (!d) return;
  const who = d.appName || "an applicant";
  const at = new Date(d.uploadedAt || Date.now()).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
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

// Push notifications to staff devices (deploy with: firebase deploy --only functions:push)
exports.push = require("./push");

// Med Control, the desk's AI assistant (deploy with: firebase deploy --only functions:ai)
const { medControl } = require("./medcontrol");
exports.ai = { medControl };
