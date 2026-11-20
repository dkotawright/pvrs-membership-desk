import { applicantSteps } from "./domain";
import type { Applicant } from "./domain";

function day(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const hour = (offsetDays: number, h: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, 0, 0, 0);
  return d.getTime();
};

const base = (name: string, extra: Record<string, unknown>): Record<string, unknown> => ({
  name,
  phone: /^(Sam|Jordan)\b/.test(name) ? "(315) 555-0142" : `(315) 555-01${String(name.charCodeAt(0)).slice(-2)}`,
  email: name.split(" ")[0].toLowerCase() + "@example.com",
  type: "Regular", location: "Potsdam", stage: "screen", interviewers: [],
  app: { received: day(-6) }, createdAt: Date.now() - 6 * 864e5, updatedAt: Date.now(), ...extra,
});

export function ownerSeed(): PvrsSeed {
  const avery = base("Avery Chen", { app: { received: day(-2), source: "online", heard: "Squad website" }, stage: "screen" });
  const jordan = base("Jordan Hale", {
    type: "Associate", stage: "int", interviewers: ["ivy@pvrs.org"],
    app: { received: day(-20), complete: "yes", source: "online" },
    sched: {},
    iv: { why: "I want to serve the town I grew up in.", college: "yes", collegeWhere: "SUNY Potsdam, May 2027", isEmt: "no", avail: "semester" },
  });
  const sam = base("Sam Okonkwo", {
    stage: "int",
    app: { received: day(-18), complete: "yes" },
    sched: { scheduled: day(1), time: "6:30 PM" },
    iv: { why: "EMS has been my plan since high school.", isEmt: "yes" },
  });
  const riley = base("Riley Brooks", {
    type: "Regular", stage: "appr",
    app: { received: day(-40), complete: "yes" },
    sched: { completed: day(-3) },
    iv: { why: "I want the night shifts.", isEmt: "yes", score: { comm: 5, motiv: 4, avail: 4, team: 5, fit: 4 } },
  });
  const morgan = base("Morgan Ellis", {
    type: "Regular", stage: "onb", email: "morgan@example.com",
    app: { received: day(-70), complete: "yes" },
    sched: { completed: day(-20) },
  });
  const quinn = base("Quinn Patel", { type: "Auxiliary", stage: "act", app: { received: day(-200), complete: "yes" }, sched: { completed: day(-160) } });
  const taylor = base("Taylor Quinn", { status: "declined", stage: "dec", app: { received: day(-15), complete: "yes" } });

  const jordanPriv = {
    mvr: { completed: day(-12), violations: "no" },
    dl: { date: day(-12), valid: "yes", state: "NY", expires: day(400) },
    refs: {
      r1: { name: "Casey Lane", email: "casey.ref@example.com", returned: day(-8), relationship: "Coach" },
      r2: { name: "Priya Shah", email: "priya.ref@example.com", returned: day(-7), relationship: "Supervisor" },
      r3: { name: "Owen Brooks", email: "owen.ref@example.com", returned: day(-6), relationship: "Mentor" },
    },
    portal: { invited: day(-18), bookingOpen: "no" },
    form: { person: { dlNumber: "SECRET-DL-900", dob: "SECRET-DOB" } },
  };
  const rileyPriv = {
    mvr: { completed: day(-30), violations: "no" },
    dl: { date: day(-30), valid: "yes", expires: day(500) },
    refs: { r1: { name: "A", returned: day(-25) }, r2: { name: "B", returned: day(-24) }, r3: { name: "C", returned: day(-24) } },
    appr: { committee: "yes" },
    board: {},
    portal: { invited: day(-35) },
  };
  const morganPriv = {
    mvr: { completed: day(-60), violations: "no" },
    dl: { date: day(-60), valid: "yes", expires: day(20) },
    refs: { r1: { name: "A", returned: day(-50) }, r2: { name: "B", returned: day(-50) }, r3: { name: "C", returned: day(-49) } },
    appr: { committee: "yes" },
    board: { result: "approved", date: day(-30), for: 8, against: 0, abstain: 0 },
    bg: { sterReq: day(-28), sterDone: day(-14), sterResult: "clear" },
    notify: { applicant: day(-14), orientation: day(-10) },
    onb: { orientStarted: day(-10), items: { completed_application: day(-10) }, cprExpires: day(25), emtExpires: day(400) },
    portal: { invited: day(-60), welcomed: day(-60) },
  };
  const quinnPriv = {
    mvr: { completed: day(-180) }, dl: { date: day(-180), valid: "yes" },
    refs: { r1: { name: "A", returned: day(-170) }, r2: { name: "B", returned: day(-170) }, r3: { name: "C", returned: day(-169) } },
    appr: { committee: "yes" }, board: { result: "approved", date: day(-150) },
    bg: { sterDone: day(-140), sterResult: "clear" },
    notify: { applicant: day(-140), orientation: day(-130), chief: day(-100), tech: day(-100) },
    onb: { orientStarted: day(-130), memberSince: day(-90) },
    portal: { invited: day(-190) },
  };
  const taylorSteps = applicantSteps({ _id: "taylor", ...taylor, board: { result: "denied" } } as Applicant);

  return {
    user: { email: "dkota@pvrs.org", name: "Dkota Wright", emailVerified: true },
    docs: {
      "settings/main": {
        ai: true,
        aiTone: "Write like the Potsdam Volunteer Rescue Squad membership coordinator: warm, plain, and short.",
        signature: "Dkota Wright, NREMT\nNYS EMT-B\nPotsdam Volunteer Rescue Squad\ndkota@pvrs.org",
        docsEmail: "membership@pvrs.org",
        defaultLocation: "PVRS station, 55 Main Street",
        idleMinutes: 30,
        ivBring: "A photo ID, your driver's license, and any EMT or CPR cards you hold.",
        orientDays: 60,
        replies: ["Thanks {first}, we got it.", "Hi {first}, interview times are open in your portal."],
      },
      "staff/casey@pvrs.org": { role: "coordinator", name: "Casey Lane" },
      "staff/ivy@pvrs.org": { role: "interviewer", name: "Ivy Nguyen" },
      "staff/admin@pvrs.org": { role: "admin", name: "Alex Admin" },
      "staff/member@pvrs.org": { role: "member", name: "Mia Member" },
      "applicants/avery": avery,
      "applicants/avery/private/main": { portal: {}, notes: "Online application, needs a first review." },
      "applicants/jordan": jordan,
      "applicants/jordan/private/main": jordanPriv,
      "applicants/sam": sam,
      "applicants/sam/private/main": { mvr: { completed: day(-10) }, dl: { date: day(-10), valid: "yes" }, refs: { r1: { name: "A", returned: day(-9) }, r2: { name: "B", returned: day(-9) }, r3: { name: "C", returned: day(-8) } }, portal: { invited: day(-16), bookingOpen: "yes" } },
      "applicants/riley": riley,
      "applicants/riley/private/main": rileyPriv,
      "applicants/morgan": morgan,
      "applicants/morgan/private/main": morganPriv,
      "applicants/quinn": quinn,
      "applicants/quinn/private/main": quinnPriv,
      "applicants/taylor": taylor,
      "applicants/taylor/private/main": { appr: { committee: "no" }, board: { result: "denied" }, notes: "Letter goes out from the administrator. Do not show this in the portal.", portal: { invited: day(-14), bookingOpen: "no" } },
      "slots/s1": { start: hour(1, 18), duration: 45, location: "PVRS station", bookedBy: "sam", hostName: "Ivy Nguyen" },
      "slots/s2": { start: hour(3, 17), duration: 45, location: "PVRS station", bookedBy: null, hostName: "Casey Lane" },
      "slots/s3": { start: hour(4, 18), duration: 45, location: "PVRS station", bookedBy: null },
      "portal/jordan": { email: "jordan@example.com", name: "Jordan Hale", firstName: "Jordan", type: "Associate", bookingOpen: false, steps: applicantSteps({ _id: "jordan", ...jordan, ...jordanPriv, _booked: null } as Applicant), docs: [], refs: [{ slot: 1, name: "Casey Lane", received: true }] },
      "portal/taylor": { email: "taylor@example.com", name: "Taylor Quinn", firstName: "Taylor", type: "Regular", bookingOpen: false, steps: taylorSteps },
      "portalEmails/jordan@example.com": { id: "jordan" },
      "portalEmails/taylor@example.com": { id: "taylor" },
      "channels/general": { name: "General", color: "#0071e3", members: ["dkota@pvrs.org", "casey@pvrs.org", "member@pvrs.org"], names: { "dkota@pvrs.org": "Dkota", "member@pvrs.org": "Mia" }, createdAt: Date.now() },
      "channels/general/posts/p1": { text: "Board packet is ready for Tuesday.", by: "dkota@pvrs.org", name: "Dkota", at: Date.now() - 3600e3 },
      "portal/jordan/messages/m1": { text: "Does Thursday evening work if I can't make the posted times?", from: "applicant", by: "jordan@example.com", name: "Jordan Hale", at: Date.now() - 7200e3 },
      "accessRequests/new@pvrs.org": { email: "new@pvrs.org", name: "New Person", note: "Driver", status: "pending", requestedAt: Date.now() },
    },
  };
}

export function portalSeed(): PvrsSeed {
  const seed = ownerSeed();
  return { ...seed, user: { email: "jordan@example.com", name: "Jordan Hale", emailVerified: true } };
}

export function declinedSeed(): PvrsSeed {
  const seed = ownerSeed();
  return { ...seed, user: { email: "taylor@example.com", name: "Taylor Quinn", emailVerified: true } };
}

export function interviewerSeed(): PvrsSeed {
  const seed = ownerSeed();
  return { ...seed, user: { email: "ivy@pvrs.org", name: "Ivy Nguyen", emailVerified: true } };
}

export function memberSeed(): PvrsSeed {
  const seed = ownerSeed();
  return { ...seed, user: { email: "member@pvrs.org", name: "Mia Member", emailVerified: true } };
}
