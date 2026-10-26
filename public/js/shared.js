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
const behind = () => ["#app", "#portal", "#schedule", "#vault"].map(s => $(s)).filter(Boolean);
export function openModal(html, wide){
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
export const TYPE_INFO = {
  "Regular":"24 hours · enroll in EMT class within 12 months · full-time resident · full voting rights",
  "Associate":"24 hours · enroll in EMS class within 12 months · 50% resident · 15 spots · votes on non-constitutional matters",
  "Auxiliary":"16 hours · member of another EMS department or recent past member · exempt from meetings and trainings · cannot vote or hold office",
  "Driver Only":"Regular member requirements",
  "Non-Operational":"Cannot run calls · President assigns duties · no voting",
  "Non-Resident":"24 hours · must already be an EMT · not required at meetings, must attend 50% of trainings · cannot vote or hold office"
};
// Fields under these roots live in applicants/{id}/private/main (admins only).
export const SECURE = new Set(["mvr","dl","refs","bg","appr","board","notify","notes","status","docs","portal","pagesign"]);
export const DOC_ITEMS = ["Copy of driver's license (front and back)","EMT certification card","CPR card","Medical documentation for orientation","Social Security card","Missing pages of the application","Reference contact information"];
// Medical and Social Security paperwork is confidential: it goes to the paperwork account only (see PAPERWORK_EMAIL).
export const isConfidential = label => /medical|immuni[sz]|vaccin|physical|tuberc|\bTB\b|hepatitis|titer|health|social security|\bSSN\b/i.test(label || "");

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
  ["Orientation chair notified",    a => !!get(a,"notify.orientation")],
  ["Chief notified for duty crew",  a => !!get(a,"notify.chief")],
  ["Tech chair notified (email)",   a => !!get(a,"notify.tech")],
];
export const STAGES = {
  screen:{label:"Screening",c:"--s-screen"}, int:{label:"Interview",c:"--s-int"}, appr:{label:"Approval",c:"--s-appr"},
  onb:{label:"Onboarding",c:"--s-onb"}, act:{label:"Active",c:"--s-act"}, hold:{label:"On hold",c:"--s-hold"},
  dec:{label:"Declined",c:"--s-dec"}, wd:{label:"Withdrawn",c:"--s-hold"}, open:{label:"In process",c:"--s-screen"}
};
export const stageVar = st => `var(${(STAGES[st] || STAGES.open).c})`;
export function progress(a){
  const done = MILESTONES.map(m => m[1](a));
  const n = done.filter(Boolean).length, cur = done.indexOf(false);
  let stage;
  if (a.status === "hold") stage = "hold";
  else if (a.status === "declined" || get(a,"appr.committee") === "no" || get(a,"board.result") === "denied") stage = "dec";
  else if (a.status === "withdrawn") stage = "wd";
  else if (cur === -1) stage = "act";
  else stage = cur <= 4 ? "screen" : cur <= 6 ? "int" : cur <= 8 ? "appr" : "onb";
  return { done, n, cur, stage, next: cur === -1 ? null : MILESTONES[cur][0] };
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
      detail: g("sched.completed") ? "Completed " + longDate(g("sched.completed")) : ivWhen ? "Scheduled for " + ivWhen : "Pick a time below once interview times open." },
    { label:"Board review", done: g("board.result") === "approved",
      detail: g("board.result") === "approved" ? "Approved" + (g("board.date") ? " " + longDate(g("board.date")) : "") : g("board.date") ? "Your application goes to the board meeting on " + longDate(g("board.date")) + ". You'll hear back within about a week." : "Your application goes to the next board meeting. You'll hear back within about a week of it." },
    { label:"Background check", done: approved && !!g("bg.sterDone"),
      detail: approved ? (g("bg.sterDone") ? "Complete." : "Now that the board has approved you, we run a background check through Sterling Volunteers. Watch for an email from them.") : "After the board approves you, we run a background check through Sterling Volunteers." },
    { label:"Welcome to PVRS", done: !!g("notify.applicant") && !!g("notify.orientation"),
      detail: "Orientation, duty crew scheduling and your PVRS email account." },
  ];
  const cur = steps.findIndex(s => !s.done);
  // A declined application is never announced in the portal (the administrator sends a letter): the current step
  // just reads as under review, and nothing else changes.
  if (isDeclined(a) && cur >= 0) steps[cur].detail = "Your application is with the membership committee. You'll receive a letter from the squad with next steps.";
  return steps.map((s,i) => ({ label:s.label, detail:s.detail, state: s.done ? "done" : i === cur ? "now" : "todo" }));
}
const CHECK = `<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.3l2.6 2.6L10 3.5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export function timelineHTML(steps){
  if (!steps || !steps.length) return `<p class="info" style="margin:0">We've received your application. Your progress will show here soon.</p>`;
  return `<div class="timeline">${steps.map(s => `<div class="mile ${s.state==="done"?"done":""} ${s.state==="now"?"cur":""}">
    <span class="dot">${s.state==="done"?CHECK:""}</span>
    <span class="mtext"><span class="mlabel">${esc(s.label)}</span>${s.state!=="todo"&&s.detail?`<small>${esc(s.detail)}</small>`:""}</span></div>`).join("")}</div>`;
}
export const checkSVG = CHECK;
