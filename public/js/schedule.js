// Duty schedule — eSchedule-style calendar: click a day, see who's on / what's open,
// and sign up for a slot matching your clearances & credentials. No "publish first".
// Members see only their own hours + credentials; roster shows names + portables.
// Gated by staff/{email}.schedule === true (owner always on).
import { db, doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, getDoc, runTransaction, query, where } from "./fb.js";
import { $, esc, toast, openModal, closeModal, copyText, lower, pad2, TYPES, ago } from "./shared.js";
import { CONTACT_EMAIL, OWNER_EMAIL } from "./config.js";

export const POSITIONS = ["EMT", "AEMT", "Paramedic", "Driver", "Driver Trainer"];
// Fixed duty windows every day (self-serve open slots — no publish step).
const BANDS = [
  { id: "day", label: "Day", startH: 6, hours: 12 },
  { id: "eve", label: "Evening", startH: 18, hours: 12 },
];
export const HOUR_TARGETS = {
  "Regular": 24, "Associate": 24, "Driver Only": 24, "Non-Resident": 24,
  "Auxiliary": 16, "Non-Operational": 0,
};
export const CRED_DEFS = [
  { key: "emt", label: "NYS / NREMT EMT", for: ["EMT"] },
  { key: "aemt", label: "NYS AEMT", for: ["AEMT"] },
  { key: "medic", label: "NYS / NREMT Paramedic", for: ["Paramedic"] },
  { key: "cpr", label: "CPR / BLS", for: ["EMT", "AEMT", "Paramedic", "Driver", "Driver Trainer"] },
  { key: "dl", label: "Driver's license", for: ["Driver", "Driver Trainer"] },
];
const POSITION_CREDS = {
  EMT: ["emt", "cpr"],
  AEMT: ["aemt", "cpr"],
  Paramedic: ["medic", "cpr"],
  Driver: ["dl", "cpr"],
  "Driver Trainer": ["dl", "cpr"],
};
const CLINICAL = new Set(["EMT", "AEMT", "Paramedic"]);
const DRIVING = new Set(["Driver", "Driver Trainer"]);

const Q = {
  me: "", name: "", canManage: false, shifts: new Map(), trades: new Map(), staff: new Map(),
  threads: new Map(), weekStart: null, monthStart: null, view: "week", unsub: [], onDesk: null,
  onUnread: null, msgsPrimed: false,
};

