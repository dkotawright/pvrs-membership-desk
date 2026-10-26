// Duty schedule (eSchedule-style): week board, open-shift pickup, giveaways, simple trades.
// Gated by staff/{email}.schedule === true (owner always on). Schedulers (owner/admin or staff.scheduler) publish shifts.
import { db, doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, setDoc } from "./fb.js";
import { $, esc, toast, openModal, closeModal, copyText, first, lower, pad2 } from "./shared.js";
import { CONTACT_EMAIL } from "./config.js";

const POSITIONS = ["EMT", "Driver", "Attendant"];
const TEMPLATES = [
  { id: "duty-eve", label: "Duty crew · evening", startH: 18, startM: 0, hours: 12, position: "EMT" },
  { id: "duty-day", label: "Duty crew · day", startH: 6, startM: 0, hours: 12, position: "EMT" },
  { id: "driver-eve", label: "Driver · evening", startH: 18, startM: 0, hours: 12, position: "Driver" },
];

const Q = {
  me: "", name: "", canManage: false, shifts: new Map(), trades: new Map(), staff: new Map(),
  weekStart: null, unsub: [],
};

const startOfWeek = d => {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtDay = d => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtRange = (a, b) => `${a.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${b.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
const initials = n => (n || "?").trim().split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase() || "?";
const myCleared = () => {
  const s = Q.staff.get(Q.me);
  const c = (s && s.cleared) || POSITIONS;
  return Array.isArray(c) && c.length ? c : POSITIONS;
};
const canTake = sh => !sh.assignee && (!sh.position || myCleared().includes(sh.position) || myCleared().includes("Any"));
const isMine = sh => sh.assignee === Q.me;

function stop(){ Q.unsub.forEach(u => { try { u(); } catch {} }); Q.unsub = []; }

function paint(){
  const root = $("#schedRoot"); if (!root) return;
  if (!Q.weekStart) Q.weekStart = startOfWeek(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(Q.weekStart, i));
  const end = addDays(Q.weekStart, 7).getTime();
  const startMs = Q.weekStart.getTime();
  const list = [...Q.shifts.values()].filter(s => s.start >= startMs && s.start < end).sort((a, b) => a.start - b.start || (a.position || "").localeCompare(b.position || ""));
  const open = list.filter(s => !s.assignee);
  const mine = list.filter(isMine);
  const byDay = {}; days.forEach(d => { byDay[dayKey(d)] = []; });
  list.forEach(s => { const k = dayKey(new Date(s.start)); (byDay[k] = byDay[k] || []).push(s); });

  const cell = (d) => {
    const rows = byDay[dayKey(d)] || [];
    if (!rows.length) return `<div class="scell empty"><span class="muted">Open</span></div>`;
    return `<div class="scell">${rows.map(s => {
      const who = s.assignee ? (s.assigneeName || s.assignee.split("@")[0]) : "OPEN";
      const mineCls = isMine(s) ? " mine" : "";
      const openCls = !s.assignee ? " open" : "";
      const give = s.posted ? " give" : "";
      return `<button type="button" class="sshift${mineCls}${openCls}${give}" data-sid="${esc(s.id)}">
        <b>${esc(s.position || "Duty")}</b>
        <span>${esc(fmtRange(new Date(s.start), new Date(s.end || s.start + 12 * 36e5)))}</span>
        <em>${esc(who)}${s.posted && s.assignee ? " · giveaway" : ""}</em>
      </button>`;
    }).join("")}</div>`;
  };

  root.innerHTML = `
    <header class="schedhead glass">
      <div class="schedbrand"><div class="eyebrow">PVRS · beta</div><h1>Duty schedule</h1>
        <p>Week of ${esc(fmtDay(Q.weekStart))} — pick up open shifts, post giveaways, request trades. Mimics the eSchedule flow in our desk look.</p></div>
      <div class="schedacts">
        <button class="btn" type="button" data-sc="prev">‹ Prev</button>
        <button class="btn" type="button" data-sc="today">This week</button>
        <button class="btn" type="button" data-sc="next">Next ›</button>
        ${Q.canManage ? `<button class="btn primary" type="button" data-sc="publish">Publish shifts</button>` : ""}
        <button class="btn" type="button" data-sc="desk">Membership desk</button>
        <button class="btn" type="button" data-signout>Sign out</button>
      </div>
    </header>
    <div class="schedbody">
      <aside class="schedside glass">
        <section><h3>My shifts<small>${mine.length}</small></h3>
          ${mine.length ? mine.map(s => `<button type="button" class="srow" data-sid="${esc(s.id)}"><b>${esc(fmtDay(new Date(s.start)))}</b><span>${esc(s.position || "Duty")} · ${esc(fmtRange(new Date(s.start), new Date(s.end || s.start + 12 * 36e5)))}</span></button>`).join("")
            : `<div class="oempty fun"><b>None this week</b>Pick up an open shift when you're free.</div>`}</section>
        <section><h3>Open shifts<small>${open.length}</small></h3>
          ${open.length ? open.map(s => `<button type="button" class="srow open" data-sid="${esc(s.id)}"><b>${esc(fmtDay(new Date(s.start)))}</b><span>${esc(s.position || "Duty")} · ${esc(fmtRange(new Date(s.start), new Date(s.end || s.start + 12 * 36e5)))}</span>
            ${canTake(s) ? `<i>Tap to pick up</i>` : `<i>Needs ${esc(s.position)}</i>`}</button>`).join("")
            : `<div class="oempty fun"><b>Fully covered</b>Nice work, crew.</div>`}</section>
        <section><h3>Your clearances</h3>
          <p class="help">${esc(myCleared().join(" · ") || "Not set — ask an admin.")}</p>
          <p class="help">Questions? ${esc(CONTACT_EMAIL)}</p></section>
      </aside>
      <div class="schedgrid glass" role="grid" aria-label="Week schedule">
        <div class="shead">${days.map(d => `<div><b>${esc(d.toLocaleDateString(undefined, { weekday: "short" }))}</b><span>${esc(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</span></div>`).join("")}</div>
        <div class="scols">${days.map(d => cell(d)).join("")}</div>
      </div>
    </div>`;
}

function openShift(id){
  const s = Q.shifts.get(id); if (!s) return;
  const start = new Date(s.start), end = new Date(s.end || s.start + 12 * 36e5);
  const who = s.assignee ? (s.assigneeName || s.assignee) : "Open";
  const acts = [];
  if (!s.assignee && canTake(s)) acts.push(`<button class="btn primary" type="button" data-sa="take">Pick up shift</button>`);
  if (isMine(s) && !s.posted) acts.push(`<button class="btn" type="button" data-sa="give">Post as giveaway</button>`);
  if (isMine(s) && s.posted) acts.push(`<button class="btn" type="button" data-sa="ungive">Cancel giveaway</button>`);
  if (s.posted && !isMine(s) && canTake({ ...s, assignee: null })) acts.push(`<button class="btn primary" type="button" data-sa="claim">Take giveaway</button>`);
  if (isMine(s)) acts.push(`<button class="btn" type="button" data-sa="trade">Request a trade</button>`);
  if (Q.canManage && s.assignee) acts.push(`<button class="btn" type="button" data-sa="clear">Clear assignee</button>`);
  if (Q.canManage && !s.assignee) acts.push(`<button class="btn danger" type="button" data-sa="del">Delete shift</button>`);
  const M = openModal(`<h3>${esc(s.position || "Duty")} · ${esc(fmtDay(start))}</h3>
    <p class="help">${esc(fmtRange(start, end))}${s.unit ? " · " + esc(s.unit) : ""}<br>Assigned: <b>${esc(who)}</b>${s.posted ? " (posted for giveaway)" : ""}</p>
    ${s.notes ? `<p class="help">${esc(s.notes)}</p>` : ""}
    <div class="acts">${acts.join("")}<button class="btn" type="button" data-x>Close</button></div>`);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const b = e.target.closest("[data-sa]"); if (!b) return;
    const k = b.dataset.sa;
    try {
      if (k === "take") {
        await updateDoc(doc(db, "dutyShifts", id), { assignee: Q.me, assigneeName: Q.name || Q.me, status: "filled", posted: false, updatedAt: Date.now() });
        toast("You're on for " + fmtDay(start)); closeModal();
      } else if (k === "give") {
        await updateDoc(doc(db, "dutyShifts", id), { posted: true, updatedAt: Date.now() });
        toast("Posted as a giveaway — cleared members can take it."); closeModal();
      } else if (k === "ungive") {
        await updateDoc(doc(db, "dutyShifts", id), { posted: false, updatedAt: Date.now() });
        toast("Giveaway cancelled."); closeModal();
      } else if (k === "claim") {
        await updateDoc(doc(db, "dutyShifts", id), { assignee: Q.me, assigneeName: Q.name || Q.me, status: "filled", posted: false, updatedAt: Date.now() });
        toast("Giveaway claimed."); closeModal();
      } else if (k === "clear") {
        await updateDoc(doc(db, "dutyShifts", id), { assignee: null, assigneeName: "", status: "open", posted: false, updatedAt: Date.now() });
        toast("Shift opened."); closeModal();
      } else if (k === "del") {
        await deleteDoc(doc(db, "dutyShifts", id)); toast("Shift deleted."); closeModal();
      } else if (k === "trade") {
        closeModal(); openTrade(id);
      }
    } catch (err) { console.error(err); toast("Couldn't update that shift. Try again."); }
  };
}

function openTrade(shiftId){
  const s = Q.shifts.get(shiftId); if (!s || !isMine(s)) return;
  const others = [...Q.staff.entries()].filter(([email, st]) => email !== Q.me && st.schedule).map(([email, st]) => ({ email, name: st.name || email }));
  const M = openModal(`<h3>Request a trade</h3>
    <p class="help">Ask another schedule beta member to take ${esc(fmtDay(new Date(s.start)))} (${esc(s.position || "Duty")}). They'll see it here once they open Schedule.</p>
    <div class="field"><label for="trTo">Trade with</label>
      <select id="trTo">${others.length ? others.map(o => `<option value="${esc(o.email)}">${esc(o.name)}</option>`).join("") : `<option value="">No other beta members yet</option>`}</select></div>
    <label class="row stack"><span class="lbl">Note</span><textarea id="trNote" rows="2" maxlength="400" placeholder="Optional"></textarea></label>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" data-trsend ${others.length ? "" : "disabled"}>Send request</button></div>`);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    if (!e.target.closest("[data-trsend]")) return;
    const to = lower($("#trTo").value); if (!to) return toast("Pick someone.");
    try {
      await addDoc(collection(db, "dutyTrades"), {
        shiftId, from: Q.me, fromName: Q.name || Q.me, to, toName: Q.staff.get(to)?.name || to,
        position: s.position || "", start: s.start, end: s.end || s.start + 12 * 36e5,
        note: ($("#trNote").value || "").trim().slice(0, 400), status: "pending", at: Date.now(),
      });
      toast("Trade request sent."); closeModal();
    } catch (err) { console.error(err); toast("Couldn't send the trade request."); }
  };
}

