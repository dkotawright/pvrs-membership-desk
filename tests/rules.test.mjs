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
await t("an application saying how they heard about PVRS is accepted", addDoc(collection(anon, "submissions"), sub({ heard: { source: "Social media", detail: "Instagram" } })), true);
await t("a how-they-heard answer with extra fields is rejected", addDoc(collection(anon, "submissions"), sub({ heard: { source: "Social media", evil: "x" } })), false);
await t("the owner can't open confidential paperwork details", getDocs(collection(owner, "vault")), false);
await t("the paperwork account can", getDocs(collection(paper, "vault")), true);
await t("an admin can open confidential paperwork", getDocs(collection(admin, "vault")), true);
await t("a member can't", getDocs(collection(member, "vault")), false);
await t("an applicant can't", getDocs(collection(applicant, "vault")), false);
await t("an admin can't delete it", deleteDoc(doc(admin, "vault/none")), false);
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

console.log("Interviewer role");
await env.withSecurityRulesDisabled(async c => { const db = c.firestore();
  await setDoc(doc(db, "staff/iv@pvrs.org"), { role: "interviewer" });
  await setDoc(doc(db, "applicants/a2"), { name: "Assigned Person", interviewers: ["iv@pvrs.org"] });
});
const iv = fsOf("iv@pvrs.org");
const ivEdit = (db, x) => updateDoc(doc(db, "applicants/a2"), { "iv.why": "Wants to help", updatedAt: now(), updatedBy: x });
await t("a member can't read applicant files", getDoc(doc(member, "applicants/a1")), false);
await t("a member can't list applicants", getDocs(collection(member, "applicants")), false);
await t("an interviewer reads an assigned file", getDoc(doc(iv, "applicants/a2")), true);
await t("an interviewer can't read an unassigned file", getDoc(doc(iv, "applicants/a1")), false);
await t("an interviewer lists only assigned files", getDocs(query(collection(iv, "applicants"), where("interviewers", "array-contains", "iv@pvrs.org"))), true);
await t("an interviewer can't list every file", getDocs(collection(iv, "applicants")), false);
await t("an interviewer fills in an assigned interview", ivEdit(iv, "iv@pvrs.org"), true);
await t("an interviewer can't fill in an unassigned interview", updateDoc(doc(iv, "applicants/a1"), { "iv.why": "x", updatedAt: now(), updatedBy: "iv@pvrs.org" }), false);
await t("an interviewer can't assign themselves elsewhere", updateDoc(doc(iv, "applicants/a2"), { interviewers: ["iv@pvrs.org", "member@pvrs.org"], updatedAt: now(), updatedBy: "iv@pvrs.org" }), false);
await t("an interviewer can't read private records", getDoc(doc(iv, "applicants/a2/private/main")), false);
await t("a member can't fill in interviews any more", ivEdit(member, "member@pvrs.org"), false);
await t("an interviewer logs their own edits", addDoc(collection(iv, "applicants/a2/history"), { at: now(), by: "iv@pvrs.org", changes: [] }), true);
await t("not on files they aren't assigned to", addDoc(collection(iv, "applicants/a1/history"), { at: now(), by: "iv@pvrs.org", changes: [] }), false);
await t("an admin still reads every file", getDocs(collection(admin, "applicants")), true);
await t("any staff member can turn on notifications", setDoc(doc(member, "pushTokens/tokM"), { email: "member@pvrs.org", device: "Mac", at: now() }), true);
await t("applicants can't", setDoc(doc(applicant, "pushTokens/tokA"), { email: "app@example.com", device: "Mac", at: now() }), false);

