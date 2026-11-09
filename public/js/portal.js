// Applicant portal: status, document uploads, interview booking.
import { app, db, storage, doc, collection, onSnapshot, writeBatch, addDoc, updateDoc, setDoc, deleteDoc, query, where, ref, uploadBytes, getDownloadURL } from "./fb.js";
import { $, esc, toast, timelineHTML, slotDay, slotTime, slotLong, icsFile, download, isConfidential } from "./shared.js";
import { CONTACT_EMAIL, VAPID_KEY } from "./config.js";

const DAY = 864e5, MAX = 15 * 1024 * 1024;
const CONF_KEY = "_private";   // the "Secure document upload" button (not tied to a request)
// Some phones and scanners hand over a file with no type at all, so fall back to the file's ending.
const EXT_TYPE = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp" };
const typeOf = f => f.type || EXT_TYPE[String(f.name || "").split(".").pop().toLowerCase()] || "";
const okType = f => /^image\//.test(typeOf(f)) || typeOf(f) === "application/pdf";
// Say what actually went wrong, so "it won't upload" can be fixed from a single screenshot.
const uploadWhy = e => { const c = String(e?.code || "");
  return /unauthorized|permission-denied|unauthenticated/.test(c) ? "You may be signed in with a different email than the one we have for you. Sign out, then sign in with the address we emailed"
    : /retry-limit|network|unavailable|canceled/.test(c) || !navigator.onLine ? "The connection dropped. Check your signal or Wi-Fi and try again"
    : /quota/.test(c) ? "Our storage is full right now" : "Try again"; };

