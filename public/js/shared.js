import { SCENES, sceneSVG } from "./scenes.js";
// Shared helpers, PVRS process definitions, and the applicant status timeline.
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const get = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
export const isObj = v => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && typeof v.toMillis !== "function";
export const merge = (t, s) => { for (const k in s) { if (isObj(s[k])) { if (!isObj(t[k])) t[k] = {}; merge(t[k], s[k]); } else t[k] = s[k]; } return t; };
export const clone = o => JSON.parse(JSON.stringify(o || {}));
export const nest = (p, v) => p.split(".").reduceRight((acc, k) => ({ [k]: acc }), v);
export const pad2 = n => String(n).padStart(2, "0");
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
export const fmtDate = s => { if (!s) return ""; const [y,m,d] = s.split("-"); return `${+m}/${+d}/${y.slice(2)}`; };
export const longDate = s => s ? new Date(s + "T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"}) : "";
export const slotDay = ms => new Date(ms).toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
export const slotTime = ms => new Date(ms).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
export const slotLong = ms => `${slotDay(ms)} at ${slotTime(ms)}`;
export const daysSince = s => s ? Math.max(0, Math.round((Date.now() - new Date(s + "T12:00:00").getTime()) / 864e5)) : null;
export const ago = t => { if (!t) return ""; const m = Math.round((Date.now() - t) / 6e4); if (m < 1) return "just now"; if (m < 60) return m + "m ago"; const h = Math.round(m/60); if (h < 24) return h + "h ago"; return Math.round(h/24) + "d ago"; };
export const first = n => (n || "").trim().split(/\s+/)[0] || "there";
export const loc = a => a.location === "other" ? (a.locationOther || "Outside area") : a.location;
export const lower = s => String(s || "").trim().toLowerCase();

