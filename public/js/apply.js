// Public membership application (no sign-in). Seven steps with a progress bar; the draft saves in this browser as
// people type. Submitting writes one document to `submissions`; the owner's desk turns it into an applicant record.
// The driver's license number is collected for the squad's driving-record check; it lands only in the private
// (admin-only) record, and the review page shows just the last 4 digits.
import { db, collection, addDoc } from "./fb.js";
import { $, esc, toast, TYPES, TYPE_INFO, HEARD } from "./shared.js";
import { CONTACT_EMAIL } from "./config.js";

const DRAFT_KEY = "pvrsApplyDraft";
const STATES = "NY AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const CERTS = ["EMT", "AEMT", "Paramedic", "EMR / CFR", "CPR / BLS", "First Aid", "Nurse (RN / LPN)", "Firefighter"];
const STEPS = [
  { key: "you", title: "About you" },
  { key: "edu", title: "Education" },
  { key: "exp", title: "EMS experience" },
  { key: "work", title: "Employment" },
  { key: "bg", title: "Background" },
  { key: "refs", title: "References" },
  { key: "sign", title: "Review & sign" },
];
const RELEASE = [
  "I hereby make application for membership to the Potsdam Volunteer Rescue Squad, Incorporated. I understand that if accepted I will serve as a probationary member for the applicable time period of three (3) months without the right to franchise.",
  "I hereby certify that the facts set forth in the above application are true and complete to the best of my knowledge. I authorize the Potsdam Volunteer Rescue Squad, Inc., and its Officers to verify their accuracy and to obtain reference information by contacting educational institutions, references or employers and past employers, current or former EMS, Fire and Rescue agencies, law enforcement agencies, and Potsdam Volunteer Rescue's insurance provider, and to rely on and use such information as they see fit.",
  "I hereby release the Potsdam Volunteer Rescue Squad, Inc., its Officers, and assigns from any and all liability of whatever kind and nature, which, at any time, could result from obtaining and having a membership decision, based on such information.",
  "I understand that, if granted membership, falsified statements of any kind or omissions of facts called for on this application, regardless of the time of discovery, shall be considered sufficient basis for dismissal.",
  "I understand that should an offer of membership be extended to me and accepted that I willfully adhere to the policies, rules and regulations of Potsdam Volunteer Rescue Squad, Inc., including minimum service requirements. I further understand, however, that neither policies, rules, regulations of membership nor anything said during the application and interview process shall be deemed to constitute the terms of an implied contract for continued membership. I understand that any membership is for an indefinite duration and is at will and that either I, or Potsdam Volunteer Rescue Squad, Inc. may terminate my membership at any time with or without cause.",
  "I understand that if I am offered membership it is conditioned upon me providing such other and further information as may be required by Potsdam Volunteer Rescue Squad, Inc.",
  "I understand that a driver's license review for the purpose of determining eligibility for membership and future operation of Potsdam Volunteer Rescue Squad, Inc. owned and/or operated vehicles and equipment will be conducted.",
];

const blankAddr = () => ({ street: "", city: "", state: "NY", zip: "" });
const blankJob = () => ({ place: "", location: "", length: "", supervisor: "", duties: "" });
const blankRef = () => ({ name: "", relationship: "", phone: "", email: "", address: "" });
const blank = () => ({
  person: { first: "", last: "", email: "", phone: "", dob: "", birthplace: "", permAddr: blankAddr(), sameLocal: false, localAddr: blankAddr(), dlState: "NY", dlNumber: "", type: "" },
  education: { hs: { name: "", location: "", grad: "" }, college: { name: "", location: "", study: "", from: "", to: "", grad: "" }, other: { name: "", location: "", study: "", from: "", to: "", grad: "" } },
  experience: { certs: [], certOther: "", otherAgencies: "", agenciesDetail: "" },
  employment: { jobs: [blankJob()], community: "", other: "" },
  background: { convicted: "", detail: "" },
  references: [blankRef(), blankRef(), blankRef()],
  signature: { confirmed: false, name: "" },
  heard: { source: "", detail: "" },
});

