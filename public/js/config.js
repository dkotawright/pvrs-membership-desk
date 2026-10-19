import { environmentForHost } from "./environment.js";

export const environment = environmentForHost(location.hostname);
const productionConfig = {
  apiKey: "AIzaSyAmPIMyTAPdJLdhEFwoSNi9Bfdx5YqCcDY",
  authDomain: "pvrs-membership.firebaseapp.com",
  projectId: "pvrs-membership",
  storageBucket: "pvrs-membership.firebasestorage.app",
  messagingSenderId: "1066878367633",
  appId: "1:1066878367633:web:84e23e24b83916e4360c30"
};

const testConfig = {
  apiKey: "AIzaSyAVfIqbmRu909wPzEHHlzq0qwgG3lVdpMM",
  authDomain: "pvrs-membership-test.firebaseapp.com",
  projectId: "pvrs-membership-test",
  storageBucket: "pvrs-membership-test.firebasestorage.app",
  messagingSenderId: "870733502771",
  appId: "1:870733502771:web:cc97525d2708358db48646"
};

// Demo project IDs cannot address a real Firebase backend. Local services must
// be running; there is deliberately no fallback to an online project.
const localConfig = {
  apiKey: "demo-key",
  authDomain: "demo-pvrs-membership.firebaseapp.com",
  projectId: "demo-pvrs-membership",
  storageBucket: "demo-pvrs-membership.appspot.com",
  appId: "demo-pvrs-membership"
};
export const firebaseConfig = environment === "production" ? productionConfig
  : environment === "test" ? testConfig : localConfig;

// 2) The owner always has full access. Must match the email in firestore.rules and storage.rules.
export const OWNER_EMAIL = "dkota@pvrs.org";

// Where applicants are told to send questions.
export const CONTACT_EMAIL = "membership@pvrs.org";

// Confidential paperwork (medical, Social Security). Only this account can open those files, not even the owner.
// Must match firestore.rules, storage.rules and functions/index.js.
export const PAPERWORK_EMAIL = "orientationpaperwork@pvrs.org";