console.log("Team messaging");
await env.withSecurityRulesDisabled(async c => { const db = c.firestore();
  await setDoc(doc(db, "channels/ch1"), { name: "interview-team", color: "int", members: ["dkota@pvrs.org", "admin@pvrs.org"], names: {}, createdAt: 1, createdBy: "dkota@pvrs.org", updatedAt: 1 });
  await setDoc(doc(db, "channels/ch1/posts/p1"), { text: "hi", by: "admin@pvrs.org", name: "Casey", at: 1 });
  await setDoc(doc(db, "portal/a1/messages/m1"), { text: "question", from: "applicant", by: "app@example.com", name: "Test", at: 1 });
});
const post = (by, x = {}) => ({ text: "hello", by, name: "X", at: now(), ...x });
const chMsg = (by, x = {}) => ({ text: "reply", from: "staff", by, name: "X", at: now(), ...x });
await t("only the owner creates channels", setDoc(doc(admin, "channels/ch2"), { name: "x", members: ["admin@pvrs.org"] }), false);
await t("the owner creates a channel", setDoc(doc(owner, "channels/ch3"), { name: "board", color: "appr", members: ["dkota@pvrs.org", "member@pvrs.org"], names: {}, createdAt: now(), createdBy: "dkota@pvrs.org", updatedAt: now() }), true);
await t("a channel member lists their channels", getDocs(query(collection(admin, "channels"), where("members", "array-contains", "admin@pvrs.org"))), true);
await t("a member can't list every channel", getDocs(collection(member, "channels")), false);
await t("a channel member reads its posts", getDocs(collection(admin, "channels/ch1/posts")), true);
await t("someone not in the channel can't read its posts", getDocs(collection(member, "channels/ch1/posts")), false);
await t("an applicant can't read squad channels", getDocs(collection(applicant, "channels/ch1/posts")), false);
await t("a channel member posts as themselves", addDoc(collection(admin, "channels/ch1/posts"), post("admin@pvrs.org")), true);
await t("nobody posts as someone else", addDoc(collection(admin, "channels/ch1/posts"), post("dkota@pvrs.org")), false);
await t("someone not in the channel can't post", addDoc(collection(member, "channels/ch1/posts"), post("member@pvrs.org")), false);
await t("a member can't add themselves to a channel", updateDoc(doc(member, "channels/ch1"), { members: ["dkota@pvrs.org", "admin@pvrs.org", "member@pvrs.org"] }), false);
await t("an admin not in the conversation can't read applicant messages", getDocs(collection(admin, "portal/a1/messages")), false);
await t("admins can't load every conversation at once", getDocs(collectionGroup(admin, "messages")), false);
await t("the owner can", getDocs(collectionGroup(owner, "messages")), true);
await t("only the owner adds people to a conversation", setDoc(doc(admin, "convos/a1"), { members: ["admin@pvrs.org"], names: {}, updatedAt: now() }), false);
await t("the owner adds an admin to a conversation", setDoc(doc(owner, "convos/a1"), { members: ["admin@pvrs.org"], names: {}, updatedAt: now() }), true);
await t("a conversation member reads it", getDocs(collection(admin, "portal/a1/messages")), true);
await t("a conversation member replies as staff", addDoc(collection(admin, "portal/a1/messages"), chMsg("admin@pvrs.org")), true);
await t("someone not in it can't reply", addDoc(collection(member, "portal/a1/messages"), chMsg("member@pvrs.org")), false);
await t("an applicant can't write as staff", addDoc(collection(applicant, "portal/a1/messages"), chMsg("app@example.com")), false);
await t("you keep your own read marks", setDoc(doc(admin, "chatReads/admin@pvrs.org"), { "c:ch1": now() }), true);
await t("not someone else's", setDoc(doc(admin, "chatReads/dkota@pvrs.org"), { "c:ch1": now() }), false);
await t("applicants have no read marks", setDoc(doc(applicant, "chatReads/app@example.com"), { x: 1 }), false);