const get = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
const set = (o, p, v) => { const k = p.split("."); let t = o; k.slice(0, -1).forEach(x => { if (t[x] == null) t[x] = /^\d+$/.test(x) ? [] : {}; t = t[x]; }); t[k[k.length - 1]] = v; };
const emailOk = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || "").trim());
const phoneOk = v => String(v || "").replace(/\D/g, "").length >= 10;
const filled = v => String(v || "").trim().length > 0;
const refUsed = r => filled(r.name) || filled(r.email) || filled(r.phone) || filled(r.relationship) || filled(r.address);

let A = null;   // { step, data, startedAt, done }
const load = () => { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); if (d && d.data) { if (d.data.person && d.data.person.dlState === "none") d.data.person.dlState = "NY"; return d; } } catch {} return null; };
let saveT;
const saveNow = () => { clearTimeout(saveT); if (!A || A.done) return; try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: A.step, data: A.data, startedAt: A.startedAt })); } catch {} };
const save = () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 300); };

/* ---------- field builders ---------- */
const fid = p => "ap-" + p.replace(/\./g, "-");
function input(path, label, { type = "text", req = false, ph = "", ac = "off", half = false, help = "", max = 200 } = {}){
  const v = get(A.data, path) ?? "";
  return `<div class="af ${half ? "half" : ""}"><label for="${fid(path)}">${label}${req ? ' <i aria-hidden="true">*</i>' : ""}</label>
    <input id="${fid(path)}" data-p="${path}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="${ac}" maxlength="${max}" ${req ? 'aria-required="true"' : ""}>${help ? `<small>${help}</small>` : ""}</div>`;
}
function area(path, label, { req = false, ph = "", rows = 3, max = 2000 } = {}){
  return `<div class="af"><label for="${fid(path)}">${label}${req ? ' <i aria-hidden="true">*</i>' : ""}</label><textarea id="${fid(path)}" data-p="${path}" rows="${rows}" maxlength="${max}" placeholder="${esc(ph)}">${esc(get(A.data, path) || "")}</textarea></div>`;
}
function select(path, label, opts, { half = false, req = false } = {}){
  const v = get(A.data, path) ?? "";
  return `<div class="af ${half ? "half" : ""}"><label for="${fid(path)}">${label}${req ? ' <i aria-hidden="true">*</i>' : ""}</label><select id="${fid(path)}" data-p="${path}">${opts.map(o => { const [val, txt] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${val === v ? "selected" : ""}>${esc(txt)}</option>`; }).join("")}</select></div>`;
}
function yesno(path, label, { req = true } = {}){
  const v = get(A.data, path);
  return `<div class="af"><span class="aflabel">${label}${req ? ' <i aria-hidden="true">*</i>' : ""}</span><div class="choice" role="radiogroup" aria-label="${esc(label)}">
    ${[["yes", "Yes"], ["no", "No"]].map(([val, txt]) => `<button type="button" role="radio" aria-checked="${v === val}" data-choice="${path}" data-v="${val}">${txt}</button>`).join("")}</div></div>`;
}
const addr = (path, title, req) => `<fieldset class="afs"><legend>${title}</legend><div class="afgrid">
  ${input(path + ".street", "Street address", { req, ac: "street-address", ph: "123 Main St" })}
  ${input(path + ".city", "City", { req, half: true, ac: "address-level2" })}
  ${select(path + ".state", "State", STATES, { half: true })}
  ${input(path + ".zip", "ZIP", { req, half: true, ac: "postal-code", max: 10 })}</div></fieldset>`;

/* ---------- steps ---------- */
function stepHTML(){
  const d = A.data;
  switch (STEPS[A.step].key) {
    case "you": return `<div class="afgrid">
        ${input("person.first", "First name", { req: true, ac: "given-name", half: true })}
        ${input("person.last", "Last name", { req: true, ac: "family-name", half: true })}
        ${input("person.email", "Email", { req: true, type: "email", ac: "email", half: true, help: "We'll send your applicant portal link here." })}
        ${input("person.phone", "Cell phone", { req: true, type: "tel", ac: "tel", half: true, ph: "(315) 555-0100" })}
        ${input("person.dob", "Date of birth", { req: true, type: "date", ac: "bday", half: true })}
        ${input("person.birthplace", "Place of birth", { half: true, ph: "City, State" })}</div>
      ${addr("person.permAddr", "Permanent address", true)}
      <label class="check"><input type="checkbox" data-p="person.sameLocal" ${d.person.sameLocal ? "checked" : ""}> My school / local address is the same as my permanent address</label>
      ${d.person.sameLocal ? "" : addr("person.localAddr", "School / local address (if different)", false)}
      <div class="afgrid">${select("person.dlState", "State your driver's license is from", STATES.map(s => [s, s]), { half: true })}
        ${input("person.dlNumber", "Driver's license ID number", { req: true, half: true, ac: "off", max: 30 })}</div>
      <p class="afnote">We use your license number only to run the driving record check. It's kept private to the membership officer and administrator, and we'll also see your physical license in person.</p>
      <fieldset class="afs"><legend>Membership type <i aria-hidden="true">*</i></legend><div class="types" role="radiogroup" aria-label="Membership type">
        ${TYPES.map(t => `<button type="button" role="radio" class="typecard" aria-checked="${d.person.type === t}" data-type="${esc(t)}"><b>${esc(t)}</b><span>${esc(TYPE_INFO[t] || "")}</span></button>`).join("")}</div></fieldset>
      <div class="afgrid">${select("heard.source", "How did you hear about PVRS? (optional)", [["", "Choose one"], ...HEARD.map(h => [h, h])], { half: true })}
        ${input("heard.detail", "Anything to add? (optional)", { half: true, ph: "e.g. which member, which event", max: 200 })}</div>`;
    case "edu": {
      const ed = (k, t, open) => `<fieldset class="afs"><legend>${t}</legend><div class="afgrid">
        ${input(`education.${k}.name`, k === "hs" ? "High school" : k === "college" ? "College / university" : "School or program", { half: k !== "hs" })}
        ${input(`education.${k}.location`, "Location", { half: true, ph: "City, State" })}
        ${k === "hs" ? input("education.hs.grad", "Graduation date", { half: true, ph: "June 2023" }) : `
        ${input(`education.${k}.study`, "Course of study", { half: true })}
        ${input(`education.${k}.from`, "Attended from", { half: true, ph: "Aug 2023" })}
        ${input(`education.${k}.to`, "Attended to", { half: true, ph: "May 2027" })}
        ${input(`education.${k}.grad`, "Graduation (or expected)", { half: true, ph: "May 2027" })}`}</div></fieldset>`;
      return `${ed("hs", "High school")}${ed("college", "College")}
        <details class="afmore" ${filled(d.education.other.name) ? "open" : ""}><summary>Add other education or training</summary>${ed("other", "Other education")}</details>`;
    }
    case "exp": return `<fieldset class="afs"><legend>Certifications</legend><p class="afnote" style="margin-top:0">Choose any you currently hold.</p>
        <div class="chipset">${CERTS.map(c => `<button type="button" class="pickchip" aria-pressed="${d.experience.certs.includes(c)}" data-cert="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        <div class="afgrid">${input("experience.certOther", "Other certifications", { ph: "e.g. Wilderness First Responder" })}</div></fieldset>
      ${yesno("experience.otherAgencies", "Have you ever applied to or been a member of any other public safety agency?")}
      ${d.experience.otherAgencies === "yes" ? area("experience.agenciesDetail", "Agency name(s), location(s) and date(s) of application and/or membership", { req: true }) : ""}`;
    case "work": return `${d.employment.jobs.map((j, i) => `<fieldset class="afs"><legend>Employer ${i + 1}${i ? ` <button type="button" class="linkbtn" data-rmjob="${i}">Remove</button>` : ""}</legend><div class="afgrid">
        ${input(`employment.jobs.${i}.place`, "Place of employment", { half: true })}
        ${input(`employment.jobs.${i}.location`, "Location", { half: true, ph: "City, State" })}
        ${input(`employment.jobs.${i}.length`, "Length of employment", { half: true, ph: "e.g. 7 months" })}
        ${input(`employment.jobs.${i}.supervisor`, "Supervisor name and phone", { half: true })}
        ${input(`employment.jobs.${i}.duties`, "Duties", { max: 500 })}</div></fieldset>`).join("")}
      ${d.employment.jobs.length < 3 ? `<button type="button" class="btn small addbtn" data-addjob>+ Add another employer</button>` : ""}
      ${area("employment.community", "Community service experience", { ph: "Volunteer work, clubs, service projects…" })}
      ${area("employment.other", "Other employment")}`;
    case "bg": return `${yesno("background.convicted", "Have you ever been convicted, fined, placed on probation or imprisoned for any misdemeanor or felony?")}
      ${d.background.convicted === "yes" ? area("background.detail", "Please describe the nature of the offense, date of conviction, penalty imposed and, if applicable, date of release", { req: true, rows: 4 }) : ""}
      <p class="afnote">Answering yes doesn't automatically disqualify you. Please be complete and honest; omissions can be grounds for dismissal later.</p>`;
    case "refs": return `<p class="afnote" style="margin-top:0">List 3 or 4 people who know you well (not relatives). We contact references by email, and we need to hear from all of them before your application goes to the board.</p>
      ${d.references.map((r, i) => `<fieldset class="afs"><legend>Reference ${i + 1}${i >= 3 ? " <span class=\"opt\">optional</span>" : ""}${i >= 3 ? ` <button type="button" class="linkbtn" data-rmref="${i}">Remove</button>` : ""}</legend><div class="afgrid">
        ${input(`references.${i}.name`, "Full name", { half: true, req: i < 3 })}
        ${input(`references.${i}.relationship`, "Relationship", { half: true, req: i < 3, ph: "e.g. Coach, supervisor" })}
        ${input(`references.${i}.email`, "Email", { type: "email", half: true, req: i < 3 })}
        ${input(`references.${i}.phone`, "Phone", { type: "tel", half: true, req: i < 3 })}
        ${input(`references.${i}.address`, "Address", { ph: "Street, City, State ZIP" })}</div></fieldset>`).join("")}
      ${d.references.length < 4 ? `<button type="button" class="btn small addbtn" data-addref>+ Add a fourth reference</button>` : ""}`;
    case "sign": return `${reviewHTML()}
      <fieldset class="afs release"><legend>Statement of release and certification</legend>${RELEASE.map(p => `<p>${esc(p)}</p>`).join("")}</fieldset>
      <label class="check big"><input type="checkbox" data-p="signature.confirmed" ${d.signature.confirmed ? "checked" : ""}> I have read the statement above, and checking this box with my typed name is my electronic signature.</label>
      <div class="afgrid">${input("signature.name", "Type your full legal name", { req: true, ac: "name" })}</div>
      <input type="text" id="ap-hp" name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">`;
  }
  return "";
}

