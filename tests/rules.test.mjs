// Security-rule tests against the Firestore + Storage emulators. Run with tests/run-rules.sh.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, collection, collectionGroup, writeBatch, runTransaction, query, where } from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";
import fs from "node:fs";

const env = await initializeTestEnvironment({ projectId: "pvrs-rules-test",
  firestore: { rules: fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
  storage: { rules: fs.readFileSync(new URL("../storage.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 9199 } });
const ctx = email => env.authenticatedContext(email, { email, email_verified: true });
const fsOf = email => ctx(email).firestore();
const owner = fsOf("dkota@pvrs.org"), admin = fsOf("admin@pvrs.org"), member = fsOf("member@pvrs.org"), applicant = fsOf("app@example.com"),
  stranger = fsOf("x@example.com"), paper = fsOf("orientationpaperwork@pvrs.org"), anon = env.unauthenticatedContext().firestore();
const DAY = 864e5, now = () => Date.now();

await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, "staff/admin@pvrs.org"), { role: "admin" });
  await setDoc(doc(db, "staff/member@pvrs.org"), { role: "member" });
  await setDoc(doc(db, "applicants/a1"), { name: "Test Person" });
  await setDoc(doc(db, "applicants/a1/private/main"), { notes: "private", refs: { r1: { name: "Ref One" } } });
  await setDoc(doc(db, "portal/a1"), { email: "app@example.com", bookingOpen: true, interview: null, refReplace: [2] });
  await setDoc(doc(db, "portalEmails/app@example.com"), { id: "a1", at: 1 });
  await setDoc(doc(db, "refLinks/goodtoken1234567890ab"), { appId: "a1", slot: 1, applicant: "Test Person", first: "Test", refName: "Ref One", createdAt: now(), expiresAt: now() + 60 * DAY, by: "dkota@pvrs.org" });
  await setDoc(doc(db, "refLinks/oldtoken1234567890abc"), { appId: "a1", slot: 2, applicant: "Test Person", first: "Test", refName: "Ref Two", createdAt: now() - 90 * DAY, expiresAt: now() - DAY, by: "dkota@pvrs.org" });
  await setDoc(doc(db, "refLinks/usedtoken123456789abc"), { appId: "a1", slot: 3, applicant: "Test Person", first: "Test", refName: "Ref Three", createdAt: now(), expiresAt: now() + 60 * DAY, by: "dkota@pvrs.org", submittedAt: now() });
});

let pass = 0, fail = 0;
async function t(name, p, ok){ try { await (ok ? assertSucceeds(p) : assertFails(p)); pass++; console.log("  ✓", name); } catch (e) { fail++; console.log("  ✗", name, "-", String(e.message).split("\n")[0]); } }

console.log("Reference links");
await t("anyone with the code can open their link", getDoc(doc(anon, "refLinks/goodtoken1234567890ab")), true);
await t("nobody can list links", getDocs(collection(anon, "refLinks")), false);
await t("an applicant can't list links", getDocs(collection(applicant, "refLinks")), false);
await t("an admin can't make links", setDoc(doc(admin, "refLinks/admintoken1234567890"), { appId: "a1", slot: 1, expiresAt: now() + DAY }), false);
await t("a visitor can't make links", setDoc(doc(anon, "refLinks/anontoken12345678901"), { appId: "a1", slot: 1, expiresAt: now() + DAY }), false);
await t("the owner makes links", setDoc(doc(owner, "refLinks/ownertoken1234567890"), { appId: "a1", slot: 4, applicant: "Test Person", first: "Test", refName: "Ref Four", createdAt: now(), expiresAt: now() + 60 * DAY, by: "dkota@pvrs.org" }), true);
await t("the owner can list links", getDocs(collection(owner, "refLinks")), true);
await t("a visitor can't change a link's details", updateDoc(doc(anon, "refLinks/goodtoken1234567890ab"), { expiresAt: now() + 999 * DAY }), false);
await t("a visitor can't mark a link answered without answering", updateDoc(doc(anon, "refLinks/goodtoken1234567890ab"), { submittedAt: now() }), false);

console.log("Reference answers");
const R = { reliability: 5, flexibility: 4, timeManagement: 4, communication: 5, responsibility: 5, appearance: 4, disposition: 5 };
const ans = (x = {}) => ({ known: "3 years, coach", skills: "Reliable", getAlong: "Well", criticism: "Well", ratings: { ...R }, trustworthy: "yes", reservations: "None", other: "Great", others: "", signName: "Ref One", signDate: "2026-10-19", ...x });
const resp = (x = {}, a = {}) => ({ v: 1, answers: ans(a), submittedAt: now(), hp: "", ...x });
const send = (db, token, body) => { const b = writeBatch(db); b.set(doc(db, "refResponses", token), body); b.update(doc(db, "refLinks", token), { submittedAt: now() }); return b.commit(); };
await t("a rating of 6 is rejected", send(anon, "goodtoken1234567890ab", resp({}, { ratings: { ...R, reliability: 6 } })), false);
await t("a missing rating is rejected", send(anon, "goodtoken1234567890ab", resp({}, { ratings: { reliability: 5 } })), false);
await t("a blank required answer is rejected", send(anon, "goodtoken1234567890ab", resp({}, { known: "" })), false);
await t("a made-up trust answer is rejected", send(anon, "goodtoken1234567890ab", resp({}, { trustworthy: "maybe" })), false);
await t("extra fields are rejected", send(anon, "goodtoken1234567890ab", resp({ appId: "a2" })), false);
await t("a filled honeypot is rejected", send(anon, "goodtoken1234567890ab", resp({ hp: "spam" })), false);
await t("a made-up code is rejected", send(anon, "madeuptoken123456789x", resp()), false);
await t("an expired link is rejected", send(anon, "oldtoken1234567890abc", resp()), false);
await t("an already-answered link is rejected", send(anon, "usedtoken123456789abc", resp()), false);
await t("the reference (no sign-in) can send their answers", send(anon, "goodtoken1234567890ab", resp()), true);
await t("a second response on the same link is rejected", send(anon, "goodtoken1234567890ab", resp({}, { known: "changed" })), false);
await t("overwriting the response is rejected", setDoc(doc(anon, "refResponses/goodtoken1234567890ab"), resp()), false);
await t("the reference can't read answers back", getDoc(doc(anon, "refResponses/goodtoken1234567890ab")), false);
await t("the applicant can't read answers", getDoc(doc(applicant, "refResponses/goodtoken1234567890ab")), false);
await t("an admin can't read raw answers (they're filed in the private record)", getDoc(doc(admin, "refResponses/goodtoken1234567890ab")), false);
await t("the owner reads answers", getDocs(collection(owner, "refResponses")), true);
await t("the owner marks one imported", updateDoc(doc(owner, "refResponses/goodtoken1234567890ab"), { importedAt: now() }), true);

console.log("Privacy (from earlier features)");
await t("an applicant can't read applicant records", getDoc(doc(applicant, "applicants/a1")), false);
await t("an applicant can't read private records", getDoc(doc(applicant, "applicants/a1/private/main")), false);
await t("a member can't read private records", getDoc(doc(member, "applicants/a1/private/main")), false);
await t("an admin can read private records", getDoc(doc(admin, "applicants/a1/private/main")), true);
await t("an admin can't edit private records", updateDoc(doc(admin, "applicants/a1/private/main"), { notes: "x" }), false);
await t("an applicant reads their own portal", getDoc(doc(applicant, "portal/a1")), true);
await t("a stranger can't read the portal", getDoc(doc(stranger, "portal/a1")), false);
await t("a visitor can't read submissions", getDocs(collection(anon, "submissions")), false);
const ref1 = { name: "Ref", relationship: "Coach", phone: "3155550100", email: "r@example.com", address: "" };
const sub = (x = {}, p = {}) => ({ v: 1, status: "new", submittedAt: now(), hp: "", person: { first: "T", last: "A", email: "t@example.com", phone: "3155550199", dob: "2004-01-01", birthplace: "", permAddr: {}, localAddr: null, dlState: "NY", dlNumber: "X1", type: "Regular", ...p },
  education: {}, experience: {}, employment: {}, background: {}, references: [ref1, ref1, ref1], signature: { confirmed: true, name: "T A" }, ...x });
await t("an online application with 3 references and a license is accepted", addDoc(collection(anon, "submissions"), sub()), true);
await t("an online application with 2 references is rejected", addDoc(collection(anon, "submissions"), sub({ references: [ref1, ref1] })), false);
await t("an online application without a license number is rejected", addDoc(collection(anon, "submissions"), sub({}, { dlNumber: "" })), false);
await t("the owner can't open confidential paperwork details", getDocs(collection(owner, "vault")), false);
await t("the paperwork account can", getDocs(collection(paper, "vault")), true);
await t("an applicant can send a replacement reference we asked for", addDoc(collection(applicant, "portal/a1/refUpdates"), { slot: 2, name: "New", relationship: "Coach", email: "n@example.com", phone: "", address: "", at: now(), by: "app@example.com" }), true);
await t("…but not for one we didn't ask about", addDoc(collection(applicant, "portal/a1/refUpdates"), { slot: 1, name: "New", relationship: "Coach", email: "n@example.com", phone: "", address: "", at: now(), by: "app@example.com" }), false);
await t("the owner reads replacement references", getDocs(collectionGroup(owner, "refUpdates")), true);
await t("a stranger can't see interview times", getDocs(collection(stranger, "slots")), false);

console.log("Online application imported once, even with several desks open");
{
  const subId = (await addDoc(collection(anon, "submissions"), sub())).id;
  const desks = [fsOf("dkota@pvrs.org"), fsOf("dkota@pvrs.org"), fsOf("dkota@pvrs.org")];   // three separate connections, like tab + Dock app + laptop
  const claim = (db, n) => runTransaction(db, async tx => {
    const ref0 = doc(db, "submissions", subId), cur = await tx.get(ref0);
    if (cur.data().status !== "new") return false;
    tx.set(doc(db, "applicants", "race" + n), { name: "Race Test" });
    tx.update(ref0, { status: "imported", applicantId: "race" + n, importedAt: now() });
    return true;
  });
  const res = await Promise.all(desks.map(claim));
  let made = 0; await env.withSecurityRulesDisabled(async c => { made = (await getDocs(query(collection(c.firestore(), "applicants"), where("name", "==", "Race Test")))).size; });
  if (res.filter(Boolean).length === 1 && made === 1) { pass++; console.log("  ✓ 3 desks importing the same application at once → exactly 1 applicant"); }
  else { fail++; console.log("  ✗ race produced", made, "applicants", JSON.stringify(res)); }
}

console.log("Reference items are claimed once, even with several desks open");
{
  await env.withSecurityRulesDisabled(async c => {
    const cdb = c.firestore();
    await setDoc(doc(cdb, "portal/a1/refUpdates/claimMe"), { slot: 2, name: "X", relationship: "", email: "x@example.com", phone: "", address: "", at: now(), by: "app@example.com" });
    await setDoc(doc(cdb, "refResponses/claimMeToo"), { v: 1, answers: {}, submittedAt: now(), hp: "" });
  });
  for (const [path, field] of [["portal/a1/refUpdates/claimMe", "appliedAt"], ["refResponses/claimMeToo", "importedAt"]]) {
    const desks = [fsOf("dkota@pvrs.org"), fsOf("dkota@pvrs.org"), fsOf("dkota@pvrs.org")];
    const claim = db => runTransaction(db, async tx => { const r = doc(db, path), cur = await tx.get(r); if (cur.data()[field]) return false; tx.update(r, { [field]: now() }); return true; });
    const res = await Promise.all(desks.map(claim));
    if (res.filter(Boolean).length === 1) { pass++; console.log(`  ✓ 3 desks claiming ${path.split("/")[0] === "portal" ? "a replacement reference" : "reference answers"} → exactly 1 wins`); }
    else { fail++; console.log("  ✗ claim race", path, JSON.stringify(res)); }
  }
}

// Storage rules look up portal/{id} in Firestore. firebase-tools sends that emulator-to-emulator call through
// HTTPS_PROXY and ignores NO_PROXY, so behind a proxy (e.g. a cloud sandbox) the lookup fails and the upload test
// below fails too. Run without a proxy (a Mac, GitHub Actions) or let localhost bypass it.
console.log("Storage");
const st = email => ctx(email).storage(), pdf = new Uint8Array([37, 80, 68, 70]), meta = { contentType: "application/pdf" };
await t("an applicant uploads private paperwork to their folder", uploadBytes(ref(st("app@example.com"), "confidential/a1/1.pdf"), pdf, meta), true);
await t("a stranger can't add files to someone else's folder", uploadBytes(ref(st("x@example.com"), "confidential/a1/2.pdf"), pdf, meta), false);
await t("the owner can add paperwork", uploadBytes(ref(st("dkota@pvrs.org"), "confidential/a1/3.pdf"), pdf, meta), true);
await t("the applicant can't read it back", getBytes(ref(st("app@example.com"), "confidential/a1/1.pdf")), false);
await t("the owner can't open it", getBytes(ref(st("dkota@pvrs.org"), "confidential/a1/1.pdf")), false);
await t("the paperwork account can", getBytes(ref(st("orientationpaperwork@pvrs.org"), "confidential/a1/1.pdf")), true);

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
