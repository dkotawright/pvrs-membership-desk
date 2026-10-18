// Staff Desk: roster, applicant file, board, onboarding, interview times, settings.
import { auth, db, storage, doc, collection, collectionGroup, setDoc, deleteDoc, addDoc, getDocs, onSnapshot, writeBatch,
  sendSignInLinkToEmail, ref, getDownloadURL, deleteObject, signOut } from "./fb.js";
import { $, esc, get, isObj, merge, clone, nest, today, fmtDate, longDate, daysSince, ago, first, loc, lower, toast, copyText,
  openModal, closeModal, download, slotDay, slotTime, slotLong, TYPES, TYPE_INFO, SECURE, DOC_ITEMS, MILESTONES, STAGES, stageVar,
  progress, inBoardQueue, nextReview, onProbation, applicantSteps, checkSVG, icsFile, refList } from "./shared.js";
import { portalHTML } from "./portal.js";
import { OWNER_EMAIL, CONTACT_EMAIL, PIN_HASH } from "./config.js";

/* ---------- form builders ---------- */
const fid = k => "f-" + k.replace(/\./g, "-");
const segBtns = opts => opts.map(o => `<button type="button" data-v="${esc(o[0])}" class="${o[2]||""}">${esc(o[1])}</button>`).join("");
const F = {
  text:(k,l,ph="",t="text") => `<label class="row"><span class="lbl">${l}</span><input id="${fid(k)}" data-k="${k}" type="${t}" placeholder="${esc(ph)}" autocomplete="off"></label>`,
  date:(k,l) => `<label class="row"><span class="lbl">${l}</span><input id="${fid(k)}" data-k="${k}" type="date" required></label>`,
  init:(k,l="Initials") => `<label class="row"><span class="lbl">${l}</span><input class="init" id="${fid(k)}" data-k="${k}" type="text" maxlength="4" placeholder="—" autocomplete="off"></label>`,
  yn:(k,l,noBad=false,sub="") => `<div class="row"><span class="lbl">${l}${sub?`<small>${sub}</small>`:""}</span><div class="seg" data-k="${k}" role="group" aria-label="${esc(l)}">${segBtns([["yes","Yes","good"],["no","No",noBad?"bad":""]])}</div></div>`,
  ynBadYes:(k,l) => `<div class="row"><span class="lbl">${l}</span><div class="seg" data-k="${k}" role="group" aria-label="${esc(l)}">${segBtns([["no","No","good"],["yesbad","Yes","bad"]])}</div></div>`,
  seg:(k,l,opts,wide) => `<div class="row ${wide?"stack":""}"><span class="lbl">${l}</span><div class="seg ${wide?"wide":""}" data-k="${k}" role="group" aria-label="${esc(l)}">${segBtns(opts)}</div></div>`,
  area:(k,l,ph="") => `<label class="row stack"><span class="lbl">${l}</span><textarea id="${fid(k)}" data-k="${k}" rows="2" placeholder="${esc(ph)}"></textarea></label>`,
  note:(t,cls="") => `<div class="note ${cls}">${t}</div>`,
};
const group = (title, rows, show, extra="") => `<section class="group"${show?` data-show="${show}"`:""}><h3><span>${title}</span>${extra}</h3><div class="ios">${rows.join("")}</div></section>`;

const SHOW = {
  incomplete: a => get(a,"app.complete") === "no",
  otherOrg:   a => get(a,"iv.otherOrg") === "yes",
  college:    a => get(a,"iv.college") === "yes",
  driving:    a => get(a,"iv.driving") === "yesbad",
  convicted:  a => get(a,"iv.convicted") === "yesbad",
  nonop:      a => a.type === "Non-Operational",
  emtYes:     a => get(a,"iv.isEmt") === "yes",
  emtNo:      a => ["no","lapsed"].includes(get(a,"iv.isEmt")),
  emtStateOther: a => get(a,"iv.emtState") === "other",
  emtClassOther: a => get(a,"iv.emtClass") === "other",
  otherOrgCurrentOther: a => get(a,"iv.otherOrgCurrent") === "other",
  dlBad:      a => get(a,"dl.valid") === "no",
  locOther:   a => a.location === "other",
  availOther: a => get(a,"iv.avail") === "other",
  residentOther: a => get(a,"iv.resident") === "other",
};

const TABS_ADMIN = [["app","Application"],["screen","Screening"],["refs","References"],["iv","Interview"],["board","Board"],["onb","Onboard"],["notes","Notes"]];
const TABS_MEMBER = [["app","Application"],["iv","Interview"]];