let toastT;
export function toast(msg){ const t = $("#toast"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3400); }
export async function copyText(text, fallbackEl){
  try { await navigator.clipboard.writeText(text); return true; }
  catch { if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); } return false; }
}
// One modal at a time. Opening makes the page behind it inert and moves focus into the sheet;
// closing runs the sheet's cleanup (M._cleanup) and puts focus back where it was.
const behind = () => ["#app", "#portal"].map(s => $(s)).filter(Boolean);
// The Settings page (Nov 21) shows the usual windows inside itself instead of as pop-ups: hostNextModal(el, back) makes
// the next openModal draw into `el`, and closing it calls `back` (which redraws that settings section).
let HOST_NEXT = null, HOST_ON = null;
export function hostNextModal(el, back){ HOST_NEXT = { el, back }; }
export function clearHost(){ if (HOST_ON && HOST_ON.el._cleanup) { HOST_ON.el._cleanup(); HOST_ON.el._cleanup = null; } HOST_ON = null; HOST_NEXT = null; }
export function openModal(html, wide){
  if (HOST_NEXT) { const h = HOST_NEXT; HOST_NEXT = null; HOST_ON = h;
    if (h.el._cleanup) { h.el._cleanup(); h.el._cleanup = null; }
    h.el.innerHTML = `<div class="sheet embedded">${html}</div>`; h.el.onclick = null; return h.el; }
  const M = $("#modal");
  if (M.hidden) M._prev = document.activeElement;
  if (M._cleanup) { M._cleanup(); M._cleanup = null; }
  M.innerHTML = `<div class="sheet glass ${wide?"wide":""}" role="dialog" aria-modal="true" tabindex="-1">${html}</div>`;
  const sheet = M.firstElementChild, h = sheet.querySelector("h3");
  if (h) { h.id = "modalTitle"; sheet.setAttribute("aria-labelledby", "modalTitle"); }
  M.hidden = false; M.onclick = null;
  behind().forEach(el => { el.inert = true; });
  sheet.focus({ preventScroll: true });
  return M;
}
export function closeModal(){
  if (HOST_ON && $("#modal").hidden) { const h = HOST_ON; if (h.el._cleanup) { h.el._cleanup(); h.el._cleanup = null; } h.back && h.back(); return; }
  const M = $("#modal");
  if (M._cleanup) { M._cleanup(); M._cleanup = null; }
  M.hidden = true; M.innerHTML = ""; M.onclick = null;
  behind().forEach(el => { el.inert = false; });
  const prev = M._prev; M._prev = null;
  const target = prev && prev.isConnected && prev !== document.body ? prev : document.querySelector("#list .arow[aria-current=true]");
  if (target) target.focus({ preventScroll: true });
}
export function download(filename, text, type = "text/csv"){
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------- calendar invites (.ics) ---------- */
const icsDate = ms => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// events: [{ uid, start (ms), duration (min), title, location, description }]. Opening the file on a Mac adds it to Calendar.
export function icsFile(events){
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Potsdam Volunteer Rescue Squad//Membership Desk//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    L.push("BEGIN:VEVENT", `UID:${e.uid}@pvrs-membership.web.app`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.start + (e.duration || 30) * 6e4)}`, `SUMMARY:${icsText(e.title)}`);
    if (e.location) L.push(`LOCATION:${icsText(e.location)}`);
    if (e.description) L.push(`DESCRIPTION:${icsText(e.description)}`);
    L.push("BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, "END:VALARM", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}

/* ---------- PVRS process ---------- */
export const TYPES = ["Regular","Associate","Auxiliary","Non-Operational","Driver Only","Non-Resident"];
// "How did you hear about PVRS?" (online application, optional; Application tab; Year at a glance chart)
export const HEARD = ["Squad website","Social media","Friend or family","A PVRS member","College event","Saw the squad in the community","Flyer or poster","Other"];
export const TYPE_INFO = {
  "Regular":"24 hours · enroll in EMT class within 12 months · full-time resident · full voting rights",
  "Associate":"24 hours · enroll in EMS class within 12 months · 50% resident · 15 spots · votes on non-constitutional matters",
  "Auxiliary":"16 hours · member of another EMS department or recent past member · exempt from meetings and trainings · cannot vote or hold office",
  "Driver Only":"Regular member requirements",
  "Non-Operational":"Cannot run calls · President assigns duties · no voting",
  "Non-Resident":"24 hours · must already be an EMT · not required at meetings, must attend 50% of trainings · cannot vote or hold office"
};
// Fields under these roots live in applicants/{id}/private/main (admins only).
export const SECURE = new Set(["mvr","dl","refs","bg","appr","board","notify","notes","status","docs","portal","pagesign","onb","notDupes","otherForms","follow","tags","mem","profile"]);   // mem + profile: Nov 21 (member records)   // follow + tags: Nov 20 (follow-up reminders, labels)
export const DOC_ITEMS = ["Copy of driver's license (front and back)","EMT certification card","CPR card","Medical documentation for orientation","Social Security card","Missing pages of the application","Reference contact information"];
// Medical and Social Security paperwork is confidential: it goes to the paperwork account only (see PAPERWORK_EMAIL).
export const isConfidential = label => /medical|immuni[sz]|vaccin|physical|tuberc|\bTB\b|\bPPD\b|hepatitis|hep\s?b\b|titer|health|social security|\bSSN\b|beneficiar/i.test(label || "");

const scheduled = a => !!(get(a,"sched.scheduled") || a._booked || get(a,"sched.completed"));
// References with a name entered, and whether each has come back. Applicants see only the name and status.
export const refList = a => [1,2,3,4].map(i => ({ i, ...(get(a,"refs.r"+i) || {}) })).filter(r => r.name && String(r.name).trim())
  .map(r => ({ i: r.i, name: String(r.name).trim(), received: !!r.returned && !r.replace, returned: r.returned || "", replace: !!r.replace }));
// Applicants list up to 4 references; 3 received is enough for the board.
export const REFS_NEEDED = 3;
export const refStatus = a => { const list = refList(a), got = list.filter(r => r.received).length;
  return { list, got, need: REFS_NEEDED, done: got >= REFS_NEEDED, short: Math.max(0, REFS_NEEDED - got), pending: list.filter(r => !r.received) }; };
export const MILESTONES = [
  ["Application received",          a => !!get(a,"app.received")],
  ["Application complete",          a => get(a,"app.complete") === "yes"],
  ["MVR completed",                 a => !!get(a,"mvr.completed")],
  ["Driver's license verified",     a => !!get(a,"dl.date") && get(a,"dl.valid") === "yes"],
  ["References returned",           a => refStatus(a).done],
  ["Interview scheduled",           scheduled],
  ["Interview completed",           a => !!get(a,"sched.completed")],
  ["Committee approval",            a => get(a,"appr.committee") === "yes"],
  ["Board approval",                a => get(a,"board.result") === "approved"],
  ["Background check (Sterling)",   a => !!(get(a,"bg.sterDone") && get(a,"bg.sterResult"))],   // run only after the board approves
  ["Applicant notified",            a => !!get(a,"notify.applicant")],
  // The orientation chair runs this desk, so this step is moving them to orientation (needs Sterling complete and clear).
  ["Moved to orientation",          a => !!get(a,"notify.orientation") || !!get(a,"onb.orientStarted")],
  ["Chief notified for duty crew",  a => !!get(a,"notify.chief")],
  ["Tech chair notified (email)",   a => !!get(a,"notify.tech")],
];
// What to do at each milestone, worded as an instruction. (The milestone names read as finished things: "Next:
// Interview scheduled" looked like the interview was already scheduled.)
export const NEXT_STEP = ["Enter the date the application came in", "Review the application", "Run the driving record (MVR)", "Verify the driver's license", "Collect the references",
  "Schedule the interview", "Hold the interview", "Committee decision", "Board vote", "Run the Sterling background check", "Let the applicant know", "Move them to orientation",
  "Notify the chief for duty crew", "Ask the tech chair for an email account"];
// The five phases shown on the progress bar, with the milestones (first..last) each one covers.
export const PHASES = [["screen", "Screening", 0, 4], ["int", "Interview", 5, 6], ["appr", "Approval", 7, 8], ["onb", "Onboard", 9, 13]];
export const STAGES = {
  screen:{label:"Screening",c:"--s-screen"}, int:{label:"Interview",c:"--s-int"}, appr:{label:"Approval",c:"--s-appr"},
  onb:{label:"Onboard",c:"--s-onb"}, act:{label:"Active",c:"--s-act"}, hold:{label:"On hold",c:"--s-hold"},
  dec:{label:"Declined",c:"--s-dec"}, wd:{label:"Withdrawn",c:"--s-hold"}, open:{label:"In process",c:"--s-screen"}
};
export const stageVar = st => `var(${(STAGES[st] || STAGES.open).c})`;
export function progress(a){
  const done = MILESTONES.map(m => m[1](a));
  // Once someone is in orientation, the application, interview, board and Sterling steps no longer hold them up
  // (Dkota, Nov 20: people added or moved by hand, like Lilly, could never reach Active).
  if (get(a, "onb.orientStarted")) for (let i = 0; i < 11; i++) done[i] = true;
  const n = done.filter(Boolean).length, cur = done.indexOf(false);
  let stage;
  if (a.status === "hold") stage = "hold";
  else if (a.status === "declined" || get(a,"appr.committee") === "no" || get(a,"board.result") === "denied") stage = "dec";
  else if (a.status === "withdrawn") stage = "wd";
  else if (cur === -1) stage = "act";
  else stage = cur <= 4 ? "screen" : cur <= 6 ? "int" : cur <= 8 ? "appr" : "onb";
  return { done, n, cur, stage, next: cur === -1 ? null : NEXT_STEP[cur] };
}
// Plain-language status: `pill` (short label), `head` (where they stand), `sub` (what that means or what to do).
// The Interview phase says outright whether a time is set, so "Interview" never hides "not scheduled yet".
export function statusOf(a, p = progress(a)){
  const label = STAGES[p.stage].label, c = p.cur, fn = first(a.name) === "there" ? "them" : first(a.name);
  if (p.stage === "act") return { pill: label, head: "Active member", sub: "Every step is done." };
  if (!["screen", "int", "appr", "onb"].includes(p.stage)) return { pill: label, head: label, sub: p.next ? "Was at: " + p.next : "" };
  const at = a._booked ? a._booked.start : 0, day = get(a, "sched.scheduled");
  const when = at ? slotLong(at) : day ? `${longDate(day)}${get(a, "sched.time") ? " at " + get(a, "sched.time") : ""}` : "";
  const past = at ? at < Date.now() : !!day && day < today();
  if (c === 5) return { pill: "Interview not scheduled", head: "Interview isn't scheduled yet",
    sub: get(a, "portal.bookingOpen") === "yes" && get(a, "portal.invited") ? `Booking is open: waiting for ${fn} to pick a time, or book it for them.` : `Open booking so ${fn} can pick a time, or book it for them.` };
  if (c === 6) return past ? { pill: "Interview to mark done", head: `Interview was ${when}`, sub: "If it happened, enter the completed date." }
    : { pill: "Interview booked", head: `Interview booked for ${when}`, sub: "Nothing to do until then." };
  if (c === 7) return { pill: "Committee decision", head: "Interview done. Waiting on the committee's decision", sub: "" };
  if (c === 8) return { pill: "Waiting on the board", head: get(a, "board.date") ? `Going to the board on ${longDate(get(a, "board.date"))}` : "Waiting on the board vote", sub: "" };
  return { pill: label, head: "Next: " + p.next, sub: when && !get(a, "sched.completed") ? `Interview already ${past ? "was" : "booked for"} ${when}.` : "" };
}
export const isDeclined = a => a.status === "declined" || get(a,"appr.committee") === "no" || get(a,"board.result") === "denied";
export const inBoardQueue = a => get(a,"appr.committee") === "yes" && !["approved","denied"].includes(get(a,"board.result")) && !["declined","withdrawn"].includes(a.status);

/* ---------- what the applicant sees ---------- */
export function applicantSteps(a){
  const g = k => get(a,k);
  const refs = [1,2,3,4].map(i => g("refs.r"+i) || {}).filter(x => x.name);
  const checksDone = !!g("mvr.completed") && !!g("dl.date") && g("dl.valid") === "yes" && refStatus(a).done;
  const checksStarted = !!(g("mvr.requestInit") || g("mvr.completed") || g("dl.date") || refs.some(x => x.contacted || x.returned));
  const approved = g("board.result") === "approved";
  const ivWhen = a._booked ? slotLong(a._booked.start) : g("sched.scheduled") ? `${longDate(g("sched.scheduled"))}${g("sched.time") ? " at " + g("sched.time") : ""}` : "";
  const steps = [
    { label:"Application received", done: !!g("app.received"), detail: g("app.received") ? "Received " + longDate(g("app.received")) : "" },
    { label:"Application review", done: g("app.complete") === "yes",
      detail: g("app.complete") === "no" ? "We need a few more documents from you. See the list below." : "We're making sure your application is complete." },
    { label:"References and driving record", done: checksDone,
      detail: checksStarted ? "In progress: we're hearing back from your references and checking your driving record." : "We contact your references and check your driving record." },
    { label:"Interview", done: !!g("sched.completed"),
      short: g("sched.completed") ? "" : ivWhen ? ivWhen : "not scheduled yet",
      detail: g("sched.completed") ? "Completed " + longDate(g("sched.completed")) : ivWhen ? "Scheduled for " + ivWhen
        : g("portal.bookingOpen") === "yes" ? "Not scheduled yet. Interview times are open: pick one below." : "Not scheduled yet. We'll let you know when interview times open, and you'll pick one here." },
    { label:"Board review", done: g("board.result") === "approved",
      detail: g("board.result") === "approved" ? "Approved" + (g("board.date") ? " " + longDate(g("board.date")) : "") : g("board.date") ? "Your application goes to the board meeting on " + longDate(g("board.date")) + ". You'll hear back within about a week." : "Your application goes to the next board meeting. You'll hear back within about a week of it." },
    { label:"Background check", done: approved && !!g("bg.sterDone"),
      detail: approved ? (g("bg.sterDone") ? "Complete." : "Now that the board has approved you, we run a background check through Sterling Volunteers. Watch for an email from them.") : "After the board approves you, we run a background check through Sterling Volunteers." },
    { label:"Welcome to PVRS", done: !!g("notify.applicant") && (!!g("notify.orientation") || !!g("onb.orientStarted")),
      detail: "Orientation, duty crew scheduling and your PVRS email account." },
  ];
  const cur = steps.findIndex(s => !s.done);
  // A declined application is never announced in the portal (the administrator sends a letter): the current step
  // just reads as under review, and nothing else changes.
  if (isDeclined(a) && cur >= 0) steps[cur].detail = "Your application is with the membership committee. You'll receive a letter from the squad with next steps.";
  return steps.map((s,i) => ({ label:s.label, detail:s.detail, state: s.done ? "done" : i === cur ? "now" : "todo", ...(s.short && i === cur && !isDeclined(a) ? { short: s.short } : {}) }));
}
const CHECK = `<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.3l2.6 2.6L10 3.5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export function timelineHTML(steps){
  if (!steps || !steps.length) return `<p class="info" style="margin:0">We've received your application. Your progress will show here soon.</p>`;
  return `<div class="timeline">${steps.map(s => `<div class="mile ${s.state==="done"?"done":""} ${s.state==="now"?"cur":""}">
    <span class="dot">${s.state==="done"?CHECK:""}</span>
    <span class="mtext"><span class="mlabel">${esc(s.label)}</span>${s.state!=="todo"&&s.detail?`<small>${esc(s.detail)}</small>`:""}</span></div>`).join("")}</div>`;
}
export const checkSVG = CHECK;

// Appearance (Nov 20): light, dark or follow the device. Saved in this browser only (localStorage "pvrsTheme");
// index.html applies it before the page draws. Nothing about it is stored in Firestore.
export const THEME_LABEL = { system: "Follow this device", light: "Light", dark: "Dark" };
export function getTheme(){ try { const t = localStorage.getItem("pvrsTheme"); return t === "light" || t === "dark" ? t : "system"; } catch { return "system"; } }
export function setTheme(t){
  if (t !== "light" && t !== "dark") t = "system";
  try { if (t === "system") localStorage.removeItem("pvrsTheme"); else localStorage.setItem("pvrsTheme", t); } catch {}
  if (t === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
  return t;
}
export const nextTheme = () => setTheme({ system: "light", light: "dark", dark: "system" }[getTheme()]);

// ---- Member records (Nov 21): what an active member keeps current, and NYS CME for recertification ----
// Settings → Member records lists them one per line. "Label | 12" = a training they redo every 12 months (they give the
// date they finished it); a line without a number = a card or ID with its own expiration date.
export const DEFAULT_MEMBER_ITEMS = ["CPR / BLS card", "EMS certification card", "Driver's license", "Photo ID",
  "Bloodborne pathogens training | 12", "Sexual harassment prevention training | 12", "HIPAA training | 12"];
export const itemKey = label => String(label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
export const memberItemsFrom = lines => (lines && lines.length ? lines : DEFAULT_MEMBER_ITEMS).map(l => { const [label, m] = String(l).split("|").map(x => x.trim());
  return label ? { key: itemKey(label), label, every: +m > 0 ? Math.min(120, Math.round(+m)) : 0 } : null; }).filter(Boolean);
// NYS DOH Bureau of EMS CME Recertification Program, EMT level, as found Nov 2026: 45 hours per certification period
// (20 core/refresher + 5 mandatory + 20 additional). Editable in Settings because DOH changes it; check the current manual.
export const CME_DEFAULT = { years: 3, cats: [{ key: "core", label: "Core / refresher", hours: 20 }, { key: "mandatory", label: "Mandatory topics", hours: 5 }, { key: "additional", label: "Additional", hours: 20 }] };
export const CME_DRILL = { key: "drill", label: "Squad drill / training (not CME)" };
export const addMonths = (iso, m) => { if (!iso || !m) return ""; const d = new Date(iso + "T12:00"); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };
export const daysUntil = (iso, now = Date.now()) => { if (!iso) return null; const t = new Date(now); t.setHours(12, 0, 0, 0); return Math.round((new Date(iso + "T12:00") - t) / 864e5); };
// "missing" | "expired" | "soon" (30 days or less) | "ok"
export const memState = (expires, now = Date.now()) => { const n = daysUntil(expires, now); return n === null ? "missing" : n < 0 ? "expired" : n <= 30 ? "soon" : "ok"; };
// The certification period CME counts toward: the EMS card's expiration and the years before it (or the last N years).
export function cmePeriod(certExpires, years = 3, now = Date.now()){
  const to = certExpires || new Date(now).toISOString().slice(0, 10);
  const d = new Date(to + "T12:00"); d.setFullYear(d.getFullYear() - years);
  return { from: d.toISOString().slice(0, 10), to, known: !!certExpires };
}
export function cmeTotals(entries, cme = CME_DEFAULT, period){
  const inP = e => e && e.date && (!period || (e.date >= period.from && e.date <= period.to));
  const by = {}; let total = 0, drill = 0;
  for (const e of entries || []) { if (!inP(e)) continue; const h = +e.hours || 0; if (e.cat === CME_DRILL.key) { drill += h; continue; } by[e.cat] = (by[e.cat] || 0) + h; total += h; }
  const need = (cme.cats || []).reduce((s, c) => s + (+c.hours || 0), 0);
  return { by, total, drill, need, cats: (cme.cats || []).map(c => ({ ...c, got: by[c.key] || 0, done: (by[c.key] || 0) >= (+c.hours || 0) })) };
}

// ---- Colour themes and backgrounds (Nov 21). Saved on this device only (localStorage); nothing goes to the database. ----
export const ACCENTS = [
  { k: "", name: "Station", sub: "Warm rose, the squad default", fa: "#1C1917", fb: "#3F3A36", h: "#E11D48", h2: "#F97316", s: "#FDA4AF" },
  { k: "pvrs", name: "PVRS", sub: "Our logo's red and navy", fa: "#0B1F3A", fb: "#17396B", h: "#C8102E", h2: "#1F4E9C", s: "#FCA5A5" },
  { k: "star", name: "Star of Life", sub: "EMS blue", fa: "#0B1B3F", fb: "#1E3A8A", h: "#1D4ED8", h2: "#0EA5E9", s: "#93C5FD" },
  { k: "sirens", name: "Lights & sirens", sub: "Red and blue", fa: "#111827", fb: "#1F2A44", h: "#DC2626", h2: "#2563EB", s: "#FCA5A5" },
  { k: "night", name: "Night shift", sub: "Amber on midnight", fa: "#0B1220", fb: "#1E293B", h: "#F59E0B", h2: "#FBBF24", s: "#FCD34D" },
  { k: "rescue", name: "Rescue", sub: "Hi-vis orange and yellow", fa: "#1C1917", fb: "#44403C", h: "#EA580C", h2: "#FACC15", s: "#FDBA74" },
  { k: "triage", name: "Triage green", sub: "Calm green", fa: "#052E2B", fb: "#065F46", h: "#047857", h2: "#0D9488", s: "#6EE7B7" }];
export const BACKGROUNDS = [
  ...SCENES.map(x => ({ k: x.k, name: x.name, sub: x.sub, scene: true })),
  { k: "none", name: "Plain glow", sub: "No pattern" }, { k: "ecg", name: "Heartbeat", sub: "An ECG strip" },
  { k: "star", name: "Star of Life", sub: "The EMS star" }, { k: "cross", name: "Medical cross", sub: "Small crosses" },
  { k: "stripes", name: "Rig stripes", sub: "Ambulance chevrons" }, { k: "radar", name: "Dispatch", sub: "Radar rings" },
  { k: "map", name: "Response map", sub: "Contour lines" }, { k: "auto", name: "Change every visit", sub: "A different scene each time" }];
const lsGet = k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {} };
export const getAccent = () => lsGet("pvrsAccent");
export const getBg = () => lsGet("pvrsBg");
export function setAccent(k){ lsSet("pvrsAccent", k); if (k) document.documentElement.setAttribute("data-accent", k); else document.documentElement.removeAttribute("data-accent"); }
// The background for this page view. `fallback` applies when this device hasn't chosen one: the portal and the public
// pages change every visit (Dkota), the desk stays plain.
export function applyBg(fallback = "none"){
  const pick = getBg() || fallback, html = document.documentElement;
  if (lsGet("pvrsAnim") === "off") html.setAttribute("data-anim", "off"); else html.removeAttribute("data-anim");
  let k = pick;
  // "Change every visit" picks one of the animated scenes, never the same one twice in a row.
  if (pick === "auto") { const last = lsGet("pvrsBgLast"), pool = SCENES.map(x => x.k).filter(x => x !== last); k = pool[Math.floor(Math.random() * pool.length)]; lsSet("pvrsBgLast", k); }
  const scene = SCENES.some(x => x.k === k);
  let box = document.getElementById("bgscene");
  if (scene && !box) { box = document.createElement("div"); box.id = "bgscene"; box.setAttribute("aria-hidden", "true"); document.body.prepend(box); }
  if (box) { if (scene) { if (box.dataset.k !== k) { box.innerHTML = sceneSVG(k); box.dataset.k = k; } } else { box.innerHTML = ""; box.dataset.k = ""; } }
  if (scene) html.setAttribute("data-scene", k); else html.removeAttribute("data-scene");
  if (k && k !== "none") html.setAttribute("data-bg", k); else html.removeAttribute("data-bg");
  return k;
}
export function openAppearance(fallbackBg = "none"){
  const mode = getTheme(), acc = getAccent(), bg = getBg() || fallbackBg;
  const M = openModal(`<div class="look"><h3>Appearance</h3><p class="help" style="margin:0">Pick a look. It's saved on this device only, so everyone can choose their own.</p>
    <h4>Light or dark</h4><div class="lookseg" role="group" aria-label="Light or dark">${["light", "dark", "system"].map(t => `<button type="button" data-lmode="${t}" aria-pressed="${mode === t}">${THEME_LABEL[t]}</button>`).join("")}</div>
    <h4>Colours</h4><div class="lookgrid">${ACCENTS.map(a => `<button type="button" class="lookcard" data-lacc="${a.k}" aria-pressed="${acc === a.k}" style="--sw-fa:${a.fa};--sw-fb:${a.fb};--sw-h:${a.h};--sw-h2:${a.h2};--sw-s:${a.s}"><span class="looksw" aria-hidden="true"></span><b>${a.name}</b><small>${a.sub}</small></button>`).join("")}</div>
    <h4>Background</h4><div class="lookgrid">${BACKGROUNDS.map(b => `<button type="button" class="lookcard lookbg" data-lbg="${b.k}" data-bgv="${b.k}" aria-pressed="${bg === b.k}"><span class="lbg" aria-hidden="true">${b.scene ? sceneSVG(b.k) : "<i></i>"}${b.k === "auto" ? "🔀" : ""}</span><b>${b.name}</b><small>${b.sub}</small></button>`).join("")}</div>
    <h4>Animations</h4><div class="lookseg" role="group" aria-label="Animations">${[["on", "On"], ["off", "Off"]].map(([v, l]) => `<button type="button" data-lanim="${v}" aria-pressed="${(lsGet("pvrsAnim") === "off" ? "off" : "on") === v}">${l}</button>`).join("")}</div>
    <div class="acts"><button class="btn primary" type="button" data-x>Done</button></div></div>`, true);
  M.onclick = e => { const t = e.target;
    if (t.closest("[data-x]")) return closeModal();
    const m = t.closest("[data-lmode]"); if (m) { setTheme(m.dataset.lmode); M.querySelectorAll("[data-lmode]").forEach(b => b.setAttribute("aria-pressed", String(b === m))); return; }
    const a = t.closest("[data-lacc]"); if (a) { setAccent(a.dataset.lacc); M.querySelectorAll("[data-lacc]").forEach(b => b.setAttribute("aria-pressed", String(b === a))); return; }
    const an = t.closest("[data-lanim]"); if (an) { lsSet("pvrsAnim", an.dataset.lanim === "off" ? "off" : ""); applyBg(fallbackBg); M.querySelectorAll("[data-lanim]").forEach(b => b.setAttribute("aria-pressed", String(b === an))); return; }
    const g = t.closest("[data-lbg]"); if (g) { lsSet("pvrsBg", g.dataset.lbg); applyBg(fallbackBg); M.querySelectorAll("[data-lbg]").forEach(b => b.setAttribute("aria-pressed", String(b === g))); }
  };
}