/* ---------- review ---------- */
function reviewHTML(){
  const d = A.data, p = d.person;
  const line = (k, v) => filled(v) ? `<div class="rvrow"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : "";
  const a = x => [x.street, x.city, [x.state, x.zip].filter(Boolean).join(" ")].filter(filled).join(", ");
  const sec = (title, step, body) => `<section class="rv"><h3>${title}<button type="button" class="linkbtn" data-goto="${step}">Edit</button></h3>${body || `<div class="rvrow"><span>Nothing entered</span></div>`}</section>`;
  const jobs = d.employment.jobs.filter(j => filled(j.place));
  const refs = d.references.filter(refUsed);
  return `<p class="afnote" style="margin-top:0">Check everything below, then sign at the bottom.</p><div class="review">
    ${sec("About you", 0, line("Name", `${p.first} ${p.last}`) + line("Email", p.email) + line("Cell phone", p.phone) + line("Date of birth", p.dob) + line("Place of birth", p.birthplace)
      + line("Permanent address", a(p.permAddr)) + line("School / local address", p.sameLocal ? "Same as permanent" : a(p.localAddr)) + line("Driver's license", [p.dlState, p.dlNumber ? "ending " + String(p.dlNumber).slice(-4) : ""].filter(filled).join(" · ")) + line("Membership type", p.type) + line("Heard about PVRS", [d.heard?.source, d.heard?.detail].filter(filled).join(" · ")))}
    ${sec("Education", 1, line("High school", [d.education.hs.name, d.education.hs.location, d.education.hs.grad].filter(filled).join(" · "))
      + line("College", [d.education.college.name, d.education.college.study, d.education.college.grad].filter(filled).join(" · "))
      + line("Other", [d.education.other.name, d.education.other.study].filter(filled).join(" · ")))}
    ${sec("EMS experience", 2, line("Certifications", [...d.experience.certs, d.experience.certOther].filter(filled).join(", ") || "None") + line("Other agencies", d.experience.otherAgencies === "yes" ? "Yes: " + d.experience.agenciesDetail : d.experience.otherAgencies === "no" ? "No" : ""))}
    ${sec("Employment", 3, jobs.map(j => line(j.place, [j.location, j.length].filter(filled).join(" · "))).join("") + line("Community service", d.employment.community))}
    ${sec("Background", 4, line("Convictions", d.background.convicted === "yes" ? "Yes: " + d.background.detail : d.background.convicted === "no" ? "No" : ""))}
    ${sec("References", 5, refs.map(r => line(r.name, [r.relationship, r.email, r.phone].filter(filled).join(" · "))).join(""))}</div>`;
}

/* ---------- validation ---------- */
function problems(step){
  const d = A.data, p = d.person, out = [];
  const need = (ok, path, msg) => { if (!ok) out.push({ path, msg }); };
  switch (STEPS[step].key) {
    case "you":
      need(filled(p.first), "person.first", "Enter your first name.");
      need(filled(p.last), "person.last", "Enter your last name.");
      need(emailOk(p.email), "person.email", "Enter a valid email address.");
      need(phoneOk(p.phone), "person.phone", "Enter your cell phone number.");
      need(filled(p.dob), "person.dob", "Enter your date of birth.");
      need(filled(p.permAddr.street) && filled(p.permAddr.city) && filled(p.permAddr.zip), "person.permAddr.street", "Enter your permanent address.");
      need(STATES.includes(p.dlState), "person.dlState", "Choose the state your driver's license is from.");
      need(filled(p.dlNumber), "person.dlNumber", "Enter your driver's license ID number.");
      need(filled(p.type), "type", "Choose a membership type.");
      break;
    case "exp":
      need(!!d.experience.otherAgencies, "experience.otherAgencies", "Answer the public safety agency question.");
      if (d.experience.otherAgencies === "yes") need(filled(d.experience.agenciesDetail), "experience.agenciesDetail", "List the agency name(s), location(s) and dates.");
      break;
    case "bg":
      need(!!d.background.convicted, "background.convicted", "Answer the conviction question.");
      if (d.background.convicted === "yes") need(filled(d.background.detail), "background.detail", "Describe the offense, date and penalty.");
      break;
    case "refs": {
      const used = d.references.filter(refUsed);
      need(used.length >= 3, "references.0.name", "List at least 3 references.");
      d.references.forEach((r, i) => { if (!refUsed(r) && i >= 3) return;
        need(filled(r.name), `references.${i}.name`, `Reference ${i + 1}: enter their name.`);
        need(filled(r.relationship), `references.${i}.relationship`, `Reference ${i + 1}: enter how you know them.`);
        need(emailOk(r.email), `references.${i}.email`, `Reference ${i + 1}: enter a valid email.`);
        need(phoneOk(r.phone), `references.${i}.phone`, `Reference ${i + 1}: enter their phone number.`); });
      break;
    }
    case "sign":
      need(d.signature.confirmed, "signature.confirmed", "Check the box to sign.");
      need(String(d.signature.name || "").trim().length >= 3, "signature.name", "Type your full legal name.");
      break;
  }
  return out;
}

/* ---------- render ---------- */
const root = () => $("#applyRoot");
let animated = false;   // the card fades in once, not on every redraw
function render(){
  const R = root(); if (!R) return;
  const settled = animated; animated = true;
  if (A.done) {
    R.innerHTML = `<div class="applycard glass done"><div class="donemark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <h1>Application received</h1>
      <p class="lead2">Thank you, ${esc(A.done.first)}. Your application is on its way to the PVRS Membership Committee.</p>
      <ol class="nextsteps"><li><b>Watch your email</b> (${esc(A.done.email)}). We'll send a link to your applicant portal, where you can follow your application, upload documents and book your interview.</li>
        <li><b>Give your references a heads-up.</b> We contact them by email, and we need to hear from all of them before the board meeting.</li>
        <li><b>Questions?</b> Email <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.</li></ol>
      <a class="btn primary" href="/" data-nav="/">Back to the start page</a></div>`;
    return;
  }
  const n = STEPS.length, st = STEPS[A.step];
  R.innerHTML = `<div class="applycard glass${settled ? " noanim" : ""}">
    <div class="applyhead"><div><div class="eyebrow">Membership application · Step ${A.step + 1} of ${n}</div><h1>${esc(st.title)}</h1></div>
      <span class="saved" id="apSaved">Saved on this device</span></div>
    <ol class="apsteps" aria-label="Progress">${STEPS.map((s, i) => `<li class="${i < A.step ? "done" : i === A.step ? "cur" : ""}"><button type="button" data-goto="${i}" ${i > A.maxStep ? "disabled" : ""} aria-current="${i === A.step ? "step" : "false"}"><span>${i + 1}</span><em>${esc(s.title)}</em></button></li>`).join("")}</ol>
    <form class="applybody" id="applyForm" novalidate>${stepHTML()}
      <div class="aperr" id="apErr" role="alert" hidden></div>
      <div class="applyfoot">${A.step ? `<button type="button" class="btn" data-back>← Back</button>` : `<span></span>`}
        <button type="submit" class="btn primary">${A.step === n - 1 ? "Submit application" : "Continue →"}</button></div>
    </form>
    <p class="applyfine">Fields marked <i>*</i> are required. Your answers are kept on this device until you submit. Questions? <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a></p></div>`;
}
function showErrors(list){
  const box = $("#apErr");
  document.querySelectorAll("#applyForm .bad").forEach(el => el.classList.remove("bad"));
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false; box.innerHTML = `<b>Please fix ${list.length === 1 ? "this" : "these"}:</b><ul>${list.map(x => `<li>${esc(x.msg)}</li>`).join("")}</ul>`;
  list.forEach(x => { const el = x.path === "type" ? $(".types") : document.querySelector(`[data-p="${x.path}"], [data-choice="${x.path}"]`); if (el) (el.closest(".af") || el).classList.add("bad"); });
  const firstEl = list[0].path === "type" ? $(".typecard") : document.querySelector(`[data-p="${list[0].path}"], [data-choice="${list[0].path}"]`);
  if (firstEl) { firstEl.focus({ preventScroll: true }); firstEl.scrollIntoView({ block: "center", behavior: "smooth" }); }
}
function go(step){ A.step = Math.max(0, Math.min(STEPS.length - 1, step)); A.maxStep = Math.max(A.maxStep, A.step); saveNow(); render(); const g = $("#apply"); if (g) g.scrollTop = 0; }

/* ---------- submit ---------- */
const clean = v => typeof v === "string" ? v.trim() : Array.isArray(v) ? v.map(clean) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v;
async function submit(btn){
  const hp = $("#ap-hp"); if (hp && hp.value) { A.done = { first: A.data.person.first, email: A.data.person.email }; return render(); }   // bots fill hidden fields
  const d = clean(A.data);
  if (d.person.sameLocal) d.person.localAddr = null;
  d.person.email = d.person.email.toLowerCase();
  d.references = d.references.filter(refUsed);
  d.employment.jobs = d.employment.jobs.filter(j => filled(j.place) || filled(j.duties));
  delete d.person.sameLocal;
  if (!filled(d.heard?.source)) delete d.heard; else d.heard = { source: d.heard.source, detail: d.heard.detail || "" };
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    await addDoc(collection(db, "submissions"), { v: 1, status: "new", submittedAt: Date.now(), hp: "", ...d, signature: { confirmed: true, name: d.signature.name } });
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    A.done = { first: d.person.first, email: d.person.email }; render();
    const g = $("#apply"); if (g) g.scrollTop = 0;
  } catch (e) {
    console.error(e); btn.disabled = false; btn.textContent = "Submit application";
    toast(`Couldn't send your application. Check your connection and try again, or email ${CONTACT_EMAIL}.`);
  }
}

