/** PVRS process model. Field names and rules match the live Firestore schema and firestore.rules. */

export type Rec = Record<string, unknown>;

export interface Booked {
  slotId: string;
  start: number;
  duration?: number | null;
  location?: string;
  hostName?: string;
  bookedAt?: number;
}

export interface Applicant {
  _id: string;
  _booked?: Booked | null;
  name?: string;
  phone?: string;
  email?: string;
  type?: string;
  location?: string;
  locationOther?: string;
  status?: string;
  stage?: string;
  interviewers?: string[];
  createdAt?: number;
  updatedAt?: number;
  secUpdatedAt?: number;
  createdBy?: string;
  updatedBy?: string;
  app?: Rec;
  sched?: Rec;
  iv?: Rec;
  signoff?: Rec;
  mvr?: Rec;
  dl?: Rec;
  refs?: Rec;
  bg?: Rec;
  appr?: Rec;
  board?: Rec;
  notify?: Rec;
  notes?: string;
  docs?: { requested?: { key: string; label: string; received?: string }[] };
  portal?: Rec;
  pagesign?: Rec;
  onb?: Rec;
  notDupes?: Rec;
  otherForms?: unknown[];
  [key: string]: unknown;
}

export const TYPES = ["Regular", "Associate", "Auxiliary", "Non-Operational", "Driver Only", "Non-Resident"] as const;

export const TYPE_INFO: Record<string, string> = {
  Regular: "24 hours · enroll in EMT class within 12 months · full-time resident · full voting rights",
  Associate: "24 hours · enroll in EMS class within 12 months · 50% resident · 15 spots · votes on non-constitutional matters",
  Auxiliary: "16 hours · member of another EMS department or recent past member · exempt from meetings and trainings · cannot vote or hold office",
  "Driver Only": "Regular member requirements",
  "Non-Operational": "Cannot run calls · President assigns duties · no voting",
  "Non-Resident": "24 hours · must already be an EMT · not required at meetings, must attend 50% of trainings · cannot vote or hold office",
};

export const HEARD = [
  "Squad website",
  "Social media",
  "Friend or family",
  "A PVRS member",
  "College event",
  "Saw the squad in the community",
  "Flyer or poster",
  "Other",
];

export const DOC_ITEMS = [
  "Copy of driver's license (front and back)",
  "EMT certification card",
  "CPR card",
  "Medical documentation for orientation",
  "Social Security card",
  "Missing pages of the application",
  "Reference contact information",
];

/** Roots stored in applicants/{id}/private/main. Never written onto the shared applicant doc. */
export const SECURE = new Set([
  "mvr", "dl", "refs", "bg", "appr", "board", "notify", "notes", "status", "docs", "portal", "pagesign", "onb", "notDupes", "otherForms",
]);

export const REFS_NEEDED = 3;
export const DAY = 86400000;
export const SIGN_HOURS = 3;
export const DEFAULT_BRING = "A photo ID, your driver's license, and any EMT or CPR cards you hold.";
export const DEFAULT_REPLIES = [
  "Thanks {first}, we got it.",
  "Hi {first}, could you send that again? The file didn't come through.",
  "Hi {first}, interview times are open in your portal whenever you're ready.",
];

export const OWNER_EMAIL = "dkota@pvrs.org";
export const PAPERWORK_EMAIL = "orientationpaperwork@pvrs.org";
export const CONTACT_EMAIL = "membership@pvrs.org";

export type Role = "owner" | "full" | "admin" | "coordinator" | "interviewer" | "member" | "applicant" | "paperwork" | "none";

export interface Actor {
  email: string;
  name: string;
  role: Role;
  /** Owner or Full access: may edit every field the rules allow the owner to edit. */
  canEdit: boolean;
  full: boolean;
  /** Sees every applicant file (owner, full, admin, coordinator). */
  adminView: boolean;
  /** Interview coordinator powers, or the owner. */
  coord: boolean;
  /** May schedule: owner or coordinator. */
  sched: boolean;
  /** Exactly role === "admin" (secure documents). Full access is covered by canEdit. */
  roleAdmin: boolean;
}

export interface StaffDoc {
  role?: string;
  name?: string;
}