console.log("Interviewer availability, applicant alerts, channel extras");
const mySlot = (host, x = {}) => ({ start: now() + 5 * DAY, duration: 30, location: "Station", bookedBy: null, createdAt: now(), host, hostName: "Ivy", ...x });
await t("an interviewer offers their own time", setDoc(doc(iv, "slots/ivs1"), mySlot("iv@pvrs.org")), true);
await t("not a time for someone else", setDoc(doc(iv, "slots/ivs2"), mySlot("admin@pvrs.org")), false);
await t("not one that's already booked", setDoc(doc(iv, "slots/ivs3"), mySlot("iv@pvrs.org", { bookedBy: "a2" })), false);
await t("a member can't offer times", setDoc(doc(member, "slots/ms1"), mySlot("member@pvrs.org")), false);
await t("an interviewer can't book for an applicant", updateDoc(doc(iv, "slots/ivs1"), { bookedBy: "a2" }), false);
await t("nobody else deletes it", deleteDoc(doc(admin, "slots/ivs1")), false);
await t("the interviewer deletes their open time", deleteDoc(doc(iv, "slots/ivs1")), true);
const aTok = (x = {}) => ({ appId: "a1", email: "app@example.com", device: "iPhone", at: now(), ...x });
await t("an applicant turns on alerts for their own file", setDoc(doc(applicant, "applicantTokens/t1"), aTok()), true);
await t("not for someone else's file", setDoc(doc(stranger, "applicantTokens/t2"), aTok({ email: "x@example.com" })), false);
await t("a stranger can't read applicant devices", getDoc(doc(stranger, "applicantTokens/t1")), false);
const pFile = { name: "sheet.pdf", path: "chat/ch1/1-sheet.pdf", size: 10, type: "application/pdf" };
await t("a channel member posts a file with no text", addDoc(collection(admin, "channels/ch1/posts"), post("admin@pvrs.org", { text: "", file: pFile })), true);
await t("a file must live in that channel's folder", addDoc(collection(admin, "channels/ch1/posts"), post("admin@pvrs.org", { text: "", file: { ...pFile, path: "records/a1/x.pdf" } })), false);
await t("an empty post with no file is rejected", addDoc(collection(admin, "channels/ch1/posts"), post("admin@pvrs.org", { text: "" })), false);
await t("a channel member reacts", updateDoc(doc(admin, "channels/ch1/posts/p1"), { reactions: { "👍": ["admin@pvrs.org"] } }), true);
await t("a reaction can't change the text", updateDoc(doc(admin, "channels/ch1/posts/p1"), { text: "changed" }), false);
await t("someone not in the channel can't react", updateDoc(doc(member, "channels/ch1/posts/p1"), { reactions: {} }), false);
await t("staff share online status", setDoc(doc(member, "presence/member@pvrs.org"), { at: now(), typing: "", typingAt: 0 }), true);
await t("only their own", setDoc(doc(member, "presence/admin@pvrs.org"), { at: now() }), false);
await t("applicants can't see who's online", getDoc(doc(applicant, "presence/member@pvrs.org")), false);