function tabHTML(tab){
  const admin = S.admin;
  if (tab === "app") return `<div class="cols">
    ${group("Applicant",[F.text("name","Full name","First Last"),F.text("phone","Phone","(315) 555-0100","tel"),F.text("email","Email","name@example.com","email"),
      F.seg("type","Membership type",TYPES.map(t=>[t,t]),true),`<div class="note" id="typeNote"></div>`,F.seg("location","Location",[["Potsdam","Potsdam"],["other","Other"]]),`<div data-show="locOther">${F.text("locationOther","Where?","Town")}</div>`])}
    ${group("Application",[F.date("app.received","Date received"),F.init("app.receivedInit"),F.yn("app.complete","Complete?",true)])}
    ${group("Incomplete application",[F.date("app.notified","Date notified"),F.date("app.returned","Date app returned"),F.date("app.reReceived","Date re-received")],"incomplete")}
    ${admin ? group("Applicant portal",[
      `<div class="row"><span class="lbl">Portal access<small id="portalStatus">—</small></span><button class="btn small primary" type="button" data-act="invite" id="inviteBtn">Send invite</button></div>`,
      F.yn("portal.bookingOpen","Let them book an interview",false,"Shows your open interview times in their portal"),
      `<div class="row"><span class="lbl">Applicant view<small>What they see when they sign in</small></span><button class="btn small" type="button" data-act="preview">Preview</button></div>`]) : ""}
    ${admin ? `<section class="group"><h3><span>Documents</span><button class="btn small" type="button" data-act="docs">Request documents</button></h3><div class="ios" id="docList"></div></section>` : ""}
  </div>`;
  if (tab === "screen") return `<div class="cols">
    ${group("MVR",[F.init("mvr.requestInit","Request initials"),F.date("mvr.completed","Date completed"),F.ynBadYes("mvr.violations","Violations?")])}
    ${group("Driver's license check",[F.note("Verify the physical license in person. Don't record the license number here."),
      F.date("dl.date","Date verified"),F.text("dl.state","Issuing state","NY"),F.text("dl.class","Class","D"),F.date("dl.expires","Expiration date"),
      F.yn("dl.valid","Valid and unrestricted?",true),F.init("dl.init","Verified by (initials)")])}
    ${group("License issue",[F.area("dl.issue","What's the issue?","Restriction, suspension, expired…")],"dlBad")}
  </div>`;
  if (tab === "refs") return `<div class="refsum" id="refSummary"></div>
  <div class="cols">${[1,2,3,4].map(i => `<section class="group ref"><h3><span class="refh">Reference ${i}</span><span class="badge" id="refBadge${i}"></span></h3><div class="ios">${[
      F.text(`refs.r${i}.name`,"Name","Full name"),
      `<div class="row"><span class="lbl">Reference received<small id="refRcv${i}">—</small></span><button class="btn small" type="button" data-refrcv="${i}" id="refBtn${i}">Mark received</button></div>`,
      F.text(`refs.r${i}.email`,"Email","name@example.com","email"),F.date(`refs.r${i}.contacted`,"Date contacted"),
      F.seg(`refs.r${i}.method`,"Method",[["Phone","Phone"],["Email","Email"],["Text","Text"]]),F.date(`refs.r${i}.returned`,"Date received"),F.init(`refs.r${i}.init`)].join("")}</div></section>`).join("")}
  </div>`;
  if (tab === "iv") return `<div class="cols">
    ${group("Scheduling",[
      `<div class="row"><span class="lbl">Booked time<small id="bookedEcho">—</small></span><span id="bookedActs" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"></span></div>`,
      F.date("sched.contacted","Applicant contacted"),F.date("sched.scheduled","Interview date (if not booked above)"),F.text("sched.time","Interview time","6:30 PM"),F.date("sched.completed","Interview completed"),F.init("sched.completedInit","Completed by (initials)")])}
    ${group("Who was at the interview",[F.note("Committee members who sat in on the interview. Matches the panel on the completed interview intake."),
      ...[1,2,3,4,5].map(i => `<div class="row panel"><span class="lbl">${i}</span><input type="text" id="f-iv-panel-m${i}" data-k="iv.panel.m${i}" placeholder="First and last name" autocomplete="off" aria-label="Interviewer ${i}"><input class="init" type="text" id="f-iv-panel-i${i}" data-k="iv.panel.i${i}" maxlength="4" placeholder="Init." autocomplete="off" aria-label="Interviewer ${i} initials"></div>`)],"",`<small id="panelCount" style="font-weight:500;color:var(--fg3)"></small>`)}
  </div>
  <div class="cols">
    ${group("About the applicant",[
      F.area("iv.about","5. Tell us a bit about yourself"),F.area("iv.hobbies","6. What are your hobbies and/or interests?"),
      F.yn("iv.college","7. Are you a college student?"),
      `<div data-show="college">${F.text("iv.collegeWhere","8. Where, and expected graduation date?","SUNY Potsdam, May 2028")}</div>`,
      F.seg("iv.avail","9. Here year round or during school only?",[["year","Year round"],["semester","Semester only"],["other","Other"]],true),
      `<div data-show="availOther">${F.text("iv.availOther","Other","")}</div>`,
      F.seg("iv.resident","10. Permanent Potsdam resident?",[["yes","Yes","good"],["no","No"],["other","Other"]]),
      `<div data-show="residentOther">${F.text("iv.residentOther","Other","")}</div>`])}
    ${group("EMS questions",[
      F.area("iv.why","11. What made you interested in joining PVRS?"),F.area("iv.knowsMembers","12. Do you know any other members of the squad?"),
      F.yn("iv.otherOrg","13. Member of another fire/rescue organization?")])}
    ${group("Past experience",[F.text("iv.otherOrgWhere","14. Where were you previously a member?","Agency"),
      F.seg("iv.otherOrgCurrent","15. Are you still a member there?",[["yes","Yes"],["no","No"],["other","Other"]]),
      `<div data-show="otherOrgCurrentOther">${F.text("iv.otherOrgCurrentOther","Other","")}</div>`,
      F.area("iv.refsFromOrgWhy","16. Are any of your references from there? Why or why not?"),
      F.area("iv.pastExperience","17. How did your past experiences go with the agencies?")],"otherOrg")}
    ${group("Certification status",[F.seg("iv.isEmt","18. Are you currently an EMT?",[["yes","Yes","good"],["no","No"],["lapsed","Lapsed/Expired","warn"]],true)])}
    ${group("Current EMTs / Medics",[
      F.seg("iv.emtState","19. In what state are you licensed?",[["NY","NY"],["other","Other"]]),
      `<div data-show="emtStateOther">${F.text("iv.emtStateOther","State","")}</div>`,
      F.text("iv.emtYears","20. How long have you been an EMT?","2 years"),
      F.area("iv.emtStrengths","21. What do you feel your strengths are as an EMT?"),
      F.area("iv.emtImprove","22. What areas of growth do you see in your skills?")],"emtYes")}
    ${group("Currently uncertified",[F.note("Potsdam Rescue requires all new members to become enrolled in EMT class within the first year of membership. The squad will pay for the training as long as you remain an active member for at least one year after completing the training."),
      F.seg("iv.emtClass","23. Can you realistically take an EMT class within the next 12 months?",[["yes","Yes","good"],["no","No","bad"],["other","Other"]],true),
      `<div data-show="emtClassOther">${F.text("iv.emtClassOther","Other","")}</div>`,
      F.area("iv.emtChallenge","24. What would be the biggest challenge for you to take the class?")],"emtNo")}
    ${group("General questions",[
      F.area("iv.volunteer","25. What other types of volunteer work have you done?"),
      F.area("iv.stress","26. Our volunteers are sometimes involved in very intense or difficult situations. How do you prefer to decompress after a stressful situation?"),
      F.area("iv.concerns","27. Many situations don't have one “right” approach. If you had questions or concerns about how part of a call was handled, how would you likely handle that?"),
      F.ynBadYes("iv.driving","28. Any restrictions or citations on your driving record?"),
      `<div data-show="driving">${F.area("iv.drivingExplain","Explain")}</div>`,
      F.ynBadYes("iv.convicted","29. Have you ever been convicted of a crime?"),
      `<div data-show="convicted">${F.area("iv.convictedExplain","Explain")}</div>`])}
    ${group("Non-operational members",[F.note("Shown because the membership type is Non-Operational (question 30)."),
      F.area("iv.nonopSkills","31. You won't be assigned to a duty crew. What specific skills and/or experience do you have that would be useful at PVRS?"),
      F.yn("iv.nonopCommittees","32. You can only serve on certain committees (Membership, Fundraising). Could you contribute to one or more?")],"nonop")}
    ${group("Wrap-up",[
      F.area("iv.addlExplain","33. Any other skills/qualifications relevant to your role at Potsdam Rescue?"),
      F.area("iv.more","34. Anything else you'd like to share, or any questions?")])}
    ${group("Membership requirements",[F.note("Read to the applicant:<br>• Complete orientation, including required medical documentation and online education, in a timely manner<br>• Duty crew: self-schedule at least 4 shifts per month<br>• Attend monthly membership meetings (in person or Zoom) on the 2nd Tuesday unless excused in advance<br>• Monthly training is offered and all members are encouraged to participate"),
      F.yn("iv.understands","35. Do you understand these requirements?",true),F.yn("iv.ableToMeet","36. Do you feel you are able to meet them?",true)])}
    ${group("Next steps",[F.note("Tell the applicant:<br>• Their application goes to the next board meeting once their references and other prerequisites are complete. Tell them when the next board meeting is.<br>• They'll hear whether they're accepted within about 1 week of the board meeting.<br>• If accepted, they start on probation. It's reviewed every 3 months and ends when the board approves them as a full member.<br>• Turning in orientation paperwork on time and attending meetings and duty crews helps them pass probation.<br>• If the board approves them, the next step is a background check through Sterling Volunteers."),
      F.yn("iv.nextStepsReviewed","Next steps reviewed with applicant")])}
    ${admin?group("Committee decision",[F.yn("appr.committee","Committee approval",true)]):""}
  </div>`;
  if (tab === "board") return `<div class="cols">
    ${group("Membership committee",[`<div class="note warn" id="boardRefNote" hidden></div>`,F.yn("appr.committee","Committee approval",true),F.date("appr.chairNotified","Membership chair notified")])}
    ${group("Board vote",[F.date("board.date","Board meeting date"),F.text("board.motion","Motion by","Name"),F.text("board.second","Seconded by","Name"),
      `<div class="row"><span class="lbl">Vote</span><div class="tally">
        <label>For<input type="number" min="0" inputmode="numeric" id="f-board-for" data-k="board.for" placeholder="0"></label>
        <label>Against<input type="number" min="0" inputmode="numeric" id="f-board-against" data-k="board.against" placeholder="0"></label>
        <label>Abstain<input type="number" min="0" inputmode="numeric" id="f-board-abstain" data-k="board.abstain" placeholder="0"></label></div></div>`,
      F.seg("board.result","Result",[["approved","Approved","good"],["tabled","Tabled","warn"],["denied","Denied","bad"]],true),
      F.note("Tabled keeps the applicant in the board queue for the next meeting.")])}
    ${group("Board notes",[F.area("board.notes","Discussion or conditions","Anything the board attached to the approval")])}
    ${group("Board packet",[`<div class="row"><span class="lbl">Print this applicant's page<small>Checks, interview summary, committee decision and a blank vote record</small></span><button class="btn small" type="button" data-act="packet">Print</button></div>`])}
  </div>`;
  if (tab === "onb") return `<div class="cols">
    ${group("Background check · Sterling Volunteers",[F.note("Run after the board approves the applicant. Sterling Volunteers runs the full background check."),F.date("bg.sterReq","Date requested"),F.date("bg.sterDone","Date completed"),
      F.seg("bg.sterResult","Result",[["clear","Clear","good"],["review","Needs review","bad"]],true),F.init("bg.sterInit")])}
    ${group("Notifications",[F.date("notify.applicant","Applicant notified"),F.init("notify.applicantInit"),F.date("notify.orientation","Orientation chair notified")])}
    ${group("Duty crew",[`<div class="row"><span class="lbl">Applicant phone<small id="phoneEcho">—</small></span><button class="copy" type="button" data-copy="phone">Copy</button></div>`,F.date("notify.chief","Chief notified"),F.init("notify.chiefInit")])}
    ${group("Probation",[F.note("Reviewed every 3 months. Probation ends when the board approves full membership."),F.date("notify.probStart","Probation start"),
      `<div class="row"><span class="lbl">Next 3-month review</span><span id="probEnd" style="color:var(--fg2)">—</span></div>`,
      F.date("notify.probLastReview","Last review date"),F.date("notify.probEnd","Board approved full membership")])}
    ${group("Email account",[`<div class="row"><span class="lbl">Applicant email<small id="emailEcho">—</small></span><button class="copy" type="button" data-copy="email">Copy</button></div>`,F.date("notify.tech","Technology chair notified"),F.init("notify.techInit")])}
  </div>
  <section class="group" style="margin-top:18px"><h3><span>Full checklist</span></h3><div class="ios" id="miles"></div></section>`;
  if (tab === "notes") return `<div class="cols">
    ${group("Admin notes",[`<label class="row stack"><span class="lbl">Only admins see these</span><textarea id="f-notes" data-k="notes" rows="10" placeholder="Anything about this applicant that should stay off the member view"></textarea></label>`])}
    ${group("Status",[F.seg("status","Override",[["open","In process"],["hold","On hold","warn"],["declined","Declined","bad"],["withdrawn","Withdrawn"]],true),
      F.note("“In process” lets the checklist set the stage automatically.")])}
    <section class="group"><h3><span>Change history</span><small id="histNote" style="font-weight:500;color:var(--fg3)">Every edit, by whom and when</small></h3><div class="ios hist" id="histList"></div></section>
    <section class="group"><h3><span>Remove</span></h3><div class="ios"><div class="row"><span class="lbl">Delete this applicant, their portal and uploads</span><button class="btn small danger" type="button" id="delBtn">Delete</button></div>
      <div class="row" id="delConfirm" hidden><span class="lbl">This can't be undone.</span><button class="btn small" type="button" id="delCancel">Cancel</button><button class="btn small danger" type="button" id="delYes">Delete permanently</button></div></div></section>
  </div>`;
  return "";
}

/* ---------- state ---------- */
const S = { shared:new Map(), secure:new Map(), apps:new Map(), portal:new Map(), slots:new Map(), staff:new Map(), files:[], hist:[], feedFiles:[],
  sel:null, tab:"app", filter:"all", q:"", admin:false, owner:false, me:"", settings:{}, unlocked:false, ready:false };
const pending = {}, inflight = {}, timers = {};
let filesUnsub = null;

const sig = () => { const s = S.settings.signature || "[Your name]"; return /Potsdam Volunteer Rescue/i.test(s) ? s : s + "\nPotsdam Volunteer Rescue Squad"; };
const personName = email => { if (!email) return ""; if (email === S.me) return "you"; const st = S.staff.get(email); return (st && st.name) || email.split("@")[0]; };
const slotFor = id => [...S.slots.values()].find(s => s.bookedBy === id) || null;
const linkSettings = () => ({ url: location.origin + "/", handleCodeInApp: true });

function rebuild(id){
  const p = S.shared.get(id); if (!p) { S.apps.delete(id); return; }
  const a = merge(clone(p), clone(S.secure.get(id) || {})); a._id = id;
  const s = slotFor(id); a._booked = s ? { start: s.start, location: s.location || "", duration: s.duration || null, slotId: s.id } : null;
  S.apps.set(id, a);
}
function rebuildAll(){ S.apps = new Map(); for (const id of S.shared.keys()) rebuild(id); }
function view(a){
  if (S.admin) return progress(a);
  const st = STAGES[a.stage] ? a.stage : "open";
  return { stage: st, n: null };
}

/* ---------- roster ---------- */
const IN_PROCESS = ["screen","open","int","appr","onb"];
const initials = n => { const w = (n || "").trim().split(/\s+/).filter(Boolean); return ((w[0]||"?")[0] + (w.length > 1 ? w[w.length-1][0] : "")).toUpperCase(); };
// Overview tiles open these extra filters; they aren't listed in the sidebar.
const PSEUDO = {
  inproc:    { label: "In process", test: (a,p) => IN_PROCESS.includes(p.stage) },
  ivweek:    { label: "Interviews this week", test: a => !!a._booked && a._booked.start > Date.now() - 2*36e5 && a._booked.start < Date.now() + 7*864e5 },
  probation: { label: "Probation reviews due", test: a => { if (!onProbation(a)) return false; const d = nextReview(a); return !!d && d.getTime() < Date.now() + 30*864e5; } },
};
const filterLabel = k => k==="all" ? "All applicants" : k==="board" ? "Board queue" : PSEUDO[k] ? PSEUDO[k].label : STAGES[k].label;
const filterColor = k => k==="all" ? "var(--fg3)" : k==="board" ? "var(--s-appr)" : stageVar(k);
const shortDate = d => d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
const hl = (text, q) => { const s = esc(text); if (!q) return s; const i = String(text).toLowerCase().indexOf(q); return i < 0 ? s : esc(text.slice(0,i)) + `<mark>${esc(text.slice(i, i+q.length))}</mark>` + esc(text.slice(i+q.length)); };
const SORTS = {
  name:    (x,y) => (x.a.name||"").localeCompare(y.a.name||""),
  newest:  (x,y) => String(get(y.a,"app.received")||"").localeCompare(String(get(x.a,"app.received")||"")),
  waiting: (x,y) => String(get(x.a,"app.received")||"9").localeCompare(String(get(y.a,"app.received")||"9")),
  updated: (x,y) => Math.max(y.a.updatedAt||0, y.a.secUpdatedAt||0) - Math.max(x.a.updatedAt||0, x.a.secUpdatedAt||0),
};
function sorted(){
  const order = {screen:1,open:1,int:2,appr:3,onb:4,hold:5,act:6,dec:7,wd:8};
  return [...S.apps.values()].map(a => ({a, p:view(a)}))
    .sort((x,y) => (order[x.p.stage]-order[y.p.stage]) || String(get(x.a,"app.received")||"").localeCompare(String(get(y.a,"app.received")||"")) || (x.a.name||"").localeCompare(y.a.name||""));
}
function renderChips(rows){
  const counts = {all:rows.length, board:0}; rows.forEach(r => { counts[r.p.stage] = (counts[r.p.stage]||0)+1; if (S.admin && inBoardQueue(r.a)) counts.board++; });
  const base = S.admin ? ["all","board","screen","int","appr","onb","act","hold","dec","wd"] : ["all","screen","int","appr","onb","act","hold","dec","wd","open"];
  const keys = base.filter(k => k==="all" || k==="board" || counts[k] || (S.admin && ["screen","int","appr","onb"].includes(k)));
  if (!keys.includes(S.filter) && !PSEUDO[S.filter]) S.filter = "all";
  $("#chips").innerHTML = keys.map(k => `<button class="nav-i" type="button" data-f="${k}" aria-pressed="${S.filter===k}" style="--stage-c:${filterColor(k)}"><span class="ndot"></span><span class="nl">${k==="all"?"All":filterLabel(k)}</span><b>${counts[k]||0}</b></button>`).join("");
  $("#chipsMini").innerHTML = keys.map(k => `<button class="chip" type="button" data-f="${k}" aria-pressed="${S.filter===k}">${k==="all"?"All":filterLabel(k)} <b>${counts[k]||0}</b></button>`).join("");
  $("#agendaBtn").hidden = $("#packetBtn").hidden = !(S.admin && counts.board);
  $("#rosterTitle").textContent = filterLabel(S.filter);
  S.counts = counts;
}
function renderList(){
  const fk = focusKey();
  try { paintList(); } finally { restoreFocus(fk); }
}
function paintList(){
  const rows = sorted(); renderChips(rows);
  const q = S.q.trim().toLowerCase(), qd = q.replace(/\D/g, "");
  const match = a => !q || (a.name||"").toLowerCase().includes(q) || lower(a.email).includes(q) || (qd.length >= 3 && String(a.phone||"").replace(/\D/g,"").includes(qd));
  const inFilter = r => S.filter==="all" || (S.filter==="board" ? inBoardQueue(r.a) : PSEUDO[S.filter] ? PSEUDO[S.filter].test(r.a, r.p) : r.p.stage===S.filter);
  const vis = rows.filter(r => inFilter(r) && match(r.a));
  if (SORTS[S.sort]) vis.sort((x,y) => SORTS[S.sort](x,y) || (x.a.name||"").localeCompare(y.a.name||""));
  S.vis = vis.map(r => r.a._id);
  $("#rosterCount").textContent = S.ready ? (vis.length === rows.length ? String(rows.length) : `${vis.length} of ${rows.length}`) : "";
  const L = $("#list");
  if (!S.sel) renderOverview();
  if (!S.ready) { L.innerHTML = `<div class="empty"><span class="spin" aria-hidden="true"></span><h3>Loading roster…</h3></div>`; return; }
  if (!rows.length) { L.innerHTML = `<div class="empty"><h3>No applicants yet</h3>When an application comes in, click <strong>New applicant</strong> or press <kbd>N</kbd> to start their file.</div>`; return; }
  if (!vis.length) { L.innerHTML = `<div class="empty"><h3>${S.filter==="board"&&!q?"Board queue is empty":"No matches"}</h3>${S.filter==="board"&&!q?"Applicants show up here once the committee approves them.":q?`Nothing matches “${esc(S.q.trim())}”${S.filter!=="all"?` in ${esc(filterLabel(S.filter))}`:""}.`:"Try a different stage."}</div>`; return; }
  L.innerHTML = vis.map(({a,p}) => {
    const d = daysSince(get(a,"app.received"));
    const iv = a._booked ? `${slotDay(a._booked.start)} · ${slotTime(a._booked.start)}` : get(a,"sched.scheduled") ? `${fmtDate(get(a,"sched.scheduled"))}${get(a,"sched.time")?" · "+get(a,"sched.time"):""}` : "";
    const rv = S.admin && p.stage === "act" && onProbation(a) ? nextReview(a) : null;
    const nextLine = S.admin
      ? (rv ? `On probation · review <strong>${esc(shortDate(rv))}</strong>` : p.next ? `Next: <strong>${esc(p.next)}</strong>` : "All steps complete")
      : (get(a,"sched.completed") ? "Interview completed" : iv ? `Interview: <strong>${esc(iv)}</strong>` : "Interview not scheduled yet");
    const inProc = d != null && IN_PROCESS.includes(p.stage);
    return `<button class="arow" type="button" data-id="${esc(a._id)}" aria-current="${S.sel===a._id}" style="--stage-c:${stageVar(p.stage)}">
      <span class="av" aria-hidden="true">${esc(initials(a.name))}</span>
      <span class="ab">
        <span class="r1"><span class="nm">${hl(a.name||"Unnamed applicant", q)}</span><span class="pill">${STAGES[p.stage].label}</span></span>
        <span class="meta">${[a.type,loc(a),inProc?`${d} day${d===1?"":"s"}`:null].filter(Boolean).map(esc).join(" · ")||"Details not entered"}</span>
        <span class="next">${nextLine}</span>
        ${S.admin?`<span class="bar" title="${p.n} of ${MILESTONES.length} steps"><span style="width:${(p.n/MILESTONES.length*100).toFixed(1)}%"></span></span>`:""}
      </span>
    </button>`;
  }).join("");
}

// Re-rendering with innerHTML destroys the focused element. Find its replacement by its data-* key.
const FOCUS_KEYS = ["id","f","tab","act","step","open","filter","cmd"];
function focusKey(){
  const el = document.activeElement; if (!el || el === document.body || !el.dataset) return null;
  const k = FOCUS_KEYS.find(x => el.dataset[x] != null); if (!k) return null;
  const box = el.closest("[id]");
  return { box: box ? box.id : null, sel: `[data-${k}="${CSS.escape(el.dataset[k])}"]`, el };
}
function restoreFocus(fk){
  if (!fk || fk.el.isConnected) return;
  const root = (fk.box && document.getElementById(fk.box)) || document;
  const el = root.querySelector(fk.sel); if (el) el.focus({ preventScroll: true });
}

/* ---------- overview (nothing selected) ---------- */
function renderOverview(){
  const D = $("#detail"); if (!D || S.sel) return;
  $("#app").classList.remove("open");
  $("#overviewBtn").classList.add("on");
  const keepScroll = D.querySelector(".ov")?.scrollTop || 0;
  if (!S.ready) { D._ovHTML = ""; D.innerHTML = `<div class="empty"><span class="spin" aria-hidden="true"></span><h3>Loading…</h3></div>`; return; }
  const rows = sorted(), now = Date.now(), wk = now + 7*864e5;
  const c = S.counts || {};
  const inProc = rows.filter(r => IN_PROCESS.includes(r.p.stage));
  const booked = [...S.slots.values()].filter(s => s.bookedBy && s.start > now - 2*36e5 && S.apps.has(s.bookedBy)).sort((x,y) => x.start - y.start);
  const thisWeek = booked.filter(s => s.start < wk).length;
  const hour = new Date().getHours(), greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const reviews = S.admin ? rows.filter(r => onProbation(r.a)).map(r => ({ r, d: nextReview(r.a) })).filter(x => x.d).sort((x,y) => x.d - y.d) : [];
  const due30 = reviews.filter(x => x.d.getTime() < now + 30*864e5).length;
  const tile = (k, v, s, f, color) => `<button class="tile" type="button" data-filter="${f}" style="--stage-c:${color}"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></button>`;
  const order = ["screen","int","appr","onb","act","hold","dec","wd"].filter(k => c[k]);
  const total = order.reduce((n,k) => n + c[k], 0);
  const oitem = (a, right, sub) => `<button class="oitem" type="button" data-open="${esc(a._id)}"><span class="av" style="--stage-c:${stageVar(view(a).stage)}" aria-hidden="true">${esc(initials(a.name))}</span><span class="ot"><b>${esc(a.name||"Unnamed applicant")}</b><small>${sub}</small></span><span class="when">${right}</span></button>`;
  const ivList = booked.slice(0,6).map(s => { const a = S.apps.get(s.bookedBy); const d = new Date(s.start);
    return oitem(a, `<b>${esc(d.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}))}</b>${esc(slotTime(s.start))}`, esc([a.type, s.location].filter(Boolean).join(" · ") || "Interview")); }).join("");
  const waiting = inProc.filter(r => get(r.a,"app.received")).sort((x,y) => String(get(x.a,"app.received")).localeCompare(String(get(y.a,"app.received")))).slice(0,6)
    .map(({a,p}) => { const d = daysSince(get(a,"app.received")); return oitem(a, `<b>${d}d</b>waiting`, S.admin && p.next ? "Next: " + esc(p.next) : esc(STAGES[p.stage].label)); }).join("");
  const revList = reviews.slice(0,6).map(({r,d}) => oitem(r.a, `<b>${esc(d.toLocaleDateString(undefined,{month:"short",day:"numeric"}))}</b>${Math.max(0, Math.round((d - now)/864e5))}d`, "Probation started " + esc(fmtDate(get(r.a,"notify.probStart"))))).join("");
  const html = `<div class="ov"><div class="ovin">
    <div class="ovhead"><div class="eyebrow">${esc(new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}))}</div>
      <h2>${greet}${S.name ? ", " + esc(first(S.name)) : ""}</h2>
      <p>${rows.length ? `${inProc.length} applicant${inProc.length===1?"":"s"} in process${S.admin && c.board ? `, ${c.board} waiting on the board` : ""}${thisWeek ? `, ${thisWeek} interview${thisWeek===1?"":"s"} this week` : ""}.` : "No applicants yet. Press N or click New applicant to start a file."}</p></div>
    <div class="tiles">
      ${tile("In process", inProc.length, "Screening through onboarding", "inproc", "var(--s-screen)")}
      ${S.admin ? tile("Board queue", c.board||0, c.board ? "Ready for the next meeting" : "Nobody waiting", "board", "var(--s-appr)") : tile("Interview stage", c.int||0, "Waiting on or in interviews", "int", "var(--s-int)")}
      ${tile("Interviews this week", thisWeek, booked.length ? `${booked.length} booked in total` : "None booked", "ivweek", "var(--s-int)")}
      ${S.admin ? tile("Probation reviews", due30, "Due in the next 30 days", "probation", "var(--s-act)") : tile("Active", c.act||0, "Joined the squad", "act", "var(--s-act)")}
    </div>
    ${total ? `<section class="ovcard"><h3>Pipeline<small>${total} total</small></h3>
      <div class="pipe" role="img" aria-label="${order.map(k => `${STAGES[k].label} ${c[k]}`).join(", ")}">${order.map(k => `<span style="flex:${c[k]};--stage-c:${stageVar(k)}" title="${STAGES[k].label}: ${c[k]}"></span>`).join("")}</div>
      <div class="legend">${order.map(k => `<button type="button" data-filter="${k}" style="--stage-c:${stageVar(k)}">${STAGES[k].label} <b>${c[k]}</b></button>`).join("")}</div></section>` : ""}
    <div class="ovgrid cols">
      <section class="ovcard"><h3>Upcoming interviews${S.admin?`<button class="btn small" type="button" data-cmd="slots">Interview times</button>`:""}</h3><div class="olist">${ivList || `<div class="oempty">No interviews booked.</div>`}</div></section>
      <section class="ovcard"><h3>Waiting longest<small>in process</small></h3><div class="olist">${waiting || `<div class="oempty">Nobody in process.</div>`}</div></section>
      ${activityCard()}
      ${S.admin ? `<section class="ovcard"><h3>Probation reviews<small>every 3 months</small></h3><div class="olist">${revList || `<div class="oempty">Nobody on probation.</div>`}</div></section>` : ""}
    </div>
    <p class="kbdhint">Tip: press <kbd>⌘K</kbd> to search, <kbd>J</kbd> <kbd>K</kbd> to move through applicants, <kbd>?</kbd> for all shortcuts.</p>
  </div></div>`;
  if (D.querySelector(".ov") && D._ovHTML === html) return;
  D._ovHTML = html; D.innerHTML = html; stackCols(D);
  const ov = D.querySelector(".ov"); if (ov) ov.scrollTop = keepScroll;
}

/* ---------- page sign-off ---------- */
// Initials + "complete" at the bottom of each working tab. Tabs members can open keep it on the shared record;
// admin-only tabs keep it in the private record.
const SIGN_ROOT = { app:"signoff", iv:"signoff", screen:"pagesign", refs:"pagesign", board:"pagesign", onb:"pagesign" };
const tabLabel = k => (TABS_ADMIN.find(t => t[0] === k) || [k, k])[1];
const signPath = (k, f) => `${SIGN_ROOT[k]}.${k}.${f}`;
const signHTML = k => !SIGN_ROOT[k] ? "" : `<section class="group signoff" id="signBox"><h3><span>Page sign-off</span></h3><div class="ios"><div class="row">
    <span class="lbl">${esc(tabLabel(k))} page complete<small id="signNote">Initial and mark complete once everything on this page is done</small></span>
    <input class="init" type="text" id="f-sign-${k}" data-k="${signPath(k, "init")}" maxlength="4" placeholder="Init." autocomplete="off" aria-label="${esc(tabLabel(k))} page sign-off initials">
    <button class="btn small primary" type="button" data-sign="${k}" id="signBtn">Mark complete</button></div></div></section>`;
function syncSignoff(a){
  document.querySelectorAll(".tabdock [data-tab]").forEach(b => { const k = b.dataset.tab; b.classList.toggle("signed", !!(SIGN_ROOT[k] && get(a, signPath(k, "done")))); });
  const box = $("#signBox"); if (!box) return;
  const k = S.tab, done = get(a, signPath(k, "done")), init = String(get(a, signPath(k, "init")) || "").trim();
  box.classList.toggle("done", !!done);
  $("#signNote").textContent = done ? `Completed ${fmtDate(done)}${init ? " · " + init : ""}` : init ? "Click Mark complete to sign off this page" : "Initial and mark complete once everything on this page is done";
  const b = $("#signBtn"); b.textContent = done ? "Undo" : "Mark complete"; b.classList.toggle("primary", !done); b.disabled = !done && !init;
}

/* ---------- detail ---------- */
// Which tab holds each MILESTONES step, so clicking the progress bar jumps there.
const STEP_TAB = ["app","app","screen","screen","refs","iv","iv","board","board","onb","onb","onb","onb","onb"];
const ICON = {
  mail:`<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 4l6 4.5L14 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  cal:`<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M1.5 6.5h13M5 1v3M11 1v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  doc:`<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5l3.5 3.5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11.5a1 1 0 0 1 1-1z M9 1.5V5h3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  eye:`<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
};
// Lay a .cols block out as two independent columns (item i goes to column i % 2), so a tall
// card doesn't leave a gap under its neighbour. Below 700px the stacks dissolve and CSS order restores reading order.
function stackCols(root){
  root.querySelectorAll(".cols").forEach(c => {
    const items = [...c.children]; if (items.length < 2) return;
    const st = [0,1].map(() => { const d = document.createElement("div"); d.className = "colstack"; return d; });
    items.forEach((el, i) => { el.style.order = i; st[i % 2].appendChild(el); });
    c.append(...st);
  });
}
function renderDetail(){
  const fk = focusKey();
  try { paintDetail(); } finally { restoreFocus(fk); }
  const narrow = matchMedia("(max-width:860px)").matches;
  [".roster", ".side"].forEach(s => { const el = $(s); if (el) el.inert = !!S.sel && narrow && $("#modal").hidden; });
}
function paintDetail(){
  const D = $("#detail"), a = S.apps.get(S.sel);
  $("#app").classList.toggle("open", !!a);
  $("#overviewBtn").classList.toggle("on", !a);
  if (!a) return renderOverview();
  const tabs = S.admin ? TABS_ADMIN : TABS_MEMBER;
  if (!tabs.some(t => t[0] === S.tab)) S.tab = "app";
  // The header sticks to the top of the scrolling file and the tab bar floats at the bottom; content scrolls under both.
  D.innerHTML = `<div class="dbody" id="dbody"><div class="dhead">
      <div class="drow"><button class="btn small back" type="button" id="backBtn" aria-label="Back to roster">‹ Roster</button>
        <span class="av" id="dAv" aria-hidden="true"></span>
        <div class="dname"><h2 id="dName"></h2><div class="sub" id="dSub"></div></div>
        ${S.admin ? `<div class="hacts">
          <button class="btn small" type="button" data-act="email" title="Write an email">${ICON.mail}<span class="tl">Email</span></button>
          <button class="btn small" type="button" data-act="book" title="Book an interview time">${ICON.cal}<span class="tl">Book</span></button>
          <button class="btn small" type="button" data-act="docs" title="Request documents">${ICON.doc}<span class="tl">Request docs</span></button>
          <button class="btn small" type="button" data-act="preview" title="See their applicant portal">${ICON.eye}<span class="tl">Portal</span></button>
        </div>` : ""}</div>
      ${S.admin?`<div class="prog" id="dProg"></div>`:""}
    </div>
    <div class="dinner" id="dpanel" role="tabpanel" aria-labelledby="tab-${S.tab}">${tabHTML(S.tab)}${signHTML(S.tab)}</div></div>
    <nav class="tabdock" aria-label="Applicant file sections"><div class="tabs" role="tablist">${tabs.map(([k,l],i) => `<button type="button" role="tab" id="tab-${k}" aria-controls="dpanel" data-tab="${k}" aria-selected="${S.tab===k}" title="${l} (${i+1})">${l}</button>`).join("")}</div>
      <span class="save" id="saveState" role="status"></span></nav>`;
  stackCols($("#dbody"));
  syncDetail();
}
function syncDetail(){
  const a = S.apps.get(S.sel); if (!a || !$("#dName")) return;
  const p = view(a);
  $("#dName").textContent = a.name || "Unnamed applicant";
  const av = $("#dAv"); av.textContent = initials(a.name); av.style.setProperty("--stage-c", stageVar(p.stage));
  const t = Math.max(a.updatedAt||0, a.secUpdatedAt||0), by = (a.secUpdatedAt||0) > (a.updatedAt||0) ? a.secUpdatedBy : a.updatedBy;
  const who = personName(by);
  $("#dSub").innerHTML = `<span class="pill" style="--stage-c:${stageVar(p.stage)}">${STAGES[p.stage].label}</span>${[a.type,loc(a)].filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join("")}${t?`<span class="upd">Updated ${ago(t)}${who?` by ${esc(who)}`:""}</span>`:""}`;
  const pr = $("#dProg");
  if (pr) pr.innerHTML = `<div class="steps" style="--stage-c:${stageVar(p.stage)}">${MILESTONES.map((m,i) => `<button type="button" class="${p.done[i]?"done":""} ${i===p.cur?"cur":""}" data-step="${i}" title="${i+1}. ${esc(m[0])}${p.done[i]?" ✓":""}" aria-label="Step ${i+1}: ${esc(m[0])}${p.done[i]?", done":""}"></button>`).join("")}</div>
    <div class="t"><strong>${p.n}/${MILESTONES.length}</strong> · ${p.next?`Next: <strong>${esc(p.next)}</strong>`:"Checklist complete"}</div>`;
  const m = $("#miles");
  if (m) m.innerHTML = MILESTONES.map((x,i) => `<div class="mile ${p.done[i]?"done":""} ${i===p.cur?"cur":""}"><span class="dot">${p.done[i]?checkSVG:""}</span>${esc(x[0])}</div>`).join("");
  const tn = $("#typeNote"); if (tn) tn.textContent = TYPE_INFO[a.type] || "Pick a membership type to see its requirements.";
  const pend = $("#probEnd"); if (pend) { const r = nextReview(a); pend.textContent = get(a,"notify.probEnd") ? "Off probation" : r ? r.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : "Set a start date"; }
  const pe = $("#phoneEcho"), ee = $("#emailEcho");
  if (pe) pe.textContent = a.phone || "Not entered on Application tab";
  if (ee) ee.textContent = a.email || "Not entered on Application tab";
  const ps = $("#portalStatus");
  if (ps) { const inv = get(a,"portal.invited"); ps.textContent = !a.email ? "Add their email first" : inv ? `Invited ${fmtDate(inv)} · ${a.email}` : "Not invited yet"; $("#inviteBtn").textContent = inv ? "Resend link" : "Send invite"; $("#inviteBtn").disabled = !a.email; }
  const be = $("#bookedEcho");
  if (be) {
    be.textContent = a._booked ? `${slotLong(a._booked.start)}${a._booked.location ? " · " + a._booked.location : ""}` : "Not booked";
    const cal = a._booked ? `<button class="btn small" type="button" data-act="ics" title="Add to Calendar">${ICON.cal}<span class="tl">Calendar</span></button>` : "";
    $("#bookedActs").innerHTML = cal + (S.admin ? (a._booked ? `<button class="btn small" type="button" data-act="book">Change</button><button class="btn small danger" type="button" data-act="release">Release</button>` : `<button class="btn small" type="button" data-act="book">Book a time</button>`) : "");
  }
  renderDocs(a); renderHistory(); syncRefs(a);
  syncSignoff(a);
  const pc = $("#panelCount"); if (pc) { const n = [1,2,3,4,5].filter(i => String(get(a,`iv.panel.m${i}`) || "").trim()).length; pc.textContent = n ? `${n} recorded` : ""; }
  document.querySelectorAll("#dbody [data-k]").forEach(el => {
    const k = el.dataset.k; let v = get(a, k);
    if (k === "status" && !v) v = "open";
    if (el.classList.contains("seg")) el.querySelectorAll("button").forEach(b => { b.classList.toggle("on", b.dataset.v === v); b.setAttribute("aria-pressed", b.dataset.v === v); });
    else { const sv = v == null ? "" : String(v); if (el !== document.activeElement && el.value !== sv) el.value = sv; }
  });
  document.querySelectorAll("#dbody [data-show]").forEach(el => { el.hidden = !SHOW[el.dataset.show](a); });
}
function syncRefs(a){
  const refs = refList(a), got = refs.filter(x => x.received).length, waiting = refs.length - got;
  const sum = $("#refSummary");
  if (sum) {
    sum.className = "refsum " + (!refs.length ? "" : waiting ? "warn" : "ok");
    sum.innerHTML = `<b>${!refs.length ? "No references entered yet" : waiting ? `${got} of ${refs.length} references received · waiting on ${waiting}` : `All ${refs.length} references received`}</b>
      <span>All references must be in before the application goes to the board. The applicant sees each name with Received or Waiting in their portal; email addresses, dates and initials stay private.</span>`;
  }
  for (const i of [1,2,3,4]) {
    const badge = $("#refBadge" + i); if (!badge) continue;
    const name = String(get(a,`refs.r${i}.name`) || "").trim(), ret = get(a,`refs.r${i}.returned`);
    badge.className = "badge " + (!name ? "" : ret ? "ok" : "wait"); badge.textContent = !name ? "" : ret ? "Received" : "Waiting";
    $("#refRcv" + i).textContent = !name ? "Enter a name first" : ret ? "Received " + fmtDate(ret) : "Waiting on this reference";
    const b = $("#refBtn" + i); b.textContent = ret ? "Undo" : "Mark received"; b.disabled = !name; b.classList.toggle("primary", !!name && !ret);
  }
  const bn = $("#boardRefNote");
  if (bn) { bn.hidden = !(refs.length === 0 || waiting); bn.textContent = refs.length === 0 ? "No references entered yet. All references must be in before this goes to the board." : `Waiting on ${waiting} reference${waiting===1?"":"s"} (${refs.filter(x => !x.received).map(x => x.name).join(", ")}). All references must be in before this goes to the board.`; }
}
function requestedDocs(a){
  return Object.entries(get(a,"docs.requested") || {}).filter(([,v]) => v && v.label && !v.removed)
    .sort((x,y) => (x[1].requestedAt||0) - (y[1].requestedAt||0)).map(([key,v]) => ({ key, label: v.label, received: v.received === "yes", requestedAt: v.requestedAt }));
}
function renderDocs(a){
  const el = $("#docList"); if (!el) return;
  const docs = requestedDocs(a), files = S.files;
  const fileRow = f => `<div class="row"><span class="lbl"><button class="filelink" type="button" data-file="${esc(f.id)}">${esc(f.name)}</button><small>${esc(f.label || "Other")} · ${new Date(f.uploadedAt).toLocaleDateString()} · ${Math.max(1, Math.round((f.size||0)/1024))} KB</small></span></div>`;
  const rows = docs.map(d => { const up = files.filter(f => f.docKey === d.key).length;
    return `<div class="row"><span class="lbl">${esc(d.label)}<small>${d.received ? "Received" : up ? `${up} file${up>1?"s":""} uploaded · not marked received` : "Waiting on applicant"}</small></span>
      <div class="seg" role="group" aria-label="Received"><button type="button" class="${d.received?"on good":"good"}" data-docrcv="${esc(d.key)}">${d.received?"Received ✓":"Mark received"}</button></div>
      <button class="copy" type="button" data-docrm="${esc(d.key)}" aria-label="Remove ${esc(d.label)}">Remove</button></div>`; }).join("");
  const other = files.filter(f => !f.docKey || !docs.some(d => d.key === f.docKey));
  el.innerHTML = (rows || `<div class="row"><span class="lbl" style="color:var(--fg2)">No documents requested.</span></div>`)
    + (files.length ? `<div class="note">Uploaded files</div>${files.map(fileRow).join("")}` : "")
    + (!files.length && other.length ? "" : "");
}

/* ---------- writes ---------- */
function setSave(t){ const el = $("#saveState"); if (!el) return; el.textContent = t; el.classList.toggle("busy", /…$/.test(t)); el.classList.toggle("err", t === "Not saved"); }
function queue(kind, id, patch){
  const key = kind + "|" + id;
  pending[key] = merge(pending[key] || {}, patch);
  clearTimeout(timers[key]); timers[key] = setTimeout(() => flush(key), 600);
}
function edit(id, path, value){
  if (!S.apps.has(id)) return;
  const kind = SECURE.has(path.split(".")[0]) ? "sec" : "pub";
  if (kind === "sec" && !S.admin) return;
  const now = Date.now();
  const meta = kind === "pub" ? { updatedAt: now, updatedBy: S.me } : { secUpdatedAt: now, secUpdatedBy: S.me };
  const patch = merge(nest(path, value), meta);
  logChange(id, path, get(S.apps.get(id), path), value);
  const store = kind === "pub" ? S.shared : S.secure;
  store.set(id, merge(store.get(id) || {}, clone(patch)));
  queue(kind, id, patch);
  rebuild(id);
  if (S.admin) {   // mirror the stage onto the shared record so members see where an applicant stands
    const st = progress(S.apps.get(id)).stage;
    if (S.shared.get(id).stage !== st) { S.shared.get(id).stage = st; queue("pub", id, { stage: st }); rebuild(id); }
    schedulePortal(id);
  }
  setSave("Editing…");
  renderList(); syncDetail();
}
async function flush(key){
  if (inflight[key] || !pending[key]) return;
  const [kind, id] = key.split("|");
  const p = pending[key]; delete pending[key]; inflight[key] = p;
  if (S.sel === id) setSave("Saving…");
  try {
    const r = kind === "sec" ? doc(db, "applicants", id, "private", "main") : doc(db, "applicants", id);
    await setDoc(r, p, { merge: true });
    if (S.sel === id && !Object.keys(pending).some(k => k.endsWith("|" + id))) setSave("Saved");
  } catch (e) {
    console.error(e);
    if (e && e.code === "permission-denied") toast("You don't have permission to change that.");
    else { pending[key] = merge(p, pending[key] || {}); setTimeout(() => flush(key), 2000 + Math.random()*1000); toast("Couldn't save yet. Retrying…"); }
    if (S.sel === id) setSave("Not saved");
  } finally { delete inflight[key]; if (pending[key]) flush(key); }
}
function flushAll(){ Object.keys(pending).forEach(k => { clearTimeout(timers[k]); flush(k); }); flushLogs(); }

/* ---------- change history ---------- */
// Edits are batched per applicant: each field keeps its value from before the first edit and its latest value,
// and one history entry is written a few seconds after typing stops (or when you move on).
const logBuf = {}, logTimers = {};
const sameVal = (x, y) => JSON.stringify(x ?? "") === JSON.stringify(y ?? "");
function logChange(id, path, from, to){
  const b = logBuf[id] || (logBuf[id] = {});
  if (!(path in b)) b[path] = { from: clone(from ?? "") };
  b[path].to = clone(to ?? "");
  clearTimeout(logTimers[id]); logTimers[id] = setTimeout(() => writeLog(id), 4000);
}
const logVal = v => { if (v == null || v === "") return ""; if (isObj(v)) return v.label ? String(v.label) : JSON.stringify(v).slice(0, 300); return String(v).slice(0, 300); };
async function writeLog(id, extra){
  clearTimeout(logTimers[id]);
  const b = logBuf[id] || {}; delete logBuf[id];
  const changes = Object.entries(b).filter(([, c]) => !sameVal(c.from, c.to)).map(([path, c]) => ({ path, from: logVal(c.from), to: logVal(c.to) }));
  if (extra) changes.push(...extra);
  if (!changes.length || !S.shared.has(id)) return;
  try { await addDoc(collection(db, "applicants", id, "history"), { at: Date.now(), by: S.me, changes: changes.slice(0, 200) }); }
  catch (e) { console.error(e); }
}
function flushLogs(){ Object.keys(logBuf).forEach(id => writeLog(id)); }
let histUnsub = null;
function watchHistory(id){
  if (histUnsub) { histUnsub(); histUnsub = null; }
  S.hist = [];
  if (!S.admin || !id) return;
  histUnsub = onSnapshot(collection(db, "applicants", id, "history"), s => {
    S.hist = s.docs.map(d => d.data()).sort((x,y) => (y.at||0) - (x.at||0));
    if (S.sel === id) renderHistory();
  }, () => {});
}
let LABELS = null;
const histLabel = path => {
  if (path === "_created") return "Created file";
  { const m = /^(signoff|pagesign)\.(\w+)\.done$/.exec(path); if (m) return `${tabLabel(m[2])} page complete`; }
  if (/^docs\.requested\.[^.]+$/.test(path)) return "Requested document";
  if (/^docs\.requested\.[^.]+\.received$/.test(path)) return "Document received";
  if (/^docs\.requested\.[^.]+\.removed$/.test(path)) return "Removed document request";
  LABELS = LABELS || fieldLabels();
  return (LABELS[path] || path).replace(/^\d+\.\s*/, "");
};
// Button labels for segmented fields, so history reads "Needs review" rather than the stored "review".
let SEG_VALUES = null;
function segValues(){
  if (SEG_VALUES) return SEG_VALUES;
  const box = document.createElement("div"), map = {};
  box.innerHTML = TABS_ADMIN.map(t => tabHTML(t[0])).join("");
  box.querySelectorAll(".seg[data-k]").forEach(sg => { const m = map[sg.dataset.k] = {}; sg.querySelectorAll("button[data-v]").forEach(b => { m[b.dataset.v] = b.textContent.trim(); }); });
  return (SEG_VALUES = map);
}
const histVal = (v, path) => { if (v === "") return "blank"; const sv = segValues()[path]; if (sv && sv[v]) return sv[v];
  return v === "yesbad" || v === "yes" || v === "true" ? "Yes" : v === "no" ? "No" : /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v) : v; };
function renderHistory(){
  const el = $("#histList"); if (!el) return;
  if (!S.hist.length) { el.innerHTML = `<div class="row"><span class="lbl" style="color:var(--fg2)">No changes recorded yet. Edits made from now on show up here.</span></div>`; return; }
  el.innerHTML = S.hist.slice(0, 100).map(h => `<div class="hrow"><div class="hwho"><b>${esc(personName(h.by) || h.by || "Someone")}</b><span title="${esc(new Date(h.at).toLocaleString())}">${esc(new Date(h.at).toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}))}</span></div>
    <ul>${(h.changes||[]).map(c => `<li><span class="hl">${esc(histLabel(c.path))}</span> ${c.path === "_created" ? esc(c.to) : `<s>${esc(histVal(c.from, c.path))}</s> → <b>${esc(histVal(c.to, c.path))}</b>`}</li>`).join("")}</ul></div>`).join("")
    + (S.hist.length > 100 ? `<div class="row"><span class="lbl" style="color:var(--fg3)">Showing the latest 100 of ${S.hist.length}.</span></div>` : "");
}

/* ---------- applicant portal sync (admins) ---------- */
function portalPayload(a){
  return { email: lower(a.email), name: a.name || "", firstName: first(a.name), type: a.type || "",
    steps: applicantSteps(a), docs: requestedDocs(a).map(d => ({ key: d.key, label: d.label, received: d.received })),
    refs: refList(a).map(r => ({ name: r.name, received: r.received })),
    bookingOpen: get(a,"portal.bookingOpen") === "yes" };
}
const portalKey = p => JSON.stringify([p.email, p.name, p.firstName, p.type, p.steps, p.docs, p.refs || [], p.bookingOpen]);
const portalTimers = {};
function schedulePortal(id, delay = 1500){ if (!S.admin) return; clearTimeout(portalTimers[id]); portalTimers[id] = setTimeout(() => syncPortal(id), delay); }
async function syncPortal(id, force = false){
  const a = S.apps.get(id); if (!a || !S.admin) return;
  if (!force && (!get(a,"portal.invited") || !a.email)) return;
  const next = portalPayload(a), cur = S.portal.get(id);
  if (!force && cur && portalKey(cur) === portalKey(next)) return;
  try { await setDoc(doc(db, "portal", id), { ...next, updatedAt: Date.now() }, { merge: true }); }
  catch (e) { console.error(e); }
}
let syncAllT;
const syncAllPortals = () => { clearTimeout(syncAllT); syncAllT = setTimeout(() => { for (const id of S.apps.keys()) schedulePortal(id, 50); }, 2500); };

/* ---------- interview slots ---------- */
async function bookFor(id, slot){
  const a = S.apps.get(id); const old = a && a._booked;
  const b = writeBatch(db);
  if (old && old.slotId !== slot.id) b.update(doc(db, "slots", old.slotId), { bookedBy: null });
  b.update(doc(db, "slots", slot.id), { bookedBy: id });
  S._selfBooked = id;
  b.set(doc(db, "portal", id), { interview: { slotId: slot.id, start: slot.start, duration: slot.duration || null, location: slot.location || "", bookedAt: Date.now() } }, { merge: true });
  await b.commit();
}
async function releaseFor(id){
  const a = S.apps.get(id); if (!a || !a._booked) return;
  const b = writeBatch(db);
  b.update(doc(db, "slots", a._booked.slotId), { bookedBy: null });
  b.set(doc(db, "portal", id), { interview: null }, { merge: true });
  await b.commit();
}
function openBook(id){
  const a = S.apps.get(id);
  const open = [...S.slots.values()].filter(s => !s.bookedBy && s.start > Date.now()).sort((x,y) => x.start - y.start);
  const M = openModal(`<h3>Book a time</h3><p class="help">For ${esc(a.name || "this applicant")}. Booking here works even inside 24 hours.</p>
    ${open.length ? `<div class="ios slotlist">${open.map(s => `<div class="row"><span class="lbl"><span class="when">${esc(slotLong(s.start))}</span><small>${esc([s.duration?s.duration+" min":"", s.location].filter(Boolean).join(" · "))}</small></span><button class="btn small primary" type="button" data-bk="${esc(s.id)}">Book</button></div>`).join("")}</div>`
      : `<p class="help">No open interview times. Add some under <b>Interview times</b>.</p>`}
    <div class="acts"><button class="btn" type="button" data-x>Close</button></div>`, true);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const b = e.target.closest("[data-bk]"); if (!b) return;
    const s = S.slots.get(b.dataset.bk);
    try { await bookFor(id, s); closeModal(); toast(`Booked ${slotLong(s.start)}`); } catch (err) { console.error(err); toast("Couldn't book that time. It may have just been taken."); }
  };
}
function openSlots(){
  const def = S.settings.defaultLocation || "";
  const d0 = new Date(Date.now() + 3*864e5), dStr = `${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,"0")}-${String(d0.getDate()).padStart(2,"0")}`;
  const M = openModal(`<h3>Interview times</h3><p class="help">Applicants with booking turned on can pick any open time at least 24 hours out.</p>
    <form id="slotForm" class="ios" style="padding:14px"><div class="addslot">
      <div class="field"><label for="slDate">Date</label><input id="slDate" type="date" value="${dStr}" required></div>
      <div class="field"><label for="slTime">First start time</label><input id="slTime" type="time" value="18:00" required></div>
      <div class="field"><label for="slDur">Length</label><select id="slDur"><option>20</option><option selected>30</option><option>45</option><option>60</option></select></div>
      <div class="field"><label for="slCount">Back-to-back slots</label><select id="slCount">${[1,2,3,4,5,6,8,10].map(n=>`<option>${n}</option>`).join("")}</select></div>
      <div class="field full"><label for="slLoc">Location</label><input id="slLoc" type="text" placeholder="PVRS building, room…" value="${esc(def)}"></div>
      <div class="full" style="display:flex;justify-content:flex-end"><button class="btn primary" type="submit">Add times</button></div></div></form>
    <div id="slotList"></div>
    <div class="acts"><button class="btn" type="button" id="slIcs" title="Every booked interview as one calendar file">Add booked interviews to Calendar</button><button class="btn" type="button" data-x>Done</button></div>`, true);
  const paint = () => {
    if (!$("#slotList")) return;
    const up = [...S.slots.values()].filter(s => s.start > Date.now() - 864e5).sort((x,y) => x.start - y.start);
    const days = {}; up.forEach(s => { const k = slotDay(s.start); (days[k] = days[k] || []).push(s); });
    $("#slotList").innerHTML = up.length ? Object.entries(days).map(([day, list]) => `<div class="group"><h3><span>${esc(day)}</span></h3><div class="ios slotlist">${list.map(s => {
      const who = s.bookedBy ? (S.apps.get(s.bookedBy)?.name || "Applicant") : "";
      return `<div class="row"><span class="lbl"><span class="when">${esc(slotTime(s.start))}</span><small>${esc([s.duration?s.duration+" min":"", s.location].filter(Boolean).join(" · "))}</small></span>
        ${who ? `<span class="badge ok">${esc(who)}</span><button class="btn small" type="button" data-rel="${esc(s.id)}">Release</button>` : `<span class="badge wait">Open</span><button class="btn small danger" type="button" data-del="${esc(s.id)}">Delete</button>`}</div>`; }).join("")}</div></div>`).join("")
      : `<p class="help">No upcoming interview times yet.</p>`;
  };
  paint(); S._slotPaint = paint;
  M._cleanup = () => { S._slotPaint = null; };
  $("#slotForm").onsubmit = async e => {
    e.preventDefault();
    const [y,mo,d] = $("#slDate").value.split("-").map(Number), [h,mi] = $("#slTime").value.split(":").map(Number);
    if (!y || isNaN(h)) return toast("Pick a date and time.");
    const dur = +$("#slDur").value, n = +$("#slCount").value, where = $("#slLoc").value.trim();
    try {
      for (let i = 0; i < n; i++) { const start = new Date(y, mo-1, d, h, mi + i*dur).getTime(); await addDoc(collection(db, "slots"), { start, duration: dur, location: where, bookedBy: null, createdAt: Date.now() }); }
      if (where && where !== S.settings.defaultLocation && S.admin) { S.settings.defaultLocation = where; setDoc(doc(db, "settings", "main"), { defaultLocation: where }, { merge: true }).catch(() => {}); }
      toast(`Added ${n} time${n>1?"s":""}`);
    } catch (err) { console.error(err); toast("Couldn't add those times."); }
  };
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) { S._slotPaint = null; return closeModal(); }
    if (e.target.id === "slIcs") {
      const ev = [...S.slots.values()].filter(s => s.bookedBy && s.start > Date.now() - 864e5 && S.apps.has(s.bookedBy)).map(s => icsEvent(S.apps.get(s.bookedBy), s));
      if (!ev.length) return toast("No booked interviews to add.");
      download(`PVRS-interviews-${today()}.ics`, icsFile(ev), "text/calendar"); toast(`Calendar file with ${ev.length} interview${ev.length===1?"":"s"} downloaded. Open it to add them.`); return;
    }
    const del = e.target.closest("[data-del]"); if (del) { try { await deleteDoc(doc(db, "slots", del.dataset.del)); } catch { toast("Couldn't delete that time."); } return; }
    const rel = e.target.closest("[data-rel]"); if (rel) { const s = S.slots.get(rel.dataset.rel); try { await releaseFor(s.bookedBy); toast("Time released"); } catch (err) { console.error(err); toast("Couldn't release that time."); } }
  };
}

const icsEvent = (a, s) => ({ uid: "iv-" + (s.slotId || s.id), start: s.start, duration: s.duration || 30, title: `PVRS interview: ${a.name || "Applicant"}`, location: s.location || "",
  description: [a.type ? a.type + " membership" : "", a.phone ? "Phone: " + a.phone : "", a.email ? "Email: " + a.email : "", location.origin].filter(Boolean).join("\n") });

/* ---------- documents ---------- */
function openRequestDocs(id){
  const a = S.apps.get(id); const have = requestedDocs(a).map(d => d.label);
  const picked = new Set(), custom = [];
  const M = openModal(`<h3>Request documents</h3><p class="help">They'll see these in their portal with an upload button.</p>
    <div class="chips" style="flex-wrap:wrap" id="rqChips">${DOC_ITEMS.map((d,i) => `<button class="chip" type="button" data-i="${i}" aria-pressed="${have.includes(d)}" ${have.includes(d)?"disabled":""}>${have.includes(d)?"✓ ":""}${esc(d)}</button>`).join("")}</div>
    <div class="ios"><div class="row"><input id="rqCustom" class="inlinefield" type="text" placeholder="Something else…" aria-label="Another document" style="flex:1"><button class="btn small" type="button" id="rqAdd">Add</button></div><div id="rqCustomList"></div></div>
    ${!get(a,"portal.invited") ? `<p class="help">${a.email ? "They don't have portal access yet. An invite will be sent to " + esc(a.email) + "." : "Add their email on the Application tab so they can get portal access."}</p>` : ""}
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="rqSave">Request</button></div>`, true);
  const paintCustom = () => { $("#rqCustomList").innerHTML = custom.map((c,i) => `<div class="row"><span class="lbl">${esc(c)}</span><button class="copy" type="button" data-rmc="${i}">Remove</button></div>`).join(""); };
  const addCustom = () => { const v = $("#rqCustom").value.trim(); if (!v) return; custom.push(v); $("#rqCustom").value = ""; paintCustom(); };
  $("#rqCustom").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const c = e.target.closest("[data-i]"); if (c && !c.disabled) { const i = +c.dataset.i; picked.has(i) ? picked.delete(i) : picked.add(i); c.setAttribute("aria-pressed", picked.has(i)); return; }
    if (e.target.id === "rqAdd") return addCustom();
    const rm = e.target.closest("[data-rmc]"); if (rm) { custom.splice(+rm.dataset.rmc, 1); paintCustom(); return; }
    if (e.target.id === "rqSave") {
      if ($("#rqCustom").value.trim()) addCustom();
      const labels = [...[...picked].map(i => DOC_ITEMS[i]), ...custom];
      if (!labels.length) return toast("Pick or type at least one document.");
      const now = Date.now();
      labels.forEach((label, i) => edit(id, `docs.requested.d${now}${i}`, { label, requestedAt: now + i, received: "" }));
      if (get(a,"app.complete") === "no" && !get(a,"app.notified")) edit(id, "app.notified", today());
      closeModal(); flushAll();
      if (a.email && !get(a,"portal.invited")) await inviteToPortal(id, false);
      else schedulePortal(id, 300);
      openEmail("docs", labels);
    }
  };
}
async function openFile(fid){
  const f = S.files.find(x => x.id === fid); if (!f) return;
  const w = window.open("", "_blank");
  try { const url = await getDownloadURL(ref(storage, f.path)); if (w) w.location = url; else location.href = url; }
  catch (e) { if (w) w.close(); toast("Couldn't open that file."); }
}
function watchFiles(id){
  if (filesUnsub) { filesUnsub(); filesUnsub = null; }
  S.files = [];
  if (!S.admin || !id) return;
  filesUnsub = onSnapshot(collection(db, "portal", id, "files"), s => {
    S.files = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((x,y) => (y.uploadedAt||0) - (x.uploadedAt||0));
    if (S.sel === id) { const a = S.apps.get(id); if (a) renderDocs(a); }
  }, () => {});
}

/* ---------- portal invite ---------- */
async function inviteToPortal(id, showEmail = true){
  const a = S.apps.get(id); if (!a) return;
  const email = lower(a.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Add a valid email on the Application tab first.");
  if (!get(a,"portal.invited")) edit(id, "portal.invited", today());
  flushAll();
  try {
    await syncPortal(id, true);
    await sendSignInLinkToEmail(auth, email, linkSettings());
    toast(`Sign-in link sent to ${email}`);
    if (showEmail) openEmail("portal");
  } catch (e) { console.error(e); toast("Couldn't send the invite. Check the email address and try again."); }
}

/* ---------- emails ---------- */
const TEMPLATES = {
  portal: a => ({ subject: "Your PVRS applicant portal",
    body: `Hi ${first(a.name)},\n\nThank you for applying to the Potsdam Volunteer Rescue Squad. You can follow your application, upload documents and book your interview in your applicant portal:\n\n${location.origin}\n\nSign in with this email address (${lower(a.email)}). We just sent you a separate sign-in link, and you can request a new one from that page any time. No password needed.\n\nQuestions? Email ${S.settings.docsEmail || CONTACT_EMAIL}.\n\nThank you,\n${sig()}` }),
  docs: (a, list = []) => ({ subject: "PVRS application: documents needed",
    body: `Hi ${first(a.name)},\n\nTo keep your application moving, please upload the following in your applicant portal:\n\n${list.length ? list.map(l => "• " + l).join("\n") : "• "}\n\n${location.origin}\n\nIf the upload gives you trouble, email them to ${S.settings.docsEmail || CONTACT_EMAIL} instead.\n\nThank you,\n${sig()}` }),
  refs: (a, list = []) => ({ subject: "PVRS application: references still needed",
    body: `Hi ${first(a.name)},\n\nWe're still waiting to hear from ${list.length === 1 ? "one of your references" : "some of your references"}:\n\n${list.length ? list.map(l => "• " + l).join("\n") : "• "}\n\nWe need all of your references before your application can go to the board. If you can, please check in with them, or let us know if one of them is hard to reach and you'd like to suggest someone else.\n\nYou can see which references we've heard from in your applicant portal:\n${location.origin}\n\nThank you,\n${sig()}` }),
  interview: a => ({ subject: "PVRS interview: pick a time",
    body: `Hi ${first(a.name)},\n\nThe next step in your application is an interview with the Membership Committee. Interview times are now open in your applicant portal. Sign in and pick the one that works best for you:\n\n${location.origin}\n\nIf none of the times work, reply to this email and we'll find another.\n\nThank you,\n${sig()}` }),
};
function openEmail(kind, extra){
  const a = S.apps.get(S.sel); if (!a) return;
  const t = TEMPLATES[kind](a, extra);
  const titles = { portal: "Welcome email", docs: "Documents email", refs: "References email", interview: "Interview email" };
  const M = openModal(`<h3>${titles[kind]}</h3><p class="help">Optional personal note to go with the portal. Copy it or open it in Mail.</p>
    <div class="ios"><div class="row"><span class="lbl">To<small>${esc(a.email || "No email on file")}</small></span>${a.email?`<button class="copy" type="button" id="cpTo">Copy</button>`:""}</div>
      <label class="row stack"><span class="lbl">Subject</span><input type="text" id="emSubject" value="${esc(t.subject)}"></label>
      <label class="row stack"><span class="lbl">Message</span><textarea class="body" id="emBody">${esc(t.body)}</textarea></label></div>
    <div class="acts"><button class="btn" type="button" id="emCancel">Close</button>${a.email?`<a class="btn" id="emMail" href="#">Open in Mail</a>`:""}<button class="btn primary" type="button" id="emCopy">Copy email</button></div>`, true);
  const mailHref = () => `mailto:${encodeURIComponent(a.email||"")}?subject=${encodeURIComponent($("#emSubject").value)}&body=${encodeURIComponent($("#emBody").value)}`;
  const ml = $("#emMail"); if (ml) { ml.href = mailHref(); M.querySelector(".sheet").addEventListener("input", () => { ml.href = mailHref(); }); }
  M.onclick = async e => {
    const id = e.target.id;
    if (id === "emCancel") closeModal();
    if (id === "cpTo") toast((await copyText(a.email)) ? "Copied " + a.email : a.email);
    if (id === "emCopy") { const ok = await copyText(`Subject: ${$("#emSubject").value}\n\n${$("#emBody").value}`, $("#emBody")); toast(ok ? "Email copied" : "Select the message and copy it manually"); }
  };
}