const startOfWeek = d => {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
};
const startOfMonth = d => { const x = new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const dayKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtDay = d => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtDayLong = d => d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const fmtRange = (a, b) => `${a.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${b.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
const monthBounds = (d = new Date()) => {
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return { start, end, label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
};
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const isToday = d => sameDay(d, new Date());
const bandTimes = (day, band) => {
  const start = new Date(day); start.setHours(band.startH, 0, 0, 0);
  const end = new Date(start.getTime() + band.hours * 36e5);
  return { start: start.getTime(), end: end.getTime(), startDate: start, endDate: end };
};
const slotDocId = (day, bandId, position) => `${dayKey(day)}_${bandId}_${String(position).replace(/\s+/g, "")}`;
const shiftHours = s => Math.max(0, ((s.end || s.start + 12 * 36e5) - s.start) / 36e5);
const meStaff = () => Q.staff.get(Q.me) || {};
const memberType = (st = meStaff()) => st.memberType || "Regular";
const hourTarget = (st = meStaff()) => HOUR_TARGETS[memberType(st)] ?? 24;
const displayName = (email, st) => (st && st.name) || (email === Q.me ? Q.name : "") || email.split("@")[0];
const portableOf = st => String(st?.portable || "").trim();
const blankCredentials = () => CRED_DEFS.map(d => ({ key: d.key, label: d.label, expires: "" }));
const myCleared = () => {
  const c = meStaff().cleared;
  return Array.isArray(c) && c.length ? c.filter(p => POSITIONS.includes(p)) : [];
};
const myClearedFor = st => {
  const c = st.cleared;
  return Array.isArray(c) && c.length ? c.filter(p => POSITIONS.includes(p)) : [];
};
const credList = (st = meStaff()) => {
  const raw = st.credentials;
  const byKey = new Map((Array.isArray(raw) ? raw : []).map(c => [c.key, c]));
  return CRED_DEFS.map(d => {
    const c = byKey.get(d.key);
    return { key: d.key, label: d.label, expires: c?.expires || "" };
  });
};
const daysUntil = exp => {
  if (!exp) return null;
  const t = new Date(exp + "T12:00:00").getTime();
  if (!Number.isFinite(t)) return null;
  return Math.round((t - Date.now()) / 864e5);
};
const credStatus = c => {
  const d = daysUntil(c.expires);
  if (d == null) return { kind: "missing", label: "No expiry on file" };
  if (d < 0) return { kind: "expired", label: `Expired ${Math.abs(d)}d ago` };
  if (d <= 60) return { kind: "soon", label: `Expires in ${d}d` };
  return { kind: "ok", label: `Expires ${c.expires}` };
};
const credByKey = (st, key) => credList(st).find(c => c.key === key);
const blockedForPosition = (st, position) => {
  const need = POSITION_CREDS[position] || [];
  const bad = [];
  for (const key of need) {
    const c = credByKey(st, key);
    if (!c || !c.expires) { bad.push((CRED_DEFS.find(d => d.key === key) || { label: key }).label + " (missing)"); continue; }
    if (credStatus(c).kind === "expired") bad.push(c.label + " expired");
  }
  return bad;
};
const isMine = sh => sh && sh.assignee === Q.me;
const monthHoursFor = email => {
  const { start, end } = monthBounds();
  let h = 0;
  for (const s of Q.shifts.values()) {
    if (s.assignee !== email || s.status === "cancelled") continue;
    if (s.start < start || s.start >= end) continue;
    if (s.start <= Date.now() || s.credited) h += shiftHours(s);
  }
  return Math.round(h * 10) / 10;
};
const schedulePeople = () => [...Q.staff.entries()]
  .filter(([email, s]) => s.schedule || email === Q.me || email === lower(OWNER_EMAIL))
  .sort((a, b) => displayName(a[0], a[1]).localeCompare(displayName(b[0], b[1]), undefined, { sensitivity: "base" }));

/* ---------- Crew DMs ---------- */
const pairId = (a, b) => { const x = lower(a), y = lower(b); return x < y ? `${x}__${y}` : `${y}__${x}`; };
const otherOf = (t, me = Q.me) => (t.participants || []).find(e => e !== me) || "";
const threadUnread = t => !!(t.lastAt && t.lastBy && t.lastBy !== Q.me && t.lastAt > ((t.seenAt || {})[Q.me] || 0));
const crewUnreadTotal = () => [...Q.threads.values()].filter(threadUnread).length;
const msgTime = ms => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
function bumpCrewBadge(){
  const n = crewUnreadTotal();
  if (typeof Q.onUnread === "function") Q.onUnread(n);
  const btn = document.querySelector('[data-sc="crewmsg"]');
  if (btn) {
    let b = btn.querySelector(".navbadge"); if (!b) { b = document.createElement("b"); b.className = "navbadge"; btn.appendChild(b); }
    b.textContent = n || ""; b.hidden = !n;
  }
}
async function ensureThread(otherEmail){
  const other = lower(otherEmail);
  if (!other || other === Q.me) throw new Error("bad peer");
  const id = pairId(Q.me, other);
  const ref = doc(db, "crewThreads", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const st = Q.staff.get(other) || {};
    const a = lower(Q.me), b = other;
    const participants = a < b ? [a, b] : [b, a];
    await setDoc(ref, {
      participants,
      names: { [Q.me]: Q.name || Q.me, [other]: displayName(other, st) },
      lastText: "", lastAt: 0, lastBy: "", seenAt: {}, updatedAt: Date.now(),
    });
  }
  return id;
}

/** Resolve a calendar slot to an existing shift (deterministic id or legacy random id). */
function findSlotShift(day, band, position) {
  const id = slotDocId(day, band.id, position);
  if (Q.shifts.has(id)) return Q.shifts.get(id);
  const { start } = bandTimes(day, band);
  for (const s of Q.shifts.values()) {
    if (s.position !== position) continue;
    if (Math.abs((s.start || 0) - start) < 5 * 60e3) return s;
  }
  return null;
}
function hasOverlap(start, end, exceptId){
  for (const s of Q.shifts.values()) {
    if (!isMine(s) || s.id === exceptId || s.status === "cancelled") continue;
    const a = s.start, b = s.end || a + 12 * 36e5;
    if (a < end && b > start) return true;
  }
  return false;
}
function canClaimPosition(position, day, band){
  if (!myCleared().includes(position) && !myCleared().includes("Any")) return { ok: false, why: `Not cleared for ${position}` };
  const block = blockedForPosition(meStaff(), position);
  if (block.length) return { ok: false, why: block.join(", ") };
  const { start, end } = bandTimes(day, band);
  if (hasOverlap(start, end)) return { ok: false, why: "You're already on this window" };
  if (end <= Date.now()) return { ok: false, why: "This shift already ended" };
  return { ok: true, why: "" };
}
function dayCoverage(day){
  const filled = [], openEligible = [];
  let clinical = 0, driving = 0, taken = 0;
  for (const band of BANDS) {
    for (const pos of POSITIONS) {
      const s = findSlotShift(day, band, pos);
      if (s && s.assignee && !s.posted) {
        taken++;
        filled.push({ band, pos, s });
        if (CLINICAL.has(pos)) clinical++;
        if (DRIVING.has(pos)) driving++;
      } else if (canClaimPosition(pos, day, band).ok) {
        openEligible.push({ band, pos, s });
      }
    }
  }
  const status = clinical && driving ? "covered" : taken ? "partial" : "open";
  return { filled, openEligible, clinical, driving, taken, status };
}

const stop = () => { Q.unsub.forEach(u => { try { u(); } catch {} }); Q.unsub = []; };
export function stopSchedule(){ stop(); }

function hoursCard(){
  const st = meStaff(), target = hourTarget(st), got = monthHoursFor(Q.me), { label } = monthBounds();
  const pct = target > 0 ? Math.min(100, Math.round(got / target * 100)) : (got ? 100 : 0);
  const rem = target > 0 ? Math.max(0, Math.round((target - got) * 10) / 10) : 0;
  return `<section class="hoursCard">
    <h3>Your hours · ${esc(label)}<small>${esc(memberType(st))}</small></h3>
    <div class="hbar" aria-hidden="true"><i style="width:${pct}%"></i></div>
    <p class="help"><b>${got}</b> of <b>${target || "—"}</b> hours${target ? (rem ? ` · ${rem} to go` : " · met ✓") : " · no monthly target"}</p>
    <p class="help muted">Only you see this. Tap a day on the calendar to sign up for open slots that match your clearances.</p>
  </section>`;
}
function credsCard(){
  const list = credList();
  const rows = list.map(c => {
    const stt = credStatus(c);
    return `<div class="credrow ${stt.kind}"><span><b>${esc(c.label)}</b><small>${esc(stt.label)}</small></span></div>`;
  }).join("");
  const soon = list.filter(c => ["expired", "soon", "missing"].includes(credStatus(c).kind)).length;
  return `<section><h3>Your credentials<small>${soon ? soon + " need attention" : "ok"}</small></h3>
    ${rows}
    <button class="btn small" type="button" data-sc="creds" style="margin-top:8px">Update mine</button>
  </section>`;
}
function rosterCard(){
  const people = schedulePeople();
  const rows = people.map(([email, st]) => {
    const port = portableOf(st);
    const mine = email === Q.me;
    const tid = pairId(Q.me, email);
    const unread = !mine && Q.threads.has(tid) && threadUnread(Q.threads.get(tid));
    return `<button type="button" class="srow roster${mine ? " mine" : ""}" data-roster="${esc(email)}">
      <b>${esc(displayName(email, st))}${mine ? " · you" : ""}${unread ? ` <span class="badge wait">new</span>` : ""}</b>
      <span>${port ? "Portable " + esc(port) : "No portable on file"}${mine ? "" : " · tap to message"}</span>
    </button>`;
  }).join("");
  const unread = crewUnreadTotal();
  return `<section class="rosterCard"><h3>Crew roster<small>${people.length}</small></h3>
    <p class="help muted">Names, portables, and messages with other members.</p>
    ${rows || `<div class="oempty fun"><b>No one yet</b>${Q.canManage ? "Open Crew settings to add people." : "Ask a coordinator to add you."}</div>`}
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
      <button class="btn small" type="button" data-sc="crewmsg">Messages${unread ? ` · ${unread}` : ""}</button>
      ${Q.canManage ? `<button class="btn small" type="button" data-sc="crew">Crew settings</button>` : ""}
    </div>
  </section>`;
}

function crewThreadHTML(msgs){
  if (!msgs.length) return `<div class="softempty thread-empty"><b>No messages yet</b>Say hi — shift coverage, trades, or a quick question.</div>`;
  return msgs.map(m => `<div class="msg ${m.by === Q.me ? "me" : "them"}"><div class="bub">${esc(m.text)}</div>
    <small>${m.by === Q.me ? "You" : esc(m.name || "Crew")} · ${esc(msgTime(m.at))}</small></div>`).join("");
}

export function openCrewInbox(){
  const threads = [...Q.threads.values()].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  const peers = schedulePeople().filter(([e]) => e !== Q.me);
  const M = openModal(`<h3>Crew messages</h3>
    <p class="help">Message other duty members. Applicant messages stay on the membership desk.</p>
    <div class="ios">${threads.length ? threads.map(t => {
      const other = otherOf(t);
      const name = (t.names && t.names[other]) || displayName(other, Q.staff.get(other) || {});
      const unread = threadUnread(t);
      return `<button class="oitem" type="button" data-crewchat="${esc(other)}" style="width:100%">
        <span class="ot"><b>${esc(name)}${unread ? ` <span class="badge wait">new</span>` : ""}</b>
          <small>${t.lastBy === Q.me ? "You: " : ""}${esc((t.lastText || "No messages yet").slice(0, 90))}</small></span>
        <span class="when">${t.lastAt ? esc(ago(t.lastAt)) : ""}</span></button>`;
    }).join("") : `<div class="oempty">No conversations yet — pick someone below.</div>`}</div>
    ${peers.length ? `<h4 class="tabsec" style="margin:14px 0 8px">Start a chat</h4>
      <div class="ios">${peers.map(([email, st]) => `<button class="oitem" type="button" data-crewchat="${esc(email)}" style="width:100%">
        <span class="ot"><b>${esc(displayName(email, st))}</b><small>${portableOf(st) ? "Portable " + esc(portableOf(st)) : esc(email)}</small></span>
        <span class="chev" aria-hidden="true">›</span></button>`).join("")}</div>` : ""}
    <div class="acts"><button class="btn" type="button" data-x>Close</button></div>`, true);
  M.onclick = e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const b = e.target.closest("[data-crewchat]"); if (!b) return;
    closeModal(); openCrewChat(b.dataset.crewchat);
  };
}

export async function openCrewChat(otherEmail){
  const other = lower(otherEmail);
  if (!other || other === Q.me) return;
  let id;
  try { id = await ensureThread(other); }
  catch (err) { console.error(err); return toast("Couldn't start that chat."); }
  const st = Q.staff.get(other) || {};
  const name = displayName(other, st);
  const port = portableOf(st);
  const M = openModal(`<h3>${esc(name)}</h3>
    <p class="help">${port ? "Portable " + esc(port) + " · " : ""}${esc(other)}</p>
    <div class="crewthread" id="crewThread"><div class="softempty thread-empty">Loading…</div></div>
    <div class="crewcompose">
      <textarea id="crewReply" rows="2" maxlength="2000" placeholder="Message ${esc(name.split(" ")[0] || "them")}…"></textarea>
      <button class="btn primary" type="button" data-crewsend>Send</button>
    </div>
    <div class="acts"><button class="btn" type="button" data-crewback>All messages</button><button class="btn" type="button" data-x>Close</button></div>`, true);

  let unsub = null;
  const cleanup = () => { if (unsub) { unsub(); unsub = null; } };
  M._cleanup = cleanup;

  const markSeen = async () => {
    try {
      const cur = Q.threads.get(id) || {};
      const seenAt = { ...(cur.seenAt || {}), [Q.me]: Date.now() };
      await updateDoc(doc(db, "crewThreads", id), { seenAt, updatedAt: Date.now() });
    } catch {}
  };

  unsub = onSnapshot(collection(db, "crewThreads", id, "messages"), snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.at || 0) - (b.at || 0));
    const el = $("#crewThread"); if (!el) return;
    el.innerHTML = crewThreadHTML(msgs);
    el.scrollTop = el.scrollHeight;
    markSeen();
  }, () => toast("Couldn't load messages."));

  M.onclick = async e => {
    if (e.target.closest("[data-x]")) { cleanup(); return closeModal(); }
    if (e.target.closest("[data-crewback]")) { cleanup(); closeModal(); return openCrewInbox(); }
    if (!e.target.closest("[data-crewsend]")) return;
    const ta = $("#crewReply"); const text = (ta?.value || "").trim();
    if (!text) return ta?.focus();
    if (text.length > 2000) return toast("Messages can be up to 2,000 characters.");
    const btn = e.target.closest("[data-crewsend]"); btn.disabled = true;
    try {
      await addDoc(collection(db, "crewThreads", id, "messages"), {
        text, by: Q.me, name: Q.name || Q.me, at: Date.now(),
      });
      const cur = Q.threads.get(id) || {};
      await updateDoc(doc(db, "crewThreads", id), {
        lastText: text.slice(0, 200), lastAt: Date.now(), lastBy: Q.me,
        updatedAt: Date.now(),
        seenAt: { ...(cur.seenAt || {}), [Q.me]: Date.now() },
        names: { ...(cur.names || {}), [Q.me]: Q.name || Q.me },
      });
      if (ta) ta.value = "";
    } catch (err) { console.error(err); toast("Couldn't send. Try again."); }
    finally { btn.disabled = false; }
  };
}

function weekCell(d){
  const cov = dayCoverage(d);
  const bandsHtml = BANDS.map(band => {
    const people = POSITIONS.map(pos => {
      const s = findSlotShift(d, band, pos);
      if (s && s.assignee && !s.posted) {
        const st = Q.staff.get(s.assignee) || {};
        const short = (s.assigneeName || displayName(s.assignee, st)).split(" ")[0];
        return `<span class="chip on${isMine(s) ? " mine" : ""}" title="${esc(pos)}">${esc(pos.split(" ")[0])} · ${esc(short)}</span>`;
      }
      if (s && s.posted) return `<span class="chip give" title="Giveaway">${esc(pos.split(" ")[0])} · free</span>`;
      return null;
    }).filter(Boolean);
    const openN = POSITIONS.filter(pos => {
      const s = findSlotShift(d, band, pos);
      return !(s && s.assignee && !s.posted);
    }).length;
    return `<div class="bandsum"><b>${esc(band.label)}</b>
      <div class="chips">${people.length ? people.join("") : `<span class="chip open">All open</span>`}
        ${openN && people.length ? `<span class="chip open">${openN} open</span>` : ""}</div></div>`;
  }).join("");
  return `<button type="button" class="scell daycell ${cov.status}${isToday(d) ? " today" : ""}" data-day="${esc(dayKey(d))}">
    <div class="daytop"><b>${esc(d.toLocaleDateString(undefined, { weekday: "short" }))}</b><span>${esc(d.getDate())}</span></div>
    ${bandsHtml}
    <em class="tap">Tap for who's on</em>
  </button>`;
}

function monthGrid(){
  if (!Q.monthStart) Q.monthStart = startOfMonth(new Date());
  const first = Q.monthStart;
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return `<div class="monthgrid" role="grid" aria-label="Month schedule">
    <div class="shead month">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => `<div><b>${d}</b></div>`).join("")}</div>
    <div class="mcols">${days.map(d => {
      const inMonth = d.getMonth() === first.getMonth();
      const cov = dayCoverage(d);
      return `<button type="button" class="mcell ${cov.status}${inMonth ? "" : " out"}${isToday(d) ? " today" : ""}" data-day="${esc(dayKey(d))}" ${inMonth ? "" : "tabindex=-1"}>
        <b>${d.getDate()}</b>
        <span>${cov.taken ? cov.taken + " on" : "Open"}</span>
        <i class="dot ${cov.status}" aria-hidden="true"></i>
      </button>`;
    }).join("")}</div>
  </div>`;
}

function paint(){
  const root = $("#schedRoot"); if (!root) return;
  if (!Q.weekStart) Q.weekStart = startOfWeek(new Date());
  if (!Q.monthStart) Q.monthStart = startOfMonth(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(Q.weekStart, i));
  const mine = [...Q.shifts.values()].filter(s => isMine(s) && s.start >= Q.weekStart.getTime() && s.start < addDays(Q.weekStart, 7).getTime())
    .sort((a, b) => a.start - b.start);
  const title = Q.view === "month"
    ? Q.monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : `Week of ${fmtDay(Q.weekStart)}`;

  root.innerHTML = `
    <header class="schedhead glass">
      <div class="schedbrand"><div class="eyebrow">PVRS · duty calendar</div><h1>Duty schedule</h1>
        <p>${esc(title)} — tap a day to see who's on and grab an open slot that matches your level.</p></div>
      <div class="schedacts">
        <div class="seg" role="group" aria-label="Calendar view">
          <button type="button" data-sc="view-week" class="${Q.view === "week" ? "on" : ""}">Week</button>
          <button type="button" data-sc="view-month" class="${Q.view === "month" ? "on" : ""}">Month</button>
        </div>
        <button class="btn" type="button" data-sc="prev">‹</button>
        <button class="btn" type="button" data-sc="today">Today</button>
        <button class="btn" type="button" data-sc="next">›</button>
        <button class="btn" type="button" data-sc="crewmsg">Messages${crewUnreadTotal() ? ` · ${crewUnreadTotal()}` : ""}</button>
        ${Q.canManage ? `<button class="btn" type="button" data-sc="crew">Crew settings</button>` : ""}
        <button class="btn" type="button" data-sc="desk">${Q.onDesk ? "Membership" : "Membership desk"}</button>
        <button class="btn" type="button" data-signout>Sign out</button>
      </div>
    </header>
    <div class="schedbody">
      <aside class="schedside glass">
        ${hoursCard()}
        ${credsCard()}
        ${rosterCard()}
        <section><h3>My shifts<small>${mine.length}</small></h3>
          ${mine.length ? mine.map(s => `<button type="button" class="srow" data-sid="${esc(s.id)}"><b>${esc(fmtDay(new Date(s.start)))}</b><span>${esc(s.position || "Duty")} · ${esc(fmtRange(new Date(s.start), new Date(s.end || s.start + 12 * 36e5)))} · ${shiftHours(s)}h</span></button>`).join("")
            : `<div class="oempty fun"><b>None this week</b>Open a day on the calendar and take a slot you're cleared for.</div>`}</section>
        <section><h3>Your clearances</h3>
          <p class="help">${esc(myCleared().join(" · ") || "Not set — ask a coordinator in Crew settings.")}</p>
          <p class="help">Open slots you can take light up on each day. Questions? ${esc(CONTACT_EMAIL)}</p></section>
      </aside>
      ${Q.view === "month" ? `<div class="schedgrid glass">${monthGrid()}</div>` : `
      <div class="schedgrid glass" role="grid" aria-label="Week schedule">
        <div class="scols weekcols">${days.map(d => weekCell(d)).join("")}</div>
      </div>`}
    </div>`;
}

function parseDayKey(key){
  const [y, m, d] = String(key || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d); dt.setHours(0, 0, 0, 0);
  return dt;
}

async function claimSlot(day, bandId, position){
  const band = BANDS.find(b => b.id === bandId); if (!band) return;
  const check = canClaimPosition(position, day, band);
  if (!check.ok) return toast(check.why);
  const existing = findSlotShift(day, band, position);
  if (existing && existing.assignee && !existing.posted) return toast("That slot was just taken.");
  const { start, end } = bandTimes(day, band);
  const id = existing?.id || slotDocId(day, band.id, position);
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, "dutyShifts", id);
      const snap = await tx.get(ref);
      if (snap.exists()) {
        const cur = snap.data();
        if (cur.assignee && !cur.posted && cur.assignee !== Q.me) throw Object.assign(new Error("taken"), { code: "taken" });
        // Existing open/giveaway doc — only flip assignee fields (rules-friendly).
        tx.update(ref, {
          assignee: Q.me, assigneeName: Q.name || Q.me, status: "filled", posted: false, updatedAt: Date.now(),
        });
      } else {
        tx.set(ref, {
          start, end, position, band: band.id, unit: "PVRS", notes: "",
          status: "filled", assignee: Q.me, assigneeName: Q.name || Q.me, posted: false,
          createdAt: Date.now(), createdBy: Q.me, updatedAt: Date.now(),
        });
      }
    });
    toast(`You're on · ${position} · ${fmtDay(day)} ${band.label}`);
    closeModal();
  } catch (err) {
    console.error(err);
    toast(err?.code === "taken" ? "Someone else just took that slot." : "Couldn't sign up. Try again.");
  }
}