function openPublish(){
  if (!Q.canManage) return;
  const d0 = addDays(new Date(), 1);
  const dStr = `${d0.getFullYear()}-${pad2(d0.getMonth() + 1)}-${pad2(d0.getDate())}`;
  const M = openModal(`<h3>Publish duty shifts</h3>
    <p class="help">Like eSchedule templates: drop open slots onto the board for cleared members to pick up.</p>
    <div class="ios" style="padding:12px">
      <div class="addslot">
        <div class="field"><label for="dsDate">Date</label><input id="dsDate" type="date" value="${dStr}" required></div>
        <div class="field"><label for="dsTpl">Template</label><select id="dsTpl">${TEMPLATES.map(t => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("")}<option value="custom">Custom…</option></select></div>
        <div class="field"><label for="dsPos">Position</label><select id="dsPos">${POSITIONS.map(p => `<option>${esc(p)}</option>`).join("")}</select></div>
        <div class="field"><label for="dsCount">Days in a row</label><select id="dsCount">${[1,2,3,4,5,6,7].map(n => `<option>${n}</option>`).join("")}</select></div>
        <div class="field" id="dsCustom" hidden><label for="dsTime">Start</label><input id="dsTime" type="time" value="18:00"></div>
        <div class="field" id="dsCustom2" hidden><label for="dsHours">Hours</label><select id="dsHours"><option>8</option><option selected>12</option><option>24</option></select></div>
        <div class="field full"><label for="dsNotes">Notes</label><input id="dsNotes" type="text" maxlength="200" placeholder="Optional — unit, station notes…"></div>
      </div>
    </div>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" data-dspub>Publish open shifts</button></div>`, true);
  const syncTpl = () => {
    const id = $("#dsTpl").value, t = TEMPLATES.find(x => x.id === id);
    $("#dsCustom").hidden = !!t; $("#dsCustom2").hidden = !!t;
    if (t) $("#dsPos").value = t.position;
  };
  $("#dsTpl").onchange = syncTpl; syncTpl();
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    if (!e.target.closest("[data-dspub]")) return;
    const [y, mo, d] = $("#dsDate").value.split("-").map(Number);
    if (!y) return toast("Pick a date.");
    const tpl = TEMPLATES.find(x => x.id === $("#dsTpl").value);
    let h = tpl ? tpl.startH : +($("#dsTime").value.split(":")[0] || 18);
    let mi = tpl ? tpl.startM : +($("#dsTime").value.split(":")[1] || 0);
    const hours = tpl ? tpl.hours : +$("#dsHours").value || 12;
    const position = $("#dsPos").value || "EMT";
    const n = +$("#dsCount").value || 1;
    const notes = ($("#dsNotes").value || "").trim().slice(0, 200);
    try {
      for (let i = 0; i < n; i++) {
        const start = new Date(y, mo - 1, d + i, h, mi).getTime();
        const end = start + hours * 36e5;
        await addDoc(collection(db, "dutyShifts"), {
          start, end, position, unit: "PVRS", notes, status: "open",
          assignee: null, assigneeName: "", posted: false,
          createdAt: Date.now(), createdBy: Q.me,
        });
      }
      toast(`Published ${n} open ${position} shift${n > 1 ? "s" : ""}`);
      closeModal();
    } catch (err) { console.error(err); toast("Couldn't publish. Check you're on the schedule beta."); }
  };
}