/* ---------- applicant preview ---------- */
function openPreview(id){
  const list = sorted().map(r => r.a);
  const render = aid => { const a = S.apps.get(aid); if (!a) return `<p class="help">No applicants yet.</p>`;
    const pd = { ...portalPayload(a), interview: a._booked ? { ...a._booked } : null };
    return `<div class="portal" style="height:auto;padding:0;overflow:visible">${portalHTML({ pd, files: aid === S.sel ? S.files : [], slots: [...S.slots.values()], preview: true })}</div>`; };
  const start = id || (list[0] && list[0]._id);
  const M = openModal(`<h3>Applicant view</h3><p class="help">Exactly what the applicant sees when they sign in. Buttons are disabled in this preview.</p>
    ${list.length > 1 ? `<div class="ios"><label class="row"><span class="lbl">Show</span><select id="pvPick">${list.map(a => `<option value="${esc(a._id)}">${esc(a.name || "Unnamed")}</option>`).join("")}</select></label></div>` : ""}
    <div id="pvBody">${render(start)}</div><div class="acts"><button class="btn" type="button" data-x>Close</button></div>`, true);
  const pk = $("#pvPick"); if (pk) { pk.value = start; pk.addEventListener("change", e => { $("#pvBody").innerHTML = render(e.target.value); }); }
  M.onclick = e => { if (e.target.closest("[data-x]")) closeModal(); };
}