async function dropSlot(id){
  const s = Q.shifts.get(id); if (!s || !isMine(s)) return;
  try {
    await deleteDoc(doc(db, "dutyShifts", id));
    toast("You're off that shift.");
    closeModal();
  } catch (err) { console.error(err); toast("Couldn't drop that shift."); }
}

function openDay(dayOrKey){
  const day = dayOrKey instanceof Date ? dayOrKey : parseDayKey(dayOrKey);
  if (!day) return;
  const cov = dayCoverage(day);
  const bandsHtml = BANDS.map(band => {
    const { startDate, endDate } = bandTimes(day, band);
    const rows = POSITIONS.map(pos => {
      const s = findSlotShift(day, band, pos);
      const filled = s && s.assignee && !s.posted;
      const give = s && s.posted;
      if (filled) {
        const st = Q.staff.get(s.assignee) || {};
        const port = portableOf(st);
        const mine = isMine(s);
        return `<div class="slotrow filled${mine ? " mine" : ""}">
          <div><b>${esc(pos)}</b><span>${esc(s.assigneeName || displayName(s.assignee, st))}${port ? " · P" + esc(port) : ""}${give ? " · giveaway" : ""}</span></div>
          <div class="slotacts">
            ${mine ? `<button class="btn small" type="button" data-drop="${esc(s.id)}">Drop</button>
              <button class="btn small" type="button" data-give="${esc(s.id)}">${s.posted ? "Cancel giveaway" : "Giveaway"}</button>
              <button class="btn small" type="button" data-sid="${esc(s.id)}">More</button>` : ""}
            ${!mine && Q.canManage ? `<button class="btn small" type="button" data-clear="${esc(s.id)}">Clear</button>` : ""}
          </div>
        </div>`;
      }
      const check = canClaimPosition(pos, day, band);
      const giveTake = give && check.ok;
      return `<div class="slotrow open${check.ok ? " can" : ""}">
        <div><b>${esc(pos)}</b><span>${give ? "Giveaway — open" : "Open"}</span>
          ${check.ok ? "" : `<small class="cred-missing">${esc(check.why)}</small>`}</div>
        <div class="slotacts">
          ${check.ok ? `<button class="btn small primary" type="button" data-claim="${esc(band.id)}" data-pos="${esc(pos)}">${giveTake ? "Take giveaway" : "Sign up"}</button>` : ""}
        </div>
      </div>`;
    }).join("");
    return `<section class="dayband"><h4>${esc(band.label)} <small>${esc(fmtRange(startDate, endDate))}</small></h4>${rows}</section>`;
  }).join("");

  const coverNote = cov.clinical && cov.driving
    ? "Crew covered (clinical + driver)."
    : cov.taken
      ? "Partial — still needs " + (!cov.clinical ? "a clinician" : "") + (!cov.clinical && !cov.driving ? " and " : "") + (!cov.driving ? "a driver" : "") + "."
      : "Nothing signed up yet — open slots below.";

  const M = openModal(`<h3>${esc(fmtDayLong(day))}</h3>
    <p class="help">${esc(coverNote)} Sign up only for positions you're cleared for.</p>
    <div class="dayboard">${bandsHtml}</div>
    <div class="acts"><button class="btn" type="button" data-x>Close</button></div>`, true);

  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const claim = e.target.closest("[data-claim]");
    if (claim) return claimSlot(day, claim.dataset.claim, claim.dataset.pos);
    const drop = e.target.closest("[data-drop]");
    if (drop) return dropSlot(drop.dataset.drop);
    const give = e.target.closest("[data-give]");
    if (give) {
      const s = Q.shifts.get(give.dataset.give); if (!s || !isMine(s)) return;
      try {
        await updateDoc(doc(db, "dutyShifts", s.id), { posted: !s.posted, updatedAt: Date.now() });
        toast(s.posted ? "Giveaway cancelled." : "Posted as a giveaway.");
        closeModal(); openDay(day);
      } catch { toast("Couldn't update giveaway."); }
      return;
    }
    const clear = e.target.closest("[data-clear]");
    if (clear) {
      try {
        await deleteDoc(doc(db, "dutyShifts", clear.dataset.clear));
        toast("Slot cleared."); closeModal(); openDay(day);
      } catch { toast("Couldn't clear that slot."); }
      return;
    }
    const sid = e.target.closest("[data-sid]");
    if (sid) { closeModal(); return openShift(sid.dataset.sid); }
  };
}

