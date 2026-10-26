// Duty schedule (eSchedule-style): week board, open-shift pickup, giveaways, trades,
// credentials/expiry gates, monthly hours by membership category, and crew roster.
// Gated by staff/{email}.schedule === true (owner always on).
// Members see only their own hours + credentials on the board; managers get Crew settings.
import { db, doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, getDoc } from "./fb.js";
import { $, esc, toast, openModal, closeModal, copyText, lower, pad2, TYPES } from "./shared.js";
import { CONTACT_EMAIL, OWNER_EMAIL } from "./config.js";

export const POSITIONS = ["EMT", "AEMT", "Paramedic", "Driver", "Driver Trainer"];
const TEMPLATES = [
  { id: "duty-eve", label: "Duty crew · evening", startH: 18, startM: 0, hours: 12, position: "EMT" },
  { id: "duty-day", label: "Duty crew · day", startH: 6, startM: 0, hours: 12, position: "EMT" },
  { id: "driver-eve", label: "Driver · evening", startH: 18, startM: 0, hours: 12, position: "Driver" },
  { id: "medic-eve", label: "Paramedic · evening", startH: 18, startM: 0, hours: 12, position: "Paramedic" },
];
// Monthly hour expectations from PVRS membership categories (TYPE_INFO).
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

const Q = {
  me: "", name: "", canManage: false, shifts: new Map(), trades: new Map(), staff: new Map(),
  weekStart: null, unsub: [], onDesk: null,
};

