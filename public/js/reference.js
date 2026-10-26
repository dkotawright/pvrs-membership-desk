// Reference form: /ref/{token}. The owner sends each reference a private link; no sign-in needed.
// The page names the applicant, and the answers go only to the owner's desk (refResponses/{token}), which files them
// in the applicant's private record and marks that reference received. One response per link.
import { db, doc, getDoc, writeBatch } from "./fb.js";
import { $, esc, toast } from "./shared.js";
import { CONTACT_EMAIL } from "./config.js";

export const RATINGS = [["reliability", "Reliability"], ["flexibility", "Flexibility"], ["timeManagement", "Time management"], ["communication", "Communication skills"],
  ["responsibility", "Responsibility"], ["appearance", "Appearance"], ["disposition", "Disposition"]];
// The questions from the squad's reference check, worded around the applicant's first name.
export const refQuestions = f => [
  ["known", `How long have you known ${f}, and in what capacity?`, true],
  ["skills", `What are ${f}'s primary skills and qualities? Which areas could they improve on?`, true],
  ["getAlong", `How would you describe ${f}'s ability to get along with others?`, true],
  ["criticism", `How does ${f} handle constructive criticism?`, true],
  ["reservations", `Would you have any reservations about recommending ${f} as a volunteer of Potsdam Rescue?`, true],
  ["other", `Is there anything else you can tell us that might help us reach a decision?`, true],
  ["others", `Is there anyone else you feel we should talk to about ${f}? If so, please give us their contact information.`, false],
];
export const TRUST_Q = f => `Within Potsdam Rescue we deal with large amounts of personal information. Do you feel ${f} is trustworthy and would not disclose such information?`;

const R = { token: "", link: null, a: null, state: "loading", sending: false, wiz: 0 };
const KEY = () => "pvrsRef." + R.token;
const blank = () => ({ known: "", skills: "", getAlong: "", criticism: "", ratings: {}, trustworthy: "", reservations: "", other: "", others: "", signName: "" });
const today = () => new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
let saveT;
const saveNow = () => { try { if (R.state === "form") localStorage.setItem(KEY(), JSON.stringify(R.a)); } catch {} };
const save = () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 300); };

// The card fades in once; later redraws (a rating tap, say) must not replay it.
let shown = false;
const CREST = `<div class="refcrest" aria-hidden="true"><svg viewBox="-120 -120 240 240"><g fill="var(--navy)"><rect x="-24" y="-100" width="48" height="200" rx="7"/><rect x="-24" y="-100" width="48" height="200" rx="7" transform="rotate(60)"/><rect x="-24" y="-100" width="48" height="200" rx="7" transform="rotate(-60)"/></g><rect x="-5" y="-78" width="10" height="156" rx="5" fill="var(--red-fill)"/></svg><div class="eyebrow">Potsdam Volunteer Rescue Squad</div></div>`;
function card(inner){ const c = `<div class="applycard glass refcard${shown ? " noanim" : ""}">${inner}</div>`; shown = true; return c; }
function message(title, body){ return card(`${CREST}<div class="applyhead"><div><h1>${title}</h1></div></div><p class="lead2">${body}</p>`); }

