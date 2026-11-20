import { HEARD, TYPES, okEmail, phoneOk } from "./domain";

export const STATES = "NY AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
export const CERTS = ["EMT", "AEMT", "Paramedic", "EMR / CFR", "CPR / BLS", "First Aid", "Nurse (RN / LPN)", "Firefighter"];
export const APPLY_STEPS = [
  { key: "you", title: "About you" },
  { key: "edu", title: "Education" },
  { key: "exp", title: "EMS experience" },
  { key: "work", title: "Employment" },
  { key: "bg", title: "Background" },
  { key: "refs", title: "References" },
  { key: "sign", title: "Review & sign" },
] as const;

export const RELEASE = [
  "I hereby make application for membership to the Potsdam Volunteer Rescue Squad, Incorporated. I understand that if accepted I will serve as a probationary member for the applicable time period of three (3) months without the right to franchise.",
  "I hereby certify that the facts set forth in the above application are true and complete to the best of my knowledge. I authorize the Potsdam Volunteer Rescue Squad, Inc., and its Officers to verify their accuracy and to obtain reference information by contacting educational institutions, references or employers and past employers, current or former EMS, Fire and Rescue agencies, law enforcement agencies, and Potsdam Volunteer Rescue's insurance provider, and to rely on and use such information as they see fit.",
  "I hereby release the Potsdam Volunteer Rescue Squad, Inc., its Officers, and assigns from any and all liability of whatever kind and nature, which, at any time, could result from obtaining and having a membership decision, based on such information.",
  "I understand that, if granted membership, falsified statements of any kind or omissions of facts called for on this application, regardless of the time of discovery, shall be considered sufficient basis for dismissal.",
  "I understand that should an offer of membership be extended to me and accepted that I willfully adhere to the policies, rules and regulations of Potsdam Volunteer Rescue Squad, Inc., including minimum service requirements. I further understand, however, that neither policies, rules, regulations of membership nor anything said during the application and interview process shall be deemed to constitute the terms of an implied contract for continued membership. I understand that any membership is for an indefinite duration and is at will and that either I, or Potsdam Volunteer Rescue Squad, Inc. may terminate my membership at any time with or without cause.",
  "I understand that if I am offered membership it is conditioned upon me providing such other and further information as may be required by Potsdam Volunteer Rescue Squad, Inc.",
  "I understand that a driver's license review for the purpose of determining eligibility for membership and future operation of Potsdam Volunteer Rescue Squad, Inc. owned and/or operated vehicles and equipment will be conducted.",
];

export interface Addr { street: string; city: string; state: string; zip: string }
export interface Job { place: string; location: string; length: string; supervisor: string; duties: string }
export interface ARef { name: string; relationship: string; phone: string; email: string; address: string }
export interface ApplyData {
  person: {
    first: string; last: string; email: string; phone: string; dob: string; birthplace: string;
    permAddr: Addr; sameLocal: boolean; localAddr: Addr; dlState: string; dlNumber: string; type: string;
  };
  education: {
    hs: { name: string; location: string; grad: string };
    college: { name: string; location: string; study: string; from: string; to: string; grad: string };
    other: { name: string; location: string; study: string; from: string; to: string; grad: string };
  };
  experience: { certs: string[]; certOther: string; otherAgencies: string; agenciesDetail: string };
  employment: { jobs: Job[]; community: string; other: string };
  background: { convicted: string; detail: string };
  references: ARef[];
  signature: { confirmed: boolean; name: string };
  heard: { source: string; detail: string };
}

export const blankAddr = (): Addr => ({ street: "", city: "", state: "NY", zip: "" });
export const blankJob = (): Job => ({ place: "", location: "", length: "", supervisor: "", duties: "" });
export const blankRef = (): ARef => ({ name: "", relationship: "", phone: "", email: "", address: "" });
export function blankApply(): ApplyData {
  return {
    person: { first: "", last: "", email: "", phone: "", dob: "", birthplace: "", permAddr: blankAddr(), sameLocal: false, localAddr: blankAddr(), dlState: "NY", dlNumber: "", type: "" },
    education: {
      hs: { name: "", location: "", grad: "" },
      college: { name: "", location: "", study: "", from: "", to: "", grad: "" },
      other: { name: "", location: "", study: "", from: "", to: "", grad: "" },
    },
    experience: { certs: [], certOther: "", otherAgencies: "", agenciesDetail: "" },
    employment: { jobs: [blankJob()], community: "", other: "" },
    background: { convicted: "", detail: "" },
    references: [blankRef(), blankRef(), blankRef()],
    signature: { confirmed: false, name: "" },
    heard: { source: "", detail: "" },
  };
}