function openCreds(email){
  const target = lower(email || Q.me);
  const st = Q.staff.get(target) || {};
  const editingOther = target !== Q.me;
  if (editingOther && !Q.canManage) return toast("Only coordinators can edit others' credentials.");
  const list = credList(st);
  const type = memberType(st);
  const port = portableOf(st);
  const M = openModal(`<h3>${editingOther ? esc(displayName(target, st)) + " · " : ""}Credentials & category</h3>
    <p class="help">${editingOther ? "Coordinator view — members only see their own hours and credentials on the board." : "Only you see your hours and credential details. The roster shows your name and portable to the crew."}</p>
    <div class="field"><label for="crPortable">Portable number</label>
      <input id="crPortable" type="text" maxlength="20" inputmode="numeric" placeholder="e.g. 12" value="${esc(port)}"></div>
    ${Q.canManage ? `<div class="field"><label for="crType">Membership category</label>
      <select id="crType">${TYPES.map(t => `<option value="${esc(t)}" ${t === type ? "selected" : ""}>${esc(t)} · ${HOUR_TARGETS[t] ?? "—"}h/mo</option>`).join("")}</select></div>`
      : `<p class="help">Category: <b>${esc(type)}</b> · ${HOUR_TARGETS[type] ?? "—"}h/mo</p>`}
    <div class="ios" style="padding:10px 12px">${list.map(c => {
      const stt = credStatus(c);
      return `<div class="row stack"><span class="lbl">${esc(c.label)}<small class="cred-${stt.kind}">${esc(stt.label)}</small></span>
        <input type="date" data-cr="${esc(c.key)}" value="${esc(c.expires || "")}" aria-label="${esc(c.label)} expiry"></div>`;
    }).join("")}</div>
    ${Q.canManage ? `<div class="field" style="margin-top:8px"><label>Cleared positions</label>
      <div class="seg wrap" id="crCleared" role="group">${POSITIONS.map(p => `<button type="button" data-cl="${esc(p)}" class="${myClearedFor(st).includes(p) ? "on" : ""}">${esc(p)}</button>`).join("")}</div>
      <p class="help" style="margin-top:6px">These are the slots they can sign up for on the calendar.</p></div>`
      : `<p class="help" style="margin-top:8px">Cleared: <b>${esc(myClearedFor(st).join(" · ") || "not set")}</b></p>`}
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" data-crsave>Save</button></div>`, true);
  const cleared = new Set(myClearedFor(st));
  M.querySelector("#crCleared")?.addEventListener("click", e => {
    const b = e.target.closest("[data-cl]"); if (!b) return;
    if (cleared.has(b.dataset.cl)) cleared.delete(b.dataset.cl); else cleared.add(b.dataset.cl);
    b.classList.toggle("on");
  });
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    if (!e.target.closest("[data-crsave]")) return;
    const credentials = list.map(c => ({
      key: c.key, label: c.label,
      expires: (M.querySelector(`[data-cr="${c.key}"]`)?.value || "").slice(0, 10),
    }));
    const portable = ($("#crPortable")?.value || "").trim().slice(0, 20);
    const patch = { credentials, portable, updatedAt: Date.now() };
    if (Q.canManage) {
      patch.cleared = [...cleared];
      patch.memberType = $("#crType")?.value || type;
    }
    try {
      await setDoc(doc(db, "staff", target), patch, { merge: true });
      const cur = { ...(Q.staff.get(target) || {}), ...patch, schedule: true, name: st.name || (target === Q.me ? Q.name : target) };
      Q.staff.set(target, cur);
      toast("Saved"); closeModal(); paint();
    } catch (err) { console.error(err); toast("Couldn't save. Check you're on schedule β."); }
  };
}