/* ---------- settings (owner, PIN) ---------- */
let pinFails = 0, pinLockUntil = 0;
async function hashPin(p){ if (!(window.crypto && crypto.subtle)) { toast("Open the Desk over https to unlock Settings."); return ""; } const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("pvrs-desk:" + p)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,"0")).join(""); }
function gateSettings(){
  if (!S.owner) return;
  if (S.unlocked) return openSettings();
  let entry = "";
  const M = openModal(`<h3 style="text-align:center">Enter PIN</h3><p class="help" style="text-align:center">Settings and backups are locked.</p>
    <div class="pin" id="pinDots" aria-live="polite">${"<span></span>".repeat(4)}</div>
    <div class="pad">${[1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-n="${n}">${n}</button>`).join("")}<button type="button" class="ghost" data-n="x">Cancel</button><button type="button" data-n="0">0</button><button type="button" class="ghost" data-n="del">Delete</button></div>`);
  const dots = () => $("#pinDots").querySelectorAll("span").forEach((d,i) => d.classList.toggle("f", i < entry.length));
  const press = async k => {
    if (k === "x") { document.removeEventListener("keydown", onKey); return closeModal(); }
    if (k === "del") { entry = entry.slice(0,-1); return dots(); }
    if (Date.now() < pinLockUntil) return toast(`Too many tries. Wait ${Math.ceil((pinLockUntil-Date.now())/1000)}s.`);
    if (entry.length >= 4) return;
    entry += k; dots();
    if (entry.length === 4) {
      if (await hashPin(entry) === PIN_HASH) { S.unlocked = true; pinFails = 0; document.removeEventListener("keydown", onKey); closeModal(); openSettings(); }
      else { pinFails++; if (pinFails >= 5) { pinLockUntil = Date.now() + 30000; pinFails = 0; }
        const d = $("#pinDots"); d.classList.remove("err"); void d.offsetWidth; d.classList.add("err"); entry = ""; setTimeout(dots, 250); toast("Incorrect PIN"); }
    }
  };
  const onKey = e => {
    if (!$("#pinDots")) return document.removeEventListener("keydown", onKey);
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); } else if (e.key === "Backspace") { e.preventDefault(); press("del"); }
  };
  document.addEventListener("keydown", onKey);
  M._cleanup = () => document.removeEventListener("keydown", onKey);
  M.onclick = e => { const b = e.target.closest("[data-n]"); if (b) press(b.dataset.n); };
}
function teamHTML(){
  const rows = [...S.staff.entries()].sort((x,y) => x[0].localeCompare(y[0])).map(([email, s]) => `<div class="row"><span class="lbl">${esc(s.name || email)}<small>${esc(email)}</small></span>
    <div class="seg" role="group" aria-label="Role">${[["member","Member"],["admin","Admin"]].map(([v,l]) => `<button type="button" class="${s.role===v?"on":""}" data-role="${esc(email)}" data-v="${v}">${l}</button>`).join("")}</div>
    <button class="copy" type="button" data-rmstaff="${esc(email)}">Remove</button></div>`).join("");
  return `<div class="row"><span class="lbl">${esc(OWNER_EMAIL)}<small>Owner · full access</small></span></div>${rows}
    <div class="row" style="flex-wrap:wrap"><input id="tmEmail" type="email" placeholder="member@pvrs.org" class="inlinefield" style="flex:2 1 180px">
      <input id="tmName" type="text" placeholder="Name" class="inlinefield" style="flex:1 1 120px">
      <button class="btn small primary" type="button" id="tmAdd">Add member</button></div>`;
}
function openSettings(){
  const s = S.settings;
  const M = openModal(`<h3>Settings</h3>
    <div class="group"><h3><span>Team</span></h3><div class="ios" id="teamList">${teamHTML()}</div>
      <p class="help" style="margin:4px 4px 0"><b>Members</b> see the Application and Interview tabs. <b>Admins</b> see everything except Settings. They sign in with Google or an email link using this address.</p></div>
    <div class="group"><h3><span>Emails</span></h3><div class="ios">
      <label class="row stack"><span class="lbl">Email signature<small>Printed at the end of every email</small></span><textarea id="sSig" rows="4" placeholder="Name, credentials">${esc(s.signature||"")}</textarea></label>
      <label class="row stack"><span class="lbl">Documents and questions go to</span><input type="text" id="sDocs" placeholder="${esc(CONTACT_EMAIL)}" value="${esc(s.docsEmail||"")}"></label>
      <label class="row stack"><span class="lbl">Default interview location</span><input type="text" id="sLoc" placeholder="PVRS building" value="${esc(s.defaultLocation||"")}"></label></div></div>
    <div class="group"><h3><span>Security</span></h3><div class="ios">
      <label class="row"><span class="lbl">Sign out after inactivity<small>Minutes with no mouse or keyboard use, for everyone on the team (5–240)</small></span><input type="number" id="sIdle" min="5" max="240" placeholder="30" value="${esc(s.idleMinutes||"")}"></label></div></div>
    <div class="group"><h3><span>Applicant view</span></h3><div class="ios">
      <div class="row"><span class="lbl">See what applicants see<small>Their portal, for any applicant on the roster</small></span><button class="btn small" type="button" id="sPreview">Preview</button></div></div></div>
    <div class="group"><h3><span>Backups</span></h3><div class="ios">
      <div class="row"><span class="lbl">Full export<small>Every field for every applicant. Save one to the PVRS Drive monthly.</small></span><button class="btn small" type="button" id="sFull">Export</button></div>
      <div class="row"><span class="lbl">Summary CSV<small>Dates, results and board votes only</small></span><button class="btn small" type="button" id="sSummary">Export</button></div>
      <div class="row"><span class="lbl">Import records<small>The migration file from the old Claude version</small></span><label class="btn small" for="sImport">Choose file</label><input type="file" id="sImport" accept="application/json,.json" hidden></div></div></div>
    <div class="acts"><button class="btn" type="button" id="sLock">Lock</button><button class="btn" type="button" id="sCancel">Cancel</button><button class="btn primary" type="button" id="sSave">Save</button></div>`, true);
  $("#sImport").addEventListener("change", e => importFile(e.target.files && e.target.files[0]));
  M.onclick = async e => {
    const id = e.target.id;
    if (id === "sCancel") closeModal();
    if (id === "sLock") { S.unlocked = false; closeModal(); toast("Settings locked"); }
    if (id === "sPreview") openPreview(S.sel);
    if (id === "sFull") exportFull();
    if (id === "sSummary") exportSummary();
    if (id === "tmAdd") {
      const email = lower($("#tmEmail").value), name = $("#tmName").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Enter a valid email.");
      if (email === lower(OWNER_EMAIL)) return toast("That's the owner account.");
      try { await setDoc(doc(db, "staff", email), { role: "member", name, addedAt: Date.now(), addedBy: S.me }); toast(`Added ${email} as a member`); } catch { toast("Couldn't add that member."); }
    }
    const rb = e.target.closest("[data-role]"); if (rb) { try { await setDoc(doc(db, "staff", rb.dataset.role), { role: rb.dataset.v }, { merge: true }); } catch { toast("Couldn't change the role."); } }
    const rm = e.target.closest("[data-rmstaff]"); if (rm) {
      if (rm.dataset.confirm !== "1") { rm.dataset.confirm = "1"; rm.textContent = "Confirm remove"; return; }
      try { await deleteDoc(doc(db, "staff", rm.dataset.rmstaff)); toast("Removed"); } catch { toast("Couldn't remove."); } }
    if (id === "sSave") {
      const idle = parseInt($("#sIdle").value, 10);
      const next = { signature: $("#sSig").value.trim(), docsEmail: $("#sDocs").value.trim(), defaultLocation: $("#sLoc").value.trim(), idleMinutes: idle ? Math.min(240, Math.max(5, idle)) : null, updatedAt: Date.now() };
      try { await setDoc(doc(db, "settings", "main"), next, { merge: true }); closeModal(); toast("Settings saved"); } catch { toast("Couldn't save settings."); }
    }
  };
  S._teamPaint = () => { const el = $("#teamList"); if (el) el.innerHTML = teamHTML(); };
  M._cleanup = () => { S._teamPaint = null; };
}

/* ---------- exports / import ---------- */
const csvQ = v => `"${String(v ?? "").replace(/^yesbad$/,"yes").replace(/"/g,'""')}"`;
function exportSummary(){
  const cols = [["Name","name"],["Phone","phone"],["Email","email"],["Type","type"],["Location","_loc"],["Received","app.received"],["Complete","app.complete"],
    ["MVR completed","mvr.completed"],["MVR violations","mvr.violations"],["License verified","dl.date"],["License valid","dl.valid"],["License expires","dl.expires"],
    ["Sterling completed","bg.sterDone"],["Sterling result","bg.sterResult"],["Interview","_iv"],["Interview completed","sched.completed"],
    ["Committee","appr.committee"],["Board date","board.date"],["Board result","board.result"],["For","board.for"],["Against","board.against"],["Abstain","board.abstain"],
    ["Applicant notified","notify.applicant"],["Orientation notified","notify.orientation"],["Chief notified","notify.chief"],["Tech notified","notify.tech"],["Probation start","notify.probStart"],["Off probation","notify.probEnd"]];
  const val = (a,k) => k === "_loc" ? loc(a) : k === "_iv" ? (a._booked ? slotLong(a._booked.start) : get(a,"sched.scheduled")) : get(a,k);
  const rows = sorted().map(({a,p}) => [STAGES[p.stage].label, `${p.n}/${MILESTONES.length}`, p.next||"", ...cols.map(c => val(a,c[1]))].map(csvQ).join(","));
  download(`PVRS-applicants-summary-${today()}.csv`, "﻿" + [["Stage","Progress","Next step",...cols.map(c=>c[0])].map(csvQ).join(","), ...rows].join("\r\n"));
}
function fieldLabels(){
  const box = document.createElement("div"), map = {};
  box.innerHTML = TABS_ADMIN.map(t => tabHTML(t[0])).join("");
  box.querySelectorAll("[data-k]").forEach(el => {
    const k = el.dataset.k; if (map[k]) return;
    const row = el.closest(".row"), refEl = el.closest(".ref"), lb = row && row.querySelector(".lbl");
    let t = lb ? (lb.firstChild && lb.firstChild.nodeType === 3 ? lb.firstChild.textContent : lb.textContent) : (el.closest("label") ? el.closest("label").textContent : k);
    if (refEl) t = refEl.querySelector(".refh, h4").textContent + ": " + t;
    if (el.getAttribute("aria-label")) t = el.getAttribute("aria-label");
    map[k] = t.trim();
  });
  for (const k of Object.keys(SIGN_ROOT)) { map[signPath(k, "init")] = `${tabLabel(k)} page sign-off initials`; map[signPath(k, "done")] = `${tabLabel(k)} page completed`; }
  return map;
}
function exportFull(){
  const labels = fieldLabels(), order = Object.keys(labels);
  const skip = new Set(["_id","_booked","updatedBy","secUpdatedBy","createdBy"]);
  const flat = (o, pre="", out={}) => { for (const k in o) { if (skip.has(k)) continue; const p = pre ? pre + "." + k : k; if (isObj(o[k])) flat(o[k], p, out); else out[p] = o[k]; } return out; };
  const rows = sorted().map(({a,p}) => ({ p, a, f: flat(a) }));
  const extra = [...new Set(rows.flatMap(r => Object.keys(r.f)))].filter(k => !labels[k]).sort();
  const keys = [...order, ...extra];
  const nice = v => (typeof v === "number" && v > 1e12) ? new Date(v).toISOString().slice(0,16).replace("T"," ") : v;
  const head = ["Stage","Progress","Next step","Booked interview",...keys.map(k => labels[k] || k)];
  const csv = [head.map(csvQ).join(","), ...rows.map(({p,a,f}) => [STAGES[p.stage].label, `${p.n}/${MILESTONES.length}`, p.next||"", a._booked ? slotLong(a._booked.start) : "", ...keys.map(k => nice(f[k]))].map(csvQ).join(","))].join("\r\n");
  download(`PVRS-applicants-full-${today()}.csv`, "﻿" + csv);
}
async function importFile(file){
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data.applicants) ? data.applicants : [];
    if (!list.length) return toast("No applicants found in that file.");
    let n = 0;
    for (const r of list) {
      if (!r.id || !isObj(r.shared)) continue;
      const shared = { ...r.shared, updatedBy: S.me }, priv = isObj(r.private) ? { ...r.private, secUpdatedBy: S.me } : null;
      await setDoc(doc(db, "applicants", r.id), shared, { merge: true });
      if (priv) await setDoc(doc(db, "applicants", r.id, "private", "main"), priv, { merge: true });
      n++;
    }
    toast(`Imported ${n} applicant${n===1?"":"s"}`);
  } catch (e) { console.error(e); toast("Couldn't read that file. Use the JSON migration file."); }
}