function render(){
  const root = $("#refRoot"); if (!root) return;
  const L = R.link, f = L ? esc(L.first || "the applicant") : "", full = L ? esc(L.applicant || "the applicant") : "";
  if (R.state === "loading") { root.innerHTML = card(`<p class="lead2">Loading…</p>`); return; }
  if (R.state === "bad") { root.innerHTML = message("This link doesn't work", `It may have been copied incompletely. Please use the full link from the email we sent you, or contact <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.`); return; }
  if (R.state === "expired") { root.innerHTML = message("This link has expired", `Please contact <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a> and we'll send you a new one.`); return; }
  if (R.state === "already") { root.innerHTML = message("We already have your reference", `Thank you! Your reference for ${full} is with the PVRS Membership Committee. Questions? <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>`); return; }
  if (R.state === "done") {
    root.innerHTML = card(`${CREST}<div class="donemark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <h1>Thank you${R.a.signName ? ", " + esc(R.a.signName.split(" ")[0]) : ""}!</h1>
      <p class="lead2">Your reference for ${full} is with the Membership Committee. We appreciate your time.</p>`);
    return;
  }
  const a = R.a;
  const area = (k, label, req) => `<div class="af"><label for="rf-${k}">${label}${req ? ' <i aria-hidden="true">*</i>' : ' <span class="opt">optional</span>'}</label><textarea id="rf-${k}" data-r="${k}" rows="3" maxlength="4000">${esc(a[k] || "")}</textarea></div>`;
  const qs = refQuestions(f);
  const ratings = `<fieldset class="afs"><legend>Please rate ${f} on the following <i aria-hidden="true">*</i></legend>
        ${RATINGS.map(([k, label]) => `<div class="rate" data-rk="${k}"><span class="rl" id="rl-${k}">${label}</span><div class="rscale"><small aria-hidden="true">Poor</small><div class="choice" role="radiogroup" aria-labelledby="rl-${k}">
          ${[1,2,3,4,5].map(n => `<button type="button" role="radio" aria-checked="${a.ratings[k] === n}" aria-label="${label}: ${n} of 5" data-rate="${k}" data-v="${n}">${n}</button>`).join("")}</div><small aria-hidden="true">Excellent</small></div></div>`).join("")}
      </fieldset>
      <div class="af" data-rk="trustworthy"><span class="aflabel">${TRUST_Q(f)} <i aria-hidden="true">*</i></span><div class="choice" role="radiogroup" aria-label="Trustworthy with personal information">
        ${[["yes", "Yes"], ["no", "No"]].map(([v, t]) => `<button type="button" role="radio" aria-checked="${a.trustworthy === v}" data-trust="${v}">${t}</button>`).join("")}</div></div>`;
  const sign = `<div class="afgrid"><div class="af half"><label for="rf-signName">Your name <i aria-hidden="true">*</i></label><input id="rf-signName" data-r="signName" type="text" maxlength="200" autocomplete="name" value="${esc(a.signName || "")}"></div>
        <div class="af half"><span class="aflabel">Date</span><div class="rdate">${esc(today())}</div></div></div>`;
  // Phone: one question (or block) at a time. Desktop CSS shows every step at once.
  const steps = [
    ...qs.slice(0, 4).map(([k, label, req]) => area(k, label, req)),
    ratings,
    ...qs.slice(4).map(([k, label, req]) => area(k, label, req)),
    sign,
  ];
  const n = steps.length; R.wiz = Math.max(0, Math.min(R.wiz || 0, n - 1));
  root.innerHTML = card(`${CREST}<div class="applyhead"><div><div class="eyebrow">Reference check · about 5 minutes</div><h1>Reference for ${full}</h1></div></div>
    <p class="lead2">${L.refName ? `Hi ${esc(String(L.refName).split(" ")[0])}, ` : ""}${full} has applied to volunteer with the Potsdam Volunteer Rescue Squad and listed you as a reference. Your answers go only to the Membership Committee; ${f} won't see them.</p>
    <form class="applybody refwiz" id="refForm" novalidate>
      <input type="text" id="rf-hp" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp">
      <div class="rwprog">Step ${R.wiz + 1} of ${n}</div>
      ${steps.map((html, i) => `<div class="rwstep${i === R.wiz ? " on" : ""}" data-rw="${i}">${html}</div>`).join("")}
      <div class="aperr" id="rfErr" role="alert" hidden></div>
      <div class="applyfoot rwnav">${R.wiz ? `<button type="button" class="btn" data-rwback>← Back</button>` : `<span></span>`}
        ${R.wiz < n - 1 ? `<button type="button" class="btn primary" data-rwnext>Continue →</button>` : `<button type="submit" class="btn primary" ${R.sending ? "disabled" : ""}>${R.sending ? "Sending…" : "Send reference"}</button>`}</div>
      <div class="applyfoot" style="display:none" id="rwDeskSubmit"><span></span><button type="submit" class="btn primary" ${R.sending ? "disabled" : ""}>${R.sending ? "Sending…" : "Send reference"}</button></div>
    </form>
    <p class="applyfine">Required fields are marked <i>*</i>. Draft saves on this device. <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a></p>`);
}

