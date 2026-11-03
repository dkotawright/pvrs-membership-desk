// In-memory stand-in for the Firebase v10 modular SDK (app, auth, firestore, storage), served in place of the
// gstatic CDN during browser tests. State lives on window.__mock. Test data only: no real applicant information.
const M = window.__mock || (window.__mock = { docs: new Map(), listeners: new Set(), seq: 0 });
const user = () => window.__MOCK_USER || null;
export const initializeApp = cfg => ({ cfg });
const AUTH = { get currentUser(){ const u = user(); return u ? { ...u, emailVerified: u.emailVerified !== false, providerData: [{ providerId: u.provider || "google.com" }],
  reload: async () => {}, getIdToken: async () => "token" } : null; } };
M.authCbs = M.authCbs || [];
export const getAuth = () => AUTH;
export const onAuthStateChanged = (_a, cb) => { M.authCbs.push(cb); setTimeout(() => cb(AUTH.currentUser), 30); return () => {}; };
export const signInWithEmailAndPassword = async (_a, email) => {
  if (M.mfaUser && email === M.mfaUser.email) { M.pendingMfa = M.mfaUser; throw Object.assign(new Error("mfa"), { code: "auth/multi-factor-auth-required" }); }
  throw Object.assign(new Error("bad"), { code: "auth/invalid-credential" }); };
// Two-step sign-in (authenticator app). A test sets M.mfaUser = {email, …} to make that password sign-in ask for a code; 123456 is right.
export const getMultiFactorResolver = () => ({ hints: [{ uid: "totp1", factorId: "totp", displayName: "Authenticator app" }],
  resolveSignIn: async a => { if (a.code !== "123456") throw Object.assign(new Error("code"), { code: "auth/invalid-verification-code" });
    window.__MOCK_USER = { ...M.pendingMfa, provider: "password" }; M.authCbs.forEach(cb => cb(AUTH.currentUser)); return {}; } });
