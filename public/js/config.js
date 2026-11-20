// Firebase web app config for project pvrs-membership.
export const firebaseConfig = {
  apiKey: "AIzaSyAmPIMyTAPdJLdhEFwoSNi9Bfdx5YqCcDY",
  authDomain: "pvrs-membership.firebaseapp.com",
  projectId: "pvrs-membership",
  storageBucket: "pvrs-membership.firebasestorage.app",
  messagingSenderId: "1066878367633",
  appId: "1:1066878367633:web:84e23e24b83916e4360c30"
};

// Push notifications: the "Web Push certificates" key pair from Firebase console → Project settings → Cloud Messaging.
// Public by design (safe to commit). Empty = notifications not set up yet; see docs/notifications.md.
export const VAPID_KEY = "BCfhmGI4iU-T9MgXZ5xOFARfxPqhgwN2-SW-P4lAoEnqd1DOblS1-MMqKptS1NVQgKsoQ2i307owTpl4v03gNwE";

// 2) The owner always has full access. Must match the email in firestore.rules and storage.rules.
export const OWNER_EMAIL = "dkota@pvrs.org";

// Where applicants are told to send questions.
export const CONTACT_EMAIL = "membership@pvrs.org";

// Confidential paperwork (medical, Social Security). Only this account can open those files, not even the owner.
// Must match firestore.rules, storage.rules and functions/index.js.
export const PAPERWORK_EMAIL = "orientationpaperwork@pvrs.org";