function wire(){
  const root = $("#schedule");
  if (root._wired) return; root._wired = true;
  root.addEventListener("click", e => {
    const sc = e.target.closest("[data-sc]"); if (sc) {
      const k = sc.dataset.sc;
      if (k === "prev") { Q.weekStart = addDays(Q.weekStart, -7); return paint(); }
      if (k === "next") { Q.weekStart = addDays(Q.weekStart, 7); return paint(); }
      if (k === "today") { Q.weekStart = startOfWeek(new Date()); return paint(); }
      if (k === "publish") return openPublish();
      if (k === "desk") { $("#schedule").hidden = true; $("#app").hidden = false; history.replaceState(null, "", "/"); return; }
    }
    const sid = e.target.closest("[data-sid]"); if (sid) return openShift(sid.dataset.sid);
  });
}

export function startSchedule({ email, name, canManage, staffMap }){
  stop();
  Q.me = lower(email); Q.name = name || ""; Q.canManage = !!canManage;
  Q.staff = staffMap || new Map();
  Q.weekStart = startOfWeek(new Date());
  $("#app").hidden = true; $("#portal").hidden = true;
  const el = $("#schedule"); el.hidden = false;
  wire(); paint();
  Q.unsub.push(onSnapshot(collection(db, "dutyShifts"), snap => {
    Q.shifts = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    paint();
  }, () => toast("Couldn't load the schedule.")));
  Q.unsub.push(onSnapshot(collection(db, "dutyTrades"), snap => {
    Q.trades = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    const pending = [...Q.trades.values()].filter(t => t.status === "pending" && t.to === Q.me);
    if (pending.length) {
      // Soft nudge once per paint cycle via toast only when new — keep simple:
      const key = "pvrsTradeSeen";
      let seen = {}; try { seen = JSON.parse(sessionStorage.getItem(key) || "{}"); } catch {}
      pending.forEach(t => {
        if (seen[t.id]) return;
        seen[t.id] = 1;
        toast(`${t.fromName || "Someone"} wants to trade ${fmtDay(new Date(t.start))}. Open that shift to respond soon — ask them in Messages for now if needed.`);
      });
      try { sessionStorage.setItem(key, JSON.stringify(seen)); } catch {}
    }
  }, () => {}));
}

/** Owner helper: toggle schedule beta + clearances on a staff doc */
export async function setScheduleAccess(email, on, cleared){
  const patch = { schedule: !!on, updatedAt: Date.now() };
  if (cleared) patch.cleared = cleared;
  await setDoc(doc(db, "staff", lower(email)), patch, { merge: true });
}

export { POSITIONS, copyText };