/* ---------- delete ---------- */
async function deleteApplicant(id){
  const a = S.apps.get(id);
  try {
    if (a && a._booked) await releaseFor(id).catch(() => {});
    const files = await getDocs(collection(db, "portal", id, "files")).catch(() => null);
    if (files) for (const f of files.docs) { await deleteObject(ref(storage, f.data().path)).catch(() => {}); await deleteDoc(f.ref).catch(() => {}); }
    await deleteDoc(doc(db, "portal", id)).catch(() => {});
    delete logBuf[id]; clearTimeout(logTimers[id]);
    const hist = await getDocs(collection(db, "applicants", id, "history")).catch(() => null);
    if (hist) for (const h of hist.docs) await deleteDoc(h.ref).catch(() => {});
    await deleteDoc(doc(db, "applicants", id, "private", "main"));
    await deleteDoc(doc(db, "applicants", id));
    S.sel = null; renderList(); renderDetail(); toast("Applicant deleted");
  } catch (e) { console.error(e); toast("Couldn't delete. Try again."); }
}

/* ---------- events ---------- */
const prefs = { get(k){ try { return localStorage.getItem("pvrsDesk." + k); } catch { return null; } }, set(k, v){ try { localStorage.setItem("pvrsDesk." + k, v); } catch {} } };
function switchTab(k){ flushAll(); S.tab = k; renderDetail(); const b = $("#dbody"); if (b) b.scrollTop = 0; }
function deselect(){ flushAll(); S.sel = null; watchFiles(null); watchHistory(null); renderList(); renderDetail(); }
function setFilter(f, focusList){
  S.filter = f; renderList();
  if (focusList) { const L = $("#list"); $(".roster").scrollTop = 0; const first = L.querySelector(".arow"); if (first && innerWidth > 860) first.focus(); }
}
function moveSel(dir){
  const ids = S.vis || []; if (!ids.length) return;
  const i = ids.indexOf(S.sel);
  const next = ids[i < 0 ? (dir > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, i + dir))];
  if (next && next !== S.sel) select(next, true);
  const el = [...document.querySelectorAll("#list .arow")].find(b => b.dataset.id === next);
  if (el) { el.scrollIntoView({ block: "nearest" }); if (!el.closest("[inert]")) el.focus({ preventScroll: true }); }
}
function openEmailPicker(){
  const a = S.apps.get(S.sel); if (!a) return;
  const waiting = requestedDocs(a).filter(d => !d.received).map(d => d.label);
  const waitRefs = refList(a).filter(r => !r.received).map(r => r.name);
  const opts = [["portal","Welcome to the applicant portal","Their sign-in address and what the portal is for"],
    ["docs","Documents needed", waiting.length ? `Lists the ${waiting.length} document${waiting.length===1?"":"s"} still outstanding` : "Nothing requested yet. You can type the list yourself"],
    ["refs","References still needed", waitRefs.length ? `Lists the ${waitRefs.length} reference${waitRefs.length===1?"":"s"} we haven't heard from` : "All entered references are in"],
    ["interview","Pick an interview time","Tells them interview times are open in the portal"]];
  const M = openModal(`<h3>Write an email</h3><p class="help">To ${esc(a.name || "this applicant")}${a.email ? ` · ${esc(a.email)}` : ". No email address on file yet"}. You can edit it before sending.</p>
    <div class="ios">${opts.map(([k,l,s]) => `<button class="oitem" type="button" data-em="${k}" style="width:100%;padding-inline:14px"><span class="ot"><b>${l}</b><small>${s}</small></span><span class="when">›</span></button>`).join("")}</div>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button></div>`);
  M.onclick = e => { if (e.target.closest("[data-x]")) return closeModal(); const b = e.target.closest("[data-em]"); if (b) openEmail(b.dataset.em, b.dataset.em === "docs" ? waiting : b.dataset.em === "refs" ? waitRefs : undefined); };
}
function openShortcuts(){
  const k = (...keys) => `<span>${keys.map(x => `<kbd>${x}</kbd>`).join("")}</span>`;
  const M = openModal(`<h3>Keyboard shortcuts</h3><div class="keys">
    ${k("⌘","K")}<span>Search applicants</span>
    ${k("J")}<span>Next applicant (or <kbd>↓</kbd> in the list)</span>
    ${k("K")}<span>Previous applicant (or <kbd>↑</kbd> in the list)</span>
    ${k("/")}<span>Search</span>
    ${k("N")}<span>New applicant</span>
    ${k("1")}<span>…through <kbd>7</kbd>: switch tabs on the open file</span>
    ${k("[")}<span>Previous tab</span>
    ${k("]")}<span>Next tab</span>
    ${S.admin ? `${k("E")}<span>Write an email to the open applicant</span>` : ""}
    ${k("Esc")}<span>Close a window, clear search, or go back to the overview</span>
    ${k("?")}<span>Show this list</span></div>
    <p class="help">Shortcuts pause while you're typing in a field. Press <kbd>Esc</kbd> to leave the field first.</p>
    <div class="acts"><button class="btn primary" type="button" data-x>Done</button></div>`);
  M.onclick = e => { if (e.target.closest("[data-x]")) closeModal(); };
}
function onKeys(e){
  const modalOpen = !$("#modal").hidden;
  if (e.isComposing || e.keyCode === 229) return;
  const tg = e.target, typing = tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName));
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
  if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
    e.preventDefault(); if (modalOpen) return;
    if (innerWidth <= 860 && S.sel) deselect();
    const q = $("#q"); q.focus(); q.select(); return;
  }
  if (e.key === "Escape") {
    if (modalOpen) return;   // the modal handles its own Escape
    if (tg && tg.id === "q") { if (S.q) { S.q = ""; tg.value = ""; renderList(); } else tg.blur(); return; }
    if (typing) { tg.blur(); return; }
    if (S.sel) { const prev = S.sel; deselect(); const el = document.querySelector(`#list .arow[data-id="${CSS.escape(prev)}"]`); if (el) el.focus({ preventScroll: true }); }
    return;
  }
  if (tg && tg.id === "q" && (e.key === "ArrowDown" || e.key === "Enter")) { if (S.vis && S.vis.length) { e.preventDefault(); tg.blur(); select(S.vis[0], true); const el = $("#list .arow"); if (el) el.focus({ preventScroll: true }); } return; }
  if (typing || modalOpen || e.metaKey || e.ctrlKey || e.altKey) return;
  const tabs = (S.admin ? TABS_ADMIN : TABS_MEMBER).map(t => t[0]);
  // Arrows move through the list only while focus is in it, so they still scroll the file and overview. J/K work anywhere.
  const inList = tg && tg.closest && tg.closest(".roster");
  if (e.key === "j" || (e.key === "ArrowDown" && inList)) { e.preventDefault(); moveSel(1); }
  else if (e.key === "k" || (e.key === "ArrowUp" && inList)) { e.preventDefault(); moveSel(-1); }
  else if (e.key === "n" || e.key === "N") { e.preventDefault(); openNew(); }
  else if (e.key === "/") { e.preventDefault(); $("#q").focus(); }
  else if (e.key === "?") { e.preventDefault(); openShortcuts(); }
  else if (S.sel && /^[1-9]$/.test(e.key) && tabs[+e.key - 1]) { e.preventDefault(); switchTab(tabs[+e.key - 1]); }
  else if (S.sel && (e.key === "[" || e.key === "]")) { e.preventDefault(); const i = tabs.indexOf(S.tab); switchTab(tabs[(i + (e.key === "]" ? 1 : -1) + tabs.length) % tabs.length]); }
  else if (S.sel && S.admin && (e.key === "e" || e.key === "E")) { e.preventDefault(); openEmailPicker(); }
}
function bindEvents(){
  $("#list").addEventListener("click", e => { const c = e.target.closest(".arow"); if (c) select(c.dataset.id); });
  const onFilter = e => { const c = e.target.closest("[data-f]"); if (!c) return; if (innerWidth <= 860 && S.sel) deselect(); setFilter(c.dataset.f); };
  $("#chips").addEventListener("click", onFilter);
  $("#chipsMini").addEventListener("click", onFilter);
  $("#q").addEventListener("input", e => { S.q = e.target.value; renderList(); });
  const sortSel = $("#sort"); sortSel.value = S.sort; sortSel.addEventListener("change", e => { S.sort = e.target.value; prefs.set("sort", S.sort); renderList(); });
  $("#overviewBtn").addEventListener("click", () => { if (S.sel) deselect(); else { S.filter = "all"; renderList(); } });
  $("#kbdBtn").addEventListener("click", openShortcuts);
  addEventListener("keydown", onKeys);
  const D = $("#detail");
  D.addEventListener("input", e => { const el = e.target.closest("[data-k]"); if (!el || el.classList.contains("seg")) return;
    let v = el.value; if (el.classList.contains("init")) v = v.toUpperCase(); if (el.type === "number") v = v === "" ? "" : Math.max(0, parseInt(v,10) || 0);
    edit(S.sel, el.dataset.k, v); });
  D.addEventListener("focusout", e => { if (e.target.matches("[data-k]")) flushAll(); });
  D.addEventListener("click", async e => {
    const t = e.target;
    const tab = t.closest("[data-tab]");
    if (tab) { switchTab(tab.dataset.tab); return; }
    const op = t.closest("[data-open]"); if (op) return select(op.dataset.open);
    const fl0 = t.closest("[data-filter]"); if (fl0) return setFilter(fl0.dataset.filter, true);
    const cmd = t.closest("[data-cmd]"); if (cmd) { if (cmd.dataset.cmd === "slots") openSlots(); return; }
    const step = t.closest("[data-step]");
    if (step) { const tb = STEP_TAB[+step.dataset.step]; if (tb && tb !== S.tab && (S.admin ? TABS_ADMIN : TABS_MEMBER).some(x => x[0] === tb)) switchTab(tb); return; }
    const act = t.closest("[data-act]");
    if (act) {
      const k = act.dataset.act;
      if (k === "email") return openEmailPicker();
      if (k === "invite") return inviteToPortal(S.sel);
      if (k === "preview") { flushAll(); return openPreview(S.sel); }
      if (k === "docs") return openRequestDocs(S.sel);
      if (k === "book") return openBook(S.sel);
      if (k === "packet") { flushAll(); return printPacket([S.apps.get(S.sel)]); }
      if (k === "ics") { const a = S.apps.get(S.sel); if (a && a._booked) { download(`PVRS-interview-${(a.name||"applicant").replace(/\W+/g,"-")}.ics`, icsFile([icsEvent(a, a._booked)]), "text/calendar"); toast("Calendar file downloaded. Open it to add the interview."); } return; }
      if (k === "release") { try { await releaseFor(S.sel); toast("Interview time released"); } catch { toast("Couldn't release that time."); } return; }
    }
    const sg = t.closest("[data-sign]");
    if (sg) { const k = sg.dataset.sign, a = S.apps.get(S.sel);
      if (get(a, signPath(k, "done"))) { edit(S.sel, signPath(k, "done"), ""); return; }
      if (!String(get(a, signPath(k, "init")) || "").trim()) { toast("Enter your initials first."); $("#f-sign-" + k)?.focus(); return; }
      edit(S.sel, signPath(k, "done"), today()); toast(`${tabLabel(k)} page marked complete`); return; }
    const rr = t.closest("[data-refrcv]");
    if (rr) { const a = S.apps.get(S.sel), i = rr.dataset.refrcv; if (!String(get(a,`refs.r${i}.name`) || "").trim()) return toast("Enter the reference's name first.");
      edit(S.sel, `refs.r${i}.returned`, get(a,`refs.r${i}.returned`) ? "" : today()); return; }
    const rc = t.closest("[data-docrcv]"); if (rc) { const a = S.apps.get(S.sel); const k = rc.dataset.docrcv; edit(S.sel, `docs.requested.${k}.received`, get(a,`docs.requested.${k}.received`) === "yes" ? "" : "yes"); return; }
    const rm = t.closest("[data-docrm]"); if (rm) { if (rm.dataset.confirm !== "1") { rm.dataset.confirm = "1"; rm.textContent = "Confirm"; return; } edit(S.sel, `docs.requested.${rm.dataset.docrm}.removed`, true); return; }
    const fl = t.closest("[data-file]"); if (fl) return openFile(fl.dataset.file);
    const segBtn = t.closest(".seg button");
    if (segBtn && segBtn.parentElement.dataset.k) { const k = segBtn.parentElement.dataset.k; const cur = get(S.apps.get(S.sel), k);
      const v = cur === segBtn.dataset.v && k !== "status" ? "" : segBtn.dataset.v; edit(S.sel, k, v);
      if (k === "portal.bookingOpen" && v === "yes") { const a = S.apps.get(S.sel); if (a.email && !get(a,"portal.invited")) toast("Send them a portal invite so they can book."); else if (a.email) setTimeout(() => openEmail("interview"), 300); }
      return; }
    if (t.closest("#backBtn")) { deselect(); return; }
    const cp = t.closest("[data-copy]");
    if (cp) { const v = S.apps.get(S.sel)?.[cp.dataset.copy] || ""; if (!v) return toast("Nothing to copy yet."); toast((await copyText(v)) ? "Copied " + v : v); return; }
    if (t.closest("#delBtn")) { $("#delConfirm").hidden = false; return; }
    if (t.closest("#delCancel")) { $("#delConfirm").hidden = true; return; }
    if (t.closest("#delYes")) return deleteApplicant(S.sel);
  });
  addEventListener("keydown", e => {
    if (e.key !== "Escape" || $("#modal").hidden || e.isComposing) return;
    // First Esc leaves a text field you've changed (so a slip doesn't throw away an email draft); the next one closes.
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName) && t.closest(".sheet") && t.value !== t.defaultValue) { t.blur(); t.closest(".sheet").focus({ preventScroll: true }); return; }
    closeModal();
  });
  matchMedia("(max-width:860px)").addEventListener("change", () => { const narrow = matchMedia("(max-width:860px)").matches; [".roster", ".side"].forEach(s => { $(s).inert = !!S.sel && narrow; }); });
  addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushAll(); });
  setInterval(() => { if (S.sel && !document.hidden) syncDetail(); }, 60000);
  $("#modal").addEventListener("mousedown", e => { if (e.target.id === "modal") closeModal(); });
  $("#settingsBtn").addEventListener("click", gateSettings);
  $("#slotsBtn").addEventListener("click", openSlots);
  $("#newBtn").addEventListener("click", openNew);
  $("#agendaBtn").addEventListener("click", copyAgenda);
  $("#packetBtn").addEventListener("click", () => { flushAll(); printPacket(sorted().filter(r => inBoardQueue(r.a)).map(r => r.a)); });
}
function select(id){
  if (!S.apps.has(id)) return;
  flushAll(); const same = S.sel === id; S.sel = id;
  if (!same) { watchFiles(id); watchHistory(id); }
  renderList(); renderDetail();
  const b = $("#dbody"); if (b && !same) b.scrollTop = 0;
  if (S.admin) schedulePortal(id, 200);
}