const msgTime = ms => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export function threadHTML(msgs, mine){
  if (!msgs.length) return `<p class="info thread-empty">No messages yet.</p>`;
  return msgs.map(m => `<div class="msg ${m.from === mine ? "me" : "them"}"><div class="bub">${esc(m.text)}</div>
    <small>${m.from === "staff" ? (mine === "staff" ? esc(m.name || "PVRS") : (m.name && m.name !== "PVRS" ? esc(m.name) + " · " : "") + "PVRS Membership") : (mine === "applicant" ? "You" : esc(m.name || "Applicant"))} · ${esc(msgTime(m.at))}${mine === "staff" && m.from === "staff" && m.seenAt ? " · Seen" : ""}</small></div>`).join("");
}
// Alerts on the applicant's own device (functions/push.js sends them; generic wording, never decisions or results).
const PUSH_KEY = "pvrsApplicantPush", FM_URL = "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
const pushToken = () => { try { return localStorage.getItem(PUSH_KEY) || ""; } catch { return ""; } };
const isIOS = () => /iPhone|iPad/.test(navigator.userAgent);
const deviceName = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : "Computer"; };
async function pushState(){
  if (!VAPID_KEY) return "";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return isIOS() ? "ios" : "";
  try { const m = await import(FM_URL); if (!(await m.isSupported())) return isIOS() ? "ios" : ""; } catch { return ""; }
  if (Notification.permission === "denied") return "blocked";
  return pushToken() ? "on" : "off";
}
function pushHTML(st){
  if (st === "on") return `<div class="pushrow"><span>🔔 Alerts are on for this device.</span><button class="btn small" type="button" data-pushoff>Turn off</button></div>`;
  if (st === "off") return `<div class="pushrow"><span>Get an alert when we reply or your application moves forward.</span><button class="btn small primary" type="button" data-pushon>Turn on alerts</button></div>`;
  if (st === "ios") return `<div class="pushrow"><span>Want alerts on your iPhone? In Safari tap Share → <b>Add to Home Screen</b>, then open PVRS from your Home Screen and sign in.</span></div>`;
  if (st === "blocked") return `<div class="pushrow"><span>Alerts are blocked for this site. You can allow them in your browser's settings.</span></div>`;
  return "";
}
// Orientation card: only there once the owner's desk opens it (board approved and Sterling complete and clear).
function orientHTML(o, { pd, files, oslots, opick, obusy, lib, checkinDone, dis }){
  const now = Date.now(), s = pd.orient, open = oslots.filter(x => !x.bookedBy && x.start > now + DAY).sort((a, b) => a.start - b.start);
  const days = {}; open.forEach(x => { const k = slotDay(x.start); (days[k] = days[k] || []).push(x); });
  const pct = o.total ? Math.round(o.done / o.total * 100) : 0, left = o.due ? Math.round((new Date(o.due + "T12:00") - now) / DAY) : null;
  const uploaded = k => files.filter(f => f.docKey === "onb:" + k).length;
  const session = s ? `<div class="booked"><div class="cal"><b>${esc(new Date(s.start).toLocaleDateString(undefined, { month: "short" }))}</b><span>${new Date(s.start).getDate()}</span></div><div><b>${esc(slotLong(s.start))}</b>${s.location ? `<div class="info">${esc(s.location)}</div>` : ""}</div></div>
      <div class="acts" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn small" type="button" data-oics ${dis}>Add to my calendar</button>${s.start > now + DAY ? `<button class="btn small" type="button" data-ocancel ${dis}>Change time</button>` : ""}</div>`
    : open.length ? `<p class="info" style="margin:0">Pick a time to come in. Orientation is one-on-one with our orientation chair.</p><div class="slots">${Object.entries(days).map(([d, l]) => `<div class="slotday"><h4>${esc(d)}</h4><div class="slotrow">${l.map(x => `<button class="slotbtn" type="button" data-oslot="${esc(x.id)}" aria-pressed="${opick === x.id}" ${dis}>${esc(slotTime(x.start))}</button>`).join("")}</div></div>`).join("")}</div>
        ${opick ? `<div style="display:flex;justify-content:flex-end"><button class="btn primary" type="button" data-obook ${obusy ? "disabled" : ""}>Book this time</button></div>` : ""}`
    : `<p class="info">Times will show up here soon. Questions? Email <b>${esc(CONTACT_EMAIL)}</b>.</p>`;
  const item = i => `<div class="or-item${i.date ? " done" : ""}"><span class="or-ck" aria-hidden="true">${i.date ? "✓" : ""}</span><span class="or-tx">${esc(i.label)}${i.link ? ` <a href="${esc(i.link)}" target="_blank" rel="noopener">Open</a>` : ""}</span>
    ${i.date ? "" : `${uploaded(i.key) ? `<span class="badge wait">Under review</span>` : i.req ? `<span class="badge wait">Requested</span>` : ""}${i.cert || i.req ? `<button class="btn small${i.req && !uploaded(i.key) ? " primary" : ""}" type="button" data-upload="onb:${esc(i.key)}" ${dis}>${isConfidential(i.label) ? "🔒 " : ""}${uploaded(i.key) ? "Add file" : "Upload"}</button>` : ""}`}</div>`;
  const check = pd.checkin && !checkinDone ? `<div class="or-check"><h3>Your ${esc(pd.checkin)}-day check-in</h3><p class="info" style="margin:0">Goes to the orientation chair. It only takes a minute.</p>
      <label class="info">How's it going so far? (1 = not great, 5 = great)</label><div class="slotrow">${[1, 2, 3, 4, 5].map(n => `<button class="slotbtn" type="button" data-crate="${n}" ${dis}>${n}</button>`).join("")}</div>
      <textarea id="ciGoing" rows="2" maxlength="2000" placeholder="Tell us how it's going" aria-label="How it's going" ${dis}></textarea><textarea id="ciHelp" rows="2" maxlength="2000" placeholder="Anything that would help?" aria-label="Anything that would help" ${dis}></textarea>
      <div style="display:flex;justify-content:flex-end"><button class="btn primary" type="button" data-csend ${dis}>Send</button></div></div>` : "";
  return `<section class="card glass" id="orientCard"><h2>Orientation</h2>
    <p class="info" style="margin:0">${o.done} of ${o.total} done${left === null ? "" : left < 0 ? `. This was due ${esc(new Date(o.due + "T12:00").toLocaleDateString())}, so please reach out` : `. Please finish by ${esc(new Date(o.due + "T12:00").toLocaleDateString())}`}.</p>
    <div class="or-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
    <h3 class="or-h">Your session</h3>${session}<h3 class="or-h">Checklist</h3><p class="info" style="margin:0">All of these are required before you can be issued equipment or run calls.</p><div class="or-list">${(o.items || []).map(item).join("")}</div>
    ${lib.length ? `<h3 class="or-h">Documents</h3><div class="docbtns">${lib.map(d => `<button class="btn small" type="button" data-olib="${esc(d.id)}">${esc(d.name)}</button>`).join("")}</div>` : ""}${check}</section>`;
}
export function portalHTML({ pd, files = [], slots = [], msgs = [], preview = false, pick = null, busy = false, refUps = [], refForm = null, refDraft = {}, refSending = false, push = "", oslots = [], opick = null, obusy = false, lib = [], checkinDone = false }){
  const now = Date.now(), nm = !!pd.orientation;   // nm: moved to orientation, so only the orientation dashboard shows
  const docs = pd.docs || [];
  const byKey = k => files.filter(f => f.docKey === k);
  const other = files.filter(f => !f.docKey || !docs.some(d => d.key === f.docKey));
  const iv = pd.interview;
  const ivDone = (pd.steps || []).some(s => s.label === "Interview" && s.state === "done");
  const open = slots.filter(s => !s.bookedBy && s.start > now + DAY).sort((a,b) => a.start - b.start);
  const days = {}; open.forEach(s => { const k = slotDay(s.start); (days[k] = days[k] || []).push(s); });
  const dis = preview ? "disabled" : "";
  const canChange = iv && iv.start > now + DAY;

  const docRows = docs.map(d => {
    const up = byKey(d.key);
    const badge = d.received ? `<span class="badge ok">Received</span>` : up.length ? `<span class="badge wait">Uploaded · under review</span>` : "";
    const conf = isConfidential(d.label);
    return `<div class="doc"><div class="dt">${esc(d.label)}${conf ? `<small class="lockline">🔒 Secure upload: only our orientation paperwork coordinator can open it</small>` : ""}${up.length?`<small>${conf ? `${up.length} file${up.length===1?"":"s"} sent securely` : up.map(f => esc(f.name)).join(", ")}</small>`:""}</div>${badge}
      ${d.received ? "" : `<button class="btn small ${up.length?"":"primary"}" type="button" data-upload="${esc(d.key)}" ${dis}>${up.length?"Add file":"Upload"}</button>`}</div>`;
  }).join("");

  let ivBody;
  if (ivDone) ivBody = `<p class="info">Your interview is complete. Thank you!</p>`;
  else if (iv) {
    const d = new Date(iv.start);
    ivBody = `<div class="booked"><div class="cal"><b>${esc(d.toLocaleDateString(undefined,{month:"short"}))}</b><span>${d.getDate()}</span></div>
      <div class="dt" style="min-width:0"><strong>${esc(slotDay(iv.start))}</strong><div class="info">${esc(slotTime(iv.start))}${iv.duration?` · ${iv.duration} min`:""}${iv.location?`<br>${esc(iv.location)}`:""}</div></div></div>
      ${canChange ? `<div class="acts" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn small" type="button" data-ics ${dis}>Add to my calendar</button><button class="btn small" type="button" data-cancel ${dis}>Cancel interview</button>${pd.bookingOpen && open.length?`<button class="btn small" type="button" data-change ${dis}>Change time</button>`:""}</div>`
        : `<div style="display:flex;justify-content:flex-end"><button class="btn small" type="button" data-ics ${dis}>Add to my calendar</button></div><p class="info">Need to change it? It's less than 24 hours away, so email <b>${esc(CONTACT_EMAIL)}</b>.</p>`}`;
  }
  else if (!pd.bookingOpen) ivBody = `<p class="info">Interview times will open here once your application review is underway. We'll let you know.</p>`;
  else if (!open.length) ivBody = `<p class="info">No interview times are open right now. Check back soon, or email <b>${esc(CONTACT_EMAIL)}</b>.</p>`;
  else ivBody = slotPicker(days, pick, dis, busy);

  return `<div class="wrap">
    <section class="card glass"><div class="plate"><img alt="Potsdam Volunteer Rescue Squad, est. 1955" src="/img/logo.png"></div>
      <div class="ptop"><div><div class="eyebrow">${nm ? "New member" : "Applicant portal"}</div><div class="hello">Hi ${esc(pd.firstName || "there")}</div>
      <div class="info">${nm ? "Welcome to the squad. Here's your orientation." : esc(pd.type ? pd.type + " membership application" : "Membership application")}</div></div>
      ${preview ? `<span class="badge wait">Preview</span>` : `<button class="btn small" type="button" data-signout>Sign out</button>`}</div></section>

${nm ? orientHTML(pd.orientation, { pd, files, oslots, opick, obusy, lib, checkinDone, dis }) : `${ivSoonHTML(iv, ivDone, now, dis)}
    <section class="card glass"><h2>Your application</h2>${trackerHTML(pd.steps || [])}${timelineHTML(pd.steps || [])}</section>`}

    <section class="card glass" id="msgCard"><div class="ptop"><h2>Messages</h2>${msgs.some(m => m.from === "staff" && !m.seenAt) ? `<span class="badge wait">New reply</span>` : ""}</div>
      <p class="info" style="margin:0">${nm ? "Questions about orientation?" : "Questions about your application?"} Send them here. We'll reply in this space, usually within a few days.</p>
      ${pushHTML(push)}<div class="thread" id="thread">${threadHTML(msgs, "applicant")}</div>
      <div class="composer"><textarea id="msgText" rows="2" maxlength="2000" placeholder="Type your question…" aria-label="Your message" ${dis}></textarea>
        <button class="btn primary" type="button" data-send ${dis}>Send</button></div></section>

    ${nm ? "" : `<section class="card glass" id="ivCard"><h2>Interview</h2>${ivBody}${ivDone ? "" : ivPrepHTML(iv)}</section>

    <section class="card glass" id="refCard"><h2>References</h2>${refsBody(pd.refs || [], { ups: refUps, form: refForm, draft: refDraft, sending: refSending, dis })}</section>`}

    <section class="card glass"><h2>Documents</h2>
      ${docs.length ? `<div>${docRows}</div>` : `<p class="info">Nothing needed right now. If we need anything from you, it will show up here.</p>`}
      ${other.filter(f => !f.confidential).length ? `<div class="info"><b>Other files you sent:</b> ${other.filter(f => !f.confidential).map(f => esc(f.name)).join(", ")}</div>` : ""}
      ${other.some(f => f.confidential) ? `<div class="info"><b>Secure documents sent:</b> ${other.filter(f => f.confidential).length} file${other.filter(f => f.confidential).length === 1 ? "" : "s"} 🔒</div>` : ""}
      <div class="docbtns"><button class="btn small" type="button" data-upload="" ${dis}>Send another document</button>
        <button class="btn small" type="button" data-upload="${CONF_KEY}" ${dis}>🔒 Secure document upload</button></div>
      <p class="info" style="margin:0">Use <b>Secure document upload</b> for medical records, your Social Security card and other sensitive papers. Only our orientation paperwork coordinator can open them; the membership committee can't.</p>
      <p class="info" style="margin:0">PDF or photo, up to 15 MB each. Trouble uploading? Email <b>${esc(CONTACT_EMAIL)}</b>.</p></section>

    ${nm ? "" : `<section class="card glass"><h2>What to expect</h2><div class="info">
      <ul><li>Your application goes to the next board meeting once your references and all other prerequisites (interview, driving record and application review) are complete. You'll hear back within about a week of that meeting.</li>
      <li>If the board approves you, the next step is a background check through Sterling Volunteers. Watch for an email from them.</li>
      <li>Members complete orientation (including required medical documentation and online education), self-schedule at least 4 duty crew shifts a month, and attend the monthly membership meeting on the 2nd Tuesday unless excused in advance.</li>
      <li>Monthly training is offered and all members are encouraged to take part.</li></ul>
      <p style="margin:10px 0 0">Questions? Email <b>${esc(CONTACT_EMAIL)}</b>.</p></div></section>`}
  </div>`;
}
// "How to prepare" under the interview card (until the interview is done). Topics follow the committee's question list.
// "Step 3 of 6": a delivery-style progress bar above the status timeline.
function trackerHTML(steps){
  if (!steps.length) return "";
  const done = steps.filter(s => s.state === "done").length, cur = steps.findIndex(s => s.state === "now");
  const at = cur >= 0 ? cur : done >= steps.length ? steps.length - 1 : done;
  const label = done >= steps.length ? "All steps complete" : `Step ${at + 1} of ${steps.length}: ${steps[at].label}`;
  return `<div class="tracker" role="img" aria-label="${esc(label)}"><div class="tk-top"><b>${esc(label)}</b><span>${Math.round(done / steps.length * 100)}%</span></div>
    <div class="tk-bar">${steps.map((s, i) => `<i class="${s.state === "done" ? "done" : i === at && done < steps.length ? "cur" : ""}"></i>`).join("")}</div></div>`;
}
// A reminder at the top of the portal when the interview is within two days.
function ivSoonHTML(iv, ivDone, now, dis){
  if (!iv || ivDone || iv.start <= now || iv.start - now > 2 * DAY) return "";
  const d = new Date(iv.start), today = new Date(now), tmr = new Date(now + DAY);
  const same = (x, y) => x.toDateString() === y.toDateString();
  const when = same(d, today) ? "today" : same(d, tmr) ? "tomorrow" : slotDay(iv.start);
  return `<section class="card glass ivsoon" role="status"><div class="ivs-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
    <div class="ivs-t"><b>Your interview is ${esc(when)} at ${esc(slotTime(iv.start))}</b><span>${esc(iv.location || "PVRS building")} · bring your driver's license</span></div>
    <button class="btn small" type="button" data-ics ${dis}>Add to calendar</button></section>`;
}
function ivPrepHTML(iv){
  const len = iv && iv.duration ? `about ${iv.duration} minutes` : "usually under an hour";
  return `<details class="ivprep"${iv ? " open" : ""}><summary>How to prepare for your interview</summary><div class="info">
    <p><b>What it is:</b> a relaxed sit-down conversation with members of the Membership Committee, ${len}. It's a chance for us to get to know you and for you to ask about the squad. There's no test.</p>
    <p><b>What to bring:</b></p><ul>
      <li>Your driver's license. We verify it in person.</li>
      <li>Any EMS, CPR or first aid cards you hold.</li>
      <li>Your availability: which semesters, breaks and days of the week you're around.</li>
      <li>Your own questions about the squad.</li></ul>
    <p><b>What we'll talk about:</b> a bit about you and your interests, why you want to join PVRS, whether you're a student and here year round, any past fire, rescue or EMS experience, and your certifications.</p>
    <p><b>Tips:</b> neat, comfortable clothes are fine. Please arrive 5–10 minutes early. If something comes up, cancel or change your time here (at least 24 hours ahead) or email <b>${esc(CONTACT_EMAIL)}</b>.</p></div></details>`;
}
// Only names and received/waiting come through; contact details stay with the squad.
// When the squad asks for a different reference, that row gets a short form; what they send replaces it in the squad's file.
function refsBody(refs, { ups = [], form = null, draft = {}, sending = false, dis = "" } = {}){
  if (!refs.length) return `<p class="info" style="margin:0">Once we start contacting your references, you'll see here which ones we've heard from.</p>`;
  const pending = slot => ups.find(u => u.slot === slot && !u.appliedAt);
  const asks = refs.filter(r => r.replace && !pending(r.slot));
  const got = refs.filter(r => r.received).length, need = Math.max(0, 3 - got);   // 3 received is enough (REFS_NEEDED)
  const intro = asks.length
    ? `We need a different reference in place of ${asks.map(r => `<b>${esc(r.name)}</b>`).join(" and ")}. Please give us someone else who knows you well.`
    : need ? `We need 3 references before your application goes to the board. We've heard from ${got} so far, so we need ${need} more. It can help to give your references a quick reminder.` : "We've received the references we need. Thank you!";
  return `<p class="info" style="margin:0">${intro}</p>
    <div>${refs.map(r => {
      if (!r.replace) return `<div class="doc"><div class="dt">${esc(r.name)}</div>${r.received ? `<span class="badge ok">Received</span>` : need ? `<span class="badge wait">Waiting</span>` : `<span class="badge">Not needed</span>`}</div>`;
      const p = pending(r.slot);
      return `<div class="doc"><div class="dt">${esc(r.name)}<small>${p ? `New reference sent: ${esc(p.name)}. We'll update this shortly.` : "Please give us a different reference in place of this one."}</small></div>
        ${p ? `<span class="badge ok">Sent</span>` : form === r.slot ? "" : `<span class="badge wait">Please replace</span><button class="btn small primary" type="button" data-refnew="${r.slot}" ${dis}>Give a new reference</button>`}</div>
        ${!p && form === r.slot ? refFormHTML(draft, sending) : ""}`;
    }).join("")}</div>`;
}
function refFormHTML(d, sending){
  const v = k => esc(d[k] || "");
  return `<div class="refform"><div class="field">
      <label for="rf-name">Their full name</label><input id="rf-name" data-rf="name" type="text" maxlength="200" autocomplete="off" value="${v("name")}">
      <label for="rf-rel">How do they know you?</label><input id="rf-rel" data-rf="relationship" type="text" maxlength="200" placeholder="e.g. Coach, supervisor, teacher" value="${v("relationship")}">
      <label for="rf-email">Their email</label><input id="rf-email" data-rf="email" type="email" maxlength="200" autocomplete="off" value="${v("email")}">
      <label for="rf-phone">Their phone <span style="font-weight:400">(optional)</span></label><input id="rf-phone" data-rf="phone" type="tel" maxlength="40" autocomplete="off" value="${v("phone")}">
      <label for="rf-addr">Their address <span style="font-weight:400">(optional)</span></label><input id="rf-addr" data-rf="address" type="text" maxlength="300" autocomplete="off" value="${v("address")}">
    </div>
    <p class="info" style="margin:0">Let them know we'll be reaching out by email.</p>
    <div class="acts"><button class="btn small" type="button" data-refcancel>Cancel</button><button class="btn small primary" type="button" data-refsend ${sending ? "disabled" : ""}>Send new reference</button></div></div>`;
}
function slotPicker(days, pick, dis, busy){
  return `<p class="info" style="margin:0">Pick a time that works for you. Interviews are with the Membership Committee.</p><div class="slots">${Object.entries(days).map(([day, list]) => `<div class="slotday"><h4>${esc(day)}</h4><div class="slotrow">${list.map(s =>
    `<button class="slotbtn" type="button" data-slot="${esc(s.id)}" aria-pressed="${pick===s.id}" ${dis}>${esc(slotTime(s.start))}${s.hostName ? `<small> with ${esc(s.hostName)}</small>` : ""}</button>`).join("")}</div></div>`).join("")}</div>
    ${pick ? `<div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-unpick>Back</button><button class="btn primary" type="button" data-book ${busy?"disabled":""}>Book ${esc(slotTime((Object.values(days).flat().find(s => s.id === pick) || {}).start || 0))}</button></div>` : ""}`;
}

