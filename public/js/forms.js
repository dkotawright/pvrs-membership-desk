// Orientation forms signed on the new member's phone (Nov 11). Wording is PVRS's own, from the paper sheets Dkota
// photographed. A signed form is saved as portal/{id}/forms/{key}; the Hepatitis B declination is medical, so it goes
// to the paperwork vault instead (only orientationpaperwork@pvrs.org can open it).
// Signing only works while the orientation chair has it open for that person (portal.signUntil), and the rules enforce that.
import { esc } from "./shared.js";

export const FORMS = [
  { key: "confidentiality", item: /confidentiality statement/i, title: "Confidentiality Statement", rev: "10/2015",
    intro: "I, the undersigned, hereby acknowledge that as conditions for working/volunteering with Potsdam Volunteer Rescue Squad, Inc. the following aspects of confidentiality were explained to me:",
    bullets: ["I may not make public, or reveal to persons outside of PVRS, any information about a patient or patients family which I have gained as a result of my association with PVRS.",
      "I acknowledge that even though my position at PVRS (paid or volunteer) may end, information about a patient or patient's family may never be divulged and will be kept in strict confidence.",
      "I may not discuss personnel matters, the private lives of other PVRS members (paid/volunteer), or internal organizational issues with PVRS patients or their families.",
      "The transmission of all verbal and written communications regarding patients, is based on the principle that others “need to know” information. All requests for release of information to the media must be approved by either the CLO or President. Release of Protected Health Information for reasons other than patient care, billing, or health care operations, requires a written authorization from the patient or patient's representative.",
      "I understand that failure to maintain confidentiality could result in disciplinary actions, termination of employment or volunteer status, or possible legal actions."],
    sign: "Signature of Employee or Volunteer", counter: "Supervisor/Authorized Representative of PVRS", foot: "All PVRS staff and volunteers are required to sign this form annually." },
  { key: "confquiz", title: "Confidentiality Quiz", lead: "Answer True or False.",
    tf: ["The PVRS patient has a right to privacy and confidentiality. We protect patient records and billing records. If a report must leave, we remove identifying data.",
      "All requests for patient information must be in written form.",
      "My home address and phone number are confidential and should not be released without my consent.",
      "The CAG billing information is sitting on an employee's desk, you are in the office, you can pick up the PCR's and read them over.",
      "You stop into dispatch and you heard an interesting call on the radio, so you open the PCR draw to see who, what, where the call was. This is a breech of confidentiality.",
      "You are going to the Post Office, and offer to get the PVRS mail. You are there when the mail is being opened, you have the right to see what the checks and bills are for."],
    scen: ["Someone asks you—“I know Mrs. Jones was picked up by PVRS. What was wrong?” What do you say?",
      "I saw the ambulance at the Smith house, who was it? What is your response?",
      "You are having lunch with a friend, and say you were on a call, at a specific address, and a relative has moved in to help. Was this appropriate information to share?",
      "You are meeting with several other PVRS members who were not a call with you. Can you talk about the patient or family of the call you just ran?",
      "You are in line at the store, you run into another PVRS member. Since you do not see each other very often, can you tell them about the recent call you just ran? What about in the parking lot?"] },
  { key: "bylaws", item: /constitution/i, title: "Constitution and Bylaws",
    statement: "I, {name}, on this date, {date}, received a copy of the Potsdam Volunteer Rescue Squad's Constitution and Bylaws. It is my responsibility to read and abide by the Constitution and Bylaws set forth by Potsdam Volunteer Rescue Squad.",
    sign: "Member's Signature", counter: "Witness's Signature" },
  { key: "emergency", item: /emergency contact/i, title: "Emergency Contact Form",
    groups: [["Member Demographics", [["m_name", "Name", 1], ["m_address", "Address", 1], ["m_city", "City", 1], ["m_phone", "Phone", 1, "tel"], ["m_email", "E-Mail", 1, "email"], ["m_position", "Position"]]],
      ["Emergency Contact Information Primary", [["p_name", "Name", 1], ["p_address", "Address"], ["p_phone", "Phone", 1, "tel"], ["p_email", "Email", 0, "email"]]],
      ["Emergency Contact Information Secondary", [["s_name", "Name"], ["s_address", "Address"], ["s_phone", "Phone", 0, "tel"], ["s_email", "Email", 0, "email"]]]] },
  { key: "hepb", item: /hep\s?b/i, title: "Hepatitis B Vaccine Declination Form", optional: "Only sign this if you are choosing not to get the hepatitis B vaccine. If you're vaccinated, upload your record instead.", confidential: true,
    intro: "The following statement of declination of the hepatitis B vaccine must be signed by an employee who:",
    bullets: ["Chooses not to accept the vaccine.", "Has had appropriate training regarding hepatitis B, hepatitis B vaccination, the efficacy, safety, method of administration and benefits of vaccination, given free of charge to the employee."],
    statement: "I understand that due to my occupational exposure to blood or other potentially infectious materials I may be at risk of acquiring hepatitis B virus (HBV) infection. I have been given the opportunity to be vaccinated with hepatitis B vaccine, at no charge to myself. However, I decline hepatitis B vaccination at this time. I understand that by declining this vaccine I continue to be at risk of acquiring hepatitis B, a serious disease. If in the future I continue to have occupational exposure to blood or other potentially infectious materials and I want to be vaccinated with hepatitis B vaccine, I can receive the vaccination series at no charge to me.",
    more: "This statement is not a waiver; employees can request and receive the hepatitis B vaccination at a later date if they remain occupationally at risk for hepatitis B. An employer can not require: employees to waive liability in order to receive the vaccine; participation in pre-screening as a prerequisite for receiving the vaccine.",
    sign: "Employee Signature" },
];
export const HEPB_LABEL = "Hepatitis B vaccine declination (signed on phone)";
export const formByKey = k => FORMS.find(f => f.key === k);
export const formForItem = label => FORMS.find(f => f.item && f.item.test(label || ""));
const longDay = ms => new Date(ms).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
const fill = (t, name, at) => String(t).replace("{name}", name || "__________").replace("{date}", longDay(at));