console.log("Orientation");
await env.withSecurityRulesDisabled(async c => { const db = c.firestore();
  await setDoc(doc(db, "portal/o1"), { email: "new@example.com", orientation: { total: 2, done: 0 }, orient: null, bookingOpen: false, interview: null });
  await setDoc(doc(db, "portalEmails/new@example.com"), { id: "o1", at: 1 });
  await setDoc(doc(db, "orientSlots/os1"), { start: now() + 5 * DAY, duration: 60, location: "Station", bookedBy: null });
  await setDoc(doc(db, "orientSlots/os2"), { start: now() + 5 * DAY, duration: 60, location: "Station", bookedBy: null });
  await setDoc(doc(db, "signoffs/o1"), { name: "New One", trainers: ["member@pvrs.org"], items: [{ key: "rig", label: "Rig" }], done: {} });
  await setDoc(doc(db, "library/d1"), { name: "Handbook", path: "library/d1/h.pdf", roles: ["member"], newMembers: true });
  await setDoc(doc(db, "library/d2"), { name: "Board only", path: "library/d2/b.pdf", roles: ["admin"], newMembers: false });
});
const nm = fsOf("new@example.com");
const bookO = (db, pid, slot) => { const b = writeBatch(db); b.update(doc(db, "orientSlots", slot), { bookedBy: pid }); b.update(doc(db, "portal", pid), { orient: { slotId: slot, start: 0 } }); return b.commit(); };
await t("an applicant not moved to orientation can't book", bookO(applicant, "a1", "os2"), false);
let startOf; await env.withSecurityRulesDisabled(async c => { startOf = (await getDoc(doc(c.firestore(), "orientSlots/os1"))).data().start; });
const bookNm = () => { const b = writeBatch(nm); b.update(doc(nm, "orientSlots", "os1"), { bookedBy: "o1" }); b.update(doc(nm, "portal", "o1"), { orient: { slotId: "os1", start: startOf, duration: 60, location: "Station", bookedAt: now() } }); return b.commit(); };
await t("a new member books their own orientation", bookNm(), true);
await t("a stranger can't read orientation times", getDocs(collection(stranger, "orientSlots")), false);
await t("only the owner adds orientation times", setDoc(doc(admin, "orientSlots/os3"), { start: 1 }), false);
await t("a new member can't edit their checklist", updateDoc(doc(nm, "portal/o1"), { orientation: { total: 2, done: 2 } }), false);
await t("a trainer reads their sign-off list", getDoc(doc(member, "signoffs/o1")), true);
await t("someone else can't", getDoc(doc(iv, "signoffs/o1")), false);
await t("a trainer signs off", updateDoc(doc(member, "signoffs/o1"), { done: { rig: { by: "member@pvrs.org", name: "M", at: now() } }, updatedAt: now() }), true);
await t("a trainer can't add trainers", updateDoc(doc(member, "signoffs/o1"), { trainers: ["member@pvrs.org", "iv@pvrs.org"] }), false);
await t("a trainer still can't open the file", getDoc(doc(member, "applicants/o1")), false);
const ci = (x = {}) => ({ rating: 4, going: "Good", help: "", at: now(), ...x });
await t("a new member answers a check-in", setDoc(doc(nm, "portal/o1/checkins/30"), ci()), true);
await t("and can't change it", setDoc(doc(nm, "portal/o1/checkins/30"), ci({ rating: 1 })), false);
await t("a rating of 9 is rejected", setDoc(doc(nm, "portal/o1/checkins/90"), ci({ rating: 9 })), false);
await t("an admin reads check-ins", getDocs(collectionGroup(admin, "checkins")), true);
await t("a member can't", getDocs(collectionGroup(member, "checkins")), false);

console.log("Orientation forms signed on the phone");
const png = "data:image/png;base64,iVBORw0KGgo=";
const signed = (x = {}) => ({ key: "confidentiality", title: "Confidentiality Statement", values: {}, name: "New Member", sig: png, signedAt: now(), by: "new@example.com", ...x });
const hepV = (x = {}) => ({ appId: "o1", appName: "New Member", label: "Hepatitis B vaccine declination (signed on phone)", name: "Hep B (signed).pdf", path: "", size: 0, contentType: "form", uploadedAt: now(), uploadedBy: "new@example.com", from: "applicant",
  form: { key: "hepb", title: "Hepatitis B Vaccine Declination Form", values: {}, name: "New Member", sig: png, signedAt: now(), by: "new@example.com" }, ...x });
