// Applicant portal: status, document uploads, interview booking.
import { app, db, storage, doc, collection, onSnapshot, writeBatch, addDoc, updateDoc, setDoc, deleteDoc, query, where, ref, uploadBytes, getDownloadURL } from "./fb.js";
import { $, esc, toast, timelineHTML, slotDay, slotTime, slotLong, icsFile, download, isConfidential, nextTheme, THEME_LABEL,
  CME_DEFAULT, CME_DRILL, addMonths, daysUntil, memState, cmePeriod, cmeTotals } from "./shared.js";
import { CONTACT_EMAIL, VAPID_KEY } from "./config.js";
import { showTour, maybeTour } from "./tour.js";
import { openModal, closeModal } from "./shared.js";
import { FORMS, HEPB_LABEL, formByKey, formForItem, formTextHTML, formFieldsHTML, readForm, formDocHTML, signaturePad, printDoc } from "./forms.js";

const DAY = 864e5, MAX = 25 * 1024 * 1024;
const CONF_KEY = "_private";   // the "Secure document upload" button (not tied to a request)
// Some phones and scanners hand over a file with no type at all, so fall back to the file's ending.
const WORD = ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const EXT_TYPE = { doc: WORD[0], docx: WORD[1], pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp" };
const typeOf = f => f.type || EXT_TYPE[String(f.name || "").split(".").pop().toLowerCase()] || "";
const okType = f => /^image\//.test(typeOf(f)) || typeOf(f) === "application/pdf" || WORD.includes(typeOf(f));
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
// Forms signed on the phone. Signing is only possible while the orientation chair has it open (pd.signUntil).
const PAPER_RE = /insurance|beneficiar/i;
const signOpen = pd => (pd.signUntil || 0) > Date.now();
const formsLeft = forms => FORMS.filter(f => !f.optional && !forms.some(x => x.id === f.key));
// A medical form (Hep B declination) leaves no trace with the squad except a nameless "Private document" on its checklist line.
const confKey = (pd, f) => { const i = ((pd.orientation || {}).items || []).find(x => f.item && f.item.test(x.label)); return i ? "onb:" + i.key : ""; };
function formsHTML(pd, forms, dis, files = []){
  const open = signOpen(pd), day = ms => new Date(ms).toLocaleDateString();
  return `<h3 class="or-h" id="formsCard">Forms to sign</h3><p class="info" style="margin:0">${open ? "Signing is open. Read each form, then sign it with your finger." : formsLeft(forms).length ? "You'll sign these on your phone during your orientation session. They unlock when the orientation chair opens signing." : "All signed. Thank you!"}</p>
    <div class="or-list fm-list">${FORMS.map(f => { const sent = f.confidential && files.find(x => x.confidential && x.docKey === confKey(pd, f)), d = sent ? { confidential: true, signedAt: sent.uploadedAt } : forms.find(x => x.id === f.key);
      return `<div class="or-item${d ? " done" : ""}"><span class="or-ck" aria-hidden="true">${d ? "✓" : ""}</span><span class="or-tx">${esc(f.title)}${f.confidential ? " 🔒" : ""}${f.optional ? `<small class="fm-opt">${esc(f.optional)}</small>` : ""}</span>
        ${d ? `<span class="badge ok">${d.confidential ? "Sent securely" : "Signed"} ${esc(day(d.signedAt))}</span>${d.confidential ? "" : `<button class="btn small" type="button" data-formview="${f.key}">View</button>`}` : open ? `<button class="btn small primary" type="button" data-formsign="${f.key}" ${dis}>Sign</button>` : `<span class="badge">🔒 At your session</span>`}</div>`; }).join("")}</div>`;
}
function orientHTML(o, { pd, files, oslots, opick, obusy, lib, checkinDone, dis, forms = [] }){
  const now = Date.now(), s = pd.orient, open = oslots.filter(x => !x.bookedBy && x.start > now + DAY).sort((a, b) => a.start - b.start);
  const days = {}; open.forEach(x => { const k = slotDay(x.start); (days[k] = days[k] || []).push(x); });
  const pct = o.total ? Math.round(o.done / o.total * 100) : 0, left = o.due ? Math.round((new Date(o.due + "T12:00") - now) / DAY) : null;
  const uploaded = k => files.filter(f => f.docKey === "onb:" + k).length;
  const session = s ? `<div class="booked"><div class="cal"><b>${esc(new Date(s.start).toLocaleDateString(undefined, { month: "short" }))}</b><span>${new Date(s.start).getDate()}</span></div><div><b>${esc(slotLong(s.start))}</b>${s.location ? `<div class="info">${esc(s.location)}</div>` : ""}</div></div>
      <div class="acts" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn small" type="button" data-oics ${dis}>Add to my calendar</button>${s.start > now + DAY ? `<button class="btn small" type="button" data-ocancel ${dis}>Change time</button>` : ""}</div>`
    : open.length ? `<p class="info" style="margin:0">Pick a time to come in. Orientation is one-on-one with our orientation chair.</p><div class="slots">${Object.entries(days).map(([d, l]) => `<div class="slotday"><h4>${esc(d)}</h4><div class="slotrow">${l.map(x => `<button class="slotbtn" type="button" data-oslot="${esc(x.id)}" aria-pressed="${opick === x.id}" ${dis}>${esc(slotTime(x.start))}</button>`).join("")}</div></div>`).join("")}</div>
        ${opick ? `<div style="display:flex;justify-content:flex-end"><button class="btn primary" type="button" data-obook ${obusy ? "disabled" : ""}>Book this time</button></div>` : ""}`
    : `<p class="info">Times will show up here soon. Questions? Email <b>${esc(CONTACT_EMAIL)}</b>.</p>`;
  const item = i => `<div class="or-item${i.date ? " done" : ""}"><span class="or-ck" aria-hidden="true">${i.date ? "✓" : ""}</span><span class="or-tx">${esc(i.label)}${i.link ? (/fema\.gov/.test(i.link) ? `<small class="fm-opt">Don't have it yet? <a href="${esc(i.link)}" target="_blank" rel="noopener">Take the free FEMA course online</a>, then upload your certificate here.</small>` : ` <a href="${esc(i.link)}" target="_blank" rel="noopener">Open</a>`) : ""}</span>
    ${i.date ? "" : uploaded(i.key) ? `<span class="badge wait">Under review</span>` : i.req ? `<span class="badge wait">Requested</span>` : ""}${PAPER_RE.test(i.label) ? (i.date ? "" : `<span class="badge">Paper form at your session</span>`) : formForItem(i.label) && !formForItem(i.label).optional ? (i.date ? "" : `<span class="badge">Sign below</span>`) : i.cert || i.req ? `<button class="btn small${i.req && !i.date && !uploaded(i.key) ? " primary" : ""}" type="button" data-upload="onb:${esc(i.key)}" ${dis}>${isConfidential(i.label) ? "🔒 " : ""}${i.date || uploaded(i.key) ? "Add file" : "Upload"}</button>` : ""}</div>`;
  const check = pd.checkin && !checkinDone ? `<div class="or-check"><h3>Your ${esc(pd.checkin)}-day check-in</h3><p class="info" style="margin:0">Goes to the orientation chair. It only takes a minute.</p>
      <label class="info">How's it going so far? (1 = not great, 5 = great)</label><div class="slotrow">${[1, 2, 3, 4, 5].map(n => `<button class="slotbtn" type="button" data-crate="${n}" ${dis}>${n}</button>`).join("")}</div>
      <textarea id="ciGoing" rows="2" maxlength="2000" placeholder="Tell us how it's going" aria-label="How it's going" ${dis}></textarea><textarea id="ciHelp" rows="2" maxlength="2000" placeholder="Anything that would help?" aria-label="Anything that would help" ${dis}></textarea>
      <div style="display:flex;justify-content:flex-end"><button class="btn primary" type="button" data-csend ${dis}>Send</button></div></div>` : "";
  return `<section class="card glass" id="orientCard"><h2>Orientation</h2>
    <div class="or-top"><div class="or-count"><b>${o.done}</b> of ${o.total} done</div>${left === null ? "" : `<span class="or-by${left < 0 ? " late" : ""}">${left < 0 ? `Was due ${esc(new Date(o.due + "T12:00").toLocaleDateString())}. Please reach out` : `Please finish by ${esc(new Date(o.due + "T12:00").toLocaleDateString())}`}</span>`}</div>
    <div class="or-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
    <h3 class="or-h">Your session</h3>${session}${formsHTML(pd, forms, dis, files)}<h3 class="or-h">Checklist</h3><p class="info" style="margin:0">All of these are required before you can be issued equipment or run calls.</p><div class="or-list">${(o.items || []).map(item).join("")}</div>
    ${lib.length ? `<h3 class="or-h">Documents</h3><div class="docbtns">${lib.map(d => `<button class="btn small" type="button" data-olib="${esc(d.id)}">${esc(d.name)}</button>`).join("")}</div>` : ""}${check}</section>`;
}
// "Your move": the one thing this person can do right now, or a plain "nothing needed" so nobody wonders.
function moveHTML({ pd, files, slots, oslots, nm, dis, now, forms = [], lane = "screen", pick = null, busy = false }){
  const has = k => files.some(f => f.docKey === k), o = pd.orientation, iv = pd.interview;
  const ivDone = (pd.steps || []).some(s => s.label === "Interview" && s.state === "done");
  const openIv = slots.some(s => !s.bookedBy && s.start > now + DAY), openOr = oslots.some(s => !s.bookedBy && s.start > now + DAY);
  const doc = (pd.docs || []).find(d => !d.received && !has(d.key)), req = o ? (o.items || []).find(i => i.req && !i.date && !has("onb:" + i.key)) : null;
  const up = (key, label) => ({ head: `Upload: ${label}`, sub: "A PDF or a clear photo is fine.", btn: `<button class="btn primary" type="button" data-upload="${esc(key)}" ${dis}>${isConfidential(label) ? "Secure upload" : "Upload"}</button>` });
  const go = (to, text) => `<button class="btn primary" type="button" data-goto="${to}" ${dis}>${text}</button>`;
  let m = null;
  if ((pd.refReplace || []).length) m = { head: "We need a different reference", sub: "One of your references couldn't be reached.", btn: go("refCard", "Add a reference") };
  else if (nm && signOpen(pd) && formsLeft(forms).length) m = { head: "Sign your orientation forms", sub: `${formsLeft(forms).length} to sign on your phone, with the orientation chair.`, btn: go("formsCard", "Sign now") };
  else if (nm && !pd.orient && openOr) m = { head: "Pick your orientation time", sub: "A one-on-one with our orientation chair.", btn: go("orientCard", "See times") };
  else if (req) m = up("onb:" + req.key, req.label);
  else if (doc) m = up(doc.key, doc.label);
  else if (!nm && !ivDone && !iv && pd.bookingOpen && openIv) {
    // the soonest three open times sit right on the card; the full list stays in the Interview card
    const all = slots.filter(s => !s.bookedBy && s.start > now + DAY).sort((a, b) => a.start - b.start), top = all.slice(0, 3), ps = all.find(s => s.id === pick);
    const short = ms => new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    m = { head: "Pick your interview time", sub: "Choose whichever open time works best for you.", wide: true,
      btn: `<div class="mv-times">${top.map(s => `<button class="mv-time" type="button" data-slot="${esc(s.id)}" aria-pressed="${pick === s.id}" ${dis}><span>${esc(short(s.start))}${s.hostName ? `<small> with ${esc(s.hostName)}</small>` : ""}</span><b>${esc(slotTime(s.start))}</b></button>`).join("")}</div>
        ${ps ? `<button class="btn primary" type="button" data-book ${busy ? "disabled" : ""}>Book ${esc(short(ps.start))}, ${esc(slotTime(ps.start))}</button>` : ""}<button class="btn mv-all" type="button" data-goto="ivCard" ${dis}>${all.length > top.length ? `See all ${all.length} times` : "See times"}</button>` };
  }
  else if (!nm && iv && !ivDone && iv.start > now) m = { head: `Your interview is ${slotLong(iv.start)}`, sub: iv.location || "", btn: `<button class="btn primary" type="button" data-ics ${dis}>Add to my calendar</button>` };
  else if (nm && pd.orient && pd.orient.start > now) m = { head: `Your orientation is ${slotLong(pd.orient.start)}`, sub: pd.orient.location || "", btn: `<button class="btn primary" type="button" data-oics ${dis}>Add to my calendar</button>` };
  return m ? `<section class="card glass movecard" id="moveCard" aria-label="Your move" style="--stage-c:var(--s-${lane})"><div class="mv-eye"><span class="ping" aria-hidden="true"><i></i><i></i></span>Your move</div>
      <div class="mv-head">${esc(m.head)}</div>${m.sub ? `<p class="info" style="margin:0">${esc(m.sub)}</p>` : ""}<div class="mv-acts${m.wide ? " wide" : ""}">${m.btn}</div></section>`
    : `<section class="card glass movecard calm" id="moveCard" aria-label="Nothing needed"><div class="mv-eye">All set for now</div>
      <div class="mv-head">Nothing needed from you right now</div><p class="info" style="margin:0">We'll let you know here, and by email, as soon as there's a next step.</p></section>`;
}
// ---- My records (Nov 21): an active member's page. Cards and IDs to keep current, CME toward recertification,
// trainings, and contact info. Uploads wait for the squad's review before they count.
const fmtD = iso => iso ? new Date(iso + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
const memPending = (it, files) => files.filter(f => f.docKey === "mem:" + it.key && !f.reviewedAt && (f.uploadedAt || 0) > (it.approvedAt || 0)).sort((x, y) => (y.uploadedAt || 0) - (x.uploadedAt || 0))[0] || null;
function memStatus(it, files, now){
  const pend = memPending(it, files);
  if (pend) return { cls: "wait", text: `Sent ${new Date(pend.uploadedAt).toLocaleDateString()}: waiting for review` };
  const st = memState(it.expires, now), n = daysUntil(it.expires, now);
  return st === "missing" ? { cls: "miss", text: "Not on file yet" } : st === "expired" ? { cls: "bad", text: `Expired ${fmtD(it.expires)}` }
    : st === "soon" ? { cls: "warn", text: n === 0 ? "Expires today" : `Expires ${fmtD(it.expires)} (${n} day${n === 1 ? "" : "s"})` } : { cls: "ok", text: `Current until ${fmtD(it.expires)}` };
}
function memberHTML(m, { files, cme = [], pupd = [], lib = [], dis, draft = {}, now = Date.now() }){
  const items = m.items || [], cfg = m.cme || CME_DEFAULT, period = cmePeriod(m.certExpires || "", cfg.years || 3, now), tot = cmeTotals(cme, cfg, period);
  const due = items.filter(it => !memPending(it, files) && ["missing", "expired", "soon"].includes(memState(it.expires, now))).length;
  const rows = items.map(it => { const st = memStatus(it, files, now);
    return `<div class="memrow st-${st.cls}"><span class="mr-dot" aria-hidden="true"></span><span class="mr-t"><b>${esc(it.label)}</b><small>${esc(st.text)}${it.every ? ` · redo every ${it.every === 12 ? "year" : it.every + " months"}` : ""}</small></span>
      <button class="btn small${["missing", "expired", "soon"].includes(memState(it.expires, now)) && st.cls !== "wait" ? " primary" : ""}" type="button" data-memup="${esc(it.key)}" ${dis}>${it.expires || st.cls === "wait" ? "Upload new" : "Upload"}</button></div>`; }).join("");
  const cats = [...(cfg.cats || []), CME_DRILL];
  const list = [...cme].sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const pend = pupd.filter(u => !u.appliedAt).sort((x, y) => (y.at || 0) - (x.at || 0))[0];
  const d = k => esc(draft[k] || "");
  return `<section class="card glass memcard" id="memCard"><div class="ptop"><h2>Keep these current</h2>${due ? `<span class="badge wait">${due} need${due === 1 ? "s" : ""} attention</span>` : `<span class="badge ok">All current</span>`}</div>
      <p class="info" style="margin:0">Upload a new copy whenever you renew. The squad checks it, then it counts. We'll remind you 30 days before anything expires.</p>
      <div class="memlist">${rows || `<p class="info">Nothing to keep track of yet.</p>`}</div></section>
    <section class="card glass" id="cmeCard"><div class="ptop"><h2>CME and recertification</h2><span class="badge ${tot.total >= tot.need ? "ok" : "wait"}">${+tot.total.toFixed(2)} of ${tot.need} hours</span></div>
      <p class="info" style="margin:0">${period.known ? `Your EMS certification expires <b>${esc(fmtD(period.to))}</b>. Hours from ${esc(fmtD(period.from))} on count toward it.` : `Upload your EMS certification card above so we can count hours toward its expiration date. Until then this shows the last ${cfg.years || 3} years.`}</p>
      <div class="cmebars">${tot.cats.map(c => `<div class="cmebar${c.done ? " done" : ""}"><span class="cb-l">${esc(c.label)}<small>${+c.got.toFixed(2)} of ${c.hours} h</small></span><span class="cb-t" aria-hidden="true"><i style="width:${Math.min(100, c.hours ? c.got / c.hours * 100 : 0)}%"></i></span></div>`).join("")}
        ${tot.drill ? `<p class="info" style="margin:4px 0 0">Plus ${+tot.drill.toFixed(2)} h of squad drills and training (not CME).</p>` : ""}</div>
      <details class="cmeform"${list.length ? "" : " open"}><summary>Log hours</summary>
        <div class="cmegrid"><label>Date<input type="date" id="cmeDate" value="${d("date") || new Date(now).toISOString().slice(0, 10)}" ${dis}></label>
          <label>Hours<input type="number" id="cmeHours" min="0.25" max="24" step="0.25" value="${d("hours")}" placeholder="1.5" ${dis}></label>
          <label class="wide">Topic<input type="text" id="cmeTopic" maxlength="200" value="${d("topic")}" placeholder="e.g. Airway management" ${dis}></label>
          <label>Category<select id="cmeCat" ${dis}>${cats.map(c => `<option value="${esc(c.key)}"${draft.cat === c.key ? " selected" : ""}>${esc(c.label)}</option>`).join("")}</select></label>
          <label>Course or instructor<input type="text" id="cmeProv" maxlength="200" value="${d("provider")}" placeholder="Optional" ${dis}></label></div>
        <div class="acts" style="display:flex;justify-content:flex-end;gap:8px"><button class="btn primary" type="button" data-cmeadd ${dis}>Save hours</button></div>
        <p class="info" style="margin:4px 0 0">Keep your certificates: attach one to an entry below, or send it under Documents. Core hours need a NYS CIC's sign-off on the state form; this log is your own record and the squad's.</p></details>
      ${list.length ? `<div class="cmelist">${list.map(e => `<div class="cmerow"><span><b>${esc(e.topic)}</b><small>${esc(fmtD(e.date))} · ${esc((cats.find(c => c.key === e.cat) || { label: e.cat }).label)}${e.provider ? " · " + esc(e.provider) : ""}${files.some(f => f.docKey === "cme:" + e.id) ? " · certificate attached" : ""}</small></span><span class="cme-h">${+(+e.hours).toFixed(2)} h</span>${e.verified ? `<span class="badge ok">Verified</span>` : `<button class="btn small" type="button" data-cmefile="${esc(e.id)}" ${dis}>Attach</button>`}</div>`).join("")}</div>` : ""}</section>
    ${lib.length ? `<section class="card glass" id="trainCard"><h2>Trainings and handouts</h2><div class="olib">${lib.map(x => `<button class="doc" type="button" data-olib="${esc(x.id)}" ${dis}><span class="dt">${esc(x.name)}</span><span class="badge">Open</span></button>`).join("")}</div></section>` : ""}
    <section class="card glass" id="profCard"><h2>My contact info</h2>
      ${pend ? `<p class="info" style="margin:0"><b>Sent ${esc(new Date(pend.at).toLocaleDateString())}.</b> The squad will update your file.</p>` : `<p class="info" style="margin:0">Moved or got a new number? Tell us here. Leave a box empty if it hasn't changed.</p>`}
      <div class="cmegrid"><label>Phone<input type="tel" id="pfPhone" maxlength="40" value="${d("phone")}" ${dis}></label>
        <label class="wide">Mailing address<input type="text" id="pfAddr" maxlength="300" value="${d("address")}" ${dis}></label>
        <label>Emergency contact<input type="text" id="pfEcName" maxlength="200" value="${d("ecName")}" placeholder="Name" ${dis}></label>
        <label>Their phone<input type="tel" id="pfEcPhone" maxlength="40" value="${d("ecPhone")}" ${dis}></label>
        <label>Relationship<input type="text" id="pfEcRel" maxlength="100" value="${d("ecRel")}" ${dis}></label></div>
      <div class="acts" style="display:flex;justify-content:flex-end"><button class="btn" type="button" data-pfsend ${dis}>Send update</button></div></section>`;
}
export function portalHTML({ back = false, pd, files = [], slots = [], msgs = [], preview = false, pick = null, busy = false, refUps = [], refForm = null, refDraft = {}, refSending = false, push = "", oslots = [], opick = null, obusy = false, lib = [], checkinDone = false, forms = [], cme = [], pupd = [], mlib = [], mdraft = {} }){
  const now = Date.now(), mem = !!pd.member, nm = !!pd.orientation || mem;   // nm: moved to orientation, so only the orientation dashboard shows
  // The header takes the colour of the lane they're in (same four lanes as the desk's board).
  const stepNow = (pd.steps || []).findIndex(x => x.state === "now"), stepsDone = (pd.steps || []).length && (pd.steps || []).every(x => x.state === "done");
  const lane = nm || stepsDone ? "onb" : stepNow <= 2 ? "screen" : stepNow === 3 ? "int" : stepNow === 4 ? "appr" : "onb";
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
    return `<div class="doc"><div class="dt">${esc(d.label)}${conf ? `<small class="lockline">🔒 Secure upload: only the membership coordinator, squad administrators and our orientation paperwork coordinator can open it</small>` : ""}${up.length?`<small>${conf ? `${up.length} file${up.length===1?"":"s"} sent securely` : up.map(f => esc(f.name)).join(", ")}</small>`:""}</div>${badge}
      ${d.received ? "" : `<button class="btn small ${up.length?"":"primary"}" type="button" data-upload="${esc(d.key)}" ${dis}>${up.length?"Add file":"Upload"}</button>`}</div>`;
  }).join("");

  let ivBody;
  if (ivDone) ivBody = `<p class="info">Your interview is complete. Thank you!</p>`;
  else if (iv) {
    const d = new Date(iv.start);
    ivBody = `<div class="booked"><div class="cal"><b>${esc(d.toLocaleDateString(undefined,{month:"short"}))}</b><span>${d.getDate()}</span></div>
      <div class="dt" style="min-width:0"><strong>${esc(slotDay(iv.start))}</strong><div class="info">${esc(slotTime(iv.start))}${iv.duration?` · ${iv.duration} min`:""}${iv.location?`<br>${esc(iv.location)}`:""}</div></div></div>
      ${canChange ? `<div class="acts" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn small" type="button" data-ics ${dis}>Add to my calendar</button><button class="btn small" type="button" data-cancel ${dis}>Cancel interview</button>${pd.bookingOpen && open.length?`<button class="btn small" type="button" data-change ${dis}>Change time</button>`:""}</div>`
        : `<div class="acts" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn small" type="button" data-ics ${dis}>Add to my calendar</button>${iv.start > now ? `<button class="btn small" type="button" data-resched ${dis}>I need to reschedule</button>` : ""}</div><p class="info">It's less than 24 hours away, so it can't be changed here. Tap <b>I need to reschedule</b> and we'll get your message right away.</p>`}
      ${pd.bring ? `<p class="info bring"><b>What to bring:</b> ${esc(pd.bring)}</p>` : ""}`;
  }
  else if (!pd.bookingOpen) ivBody = `<p class="info">Interview times will open here once your application review is underway. We'll let you know.</p>`;
  else if (!open.length) ivBody = `<p class="info">No interview times are open right now. Check back soon, or email <b>${esc(CONTACT_EMAIL)}</b>.</p>`;
  else ivBody = slotPicker(days, pick, dis, busy);

  return `<div class="wrap">
    <section class="phead" style="--stage-c:var(--s-${lane})"><div class="pbar"><div class="plate"><img alt="Potsdam Volunteer Rescue Squad, est. 1955" src="/img/logo.png"></div>
      ${preview ? `<span class="badge wait">Preview</span>` : `<span class="pbar-acts">${back ? `<a class="btn small primary" href="/">‹ Back to the desk</a>` : ""}<button class="btn small" type="button" data-tour>How this works</button><button class="btn small themebtn" type="button" data-themecycle title="Appearance: light, dark or follow this device" aria-label="Appearance"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor"/></svg></button><button class="btn small" type="button" data-signout>Sign out</button></span>`}</div>
      <div class="pgreet"><div class="eyebrow">${mem ? "Squad member" : nm ? "New member" : "Applicant portal"}</div><div class="hello">Hi ${esc(pd.firstName || "there")}</div>
      <div class="info">${mem ? "Your records: cards, trainings and CME in one place." : nm ? "Welcome to the squad. Here's your orientation." : esc(pd.type ? pd.type + " membership application" : "Membership application")}</div></div></section>

${mem ? memberHTML(pd.member, { files, cme, pupd, lib: mlib, dis, draft: mdraft, now }) : moveHTML({ pd, files, slots, oslots, nm, dis, now, forms, lane, pick, busy })}
${mem ? "" : nm ? orientHTML(pd.orientation, { pd, files, oslots, opick, obusy, lib, checkinDone, dis, forms }) : `${ivSoonHTML(iv, ivDone, now, dis)}
    <section class="card glass" id="appCard"><h2>Your application</h2>${trackerHTML(pd.steps || [])}${timelineHTML(pd.steps || [])}</section>`}

    <section class="card glass" id="msgCard"><div class="ptop"><h2>Messages</h2>${msgs.some(m => m.from === "staff" && !m.seenAt) ? `<span class="badge wait">New reply</span>` : ""}</div>
      <p class="info" style="margin:0">${mem ? "Questions for the membership coordinator?" : nm ? "Questions about orientation?" : "Questions about your application?"} Send them here. We'll reply in this space, usually within a few days.</p>
      ${pushHTML(push)}<div class="thread" id="thread">${threadHTML(msgs, "applicant")}</div>
      <div class="composer"><textarea id="msgText" rows="2" maxlength="2000" placeholder="Type your question…" aria-label="Your message" ${dis}></textarea>
        <button class="btn primary" type="button" data-send ${dis}>Send</button></div></section>

    ${nm ? "" : `<section class="card glass" id="ivCard"><h2>Interview</h2>${ivBody}${ivDone ? "" : ivPrepHTML(iv)}</section>

    <section class="card glass" id="refCard"><h2>References</h2>${refsBody(pd.refs || [], { ups: refUps, form: refForm, draft: refDraft, sending: refSending, dis })}</section>`}

    <section class="card glass" id="docCard"><h2>Documents</h2>
      ${docs.length ? `<div>${docRows}</div>` : `<p class="info">Nothing needed right now. If we need anything from you, it will show up here.</p>`}
      ${other.filter(f => !f.confidential).length ? `<div class="info"><b>Other files you sent:</b> ${other.filter(f => !f.confidential).map(f => esc(f.name)).join(", ")}</div>` : ""}
      ${other.some(f => f.confidential) ? `<div class="info"><b>Secure documents sent:</b> ${other.filter(f => f.confidential).length} file${other.filter(f => f.confidential).length === 1 ? "" : "s"} 🔒</div>` : ""}
      <div class="docbtns"><button class="btn small" type="button" data-upload="" ${dis}>Send another document</button>
        <button class="btn small" type="button" data-upload="${CONF_KEY}" ${dis}>🔒 Secure document upload</button></div>
      <p class="info" style="margin:0">Use <b>Secure document upload</b> for medical records, your Social Security card and other sensitive papers. Only the membership coordinator, squad administrators and our orientation paperwork coordinator can open them; interviewers and other members can't.</p>
      <p class="info" style="margin:0">PDF, photo or Word file, up to 25 MB each. You can send documents any time. Trouble uploading? Email <b>${esc(CONTACT_EMAIL)}</b>.</p></section>

    ${nm ? "" : `<section class="card glass"><h2>What to expect</h2><div class="info">
      <ul><li>Your application goes to the next board meeting once your references and all other prerequisites (interview, driving record and application review) are complete. You'll hear back within about a week of that meeting.</li>
      <li>If the board approves you, the next step is a background check through Sterling Volunteers. Watch for an email from them.</li>
      <li>Members complete orientation (including required medical documentation and online education), self-schedule at least 4 duty crew shifts a month, and attend the monthly membership meeting on the 2nd Tuesday unless excused in advance.</li>
      <li>Monthly training is offered and all members are encouraged to take part.</li></ul>
      <p style="margin:10px 0 0">Questions? Email <b>${esc(CONTACT_EMAIL)}</b>.</p></div></section>`}
    ${preview ? "" : `<nav class="pnav" aria-label="Jump to"><button type="button" data-goto="${mem ? "memCard" : "appCard"}" class="on">${mem ? "My records" : nm ? "Orientation" : "My application"}</button>${mem ? `<button type="button" data-goto="cmeCard">CME</button>` : ""}<button type="button" data-goto="docCard">Documents</button><button type="button" data-goto="msgCard">Messages${msgs.some(m => m.from === "staff" && !m.seenAt) ? `<span class="ping" aria-hidden="true"><i></i><i></i></span>` : ""}</button></nav>`}
  </div>`;
}
// "How to prepare" under the interview card (until the interview is done). Topics follow the committee's question list.
// "Step 3 of 6": a delivery-style progress bar above the status timeline.
function trackerHTML(steps){
  if (!steps.length) return "";
  const done = steps.filter(s => s.state === "done").length, cur = steps.findIndex(s => s.state === "now");
  const at = cur >= 0 ? cur : done >= steps.length ? steps.length - 1 : done;
  const label = done >= steps.length ? "All steps complete" : `Step ${at + 1} of ${steps.length}: ${steps[at].label}${steps[at].short ? " (" + steps[at].short + ")" : ""}`;
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

export function startPortal(id, email, { backToDesk = false } = {}){
  const P = { cme: [], pupd: [], mlib: [], mdraft: {}, memOn: false, memKey: "", memDate: "", oslots: [], opick: null, obusy: false, lib: [], checkins: [], orientOn: false, crate: 0, pd: null, files: [], slots: [], msgs: [], draft: "", pick: null, busy: false, changing: false, sending: false, refUps: [], refForm: null, refDraft: {}, refSending: false, forms: [] };
  const seen = new Set();
  const root = $("#portal");
  const render = () => {
    if (!P.pd) { root.innerHTML = `<div class="wrap"><div class="empty"><h3>Loading your application…</h3></div></div>`; return; }
    const pd = P.changing ? { ...P.pd, interview: null } : P.pd;
    // Snapshots re-render the page; keep a half-typed message, its caret and the page scroll intact.
    const ta = $("#msgText"), focused = !!ta && document.activeElement === ta, caret = ta ? ta.selectionStart : 0, scroll = root.scrollTop;
    const rf = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.rf ? document.activeElement : null, rfCaret = rf ? rf.selectionStart : 0;
    if (ta) P.draft = ta.value;
    root.innerHTML = portalHTML({ back: backToDesk, pd, files: P.files, slots: P.slots, msgs: P.msgs, pick: P.pick, busy: P.busy, refUps: P.refUps, refForm: P.refForm, refDraft: P.refDraft, refSending: P.refSending, push: P.push, oslots: P.oslots, opick: P.opick, obusy: P.obusy, lib: P.lib, cme: P.cme, pupd: P.pupd, mlib: P.mlib, mdraft: P.mdraft, forms: P.forms, checkinDone: !!P.pd.checkin && P.checkins.includes(P.pd.checkin) });
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
  // A device that had alerts on re-saves its current registration each visit (phones swap or drop them silently).
  (async () => { const old = pushToken(); if (!old || !VAPID_KEY || !("Notification" in window) || !("serviceWorker" in navigator)) return;
    try {
      if (Notification.permission !== "granted") { try { localStorage.removeItem(PUSH_KEY); } catch {} deleteDoc(doc(db, "applicantTokens", old)).catch(() => {}); P.push = "off"; render(); return; }
      const m = await import(FM_URL), reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      const token = await m.getToken(m.getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg }); if (!token) return;
      await setDoc(doc(db, "applicantTokens", token), { appId: id, email, device: deviceName(), at: Date.now() });
      if (token !== old) { try { localStorage.setItem(PUSH_KEY, token); } catch {} deleteDoc(doc(db, "applicantTokens", old)).catch(() => {}); }
    } catch (e) { console.error(e); } })();
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
    onSnapshot(collection(db, "portal", id, "forms"), s => { P.forms = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, () => {});
    onSnapshot(collection(db, "portal", id, "checkins"), s => { P.checkins = s.docs.map(d => d.id); render(); }, () => {}); };
  const startMember = () => { if (P.memOn) return; P.memOn = true;
    onSnapshot(collection(db, "portal", id, "cmeLog"), s => { P.cme = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, () => {});
    onSnapshot(collection(db, "portal", id, "profileUpdates"), s => { P.pupd = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, () => {});
    onSnapshot(query(collection(db, "library"), where("activeMembers", "==", true)), s => { P.mlib = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, () => {}); };
  // Before a member item upload: the new expiration date (cards) or the date they finished (yearly trainings).
  const askMemDate = key => { const it = ((P.pd.member || {}).items || []).find(x => x.key === key); if (!it) return;
    const M = openModal(`<h3>${esc(it.label)}</h3><label class="fm-f"><span>${it.every ? "Date you finished it" : "Expiration date on the new one"}</span><input type="date" id="memDate"></label>
      <p class="info">${it.every ? `Good for ${it.every === 12 ? "a year" : it.every + " months"} from that date.` : "Then pick the photo or PDF of the front and back."}</p>
      <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="memPick">Choose file</button></div>`);
    M.onclick = e => { if (e.target.closest("[data-x]")) return closeModal(); if (!e.target.closest("#memPick")) return;
      const v = M.querySelector("#memDate").value; if (!v) return toast(it.every ? "Pick the date you finished it." : "Pick the expiration date.");
      P.memKey = key; P.memDate = v; uploadKey = "mem:" + key; closeModal(); picker.click(); }; };
  const keepDraft = () => { const v = i => { const el = $("#" + i); return el ? el.value : undefined; };
    const m = { date: v("cmeDate"), hours: v("cmeHours"), topic: v("cmeTopic"), cat: v("cmeCat"), provider: v("cmeProv"), phone: v("pfPhone"), address: v("pfAddr"), ecName: v("pfEcName"), ecPhone: v("pfEcPhone"), ecRel: v("pfEcRel") };
    for (const k in m) if (m[k] !== undefined) P.mdraft[k] = m[k]; };
  let signT;
  // Sign one form: wording, any questions, typed name and a finger signature. Saved as the signed document.
  const openSign = key => { const f = formByKey(key); if (!f) return;
    if (!signOpen(P.pd)) return toast("Signing opens during your orientation session.");
    const M = openModal(`<h3>${esc(f.title)}</h3><div class="fm-body">${f.statement ? "" : formTextHTML(f, P.pd.name)}<div id="fmStmt">${f.statement ? formTextHTML(f, P.pd.name) : ""}</div>${formFieldsHTML(f)}
      <label class="fm-f"><span>Type your full legal name</span><input id="fmName" type="text" maxlength="200" autocomplete="name" value="${esc(P.pd.name || "")}"></label>
      <div class="fm-f"><span>${esc(f.sign || "Your signature")}: sign in the box with your finger</span><canvas id="fmPad" class="fm-pad" aria-label="Signature box"></canvas>
        <div class="fm-padrow"><span class="info">${esc(new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }))}</span><button class="btn small" type="button" id="fmClear">Clear signature</button></div></div></div>
      <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="fmSave">Sign and save</button></div>`, true);
    const pad = signaturePad(M.querySelector("#fmPad")); let busy = false;
    if (f.groups) { const set = (k, v) => { const el = M.querySelector(`[name="${k}"]`); if (el && v) el.value = v; }; set("m_name", P.pd.name); set("m_email", email); }
    M.querySelector("#fmName").addEventListener("input", e => { if (f.statement) M.querySelector("#fmStmt").innerHTML = formTextHTML(f, e.target.value.trim()); });
    M.onclick = async e => { if (e.target.closest("[data-x]")) return closeModal(); if (e.target.closest("#fmClear")) return pad.clear();
      if (!e.target.closest("#fmSave") || busy) return;
      const r = readForm(f, M); if (r.missing) return toast(r.missing);
      const name = M.querySelector("#fmName").value.trim(), sig = pad.data();
      if (!name) return toast("Type your full name.");
      if (!sig) return toast("Sign in the box with your finger first.");
      if (!signOpen(P.pd)) return toast("Signing has closed. Ask the orientation chair to open it again.");
      busy = true; const at = Date.now(), body = { key: f.key, title: f.title, values: r.values, name: name.slice(0, 200), sig, signedAt: at, by: email };
      try {
        if (f.confidential) {   // medical: the signed form goes only to the paperwork account; the squad sees that it was signed, nothing else
          await addDoc(collection(db, "vault"), { appId: id, appName: P.pd.name || "", label: HEPB_LABEL, name: f.title + " (signed).pdf", path: "", size: 0, contentType: "form", uploadedAt: at, uploadedBy: email, from: "applicant", form: body });
          const item = ((P.pd.orientation || {}).items || []).find(x => f.item.test(x.label));
          await addDoc(collection(db, "portal", id, "files"), { docKey: confKey(P.pd, f), label: item ? item.label : "Secure document", name: "Private document", path: "", size: 0, contentType: "form", uploadedAt: at, uploadedBy: email, confidential: true });
        } else await setDoc(doc(db, "portal", id, "forms", f.key), body);
        closeModal(); toast(`Signed: ${f.title}`);
      } catch (err) { console.error(err); busy = false; toast(/permission/.test(String(err?.code || err)) ? "Signing isn't open right now. Ask the orientation chair to open it." : "Couldn't save. Check your connection and try again."); } };
  };
  const viewForm = key => { const f = formByKey(key), d = P.forms.find(x => x.id === key); if (!f || !d || d.confidential) return;
    const M = openModal(`${formDocHTML(f, d)}<div class="acts"><button class="btn" type="button" data-x>Close</button><button class="btn primary" type="button" id="fmPrint">Print or save as PDF</button></div>`, true);
    M.onclick = e => { if (e.target.closest("[data-x]")) return closeModal(); if (e.target.closest("#fmPrint")) { closeModal(); printDoc(formDocHTML(f, d)); } }; };
  const tourRole = () => P.pd?.member ? "records" : P.pd?.orientation ? "newmember" : "applicant", tourOpts = () => ({ name: P.pd?.firstName || "", email });
  onSnapshot(doc(db, "portal", id), s => { const firstLoad = !P.pd; P.pd = s.exists() ? s.data() : { steps: [] }; if (P.pd.orientation) startOrient(); if (P.pd.member) startMember(); render();
    clearTimeout(signT); const ms = (P.pd.signUntil || 0) - Date.now(); if (ms > 0 && ms < 864e5) signT = setTimeout(render, ms + 500);   // lock the forms again when signing closes
    if (firstLoad && s.exists()) maybeTour(tourRole(), tourOpts()); }, () => toast("Couldn't load your application. Reload the page."));
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
  root.addEventListener("input", e => { if (/^(cme|pf)/.test(e.target.id || "")) keepDraft(); if (e.target.id === "msgText") P.draft = e.target.value; if (e.target.dataset.rf) P.refDraft[e.target.dataset.rf] = e.target.value; });
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

  const picker = document.createElement("input"); picker.type = "file"; picker.accept = "application/pdf,image/*,.heic,.heif,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"; picker.multiple = true; picker.hidden = true; document.body.appendChild(picker);
  let uploadKey = "";
  // Tell the desk when an upload is turned away, and why, so nobody has to guess from "it won't upload".
  const noteFail = (f, label, code, message) => addDoc(collection(db, "portal", id, "uploadErrors"), { name: String(f.name || "").slice(0, 300), size: f.size || 0, type: String(f.type || "").slice(0, 100), label: String(label || "").slice(0, 200),
    code: String(code).slice(0, 80), message: String(message).slice(0, 500), at: Date.now(), by: email, device: deviceName() }).catch(() => {});
  picker.addEventListener("change", async () => {
    const list = [...picker.files]; picker.value = ""; if (!list.length) return;
    const docEntry = (P.pd.docs || []).find(d => d.key === uploadKey), orItem = (P.pd.orientation?.items || []).find(i => "onb:" + i.key === uploadKey);
    const memItem = uploadKey.startsWith("mem:") ? ((P.pd.member || {}).items || []).find(i => "mem:" + i.key === uploadKey) : null;
    const cmeEntry = uploadKey.startsWith("cme:") ? P.cme.find(x => "cme:" + x.id === uploadKey) : null;
    const label = docEntry ? docEntry.label : orItem ? orItem.label : memItem ? memItem.label : cmeEntry ? `CME certificate: ${cmeEntry.topic}`.slice(0, 200) : uploadKey === CONF_KEY ? "Secure document" : "Other";
    const memExtra = memItem && P.memKey === memItem.key && P.memDate ? (memItem.every ? { done: P.memDate, expires: addMonths(P.memDate, memItem.every) } : { expires: P.memDate }) : {};
    const conf = uploadKey === CONF_KEY || isConfidential(label), docKey = uploadKey === CONF_KEY ? "" : uploadKey;
    const sent = new Set();
    for (const f of list) {
      const type = typeOf(f);
      if (!okType(f)) { toast(`${f.name} can't be sent here. Use a PDF, a photo or a Word file, or email it to ${CONTACT_EMAIL}.`); noteFail(f, label, "wrong-type", "Not a PDF, photo or Word file"); continue; }
      if (f.size > MAX) { toast(`${f.name} is over 25 MB. Try a photo of each page instead, or email it to ${CONTACT_EMAIL}.`); noteFail(f, label, "too-big", "Over 25 MB"); continue; }
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
          await addDoc(collection(db, "portal", id, "files"), { docKey: uploadKey, label, name: f.name, path, size: f.size, contentType: type, uploadedAt: Date.now(), uploadedBy: email, ...memExtra });
          toast(`Uploaded ${f.name}`);
        }
        sent.add(docKey);
      } catch (e) { console.error(e); toast(`Couldn't upload ${f.name}. ${uploadWhy(e)}, or email it to ${CONTACT_EMAIL}.`); noteFail(f, label, String(e?.code || "error"), String(e?.message || e || "")); }
    }
    P.memKey = ""; P.memDate = "";
    if (memItem && sent.size) { toast("Thanks! The squad will check it, then it counts."); return; }
    // Thank them and say what's still outstanding, so nobody wonders whether they're done.
    if (sent.size) { const has = k => sent.has(k) || P.files.some(f => f.docKey === k);
      const left = [...(P.pd.docs || []).filter(d => !d.received && !has(d.key)).map(d => d.label), ...((P.pd.orientation || {}).items || []).filter(i => !i.date && (i.cert || i.req) && !PAPER_RE.test(i.label) && !(formForItem(i.label) && !formForItem(i.label).optional) && !has("onb:" + i.key)).map(i => i.label)];
      setTimeout(() => toast(left.length ? `Thank you! Still needed: ${left.slice(0, 3).join("; ")}${left.length > 3 ? ` and ${left.length - 3} more` : ""}.` : "Thank you! That's everything we've asked for so far."), 1800); }
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
    const ol = t.closest("[data-olib]"); if (ol) { const d = [...P.lib, ...P.mlib].find(x => x.id === ol.dataset.olib); if (!d) return; const w = window.open("", "_blank");
      try { const url = await getDownloadURL(ref(storage, d.path)); if (w) w.location = url; else location.href = url; } catch { if (w) w.close(); toast("Couldn't open that document."); } return; }
    const cr = t.closest("[data-crate]"); if (cr) { P.crate = +cr.dataset.crate; root.querySelectorAll("[data-crate]").forEach(b => b.setAttribute("aria-pressed", String(b === cr))); return; }
    if (t.closest("[data-csend]")) { if (!P.crate) return toast("Pick a number from 1 to 5 first.");
      try { await setDoc(doc(db, "portal", id, "checkins", String(P.pd.checkin)), { rating: P.crate, going: $("#ciGoing").value.trim(), help: $("#ciHelp").value.trim(), at: Date.now() }); toast("Thanks! That helps a lot."); }
      catch (err) { console.error(err); toast("Couldn't send that. Try again."); } return; }
    const fsn = t.closest("[data-formsign]"); if (fsn) return openSign(fsn.dataset.formsign);
    const fvw = t.closest("[data-formview]"); if (fvw) return viewForm(fvw.dataset.formview);
    if (t.closest("[data-tour]")) return showTour(tourRole(), tourOpts());
    if (t.closest("[data-themecycle]")) return toast("Appearance: " + THEME_LABEL[nextTheme()] + " (this device)");
    const gt = t.closest("[data-goto]"); if (gt) { const el = document.getElementById(gt.dataset.goto) || document.getElementById(gt.dataset.goto === "appCard" ? "orientCard" : "");
      if (el) { el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth", block: "start" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
      root.querySelectorAll(".pnav [data-goto]").forEach(b => b.classList.toggle("on", b === gt)); return; }
    if (t.closest("[data-resched]")) { const iv = P.pd.interview; if (!iv) return; const b = t.closest("[data-resched]"); b.disabled = true;
      try { await addDoc(collection(db, "portal", id, "messages"), { text: `I need to reschedule my interview on ${slotLong(iv.start)}. Could you help me find another time?`, from: "applicant", by: email, name: (P.pd && P.pd.name) || "", at: Date.now() });
        toast("Sent. We'll reply under Messages as soon as we can."); $("#msgCard")?.scrollIntoView({ behavior: "smooth" }); }
      catch (err) { console.error(err); b.disabled = false; toast(`Couldn't send. Email ${CONTACT_EMAIL}.`); } return; }
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
    const mu = t.closest("[data-memup]"); if (mu) return askMemDate(mu.dataset.memup);
    const cf = t.closest("[data-cmefile]"); if (cf) { uploadKey = "cme:" + cf.dataset.cmefile; picker.click(); return; }
    if (t.closest("[data-cmeadd]")) { keepDraft(); const m = P.mdraft, hours = Math.round(+m.hours * 100) / 100, cats = [...(((P.pd.member || {}).cme || CME_DEFAULT).cats || []), CME_DRILL];
      if (!m.date) return toast("Pick the date."); if (!(hours > 0 && hours <= 24)) return toast("Hours: a number from 0.25 to 24.");
      if (!String(m.topic || "").trim()) { $("#cmeTopic")?.focus(); return toast("What was the topic?"); }
      const b = t.closest("[data-cmeadd]"); b.disabled = true;
      try { await addDoc(collection(db, "portal", id, "cmeLog"), { date: m.date, hours, topic: String(m.topic).trim().slice(0, 200), cat: cats.some(c => c.key === m.cat) ? m.cat : cats[0].key, provider: String(m.provider || "").trim().slice(0, 200), at: Date.now(), by: email });
        P.mdraft = { ...P.mdraft, hours: "", topic: "", provider: "" }; toast(`Saved ${hours} hour${hours === 1 ? "" : "s"}.`); render(); }
      catch (err) { console.error(err); b.disabled = false; toast("Couldn't save that. Try again."); } return; }
    if (t.closest("[data-pfsend]")) { keepDraft(); const m = P.mdraft, c = k => String(m[k] || "").trim();
      if (!["phone", "address", "ecName", "ecPhone", "ecRel"].some(k => c(k))) return toast("Fill in what changed first.");
      try { await addDoc(collection(db, "portal", id, "profileUpdates"), { phone: c("phone").slice(0, 40), address: c("address").slice(0, 300), ecName: c("ecName").slice(0, 200), ecPhone: c("ecPhone").slice(0, 40), ecRel: c("ecRel").slice(0, 100), at: Date.now(), by: email });
        for (const k of ["phone", "address", "ecName", "ecPhone", "ecRel"]) P.mdraft[k] = ""; toast("Sent. The squad will update your file."); render(); }
      catch (err) { console.error(err); toast("Couldn't send that. Try again."); } return; }
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
