// What goes in the 7:30 AM reminders (functions/push.js runs it). Plain logic with no Firebase calls, so it's easy to test.
// Alerts stay light on purpose: the owner gets counts, interviewers get their own interview, applicants get their own time.
const TZ = "America/New_York", DAY = 864e5;
const get = (o, path) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const dayKey = ms => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
const timeOf = ms => new Date(ms).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const daysFrom = (iso, now) => Math.round((new Date(iso + "T12:00:00Z").getTime() - new Date(dayKey(now) + "T12:00:00Z").getTime()) / DAY);
const isClosed = a => a.status === "declined" || a.status === "withdrawn" || get(a, "appr.committee") === "no" || get(a, "board.result") === "denied";
const EXPIRES = ["dl.expires", "onb.cprExpires", "onb.emtExpires"];
const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;

function buildMorning({ apps, slots, now, portals = [], coordinators = [] }){
  const today = dayKey(now), tomorrow = dayKey(now + DAY);
  const open = apps.filter(a => !isClosed(a));
  const byId = new Map(apps.map(a => [a.id, a]));
  const interviewers = new Map(), applicants = [];
  let ivToday = 0, ivTomorrow = 0;
  for (const s of slots) {
    if (!s.bookedBy || !s.start) continue;
    const a = byId.get(s.bookedBy); if (!a || isClosed(a) || get(a, "sched.completed")) continue;
    const k = dayKey(s.start); if (k !== today && k !== tomorrow) continue;
    k === today ? ivToday++ : ivTomorrow++;
    const crew = [...new Set([...(a.interviewers || []), ...(s.host ? [s.host] : []), ...coordinators])];
    const line = { id: a.id, title: `Interview ${k === today ? "today" : "tomorrow"}`, body: `${a.name || "Applicant"} at ${timeOf(s.start)}${s.location ? " · " + s.location : ""}` };
    crew.forEach(e => interviewers.set(e, [...(interviewers.get(e) || []), line]));
    if (k === tomorrow) applicants.push({ id: a.id, title: "Interview tomorrow", body: `Your PVRS interview is tomorrow at ${timeOf(s.start)}${s.location ? " · " + s.location : ""}.` });
  }
  // Orientation: the portal doc only has it once Sterling is complete and clear, so nobody is nudged before that.
  let orToday = 0, orTomorrow = 0, orBehind = 0;
  for (const p of portals) { const a = byId.get(p.id), o = p.orientation; if (!a || isClosed(a) || !o) continue;
    if (p.orient?.start) { const k = dayKey(p.orient.start);
      if (k === today) orToday++; else if (k === tomorrow) { orTomorrow++; applicants.push({ id: p.id, title: "Orientation tomorrow", body: `Your PVRS orientation is tomorrow at ${timeOf(p.orient.start)}${p.orient.location ? " · " + p.orient.location : ""}.` }); } }
    if (o.due && (o.done || 0) < (o.total || 0)) { const left = daysFrom(o.due, now);
      if (left < 0) orBehind++;
      if (left === 7 || left === 1) applicants.push({ id: p.id, title: "Orientation due soon", body: `You have ${plural(left, "day")} left to finish orientation. Your checklist is in your PVRS portal.` }); } }
  let refsLate = 0, expiring = 0, stalled = 0;
  for (const a of open) {
    for (let i = 1; i <= 4; i++) { const r = get(a, `refs.r${i}`) || {};
      if (String(r.name || "").trim() && r.contacted && !r.form && !(r.returned && !r.replace) && daysFrom(r.contacted, now) <= -7) refsLate++; }
    for (const k of EXPIRES) { const d = get(a, k); if (d) { const n = daysFrom(d, now); if (n <= 30 && n >= -30) expiring++; } }
    const waitingOnBoard = get(a, "appr.committee") === "yes" && !get(a, "board.result");
    const touched = Math.max(a.updatedAt || 0, a.secUpdatedAt || 0);
    if (a.stage !== "act" && !waitingOnBoard && touched && now - touched >= 14 * DAY) stalled++;
  }
  const parts = [ivToday && `${plural(ivToday, "interview")} today`, ivTomorrow && `${plural(ivTomorrow, "interview")} tomorrow`,
    orToday && `${plural(orToday, "orientation")} today`, orTomorrow && `${plural(orTomorrow, "orientation")} tomorrow`, orBehind && `${orBehind} behind on orientation`,
    refsLate && `${plural(refsLate, "reference")} overdue`, expiring && `${plural(expiring, "card")} expiring`, stalled && `${plural(stalled, "file")} with no movement`].filter(Boolean);
  return { owner: parts.length ? { title: "Good morning. Today on the desk", body: parts.join(" · ") } : null, interviewers, applicants };
}
module.exports = { buildMorning, dayKey };