export const TotpMultiFactorGenerator = { FACTOR_ID: "totp",
  generateSecret: async () => ({ secretKey: "JBSWY3DPEHPK3PXP", generateQrCodeUrl: (acct, issuer) => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(acct)}?secret=JBSWY3DPEHPK3PXP&issuer=${encodeURIComponent(issuer)}` }),
  assertionForEnrollment: (_s, code) => ({ code }), assertionForSignIn: (_uid, code) => ({ code }) };
export const multiFactor = () => ({ get enrolledFactors(){ return M.enrolled || []; }, getSession: async () => ({}),
  enroll: async (a, name) => { if (a.code !== "123456") throw Object.assign(new Error("code"), { code: "auth/invalid-verification-code" }); M.enrolled = [{ uid: "totp1", factorId: "totp", displayName: name }]; },
  unenroll: async () => { M.enrolled = []; } });
export const sendPasswordResetEmail = async () => {};
// Email + password accounts: new ones start unconfirmed; a test flips window.__MOCK_USER.emailVerified to "click the link".
export const createUserWithEmailAndPassword = async (_a, email, pw) => {
  if ((M.existingEmails || ["dkota@pvrs.org"]).includes(email)) throw Object.assign(new Error("in use"), { code: "auth/email-already-in-use" });
  window.__MOCK_USER = { email, displayName: "", emailVerified: false, provider: "password" }; M.created = { email, pw };
  M.authCbs.forEach(cb => cb(AUTH.currentUser)); return { user: AUTH.currentUser };
};
export const sendEmailVerification = async (u, settings) => { (M.verifySent = M.verifySent || []).push({ email: u.email, url: settings && settings.url }); };
export const updateProfile = async (u, p) => { if (window.__MOCK_USER) Object.assign(window.__MOCK_USER, p); };
export const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
export const linkWithCredential = async () => {};
export const updatePassword = async () => {};
export const reauthenticateWithPopup = async () => {};
export const signOut = async () => { window.__MOCK_USER = null; window.__signedOut = true; };
export class GoogleAuthProvider {}
export const signInWithPopup = async () => ({});
export const sendSignInLinkToEmail = async () => {};
export const isSignInWithEmailLink = () => false;
export const signInWithEmailLink = async () => {};
export const getFirestore = () => ({});
const join = segs => segs.join("/");
const newId = () => "id" + (++M.seq) + Math.random().toString(36).slice(2, 7);
export const doc = (_db, ...segs) => {
  if (_db && _db.kind === "col" && !segs.length) { const path = _db.path + "/" + newId(); return { kind: "doc", path, id: path.split("/").pop() }; }   // doc(collectionRef): auto id
  const path = join(segs.map(s => typeof s === "object" ? s.path : s)); return { kind: "doc", path, id: path.split("/").pop() };
};
export const collection = (_db, ...segs) => ({ kind: "col", path: join(segs.map(s => typeof s === "object" ? s.path : s)) });
export const collectionGroup = (_db, name) => ({ kind: "group", name });
export const query = (c, ...cons) => ({ ...c, cons });
export const where = (f, op, v) => ({ f, op, v });
export const limit = n => ({ limit: n });
export const serverTimestamp = () => Date.now();
export const deleteField = () => undefined;
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const merge = (t, s) => { for (const k in s) { if (isObj(s[k])) { if (!isObj(t[k])) t[k] = {}; merge(t[k], s[k]); } else t[k] = s[k]; } return t; };
const parentOf = path => { const p = path.split("/"); p.pop(); return p.join("/"); };
const mkRef = path => { const segs = path.split("/"); return { path, id: segs[segs.length - 1], parent: { path: parentOf(path), id: segs[segs.length - 2], parent: segs.length >= 4 ? { id: segs[segs.length - 3], path: segs.slice(0, -2).join("/") } : null } }; };
const snapDoc = path => ({ id: path.split("/").pop(), ref: mkRef(path), exists: () => M.docs.has(path), data: () => clone(M.docs.get(path)) });
function matches(target, path){
  if (target.kind === "doc") return path === target.path;
  if (target.kind === "col") return parentOf(path) === target.path;
  if (target.kind === "group") { const p = path.split("/"); return p.length >= 2 && p[p.length - 2] === target.name; }
  return false;
}
function runQuery(target){
  let list = [...M.docs.keys()].filter(p => matches(target, p)).sort();
  for (const c of target.cons || []) { if (c.f) list = list.filter(p => (M.docs.get(p) || {})[c.f] === c.v); if (c.limit) list = list.slice(0, c.limit); }
  const docs = list.map(snapDoc);
  return { docs, empty: !docs.length, size: docs.length, forEach: f => docs.forEach(f) };
}
function fire(l){ try { l.cb(l.target.kind === "doc" ? snapDoc(l.target.path) : runQuery(l.target)); } catch (e) { console.error(e); } }
const emit = () => { for (const l of [...M.listeners]) fire(l); };
M.emit = emit;
const tick = () => new Promise(r => setTimeout(r, 5));
function write(path, data, doMerge){
  (M.ver = M.ver || {})[path] = (M.ver[path] || 0) + 1;
  const d = clone(data);
  if (doMerge && M.docs.has(path)) { const cur = M.docs.get(path); for (const k in d) { if (d[k] === null) cur[k] = null; else if (isObj(d[k]) && isObj(cur[k])) merge(cur[k], d[k]); else cur[k] = d[k]; } }
  else M.docs.set(path, d);
}
const log = (op, path, data) => (M.writes = M.writes || []).push({ op, path, data: clone(data) });
export const getDoc = async r => snapDoc(r.path);
export const getDocs = async q => runQuery(q);
export const setDoc = async (r, data, opts) => { await tick(); log("set", r.path, data); write(r.path, data, opts && opts.merge); emit(); };
export const updateDoc = async (r, data) => { await tick(); log("update", r.path, data); write(r.path, data, true); emit(); };
export const deleteDoc = async r => { await tick(); log("delete", r.path); M.docs.delete(r.path); emit(); };
export const addDoc = async (c, data) => { await tick(); const path = c.path + "/" + newId(); log("add", path, data); write(path, data, false); emit(); return mkRef(path); };
export const onSnapshot = (target, cb) => { const l = { target, cb }; M.listeners.add(l); setTimeout(() => fire(l), 20); return () => M.listeners.delete(l); };
export const writeBatch = () => { const ops = []; return {
  set(r, d, o){ ops.push(() => { log("set", r.path, d); write(r.path, d, o && o.merge); }); return this; },
  update(r, d){ ops.push(() => { log("update", r.path, d); write(r.path, d, true); }); return this; },
  delete(r){ ops.push(() => { log("delete", r.path); M.docs.delete(r.path); }); return this; },
  async commit(){ await tick(); ops.forEach(f => f()); emit(); } }; };
// Transactions: like Firestore, if a document read inside the transaction changed before it commits, run it again.
M.ver = M.ver || {};
const bump = path => { M.ver[path] = (M.ver[path] || 0) + 1; };
export const runTransaction = async (_db, fn) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const seen = {}, ops = [];
    const tx = { get: async r => { await tick(); seen[r.path] = M.ver[r.path] || 0; return snapDoc(r.path); },
      set(r, d, o){ ops.push(() => { log("set", r.path, d); write(r.path, d, o && o.merge); bump(r.path); }); return tx; },
      update(r, d){ ops.push(() => { log("update", r.path, d); write(r.path, d, true); bump(r.path); }); return tx; },
      delete(r){ ops.push(() => { log("delete", r.path); M.docs.delete(r.path); bump(r.path); }); return tx; } };
    const res = await fn(tx);
    if (Object.entries(seen).some(([p, v]) => (M.ver[p] || 0) !== v)) continue;   // someone else changed it first: retry
    ops.forEach(f => f()); emit(); return res;
  }
  throw Object.assign(new Error("contention"), { code: "aborted" });
};
export const getStorage = () => ({});
export const ref = (_s, path) => ({ path });
export const uploadBytes = async () => ({});
export const getDownloadURL = async () => "about:blank";
export const deleteObject = async () => {};
// Push notifications: the browser bits are faked; a test sets M.pushOk = true to pretend the browser supports them.
export const getMessaging = () => ({});
export const isSupported = async () => !!M.pushOk;
export const getToken = async () => { if (M.pushDenied) throw Object.assign(new Error("denied"), { code: "messaging/permission-blocked" }); return "tok-" + (M.pushN = (M.pushN || 0) + 1); };
export const deleteToken = async () => true;
export const onMessage = () => () => {};
// Cloud Functions (Med Control): a test sets M.ai = (data) => result, or M.aiError = {code, message}; calls are logged in M.aiCalls.
export const getFunctions = () => ({});
export const httpsCallable = (_f, name) => async data => { (M.aiCalls = M.aiCalls || []).push({ name, data }); await tick();
  if (M.aiError) throw Object.assign(new Error(M.aiError.message), { code: "functions/" + M.aiError.code });
  const out = M.ai ? M.ai(data) : { text: "Mock answer." };
  if (data.job === "brief" && out.brief) { write(`applicants/${data.id}/private/main`, { ai: { brief: out.brief } }, true); emit(); }   // the real function saves it server-side
  return { data: out }; };

if (!M.seeded) {
  M.seeded = true;
  const day = 864e5, now = Date.now();
  const iso = d => new Date(now - d * day).toISOString().slice(0, 10);
  const put = (p, d) => M.docs.set(p, d);
  const A = (id, shared, priv) => { put("applicants/" + id, { updatedAt: now - 2 * day, updatedBy: "dkota@pvrs.org", ...shared }); if (priv) put(`applicants/${id}/private/main`, { secUpdatedAt: now - day, secUpdatedBy: "dkota@pvrs.org", ...priv }); };
  A("a1", { name: "Georgia Thurmond", phone: "(315) 555-0141", email: "georgia@example.com", type: "Regular", location: "Potsdam", app: { received: iso(41), complete: "yes" }, stage: "appr" },
    { mvr: { completed: iso(30) }, dl: { date: iso(28), valid: "yes" }, refs: { r1: { name: "Ann Lee", email: "ann.lee@example.com", relationship: "Coach" }, r2: { name: "Sam Ortiz", email: "sam@example.com", returned: iso(19) } },
      appr: { committee: "yes" }, portal: { invited: iso(35), bookingOpen: "yes" } });
  A("a2", { name: "Marcus Bell", phone: "(315) 555-0188", email: "marcus.bell@example.com", type: "Associate", location: "Potsdam", app: { received: iso(12), complete: "yes" }, stage: "screen" },
    { refs: { r1: { name: "Coach Dan Price", returned: iso(3) } }, portal: { invited: iso(10) } });
  put("portal/a2", { email: "marcus.bell@example.com", name: "Marcus Bell", firstName: "Marcus", type: "Associate", steps: [], docs: [], refs: [{ slot: 1, name: "Coach Dan Price", received: true }], bookingOpen: false });
  put("settings/main", { signature: "Dkota Wright, NREMT", docsEmail: "membership@pvrs.org" });
  put("staff/admin@pvrs.org", { role: "admin", name: "Casey Admin" });
  put("staff/alex@pvrs.org", { role: "member", name: "Alex Moore" });
  put("refLinks/linkGoodToken123456789", { appId: "a1", slot: 1, applicant: "Georgia Thurmond", first: "Georgia", refName: "Ann Lee", createdAt: now - day, expiresAt: now + 59 * day, by: "dkota@pvrs.org" });
  put("refLinks/linkOldToken1234567890", { appId: "a1", slot: 2, applicant: "Georgia Thurmond", first: "Georgia", refName: "Sam Ortiz", createdAt: now - 90 * day, expiresAt: now - day, by: "dkota@pvrs.org" });
  put("refLinks/linkUsedToken12345678", { appId: "a1", slot: 2, applicant: "Georgia Thurmond", first: "Georgia", refName: "Sam Ortiz", createdAt: now - 9 * day, expiresAt: now + 50 * day, by: "dkota@pvrs.org", submittedAt: now - day });
  put("submissions/sub1", { v: 1, status: "new", submittedAt: now - 6e4, hp: "", person: { first: "Test", last: "Online", email: "test.online@example.com", phone: "315-555-0100", dob: "2004-01-01", birthplace: "", permAddr: { street: "1 Main", city: "Potsdam", state: "NY", zip: "13676" }, localAddr: null, dlState: "NY", dlNumber: "T-1", type: "Regular" },
    education: {}, experience: { certs: [] }, employment: { jobs: [] }, background: { convicted: "no" }, references: [{ name: "R One", relationship: "Coach", email: "r1@example.com", phone: "1", address: "" }, { name: "R Two", relationship: "Boss", email: "r2@example.com", phone: "2", address: "" }, { name: "R Three", relationship: "Teacher", email: "r3@example.com", phone: "3", address: "" }],
    signature: { confirmed: true, name: "Test Online" }, heard: { source: "Social media", detail: "Instagram" } });
  put("vault/v1", { appId: "a2", appName: "Marcus Bell", label: "Medical documentation", name: "physical.pdf", path: "confidential/a2/1.pdf", size: 1000, uploadedAt: now - 36e5, uploadedBy: "marcus.bell@example.com", from: "applicant" });
}
