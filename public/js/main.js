import { auth, db, onAuthStateChanged, setDoc, deleteDoc, onSnapshot, signOut, GoogleAuthProvider, signInWithPopup, sendSignInLinkToEmail,
  createUserWithEmailAndPassword, sendEmailVerification, updateProfile,
  isSignInWithEmailLink, signInWithEmailLink, signInWithEmailAndPassword, sendPasswordResetEmail, doc, getDoc, getDocs, collection, query, where, limit } from "./fb.js";
import { $, lower, toast } from "./shared.js";
import { OWNER_EMAIL, CONTACT_EMAIL, PAPERWORK_EMAIL } from "./config.js";
import { startDesk } from "./desk.js";
import { startPortal } from "./portal.js";
import { startApply } from "./apply.js";
import { startVault } from "./vault.js";
import { startReference } from "./reference.js";
import { startWeather } from "./weather.js";
import { startSchedule } from "./schedule.js";

const LINK_KEY = "pvrsEmailForSignIn";
const VIEWS = ["loading","home","apply","signin","confirm","verify","noaccess","app","portal","vault","reference","schedule"];
const PUBLIC = ["home","apply","signin","confirm"];
const show = id => {
  VIEWS.forEach(v => { $("#" + v).hidden = v !== id; });
  $("#pubnav").hidden = !PUBLIC.includes(id);
  $("#navApply").classList.toggle("on", id === "apply"); $("#navSignin").classList.toggle("on", id === "signin");
  if (id === "signin") paintWelcome();
  document.title = id === "apply" ? "Apply · PVRS Membership" : id === "home" ? "PVRS Membership" : id === "vault" ? "Confidential paperwork · PVRS" : id === "reference" ? "Reference · Potsdam Volunteer Rescue Squad" : "PVRS Membership Desk";
};

// Sign-in welcome panel: time-of-day greeting, today's date, Potsdam weather.
function paintWelcome(){
  const h = new Date().getHours();
  $("#greet").textContent = h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  $("#todayLine").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) + " · Potsdam, New York";
  startWeather($("#wx"));
}

// Public pages: / (choose), /apply (the application form, also the link for the squad website), /signin.
// Signed-in people go to their own area, except on /apply, which always shows the form.
let currentUser = null, homeView = null;
const pathNow = () => (location.pathname.replace(/\/+$/, "") || "/");
function routePublic(){
  const p = pathNow();
  if (p === "/apply") { show("apply"); startApply(); return; }
  if (p.startsWith("/ref/")) { show("reference"); startReference(p.slice(5)); return; }   // a reference's private link
  if (currentUser) { if (homeView) show(homeView); else startFor(currentUser); return; }
  show(p === "/signin" ? "signin" : "home");
}
function navTo(path){ if (path !== pathNow()) history.pushState(null, "", path); routePublic(); window.scrollTo(0, 0); }
document.addEventListener("click", e => {
  const a = e.target.closest("[data-nav]"); if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault(); navTo(a.dataset.nav);
});
addEventListener("popstate", routePublic);
const store = { get(){ try { return localStorage.getItem(LINK_KEY); } catch { return null; } }, set(v){ try { localStorage.setItem(LINK_KEY, v); } catch {} }, clear(){ try { localStorage.removeItem(LINK_KEY); } catch {} } };
export const linkSettings = () => ({ url: location.origin + "/", handleCodeInApp: true });

let finishing = false;
async function finishLink(email){
  finishing = true;
  try { await signInWithEmailLink(auth, lower(email), location.href); store.clear(); history.replaceState(null, "", "/"); }
  catch (e) {
    history.replaceState(null, "", "/");
    toast(e && e.code === "auth/invalid-email" ? "That email doesn't match the sign-in link." : "That sign-in link expired or was already used. Request a new one.");
    show("signin");
  } finally { finishing = false; }
}

if (isSignInWithEmailLink(auth, location.href)) {
  const saved = store.get();
  if (saved) finishLink(saved);
  else { show("confirm"); finishing = true; }
}
$("#confirmForm").addEventListener("submit", e => { e.preventDefault(); const v = $("#confirmEmail").value.trim(); if (v) finishLink(v); });