function problems(){
  const a = R.a, f = (R.link && R.link.first) || "the applicant", out = [];
  for (const [k, label, req] of refQuestions(f)) if (req && !String(a[k] || "").trim()) out.push({ k, msg: label.replace(/\?.*$/, "?") });
  const missing = RATINGS.filter(([k]) => !a.ratings[k]).map(([, l]) => l);
  if (missing.length) out.push({ k: "rate:" + RATINGS.find(([k]) => !a.ratings[k])[0], msg: `Rate: ${missing.join(", ")}` });
  if (!a.trustworthy) out.push({ k: "trustworthy", msg: "Answer the question about personal information." });
  if (String(a.signName || "").trim().length < 2) out.push({ k: "signName", msg: "Type your name." });
  return out;
}
function showErrors(list){
  const box = $("#rfErr"); document.querySelectorAll("#refForm .bad").forEach(el => el.classList.remove("bad"));
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false; box.innerHTML = `<b>Please answer ${list.length === 1 ? "this" : "these"}:</b><ul>${list.map(x => `<li>${esc(x.msg)}</li>`).join("")}</ul>`;
  const el0 = k => k.startsWith("rate:") ? document.querySelector(`.rate[data-rk="${k.slice(5)}"]`) : k === "trustworthy" ? document.querySelector('[data-rk="trustworthy"]') : document.querySelector(`[data-r="${k}"]`);
  list.forEach(x => { const el = el0(x.k); if (el) (el.closest(".af") || el).classList.add("bad"); });
  const first = el0(list[0].k); if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
}
async function send(){
  if ($("#rf-hp") && $("#rf-hp").value) { R.state = "done"; return render(); }   // bots fill hidden fields
  const list = problems(); showErrors(list); if (list.length) return;
  const a = R.a, s = v => String(v || "").trim().slice(0, 4000);
  const answers = { known: s(a.known), skills: s(a.skills), getAlong: s(a.getAlong), criticism: s(a.criticism), ratings: { ...a.ratings }, trustworthy: a.trustworthy,
    reservations: s(a.reservations), other: s(a.other), others: s(a.others), signName: s(a.signName).slice(0, 200), signDate: new Date().toISOString().slice(0, 10) };
  R.sending = true; render();
  try {
    const now = Date.now(), b = writeBatch(db);
    b.set(doc(db, "refResponses", R.token), { v: 1, answers, submittedAt: now, hp: "" });
    b.update(doc(db, "refLinks", R.token), { submittedAt: now });
    await b.commit();
    try { localStorage.removeItem(KEY()); } catch {}
    R.state = "done"; R.sending = false; render(); const g = $("#reference"); if (g) g.scrollTop = 0;
  } catch (e) {
    console.error(e); R.sending = false; render(); toast(`Couldn't send your reference. Check your connection and try again, or email ${CONTACT_EMAIL}.`);
  }
}

let bound = false;
function bind(){
  if (bound) return; bound = true;
  const root = $("#refRoot");
  addEventListener("pagehide", saveNow);
  root.addEventListener("input", e => { const k = e.target.dataset && e.target.dataset.r; if (k) { R.a[k] = e.target.value; save(); } });
  root.addEventListener("click", e => {
    const r = e.target.closest("[data-rate]"); if (r) { R.a.ratings[r.dataset.rate] = +r.dataset.v; save(); render(); return; }
    const t = e.target.closest("[data-trust]"); if (t) { R.a.trustworthy = t.dataset.trust; save(); render(); return; }
    if (e.target.closest("[data-rwnext]")) { R.wiz = (R.wiz || 0) + 1; saveNow(); render(); const g = $("#reference"); if (g) g.scrollTop = 0; return; }
    if (e.target.closest("[data-rwback]")) { R.wiz = Math.max(0, (R.wiz || 0) - 1); render(); const g = $("#reference"); if (g) g.scrollTop = 0; }
  });
  root.addEventListener("submit", e => { e.preventDefault(); send(); });
}

export async function startReference(token){
  bind();
  if (R.token === token && R.state !== "loading") return render();
  R.token = token; R.state = "loading"; render();
  try {
    const s = /^[A-Za-z0-9_-]{16,64}$/.test(token) ? await getDoc(doc(db, "refLinks", token)) : null;
    if (!s || !s.exists()) R.state = "bad";
    else {
      R.link = s.data();
      if (R.link.submittedAt) R.state = "already";
      else if ((R.link.expiresAt || 0) < Date.now()) R.state = "expired";
      else {
        let d = null; try { d = JSON.parse(localStorage.getItem(KEY()) || "null"); } catch {}
        R.a = Object.assign(blank(), d || {}, { ratings: { ...((d && d.ratings) || {}) } });
        if (!R.a.signName && R.link.refName) R.a.signName = R.link.refName;
        R.state = "form";
      }
    }
  } catch (e) { console.error(e); R.state = "bad"; }
  render();
}
