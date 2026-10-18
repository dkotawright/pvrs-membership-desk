import { auth, db, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, sendSignInLinkToEmail,
  isSignInWithEmailLink, signInWithEmailLink, doc, getDoc, getDocs, collection, query, where, limit } from "./fb.js";
import { $, lower, toast } from "./shared.js";
import { OWNER_EMAIL, CONTACT_EMAIL } from "./config.js";
import { startDesk } from "./desk.js";
import { startPortal } from "./portal.js";

const LINK_KEY = "pvrsEmailForSignIn";
const VIEWS = ["loading","signin","confirm","noaccess","app","portal"];
const show = id => VIEWS.forEach(v => { $("#" + v).hidden = v !== id; });
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
$("#googleBtn").addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { if (e && e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") toast("Google sign-in didn't finish. Try again."); }
});
document.addEventListener("click", async e => { if (e.target.closest("[data-signout]")) { await signOut(auth); location.replace("/"); } });

let started = false;
onAuthStateChanged(auth, async user => {
  if (!user) {
    if (!finishing) show("signin");
    let idle = null; try { idle = sessionStorage.getItem("pvrsIdle"); sessionStorage.removeItem("pvrsIdle"); } catch {}
    if (idle) toast(`Signed out after ${idle} minutes without activity, to protect applicant information.`);
    return;
  }
  if (started) return; started = true;
  show("loading");
  const email = lower(user.email);
  try {
    if (email === lower(OWNER_EMAIL)) { show("app"); return startDesk({ email, role: "admin", owner: true, name: user.displayName || "" }); }
    const staff = await getDoc(doc(db, "staff", email));
    if (staff.exists()) { show("app"); return startDesk({ email, role: staff.data().role === "admin" ? "admin" : "member", owner: false, name: staff.data().name || user.displayName || "" }); }
    const p = await getDocs(query(collection(db, "portal"), where("email", "==", email), limit(1)));
    if (!p.empty) { show("portal"); return startPortal(p.docs[0].id, email); }
    $("#noaccessMsg").textContent = `We couldn't find an application for ${email}. Sign in with the email address you applied with, or contact ${CONTACT_EMAIL}.`;
    show("noaccess");
  } catch (err) {
    console.error(err);
    $("#noaccessMsg").textContent = `Something went wrong loading your account. Try again, or contact ${CONTACT_EMAIL}.`;
    show("noaccess");
  }
});