function openNew(){
  const M = openModal(`<form id="newForm" style="display:contents" novalidate><h3>New applicant</h3>
    <div class="ios">${F.text("n.name","Full name","First Last")}${F.text("n.phone","Phone","(315) 555-0100","tel")}${F.text("n.email","Email","name@example.com","email")}${F.date("n.received","Date received")}</div>
    <div class="ios">${F.seg("n.type","Membership type",TYPES.map(t=>[t,t]),true)}${F.seg("n.location","Location",[["Potsdam","Potsdam"],["other","Other"]])}<div id="nLocRow" hidden>${F.text("n.locationOther","Where?","Town")}</div></div>
    <div class="acts"><button class="btn" type="button" id="nCancel">Cancel</button><button class="btn primary" type="submit">Add applicant</button></div></form>`);
  const draft = { type:"Regular", location:"Potsdam" };
  const paintSeg = () => M.querySelectorAll(".seg").forEach(s => s.querySelectorAll("button").forEach(b => b.classList.toggle("on", draft[s.dataset.k.slice(2)] === b.dataset.v)));
  const paint = () => { $("#nLocRow").hidden = draft.location !== "other"; };
  $("#f-n-received").value = today(); paintSeg(); paint(); $("#f-n-name").focus();
  M.onclick = e => { const b = e.target.closest(".seg button"); if (b) { draft[b.parentElement.dataset.k.slice(2)] = b.dataset.v; paintSeg(); paint(); if (draft.location === "other") $("#f-n-locationOther").focus(); } if (e.target.id === "nCancel") closeModal(); };
  $("#newForm").onsubmit = async e => {
    e.preventDefault();
    const name = $("#f-n-name").value.trim(); if (!name) { $("#f-n-name").focus(); return toast("Enter the applicant's name."); }
    const data = { name, phone:$("#f-n-phone").value.trim(), email:$("#f-n-email").value.trim(), type:draft.type, location:draft.location, ...(draft.location==="other"?{locationOther:$("#f-n-locationOther").value.trim()}:{}), stage:"screen",
      app:{ received:$("#f-n-received").value || today() }, createdAt:Date.now(), updatedAt:Date.now(), createdBy:S.me, updatedBy:S.me };
    try { const r = doc(collection(db, "applicants")); await setDoc(r, data); S.shared.set(r.id, data); rebuild(r.id); writeLog(r.id, [{ path: "_created", from: "", to: name }]); closeModal(); S.tab = "app"; select(r.id); toast("Added " + name); }
    catch (err) { console.error(err); toast("Couldn't add the applicant."); }
  };
}
async function copyAgenda(){
  const q = sorted().filter(r => inBoardQueue(r.a));
  const dates = q.map(r => get(r.a,"board.date")).filter(Boolean).sort();
  const lines = q.map((r,i) => { const a = r.a; const bits = [a.type, loc(a), get(a,"sched.completed") ? "interviewed " + fmtDate(get(a,"sched.completed")) : null, get(a,"board.result")==="tabled" ? "tabled at last meeting" : null].filter(Boolean);
    return `${i+1}. ${a.name || "Unnamed"} (${bits.join(", ")})`; });
  const text = `PVRS Board: membership applications for approval${dates.length?`\nMeeting: ${longDate(dates[dates.length-1])}`:""}\n\nRecommended by the Membership Committee:\n${lines.join("\n")}`;
  toast((await copyText(text)) ? `Agenda copied (${q.length} applicant${q.length===1?"":"s"})` : "Couldn't copy the agenda");
}