export function lower(s: unknown) {
  return String(s || "").trim().toLowerCase();
}
export function get(o: unknown, p: string): unknown {
  return p.split(".").reduce<unknown>((a, k) => (a == null || typeof a !== "object" ? undefined : (a as Rec)[k]), o);
}
export function isObj(v: unknown): v is Rec {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
export function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o ?? {}));
}
export function merge(t: Rec, s: Rec): Rec {
  for (const k in s) {
    if (isObj(s[k]) && isObj(t[k])) merge(t[k] as Rec, s[k] as Rec);
    else if (isObj(s[k])) t[k] = merge({}, s[k] as Rec);
    else t[k] = s[k];
  }
  return t;
}
export function nest(p: string, v: unknown): Rec {
  return p.split(".").reduceRight<Rec>((acc, k) => ({ [k]: acc }), v as Rec);
}
export function setPath(o: Rec, p: string, v: unknown) {
  const parts = p.split(".");
  let t: Rec = o;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!isObj(t[k])) t[k] = {};
    t = t[k] as Rec;
  }
  t[parts[parts.length - 1]] = v;
}
export function pad2(n: number) {
  return String(n).padStart(2, "0");
}
export function today(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
export function isoDay(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function fmtDate(s: unknown) {
  if (!s || typeof s !== "string") return "";
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return String(s);
  return `${+m}/${+d}/${y.slice(2)}`;
}
export function longDate(s: unknown) {
  if (!s || typeof s !== "string") return "";
  return new Date(s + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
export function slotDay(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
export function slotTime(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export function slotLong(ms: number) {
  return `${slotDay(ms)} at ${slotTime(ms)}`;
}
export function daysSince(s: unknown, now = Date.now()) {
  if (!s || typeof s !== "string") return null;
  return Math.max(0, Math.round((now - new Date(s + "T12:00:00").getTime()) / DAY));
}
export function first(n?: string) {
  return (n || "").trim().split(/\s+/)[0] || "";
}
export function initials(n?: string) {
  const w = (n || "").trim().split(/\s+/).filter(Boolean);
  return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
}
export function locOf(a: Applicant) {
  return a.location === "other" ? a.locationOther || "Outside area" : a.location || "";
}
export function okEmail(v: unknown) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || "").trim());
}
export function phoneOk(v: unknown) {
  return String(v || "").replace(/\D/g, "").length >= 10;
}

export function isConfidential(label: unknown) {
  return /medical|immuni[sz]|vaccin|physical|tuberc|\bTB\b|\bPPD\b|hepatitis|hep\s?b\b|titer|health|social security|\bSSN\b|beneficiar/i.test(String(label || ""));
}

export interface RefRow {
  i: number;
  name: string;
  received: boolean;
  returned: string;
  replace: boolean;
}

export function refList(a: Applicant): RefRow[] {
  const rows: RefRow[] = [];
  for (const i of [1, 2, 3, 4]) {
    const r = (get(a, "refs.r" + i) as Rec) || {};
    const name = String(r.name || "").trim();
    if (!name) continue;
    rows.push({ i, name, received: !!r.returned && !r.replace, returned: String(r.returned || ""), replace: !!r.replace });
  }
  return rows;
}
export function refStatus(a: Applicant) {
  const list = refList(a);
  const got = list.filter((r) => r.received).length;
  return {
    list,
    got,
    need: REFS_NEEDED,
    done: got >= REFS_NEEDED,
    short: Math.max(0, REFS_NEEDED - got),
    pending: list.filter((r) => !r.received),
  };
}

const scheduled = (a: Applicant) => !!(get(a, "sched.scheduled") || a._booked || get(a, "sched.completed"));

export const MILESTONES: [string, (a: Applicant) => boolean][] = [
  ["Application received", (a) => !!get(a, "app.received")],
  ["Application complete", (a) => get(a, "app.complete") === "yes"],
  ["MVR completed", (a) => !!get(a, "mvr.completed")],
  ["Driver's license verified", (a) => !!get(a, "dl.date") && get(a, "dl.valid") === "yes"],
  ["References returned", (a) => refStatus(a).done],
  ["Interview scheduled", scheduled],
  ["Interview completed", (a) => !!get(a, "sched.completed")],
  ["Committee approval", (a) => get(a, "appr.committee") === "yes"],
  ["Board approval", (a) => get(a, "board.result") === "approved"],
  ["Background check (Sterling)", (a) => !!(get(a, "bg.sterDone") && get(a, "bg.sterResult"))],
  ["Applicant notified", (a) => !!get(a, "notify.applicant")],
  ["Moved to orientation", (a) => !!get(a, "notify.orientation") || !!get(a, "onb.orientStarted")],
  ["Chief notified for duty crew", (a) => !!get(a, "notify.chief")],
  ["Tech chair notified (email)", (a) => !!get(a, "notify.tech")],
];

export const NEXT_STEP = [
  "Enter the date the application came in",
  "Review the application",
  "Run the driving record (MVR)",
  "Verify the driver's license",
  "Collect the references",
  "Schedule the interview",
  "Hold the interview",
  "Committee decision",
  "Board vote",
  "Run the Sterling background check",
  "Let the applicant know",
  "Move them to orientation",
  "Notify the chief for duty crew",
  "Ask the tech chair for an email account",
];

export const STEP_TAB = ["app", "app", "checks", "checks", "checks", "iv", "iv", "board", "board", "onb", "onb", "onb", "onb", "onb"];
export const STEP_FIELD = [
  "app.received", "app.complete", "mvr.completed", "dl.date", null, "sched.contacted", "sched.completed",
  "appr.committee", "board.result", "bg.sterReq", "notify.applicant", "notify.orientation", "notify.chief", "notify.tech",
];

export const PHASES = [
  ["screen", "Screening", 0, 4],
  ["int", "Interview", 5, 6],
  ["appr", "Approval", 7, 8],
  ["onb", "Onboard", 9, 13],
] as const;

export const STAGES: Record<string, { label: string }> = {
  screen: { label: "Screening" },
  int: { label: "Interview" },
  appr: { label: "Approval" },
  onb: { label: "Onboard" },
  act: { label: "Active" },
  hold: { label: "On hold" },
  dec: { label: "Declined" },
  wd: { label: "Withdrawn" },
  open: { label: "In process" },
};

export const LANES = [
  { id: "screen", label: "Screening" },
  { id: "int", label: "Interview" },
  { id: "appr", label: "Approval" },
  { id: "onb", label: "Onboarding" },
  { id: "act", label: "Active" },
] as const;

export interface Progress {
  done: boolean[];
  n: number;
  cur: number;
  stage: string;
  next: string | null;
}

export function progress(a: Applicant): Progress {
  const done = MILESTONES.map((m) => m[1](a));
  const n = done.filter(Boolean).length;
  const cur = done.indexOf(false);
  let stage: string;
  if (a.status === "hold") stage = "hold";
  else if (a.status === "declined" || get(a, "appr.committee") === "no" || get(a, "board.result") === "denied") stage = "dec";
  else if (a.status === "withdrawn") stage = "wd";
  else if (cur === -1) stage = "act";
  else stage = cur <= 4 ? "screen" : cur <= 6 ? "int" : cur <= 8 ? "appr" : "onb";
  return { done, n, cur, stage, next: cur === -1 ? null : NEXT_STEP[cur] };
}

export function isDeclined(a: Applicant) {
  return a.status === "declined" || get(a, "appr.committee") === "no" || get(a, "board.result") === "denied";
}
export function isClosedFile(a: Applicant) {
  return isDeclined(a) || a.status === "withdrawn";
}
export function inBoardQueue(a: Applicant) {
  return get(a, "appr.committee") === "yes" && !["approved", "denied"].includes(String(get(a, "board.result") || "")) && !["declined", "withdrawn"].includes(a.status || "");
}
/** Board approved, or a later step already exists so older files are not stranded. */
export function boardApproved(a: Applicant) {
  return (
    get(a, "board.result") === "approved" ||
    (get(a, "board.result") !== "denied" &&
      !!(get(a, "bg.sterReq") || get(a, "bg.sterDone") || get(a, "onb.orientStarted") || get(a, "onb.memberSince") || get(a, "notify.orientation")))
  );
}
export function sterlingClear(a: Applicant) {
  return !!get(a, "bg.sterDone") && get(a, "bg.sterResult") === "clear";
}
export function orientReady(a: Applicant) {
  return get(a, "board.result") === "approved" && !isClosedFile(a) && sterlingClear(a) && !get(a, "onb.orientStarted");
}
export function orientOpen(a: Applicant) {
  return !isClosedFile(a) && !!get(a, "onb.orientStarted") && (!!get(a, "onb.direct") || (get(a, "board.result") === "approved" && sterlingClear(a)));
}
/** On the Onboard list from board approval until the file is declined or withdrawn. Active members stay visible in the Active lane. */
export function inOrient(a: Applicant) {
  return boardApproved(a) && !isClosedFile(a);
}

export interface StatusLine {
  pill: string;
  head: string;
  sub: string;
}
export function statusOf(a: Applicant, p: Progress = progress(a), now = Date.now()): StatusLine {
  const label = (STAGES[p.stage] || STAGES.open).label;
  const c = p.cur;
  const fn = first(a.name) || "them";
  if (p.stage === "act") return { pill: label, head: "Active member", sub: "Every step is done." };
  if (!["screen", "int", "appr", "onb"].includes(p.stage)) return { pill: label, head: label, sub: p.next ? "Was at: " + p.next : "" };
  const at = a._booked ? a._booked.start : 0;
  const day = get(a, "sched.scheduled");
  const when = at ? slotLong(at) : day ? `${longDate(day)}${get(a, "sched.time") ? " at " + get(a, "sched.time") : ""}` : "";
  const past = at ? at < now : !!day && String(day) < today(new Date(now));
  if (c === 5)
    return {
      pill: "Interview not scheduled",
      head: "Interview isn't scheduled yet",
      sub:
        get(a, "portal.bookingOpen") === "yes" && get(a, "portal.invited")
          ? `Booking is open: waiting for ${fn} to pick a time, or book it for them.`
          : `Open booking so ${fn} can pick a time, or book it for them.`,
    };
  if (c === 6)
    return past
      ? { pill: "Interview to mark done", head: `Interview was ${when}`, sub: "If it happened, enter the completed date." }
      : { pill: "Interview booked", head: `Interview booked for ${when}`, sub: "Nothing to do until then." };
  if (c === 7) return { pill: "Committee decision", head: "Interview done. Waiting on the committee's decision", sub: "" };
  if (c === 8)
    return {
      pill: "Waiting on the board",
      head: get(a, "board.date") ? `Going to the board on ${longDate(get(a, "board.date"))}` : "Waiting on the board vote",
      sub: "",
    };
  return { pill: label, head: "Next: " + p.next, sub: when && !get(a, "sched.completed") ? `Interview already ${past ? "was" : "booked for"} ${when}.` : "" };
}

export interface AppStep {
  label: string;
  detail: string;
  state: "done" | "now" | "todo";
  short?: string;
}
/** What the applicant is allowed to see. A decline never names the decision. */
export function applicantSteps(a: Applicant): AppStep[] {
  const g = (k: string) => get(a, k);
  const refs = [1, 2, 3, 4].map((i) => (g("refs.r" + i) as Rec) || {}).filter((x) => x.name);
  const checksDone = !!g("mvr.completed") && !!g("dl.date") && g("dl.valid") === "yes" && refStatus(a).done;
  const checksStarted = !!(g("mvr.requestInit") || g("mvr.completed") || g("dl.date") || refs.some((x) => x.contacted || x.returned));
  const approved = g("board.result") === "approved";
  const ivWhen = a._booked ? slotLong(a._booked.start) : g("sched.scheduled") ? `${longDate(g("sched.scheduled"))}${g("sched.time") ? " at " + g("sched.time") : ""}` : "";
  const steps: { label: string; done: boolean; detail: string; short?: string }[] = [
    { label: "Application received", done: !!g("app.received"), detail: g("app.received") ? "Received " + longDate(g("app.received")) : "" },
    {
      label: "Application review",
      done: g("app.complete") === "yes",
      detail: g("app.complete") === "no" ? "We need a few more documents from you. See the list below." : "We're making sure your application is complete.",
    },
    {
      label: "References and driving record",
      done: checksDone,
      detail: checksStarted ? "In progress: we're hearing back from your references and checking your driving record." : "We contact your references and check your driving record.",
    },
    {
      label: "Interview",
      done: !!g("sched.completed"),
      short: g("sched.completed") ? "" : ivWhen ? String(ivWhen) : "not scheduled yet",
      detail: g("sched.completed")
        ? "Completed " + longDate(g("sched.completed"))
        : ivWhen
          ? "Scheduled for " + ivWhen
          : g("portal.bookingOpen") === "yes"
            ? "Not scheduled yet. Interview times are open: pick one below."
            : "Not scheduled yet. We'll let you know when interview times open, and you'll pick one here.",
    },
    {
      label: "Board review",
      done: g("board.result") === "approved",
      detail: g("board.result") === "approved"
        ? "Approved" + (g("board.date") ? " " + longDate(g("board.date")) : "")
        : g("board.date")
          ? "Your application goes to the board meeting on " + longDate(g("board.date")) + ". You'll hear back within about a week."
          : "Your application goes to the next board meeting. You'll hear back within about a week of it.",
    },
    {
      label: "Background check",
      done: !!(approved && !!g("bg.sterDone")),
      detail: approved
        ? g("bg.sterDone")
          ? "Complete."
          : "Now that the board has approved you, we run a background check through Sterling Volunteers. Watch for an email from them."
        : "After the board approves you, we run a background check through Sterling Volunteers.",
    },
    {
      label: "Welcome to PVRS",
      done: !!g("notify.applicant") && (!!g("notify.orientation") || !!g("onb.orientStarted")),
      detail: "Orientation, duty crew scheduling and your PVRS email account.",
    },
  ];
  const cur = steps.findIndex((s) => !s.done);
  if (isDeclined(a) && cur >= 0) steps[cur].detail = "Your application is with the membership committee. You'll receive a letter from the squad with next steps.";
  return steps.map((s, i) => ({
    label: s.label,
    detail: s.detail,
    state: s.done ? "done" : i === cur ? "now" : "todo",
    ...(s.short && i === cur && !isDeclined(a) ? { short: s.short } : {}),
  }));
}

/** Lane used by the pipeline. Board-approved files are Onboarding even if earlier steps are blank. */
export function laneOf(a: Applicant, p: Progress = progress(a)) {
  if (p.stage === "act") return "act";
  if (inOrient(a) && !["hold", "dec", "wd"].includes(p.stage)) return "onb";
  if (["screen", "int", "appr", "onb", "act"].includes(p.stage)) return p.stage;
  return p.stage;
}

export function resolveActor(email: string, staff: StaffDoc | null, name = ""): Actor {
  const em = lower(email);
  const base = { email: em, name: name || staff?.name || "" };
  if (em === lower(PAPERWORK_EMAIL)) return { ...base, role: "paperwork", canEdit: false, full: false, adminView: false, coord: false, sched: false, roleAdmin: false };
  if (em === lower(OWNER_EMAIL)) return { ...base, role: "owner", canEdit: true, full: false, adminView: true, coord: true, sched: true, roleAdmin: false };
  const role = staff?.role || "";
  if (role === "full") return { ...base, name: staff?.name || name, role: "full", canEdit: true, full: true, adminView: true, coord: true, sched: true, roleAdmin: false };
  if (role === "admin") return { ...base, name: staff?.name || name, role: "admin", canEdit: false, full: false, adminView: true, coord: false, sched: false, roleAdmin: true };
  if (role === "coordinator") return { ...base, name: staff?.name || name, role: "coordinator", canEdit: false, full: false, adminView: true, coord: true, sched: true, roleAdmin: false };
  if (role === "interviewer") return { ...base, name: staff?.name || name, role: "interviewer", canEdit: false, full: false, adminView: false, coord: false, sched: false, roleAdmin: false };
  if (role === "member" || staff) return { ...base, name: staff?.name || name, role: "member", canEdit: false, full: false, adminView: false, coord: false, sched: false, roleAdmin: false };
  return { ...base, role: "none", canEdit: false, full: false, adminView: false, coord: false, sched: false, roleAdmin: false };
}

export function assignedTo(actor: Actor, a: Applicant) {
  return Array.isArray(a.interviewers) && a.interviewers.map(lower).includes(actor.email);
}
export function canSeeApplicant(actor: Actor, a: Applicant) {
  if (actor.role === "paperwork" || actor.role === "applicant" || actor.role === "none" || actor.role === "member") return false;
  if (actor.adminView) return true;
  return actor.role === "interviewer" && assignedTo(actor, a);
}

const INTERVIEW_FIELDS = new Set(["sched.completed", "sched.completedInit", "signoff.iv.init", "signoff.iv.done"]);
export function canEditPath(actor: Actor, path: string) {
  if (actor.canEdit) return true;
  if (path.startsWith("iv.") || INTERVIEW_FIELDS.has(path)) return actor.adminView || actor.role === "interviewer";
  if (actor.sched && (path.startsWith("sched.") || path === "portal.bookingOpen" || path === "interviewers")) return true;
  return false;
}

export type TabId = "app" | "checks" | "iv" | "board" | "onb" | "notes" | "msgs";
export const ALL_TABS: { id: TabId; label: string }[] = [
  { id: "app", label: "Application" },
  { id: "checks", label: "Checks" },
  { id: "iv", label: "Interview" },
  { id: "board", label: "Board" },
  { id: "onb", label: "Onboard" },
  { id: "notes", label: "Notes" },
  { id: "msgs", label: "Messages" },
];
export function tabsFor(actor: Actor): { id: TabId; label: string }[] {
  if (actor.role === "interviewer") return ALL_TABS.filter((t) => t.id === "app" || t.id === "iv");
  if (actor.adminView) return ALL_TABS;
  return [];
}

/** Secure documents: paperwork account, exact Admin role, owner, and Full access. */
export function canReadVault(actor: Actor) {
  return actor.role === "paperwork" || actor.roleAdmin || actor.canEdit;
}
export function canDeleteVault(actor: Actor) {
  return actor.role === "paperwork";
}
export function canFileVault(actor: Actor) {
  return actor.role === "paperwork" || actor.canEdit;
}

export function fieldRoot(path: string) {
  return path.split(".")[0];
}
export function isSecurePath(path: string) {
  return SECURE.has(fieldRoot(path));
}

export function phaseBits(p: Progress) {
  return PHASES.map(([id, label, from, to]) => {
    const slice = p.done.slice(from, to + 1);
    const done = slice.filter(Boolean).length;
    const state = p.stage === "act" || done === slice.length ? "done" : p.cur >= from && p.cur <= to ? "now" : p.cur > to ? "done" : "todo";
    return { id, label, done, total: slice.length, state };
  });
}

export const IV_SCORE = [
  ["comm", "Communication"],
  ["motiv", "Motivation and commitment"],
  ["avail", "Availability"],
  ["team", "Teamwork and attitude"],
  ["fit", "Overall fit for PVRS"],
] as const;
export function ivScore(a: Applicant) {
  const vals = IV_SCORE.map(([k]) => Number(get(a, "iv.score." + k))).filter((n) => n >= 1 && n <= 5);
  const avg = vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : 0;
  return { n: vals.length, avg, total: IV_SCORE.length };
}

export const DEFAULT_ONB = [
  "Acknowledgement of Sterling Volunteers background check",
  "Completed application",
  "Copy of driver's license",
  "Copy of training records (EMT, CPR, etc.)",
  "Insurance beneficiary card, completed",
  "Emergency contact form",
  "Copy of health physical",
  "Record of PPD",
  "Record of Hep B or signed refusal",
  "Verification of completion of IS-100",
  "Verification of completion of IS-700",
  "Verification of Blood Borne Pathogen training",
  "Verification of Sexual Harassment Prevention training",
  "SOP/Constitution acceptance form",
  "Confidentiality statement",
  "Orientation form completed, signed by member and orientation committee member",
];
export const DEFAULT_ISSUE = [
  "Uniform (pants, shirt, boots)",
  "Pager or radio",
  "Door / building access",
  "ID badge",
  "Pulsara",
  "Active911",
  "Electronic scheduler",
  "E-mail distribution list(s)",
  "emsCharts account",
];
export const DEFAULT_SKILLS = [
  "Policies & Procedures issued & acknowledged",
  "Constitution issued & acknowledged",
  "Uniform (pants, shirt, boots)",
  "Communications (pager or radio & assignment)",
  "E-mail distribution list(s)",
  "Building access",
  "Building orientation",
  "Assignment of preceptor",
  "Agency HazCom",
  "Ambulance familiarization",
  "Radio familiarization",
  "Hospital familiarization",
  "Vehicle fueling",
  "Electronic scheduler (with information entered)",
  "ID badge",
  "Equipment/supply restock",
  "Bloodborne Pathogens course",
  "Credentials on file (license, medical and specialty certifications, NIMS-100/700)",
  "Certifications to NCEMS, Medical Control, emsCharts (BLS/ILS/ALS)",
  "Controlled substances: in-service, access, CPH notify (ALS)",
];
const OLD_ONB = ["ID badge issued", "Uniform and gear issued", "Building access set up", "Paging / dispatch app set up", "Orientation completed", "CPR / BLS", "EVOC (drivers)", "ICS-100", "ICS-700", "HIPAA training", "Bloodborne pathogens training"];
const PREV_ONB = [
  "Completed application",
  "Copy of driver's license",
  "Copy of training records (EMT, CPR, etc.)",
  "Insurance beneficiary card, completed",
  "Copy of health physical, record of PPD, Hep B record or refusal",
  "Verification of completion of IS-100, IS-700",
  "Verification of Blood Borne Pathogen training",
  "SOP/Constitution acceptance form",
  "Confidentiality statement",
  "Equipment request",
  "Orientation form completed, signed by member and orientation committee member",
];
const OLD_SKILLS = ["Rig and equipment walkthrough", "Radio and dispatch procedures", "Stretcher and stair chair", "First duty shift", "Second duty shift"];
export const FEMA_LINKS: [RegExp, string][] = [
  [/IS-?\s?100/i, "https://training.fema.gov/is/courseoverview.aspx?code=IS-100.c"],
  [/IS-?\s?700/i, "https://training.fema.gov/is/courseoverview.aspx?code=IS-700.b"],
];
export const onbKey = (l: string) => String(l).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "item";

export interface Settings {
  signature?: string;
  docsEmail?: string;
  defaultLocation?: string;
  boardEmails?: string;
  idleMinutes?: number;
  retentionYears?: number;
  replies?: string[];
  onbItems?: string[];
  issueItems?: string[];
  skillItems?: string[];
  ivBring?: string;
  orientDays?: number;
  chiefEmail?: string;
  techEmail?: string;
  ai?: boolean;
  onbAdded?: Rec;
  [k: string]: unknown;
}

function sameList(a: string[] | undefined, b: string[]) {
  return !!a && a.join("|") === b.join("|");
}
export function onbRaw(settings: Settings) {
  const custom = Array.isArray(settings.onbItems) && !sameList(settings.onbItems, OLD_ONB) && !sameList(settings.onbItems, PREV_ONB);
  return custom ? settings.onbItems! : DEFAULT_ONB;
}
export function onbItems(settings: Settings) {
  return onbRaw(settings).map((l) => {
    const label = String(l).split("|")[0].trim();
    return [onbKey(label), label] as [string, string];
  });
}
export function onbLink(settings: Settings, key: string) {
  const hit = onbRaw(settings).find((l) => onbKey(String(l).split("|")[0].trim()) === key);
  const u = hit && String(hit).split("|")[1]?.trim();
  if (u && /^https:\/\//.test(u)) return u;
  const label = (onbItems(settings).find(([k]) => k === key) || [])[1] || "";
  return FEMA_LINKS.find(([re]) => re.test(label))?.[1] || "";
}
export function issueItems(settings: Settings) {
  const list = Array.isArray(settings.issueItems) && settings.issueItems.length ? settings.issueItems : DEFAULT_ISSUE;
  return list.map((l) => [onbKey(l), String(l)] as [string, string]);
}
export function skillItems(settings: Settings) {
  const list = Array.isArray(settings.skillItems) && settings.skillItems.join("|") !== OLD_SKILLS.join("|") ? settings.skillItems : DEFAULT_SKILLS;
  return list.map((l) => [onbKey(l), l] as [string, string]);
}
export function orientCounts(a: Applicant, settings: Settings) {
  const its = onbItems(settings);
  return { total: its.length, done: its.filter(([k]) => get(a, `onb.items.${k}`)).length };
}

export interface OrientPayload {
  start: string;
  due: string;
  done: number;
  total: number;
  items: { key: string; label: string; date: string; link: string; cert: boolean; req?: boolean }[];
}
const NOT_CERT_RE = /^completed application|^orientation|^acknowledge?ment/i;
export function orientDue(a: Applicant, settings: Settings) {
  const days = Number(settings.orientDays);
  const st = get(a, "onb.orientStarted");
  if (!days || typeof st !== "string") return "";
  const d = new Date(st + "T12:00");
  d.setDate(d.getDate() + days);
  return isoDay(d.getTime());
}
export function orientPayload(a: Applicant, settings: Settings): OrientPayload | null {
  if (!orientOpen(a)) return null;
  const c = orientCounts(a, settings);
  return {
    start: String(get(a, "onb.orientStarted") || ""),
    due: orientDue(a, settings),
    done: c.done,
    total: c.total,
    items: onbItems(settings).map(([key, label]) => ({
      key,
      label,
      date: String(get(a, `onb.items.${key}`) || ""),
      link: onbLink(settings, key),
      cert: !NOT_CERT_RE.test(label),
      ...(get(a, `onb.requested.${key}`) && !get(a, `onb.items.${key}`) ? { req: true } : {}),
    })),
  };
}
export function checkinDue(a: Applicant, done: Set<string>, now = Date.now()) {
  if (!orientOpen(a)) return null;
  const n = daysSince(get(a, "onb.orientStarted"), now);
  if (n == null) return null;
  if (n >= 90) return done.has("90") ? null : "90";
  if (n >= 30) return done.has("30") ? null : "30";
  return null;
}

export interface PortalDoc {
  email: string;
  name: string;
  firstName: string;
  type: string;
  steps: AppStep[];
  docs: { key: string; label: string; received: boolean }[];
  refs: { slot: number; name: string; received: boolean; replace?: boolean }[];
  refReplace: number[];
  bookingOpen: boolean;
  bring: string;
  orientation: OrientPayload | null;
  checkin: string | null;
  signUntil: number;
}
export function requestedDocs(a: Applicant) {
  const list = (a.docs && a.docs.requested) || [];
  return list.map((d, i) => ({ key: d.key || "d" + i, label: d.label, received: !!d.received }));
}
export function portalPayload(a: Applicant, settings: Settings, checkinsDone: Set<string> = new Set()): PortalDoc {
  const refs = refList(a);
  return {
    bring: settings.ivBring || DEFAULT_BRING,
    email: lower(a.email),
    name: a.name || "",
    firstName: first(a.name) || "there",
    type: a.type || "",
    steps: applicantSteps(a),
    docs: requestedDocs(a).map((d) => ({ key: d.key, label: d.label, received: !!d.received })),
    refs: refs.map((r) => ({ slot: r.i, name: r.name, received: r.received, ...(r.replace ? { replace: true } : {}) })),
    refReplace: refs.filter((r) => r.replace).map((r) => r.i),
    bookingOpen: get(a, "portal.bookingOpen") === "yes" && !isDeclined(a),
    orientation: orientPayload(a, settings),
    checkin: checkinDue(a, checkinsDone),
    signUntil: orientOpen(a) ? Number(get(a, "onb.signUntil")) || 0 : 0,
  };
}

/** Strings that must never appear on an applicant-facing payload. */
export const PORTAL_FORBIDDEN = [/license number/i, /\bMVR\b/, /sterling result/i, /\bdenied\b/i, /\bdeclined\b/i, /violation/i, /conviction/i, /vote/i, /against/i, /notes/i];

export function portalLeaks(payload: PortalDoc, secrets: string[]) {
  const blob = JSON.stringify(payload);
  const hits = secrets.filter((s) => s && blob.toLowerCase().includes(s.toLowerCase()));
  const words = PORTAL_FORBIDDEN.filter((re) => re.test(blob)).map(String);
  return [...hits, ...words];
}

export interface TodoItem {
  id: string;
  name: string;
  pri: number;
  text: string;
  sub: string;
  tab: string;
  act?: string;
  btn?: string;
  age: number;
}

export interface Slot {
  id: string;
  start: number;
  duration?: number;
  location?: string;
  bookedBy?: string | null;
  host?: string;
  hostName?: string;
}

const EXPIRES: [string, string, string][] = [
  ["dl.expires", "Driver's license", "checks"],
  ["onb.cprExpires", "CPR / BLS card", "onb"],
  ["onb.emtExpires", "EMS certification", "onb"],
];

export function refNudge(a: Applicant, i: number, now = Date.now()) {
  const g = (k: string) => get(a, `refs.r${i}.${k}`);
  if (!String(g("name") || "").trim() || g("form") || (g("returned") && !g("replace")) || !g("contacted")) return false;
  const since = daysSince(g("contacted"), now);
  const reminded = daysSince(g("reminded"), now);
  return (since ?? 0) >= 7 && (reminded == null || reminded >= 7);
}

export function dupeWhy(a: Applicant, b: Applicant) {
  if (lower(a.email) && lower(a.email) === lower(b.email)) return "same email";
  const pa = String(a.phone || "").replace(/\D/g, "");
  const pb = String(b.phone || "").replace(/\D/g, "");
  if (pa.length >= 10 && pa === pb) return "same phone";
  if (lower(a.name) && lower(a.name) === lower(b.name)) return "same name";
  return "";
}
export function dupesOf(a: Applicant, all: Applicant[]) {
  return all.filter((b) => b._id !== a._id && !(get(a, "notDupes." + b._id) || get(b, "notDupes." + a._id)) && dupeWhy(a, b));
}

export function todoItems(apps: Applicant[], settings: Settings, now = Date.now()): TodoItem[] {
  const out: TodoItem[] = [];
  const seen = new Set<string>();
  for (const a of apps) {
    for (const b of dupesOf(a, apps)) {
      const key = [a._id, b._id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: a._id, name: a.name || "", pri: 0, text: `Possible duplicate: ${a.name || "Unnamed"}`, sub: `Also on file as ${b.name || "Unnamed"} (${dupeWhy(a, b)})`, tab: "app", act: "dupe", btn: "Review", age: 0 });
    }
  }
  for (const a of apps) {
    if (isDeclined(a) || a.status === "withdrawn") continue;
    const fn = first(a.name) || "them";
    const add = (pri: number, text: string, sub: string, tab: string, act?: string, btn?: string) =>
      out.push({ id: a._id, name: a.name || "", pri, text, sub, tab, act, btn, age: 0 });
    for (const [k, label, tab] of EXPIRES) {
      const d = get(a, k);
      if (typeof d !== "string" || !d) continue;
      const days = Math.round((new Date(d + "T12:00").getTime() - now) / DAY);
      if (days <= 30) add(1, days < 0 ? `${label} expired` : `${label} expires ${days === 0 ? "today" : days === 1 ? "tomorrow" : "in " + days + " days"}`, fmtDate(d), tab);
    }
    const bd = get(a, "board.date");
    if (get(a, "board.result") === "approved" && (!bd || (daysSince(bd, now) ?? 99) <= 365)) {
      const its = onbItems(settings);
      const left = its.filter(([k]) => !get(a, `onb.items.${k}`));
      if (its.length && left.length) add(3, "Finish the new-member checklist", `${its.length - left.length} of ${its.length} done · next: ${left[0][1]}`, "onb");
      const mentor = get(a, "onb.mentor");
      const last = (get(a, "onb.mentorCheck") || get(a, "onb.mentorSince")) as string | undefined;
      if (!mentor) add(2, `Pair ${fn} with a mentor`, "A buddy for their first year on the squad", "onb");
      else if (!last || (daysSince(last, now) ?? 0) > 30) add(3, `Mentor check-in for ${fn}`, `${mentor} · ${last ? "last check-in " + fmtDate(last) : "no check-in yet"}`, "onb");
    }
  }
  const IN_PROCESS = ["screen", "open", "int", "appr", "onb"];
  for (const a of apps) {
    if (get(a, "onb.direct")) continue;
    const p = progress(a);
    if (!IN_PROCESS.includes(p.stage)) continue;
    const g = (k: string) => get(a, k);
    const rs = refStatus(a);
    const fn = first(a.name) || "them";
    const age = daysSince(g("app.received"), now) || 0;
    const add = (pri: number, text: string, sub: string, tab: string, act?: string, btn?: string) =>
      out.push({ id: a._id, name: a.name || "", pri, text, sub, tab, act, btn, age });
    const nudge = [1, 2, 3, 4].filter((i) => refNudge(a, i, now));
    if (nudge.length) add(1, `Remind ${nudge.length === 1 ? "a reference" : nudge.length + " references"}`, nudge.map((i) => String(g(`refs.r${i}.name`) || "")).join(", "), "checks", "refs", "Send reminders");
    const step = MILESTONES.findIndex((m) => !m[1](a));
    const welcome = !g("portal.invited") && okEmail(a.email) && step <= 5;
    if (welcome) add(0, `Welcome ${fn}`, "Portal invite, welcome message and email in one step", "app", "invite", "Welcome");
    const touched = Math.max(Number(a.updatedAt) || 0, Number(a.secUpdatedAt) || 0, Number(a.createdAt) || 0);
    const idle = touched ? Math.floor((now - touched) / DAY) : 0;
    if (idle >= 14 && step !== 8) add(1, `No movement in ${idle} days`, `Next: ${p.next || "—"}`, STEP_TAB[step] || "app", "next", "Go to it");
    switch (step) {
      case 0: add(2, "Enter the date the application came in", "", "app"); break;
      case 1: add(2, g("app.complete") === "no" ? "Follow up on the incomplete application" : "Review the application", g("app.notified") ? "Notified " + fmtDate(g("app.notified")) : "", "app"); break;
      case 2: if (!g("mvr.requestInit")) add(2, "Request the driving record (MVR)", "", "checks"); break;
      case 3: add(2, "Verify the driver's license", "", "checks"); break;
      case 4: if (!rs.list.length) add(2, "Add references", "None entered yet", "checks"); break;
      case 5:
        if (!welcome) {
          if (g("portal.invited") && g("portal.bookingOpen") !== "yes") add(2, "Open interview booking", `${fn} can then pick a time`, "app", "booking", "Open booking");
          else if (!okEmail(a.email)) add(2, "Schedule the interview", "No email on file, so book it for them", "iv", "book", "Book");
        }
        break;
      case 6: {
        const when = a._booked ? a._booked.start : g("sched.scheduled") ? new Date(String(g("sched.scheduled")) + "T12:00").getTime() : 0;
        if (when && when < now) add(2, "Mark the interview completed", "Was " + fmtDate(isoDay(when)), "iv");
        break;
      }
      case 7: add(2, "Committee decision", "Interview done " + fmtDate(g("sched.completed")), "board"); break;
      case 8: if (!g("board.date")) add(3, "Ready for the board", rs.done ? "On the board queue" : "", "board", "vote", "Record vote"); break;
      case 9: if (!g("bg.sterReq")) add(2, "Request the Sterling background check", "", "onb"); break;
      case 10: add(2, `Let ${fn} know they're approved`, "", "onb"); break;
      case 11:
        if (orientReady(a)) add(1, `Move ${fn} to orientation`, "Sterling is complete and clear", "onb", "orient", "Move");
        else if (g("bg.sterResult") === "review") add(1, `Review ${fn}'s Sterling result`, "Orientation stays locked until it's clear", "onb");
        break;
      case 12: add(2, "Notify the chief for duty crew", "", "onb", "chief", "Draft email"); break;
      case 13: add(2, "Ask the tech chair for an email account", "", "onb", "tech", "Draft email"); break;
    }
  }
  return out.sort((x, y) => x.pri - y.pri || y.age - x.age);
}

export function needsAction(a: Applicant, settings: Settings, now = Date.now()) {
  return todoItems([a], settings, now).some((t) => t.pri <= 2);
}

export interface SearchHit {
  kind: "person" | "action" | "message";
  id: string;
  title: string;
  sub: string;
  tab?: TabId | string;
}
export function searchDesk(q: string, apps: Applicant[], actor: Actor, messages: { id: string; appId?: string; text: string; channel?: string }[] = []): SearchHit[] {
  const query = q.trim().toLowerCase();
  const words = query.split(/\s+/).filter(Boolean);
  const hit = (text: string) => !words.length || words.every((w) => text.toLowerCase().includes(w));
  const people: SearchHit[] = [];
  for (const a of apps) {
    if (!canSeeApplicant(actor, a)) continue;
    const p = progress(a);
    const blob = [a.name, a.email, a.phone, a.type, locOf(a), STAGES[p.stage]?.label, a.status, actor.adminView ? String(a.notes || "") : ""].join(" ");
    if (hit(blob)) people.push({ kind: "person", id: a._id, title: a.name || "Unnamed", sub: `${a.type || "Applicant"} · ${(STAGES[laneOf(a, p)] || STAGES[p.stage] || STAGES.open).label}`, tab: "app" });
  }
  const ownerOnly = new Set(["new", "team", "settings", "flyer"]);
  const adminOnly = new Set(["board", "reports", "orient", "library"]);
  const actions: SearchHit[] = [
    ["New applicant", "Add someone to Dispatch", "new"],
    ["Field training", "People the board accepted", "field"],
    ["Board meeting", "Walk the board queue", "board"],
    ["Interview times", "Post or manage times", "slots"],
    ["Messages", "Squad channels", "messages"],
    ["Team", "Who can sign in", "team"],
    ["Rig check", "Emails, checklists, Med Control", "settings"],
    ["Reports", "How long each stretch takes", "reports"],
    ["Paperwork grid", "Every checklist line", "orient"],
    ["Documents", "Shared files", "library"],
    ["Notifications", "Alerts on this device", "notif"],
    ["Recruiting flyer", "Print a flyer with a QR code", "flyer"],
  ]
    .filter(([, , id]) => (ownerOnly.has(id) ? actor.canEdit : adminOnly.has(id) ? actor.adminView : true))
    .filter(([title, sub]) => !query || hit(title + " " + sub))
    .map(([title, sub, id]) => ({ kind: "action" as const, id, title, sub }));
  const msgs = messages
    .filter((m) => hit(m.text + " " + (m.channel || "")))
    .slice(0, 8)
    .map((m) => ({ kind: "message" as const, id: m.appId || m.id, title: m.channel ? "#" + m.channel : "Message", sub: m.text.slice(0, 80), tab: "msgs" }));
  if (!query) return [...actions.slice(0, 8)];
  return [...people.slice(0, 12), ...actions.slice(0, 6), ...msgs];
}

export function signatureText(settings: Settings) {
  const s = settings.signature || "Dkota Wright, NREMT\nNYS EMT-B\nPotsdam Volunteer Rescue Squad\ndkota@pvrs.org";
  return /Potsdam Volunteer Rescue/i.test(s) ? s : s + "\nPotsdam Volunteer Rescue Squad";
}

export function welcomeMessage(a: Applicant) {
  const fn = first(a.name) || "there";
  return `Welcome, ${fn}. This is your PVRS membership page. You can follow your application, send us a message, and upload anything we ask for. We'll write back here.`;
}

const icsDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
export function icsFile(events: { uid: string; start: number; duration?: number; title: string; location?: string; description?: string }[]) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Potsdam Volunteer Rescue Squad//Membership Desk//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    L.push("BEGIN:VEVENT", `UID:${e.uid}@pvrs-membership.web.app`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(e.start + (e.duration || 30) * 60000)}`, `SUMMARY:${icsText(e.title)}`);
    if (e.location) L.push(`LOCATION:${icsText(e.location)}`);
    if (e.description) L.push(`DESCRIPTION:${icsText(e.description)}`);
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}

export function newToken() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  let s = "";
  b.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const ROLE_LABEL: Record<string, string> = {
  member: "Member",
  interviewer: "Interviewer",
  coordinator: "Coordinator",
  admin: "Admin",
  full: "Full access",
};
export const ROLE_HELP: { role: string; text: string }[] = [
  { role: "Member", text: "Messages and documents only. No applicant files." },
  { role: "Interviewer", text: "Application and Interview tabs for people assigned to them. Can fill in the interview and leave a private impression." },
  { role: "Coordinator", text: "Sees every file. Runs interview times, booking, assignments, and applicant messages. Everything else is view only." },
  { role: "Admin", text: "Sees every file and can open secure documents. Can fill in the interview. Cannot edit the rest of the file." },
  { role: "Full access", text: "The same powers as the owner, including secure documents. Cannot change the owner's own access." },
];

export function tabDone(a: Applicant, tab: TabId, settings: Settings): "done" | "now" | "todo" | "" {
  const p = progress(a);
  if (tab === "app") return get(a, "app.complete") === "yes" ? "done" : get(a, "app.received") ? "now" : "todo";
  if (tab === "checks") {
    const mvr = !!get(a, "mvr.completed");
    const dl = !!get(a, "dl.date") && get(a, "dl.valid") === "yes";
    const refs = refStatus(a).done;
    if (mvr && dl && refs) return "done";
    if (mvr || dl || refStatus(a).got) return "now";
    return "todo";
  }
  if (tab === "iv") return get(a, "sched.completed") ? "done" : a._booked || get(a, "sched.scheduled") ? "now" : "todo";
  if (tab === "board") return get(a, "board.result") === "approved" ? "done" : get(a, "appr.committee") === "yes" ? "now" : "todo";
  if (tab === "onb") {
    const c = orientCounts(a, settings);
    if (p.stage === "act") return "done";
    if (c.total && c.done === c.total) return "done";
    if (boardApproved(a)) return "now";
    return "todo";
  }
  if (tab === "notes") return a.notes ? "done" : "";
  return "";
}

export function daysWaiting(a: Applicant, now = Date.now()) {
  const d = daysSince(get(a, "app.received"), now);
  if (d == null) {
    const c = Number(a.createdAt) || 0;
    return c ? Math.max(0, Math.round((now - c) / DAY)) : 0;
  }
  return d;
}

export function nextActionLabel(a: Applicant) {
  const p = progress(a);
  return p.next || (p.stage === "act" ? "Active" : "Review");
}

export function mergeApplicants(shared: Rec, priv: Rec | null, id: string, booked: Booked | null): Applicant {
  const a = merge(clone(shared) as Rec, clone(priv || {}) as Rec) as Applicant;
  a._id = id;
  a._booked = booked;
  return a;
}

export function showField(key: string, a: Applicant) {
  switch (key) {
    case "incomplete": return get(a, "app.complete") === "no";
    case "otherOrg": return get(a, "iv.otherOrg") === "yes";
    case "college": return get(a, "iv.college") === "yes";
    case "driving": return get(a, "iv.driving") === "yesbad";
    case "convicted": return get(a, "iv.convicted") === "yesbad";
    case "nonop": return a.type === "Non-Operational";
    case "emtYes": return get(a, "iv.isEmt") === "yes";
    case "emtNo": return ["no", "lapsed"].includes(String(get(a, "iv.isEmt") || ""));
    case "emtStateOther": return get(a, "iv.emtState") === "other";
    case "emtClassOther": return get(a, "iv.emtClass") === "other";
    case "otherOrgCurrentOther": return get(a, "iv.otherOrgCurrent") === "other";
    case "dlBad": return get(a, "dl.valid") === "no";
    case "locOther": return a.location === "other";
    case "availOther": return get(a, "iv.avail") === "other";
    case "residentOther": return get(a, "iv.resident") === "other";
    default: return true;
  }
}

export interface AgendaLine {
  id: string;
  name: string;
  type: string;
  note: string;
}
export function agendaList(apps: Applicant[]): AgendaLine[] {
  return apps.filter(inBoardQueue).map((a) => {
    const s = ivScore(a);
    const refs = refStatus(a);
    return {
      id: a._id,
      name: a.name || "Unnamed",
      type: a.type || "",
      note: [a.type, refs.done ? "References in" : `${refs.got} of ${refs.need} references`, s.n ? `Interview ${s.avg.toFixed(1)} / 5` : ""].filter(Boolean).join(" · "),
    };
  });
}
export function agendaText(list: AgendaLine[]) {
  const head = `PVRS membership board agenda`;
  const lines = list.map((x, i) => `${i + 1}. ${x.name}${x.type ? " (" + x.type + ")" : ""}${x.note ? " — " + x.note : ""}`);
  return [head, "", ...lines].join("\n");
}

export function statsFor(apps: Applicant[], now = new Date()) {
  const year = now.getFullYear();
  const inYear = (a: Applicant) => String(get(a, "app.received") || "").startsWith(String(year)) || (a.createdAt && new Date(a.createdAt).getFullYear() === year);
  const ys = apps.filter(inYear);
  const reach = (pred: (a: Applicant) => boolean) => ys.filter(pred).length;
  const months = Array.from({ length: 12 }, (_, i) => ys.filter((a) => {
    const r = String(get(a, "app.received") || "");
    return r.startsWith(`${year}-${pad2(i + 1)}`);
  }).length);
  const heard: Record<string, number> = {};
  for (const a of ys) {
    const h = String(get(a, "app.heard") || "");
    if (h) heard[h] = (heard[h] || 0) + 1;
  }
  return {
    year,
    applied: ys.length,
    active: ys.filter((a) => progress(a).stage === "act").length,
    inProcess: apps.filter((a) => ["screen", "int", "appr", "onb"].includes(progress(a).stage)).length,
    funnel: {
      applied: reach(() => true),
      references: reach((a) => refStatus(a).done || progress(a).cur > 4 || progress(a).cur === -1),
      interviewed: reach((a) => !!get(a, "sched.completed") || progress(a).cur > 6 || progress(a).cur === -1),
      approved: reach((a) => get(a, "board.result") === "approved" || progress(a).cur > 8 || progress(a).cur === -1),
      active: reach((a) => progress(a).stage === "act"),
    },
    declined: ys.filter((a) => isDeclined(a)).length,
    withdrew: ys.filter((a) => a.status === "withdrawn").length,
    months,
    heard,
  };
}