await t("a new member can't sign before signing is opened", setDoc(doc(nm, "portal/o1/forms/confidentiality"), signed()), false);
await t("or send the Hep B declination", addDoc(collection(nm, "vault"), hepV()), false);
await t("a new member can't open signing themselves", updateDoc(doc(nm, "portal/o1"), { signUntil: now() + 36e5 }), false);
await t("the owner opens signing", setDoc(doc(owner, "portal/o1"), { signUntil: now() + 3 * 36e5 }, { merge: true }), true);
await t("now the new member signs", setDoc(doc(nm, "portal/o1/forms/confidentiality"), signed()), true);
await t("but can't change a signed form", setDoc(doc(nm, "portal/o1/forms/confidentiality"), signed({ name: "Someone Else" })), false);
await t("a form with no signature is rejected", setDoc(doc(nm, "portal/o1/forms/bylaws"), signed({ key: "bylaws", sig: "" })), false);
await t("a made-up form is rejected", setDoc(doc(nm, "portal/o1/forms/other"), signed({ key: "other" })), false);
await t("signing as someone else is rejected", setDoc(doc(nm, "portal/o1/forms/bylaws"), signed({ key: "bylaws", by: "x@example.com" })), false);
await t("the Hep B declination can't be left where the squad reads", setDoc(doc(nm, "portal/o1/forms/hepb"), signed({ key: "hepb" })), false);
await t("another applicant can't sign in this file", setDoc(doc(applicant, "portal/o1/forms/bylaws"), signed({ key: "bylaws", by: "app@example.com" })), false);
await t("the Hep B declination goes to the vault", addDoc(collection(nm, "vault"), hepV()), true);
await t("the new member reads their signed form", getDoc(doc(nm, "portal/o1/forms/confidentiality")), true);
await t("the new member can't countersign", updateDoc(doc(nm, "portal/o1/forms/confidentiality"), { witness: { name: "Me", by: "new@example.com", at: now() } }), false);
await t("the owner countersigns", updateDoc(doc(owner, "portal/o1/forms/confidentiality"), { witness: { name: "Dkota", by: "dkota@pvrs.org", at: now() } }), true);
await t("the owner can't rewrite the signature", updateDoc(doc(owner, "portal/o1/forms/confidentiality"), { sig: png + "x" }), false);
await t("an admin reads signed forms", getDocs(collectionGroup(admin, "forms")), true);
await t("a member can't", getDocs(collectionGroup(member, "forms")), false);
await t("signing closes again", setDoc(doc(owner, "portal/o1"), { signUntil: 0 }, { merge: true }), true);
await t("and then nothing more can be signed", setDoc(doc(nm, "portal/o1/forms/bylaws"), signed({ key: "bylaws" })), false);
const upErr = (x = {}) => ({ name: "notes.txt", size: 3, type: "text/plain", label: "Other", code: "wrong-type", message: "Not a PDF, photo or Word file", at: now(), by: "new@example.com", device: "iPhone", ...x });
await t("a refused upload leaves a note", addDoc(collection(nm, "portal/o1/uploadErrors"), upErr()), true);
await t("not in someone else's file", addDoc(collection(applicant, "portal/o1/uploadErrors"), upErr({ by: "app@example.com" })), false);
await t("an admin reads the notes", getDocs(collectionGroup(admin, "uploadErrors")), true);
await t("a member can't", getDocs(collectionGroup(member, "uploadErrors")), false);
await t("a member lists documents for members", getDocs(query(collection(member, "library"), where("roles", "array-contains", "member"))), true);
await t("not board-only ones", getDoc(doc(member, "library/d2")), false);
await t("a new member lists documents meant for them", getDocs(query(collection(nm, "library"), where("newMembers", "==", true))), true);
await t("a stranger can't", getDocs(query(collection(stranger, "library"), where("newMembers", "==", true))), false);
await t("only the owner adds documents", setDoc(doc(admin, "library/d3"), { name: "x" }), false);

// Storage rules look up portal/{id} in Firestore. firebase-tools sends that emulator-to-emulator call through
// HTTPS_PROXY and ignores NO_PROXY, so behind a proxy (e.g. a cloud sandbox) the lookup fails and the upload test
// below fails too. Run without a proxy (a Mac, GitHub Actions) or let localhost bypass it.
console.log("Storage");
console.log("Interview coordinator");
await env.withSecurityRulesDisabled(async c => { const db = c.firestore();
  await setDoc(doc(db, "staff/cory@pvrs.org"), { role: "coordinator" });
  await setDoc(doc(db, "applicants/c1"), { name: "Coord Test", sched: {}, updatedBy: "dkota@pvrs.org" });
  await setDoc(doc(db, "applicants/c1/private/main"), { notes: "private", portal: { invited: "2026-11-01" } });
  await setDoc(doc(db, "portal/c1"), { email: "c1@example.com", bookingOpen: false, interview: null, steps: [] });
  await setDoc(doc(db, "slots/cs0"), { start: now() + 3 * DAY, duration: 30, location: "Station", bookedBy: null }); });