/* ---------- events (bound once) ---------- */
let bound = false;
function bind(){
  if (bound) return; bound = true;
  const R = root();
  addEventListener("pagehide", saveNow);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveNow(); });
  R.addEventListener("input", e => {
    const el = e.target.closest("[data-p]"); if (!el) return;
    set(A.data, el.dataset.p, el.type === "checkbox" ? el.checked : el.value);
    if (el.type === "checkbox") render();
    const sv = $("#apSaved"); if (sv) sv.textContent = "Saving…"; save(); setTimeout(() => { const s2 = $("#apSaved"); if (s2) s2.textContent = "Saved on this device"; }, 500);
  });
  R.addEventListener("change", e => { if (e.target.matches("select[data-p]")) { set(A.data, e.target.dataset.p, e.target.value); save(); if (e.target.dataset.p === "person.dlState") render(); } });
  R.addEventListener("click", e => {
    const t = e.target;
    const ch = t.closest("[data-choice]"); if (ch) { set(A.data, ch.dataset.choice, ch.dataset.v); save(); render(); return; }
    const ty = t.closest("[data-type]"); if (ty) { A.data.person.type = ty.dataset.type; save(); render(); return; }
    const ce = t.closest("[data-cert]"); if (ce) { const c = ce.dataset.cert, L = A.data.experience.certs; const i = L.indexOf(c); i >= 0 ? L.splice(i, 1) : L.push(c); save(); render(); return; }
    if (t.closest("[data-addjob]")) { A.data.employment.jobs.push(blankJob()); save(); render(); return; }
    const rj = t.closest("[data-rmjob]"); if (rj) { A.data.employment.jobs.splice(+rj.dataset.rmjob, 1); save(); render(); return; }
    if (t.closest("[data-addref]")) { A.data.references.push(blankRef()); save(); render(); return; }
    const rr = t.closest("[data-rmref]"); if (rr) { A.data.references.splice(+rr.dataset.rmref, 1); save(); render(); return; }
    const gt = t.closest("[data-goto]"); if (gt && !gt.disabled) { go(+gt.dataset.goto); return; }
    if (t.closest("[data-back]")) { go(A.step - 1); return; }
  });
  R.addEventListener("submit", e => {
    e.preventDefault();
    const list = problems(A.step); showErrors(list); if (list.length) return;
    if (A.step === STEPS.length - 1) {
      for (let i = 0; i < STEPS.length - 1; i++) if (problems(i).length) { go(i); setTimeout(() => showErrors(problems(i)), 0); return; }
      return submit(e.target.querySelector("button[type=submit]"));
    }
    go(A.step + 1);
  });
}

export function startApply(){
  if (!A) { const dft = load(); A = dft ? { step: dft.step || 0, data: Object.assign(blank(), dft.data), startedAt: dft.startedAt || Date.now(), maxStep: dft.step || 0 } : { step: 0, data: blank(), startedAt: Date.now(), maxStep: 0 }; }
  if (A.done) A = { step: 0, data: blank(), startedAt: Date.now(), maxStep: 0 };
  // Came from the recruiting flyer's QR code: pre-pick "Flyer or poster" (they can still change it)
  try { if (new URLSearchParams(location.search).get("src") === "flyer" && !filled(A.data.heard?.source)) set(A.data, "heard.source", "Flyer or poster"); } catch {}
  bind(); render();
}