/* ---------- board packet (print) ---------- */
const yn = v => v === "yes" ? "Yes" : v === "no" ? "No" : v === "yesbad" ? "Yes" : "—";
const d8 = v => v ? fmtDate(v) : "—";
function packetPage(a){
  const g = k => get(a, k);
  const refs = [1,2,3,4].map(i => g("refs.r"+i) || {}).filter(x => x.name);
  const panel = [1,2,3,4,5].map(i => g("iv.panel.m"+i) ? g("iv.panel.m"+i) + (g("iv.panel.i"+i) ? ` (${g("iv.panel.i"+i)})` : "") : "").filter(Boolean);
  const row = (k, v, flag) => `<tr${flag ? ' class="flag"' : ""}><th>${k}</th><td>${v}</td></tr>`;
  const ans = (q, k, alt) => { const v = g(k); return v ? `<div class="pq"><b>${q}</b><p>${esc(alt ? alt(v) : v)}</p></div>` : ""; };
  const iv = a._booked ? slotLong(a._booked.start) : g("sched.scheduled") ? longDate(g("sched.scheduled")) + (g("sched.time") ? " at " + g("sched.time") : "") : "";
  return `<section class="pk">
    <header><img src="/img/logo.png" alt=""><div><div class="pk-k">Membership application · Board packet</div><h1>${esc(a.name || "Unnamed applicant")}</h1>
      <div class="pk-s">${esc([a.type ? a.type + " membership" : "", loc(a), g("app.received") ? "Received " + longDate(g("app.received")) : ""].filter(Boolean).join(" · "))}</div></div></header>
    <div class="pk-cols">
      <div><h2>Screening</h2><table>
        ${row("Application complete", yn(g("app.complete")), g("app.complete") === "no")}
        ${row("Driving record (MVR)", g("mvr.completed") ? `Completed ${d8(g("mvr.completed"))} · violations: ${yn(g("mvr.violations"))}` : "Not completed", g("mvr.violations") === "yesbad")}
        ${row("Driver's license", g("dl.date") ? `Verified ${d8(g("dl.date"))} · valid and unrestricted: ${yn(g("dl.valid"))}` : "Not verified", g("dl.valid") === "no")}
        ${row("References", refs.length ? `${refs.filter(x => x.returned).length} of ${refs.length} received` + (refs.some(x => !x.returned) ? " · NOT ALL IN" : "") : "None entered", !refs.length || refs.some(x => !x.returned))}
      </table></div>
      <div><h2>Interview and committee</h2><table>
        ${row("Interview", g("sched.completed") ? "Completed " + d8(g("sched.completed")) + (g("sched.completedInit") ? " · " + esc(g("sched.completedInit")) : "") : iv ? "Scheduled " + esc(iv) : "Not scheduled")}
        ${row("Interviewers", panel.length ? esc(panel.join(", ")) : "—")}
        ${row("Understands requirements", `${yn(g("iv.understands"))} · able to meet them: ${yn(g("iv.ableToMeet"))}`, g("iv.understands") === "no" || g("iv.ableToMeet") === "no")}
        ${row("Committee recommendation", g("appr.committee") === "yes" ? "Approved" : g("appr.committee") === "no" ? "Not approved" : "Pending", g("appr.committee") === "no")}
        ${g("board.result") === "tabled" ? row("Previous board meeting", "Tabled" + (g("board.date") ? " on " + d8(g("board.date")) : ""), true) : ""}
      </table></div>
    </div>
    <h2>Interview highlights</h2>
    ${ans("Why PVRS", "iv.why")}${ans("About them", "iv.about")}
    ${ans("EMT status", "iv.isEmt", v => v === "yes" ? `Current EMT${g("iv.emtYears") ? ", " + g("iv.emtYears") : ""}` : v === "lapsed" ? "Lapsed / expired" : "Not certified" + (g("iv.emtClass") ? ` · can take a class within 12 months: ${yn(g("iv.emtClass"))}` : ""))}
    ${ans("Availability", "iv.avail", v => v === "year" ? "Year round" : v === "semester" ? "Semester only" : g("iv.availOther") || "Other")}
    ${ans("Other volunteer work", "iv.volunteer")}
    ${g("iv.driving") === "yesbad" ? ans("Driving record restrictions or citations", "iv.drivingExplain", v => v || "Yes (no explanation recorded)") : ""}
    ${g("iv.convicted") === "yesbad" ? ans("Criminal conviction disclosed", "iv.convictedExplain", v => v || "Yes (no explanation recorded)") : ""}
    ${g("board.notes") ? ans("Notes for the board", "board.notes") : ""}
    <h2>Board vote</h2>
    <table class="vote"><tr><th>Meeting date</th><td>${g("board.date") && g("board.date") >= today() ? esc(longDate(g("board.date"))) : ""}</td><th>Motion</th><td></td><th>Second</th><td></td></tr>
      <tr><th>For</th><td></td><th>Against</th><td></td><th>Abstain</th><td></td></tr></table>
    <p class="pk-res">Result: ☐ Approved &nbsp;&nbsp; ☐ Tabled &nbsp;&nbsp; ☐ Denied</p>
    <footer>Potsdam Volunteer Rescue Squad · Confidential: for the Board of Directors only · Printed ${esc(new Date().toLocaleDateString())}</footer>
  </section>`;
}
function printPacket(list){
  list = list.filter(Boolean);
  if (!list.length) return toast("Nobody is in the board queue.");
  let el = $("#print"); if (!el) { el = document.createElement("div"); el.id = "print"; document.body.appendChild(el); }
  el.innerHTML = list.map(packetPage).join("");
  document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); el.innerHTML = ""; removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  const img = el.querySelector("img");
  const go = () => setTimeout(() => window.print(), 50);
  if (img && !img.complete) { img.onload = go; img.onerror = go; } else go();
}