$("#linkForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = lower($("#linkEmail").value);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Enter a valid email address.");
  const btn = e.target.querySelector("button"); btn.disabled = true;
  try {
    await sendSignInLinkToEmail(auth, email, linkSettings());
    store.set(email);
    const s = $("#linkSent"); s.hidden = false;
    s.innerHTML = `<span>✉️</span><span>Check <b></b> for a sign-in link. It can take a minute, and may land in spam. Open it on this device.</span>`;
    s.querySelector("b").textContent = email;
  } catch { toast("Couldn't send the link. Check the address and try again."); }
  finally { btn.disabled = false; }
});
// Applicant (emailed link) or PVRS staff (email + password, Google as backup). The choice is remembered on this computer.
const pref = { get(k){ try { return localStorage.getItem(k); } catch { return null; } }, set(k, v){ try { localStorage.setItem(k, v); } catch {} } };
function setWho(who){
  $("#whoSeg").querySelectorAll("[data-who]").forEach(b => { const on = b.dataset.who === who; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
  $("#staffSignin").hidden = who !== "staff"; $("#appSignin").hidden = who !== "applicant";
  pref.set("pvrsWho", who);
}
setWho(pref.get("pvrsWho") === "staff" ? "staff" : "applicant");
$("#pwEmail").value = pref.get("pvrsStaffEmail") || "";
if (pref.get("pvrsStaffEmail")) $("#manualSignin").open = true;   // they've used a password here before
$("#whoSeg").addEventListener("click", e => { const b = e.target.closest("[data-who]"); if (b) { setWho(b.dataset.who); (b.dataset.who === "staff" ? ($("#manualSignin").open ? ($("#pwEmail").value ? $("#pwPass") : $("#pwEmail")) : $("#googleBtn")) : $("#linkEmail")).focus(); } });
$("#pwForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = lower($("#pwEmail").value), pw = $("#pwPass").value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !pw) return toast("Enter your email and password.");
  const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
  try { await signInWithEmailAndPassword(auth, email, pw); pref.set("pvrsStaffEmail", email); $("#pwPass").value = ""; }
  catch (err) {
    const c = err && err.code;
    toast(c === "auth/too-many-requests" ? "Too many tries. Wait a few minutes, or use Forgot password."
      : c === "auth/network-request-failed" ? "No connection. Check your internet and try again."
      : "Email or password is incorrect. New here? Choose Create account.");
    $("#pwPass").select();
  } finally { btn.disabled = false; }
});
$("#pwForgot").addEventListener("click", async () => {
  const email = lower($("#pwEmail").value);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("#pwEmail").focus(); return toast("Enter your email first, then click Forgot password."); }
  try { await sendPasswordResetEmail(auth, email); } catch {}
  toast(`If ${email} has a password, a reset link is on its way.`);
});
// Email + password: sign in, or create an account. New accounts confirm their email first (the rules ignore unconfirmed
// addresses), then request access like Google users; nobody sees anything until the owner approves them.
function setPwMode(m){
  $("#pwMode").querySelectorAll("[data-pwmode]").forEach(b => { const on = b.dataset.pwmode === m; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
  $("#pwForm").hidden = m !== "in"; $("#signupForm").hidden = m !== "new";
}
$("#pwMode").addEventListener("click", e => { const b = e.target.closest("[data-pwmode]"); if (b) { setPwMode(b.dataset.pwmode); (b.dataset.pwmode === "new" ? $("#newName") : $("#pwEmail")).focus(); } });
const verifySettings = () => ({ url: location.origin + "/signin" });
$("#signupForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("#newName").value.trim(), email = lower($("#newEmail").value), pw = $("#newPass").value;
  if (name.length < 2) { $("#newName").focus(); return toast("Enter your full name."); }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("#newEmail").focus(); return toast("Enter a valid email address."); }
  if (pw.length < 10) { $("#newPass").focus(); return toast("Use at least 10 characters for your password."); }
  if (pw !== $("#newPass2").value) { $("#newPass2").select(); return toast("The two passwords don't match."); }
  const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
  wantsAccess = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    pref.set("pvrsStaffEmail", email);
    await updateProfile(cred.user, { displayName: name.slice(0, 100) }).catch(() => {});
    await sendEmailVerification(cred.user, verifySettings());
    $("#newPass").value = $("#newPass2").value = "";
    showVerify(cred.user);
  } catch (err) {
    const c = err && err.code;
    toast(c === "auth/email-already-in-use" ? "There's already an account with that email. Sign in instead (or Continue with Google if that's how you joined), or use Forgot your password."
      : c === "auth/weak-password" ? "Choose a stronger password."
      : c === "auth/too-many-requests" ? "Too many tries. Wait a few minutes and try again."
      : c === "auth/network-request-failed" ? "No connection. Check your internet and try again."
      : "Couldn't create the account. Check your details and try again.");
  } finally { btn.disabled = false; }
});
// Waiting for the new account's email to be confirmed: checks every few seconds and carries on by itself.
let verifyTimer = null, lastResend = 0;
function showVerify(user){
  $("#verifyMsg").textContent = `We sent a link to ${user.email}. Open it to confirm your address, then come back to this page. It can take a minute, and may land in spam.`;
  show("verify");
  clearInterval(verifyTimer);
  verifyTimer = setInterval(() => checkVerified(false), 4000);
}
async function checkVerified(manual){
  const u = auth.currentUser; if (!u) { clearInterval(verifyTimer); return; }
  try { await u.reload(); } catch {}
  if (!auth.currentUser || !auth.currentUser.emailVerified) { if (manual) toast("Not confirmed yet. Open the link in the email we sent, then try again."); return; }
  clearInterval(verifyTimer);
  await auth.currentUser.getIdToken(true);   // the security rules read the confirmed status from a fresh token
  started = false; startFor(auth.currentUser);
}
$("#verifyDone").addEventListener("click", () => checkVerified(true));
$("#verifyResend").addEventListener("click", async () => {
  if (Date.now() - lastResend < 30000) return toast("Just sent. Give it a minute and check your spam folder.");
  lastResend = Date.now();
  try { await sendEmailVerification(auth.currentUser, verifySettings()); toast("Sent again. Check your inbox."); }
  catch (err) { toast(err && err.code === "auth/too-many-requests" ? "Too many emails for now. Try again in a few minutes." : "Couldn't send the email. Try again."); }
});
// Not on the team, not an applicant: offer to request team access (the owner approves in Settings → Team).
let wantsAccess = false;
$("#reqAccessBtn").addEventListener("click", () => { wantsAccess = true; $("#googleBtn").click(); });
$("#reqEmailBtn").addEventListener("click", () => { $("#manualSignin").open = true; setPwMode("new"); $("#newName").focus(); $("#signupForm").scrollIntoView({ block: "center", behavior: "smooth" }); });
function showNoAccess(user, email, req){
  const T = $("#noaccessTitle"), M = $("#noaccessMsg"), B = $("#accessBox");
  B.innerHTML = "";
  if (req && req.status === "pending") {
    T.textContent = "Access requested";
    M.textContent = `Thank you${req.name ? ", " + req.name.split(" ")[0] : ""}. The membership coordinator will review your request for ${email}. This page opens the desk automatically once you're approved.`;
    B.innerHTML = `<button class="copy" type="button" id="reqWithdraw">Withdraw request</button>`;
    $("#reqWithdraw").onclick = async () => { try { await deleteDoc(doc(db, "accessRequests", email)); showNoAccess(user, email, null); } catch { toast("Couldn't withdraw. Try again."); } };
    onSnapshot(doc(db, "staff", email), s => { if (s.exists()) location.reload(); }, () => {});
  } else if (req && req.status === "denied") {
    T.textContent = "Access not approved";
    M.textContent = `Your request for ${email} wasn't approved. If you think that's a mistake, contact ${CONTACT_EMAIL}.`;
  } else {
    T.textContent = wantsAccess ? "Request team access" : "No application or team access found";
    M.textContent = wantsAccess ? `Each request is reviewed by the membership coordinator. You're signed in as ${email}.`
      : `Applicants: sign in with the email address on your application, or contact ${CONTACT_EMAIL}. PVRS team members: request access below.`;
    B.innerHTML = `<form id="reqForm" class="field" novalidate>
        <label for="reqName">Your name</label><input id="reqName" type="text" maxlength="100" autocomplete="name" required>
        <label for="reqNote">Your role at PVRS <span style="font-weight:400;color:var(--fg3)">(optional)</span></label><input id="reqNote" type="text" maxlength="300" placeholder="e.g. Membership committee">
        <button class="btn primary block" type="submit">Request team access</button></form>`;
    $("#reqName").value = user.displayName || "";
    $("#reqForm").onsubmit = async e => {
      e.preventDefault();
      const name = $("#reqName").value.trim(); if (!name) { $("#reqName").focus(); return toast("Enter your name."); }
      const data = { email, name: name.slice(0, 100), note: $("#reqNote").value.trim().slice(0, 300), requestedAt: Date.now(), status: "pending" };
      try {
        if (req) await deleteDoc(doc(db, "accessRequests", email)).catch(() => {});   // an old approved request from before they were removed
        await setDoc(doc(db, "accessRequests", email), data);
        showNoAccess(user, email, data); toast("Request sent. You'll be let in once it's approved.");
      } catch (err) { console.error(err); toast("Couldn't send the request. Try again."); }
    };
  }
  show("noaccess");
}
$("#googleBtn").addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { if (e && e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") toast("Google sign-in didn't finish. Try again."); }
});
document.addEventListener("click", async e => { if (e.target.closest("[data-signout]")) { await signOut(auth); location.replace("/signin"); } });

