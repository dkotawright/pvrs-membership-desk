// Applicant portal: status, document uploads, interview booking.
import { db, storage, doc, collection, onSnapshot, writeBatch, addDoc, updateDoc, ref, uploadBytes } from "./fb.js";
import { $, esc, toast, timelineHTML, slotDay, slotTime, slotLong, icsFile, download, isConfidential } from "./shared.js";
import { CONTACT_EMAIL } from "./config.js";

const DAY = 864e5, MAX = 15 * 1024 * 1024;
const CONF_KEY = "_private";   // the "medical or Social Security paperwork" button (not tied to a request)
const okType = f => /^image\//.test(f.type) || f.type === "application/pdf";

const msgTime = ms => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export function threadHTML(msgs, mine){
  if (!msgs.length) return `<p class="info thread-empty">No messages yet.</p>`;
  return msgs.map(m => `<div class="msg ${m.from === mine ? "me" : "them"}"><div class="bub">${esc(m.text)}</div>
    <small>${m.from === "staff" ? (mine === "staff" ? esc(m.name || "PVRS") : "PVRS Membership") : (mine === "applicant" ? "You" : esc(m.name || "Applicant"))} · ${esc(msgTime(m.at))}${mine === "staff" && m.from === "staff" && m.seenAt ? " · Seen" : ""}</small></div>`).join("");
}
export function portalHTML({ pd, files = [], slots = [], msgs = [], preview = false, pick = null, busy = false }){
  const now = Date.now();
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
    return `<div class="doc"><div class="dt">${esc(d.label)}${conf ? `<small class="lockline">🔒 Private: only our orientation paperwork coordinator can open it</small>` : ""}${up.length?`<small>${conf ? `${up.length} file${up.length===1?"":"s"} sent privately` : up.map(f => esc(f.name)).join(", ")}</small>`:""}</div>${badge}
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
      <div class="ptop"><div><div class="eyebrow">Applicant portal</div><div class="hello">Hi ${esc(pd.firstName || "there")}</div>
      <div class="info">${esc(pd.type ? pd.type + " membership application" : "Membership application")}</div></div>
      ${preview ? `<span class="badge wait">Preview</span>` : `<button class="btn small" type="button" data-signout>Sign out</button>`}</div></section>

    <section class="card glass"><h2>Your application</h2>${timelineHTML(pd.steps || [])}</section>

    <section class="card glass" id="msgCard"><div class="ptop"><h2>Messages</h2>${msgs.some(m => m.from === "staff" && !m.seenAt) ? `<span class="badge wait">New reply</span>` : ""}</div>
      <p class="info" style="margin:0">Questions about your application? Send them here. We'll reply in this space, usually within a few days.</p>
      <div class="thread" id="thread">${threadHTML(msgs, "applicant")}</div>
      <div class="composer"><textarea id="msgText" rows="2" maxlength="2000" placeholder="Type your question…" aria-label="Your message" ${dis}></textarea>
        <button class="btn primary" type="button" data-send ${dis}>Send</button></div></section>

    <section class="card glass" id="ivCard"><h2>Interview</h2>${ivBody}</section>

    <section class="card glass" id="refCard"><h2>References</h2>${refsBody(pd.refs || [])}</section>

    <section class="card glass"><h2>Documents</h2>
      ${docs.length ? `<div>${docRows}</div>` : `<p class="info">Nothing needed right now. If we need anything from you, it will show up here.</p>`}
      ${other.filter(f => !f.confidential).length ? `<div class="info"><b>Other files you sent:</b> ${other.filter(f => !f.confidential).map(f => esc(f.name)).join(", ")}</div>` : ""}
      ${other.some(f => f.confidential) ? `<div class="info"><b>Private paperwork sent:</b> ${other.filter(f => f.confidential).length} file${other.filter(f => f.confidential).length === 1 ? "" : "s"} 🔒</div>` : ""}
      <div class="docbtns"><button class="btn small" type="button" data-upload="" ${dis}>Send another document</button>
        <button class="btn small" type="button" data-upload="${CONF_KEY}" ${dis}>🔒 Send medical or Social Security paperwork</button></div>
      <p class="info" style="margin:0">Medical and Social Security paperwork goes privately to our orientation paperwork coordinator. The membership committee can't open it.</p>
      <p class="info" style="margin:0">PDF or photo, up to 15 MB each. Trouble uploading? Email <b>${esc(CONTACT_EMAIL)}</b>.</p></section>

    <section class="card glass"><h2>What to expect</h2><div class="info">
      <ul><li>Your application goes to the next board meeting once your references and all other prerequisites (interview, driving record and application review) are complete. You'll hear back within about a week of that meeting.</li>
      <li>If the board approves you, the next step is a background check through Sterling Volunteers. Watch for an email from them.</li>
      <li>Members complete orientation (including required medical documentation and online education), self-schedule at least 4 duty crew shifts a month, and attend the monthly membership meeting on the 2nd Tuesday unless excused in advance.</li>
      <li>Monthly training is offered and all members are encouraged to take part.</li></ul>
      <p style="margin:10px 0 0">Questions? Email <b>${esc(CONTACT_EMAIL)}</b>.</p></div></section>
  </div>`;
}
// Only names and received/waiting come through; contact details stay with the squad.
function refsBody(refs){
  if (!refs.length) return `<p class="info" style="margin:0">Once we start contacting your references, you'll see here which ones we've heard from.</p>`;
  const waiting = refs.filter(r => !r.received).length;
  return `<p class="info" style="margin:0">${waiting ? `We need to hear from all of your references before your application goes to the board. Still waiting on ${waiting} of ${refs.length}. It can help to give them a quick reminder.` : "All of your references are in. Thank you!"}</p>
    <div>${refs.map(r => `<div class="doc"><div class="dt">${esc(r.name)}</div><span class="badge ${r.received ? "ok" : "wait"}">${r.received ? "Received" : "Waiting"}</span></div>`).join("")}</div>`;
}
function slotPicker(days, pick, dis, busy){
  return `<p class="info" style="margin:0">Pick a time that works for you. Interviews are with the Membership Committee.</p><div class="slots">${Object.entries(days).map(([day, list]) => `<div class="slotday"><h4>${esc(day)}</h4><div class="slotrow">${list.map(s =>
    `<button class="slotbtn" type="button" data-slot="${esc(s.id)}" aria-pressed="${pick===s.id}" ${dis}>${esc(slotTime(s.start))}</button>`).join("")}</div></div>`).join("")}</div>
    ${pick ? `<div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap"><button class="btn" type="button" data-unpick>Back</button><button class="btn primary" type="button" data-book ${busy?"disabled":""}>Book ${esc(slotTime((Object.values(days).flat().find(s => s.id === pick) || {}).start || 0))}</button></div>` : ""}`;
}