function openDutySettings(){
  if (!Q.canManage) return toast("Only coordinators can open Crew settings.");
  const people = schedulePeople();
  const rows = people.map(([email, st]) => {
    const issues = credList(st).map(c => ({ c, stt: credStatus(c) })).filter(x => x.stt.kind !== "ok");
    const hrs = monthHoursFor(email), tgt = hourTarget(st);
    const port = portableOf(st);
    const cleared = myClearedFor(st);
    return `<button type="button" class="srow" data-credemail="${esc(email)}">
      <b>${esc(displayName(email, st))}</b>
      <span>${port ? "Portable " + esc(port) : "No portable"} · ${esc(memberType(st))} · ${hrs}/${tgt}h this month</span>
      <span>${cleared.length ? esc(cleared.join(" · ")) : "No clearances set"}</span>
      <i class="${issues.length ? "warn" : ""}">${issues.length ? issues.map(x => x.c.label + ": " + x.stt.label).join(" · ") : "Credentials ok"}</i>
    </button>`;
  }).join("");
  const M = openModal(`<h3>Crew settings</h3>
    <p class="help">Add people and set clearances — the calendar shows open slots by level. Members sign up themselves; you don't publish shifts.</p>
    <div class="ios" style="padding:12px;margin-bottom:10px">
      <div class="addslot">
        <div class="field"><label for="crewEmail">Email</label><input id="crewEmail" type="email" placeholder="member@pvrs.org" autocomplete="off"></div>
        <div class="field"><label for="crewName">Name</label><input id="crewName" type="text" maxlength="80" placeholder="First Last"></div>
        <div class="field"><label for="crewPort">Portable #</label><input id="crewPort" type="text" maxlength="20" inputmode="numeric" placeholder="12"></div>
      </div>
      <button class="btn primary" type="button" data-crewadd style="margin-top:8px">Add to duty crew</button>
    </div>
    <h4 class="tabsec" style="margin:4px 0 8px">On duty · ${people.length}</h4>
    <div class="olist" style="max-height:45vh;overflow:auto">${rows || `<div class="oempty">No schedule members yet — add someone above.</div>`}</div>
    <div class="acts"><button class="btn" type="button" data-x>Done</button></div>`, true);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const row = e.target.closest("[data-credemail]");
    if (row) { closeModal(); return openCreds(row.dataset.credemail); }
    if (!e.target.closest("[data-crewadd]")) return;
    const email = lower($("#crewEmail")?.value || "");
    const name = ($("#crewName")?.value || "").trim().slice(0, 80);
    const portable = ($("#crewPort")?.value || "").trim().slice(0, 20);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Enter a valid email.");
    if (email === lower(OWNER_EMAIL)) {
      try {
        await setDoc(doc(db, "staff", email), {
          schedule: true, name: name || "Dkota Wright", portable, role: "admin",
          memberType: "Regular", cleared: ["EMT", "Paramedic", "Driver"],
          credentials: blankCredentials(), updatedAt: Date.now(),
        }, { merge: true });
        toast("Owner duty profile updated"); closeModal(); openDutySettings();
      } catch (err) { console.error(err); toast("Couldn't update owner profile."); }
      return;
    }
    try {
      const ref = doc(db, "staff", email);
      const existing = await getDoc(ref);
      const cur = existing.exists() ? existing.data() : {};
      await setDoc(ref, {
        role: cur.role || "member",
        name: name || cur.name || email.split("@")[0],
        portable: portable || cur.portable || "",
        schedule: true,
        scheduler: cur.scheduler || cur.role === "admin",
        memberType: cur.memberType || "Regular",
        cleared: Array.isArray(cur.cleared) && cur.cleared.length ? cur.cleared.filter(p => POSITIONS.includes(p)) : ["EMT"],
        credentials: Array.isArray(cur.credentials) && cur.credentials.length ? cur.credentials : blankCredentials(),
        updatedAt: Date.now(),
        ...(existing.exists() ? {} : { addedAt: Date.now(), addedBy: Q.me, via: "duty" }),
      }, { merge: true });
      toast(`${name || email} is on the duty crew`);
      closeModal(); openDutySettings();
    } catch (err) {
      console.error(err);
      toast(err?.code === "permission-denied"
        ? "Couldn't add them — only the owner can create new team accounts. Try Membership → Settings → Team first, then turn Schedule on."
        : "Couldn't add that person.");
    }
  };
}