const cory = fsOf("cory@pvrs.org");
await t("a coordinator reads every file", getDocs(collection(cory, "applicants")), true);
await t("a coordinator can't open confidential paperwork", getDocs(collection(cory, "vault")), false);
await t("and private records", getDoc(doc(cory, "applicants/c1/private/main")), true);
await t("a coordinator posts a time for someone else", setDoc(doc(cory, "slots/cs1"), { start: now() + 3 * DAY, duration: 30, location: "Station", bookedBy: null, createdAt: now(), host: "admin@pvrs.org", hostName: "Casey" }), true);
await t("an admin still can't", setDoc(doc(admin, "slots/cs2"), { start: now() + 3 * DAY, duration: 30, location: "Station", bookedBy: null, createdAt: now(), host: "cory@pvrs.org", hostName: "Cory" }), false);
await t("a coordinator books an applicant into a time", (() => { const b = writeBatch(cory); b.update(doc(cory, "slots/cs0"), { bookedBy: "c1" }); b.set(doc(cory, "portal/c1"), { interview: { slotId: "cs0", start: 1 } }, { merge: true }); return b.commit(); })(), true);
await t("and releases it", (() => { const b = writeBatch(cory); b.update(doc(cory, "slots/cs0"), { bookedBy: null }); b.set(doc(cory, "portal/c1"), { interview: null }, { merge: true }); return b.commit(); })(), true);
await t("a coordinator sets scheduling dates", updateDoc(doc(cory, "applicants/c1"), { "sched.contacted": "2026-11-10", updatedAt: now(), updatedBy: "cory@pvrs.org" }), true);
await t("an admin can't set scheduling dates", updateDoc(doc(admin, "applicants/c1"), { "sched.contacted": "2026-11-11", updatedAt: now(), updatedBy: "admin@pvrs.org" }), false);
await t("a coordinator assigns interviewers", updateDoc(doc(cory, "applicants/c1"), { interviewers: ["admin@pvrs.org"], updatedAt: now(), updatedBy: "cory@pvrs.org" }), true);
await t("and adds them to the conversation", setDoc(doc(cory, "convos/c1"), { members: ["admin@pvrs.org"], names: {}, updatedAt: now() }), true);
await t("a coordinator can't rename an applicant", updateDoc(doc(cory, "applicants/c1"), { name: "Changed", updatedAt: now(), updatedBy: "cory@pvrs.org" }), false);
await t("or delete one", deleteDoc(doc(cory, "applicants/c1")), false);
await t("a coordinator opens booking in the private record", updateDoc(doc(cory, "applicants/c1/private/main"), { "portal.bookingOpen": "yes", secUpdatedAt: now(), secUpdatedBy: "cory@pvrs.org" }), true);
await t("but can't touch notes", updateDoc(doc(cory, "applicants/c1/private/main"), { notes: "x", secUpdatedAt: now(), secUpdatedBy: "cory@pvrs.org" }), false);
await t("or the portal invite", updateDoc(doc(cory, "applicants/c1/private/main"), { "portal.invited": "", secUpdatedAt: now(), secUpdatedBy: "cory@pvrs.org" }), false);
await t("or board votes", updateDoc(doc(cory, "applicants/c1/private/main"), { board: { result: "approved" }, secUpdatedAt: now(), secUpdatedBy: "cory@pvrs.org" }), false);
await t("a coordinator opens booking on the applicant's page", updateDoc(doc(cory, "portal/c1"), { bookingOpen: true, updatedAt: now() }), true);
await t("but can't change what else the applicant sees", updateDoc(doc(cory, "portal/c1"), { docs: [{ key: "x", label: "Anything", received: true }], refs: [] }), false);
await t("or whose page it is", updateDoc(doc(cory, "portal/c1"), { email: "cory@pvrs.org" }), false);
await t("a coordinator reads every applicant conversation", getDocs(collectionGroup(cory, "messages")), true);
await t("and replies", setDoc(doc(cory, "portal/c1/messages/m1"), { text: "You're booked", from: "staff", by: "cory@pvrs.org", name: "Cory", at: now() }), true);
await t("a coordinator's desk updates the stage label", updateDoc(doc(cory, "applicants/c1"), { stage: "int" }), true);
await t("but not to something made up", updateDoc(doc(cory, "applicants/c1"), { stage: "vip" }), false);
await t("an admin can't change the stage", updateDoc(doc(admin, "applicants/c1"), { stage: "appr" }), false);
await t("a coordinator's desk refreshes the applicant's steps", updateDoc(doc(cory, "portal/c1"), { steps: [{ label: "Interview", state: "now" }], updatedAt: now() }), true);
await t("an interviewer writes a private impression of someone they interview", setDoc(doc(iv, "applicants/a2/impressions/iv@pvrs.org"), { text: "Good fit", by: "iv@pvrs.org", name: "Ivy", at: now() }), true);
await t("not under someone else's name", setDoc(doc(iv, "applicants/a2/impressions/admin@pvrs.org"), { text: "x", by: "iv@pvrs.org", name: "Ivy", at: now() }), false);
await t("not for an applicant they aren't assigned", setDoc(doc(iv, "applicants/c1/impressions/iv@pvrs.org"), { text: "x", by: "iv@pvrs.org", name: "Ivy", at: now() }), false);
await t("they read their own", getDoc(doc(iv, "applicants/a2/impressions/iv@pvrs.org")), true);
await t("an admin reads every impression", getDocs(collection(admin, "applicants/a2/impressions")), true);
await t("a member can't read impressions", getDoc(doc(member, "applicants/a2/impressions/iv@pvrs.org")), false);
await t("a coordinator can't change roles", setDoc(doc(cory, "staff/cory@pvrs.org"), { role: "admin" }), false);
await t("or settings", setDoc(doc(cory, "settings/main"), { signature: "x" }, { merge: true }), false);