let started = false;
onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  if (!user) {
    if (!finishing) routePublic();
    let idle = null; try { idle = sessionStorage.getItem("pvrsIdle"); sessionStorage.removeItem("pvrsIdle"); } catch {}
    if (idle) toast(`Signed out after ${idle} minutes without activity, to protect applicant information.`);
    return;
  }
  if (pathNow() === "/apply") { show("apply"); startApply(); return; }   // the form, even when signed in
  if (pathNow().startsWith("/ref/")) { routePublic(); return; }
  startFor(user);
});
async function startFor(user){
  if (started) return; started = true;
  show("loading");
  if (!user.emailVerified) return showVerify(user);   // a new email/password account that hasn't confirmed its address yet
  const email = lower(user.email);
  try {
    if (email === lower(PAPERWORK_EMAIL)) { homeView = "vault"; show("vault"); return startVault(email); }
    if (email === lower(OWNER_EMAIL)) { homeView = "app"; show("app"); return startDesk({ email, role: "admin", owner: true, name: user.displayName || "", photo: user.photoURL || "", schedule: true, scheduler: true }); }
    const staff = await getDoc(doc(db, "staff", email));
    if (staff.exists()) {
      const sd = staff.data();
      homeView = "app"; show("app");
      return startDesk({
        email,
        role: sd.role === "admin" ? "admin" : "member",
        owner: false,
        name: sd.name || user.displayName || "",
        photo: user.photoURL || "",
        schedule: !!sd.schedule,
        scheduler: !!sd.scheduler || sd.role === "admin",
      });
    }
    const p = await getDocs(query(collection(db, "portal"), where("email", "==", email), limit(1)));
    if (!p.empty) { homeView = "portal"; show("portal"); return startPortal(p.docs[0].id, email); }
    const req = await getDoc(doc(db, "accessRequests", email));
    homeView = "noaccess"; showNoAccess(user, email, req.exists() ? req.data() : null);
  } catch (err) {
    console.error(err);
    $("#noaccessMsg").textContent = `Something went wrong loading your account. Try again, or contact ${CONTACT_EMAIL}.`;
    homeView = "noaccess"; show("noaccess");
  }
}
