// Firebase web app config for project pvrs-membership.
export const firebaseConfig = {
  apiKey: "AIzaSyAmPIMyTAPdJLdhEFwoSNi9Bfdx5YqCcDY",
  authDomain: "pvrs-membership.firebaseapp.com",
  projectId: "pvrs-membership",
  storageBucket: "pvrs-membership.firebasestorage.app",
  messagingSenderId: "1066878367633",
  appId: "1:1066878367633:web:84e23e24b83916e4360c30"
};

// 2) The owner always has full access. Must match the email in firestore.rules and storage.rules.
export const OWNER_EMAIL = "dkota@pvrs.org";

// Where applicants are told to send questions.
export const CONTACT_EMAIL = "membership@pvrs.org";