const st = email => ctx(email).storage(), pdf = new Uint8Array([37, 80, 68, 70]), meta = { contentType: "application/pdf" };
await t("an applicant uploads private paperwork to their folder", uploadBytes(ref(st("app@example.com"), "confidential/a1/1.pdf"), pdf, meta), true);
await t("a stranger can't add files to someone else's folder", uploadBytes(ref(st("x@example.com"), "confidential/a1/2.pdf"), pdf, meta), false);
await t("the owner can add paperwork", uploadBytes(ref(st("dkota@pvrs.org"), "confidential/a1/3.pdf"), pdf, meta), true);
await t("the applicant can't read it back", getBytes(ref(st("app@example.com"), "confidential/a1/1.pdf")), false);
await t("the owner can't open it", getBytes(ref(st("dkota@pvrs.org"), "confidential/a1/1.pdf")), false);
await t("the paperwork account can", getBytes(ref(st("orientationpaperwork@pvrs.org"), "confidential/a1/1.pdf")), true);
await t("an admin can open it", getBytes(ref(st("admin@pvrs.org"), "confidential/a1/1.pdf")), true);
await t("a member can't open it", getBytes(ref(st("member@pvrs.org"), "confidential/a1/1.pdf")), false);

await t("a channel member uploads to the channel", uploadBytes(ref(st("admin@pvrs.org"), "chat/ch1/1.pdf"), pdf, meta), true);
await t("someone not in it can't", uploadBytes(ref(st("member@pvrs.org"), "chat/ch1/2.pdf"), pdf, meta), false);
await t("or open its files", getBytes(ref(st("member@pvrs.org"), "chat/ch1/1.pdf")), false);
await t("a channel member opens it", getBytes(ref(st("admin@pvrs.org"), "chat/ch1/1.pdf")), true);

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