const filled = (v: unknown) => String(v || "").trim().length > 0;
export const refUsed = (r: ARef) => filled(r.name) || filled(r.email) || filled(r.phone) || filled(r.relationship) || filled(r.address);

export interface Problem { path: string; msg: string }

export function applyProblems(step: number, d: ApplyData): Problem[] {
  const p = d.person;
  const out: Problem[] = [];
  const need = (ok: boolean, path: string, msg: string) => { if (!ok) out.push({ path, msg }); };
  const key = APPLY_STEPS[step]?.key;
  if (key === "you") {
    need(filled(p.first), "person.first", "Enter your first name.");
    need(filled(p.last), "person.last", "Enter your last name.");
    need(okEmail(p.email), "person.email", "Enter a valid email address.");
    need(phoneOk(p.phone), "person.phone", "Enter your cell phone number.");
    need(filled(p.dob), "person.dob", "Enter your date of birth.");
    need(filled(p.permAddr.street) && filled(p.permAddr.city) && filled(p.permAddr.zip), "person.permAddr.street", "Enter your permanent address.");
    need(STATES.includes(p.dlState), "person.dlState", "Choose the state your driver's license is from.");
    need(filled(p.dlNumber), "person.dlNumber", "Enter your driver's license ID number.");
    need(TYPES.includes(p.type as (typeof TYPES)[number]), "person.type", "Choose a membership type.");
  }
  if (key === "exp") {
    need(!!d.experience.otherAgencies, "experience.otherAgencies", "Answer the public safety agency question.");
    if (d.experience.otherAgencies === "yes") need(filled(d.experience.agenciesDetail), "experience.agenciesDetail", "List the agency name(s), location(s) and dates.");
  }
  if (key === "bg") {
    need(!!d.background.convicted, "background.convicted", "Answer the conviction question.");
    if (d.background.convicted === "yes") need(filled(d.background.detail), "background.detail", "Describe the offense, date and penalty.");
  }
  if (key === "refs") {
    const used = d.references.filter(refUsed);
    need(used.length >= 3, "references.0.name", "List at least 3 references.");
    d.references.forEach((r, i) => {
      if (!refUsed(r) && i >= 3) return;
      need(filled(r.name), `references.${i}.name`, `Reference ${i + 1}: enter their name.`);
      need(filled(r.relationship), `references.${i}.relationship`, `Reference ${i + 1}: enter how you know them.`);
      need(okEmail(r.email), `references.${i}.email`, `Reference ${i + 1}: enter a valid email.`);
      need(phoneOk(r.phone), `references.${i}.phone`, `Reference ${i + 1}: enter their phone number.`);
    });
  }
  if (key === "sign") {
    need(d.signature.confirmed, "signature.confirmed", "Check the box to sign.");
    need(String(d.signature.name || "").trim().length >= 3, "signature.name", "Type your full legal name.");
  }
  return out;
}

/** Shape written to `submissions`. Matches validSubmission() in firestore.rules. */
export function submissionDoc(d: ApplyData, now = Date.now()) {
  const person = { ...d.person, email: d.person.email.trim().toLowerCase() };
  const { sameLocal, ...personRest } = person;
  const localAddr = sameLocal ? null : person.localAddr;
  const references = d.references.filter(refUsed).map((r) => ({ ...r, email: r.email.trim().toLowerCase() }));
  const jobs = d.employment.jobs.filter((j) => filled(j.place) || filled(j.duties));
  const heard = filled(d.heard.source) ? { source: d.heard.source.slice(0, 60), detail: (d.heard.detail || "").slice(0, 200) } : undefined;
  return {
    v: 1,
    status: "new",
    submittedAt: now,
    hp: "",
    person: { ...personRest, localAddr, dlNumber: person.dlNumber.trim(), dlState: person.dlState },
    education: d.education,
    experience: d.experience,
    employment: { ...d.employment, jobs },
    background: d.background,
    references,
    signature: { confirmed: true as const, name: d.signature.name.trim() },
    ...(heard ? { heard } : {}),
  };
}

export function heardOptions() {
  return HEARD;
}