function onRosterTap(email){
  const target = lower(email);
  if (target === Q.me) return openCreds(target);
  const st = Q.staff.get(target) || {};
  const port = portableOf(st);
  const name = displayName(target, st);
  if (Q.canManage) {
    const M = openModal(`<h3>${esc(name)}</h3>
      <p class="help">${port ? "Portable " + esc(port) : "No portable on file"} · ${esc(target)}</p>
      <div class="acts">
        <button class="btn primary" type="button" data-dm>Message</button>
        <button class="btn" type="button" data-ed>Credentials</button>
        ${port ? `<button class="btn" type="button" data-copyport>Copy portable</button>` : ""}
        <button class="btn" type="button" data-x>Close</button>
      </div>`);
    M.onclick = e => {
      if (e.target.closest("[data-x]")) return closeModal();
      if (e.target.closest("[data-dm]")) { closeModal(); return openCrewChat(target); }
      if (e.target.closest("[data-ed]")) { closeModal(); return openCreds(target); }
      if (e.target.closest("[data-copyport]")) copyText(port).then(ok => toast(ok ? `Copied portable ${port}` : port));
    };
    return;
  }
  openCrewChat(target);
}

function openShift(id){
  const s = Q.shifts.get(id); if (!s) return;
  const start = new Date(s.start), end = new Date(s.end || s.start + 12 * 36e5);
  const who = s.assignee ? (s.assigneeName || s.assignee) : "Open";
  const acts = [];
  if (isMine(s) && !s.posted) acts.push(`<button class="btn" type="button" data-sa="give">Post as giveaway</button>`);
  if (isMine(s) && s.posted) acts.push(`<button class="btn" type="button" data-sa="ungive">Cancel giveaway</button>`);
  if (isMine(s)) acts.push(`<button class="btn" type="button" data-sa="trade">Request a trade</button>`);
  if (isMine(s)) acts.push(`<button class="btn danger" type="button" data-sa="drop">Drop shift</button>`);
  if (Q.canManage && s.assignee) acts.push(`<button class="btn" type="button" data-sa="clear">Clear assignee</button>`);
  const M = openModal(`<h3>${esc(s.position || "Duty")} · ${esc(fmtDay(start))}</h3>
    <p class="help">${esc(fmtRange(start, end))} · ${shiftHours(s)}h<br>Assigned: <b>${esc(who)}</b>${s.posted ? " (posted for giveaway)" : ""}</p>
    <div class="acts">${acts.join("")}<button class="btn" type="button" data-x>Close</button></div>`);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const b = e.target.closest("[data-sa]"); if (!b) return;
    const k = b.dataset.sa;
    try {
      if (k === "give") { await updateDoc(doc(db, "dutyShifts", id), { posted: true, updatedAt: Date.now() }); toast("Posted as a giveaway."); closeModal(); }
      else if (k === "ungive") { await updateDoc(doc(db, "dutyShifts", id), { posted: false, updatedAt: Date.now() }); toast("Giveaway cancelled."); closeModal(); }
      else if (k === "clear" || k === "drop") { await deleteDoc(doc(db, "dutyShifts", id)); toast(k === "drop" ? "You're off that shift." : "Slot cleared."); closeModal(); }
      else if (k === "trade") { closeModal(); openTrade(id); }
    } catch (err) { console.error(err); toast("Couldn't update that shift."); }
  };
}