export function startPortal(id, email){
  const P = { pd: null, files: [], slots: [], msgs: [], draft: "", pick: null, busy: false, changing: false, sending: false };
  const seen = new Set();
  const root = $("#portal");
  const render = () => {
    if (!P.pd) { root.innerHTML = `<div class="wrap"><div class="empty"><h3>Loading your application…</h3></div></div>`; return; }
    const pd = P.changing ? { ...P.pd, interview: null } : P.pd;
    // Snapshots re-render the page; keep a half-typed message, its caret and the page scroll intact.
    const ta = $("#msgText"), focused = !!ta && document.activeElement === ta, caret = ta ? ta.selectionStart : 0, scroll = root.scrollTop;
    if (ta) P.draft = ta.value;
    root.innerHTML = portalHTML({ pd, files: P.files, slots: P.slots, msgs: P.msgs, pick: P.pick, busy: P.busy });
    const t2 = $("#msgText"); if (t2) { t2.value = P.draft; if (focused) { t2.focus({ preventScroll: true }); t2.setSelectionRange(caret, caret); } }
    const th = $("#thread"); if (th) th.scrollTop = th.scrollHeight;
    root.scrollTop = scroll;
    // Mark the squad's replies as seen once they've been shown.
    for (const m of P.msgs) if (m.from === "staff" && !m.seenAt && !seen.has(m.id)) { seen.add(m.id); updateDoc(doc(db, "portal", id, "messages", m.id), { seenAt: Date.now() }).catch(() => seen.delete(m.id)); }
    if (P.changing) $("#ivCard").insertAdjacentHTML("beforeend", `<div><button class="btn small" type="button" data-keep>Keep my current time</button></div>`);
  };
  render();
  onSnapshot(doc(db, "portal", id), s => { P.pd = s.exists() ? s.data() : { steps: [] }; render(); }, () => toast("Couldn't load your application. Reload the page."));
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
  root.addEventListener("input", e => { if (e.target.id === "msgText") P.draft = e.target.value; });
  root.addEventListener("keydown", e => { if (e.target.id === "msgText" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
  onSnapshot(collection(db, "portal", id, "files"), s => { P.files = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, () => {});
  onSnapshot(collection(db, "slots"), s => { P.slots = s.docs.map(d => ({ id: d.id, ...d.data() })); if (P.pick && !P.slots.some(x => x.id === P.pick && !x.bookedBy)) P.pick = null; render(); }, () => {});

  const picker = document.createElement("input"); picker.type = "file"; picker.accept = "application/pdf,image/*"; picker.multiple = true; picker.hidden = true; document.body.appendChild(picker);
  let uploadKey = "";
  picker.addEventListener("change", async () => {
    const list = [...picker.files]; picker.value = ""; if (!list.length) return;
    const docEntry = (P.pd.docs || []).find(d => d.key === uploadKey);
    const label = docEntry ? docEntry.label : uploadKey === CONF_KEY ? "Medical / Social Security paperwork" : "Other";
    const conf = uploadKey === CONF_KEY || isConfidential(label), docKey = uploadKey === CONF_KEY ? "" : uploadKey;
    for (const f of list) {
      if (!okType(f)) { toast(`${f.name} isn't a PDF or photo.`); continue; }
      if (f.size > MAX) { toast(`${f.name} is over 15 MB.`); continue; }
      try {
        toast(`Uploading ${f.name}…`);
        const safe = `${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
        if (conf) {
          // Private: the file and its name go only to the paperwork account; the squad sees a nameless placeholder.
          const path = `confidential/${id}/${safe}`;
          await uploadBytes(ref(storage, path), f, { contentType: f.type });
          await addDoc(collection(db, "vault"), { appId: id, appName: P.pd.name || "", label, name: f.name, path, size: f.size, contentType: f.type, uploadedAt: Date.now(), uploadedBy: email, from: "applicant" });
          await addDoc(collection(db, "portal", id, "files"), { docKey, label, name: "Private document", path: "", size: f.size, contentType: f.type, uploadedAt: Date.now(), uploadedBy: email, confidential: true });
          toast(`Sent ${f.name} privately`);
        } else {
          const path = `uploads/${id}/${safe}`;
          await uploadBytes(ref(storage, path), f, { contentType: f.type });
          await addDoc(collection(db, "portal", id, "files"), { docKey: uploadKey, label, name: f.name, path, size: f.size, contentType: f.type, uploadedAt: Date.now(), uploadedBy: email });
          toast(`Uploaded ${f.name}`);
        }
      } catch (e) { console.error(e); toast(`Couldn't upload ${f.name}. Try again or email ${CONTACT_EMAIL}.`); }
    }
  });

  root.addEventListener("click", async e => {
    const t = e.target;
    if (t.closest("[data-send]")) return send();
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