/* ---------- activity feed (admins): uploads and bookings from applicants ---------- */
function activity(){
  const since = Date.now() - 14*864e5, out = [];
  for (const f of S.feedFiles) if ((f.uploadedAt||0) > since && S.apps.has(f.appId)) out.push({ at: f.uploadedAt, id: f.appId, kind: "upload", text: `uploaded ${f.name}`, sub: f.label || "Document" });
  for (const [id, pd] of S.portal) { const iv = pd.interview; if (iv && iv.bookedAt > since && S.apps.has(id)) out.push({ at: iv.bookedAt, id, kind: "book", text: `booked an interview`, sub: slotLong(iv.start) }); }
  return out.sort((x,y) => y.at - x.at);
}
function activityCard(){
  if (!S.admin) return "";
  const items = activity().slice(0, 8);
  const seen = S.seenBefore || 0;
  return `<section class="ovcard"><h3>Applicant activity<small>last 14 days</small></h3><div class="olist">${items.length ? items.map(x => {
    const a = S.apps.get(x.id);
    return `<button class="oitem" type="button" data-open="${esc(x.id)}"><span class="av" style="--stage-c:${stageVar(view(a).stage)}" aria-hidden="true">${esc(initials(a.name))}</span><span class="ot"><b>${esc(a.name || "Applicant")} ${esc(x.text)}</b><small>${esc(x.sub)}</small></span><span class="when">${x.at > seen ? `<span class="newdot" title="New since your last visit"></span>` : ""}${esc(ago(x.at))}</span></button>`; }).join("")
    : `<div class="oempty">No uploads or bookings yet.</div>`}</div></section>`;
}
let feedPrimed = false;
function watchActivity(){
  onSnapshot(collectionGroup(db, "files"), snap => {
    const prev = new Set(S.feedFiles.map(f => f.key));
    S.feedFiles = snap.docs.map(d => ({ key: d.ref.path, appId: d.ref.parent.parent.id, ...d.data() }));
    if (feedPrimed) {
      const fresh = S.feedFiles.filter(f => !prev.has(f.key) && f.uploadedBy && f.uploadedBy !== S.me);
      if (fresh.length) { const a = S.apps.get(fresh[0].appId); toast(`${a ? a.name : "An applicant"} uploaded ${fresh.length === 1 ? fresh[0].name : fresh.length + " files"}`); }
    }
    feedPrimed = true;
    if (!S.sel) renderOverview();
  }, e => console.error(e));
}

/* ---------- auto sign-out after inactivity ---------- */
function startIdleLock(){
  // Sign-in is shared across tabs, so activity is too: the latest activity in any tab keeps everyone signed in.
  let last = Date.now(), warned = false, shared = 0;
  const bump = () => { last = Date.now(); warned = false; if (last - shared > 5000) { shared = last; prefs.set("active", String(last)); } };
  ["pointerdown","pointermove","keydown","wheel","touchstart","scroll"].forEach(ev => addEventListener(ev, bump, { passive: true, capture: true }));
  setInterval(async () => {
    last = Math.max(last, +prefs.get("active") || 0);
    const mins = Math.min(240, Math.max(5, +S.settings.idleMinutes || 30)), idle = Date.now() - last;
    if (S.unlocked && idle > 10*6e4) S.unlocked = false;   // Settings PIN re-locks after 10 idle minutes
    if (idle > mins*6e4) {
      flushAll(); await new Promise(res => setTimeout(res, 1200));
      try { sessionStorage.setItem("pvrsIdle", String(mins)); } catch {}
      await signOut(auth).catch(() => {}); location.replace("/");
    } else if (idle > (mins - 1)*6e4 && !warned) { warned = true; toast("You'll be signed out in about a minute. Move the mouse to stay signed in."); }
  }, 15000);
}

/* ---------- start ---------- */
export function startDesk({ email, role, owner, name }){
  S.me = email; S.admin = role === "admin"; S.owner = !!owner; S.name = name || "";
  S.sort = SORTS[prefs.get("sort")] ? prefs.get("sort") : "stage";
  bindEvents(); renderList(); renderDetail();
  const conn = $("#conn");
  conn.textContent = S.owner ? "Owner · full access" : S.admin ? "Admin" : "Member";
  conn.classList.add("on");
  $("#meName").textContent = S.name || email;
  $("#meName").title = email;
  $("#meAv").textContent = initials(S.name || email);
  if (S.owner) $("#settingsBtn").hidden = false;
  if (S.admin) $("#slotsBtn").hidden = false;
  S.seenBefore = +prefs.get("seen") || 0; prefs.set("seen", String(Date.now()));
  startIdleLock();
  const lost = () => { conn.classList.remove("on"); conn.textContent = "Connection lost · reload"; };

  onSnapshot(collection(db, "applicants"), snap => {
    const next = new Map();
    snap.docs.forEach(d => { const data = d.data(); merge(data, clone(inflight["pub|"+d.id] || {})); merge(data, clone(pending["pub|"+d.id] || {})); next.set(d.id, data); });
    S.shared = next; S.ready = true; rebuildAll();
    if (S.sel && !S.apps.has(S.sel)) { S.sel = null; renderDetail(); }
    renderList(); if (S.sel) syncDetail();
    if (S.admin) syncAllPortals();
  }, lost);
  onSnapshot(collection(db, "slots"), snap => {
    S.slots = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    rebuildAll(); renderList(); if (S.sel) syncDetail(); if (S._slotPaint && !$("#modal").hidden) S._slotPaint();
    if (S.admin) syncAllPortals();
  }, () => {});
  if (S.admin) {
    onSnapshot(collectionGroup(db, "private"), snap => {
      const next = new Map();
      snap.docs.forEach(d => { if (d.id !== "main") return; const id = d.ref.parent.parent.id; const data = d.data(); merge(data, clone(inflight["sec|"+id] || {})); merge(data, clone(pending["sec|"+id] || {})); next.set(id, data); });
      S.secure = next; rebuildAll(); renderList(); if (S.sel) syncDetail(); syncAllPortals();
    }, e => console.error(e));
    onSnapshot(collection(db, "portal"), snap => {
      const before = S.portal; S.portal = new Map(snap.docs.map(d => [d.id, d.data()]));
      if (before.size) for (const [id, pd] of S.portal) { const iv = pd.interview, old = before.get(id)?.interview;
        if (iv && iv.bookedAt && iv.bookedAt !== old?.bookedAt && Date.now() - iv.bookedAt < 6e4 && S.apps.get(id) && S._selfBooked !== id) toast(`${S.apps.get(id).name} booked ${slotLong(iv.start)}`); }
      if (!S.sel) renderOverview();
    }, () => {});
    watchActivity();
    onSnapshot(doc(db, "settings", "main"), s => { S.settings = s.exists() ? s.data() : {}; }, () => {});
    onSnapshot(collection(db, "staff"), snap => { S.staff = new Map(snap.docs.map(d => [d.id, d.data()])); if (S._teamPaint && !$("#modal").hidden) S._teamPaint(); if (S.sel) syncDetail(); }, () => {});
  }
}