const startOfWeek = d => {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtDay = d => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtRange = (a, b) => `${a.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${b.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
const monthBounds = (d = new Date()) => {
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return { start, end, label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
};
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
  // Always show the current credential set (migrates off Attendant-era lists).
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
    const stt = credStatus(c);
    if (stt.kind === "expired") bad.push(c.label + " expired");
  }
  return bad;
};
const canTake = sh => {
  if (sh.assignee && !sh.posted) return false;
  if (sh.assignee && sh.posted && sh.assignee === Q.me) return false;
  if (sh.position && !myCleared().includes(sh.position) && !myCleared().includes("Any")) return false;
  if (blockedForPosition(meStaff(), sh.position || "EMT").length) return false;
  return true;
};
const isMine = sh => sh.assignee === Q.me;
const monthHoursFor = email => {
  const { start, end } = monthBounds();
  let h = 0;
  for (const s of Q.shifts.values()) {
    if (s.assignee !== email || s.status === "cancelled") continue;
    if (s.start < start || s.start >= end) continue;
    // Count worked time once the shift has started (scheduled duty hours).
    if (s.start <= Date.now() || s.credited) h += shiftHours(s);
  }
  return Math.round(h * 10) / 10;
};
const schedulePeople = () => [...Q.staff.entries()]
  .filter(([email, s]) => s.schedule || email === Q.me || email === lower(OWNER_EMAIL))
  .sort((a, b) => displayName(a[0], a[1]).localeCompare(displayName(b[0], b[1]), undefined, { sensitivity: "base" }));

const stop = () => { Q.unsub.forEach(u => { try { u(); } catch {} }); Q.unsub = []; };
export function stopSchedule(){ stop(); }

function hoursCard(){
  // Own hours only — members never see others' totals here.
  const st = meStaff(), target = hourTarget(st), got = monthHoursFor(Q.me), { label } = monthBounds();
  const pct = target > 0 ? Math.min(100, Math.round(got / target * 100)) : (got ? 100 : 0);
  const rem = target > 0 ? Math.max(0, Math.round((target - got) * 10) / 10) : 0;
  return `<section class="hoursCard">
    <h3>Your hours · ${esc(label)}<small>${esc(memberType(st))}</small></h3>
    <div class="hbar" aria-hidden="true"><i style="width:${pct}%"></i></div>
    <p class="help"><b>${got}</b> of <b>${target || "—"}</b> hours${target ? (rem ? ` · ${rem} to go` : " · met ✓") : " · no monthly target"}</p>
    <p class="help muted">Only you see this. Targets follow membership category (Regular/Associate 24 · Auxiliary 16 · Non-Operational none).</p>
  </section>`;
}
function credsCard(){
  // Own credentials only.
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
    return `<button type="button" class="srow roster${mine ? " mine" : ""}" data-roster="${esc(email)}">
      <b>${esc(displayName(email, st))}${mine ? " · you" : ""}</b>
      <span>${port ? "Portable " + esc(port) : "No portable on file"}</span>
    </button>`;
  }).join("");
  return `<section class="rosterCard"><h3>Crew roster<small>${people.length}</small></h3>
    <p class="help muted">Names and portable numbers for everyone on duty.</p>
    ${rows || `<div class="oempty fun"><b>No one yet</b>${Q.canManage ? "Open Crew settings to add people." : "Ask a coordinator to add you."}</div>`}
    ${Q.canManage ? `<button class="btn small" type="button" data-sc="crew" style="margin-top:8px">Crew settings</button>` : ""}
  </section>`;
}

function paint(){
  const root = $("#schedRoot"); if (!root) return;
  if (!Q.weekStart) Q.weekStart = startOfWeek(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(Q.weekStart, i));
  const end = addDays(Q.weekStart, 7).getTime();
  const startMs = Q.weekStart.getTime();
  const list = [...Q.shifts.values()].filter(s => s.start >= startMs && s.start < end).sort((a, b) => a.start - b.start || (a.position || "").localeCompare(b.position || ""));
  const open = list.filter(s => !s.assignee || s.posted);
  const mine = list.filter(isMine);
  const byDay = {}; days.forEach(d => { byDay[dayKey(d)] = []; });
  list.forEach(s => { const k = dayKey(new Date(s.start)); (byDay[k] = byDay[k] || []).push(s); });

  const cell = d => {
    const rows = byDay[dayKey(d)] || [];
    if (!rows.length) return `<div class="scell empty"><span class="muted">Open</span></div>`;
    return `<div class="scell">${rows.map(s => {
      const who = s.assignee ? (s.assigneeName || s.assignee.split("@")[0]) : "OPEN";
      return `<button type="button" class="sshift${isMine(s) ? " mine" : ""}${!s.assignee ? " open" : ""}${s.posted ? " give" : ""}" data-sid="${esc(s.id)}">
        <b>${esc(s.position || "Duty")}</b>
        <span>${esc(fmtRange(new Date(s.start), new Date(s.end || s.start + 12 * 36e5)))}</span>
        <em>${esc(who)}${s.posted && s.assignee ? " · giveaway" : ""}</em>
      </button>`;
    }).join("")}</div>`;
  };

  root.innerHTML = `
    <header class="schedhead glass">
      <div class="schedbrand"><div class="eyebrow">PVRS · beta</div><h1>Duty schedule</h1>
        <p>Week of ${esc(fmtDay(Q.weekStart))} — pick up shifts, track your hours, keep credentials current.</p></div>
      <div class="schedacts">
        <button class="btn" type="button" data-sc="prev">‹ Prev</button>
        <button class="btn" type="button" data-sc="today">This week</button>
        <button class="btn" type="button" data-sc="next">Next ›</button>
        ${Q.canManage ? `<button class="btn primary" type="button" data-sc="publish">Publish shifts</button>
        <button class="btn" type="button" data-sc="crew">Crew settings</button>` : ""}
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
            : `<div class="oempty fun"><b>None this week</b>Pick up an open shift when you're free.</div>`}</section>
        <section><h3>Open / giveaways<small>${open.length}</small></h3>
          ${open.length ? open.map(s => {
            const block = blockedForPosition(meStaff(), s.position || "EMT");
            const ok = canTake(s);
            return `<button type="button" class="srow open" data-sid="${esc(s.id)}"><b>${esc(fmtDay(new Date(s.start)))}</b><span>${esc(s.position || "Duty")} · ${esc(fmtRange(new Date(s.start), new Date(s.end || s.start + 12 * 36e5)))}</span>
              <i>${ok ? "Tap to pick up" : block.length ? "Credential issue" : `Needs ${esc(s.position)}`}</i></button>`;
          }).join("") : `<div class="oempty fun"><b>Fully covered</b>Nice work, crew.</div>`}</section>
        <section><h3>Your clearances</h3>
          <p class="help">${esc(myCleared().join(" · ") || "Not set — ask a coordinator in Crew settings.")}</p>
          <p class="help">Questions? ${esc(CONTACT_EMAIL)}</p></section>
      </aside>
      <div class="schedgrid glass" role="grid" aria-label="Week schedule">
        <div class="shead">${days.map(d => `<div><b>${esc(d.toLocaleDateString(undefined, { weekday: "short" }))}</b><span>${esc(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</span></div>`).join("")}</div>
        <div class="scols">${days.map(d => cell(d)).join("")}</div>
      </div>
    </div>`;
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
    <p class="help">${editingOther ? "Coordinator view — members only see their own hours and credentials on the board." : "Only you see your hours and credential details on the duty board. The roster shows your name and portable to the crew."}</p>
    <div class="field"><label for="crPortable">Portable number</label>
      <input id="crPortable" type="text" maxlength="20" inputmode="numeric" placeholder="e.g. 12" value="${esc(port)}"></div>
    ${Q.canManage ? `<div class="field"><label for="crType">Membership category</label>
      <select id="crType">${TYPES.map(t => `<option value="${esc(t)}" ${t === type ? "selected" : ""}>${esc(t)} · ${HOUR_TARGETS[t] ?? "—"}h/mo</option>`).join("")}</select></div>`
      : `<p class="help">Category: <b>${esc(type)}</b> · ${HOUR_TARGETS[type] ?? "—"}h/mo</p>`}
    <div class="ios" style="padding:10px 12px">${list.map(c => {
      const stt = credStatus(c);
      return `<div class="row stack"><span class="lbl">${esc(c.label)}<small class="cred-${stt.kind}">${esc(stt.label)}</small></span>
        <input type="date" data-cr="${esc(c.key)}" value="${esc(c.expires || "")}" aria-label="${esc(c.label)} expiry" ${Q.canManage || !editingOther ? "" : "disabled"}></div>`;
    }).join("")}</div>
    ${Q.canManage ? `<div class="field" style="margin-top:8px"><label>Cleared positions</label>
      <div class="seg wrap" id="crCleared" role="group">${POSITIONS.map(p => `<button type="button" data-cl="${esc(p)}" class="${myClearedFor(st).includes(p) ? "on" : ""}">${esc(p)}</button>`).join("")}</div>
      <p class="help" style="margin-top:6px">EMT / AEMT / Paramedic need that cert + CPR. Driver and Driver Trainer need license + CPR.</p></div>`
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
    <p class="help">Add people to duty, set portable numbers, clearances, and credentials. Members only see <b>their own</b> hours and credentials on the board — the roster shows names and portables to everyone.</p>
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
  if (target === Q.me || Q.canManage) return openCreds(target);
  const st = Q.staff.get(target) || {};
  const port = portableOf(st);
  const name = displayName(target, st);
  if (port) {
    copyText(port).then(ok => toast(ok ? `Copied portable ${port} (${name})` : `${name} · portable ${port}`));
  } else toast(`${name} has no portable on file yet.`);
}

function openShift(id){
  const s = Q.shifts.get(id); if (!s) return;
  const start = new Date(s.start), end = new Date(s.end || s.start + 12 * 36e5);
  const who = s.assignee ? (s.assigneeName || s.assignee) : "Open";
  const block = blockedForPosition(meStaff(), s.position || "EMT");
  const acts = [];
  if ((!s.assignee || s.posted) && canTake(s)) acts.push(`<button class="btn primary" type="button" data-sa="take">${s.posted ? "Take giveaway" : "Pick up shift"}</button>`);
  else if ((!s.assignee || s.posted) && block.length) acts.push(`<p class="help cred-expired">Can't pick up: ${esc(block.join(", "))}. <button class="copy" type="button" data-sc="creds">Update credentials</button></p>`);
  if (isMine(s) && !s.posted) acts.push(`<button class="btn" type="button" data-sa="give">Post as giveaway</button>`);
  if (isMine(s) && s.posted) acts.push(`<button class="btn" type="button" data-sa="ungive">Cancel giveaway</button>`);
  if (isMine(s)) acts.push(`<button class="btn" type="button" data-sa="trade">Request a trade</button>`);
  if (Q.canManage && s.assignee) acts.push(`<button class="btn" type="button" data-sa="clear">Clear assignee</button>`);
  if (Q.canManage && !s.assignee) acts.push(`<button class="btn danger" type="button" data-sa="del">Delete shift</button>`);
  const M = openModal(`<h3>${esc(s.position || "Duty")} · ${esc(fmtDay(start))}</h3>
    <p class="help">${esc(fmtRange(start, end))} · ${shiftHours(s)}h${s.unit ? " · " + esc(s.unit) : ""}<br>Assigned: <b>${esc(who)}</b>${s.posted ? " (posted for giveaway)" : ""}</p>
    ${s.notes ? `<p class="help">${esc(s.notes)}</p>` : ""}
    <div class="acts">${acts.join("")}<button class="btn" type="button" data-x>Close</button></div>`);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    if (e.target.closest("[data-sc=creds]")) { closeModal(); return openCreds(); }
    const b = e.target.closest("[data-sa]"); if (!b) return;
    const k = b.dataset.sa;
    try {
      if (k === "take") {
        if (!canTake(s)) return toast("Credentials or clearance block this shift.");
        await updateDoc(doc(db, "dutyShifts", id), { assignee: Q.me, assigneeName: Q.name || Q.me, status: "filled", posted: false, updatedAt: Date.now() });
        toast("You're on for " + fmtDay(start)); closeModal();
      } else if (k === "give") {
        await updateDoc(doc(db, "dutyShifts", id), { posted: true, updatedAt: Date.now() });
        toast("Posted as a giveaway."); closeModal();
      } else if (k === "ungive") {
        await updateDoc(doc(db, "dutyShifts", id), { posted: false, updatedAt: Date.now() });
        toast("Giveaway cancelled."); closeModal();
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

function openPublish(){
  if (!Q.canManage) return;
  const d0 = addDays(new Date(), 1);
  const dStr = `${d0.getFullYear()}-${pad2(d0.getMonth() + 1)}-${pad2(d0.getDate())}`;
  const M = openModal(`<h3>Publish duty shifts</h3>
    <p class="help">Open slots for cleared members whose credentials are current. Positions: ${esc(POSITIONS.join(" · "))}.</p>
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
    const h = tpl ? tpl.startH : +($("#dsTime").value.split(":")[0] || 18);
    const mi = tpl ? tpl.startM : +($("#dsTime").value.split(":")[1] || 0);
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
      if (k === "creds") return openCreds();
      if (k === "crew" || k === "crewcreds") return openDutySettings();
      if (k === "desk") {
        if (Q.onDesk) return Q.onDesk();
        $("#schedule").hidden = true; $("#app").hidden = false;
        history.replaceState(null, "", "/");
        return;
      }
    }
    const roster = e.target.closest("[data-roster]"); if (roster) return onRosterTap(roster.dataset.roster);
    const sid = e.target.closest("[data-sid]"); if (sid) return openShift(sid.dataset.sid);
  });
}

export function startSchedule({ email, name, canManage, staffMap, onDesk }){
  stop();
  Q.me = lower(email); Q.name = name || ""; Q.canManage = !!canManage;
  Q.staff = staffMap || new Map();
  Q.onDesk = typeof onDesk === "function" ? onDesk : null;
  Q.weekStart = startOfWeek(new Date());
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
    // Keep schedule flag for self even if query is sparse
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