function openTrade(shiftId){
  const s = Q.shifts.get(shiftId); if (!s || !isMine(s)) return;
  const others = schedulePeople().filter(([email]) => email !== Q.me).map(([email, st]) => ({
    email, name: displayName(email, st), portable: portableOf(st),
  }));
  const M = openModal(`<h3>Request a trade</h3>
    <p class="help">Ask another crew member to take ${esc(fmtDay(new Date(s.start)))} (${esc(s.position || "Duty")}).</p>
    <div class="field"><label for="trTo">Trade with</label>
      <select id="trTo">${others.length ? others.map(o => `<option value="${esc(o.email)}">${esc(o.name)}${o.portable ? " · P" + esc(o.portable) : ""}</option>`).join("") : `<option value="">No other crew yet</option>`}</select></div>
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

function wire(){
  const root = $("#schedule");
  if (root._wired) return; root._wired = true;
  root.addEventListener("click", e => {
    const sc = e.target.closest("[data-sc]"); if (sc) {
      const k = sc.dataset.sc;
      if (k === "view-week") { Q.view = "week"; Q.weekStart = startOfWeek(Q.monthStart || new Date()); return paint(); }
      if (k === "view-month") { Q.view = "month"; Q.monthStart = startOfMonth(Q.weekStart || new Date()); return paint(); }
      if (k === "prev") {
        if (Q.view === "month") Q.monthStart = addMonths(Q.monthStart, -1);
        else Q.weekStart = addDays(Q.weekStart, -7);
        return paint();
      }
      if (k === "next") {
        if (Q.view === "month") Q.monthStart = addMonths(Q.monthStart, 1);
        else Q.weekStart = addDays(Q.weekStart, 7);
        return paint();
      }
      if (k === "today") {
        Q.weekStart = startOfWeek(new Date());
        Q.monthStart = startOfMonth(new Date());
        return paint();
      }
      if (k === "creds") return openCreds();
      if (k === "crewmsg") return openCrewInbox();
      if (k === "crew" || k === "crewcreds") return openDutySettings();
      if (k === "desk") {
        if (Q.onDesk) return Q.onDesk();
        $("#schedule").hidden = true; $("#app").hidden = false;
        history.replaceState(null, "", "/");
        return;
      }
    }
    const day = e.target.closest("[data-day]"); if (day) return openDay(day.dataset.day);
    const roster = e.target.closest("[data-roster]"); if (roster) return onRosterTap(roster.dataset.roster);
    const sid = e.target.closest("[data-sid]"); if (sid) return openShift(sid.dataset.sid);
  });
}

export function startSchedule({ email, name, canManage, staffMap, onDesk, onUnread }){
  stop();
  Q.me = lower(email); Q.name = name || ""; Q.canManage = !!canManage;
  Q.staff = staffMap || new Map();
  Q.threads = new Map();
  Q.onDesk = typeof onDesk === "function" ? onDesk : null;
  Q.onUnread = typeof onUnread === "function" ? onUnread : null;
  Q.msgsPrimed = false;
  Q.weekStart = startOfWeek(new Date());
  Q.monthStart = startOfMonth(new Date());
  Q.view = "week";
  $("#app").hidden = true; $("#portal").hidden = true;
  const el = $("#schedule"); el.hidden = false;
  wire(); paint();
  Q.unsub.push(onSnapshot(collection(db, "dutyShifts"), snap => {
    Q.shifts = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    paint();
  }, () => toast("Couldn't load the schedule.")));
  Q.unsub.push(onSnapshot(collection(db, "staff"), snap => {
    const next = new Map();
    snap.docs.forEach(d => {
      const data = d.data();
      if (d.id === Q.me || data.schedule || Q.canManage) next.set(d.id, data);
    });
    if (!next.has(Q.me) && Q.staff.has(Q.me)) next.set(Q.me, Q.staff.get(Q.me));
    Q.staff = next;
    paint();
  }, () => {}));
  Q.unsub.push(onSnapshot(collection(db, "dutyTrades"), snap => {
    Q.trades = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    const pending = [...Q.trades.values()].filter(t => t.status === "pending" && t.to === Q.me);
    if (pending.length) {
      const key = "pvrsTradeSeen";
      let seen = {}; try { seen = JSON.parse(sessionStorage.getItem(key) || "{}"); } catch {}
      pending.forEach(t => {
        if (seen[t.id]) return;
        seen[t.id] = 1;
        toast(`${t.fromName || "Someone"} wants to trade ${fmtDay(new Date(t.start))}.`);
      });
      try { sessionStorage.setItem(key, JSON.stringify(seen)); } catch {}
    }
  }, () => {}));
  Q.unsub.push(onSnapshot(query(collection(db, "crewThreads"), where("participants", "array-contains", Q.me)), snap => {
    const prev = Q.threads;
    const next = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    const fresh = [...next.values()].filter(t => {
      if (!threadUnread(t) || t.lastBy === Q.me) return false;
      const old = prev.get(t.id);
      return !old || (old.lastAt || 0) < (t.lastAt || 0);
    });
    Q.threads = next;
    bumpCrewBadge();
    if (Q.msgsPrimed && fresh.length) {
      const t = fresh[0];
      const who = (t.names && t.names[t.lastBy]) || displayName(t.lastBy, Q.staff.get(t.lastBy) || {});
      toast(`Message from ${who}`);
    }
    Q.msgsPrimed = true;
    paint();
  }, () => {}));
}

export async function setScheduleAccess(email, on, cleared){
  const patch = {
    schedule: !!on, updatedAt: Date.now(),
    cleared: cleared || ["EMT"],
    memberType: "Regular",
    credentials: blankCredentials(),
  };
  await setDoc(doc(db, "staff", lower(email)), patch, { merge: true });
}

export { blankCredentials };