export function startPortal(id, email){
  const P = { oslots: [], opick: null, obusy: false, lib: [], checkins: [], orientOn: false, crate: 0, pd: null, files: [], slots: [], msgs: [], draft: "", pick: null, busy: false, changing: false, sending: false, refUps: [], refForm: null, refDraft: {}, refSending: false };
  const seen = new Set();
  const root = $("#portal");
  const render = () => {
    if (!P.pd) { root.innerHTML = `<div class="wrap"><div class="empty"><h3>Loading your application…</h3></div></div>`; return; }
    const pd = P.changing ? { ...P.pd, interview: null } : P.pd;
    // Snapshots re-render the page; keep a half-typed message, its caret and the page scroll intact.
    const ta = $("#msgText"), focused = !!ta && document.activeElement === ta, caret = ta ? ta.selectionStart : 0, scroll = root.scrollTop;
    const rf = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.rf ? document.activeElement : null, rfCaret = rf ? rf.selectionStart : 0;
    if (ta) P.draft = ta.value;
    root.innerHTML = portalHTML({ pd, files: P.files, slots: P.slots, msgs: P.msgs, pick: P.pick, busy: P.busy, refUps: P.refUps, refForm: P.refForm, refDraft: P.refDraft, refSending: P.refSending, push: P.push, oslots: P.oslots, opick: P.opick, obusy: P.obusy, lib: P.lib, checkinDone: !!P.pd.checkin && P.checkins.includes(P.pd.checkin) });
    if (rf) { const back = root.querySelector(`[data-rf="${rf.dataset.rf}"]`); if (back) { back.focus({ preventScroll: true }); try { back.setSelectionRange(rfCaret, rfCaret); } catch {} } }
    const t2 = $("#msgText"); if (t2) { t2.value = P.draft; if (focused) { t2.focus({ preventScroll: true }); t2.setSelectionRange(caret, caret); } }
    const th = $("#thread"); if (th) th.scrollTop = th.scrollHeight;
    root.scrollTop = scroll;
    // Mark the squad's replies as seen once they've been shown.
    for (const m of P.msgs) if (m.from === "staff" && !m.seenAt && !seen.has(m.id)) { seen.add(m.id); updateDoc(doc(db, "portal", id, "messages", m.id), { seenAt: Date.now() }).catch(() => seen.delete(m.id)); }
    if (P.changing) $("#ivCard").insertAdjacentHTML("beforeend", `<div><button class="btn small" type="button" data-keep>Keep my current time</button></div>`);
  };
  render();
  pushState().then(st => { P.push = st; render(); });
  const pushOn = async () => { const m = await import(FM_URL), msg = m.getMessaging(app);
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await m.getToken(msg, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg }); if (!token) throw new Error("no token");
    await setDoc(doc(db, "applicantTokens", token), { appId: id, email, device: deviceName(), at: Date.now() });
    try { localStorage.setItem(PUSH_KEY, token); } catch {}
    P.push = "on"; render(); toast("Alerts are on for this device."); };
  const pushOff = async () => { const t = pushToken(); if (t) await deleteDoc(doc(db, "applicantTokens", t)).catch(() => {});
    try { const m = await import(FM_URL); await m.deleteToken(m.getMessaging(app)); } catch {}
    try { localStorage.removeItem(PUSH_KEY); } catch {}
    P.push = "off"; render(); toast("Alerts are off for this device."); };
  const startOrient = () => { if (P.orientOn) return; P.orientOn = true;
    onSnapshot(collection(db, "orientSlots"), s => { P.oslots = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, () => {});
    onSnapshot(query(collection(db, "library"), where("newMembers", "==", true)), s => { P.lib = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, () => {});
    onSnapshot(collection(db, "portal", id, "checkins"), s => { P.checkins = s.docs.map(d => d.id); render(); }, () => {}); };
  onSnapshot(doc(db, "portal", id), s => { P.pd = s.exists() ? s.data() : { steps: [] }; if (P.pd.orientation) startOrient(); render(); }, () => toast("Couldn't load your application. Reload the page."));
  onSnapshot(collection(db, "portal", id, "messages"), s => { P.msgs = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((x,y) => (x.at||0) - (y.at||0)); render(); }, () => {});
  const send = async () => {
    const ta = $("#msgText"); const text = (ta ? ta.value : "").trim();
    if (!text || P.sending) return;
    if (text.length > 2000) return toast("Messages can be up to 2,000 characters.");
    P.sending = true;
    try { await addDoc(collection(db, "portal", id, "messages"), { text, from: "applicant", by: email, name: (P.pd && P.pd.name) || "", at: Date.now() });
      P.draft = ""; const t = $("#msgText"); if (t) t.value = ""; toast("Message sent. We'll reply here."); }
    catch (err) { console.error(err); toast(`Couldn't send. Try again, or email ${CONTACT_EMAIL}.`); }
    finally { P.sending = false; }
  };
  root.addEventListener("input", e => { if (e.target.id === "msgText") P.draft = e.target.value; if (e.target.dataset.rf) P.refDraft[e.target.dataset.rf] = e.target.value; });
  onSnapshot(collection(db, "portal", id, "refUpdates"), s => { P.refUps = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, () => {});
  const sendRef = async () => {
    const d = P.refDraft, slot = P.refForm; if (slot == null || P.refSending) return;
    const v = k => String(d[k] || "").trim();
    if (!v("name")) { $("#rf-name")?.focus(); return toast("Enter their name."); }
    if (!v("relationship")) { $("#rf-rel")?.focus(); return toast("Tell us how they know you."); }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("email"))) { $("#rf-email")?.focus(); return toast("Enter a valid email for them."); }
    P.refSending = true; render();
    try {
      await addDoc(collection(db, "portal", id, "refUpdates"), { slot, name: v("name").slice(0, 200), relationship: v("relationship").slice(0, 200), email: v("email").toLowerCase().slice(0, 200),
        phone: v("phone").slice(0, 40), address: v("address").slice(0, 300), at: Date.now(), by: email });
      P.refForm = null; P.refDraft = {}; toast("Thanks! We've got your new reference.");
    } catch (err) { console.error(err); toast(`Couldn't send. Try again, or email ${CONTACT_EMAIL}.`); }
    finally { P.refSending = false; render(); }
  };
  root.addEventListener("keydown", e => { if (e.target.dataset && e.target.dataset.rf && e.key === "Enter") { e.preventDefault(); sendRef(); } });
  root.addEventListener("keydown", e => { if (e.target.id === "msgText" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
  onSnapshot(collection(db, "portal", id, "files"), s => { P.files = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, () => {});
  onSnapshot(collection(db, "slots"), s => { P.slots = s.docs.map(d => ({ id: d.id, ...d.data() })); if (P.pick && !P.slots.some(x => x.id === P.pick && !x.bookedBy)) P.pick = null; render(); }, () => {});

  const picker = document.createElement("input"); picker.type = "file"; picker.accept = "application/pdf,image/*"; picker.multiple = true; picker.hidden = true; document.body.appendChild(picker);
  let uploadKey = "";
  picker.addEventListener("change", async () => {
    const list = [...picker.files]; picker.value = ""; if (!list.length) return;
    const docEntry = (P.pd.docs || []).find(d => d.key === uploadKey), orItem = (P.pd.orientation?.items || []).find(i => "onb:" + i.key === uploadKey);
    const label = docEntry ? docEntry.label : orItem ? orItem.label : uploadKey === CONF_KEY ? "Secure document" : "Other";
    const conf = uploadKey === CONF_KEY || isConfidential(label), docKey = uploadKey === CONF_KEY ? "" : uploadKey;
    for (const f of list) {
      const type = typeOf(f);
      if (!okType(f)) { toast(`${f.name} isn't a PDF or photo.`); continue; }
      if (f.size > MAX) { toast(`${f.name} is over 15 MB.`); continue; }
      try {
        toast(`Uploading ${f.name}…`);
        const safe = `${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
        if (conf) {
          // Private: the file and its name go only to the paperwork account; the squad sees a nameless placeholder.
          const path = `confidential/${id}/${safe}`;
          await uploadBytes(ref(storage, path), f, { contentType: type });
          await addDoc(collection(db, "vault"), { appId: id, appName: P.pd.name || "", label, name: f.name, path, size: f.size, contentType: type, uploadedAt: Date.now(), uploadedBy: email, from: "applicant" });
          await addDoc(collection(db, "portal", id, "files"), { docKey, label, name: "Private document", path: "", size: f.size, contentType: type, uploadedAt: Date.now(), uploadedBy: email, confidential: true });
          toast(`Sent ${f.name} securely`);
        } else {
          const path = `uploads/${id}/${safe}`;
          await uploadBytes(ref(storage, path), f, { contentType: type });
          await addDoc(collection(db, "portal", id, "files"), { docKey: uploadKey, label, name: f.name, path, size: f.size, contentType: type, uploadedAt: Date.now(), uploadedBy: email });
          toast(`Uploaded ${f.name}`);
        }
      } catch (e) { console.error(e); toast(`Couldn't upload ${f.name}. ${uploadWhy(e)}, or email it to ${CONTACT_EMAIL}.`); }
    }
  });

  root.addEventListener("click", async e => {
    const t = e.target;
    const os = t.closest("[data-oslot]"); if (os) { P.opick = os.dataset.oslot; render(); return; }
    if (t.closest("[data-obook]")) { const s = P.oslots.find(x => x.id === P.opick); if (!s) return; P.obusy = true; render();
      try { const b = writeBatch(db); b.update(doc(db, "orientSlots", s.id), { bookedBy: id }); b.update(doc(db, "portal", id), { orient: { slotId: s.id, start: s.start, duration: s.duration || null, location: s.location || "", bookedAt: Date.now() } }); await b.commit(); P.opick = null; toast("Orientation booked for " + slotLong(s.start)); }
      catch (err) { console.error(err); toast("That time was just taken or is too soon. Pick another."); } finally { P.obusy = false; render(); } return; }
    if (t.closest("[data-ocancel]")) { const o = P.pd.orient; if (!o) return;
      try { const b = writeBatch(db); b.update(doc(db, "orientSlots", o.slotId), { bookedBy: null }); b.update(doc(db, "portal", id), { orient: null }); await b.commit(); toast("Time released. Pick a new one when you're ready."); }
      catch (err) { console.error(err); toast(`Couldn't change it. Email ${CONTACT_EMAIL}.`); } return; }
    if (t.closest("[data-oics]")) { const o = P.pd.orient; if (o) download("PVRS-orientation.ics", icsFile([{ uid: "or-" + o.slotId, start: o.start, duration: o.duration || 60, title: "PVRS orientation", location: o.location || "", description: "One-on-one orientation with the Potsdam Volunteer Rescue Squad." }]), "text/calendar"); return; }
    const ol = t.closest("[data-olib]"); if (ol) { const d = P.lib.find(x => x.id === ol.dataset.olib); if (!d) return; const w = window.open("", "_blank");
      try { const url = await getDownloadURL(ref(storage, d.path)); if (w) w.location = url; else location.href = url; } catch { if (w) w.close(); toast("Couldn't open that document."); } return; }
    const cr = t.closest("[data-crate]"); if (cr) { P.crate = +cr.dataset.crate; root.querySelectorAll("[data-crate]").forEach(b => b.setAttribute("aria-pressed", String(b === cr))); return; }
    if (t.closest("[data-csend]")) { if (!P.crate) return toast("Pick a number from 1 to 5 first.");
      try { await setDoc(doc(db, "portal", id, "checkins", String(P.pd.checkin)), { rating: P.crate, going: $("#ciGoing").value.trim(), help: $("#ciHelp").value.trim(), at: Date.now() }); toast("Thanks! That helps a lot."); }
      catch (err) { console.error(err); toast("Couldn't send that. Try again."); } return; }
    if (t.closest("[data-send]")) return send();
    if (t.closest("[data-pushon]")) { try { await pushOn(); } catch (err) { console.error(err); toast(Notification.permission === "denied" ? "Alerts were blocked. You can allow them in your browser's settings." : "Couldn't turn on alerts. Try again."); } return; }
    if (t.closest("[data-pushoff]")) return pushOff();
    const rn = t.closest("[data-refnew]"); if (rn) { P.refForm = +rn.dataset.refnew; P.refDraft = {}; render(); $("#rf-name")?.focus(); return; }
    if (t.closest("[data-refcancel]")) { P.refForm = null; P.refDraft = {}; render(); return; }
    if (t.closest("[data-refsend]")) return sendRef();
    if (t.closest("[data-ics]")) {
      const iv = P.pd.interview; if (!iv) return;
      download("PVRS-interview.ics", icsFile([{ uid: "iv-" + iv.slotId, start: iv.start, duration: iv.duration || 30, title: "PVRS membership interview",
        location: iv.location || "Potsdam Volunteer Rescue Squad", description: `Membership interview with the Potsdam Volunteer Rescue Squad Membership Committee.\nQuestions or need to reschedule? Email ${CONTACT_EMAIL}.` }]), "text/calendar");
      return;
    }
    const up = t.closest("[data-upload]"); if (up) { uploadKey = up.dataset.upload; picker.click(); return; }
    const sl = t.closest("[data-slot]"); if (sl) { P.pick = sl.dataset.slot; render(); return; }
    if (t.closest("[data-unpick]")) { P.pick = null; render(); return; }
    if (t.closest("[data-change]")) { P.changing = true; P.pick = null; render(); return; }
    if (t.closest("[data-keep]")) { P.changing = false; P.pick = null; render(); return; }
    if (t.closest("[data-book]")) {
      const s = P.slots.find(x => x.id === P.pick); if (!s) return;
      P.busy = true; render();
      try {
        const b = writeBatch(db);
        if (P.pd.interview && P.pd.interview.slotId !== s.id) b.update(doc(db, "slots", P.pd.interview.slotId), { bookedBy: null });
        b.update(doc(db, "slots", s.id), { bookedBy: id });
        b.update(doc(db, "portal", id), { interview: { slotId: s.id, start: s.start, duration: s.duration || null, location: s.location || "", bookedAt: Date.now() } });
        await b.commit();
        P.pick = null; P.changing = false; toast("Interview booked for " + slotLong(s.start));
      } catch (err) { console.error(err); toast("That time was just taken or is too soon. Pick another."); }
      finally { P.busy = false; render(); }
      return;
    }
    if (t.closest("[data-cancel]")) {
      const iv = P.pd.interview; if (!iv) return;
      const bar = t.closest(".acts");
      if (!bar.querySelector("[data-cancel-yes]")) { bar.insertAdjacentHTML("afterbegin", `<span class="info" style="align-self:center">Cancel this interview?</span><button class="btn small danger" type="button" data-cancel-yes>Yes, cancel</button>`); return; }
    }
    if (t.closest("[data-cancel-yes]")) {
      const iv = P.pd.interview; if (!iv) return;
      try { const b = writeBatch(db); b.update(doc(db, "slots", iv.slotId), { bookedBy: null }); b.update(doc(db, "portal", id), { interview: null }); await b.commit(); toast("Interview cancelled. Pick a new time when you're ready."); }
      catch (err) { console.error(err); toast(`Couldn't cancel. Email ${CONTACT_EMAIL}.`); }
    }
  });
}