// The wording, as on the paper sheet. `name`/`at` fill the "I, ___, on this date" blanks.
export function formTextHTML(f, name, at = Date.now()){
  return `${f.intro ? `<p>${esc(f.intro)}</p>` : ""}${f.bullets ? `<ul>${f.bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
    ${f.statement ? `<p>${esc(fill(f.statement, name, at))}</p>` : ""}${f.more ? `<p class="fm-more">${esc(f.more)}</p>` : ""}`;
}
// What the member fills in (questions and contact details).
export function formFieldsHTML(f){
  return `${f.lead ? `<p><b>${esc(f.lead)}</b></p>` : ""}
    ${(f.tf || []).map((q, i) => `<fieldset class="fm-q"><legend>${i + 1}. ${esc(q)}</legend><label><input type="radio" name="tf${i}" value="True"> True</label><label><input type="radio" name="tf${i}" value="False"> False</label></fieldset>`).join("")}
    ${(f.scen || []).map((q, i) => `<label class="fm-f"><span>${i + 1}. ${esc(q)}</span><textarea name="sc${i}" rows="2" maxlength="1000"></textarea></label>`).join("")}
    ${(f.groups || []).map(([title, fields]) => `<h4>${esc(title)}</h4>${fields.map(([k, l, req, type]) => `<label class="fm-f"><span>${esc(l)}${req ? "" : " (optional)"}</span><input name="${k}" type="${type || "text"}" maxlength="200"${req ? " required" : ""}></label>`).join("")}`).join("")}`;
}
// Reads the member's answers out of the form. Returns { values } or { missing: "what's missing" }.
export function readForm(f, box){
  const values = {};
  for (let i = 0; i < (f.tf || []).length; i++) { const v = box.querySelector(`[name="tf${i}"]:checked`)?.value; if (!v) return { missing: `Answer question ${i + 1}.` }; values["tf" + i] = v; }
  for (let i = 0; i < (f.scen || []).length; i++) { const v = (box.querySelector(`[name="sc${i}"]`)?.value || "").trim(); if (!v) return { missing: `Answer the written question ${i + 1}.` }; values["sc" + i] = v.slice(0, 1000); }
  for (const [, fields] of f.groups || []) for (const [k, l, req] of fields) { const v = (box.querySelector(`[name="${k}"]`)?.value || "").trim(); if (req && !v) return { missing: `Fill in ${l}.` }; values[k] = v.slice(0, 200); }
  return { values };
}
// The finished document: wording, answers, signature, date, and the countersignature once there is one. Used on screen and for printing.
export function formDocHTML(f, d){
  const v = d.values || {};
  const answers = `${(f.tf || []).map((q, i) => `<p><b>${esc(v["tf" + i] || "—")}</b> &nbsp; ${i + 1}. ${esc(q)}</p>`).join("")}
    ${(f.scen || []).map((q, i) => `<p>${i + 1}. ${esc(q)}<br><b>${esc(v["sc" + i] || "—")}</b></p>`).join("")}
    ${(f.groups || []).map(([title, fields]) => `<h3>${esc(title)}</h3><table>${fields.map(([k, l]) => `<tr><th>${esc(l)}</th><td>${esc(v[k] || "—")}</td></tr>`).join("")}</table>`).join("")}`;
  return `<div class="formdoc"><div class="fd-org">Potsdam Volunteer Rescue Squad</div><h2>${esc(f.title)}</h2>
    ${formTextHTML(f, d.name, d.signedAt)}${answers}
    <div class="fd-sign"><div>${d.sig ? `<img src="${esc(d.sig)}" alt="Signature of ${esc(d.name || "")}">` : `<span class="fd-typed">${esc(d.name || "")}</span>`}<small>${esc(f.sign || "Name")}: ${esc(d.name || "")}</small></div><div><b>${esc(longDay(d.signedAt))}</b><small>Date</small></div></div>
    ${f.counter ? `<div class="fd-sign"><div>${d.witness ? `<span class="fd-typed">${esc(d.witness.name)}</span>` : `<span class="fd-blank"></span>`}<small>${esc(f.counter)}</small></div><div>${d.witness ? `<b>${esc(longDay(d.witness.at))}</b>` : `<span class="fd-blank"></span>`}<small>Date</small></div></div>` : ""}
    ${f.foot ? `<p><b>${esc(f.foot)}</b></p>` : ""}
    <p class="fd-meta">Signed electronically in the PVRS membership portal by ${esc(d.by || "")} on ${esc(new Date(d.signedAt).toLocaleString())}.${f.rev ? " Form " + esc(f.rev) + "." : ""}</p></div>`;
}
// A finger / mouse signature box. Returns { data(): PNG data URL or "" when nothing was drawn, clear() }.
export function signaturePad(canvas){
  const ctx = canvas.getContext("2d"); let drawn = false, down = false, last = null;
  const size = () => { const r = canvas.getBoundingClientRect(), k = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.max(1, Math.round(r.width * k)); canvas.height = Math.max(1, Math.round(r.height * k)); ctx.setTransform(k, 0, 0, k, 0, 0); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111"; drawn = false; };
  const pt = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  size();
  canvas.addEventListener("pointerdown", e => { e.preventDefault(); down = true; last = pt(e); try { canvas.setPointerCapture(e.pointerId); } catch {} });
  canvas.addEventListener("pointermove", e => { if (!down) return; e.preventDefault(); const p = pt(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; drawn = true; });
  const up = () => { down = false; };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  return { data: () => drawn ? canvas.toDataURL("image/png") : "", clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; }, mark: () => { drawn = true; } };
}
// Print a finished form (Print → Save as PDF keeps it as a document).
export function printDoc(html){
  let el = document.getElementById("print"); if (!el) { el = document.createElement("div"); el.id = "print"; document.body.appendChild(el); }
  el.innerHTML = html; document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); el.innerHTML = ""; removeEventListener("afterprint", done); };
  addEventListener("afterprint", done); setTimeout(() => window.print(), 80);
}
