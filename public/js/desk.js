// Staff Desk: roster, applicant file, board, onboarding, interview times, settings.
import { app, auth, db, storage, doc, collection, collectionGroup, getDoc, setDoc, runTransaction, updateDoc, deleteDoc, addDoc, getDocs, onSnapshot, writeBatch, query, where,
  sendSignInLinkToEmail, ref, getDownloadURL, deleteObject, signOut, uploadBytes,
  GoogleAuthProvider, EmailAuthProvider, linkWithCredential, updatePassword, reauthenticateWithPopup, multiFactor, TotpMultiFactorGenerator } from "./fb.js";
import { $, esc, get, isObj, merge, clone, nest, today, fmtDate, longDate, daysSince, ago, first, loc, lower, toast, copyText,
  openModal, closeModal, download, slotDay, slotTime, slotLong, TYPES, TYPE_INFO, SECURE, DOC_ITEMS, MILESTONES, STAGES, stageVar,
  progress, statusOf, PHASES, inBoardQueue, applicantSteps, checkSVG, icsFile, refList, refStatus, REFS_NEEDED, isDeclined, isConfidential, HEARD } from "./shared.js";
import { portalHTML, threadHTML } from "./portal.js";
import { showTour, maybeTour } from "./tour.js";
import { RATINGS, refQuestions, TRUST_Q } from "./reference.js";
import { OWNER_EMAIL, CONTACT_EMAIL, PAPERWORK_EMAIL, VAPID_KEY } from "./config.js";

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
  select:(k,l,opts) => `<label class="row"><span class="lbl">${l}</span><select id="${fid(k)}" data-k="${k}">${opts.map(([v,t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("")}</select></label>`,
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

// Screening (MVR, license) and References share one "Checks" tab: seven tabs fit a phone's section bar.
const TABS_ADMIN = [["app","Application"],["checks","Checks"],["iv","Interview"],["board","Board"],["onb","Onboard"],["notes","Notes"],["msgs","Messages"]];
const TAB_SHORT = { app:"App", checks:"Checks", iv:"Interview", board:"Board", onb:"Onboard", notes:"Notes", msgs:"Msgs" };
const TABS_MEMBER = [["app","Application"],["iv","Interview"]];

function tabHTML(tab){
  const admin = S.admin;
  if (tab === "checks") return `<h2 class="tabsec">Driving record and license</h2>${tabHTML("screen")}<h2 class="tabsec">References</h2>${tabHTML("refs")}`;
  if (tab === "app") return `${admin ? `<div class="note warn dupenote" id="dupeNote" hidden></div>` : ""}<div class="cols">
    ${group("Applicant",[F.text("name","Full name","First Last"),F.text("phone","Phone","(315) 555-0100","tel"),F.text("email","Email","name@example.com","email"),
      F.seg("type","Membership type",TYPES.map(t=>[t,t]),true),`<div class="note" id="typeNote"></div>`,F.seg("location","Location",[["Potsdam","Potsdam"],["other","Other"]]),`<div data-show="locOther">${F.text("locationOther","Where?","Town")}</div>`])}
    ${group("Application",[F.date("app.received","Date received"),F.init("app.receivedInit"),F.yn("app.complete","Complete?",true),
      F.select("app.heard","Heard about PVRS",[["","—"],...HEARD.map(h => [h,h])]),F.text("app.heardDetail","Details","Which member, event…")])}
    ${admin ? `<section class="group" id="formGroup"><h3><span>Original application</span><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn small" type="button" data-act="uploadapp">Upload original</button></span></h3><div class="ios" id="origList"></div></section>` : ""}
    ${group("Incomplete application",[F.date("app.notified","Date notified"),F.date("app.returned","Date app returned"),F.date("app.reReceived","Date re-received")],"incomplete")}
    ${admin ? group("Applicant portal",[
      `<div class="row"><span class="lbl">Portal access<small id="portalStatus">—</small></span><button class="btn small primary" type="button" data-act="invite" id="inviteBtn">Welcome</button></div>`,
      F.yn("portal.bookingOpen","Let them book an interview",false,"Shows your open interview times in their portal"),
      `<div class="row"><span class="lbl">Applicant view<small>What they see when they sign in</small></span><button class="btn small" type="button" data-act="preview">Preview</button></div>`]) : ""}
    ${admin ? `<section class="group"><h3><span>Documents</span><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn small" type="button" data-act="records">Upload records</button><button class="btn small" type="button" data-act="docs">Request documents</button></span></h3><div class="ios" id="docList"></div><div class="ios recs" id="recList"></div></section>` : ""}
  </div>`;
  if (tab === "screen") return `<div class="cols">
    ${group("MVR",[F.init("mvr.requestInit","Request initials"),F.date("mvr.completed","Date completed"),F.ynBadYes("mvr.violations","Violations?")])}
    ${group("Driver's license check",[F.note("Verify the physical license in person. The number from the online application is shown here for the driving record check; don't copy it anywhere else."),
      `<div class="row" id="dlFromApp" hidden><span class="lbl">License number (from application)<small id="dlFromAppNote"></small></span><b id="dlNum" style="font-variant-numeric:tabular-nums;letter-spacing:.04em"></b></div>`,
      F.date("dl.date","Date verified"),F.text("dl.state","Issuing state","NY"),F.text("dl.class","Class","D"),F.date("dl.expires","Expiration date"),
      F.yn("dl.valid","Valid and unrestricted?",true),F.init("dl.init","Verified by (initials)")])}
    ${group("License issue",[F.area("dl.issue","What's the issue?","Restriction, suspension, expired…")],"dlBad")}
  </div>`;
  if (tab === "refs") return `<div class="refsum" id="refSummary"></div>
  <div class="cols">${[1,2,3,4].map(i => `<section class="group ref"><h3><span class="refh">Reference ${i}</span><span class="badge" id="refBadge${i}"></span></h3><div class="ios">${[
      F.text(`refs.r${i}.name`,"Name","Full name"),
      `<div class="row"><span class="lbl">Reference received<small id="refRcv${i}">—</small></span><button class="btn small" type="button" data-refrcv="${i}" id="refBtn${i}">Mark received</button></div>`,
      `<div class="row"><span class="lbl">Online reference form<small id="refFormNote${i}">—</small></span><span class="rfbtns"><button class="btn small primary" type="button" data-refview="${i}" id="refView${i}" hidden>View answers</button><button class="btn small primary" type="button" data-refremind="${i}" id="refRemind${i}" hidden>Send reminder</button><button class="btn small" type="button" data-refmail="${i}" id="refMail${i}">Email link</button><button class="btn small" type="button" data-refcopy="${i}" id="refCopy${i}">Copy link</button></span></div>`,
      `<div class="row"><span class="lbl">Need a different reference?<small id="refRepNote${i}">—</small></span><button class="btn small" type="button" data-refrep="${i}" id="refRepBtn${i}">Ask for a new one</button></div>`,
      F.text(`refs.r${i}.email`,"Email","name@example.com","email"),F.text(`refs.r${i}.relationship`,"Relationship",""),F.text(`refs.r${i}.phone`,"Phone","","tel"),F.text(`refs.r${i}.address`,"Address",""),F.date(`refs.r${i}.contacted`,"Date contacted"),
      F.seg(`refs.r${i}.method`,"Method",[["Phone","Phone"],["Email","Email"],["Text","Text"]]),F.date(`refs.r${i}.returned`,"Date received"),F.init(`refs.r${i}.init`)].join("")}</div></section>`).join("")}
  </div>`;
  if (tab === "iv") return `<div class="ivstart"><button class="btn primary" type="button" data-act="ivmode"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4L13 8z" fill="currentColor"/></svg>Start interview mode</button>
    <span class="help">Full screen, one section at a time, big enough to read across the table. Answers save as you go.</span></div><div class="cols">
    ${admin ? `<section class="group noiv"><h3><span>Interviewers</span>${S.sched ? `<button class="btn small" type="button" data-act="assigniv">Assign</button>` : ""}</h3><div class="ios" id="ivAssign"></div></section>` : ""}
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
    ${group("Next steps",[F.note("Tell the applicant:<br>• Their application goes to the next board meeting once their references and other prerequisites are complete. Tell them when the next board meeting is.<br>• They'll hear whether they're accepted within about 1 week of the board meeting.<br>• Turning in orientation paperwork on time and attending meetings and duty crews matters once they join.<br>• If the board approves them, the next step is a background check through Sterling Volunteers."),
      F.yn("iv.nextStepsReviewed","Next steps reviewed with applicant")])}
    ${group("Interview score",[F.note("Rate each area 1 (poor) to 5 (excellent) after the interview. The average goes in the board packet."),
      ...IV_SCORE.map(([k,l]) => F.seg(`iv.score.${k}`,l,[1,2,3,4,5].map(n => [String(n),String(n)]))),
      `<div class="row ivtotal"><span class="lbl"><b>Average</b></span><b id="ivScoreTotal">—</b></div>`])}
    ${admin?group("Committee decision",[F.yn("appr.committee","Committee approval",true)]):""}
  </div>`;
  if (tab === "board") return `${admin && aiOn() ? `<section class="group aibrief"><h3><span>Med Control brief</span>${S.canEdit ? `<button class="btn small" type="button" data-aibrief>Make brief</button>` : ""}</h3><div class="ios" id="aiBrief"></div></section>` : ""}<div class="cols">
    ${group("Membership committee",[`<div class="note warn" id="boardRefNote" hidden></div>`,F.yn("appr.committee","Committee approval",true),F.date("appr.chairNotified","Membership chair notified")])}
    ${group("Board vote",[F.date("board.date","Board meeting date"),F.text("board.motion","Motion by","Name"),F.text("board.second","Seconded by","Name"),
      `<div class="row"><span class="lbl">Vote</span><div class="tally">
        <label>For<input type="number" min="0" inputmode="numeric" id="f-board-for" data-k="board.for" placeholder="0"></label>
        <label>Against<input type="number" min="0" inputmode="numeric" id="f-board-against" data-k="board.against" placeholder="0"></label>
        <label>Abstain<input type="number" min="0" inputmode="numeric" id="f-board-abstain" data-k="board.abstain" placeholder="0"></label></div></div>`,
      F.seg("board.result","Result",[["approved","Approved","good"],["tabled","Tabled","warn"],["denied","Denied","bad"]],true),
      F.note("Tabled keeps the applicant in the board queue for the next meeting. A denial is never shown in the applicant's portal: it keeps reading as under review, interview booking closes, and the administrator sends the letter.")])}
    ${group("Board notes",[F.area("board.notes","Discussion or conditions","Anything the board attached to the approval")])}
    ${group("Board packet",[`<div class="row"><span class="lbl">Print this applicant's page<small>Checks, interview summary, committee decision and a blank vote record</small></span><button class="btn small" type="button" data-act="packet">Print</button></div>`])}
  </div>`;
  if (tab === "onb") return `<div class="cols">
    ${group("Background check · Sterling Volunteers",[F.note("Run after the board approves the applicant. Sterling Volunteers runs the full background check."),F.date("bg.sterReq","Date requested"),F.date("bg.sterDone","Date completed"),
      F.seg("bg.sterResult","Result",[["clear","Clear","good"],["review","Needs review","bad"]],true),F.init("bg.sterInit")])}
    ${group("Notifications",[F.date("notify.applicant","Applicant notified"),F.init("notify.applicantInit")])}
    ${admin ? `<section class="group noiv"><h3><span>Orientation</span></h3><div class="ios" id="orientBox"></div></section>
      <section class="group noiv" id="orDocsGroup" hidden><h3><span>Orientation documents</span>${S.canEdit ? `<button class="btn small" type="button" data-oact="reqdocs">Request documents</button>` : ""}</h3><div class="ios" id="orDocs"></div></section>
      <section class="group noiv"><h3><span>Trainer sign-offs</span>${S.canEdit ? `<button class="btn small" type="button" data-oact="trainers">Assign</button>` : ""}</h3><div class="ios" id="trainBox"></div></section>
      <section class="group noiv"><h3><span>Check-ins</span></h3><div class="ios" id="checkinBox"></div></section>` : ""}
    ${group("Duty crew",[`<div class="row"><span class="lbl">Applicant phone<small id="phoneEcho">—</small></span><button class="copy" type="button" data-copy="phone">Copy</button></div>`,F.date("notify.chief","Chief notified"),F.init("notify.chiefInit")])}
    ${group("Email account",[`<div class="row"><span class="lbl">Applicant email<small id="emailEcho">—</small></span><button class="copy" type="button" data-copy="email">Copy</button></div>`,F.date("notify.tech","Technology chair notified"),F.init("notify.techInit")])}
    ${group("New-member checklist",[F.note("After the board approves them: the date each item was done. Edit the list in Settings.", "onbnote"),...onbItems().map(([k,l]) => F.date(`onb.items.${k}`, esc(l)))],"",`<small id="onbCount" style="font-weight:500;color:var(--fg3)"></small>`)}
    ${group("Mentor",[F.note("Pair each new member with an experienced member for their first year. You'll get a To do if a month goes by without a check-in."),
      F.text("onb.mentor","Mentor","Member's name"),F.date("onb.mentorSince","Paired on"),F.date("onb.mentorCheck","Last check-in"),F.area("onb.mentorNotes","Notes","How it's going")],"")}
    ${group("Expiration dates",[F.note("You'll get a To do 30 days before any of these expire."),`<div class="row"><span class="lbl">Driver's license<small>Entered on the Checks tab</small></span><b id="dlExpEcho">—</b></div>`,
      F.date("onb.cprExpires","CPR / BLS card expires"),F.text("onb.emtCard","EMT card number","Card #"),F.date("onb.emtExpires","EMT card expires")])}
  </div>
  <section class="group" style="margin-top:18px"><h3><span>Full checklist</span></h3><div class="ios" id="miles"></div></section>`;
  if (tab === "msgs") return `<div class="msgpane">
    <div class="ios"><div class="thread staffview" id="dThread"></div></div>
    <p class="help" id="msgNote" style="margin:8px 4px 0"></p>
    ${S.sched ? `<div class="ios composer-box"><div class="row qreplies" id="qReplies">${quickRepliesHTML()}</div><label class="row stack"><span class="lbl">Reply</span><textarea id="replyText" rows="3" maxlength="2000" placeholder="Write a reply… (⌘↩ to send)"></textarea></label>
      <div class="row"><label class="lbl" style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="replyMail" checked style="width:auto"> Also open an email in Mail to let them know</label>
        <button class="btn primary" type="button" data-reply>Send reply</button></div></div>` : `<div class="viewonly"><b>View only.</b> Only the owner replies to applicants.</div>`}
  </div>`;
  if (tab === "notes") return `<div class="cols">
    ${group("Admin notes",[`<label class="row stack"><span class="lbl">Only admins see these</span><textarea id="f-notes" data-k="notes" rows="10" placeholder="Anything about this applicant that should stay off the member view"></textarea></label>`])}
    ${group("Status",[F.seg("status","Override",[["open","In process"],["hold","On hold","warn"],["declined","Declined","bad"],["withdrawn","Withdrawn"]],true),
      F.note("“In process” lets the checklist set the stage automatically. Declined is never shown to the applicant; their portal reads as under review until the administrator's letter arrives.")])}
    <section class="group"><h3><span>Change history</span><small id="histNote" style="font-weight:500;color:var(--fg3)">Every edit, by whom and when</small></h3><div class="ios hist" id="histList"></div></section>
    <section class="group"><h3><span>Remove</span></h3><div class="ios"><div class="row"><span class="lbl">Delete this applicant, their portal and uploads</span><button class="btn small danger" type="button" id="delBtn">Delete</button></div>
      <div class="row" id="delConfirm" hidden><span class="lbl">This can't be undone.</span><button class="btn small" type="button" id="delCancel">Cancel</button><button class="btn small danger" type="button" id="delYes">Delete permanently</button></div></div></section>
  </div>`;
  return "";
}

/* ---------- state ---------- */
const S = { oslots:new Map(), checkins:new Map(), signoffs:new Map(), library:[], msgs:[], records:[], requests:[], shared:new Map(), secure:new Map(), apps:new Map(), portal:new Map(), slots:new Map(), staff:new Map(), files:[], hist:[], feedFiles:[],
  sel:null, tab:"app", filter:"all", q:"", admin:false, owner:false, me:"", settings:{}, ready:false };
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
};
// People moved to orientation are listed apart from applicants (sidebar "Orientation", phone menu "Orientation").
const inOrient = a => S.admin && orientOpen(a) && progress(a).stage !== "act";
const orientStat = a => { const c = orientCounts(a), s = orientSession(a._id), l = orientDaysLeft(a);
  return { pill: "Orientation", head: `Orientation: ${c.done} of ${c.total} done`, sub: [s ? "Session " + slotLong(s.start) : "No session booked yet", l === null ? "" : l < 0 ? `${-l} days late` : `due ${longDate(orientDue(a))}`].filter(Boolean).join(" · ") }; };
const stat = (a, p) => inOrient(a) ? orientStat(a) : statusOf(a, p);
const filterLabel = k => k==="all" ? "All applicants" : k==="orient" ? "In orientation" : k==="board" ? "Board queue" : PSEUDO[k] ? PSEUDO[k].label : STAGES[k].label;
const filterColor = k => k==="all" ? "var(--fg3)" : k==="board" ? "var(--s-appr)" : k==="orient" ? "var(--s-act)" : stageVar(k);
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
  rows.forEach(r => { r.or = inOrient(r.a); });
  const counts = {all:0, board:0, orient:0}; rows.forEach(r => { if (r.or) { counts.orient++; return; } counts.all++; counts[r.p.stage] = (counts[r.p.stage]||0)+1; if (S.admin && inBoardQueue(r.a)) counts.board++; });
  const base = S.admin ? ["all","board","screen","int","appr","onb","act","hold","dec","wd"] : ["all","screen","int","appr","onb","act","hold","dec","wd","open"];
  const keys = base.filter(k => k==="all" || k==="board" || counts[k] || (S.admin && ["screen","int","appr","onb"].includes(k)));
  if (!keys.includes(S.filter) && !PSEUDO[S.filter] && !(S.filter === "orient" && S.admin)) S.filter = "all";
  $("#chips").innerHTML = keys.map(k => `<button class="nav-i" type="button" data-f="${k}" aria-pressed="${S.filter===k}" style="--stage-c:${filterColor(k)}"><span class="ndot"></span><span class="nl">${k==="all"?"All":filterLabel(k)}</span><b>${counts[k]||0}</b></button>`).join("")
    + (S.admin ? `<div class="navh navh2">Orientation</div><button class="nav-i" type="button" data-f="orient" aria-pressed="${S.filter==="orient"}" style="--stage-c:${filterColor("orient")}"><span class="ndot"></span><span class="nl">New members</span><b>${counts.orient}</b></button>` : "");
  if (S.admin) keys.push("orient");
  { const mo = $('#mnav [data-m="orient"]'); if (mo) { mo.hidden = !S.admin; const nb = mo.querySelector(".navbadge"); if (nb) { nb.textContent = counts.orient || ""; nb.hidden = !counts.orient; } } }
  $("#chipsMini").innerHTML = keys.map(k => `<button class="chip" type="button" data-f="${k}" aria-pressed="${S.filter===k}">${k==="all"?"All":filterLabel(k)} <b>${counts[k]||0}</b></button>`).join("");
  $("#boardBtn").hidden = !S.admin;
  { const bb = $("#boardBtn"); let n = bb.querySelector(".navbadge"); if (!n) { n = document.createElement("b"); n.className = "navbadge soft"; bb.appendChild(n); } n.textContent = counts.board || ""; n.hidden = !counts.board; }
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
  const inFilter = r => S.filter==="orient" ? r.or : r.or ? (S.filter==="all" && !!q) : S.filter==="all" || (S.filter==="board" ? inBoardQueue(r.a) : PSEUDO[S.filter] ? PSEUDO[S.filter].test(r.a, r.p) : r.p.stage===S.filter);
  const vis = rows.filter(r => inFilter(r) && match(r.a));
  if (SORTS[S.sort]) vis.sort((x,y) => SORTS[S.sort](x,y) || (x.a.name||"").localeCompare(y.a.name||""));
  S.vis = vis.map(r => r.a._id);
  { const pool = S.filter === "orient" ? S.counts.orient : S.counts.all; $("#rosterCount").textContent = S.ready ? (vis.length === pool ? String(pool) : `${vis.length} of ${pool}`) : ""; }
  const L = $("#list");
  if (!S.sel) renderOverview();
  if (!S.ready) { L.innerHTML = `<div class="empty"><span class="spin" aria-hidden="true"></span><h3>Loading roster…</h3></div>`; return; }
  if (!rows.length) { L.innerHTML = S.member ? `<div class="empty"><h3>Messages only</h3>Your account is for squad messages. Ask the membership coordinator if you need to interview someone.</div>`
    : S.role === "interviewer" ? `<div class="empty"><h3>No interviews assigned</h3>Applicants you're assigned to interview show up here.</div>`
    : `<div class="empty"><h3>No applicants yet</h3>When an application comes in, click <strong>New applicant</strong> or press <kbd>N</kbd> to start their file.</div>`; return; }
  if (!vis.length) { L.innerHTML = `<div class="empty"><h3>${S.filter==="board"&&!q?"Board queue is empty":"No matches"}</h3>${S.filter==="board"&&!q?"Applicants show up here once the committee approves them.":q?`Nothing matches “${esc(S.q.trim())}”${S.filter!=="all"?` in ${esc(filterLabel(S.filter))}`:""}.`:"Try a different stage."}</div>`; return; }
  L.innerHTML = vis.map(({a,p}) => {
    const d = daysSince(get(a,"app.received"));
    const iv = a._booked ? `${slotDay(a._booked.start)} · ${slotTime(a._booked.start)}` : get(a,"sched.scheduled") ? `${fmtDate(get(a,"sched.scheduled"))}${get(a,"sched.time")?" · "+get(a,"sched.time"):""}` : "";
    const nextLine = S.admin
      ? `<strong>${esc(stat(a, p).head)}</strong>`
      : (get(a,"sched.completed") ? "Interview completed" : iv ? `Interview: <strong>${esc(iv)}</strong>` : "Interview not scheduled yet");
    const inProc = d != null && IN_PROCESS.includes(p.stage);
    return `<button class="arow${S.bulk?.has(a._id) ? " picked" : ""}" type="button" data-id="${esc(a._id)}" aria-current="${S.sel===a._id}"${S.bulk ? ` aria-pressed="${S.bulk.has(a._id)}"` : ""} style="--stage-c:${stageVar(p.stage)}">
      ${S.bulk ? `<span class="bulkck" aria-hidden="true">${S.bulk.has(a._id) ? "✓" : ""}</span>` : ""}<span class="av" aria-hidden="true">${esc(initials(a.name))}</span>
      <span class="ab">
        <span class="r1"><span class="nm">${hl(a.name||"Unnamed applicant", q)}</span><span class="pill">${esc(S.admin ? stat(a, p).pill : STAGES[p.stage].label)}</span></span>
        <span class="meta">${milestoneChip(a)}${get(a,"app.source") === "online" ? `<span class="srctag" title="Applied online">Online</span>` : ""}${[a.type,loc(a),inProc?`${d} day${d===1?"":"s"}`:null].filter(Boolean).map(esc).join(" · ")||"Details not entered"}</span>
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

/* ---------- to do (overview) ---------- */
// For each applicant in process: what needs doing next, most actionable first. "Waiting" states aren't listed.
const okEmail = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || "").trim());
// New-member checklist (Onboard tab). The owner edits the list in Settings; each item's key comes from its label.
// PVRS's mandatory new-member sheet (Dkota's paper form, Nov 4), required before issuing equipment or running calls. Edit in Settings.
const DEFAULT_ONB = ["Completed application", "Copy of driver's license", "Copy of training records (EMT, CPR, etc.)", "Insurance beneficiary card, completed",
  "Copy of health physical, record of PPD, Hep B record or refusal", "Verification of completion of IS-100, IS-700", "Verification of Blood Borne Pathogen training",
  "SOP/Constitution acceptance form", "Confidentiality statement", "Equipment request", "Orientation form completed, signed by member and orientation committee member"];
// The starter list from before the real sheet: anyone still on it moves to the real list automatically.
const OLD_ONB = ["ID badge issued", "Uniform and gear issued", "Building access set up", "Paging / dispatch app set up", "Orientation completed", "CPR / BLS", "EVOC (drivers)", "ICS-100", "ICS-700", "HIPAA training", "Bloodborne pathogens training"];
const onbKey = l => String(l).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "item";
const onbRaw = () => Array.isArray(S.settings.onbItems) && S.settings.onbItems.join("|") !== OLD_ONB.join("|") ? S.settings.onbItems : DEFAULT_ONB;
const onbItems = () => onbRaw().map(l => { const label = String(l).split("|")[0].trim(); return [onbKey(label), label]; });
const onbLink = key => { const hit = onbRaw().find(l => onbKey(String(l).split("|")[0].trim()) === key), u = hit && String(hit).split("|")[1]?.trim(); return u && /^https:\/\//.test(u) ? u : ""; };
// Starter list for trainer sign-offs; edit it in Settings.
const DEFAULT_SKILLS = ["Rig and equipment walkthrough", "Radio and dispatch procedures", "Stretcher and stair chair", "First duty shift", "Second duty shift"];
const skillItems = () => (Array.isArray(S.settings.skillItems) ? S.settings.skillItems : DEFAULT_SKILLS).map(l => [onbKey(l), l]);
// Expiration dates to watch (To do 30 days ahead and once expired), for anyone in process or approved.
const EXPIRES = [["dl.expires", "Driver's license", "checks"], ["onb.cprExpires", "CPR / BLS card", "onb"], ["onb.emtExpires", "EMS certification", "onb"]];
// Data retention: declined/withdrawn files untouched for longer than settings.retentionYears get flagged for the owner
// to review and delete. Nothing is deleted automatically.
const retentionYears = () => { const y = parseInt(S.settings.retentionYears, 10); return y > 0 ? y : 0; };
const lastTouched = a => Math.max(a.updatedAt || 0, a.secUpdatedAt || 0, a.createdAt || 0);
const pastRetention = () => { const y = retentionYears(); if (!y) return [];
  return [...S.apps.values()].filter(a => (isDeclined(a) || a.status === "withdrawn") && lastTouched(a) && Date.now() - lastTouched(a) > y * 365.25 * 864e5)
    .sort((x, y2) => lastTouched(x) - lastTouched(y2)); };
function openRetention(){
  if (!S.canEdit) return ownerOnlyToast();
  const list = pastRetention(), y = retentionYears();
  const when = a => new Date(lastTouched(a)).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const M = openModal(`<h3>Old files to review</h3>
    <p class="help">${y ? `Declined and withdrawn files with no changes in more than ${y} year${y === 1 ? "" : "s"} (Settings → Data retention). Tick the ones to delete. Deleting removes everything the desk holds for them and can't be undone.` : "Data retention is off. Set it in Settings."}</p>
    <div class="ios">${list.length ? list.map(a => `<label class="row"><span class="lbl">${esc(a.name || "Unnamed")}<small>${isDeclined(a) ? "Declined" : "Withdrawn"} · last changed ${esc(when(a))}</small></span><input type="checkbox" data-retid="${esc(a._id)}" checked style="width:auto"></label>`).join("")
      : `<div class="row"><span class="lbl">Nothing past the retention period.</span></div>`}</div>
    <p class="help">🔒 Secure documents stay with ${esc(PAPERWORK_EMAIL)}; ask them to delete those too.</p>
    <div class="acts"><button class="btn" type="button" data-x>Close</button>${list.length ? `<button class="btn danger" type="button" id="retGo">Delete selected</button>` : ""}</div>`);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const go = e.target.closest("#retGo"); if (!go) return;
    const ids = [...M.querySelectorAll("[data-retid]:checked")].map(x => x.dataset.retid);
    if (!ids.length) return toast("Tick at least one file.");
    if (go.dataset.confirm !== "1") { go.dataset.confirm = "1"; go.textContent = `Confirm: delete ${ids.length} permanently`; return; }
    go.disabled = true;
    for (const id of ids) await deleteApplicant(id, true);
    closeModal(); toast(`Deleted ${ids.length} old file${ids.length === 1 ? "" : "s"}`);
  };
}
function todoItems(){
  const out = [];
  if (S.owner) { const seen = new Set(); for (const a of S.apps.values()) for (const b of dupesOf(a)) { const key = [a._id, b._id].sort().join("|"); if (seen.has(key)) continue; seen.add(key);
    out.push({ id: a._id, a, pri: 0, text: `Possible duplicate: ${a.name || "Unnamed"}`, sub: `Also on file as ${b.name || "Unnamed"} (${dupeWhy(a, b)})`, tab: "app", act: "dupe", btn: "Review", age: 0 }); } }
  const old = pastRetention();
  if (old.length) out.push({ id: old[0]._id, a: old[0], pri: 3, text: `Review ${old.length === 1 ? "an old file" : old.length + " old files"} past the ${retentionYears()}-year retention`, sub: old.map(a => a.name).slice(0, 3).join(", ") + (old.length > 3 ? "…" : ""), tab: "notes", act: "retention", btn: "Review", age: 0 });
  for (const a of S.apps.values()) {
    if (isDeclined(a) || ["withdrawn"].includes(a.status)) continue;
    const id = a._id, add = (pri, text, sub, tab) => out.push({ id, a, pri, text, sub, tab, age: 0 });
    for (const [k, label, tab] of EXPIRES) {
      const d = get(a, k); if (!d) continue;
      const days = Math.round((new Date(d + "T12:00") - Date.now()) / 864e5);
      if (days <= 30) add(1, days < 0 ? `${label} expired` : `${label} expires ${days === 0 ? "today" : days === 1 ? "tomorrow" : "in " + days + " days"}`, fmtDate(d), tab);
    }
    const bd = get(a, "board.date");
    if (get(a, "board.result") === "approved" && (!bd || daysSince(bd) <= 365)) {
      const its = onbItems(), left = its.filter(([k]) => !get(a, `onb.items.${k}`));
      if (its.length && left.length) add(3, "Finish the new-member checklist", `${its.length - left.length} of ${its.length} done · next: ${left[0][1]}`, "onb");
      // mentor: every new member gets a buddy for their first year, with a check-in at least monthly
      const fn = first(a.name) || "them", mentor = get(a, "onb.mentor"), last = get(a, "onb.mentorCheck") || get(a, "onb.mentorSince");
      if (!mentor) add(2, `Pair ${fn} with a mentor`, "A buddy for their first year on the squad", "onb");
      else if (!last || daysSince(last) > 30) add(3, `Mentor check-in for ${fn}`, `${mentor} · ${last ? "last check-in " + fmtDate(last) : "no check-in yet"}`, "onb");
    }
    // membership anniversaries in the next week (a year or more since the board approved them)
    if (get(a, "board.result") === "approved" && bd) {
      const j = new Date(bd + "T12:00"), now = new Date(), yrs = now.getFullYear() - j.getFullYear();
      for (const y of [yrs, yrs + 1]) { if (y < 1) continue;
        const ann = new Date(j); ann.setFullYear(j.getFullYear() + y);
        const days = Math.round((ann - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)) / 864e5);
        if (days >= 0 && days <= 7) { add(4, `${first(a.name) || a.name}'s ${y}-year anniversary${days === 0 ? " is today" : ""}`, `Joined ${longDate(bd)}${days ? " · in " + days + " day" + (days === 1 ? "" : "s") : ""}`, "onb"); break; } }
    }
  }
  for (const a of S.apps.values()) {
    const p = progress(a); if (!IN_PROCESS.includes(p.stage)) continue;
    const id = a._id, g = k => get(a, k), rs = refStatus(a), fn = first(a.name) || "them";
    const age = daysSince(g("app.received")) || 0;
    const add = (pri, text, sub, tab, act, btn) => out.push({ id, a, pri, text, sub, tab, act, btn, age });
    const nudge = [1,2,3,4].filter(i => refNudge(a, i));
    if (nudge.length) add(1, `Remind ${nudge.length === 1 ? "a reference" : nudge.length + " references"}`, nudge.map(i => g(`refs.r${i}.name`)).join(", ") + " · no answer in 7+ days", "checks", "refsall", "Send reminders");
    const unsent = rs.list.filter(r => !r.received && !g(`refs.r${r.i}.form`) && !g(`refs.r${r.i}.contacted`) && okEmail(g(`refs.r${r.i}.email`)));
    if (!rs.done && unsent.length) add(1, `Send ${unsent.length === 1 ? "a reference form" : unsent.length + " reference forms"}`, unsent.map(r => r.name).join(", "), "checks", "refsall", "Email forms");
    const step = MILESTONES.findIndex(m => !m[1](a));
    const welcome = !g("portal.invited") && okEmail(a.email) && step <= 5;
    if (welcome) add(0, `Welcome ${fn}`, "Portal invite, welcome message and email in one step", "app", "invite", "Welcome");
    // stalled: nothing changed in two weeks (except when it's just waiting for the next board meeting)
    const idle = lastTouched(a) ? Math.floor((Date.now() - lastTouched(a)) / 864e5) : 0;
    if (idle >= 14 && step !== 8) add(1, `No movement in ${idle} days`, `Next: ${p.next || "—"}`, STEP_TAB[step] || "app", "nextgo", "Go to it");
    switch (step) {
      case 0: add(2, "Enter the date the application came in", "", "app"); break;
      case 1: add(2, g("app.complete") === "no" ? "Follow up on the incomplete application" : "Review the application", g("app.notified") ? "Notified " + fmtDate(g("app.notified")) : "", "app"); break;
      case 2: if (!g("mvr.requestInit")) add(2, "Request the driving record (MVR)", "", "checks"); break;
      case 3: add(2, "Verify the driver's license", "", "checks"); break;
      case 4: if (!rs.list.length) add(2, "Add references", "None entered yet", "checks"); break;
      case 5:
        if (welcome) break;
        else if (g("portal.invited") && g("portal.bookingOpen") !== "yes") add(2, "Open interview booking", `${fn} can then pick a time`, "app", "booking", "Open booking");
        else if (!okEmail(a.email)) add(2, "Schedule the interview", "No email on file, so book it for them", "iv");
        break;
      case 6: { const when = a._booked ? a._booked.start : g("sched.scheduled") ? new Date(g("sched.scheduled") + "T12:00").getTime() : 0;
        if (when && when < Date.now()) add(2, "Mark the interview completed", "Was " + fmtDate(new Date(when).toISOString().slice(0, 10)), "iv"); break; }
      case 7: add(2, "Committee decision", "Interview done " + fmtDate(g("sched.completed")), "iv"); break;
      case 8: if (!g("board.date")) add(3, "Ready for the board", rs.done ? "On the board queue" : "", "board"); break;
      case 9: if (!g("bg.sterReq")) add(2, "Request the Sterling background check", "Approved by the board " + (g("board.date") ? fmtDate(g("board.date")) : ""), "onb"); break;
      case 10: add(2, `Let ${fn} know they're approved`, "", "onb"); break;
      case 11: if (orientReady(a)) add(1, `Move ${fn} to orientation`, "Sterling is complete and clear", "onb", "omove", "Move"); else if (get(a, "bg.sterResult") === "review") add(1, `Review ${fn}'s Sterling result`, "Orientation stays locked until it's clear", "onb"); break;
      case 12: add(2, "Notify the chief for duty crew", "", "onb", "handoff_chief", "Draft email"); break;
      case 13: add(2, "Ask the tech chair for an email account", "", "onb", "handoff_tech", "Draft email"); break;
    }
  }
  out.push(...orientToDo());
  return out.sort((x, y) => x.pri - y.pri || y.age - x.age);
}
// The interview coordinator's To do: only the interview work, each with the button that does it.
const COORD_ACTS = new Set(["book", "assigniv", "slots", "ivmail", "booking"]);
function coordItems(){
  const out = [], now = Date.now();
  const openTimes = [...S.slots.values()].filter(s => !s.bookedBy && s.start > now + 864e5).length;
  let waiting = 0, firstWaiting = null;
  for (const a of S.apps.values()) {
    const p = progress(a); if (!IN_PROCESS.includes(p.stage) || isDeclined(a) || get(a, "sched.completed")) continue;
    const id = a._id, g = k => get(a, k), fn = first(a.name) || "them", step = MILESTONES.findIndex(m => !m[1](a));
    const bookOpen = g("portal.bookingOpen") === "yes", when = a._booked ? a._booked.start : g("sched.scheduled") ? new Date(g("sched.scheduled") + "T12:00").getTime() : 0;
    if (!when && !bookOpen && step < 5) continue;   // not at the interview step yet
    const age = daysSince(g("app.received")) || 0, add = (pri, text, sub, act, btn) => out.push({ id, a, pri, text, sub, tab: "iv", act, btn, age });
    const crew = Array.isArray(a.interviewers) ? a.interviewers : [];
    if (when) {
      if (when < now) add(0, `Mark ${fn}'s interview completed`, "Was " + fmtDate(isoDay(when)));
      else if (!crew.length) add(1, `Pick who interviews ${fn}`, "Interview " + (a._booked ? slotLong(when) : fmtDate(g("sched.scheduled"))), "assigniv", "Assign");
      continue;
    }
    waiting++; firstWaiting = firstWaiting || a;
    if (!g("portal.invited") || !okEmail(a.email)) add(1, `Schedule ${fn}'s interview`, g("portal.invited") ? "No email on file, so book it for them" : "Not on the portal yet, so call and book it for them", "book", "Book a time");
    else if (!bookOpen) add(1, `Open interview booking for ${fn}`, `${fn} can then pick a time in the portal`, "booking", "Open booking");
    else if (!g("sched.contacted")) add(1, `Tell ${fn} interview times are open`, "Opens the interview email. Enter the contacted date after you send it", "ivmail", "Email");
    else if (daysSince(g("sched.contacted")) >= 5) add(2, `${fn} hasn't picked a time`, `Contacted ${fmtDate(g("sched.contacted"))}. Follow up, or book it for them`, "book", "Book a time");
  }
  if (waiting && openTimes < waiting) out.push({ id: firstWaiting._id, a: firstWaiting, pri: 0, text: openTimes ? "Add more interview times" : "Post interview times", sub: `${waiting} waiting to interview · ${openTimes} open time${openTimes === 1 ? "" : "s"}`, tab: "iv", act: "slots", btn: "Add times", age: 0 });
  return out.sort((x, y) => x.pri - y.pri || y.age - x.age);
}
function todoCard(){
  if (!S.admin) return "";
  const items = S.coord ? coordItems() : todoItems(), shown = S.todoAll ? items : items.slice(0, 6);
  return `<section class="ovcard todo"><h3>${S.coord ? "Interviews to do" : "To do"}<small>${items.length ? items.length + " thing" + (items.length === 1 ? "" : "s") : "all caught up"}</small></h3><div class="olist">${shown.length ? shown.map(x => `<div class="oitem todoitem">
      <button class="todomain" type="button" data-todo="${esc(x.id)}" data-totab="${esc(x.tab)}"><span class="av" style="--stage-c:${stageVar(view(x.a).stage)}" aria-hidden="true">${esc(initials(x.a.name))}</span>
        <span class="ot"><b>${esc(x.text)}</b><small>${esc(x.a.name || "Applicant")}${x.sub ? " · " + esc(x.sub) : ""}</small></span></button>
      ${x.act && (S.canEdit || (S.sched && COORD_ACTS.has(x.act))) ? `<button class="btn small primary" type="button" data-todoact="${esc(x.act)}" data-id="${esc(x.id)}">${esc(x.btn)}</button>` : `<span class="when">${x.age ? x.age + "d" : ""}</span>`}</div>`).join("")
    : `<div class="oempty">Nothing needs you right now. 🎉</div>`}
    ${items.length > 6 ? `<button class="oitem showall" type="button" data-cmd="todoall">${S.todoAll ? "Show fewer" : `Show all ${items.length}`}</button>` : ""}</div></section>`;
}

/* ---------- year at a glance (overview) ---------- */
// Three headline numbers and one single-hue column chart (applications per month, last 12 months).
// Every value is also in a screen-reader table; hovering or focusing a column shows its value.
function statsData(){
  const now = new Date(), yr = now.getFullYear(), months = [];
  for (let k = 11; k >= 0; k--) { const d = new Date(yr, now.getMonth() - k, 1); months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, d, n: 0 }); }
  let apps = 0, joined = 0, declined = 0, withdrew = 0; const waits = [], heard = new Map();
  // Funnel: this year's applications, how many reached each step (milestone index in MILESTONES; -1 = fully active)
  const funnel = [["Applied", 0], ["References in", 4], ["Interviewed", 6], ["Board approved", 8], ["Active member", -1]].map(([label, i]) => ({ label, i, n: 0 }));
  for (const a of S.apps.values()) {
    const rec = get(a, "app.received"), bd = get(a, "board.date"), ok = get(a, "board.result") === "approved";
    if (rec && rec.startsWith(String(yr))) { const p = progress(a); for (const f of funnel) if (f.i === -1 ? p.cur === -1 : p.done[f.i]) f.n++;
      if (isDeclined(a)) declined++; else if (a.status === "withdrawn") withdrew++; }
    if (rec) { const m = months.find(x => rec.startsWith(x.key)); if (m) m.n++; if (rec.startsWith(String(yr))) apps++; }
    const h = get(a, "app.heard"); if (h && rec && rec.startsWith(String(yr))) heard.set(h, (heard.get(h) || 0) + 1);
    if (ok && bd && bd.startsWith(String(yr))) joined++;
    if (ok && rec && bd && daysSince(bd) <= 365) waits.push(Math.max(0, Math.round((new Date(bd + "T12:00") - new Date(rec + "T12:00")) / 864e5)));
  }
  return { funnel, declined, withdrew, heard: [...heard].sort((x, y) => y[1] - x[1]), months, apps, joined, avg: waits.length ? Math.round(waits.reduce((x, y) => x + y, 0) / waits.length) : null, yr };
}
function statsCard(){
  if (!S.admin) return "";
  const st = statsData(), max = Math.max(1, ...st.months.map(m => m.n)), top = Math.max(...st.months.map(m => m.n));
  const mname = (d, f) => d.toLocaleDateString(undefined, { month: f });
  return `<section class="ovcard stats"><h3>Year at a glance<small>${st.yr}</small></h3>
    <div class="kpis"><div class="kpi"><b>${st.apps}</b><span>Applications this year</span></div><div class="kpi"><b>${st.joined}</b><span>Approved by the board this year</span></div>
      <div class="kpi"><b>${st.avg == null ? "—" : st.avg}</b><span>${st.avg == null ? "Days to board (no approvals yet)" : "Average days from application to board"}</span></div></div>
    ${funnelHTML(st)}
    <div class="mchart"><h4>Applications per month</h4>
      <div class="mbars" aria-hidden="true">${st.months.map(m => `<button type="button" class="bcol" tabindex="-1" data-mv="${m.n}" data-ml="${esc(mname(m.d, "long") + " " + m.d.getFullYear())}">${m.n && m.n === top ? `<span class="cap">${m.n}</span>` : ""}${m.n ? `<i style="height:${Math.max(4, Math.round(m.n / max * 100))}%"></i>` : ""}</button>`).join("")}</div>
      <div class="mlabels" aria-hidden="true">${st.months.map(m => `<span>${esc(mname(m.d, "short").slice(0, 3))}</span>`).join("")}</div>
      <table class="sr-only"><caption>Applications per month, last 12 months</caption><thead><tr><th scope="col">Month</th><th scope="col">Applications</th></tr></thead>
        <tbody>${st.months.map(m => `<tr><th scope="row">${esc(mname(m.d, "long") + " " + m.d.getFullYear())}</th><td>${m.n}</td></tr>`).join("")}</tbody></table>
      <div class="mtip" id="mtip" hidden></div></div>
    ${st.heard.length ? `<div class="hchart"><h4>How applicants heard about us</h4>${st.heard.map(([k, n]) => `<div class="hrow"><span>${esc(k)}</span><i style="--w:${Math.round(n / st.heard[0][1] * 100)}%"></i><b>${n}</b></div>`).join("")}</div>` : ""}
    <div class="statacts"><button class="btn small" type="button" data-cmd="yearreport">Year-end report</button><button class="btn small" type="button" data-cmd="flyer">Recruiting flyer</button></div></section>`;
}
// How far this year's applicants got, as shrinking bars with the share of everyone who applied.
function funnelHTML(st){
  const top = st.funnel[0].n; if (!top) return "";
  const lost = [st.declined && `${st.declined} declined`, st.withdrew && `${st.withdrew} withdrew`].filter(Boolean).join(" · ");
  return `<div class="funnel"><h4>How far applicants get</h4>
    ${st.funnel.map((f, i) => { const pc = Math.round(f.n / top * 100); return `<div class="frow" style="--i:${i}"><span class="fl">${esc(f.label)}</span><span class="fbar"><i style="width:${Math.max(f.n ? 6 : 0, pc)}%"></i></span><b>${f.n}</b><small>${i ? pc + "%" : ""}</small></div>`; }).join("")}
    ${lost ? `<p class="flost">${esc(lost)}</p>` : ""}</div>`;
}
// Printable recruiting flyer: big headline, what each membership type means, and a QR code to /apply?src=flyer
// (the application then pre-picks "Flyer or poster", so Year at a glance shows how many people the flyers bring in).
async function printFlyer(){
  const { qrSVG } = await import("./qr.js");
  const url = `${location.origin}/apply?src=flyer`;
  printHTML(`<section class="flyer"><img src="/img/logo.png" alt="Potsdam Volunteer Rescue Squad">
    <h1>Join Potsdam's volunteer EMS</h1>
    <p class="fl-lead">EMTs, drivers and support members serving Potsdam around the clock. No experience needed: the squad pays for your EMT class.</p>
    <div class="fl-mid"><div class="fl-qr">${qrSVG(url, { size: 260 })}<b>Scan to apply</b><span>About 15 minutes, saves as you go</span></div>
      <ul><li><b>Make a difference</b> in your community</li><li><b>Free EMT training</b> for new members</li><li><b>Flexible</b> duty crew scheduling</li><li><b>Friends for life</b> on the squad</li></ul></div>
    <p class="fl-foot">${esc(url.replace(/^https?:\/\//, "").replace("?src=flyer", ""))} · ${esc(CONTACT_EMAIL)}</p></section>`);
}
// Year-end report for the annual meeting: the year's numbers, the funnel, months and where applicants heard about PVRS.
function printYearReport(){
  const st = statsData(), lost = [st.declined && `${st.declined} declined`, st.withdrew && `${st.withdrew} withdrew`].filter(Boolean).join(", ");
  const top = st.funnel[0].n || 0;
  printHTML(`<section class="yr"><header><img src="/img/logo.png" alt=""><div><div class="pk-k">Membership committee</div><h1>${st.yr} membership report</h1>
      <div class="pk-s">Prepared ${esc(longDate(today()))}</div></div></header>
    <div class="yr-kpis"><div><b>${st.apps}</b><span>Applications</span></div><div><b>${st.joined}</b><span>Approved by the board</span></div><div><b>${st.avg == null ? "—" : st.avg}</b><span>Average days, application to board</span></div></div>
    <h2>How far applicants got</h2><table>${st.funnel.map(f => `<tr><th>${esc(f.label)}</th><td>${f.n}</td><td>${top ? Math.round(f.n / top * 100) + "%" : "—"}</td></tr>`).join("")}${lost ? `<tr><th>Did not continue</th><td colspan="2">${esc(lost)}</td></tr>` : ""}</table>
    <h2>Applications by month</h2><table>${st.months.map(m => `<tr><th>${esc(m.d.toLocaleDateString(undefined, { month: "long", year: "numeric" }))}</th><td colspan="2">${m.n}</td></tr>`).join("")}</table>
    ${st.heard.length ? `<h2>How applicants heard about PVRS</h2><table>${st.heard.map(([k, n]) => `<tr><th>${esc(k)}</th><td colspan="2">${n}</td></tr>`).join("")}</table>` : ""}
    <p class="yr-foot">Potsdam Volunteer Rescue Squad · Membership Desk</p></section>`);
}
function statsHover(e){
  const col = e.target.closest?.(".bcol"), tip = $("#mtip");
  if (!tip) return;
  if (!col) { tip.hidden = true; return; }
  const box = col.closest(".mchart").getBoundingClientRect(), r = col.getBoundingClientRect();
  tip.textContent = "";
  const b = document.createElement("b"); b.textContent = `${col.dataset.mv} application${col.dataset.mv === "1" ? "" : "s"}`;
  tip.append(b, document.createTextNode(col.dataset.ml));
  // Sit just above the hovered bar (or the baseline for an empty month), clear of the neighbouring value label.
  const bar = col.querySelector("i"), y = (bar ? bar.getBoundingClientRect().top : r.bottom) - box.top - 8;
  tip.style.left = `${Math.min(box.width - 70, Math.max(70, r.left - box.left + r.width / 2))}px`; tip.style.top = `${y}px`; tip.hidden = false;
}

/* ---------- overview (nothing selected) ---------- */
function renderOverview(){
  const D = $("#detail"); if (!D || S.sel || S.chatOn) return;
  $("#app").classList.remove("open");
  $("#overviewBtn").classList.add("on");
  const keepScroll = D.querySelector(".ov")?.scrollTop || 0;
  if (!S.ready) { D._ovHTML = ""; D.innerHTML = `<div class="empty"><span class="spin" aria-hidden="true"></span><h3>Loading…</h3></div>`; return; }
  if (S.role === "interviewer") return renderMyInterviews(D);
  const rows = sorted(), now = Date.now(), wk = now + 7*864e5;
  const c = S.counts || {};
  const inProc = rows.filter(r => IN_PROCESS.includes(r.p.stage));
  const booked = [...S.slots.values()].filter(s => s.bookedBy && s.start > now - 2*36e5 && S.apps.has(s.bookedBy)).sort((x,y) => x.start - y.start);
  const thisWeek = booked.filter(s => s.start < wk).length;
  const hour = new Date().getHours(), greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const oitem = (a, right, sub) => `<button class="oitem" type="button" data-open="${esc(a._id)}"><span class="av" style="--stage-c:${stageVar(view(a).stage)}" aria-hidden="true">${esc(initials(a.name))}</span><span class="ot"><b>${esc(a.name||"Unnamed applicant")}</b><small>${sub}</small></span><span class="when">${right}</span></button>`;
  const ivList = booked.slice(0,5).map(s => { const a = S.apps.get(s.bookedBy); const d = new Date(s.start);
    return oitem(a, `<b>${esc(d.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}))}</b>${esc(slotTime(s.start))}`, esc([a.type, s.location].filter(Boolean).join(" · ") || "Interview")); }).join("");
  // One strip of stage counts (replaces the separate count tiles and pipeline bar); each filters the list.
  const stage = (k, label, sub) => `<button class="stg" type="button" data-filter="${k}" style="--stage-c:${stageVar(k)}"><span class="v">${c[k] || 0}</span><span class="k">${label}</span>${sub ? `<span class="s">${sub}</span>` : ""}</button>`;
  const notSched = rows.filter(r => r.p.stage === "int" && r.p.cur === 5).length;
  const comingUp = `<section class="ovcard"><h3>Coming up${thisWeek ? `<small>${thisWeek} this week</small>` : ""}${S.sched ? `<button class="btn small" type="button" data-cmd="slots">Interview times</button>` : ""}</h3><div class="olist">${ivList || `<div class="oempty">No interviews booked.</div>`}</div></section>`;
  const html = `<div class="ov"><div class="ovin">
    <div class="ovhead"><div><div class="eyebrow">${esc(new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}))}</div>
      <h2>${greet}${S.name ? ", " + esc(first(S.name)) : ""}</h2>
      <p>${rows.length ? `${inProc.length} applicant${inProc.length===1?"":"s"} in process${S.admin && c.board ? `, ${c.board} waiting on the board` : ""}${thisWeek ? `, ${thisWeek} interview${thisWeek===1?"":"s"} this week` : ""}.` : "No applicants yet."}</p></div>
      <div class="ovquick">${S.admin ? `<button class="btn small" type="button" data-cmd="board">Board meeting${c.board ? ` <b class="qcount">${c.board}</b>` : ""}</button>` : ""}<button class="btn small" type="button" data-cmd="palette">Search <kbd>⌘K</kbd></button></div></div>
    <div class="stages">${stage("screen", "Screening")}${stage("int", "Interview", S.admin && notSched ? `${notSched} not scheduled yet` : "")}${stage("appr", "Approval", S.admin && c.board ? `${c.board} on the board queue` : "")}${stage("onb", "Onboarding")}${stage("act", "Active members")}</div>
    ${S.role !== "member" ? `<div id="ovRoster" class="ovroster"></div>` : ""}
    ${S.admin ? `<div class="ovmain"><div class="ovcol">${todoCard()}
      ${unreadChatTotal() ? `<section class="ovcard"><h3>New messages<button class="btn small" type="button" data-cmd="inbox">Open messages</button></h3><div class="olist">${[...new Set(S.msgs.filter(m => S.apps.has(m.appId) && unreadIn("a:" + m.appId)).map(m => m.appId))].slice(0,5).map(id => { const a = S.apps.get(id), t = threadOf(id), last = t[t.length-1];
        return `<button class="oitem" type="button" data-openmsg="${esc(id)}"><span class="av" style="--stage-c:${stageVar(view(a).stage)}" aria-hidden="true">${esc(initials(a.name))}</span><span class="ot"><b>${esc(a.name)}</b><small>${esc(last.text.slice(0, 80))}</small></span><span class="when"><span class="newdot"></span>${esc(ago(last.at))}</span></button>`; }).join("")}</div></section>` : ""}
      ${S.owner && S.requests.length ? `<section class="ovcard"><h3>Team access requests<button class="btn small primary" type="button" data-cmd="settings">Review</button></h3><div class="olist">${S.requests.slice(0,5).map(q => `<div class="oitem" style="cursor:default"><span class="av" aria-hidden="true">${esc(initials(q.name || q.email))}</span><span class="ot"><b>${esc(q.name || q.email)}</b><small>${esc(q.email)}${q.note ? " · " + esc(q.note) : ""}</small></span><span class="when">${esc(ago(q.requestedAt))}</span></div>`).join("")}</div></section>` : ""}</div>
      <div class="ovcol ovside">${comingUp}${activityCard()}${statsCard()}</div></div>`
    : `<div class="ovmain single"><div class="ovcol">${comingUp}</div></div>`}
    <p class="kbdhint">Tip: press <kbd>⌘K</kbd> to find anyone or run a command, <kbd>J</kbd> <kbd>K</kbd> to move through applicants, <kbd>?</kbd> for all shortcuts.</p>
  </div></div>`;
  if (D.querySelector(".ov") && D._ovHTML === html) return placeRoster();
  const rst = rosterState(); parkRoster();
  D._ovHTML = html; D.innerHTML = html; stackCols(D); placeRoster(rst);
  const ov = D.querySelector(".ov"); if (ov) ov.scrollTop = keepScroll;
}

/* ---------- who can edit what ---------- */
// Only the owner edits. Everyone else on the team may fill in the interview questionnaire, record who was there,
// mark the interview completed and sign off the Interview page. Firestore rules enforce the same thing.
const INTERVIEW_FIELDS = new Set(["sched.completed", "sched.completedInit", "signoff.iv.init", "signoff.iv.done"]);
// The interview coordinator also changes the scheduling dates and the "Let them book an interview" switch.
const canEditPath = path => S.canEdit || path.startsWith("iv.") || INTERVIEW_FIELDS.has(path) || (S.sched && (path.startsWith("sched.") || path === "portal.bookingOpen"));
const SCHED_OK = '[data-act="book"],[data-act="release"],[data-act="email"]';   // owner-only buttons the coordinator may use
const OWNER_ONLY = '[data-act="records"],[data-act="uploadapp"],[data-recrm],[data-act="invite"],[data-act="docs"],[data-act="book"],[data-act="release"],[data-act="email"],[data-docrcv],[data-docrm],[data-refrcv],[data-refrep],[data-refmail],[data-refremind],[data-refcopy],[data-act="refsall"],#delBtn,#rqAdd';
const ownerOnlyToast = () => toast(S.coord ? "That part is changed by the owner. You run the interviews: times, booking, who interviews and messages." : "View only. You can fill in the Interview tab; everything else is changed by the owner.");

/* ---------- page sign-off ---------- */
// Initials + "complete" at the bottom of each working tab. Tabs members can open keep it on the shared record;
// admin-only tabs keep it in the private record.
const SIGN_ROOT = { app:"signoff", iv:"signoff", checks:"pagesign", board:"pagesign", onb:"pagesign" };
const tabLabel = k => (TABS_ADMIN.find(t => t[0] === k) || [k, k])[1];
const signPath = (k, f) => `${SIGN_ROOT[k]}.${k}.${f}`;
const signHTML = k => !SIGN_ROOT[k] ? "" : `<section class="group signoff" id="signBox"><h3><span>Page sign-off</span></h3><div class="ios"><div class="row">
    <span class="lbl">${esc(tabLabel(k))} page complete<small id="signNote">Initial and mark complete once everything on this page is done</small></span>
    <input class="init" type="text" id="f-sign-${k}" data-k="${signPath(k, "init")}" maxlength="4" placeholder="Init." autocomplete="off" aria-label="${esc(tabLabel(k))} page sign-off initials">
    <button class="btn small primary" type="button" data-sign="${k}" id="signBtn">Mark complete</button></div></div></section>`;
const viewOnlyNote = k => S.canEdit ? "" : k === "iv"
  ? `<div class="viewonly"><b>You can fill in this page.</b> Answer the questionnaire, record who was at the interview, then add the completed date, your initials and the page sign-off. Scheduling is view only.</div>`
  : `<div class="viewonly"><b>View only.</b> You can fill in the <button class="copy" type="button" data-tab="iv">Interview</button> tab; everything else is changed by the owner.</div>`;
function syncSignoff(a){
  document.querySelectorAll(".tabdock [data-tab]").forEach(b => { const k = b.dataset.tab; b.classList.toggle("signed", !!(SIGN_ROOT[k] && get(a, signPath(k, "done")))); });
  const box = $("#signBox"); if (!box) return;
  const k = S.tab, done = get(a, signPath(k, "done")), init = String(get(a, signPath(k, "init")) || "").trim();
  box.classList.toggle("done", !!done);
  $("#signNote").textContent = done ? `Completed ${fmtDate(done)}${init ? " · " + init : ""}` : init ? "Click Mark complete to sign off this page" : "Initial and mark complete once everything on this page is done";
  const b = $("#signBtn"); b.textContent = done ? "Undo" : "Mark complete"; b.classList.toggle("primary", !done); b.disabled = !done && !init;
  b.hidden = !canEditPath(signPath(k, "done"));
}

/* ---------- detail ---------- */
// Which tab holds each MILESTONES step, so clicking the progress bar jumps there.
// Interview scoring: each interviewer-facing criterion is rated 1–5 (iv.score.<key>); the average shows on the
// Interview tab, in Board meeting mode and in the board packet.
const IV_SCORE = [["comm","Communication"],["motiv","Motivation and commitment"],["avail","Availability"],["team","Teamwork and attitude"],["fit","Overall fit for PVRS"]];
function ivScore(a){
  const v = IV_SCORE.map(([k]) => parseInt(get(a, `iv.score.${k}`), 10)).filter(n => n >= 1 && n <= 5);
  return { n: v.length, avg: v.length ? v.reduce((x, y) => x + y, 0) / v.length : null };
}
const ivScoreText = a => { const s = ivScore(a); return s.n ? `${s.avg.toFixed(1)} / 5${s.n < IV_SCORE.length ? ` (${s.n} of ${IV_SCORE.length} rated)` : ""}` : "Not scored"; };
const STEP_TAB = ["app","app","checks","checks","checks","iv","iv","board","board","onb","onb","onb","onb","onb"];
// The field each step is filled in, so "Go to it" can land right on it (null = just open the tab).
const STEP_FIELD = ["app.received","app.complete","mvr.completed","dl.date",null,"sched.contacted","sched.completed","appr.committee","board.result","bg.sterReq","notify.applicant","notify.orientation","notify.chief","notify.tech"];
// "Go to it" next to "Next: …": open the right tab and put the cursor on that step's field (booking opens the booking window).
function goNextStep(){
  const a = S.apps.get(S.sel); if (!a) return;
  const i = progress(a).cur; if (i < 0) return;
  if (i === 5 && S.canEdit) return openBook(S.sel);
  const tb = STEP_TAB[i]; if (tb !== S.tab) switchTab(tb);
  const f = STEP_FIELD[i], el = f ? document.querySelector(`#dpanel [data-k="${f}"]`) : $("#refSummary");
  const row = el?.closest(".row") || el; if (!row) return;
  row.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash"); setTimeout(() => row.classList.remove("flash"), 1800);
  const inp = el.matches?.("input,select,textarea") ? el : el.querySelector?.("input,select,textarea,button");
  inp?.focus({ preventScroll: true });
}
const ICON = {
  print:`<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6V1.5h7V6M4.5 11.5h-2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><rect x="4.5" y="9.5" width="7" height="5" rx=".5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
  trash:`<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
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
  [".roster", ".side"].forEach(s => { const el = $(s); if (el) el.inert = (!!S.sel || !!S.mOv) && narrow && $("#modal").hidden; });
  paintMnav();
}
// Desktop: the applicant list lives in a box on the dashboard. It's one element moved in and out, so search, filters,
// sort and Select keep working; it must leave #detail before anything rewrites that pane.
const isDesk = () => matchMedia("(min-width:861px)").matches;
function rosterState(){ const R = $(".roster"), a = document.activeElement, keep = R && R.contains(a) ? a : null; return R ? { keep, caret: keep ? keep.selectionStart : 0, top: R.scrollTop } : null; }
function parkRoster(){ const R = $(".roster"), main = $(".main"); if (R && R.parentElement !== main) main.insertBefore(R, $("#detail")); }
function placeRoster(st){ const R = $(".roster"), slot = $("#ovRoster"); if (!R) return;
  if (isDesk() && slot && !S.sel && !S.chatOn) { if (R.parentElement !== slot) slot.appendChild(R); } else parkRoster();
  if (st) { R.scrollTop = st.top; if (st.keep && R.contains(st.keep)) { st.keep.focus({ preventScroll: true }); try { st.keep.setSelectionRange(st.caret, st.caret); } catch {} } } }
function paintDetail(){
  parkRoster();
  const D = $("#detail"), a = S.apps.get(S.sel);
  $("#app").classList.toggle("open", !!a);
  $("#overviewBtn").classList.toggle("on", !a && !S.chatOn);
  if (!a) return S.chatOn ? paintChat() : renderOverview();
  const tabs = S.admin ? TABS_ADMIN : TABS_MEMBER;
  if (S.tab === "screen" || S.tab === "refs") S.tab = "checks";   // the two tabs merged into Checks
  if (!tabs.some(t => t[0] === S.tab)) S.tab = "app";
  // The header sticks to the top of the scrolling file and the tab bar floats at the bottom; content scrolls under both.
  D.innerHTML = `<div class="dbody" id="dbody"><div class="dhead">
      <div class="drow"><button class="btn small back" type="button" id="backBtn" aria-label="Back to applicants">‹ Applicants</button>
        <span class="av" id="dAv" aria-hidden="true"></span>
        <div class="dname"><h2 id="dName"></h2><div class="sub" id="dSub"></div></div>
        ${S.admin ? `<div class="hacts">
          <button class="btn small" type="button" data-act="email" title="Write an email">${ICON.mail}<span class="tl">Email</span></button>
          <button class="btn small" type="button" data-act="book" title="Book an interview time">${ICON.cal}<span class="tl">Book</span></button>
          <button class="btn small" type="button" data-act="docs" title="Request documents">${ICON.doc}<span class="tl">Request docs</span></button>
          <button class="btn small" type="button" data-act="preview" title="See their applicant portal">${ICON.eye}<span class="tl">Portal</span></button>
          <button class="btn small" type="button" data-act="printapp" title="Print the original application">${ICON.print}<span class="tl">Application</span></button>
          ${S.canEdit ? `<button class="btn small hdel" type="button" data-act="delete" title="Delete this applicant">${ICON.trash}<span class="tl">Delete</span></button>` : ""}
          <button class="btn small hmore" type="button" data-act="actions" aria-haspopup="dialog"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="12.5" cy="8" r="1.4" fill="currentColor"/></svg>Actions</button>
        </div>` : ""}</div>
      ${S.admin?`<div class="prog" id="dProg"></div>`:""}
    </div>
    <div class="dinner" id="dpanel" role="tabpanel" aria-labelledby="tab-${S.tab}">${viewOnlyNote(S.tab)}${tabHTML(S.tab)}${signHTML(S.tab)}</div></div>
    <nav class="tabdock" aria-label="Applicant file sections"><div class="tabs" role="tablist">${tabs.map(([k,l],i) => `<button type="button" role="tab" id="tab-${k}" aria-controls="dpanel" data-tab="${k}" aria-selected="${S.tab===k}" title="${l} (${i+1})"><span class="tl-long">${l}</span><span class="tl-short" aria-hidden="true">${TAB_SHORT[k] || l}</span></button>`).join("")}</div>
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
  const stt = stat(a, p);
  $("#dSub").innerHTML = `<span class="pill" style="--stage-c:${stageVar(p.stage)}">${esc(S.admin ? stt.pill : STAGES[p.stage].label)}</span>${[a.type,loc(a)].filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join("")}${t?`<span class="upd">Updated ${ago(t)}${who?` by ${esc(who)}`:""}</span>`:""}`;
  const pr = $("#dProg");
  // Five labelled phases instead of fourteen anonymous dashes, and one plain sentence about where they stand.
  if (pr) { const closed = !["screen", "int", "appr", "onb", "act"].includes(p.stage);
    const ph = PHASES.map(([k, label, lo, hi]) => { const tot = hi - lo + 1, dn = p.done.slice(lo, hi + 1).filter(Boolean).length, cur = p.cur >= lo && p.cur <= hi, full = dn === tot;
      const firstOpen = p.done.slice(lo, hi + 1).indexOf(false), go = lo + (firstOpen < 0 ? 0 : firstOpen);
      const tip = MILESTONES.slice(lo, hi + 1).map((m, n) => `${p.done[lo + n] ? "✓" : "○"} ${m[0]}`).join("\n");
      return `<button type="button" class="ph ${full ? "done" : cur && !closed ? "cur" : ""}" data-step="${go}" style="--stage-c:${stageVar(k)}" title="${esc(tip)}" aria-label="${esc(label)}: ${dn} of ${tot} done${cur ? ", current" : ""}">
        <span class="phd" aria-hidden="true">${full ? checkSVG : ""}</span><span class="phl">${esc(label)}</span><span class="phn">${full ? "Done" : dn || cur ? `${dn} of ${tot}` : ""}</span></button>`; }).join("");
    pr.innerHTML = `<div class="phases">${ph}<span class="ph ${p.cur === -1 && !closed ? "done" : ""}" style="--stage-c:${stageVar("act")}"><span class="phd" aria-hidden="true">${p.cur === -1 ? checkSVG : ""}</span><span class="phl">Active</span><span class="phn"></span></span></div>
    <div class="t"><span class="tw"><strong>${esc(stt.head)}</strong>${stt.sub ? `<span class="ts">${esc(stt.sub)}</span>` : ""}</span>
      ${p.next && !closed ? `<button class="btn small nextgo" type="button" data-act="nextgo" title="${esc(p.next)}">${p.cur === 5 ? "Schedule it" : p.cur === 6 ? "Open interview" : "Go to it"} →</button>` : ""}<span class="tc">${p.n} of ${MILESTONES.length} steps</span></div>`; }
  const ab = $("#aiBrief"); if (ab) { ab.innerHTML = briefHTML(get(a, "ai.brief")); const bb = document.querySelector("[data-aibrief]"); if (bb && !bb.disabled) bb.textContent = get(a, "ai.brief") ? "Redo brief" : "Make brief"; }
  const ist = $("#ivScoreTotal"); if (ist) ist.textContent = ivScoreText(a);
  const oc = $("#onbCount"); if (oc) { const its = onbItems(), n = its.filter(([k]) => get(a, `onb.items.${k}`)).length; oc.textContent = its.length ? `${n} of ${its.length} done` : ""; }
  const dx = $("#dlExpEcho"); if (dx) dx.textContent = get(a, "dl.expires") ? fmtDate(get(a, "dl.expires")) : "Not entered";
  const m = $("#miles");
  if (m) m.innerHTML = MILESTONES.map((x,i) => `<div class="mile ${p.done[i]?"done":""} ${i===p.cur?"cur":""}"><span class="dot">${p.done[i]?checkSVG:""}</span>${esc(x[0])}</div>`).join("");
  const tn = $("#typeNote"); if (tn) tn.textContent = TYPE_INFO[a.type] || "Pick a membership type to see its requirements.";
  const pe = $("#phoneEcho"), ee = $("#emailEcho");
  if (pe) pe.textContent = a.phone || "Not entered on Application tab";
  if (ee) ee.textContent = a.email || "Not entered on Application tab";
  const ps = $("#portalStatus");
  if (ps) { const inv = get(a,"portal.invited"); ps.textContent = !a.email ? "Add their email first" : inv ? `Invited ${fmtDate(inv)} · ${a.email}` : "Not invited yet"; $("#inviteBtn").textContent = inv ? "Resend link" : "Welcome"; $("#inviteBtn").disabled = !a.email; }
  const be = $("#bookedEcho");
  if (be) {
    be.textContent = a._booked ? `${slotLong(a._booked.start)}${a._booked.location ? " · " + a._booked.location : ""}` : "Not booked";
    const cal = a._booked ? `<button class="btn small" type="button" data-act="ics" title="Add to Calendar">${ICON.cal}<span class="tl">Calendar</span></button>` : "";
    $("#bookedActs").innerHTML = cal + (S.admin ? (a._booked ? `<button class="btn small" type="button" data-act="book">Change</button><button class="btn small danger" type="button" data-act="release">Release</button>` : `<button class="btn small" type="button" data-act="book">Book a time</button>`) : "");
  }
  renderDocs(a); renderHistory(); syncRefs(a); updateMsgBadges(); renderInterviewers(a); renderDupeNote(a); renderOrientTab(a);
  if (S.tab === "msgs" && !$("#dThread")?.childElementCount) renderMessages();
  syncSignoff(a);
  const dlr = $("#dlFromApp"); if (dlr) { const n = get(a, "form.person.dlNumber"); dlr.hidden = !n; if (n) { $("#dlNum").textContent = n; $("#dlFromAppNote").textContent = `Issued in ${get(a, "form.person.dlState") || "—"} · admins only`; } }
  if (!S.canEdit) document.querySelectorAll("#detail " + OWNER_ONLY).forEach(el => { el.hidden = !(S.sched && el.matches(SCHED_OK)); });
  const pc = $("#panelCount"); if (pc) { const n = [1,2,3,4,5].filter(i => String(get(a,`iv.panel.m${i}`) || "").trim()).length; pc.textContent = n ? `${n} recorded` : ""; }
  document.querySelectorAll("#dbody [data-k]").forEach(el => {
    const k = el.dataset.k; let v = get(a, k);
    if (!canEditPath(k)) { if (el.classList.contains("seg")) el.querySelectorAll("button").forEach(b => { b.disabled = true; }); else el.disabled = true; }
    if (k === "status" && !v) v = "open";
    if (el.classList.contains("seg")) el.querySelectorAll("button").forEach(b => { b.classList.toggle("on", b.dataset.v === v); b.setAttribute("aria-pressed", b.dataset.v === v); });
    else { const sv = v == null ? "" : String(v); if (el !== document.activeElement && el.value !== sv) el.value = sv; }
  });
  document.querySelectorAll("#dbody [data-show]").forEach(el => { el.hidden = !SHOW[el.dataset.show](a); });
  if (S.ivMode) applyIvMode();
}
function syncRefs(a){
  const rs = refStatus(a), refs = rs.list, got = rs.got, waiting = rs.short;
  const sum = $("#refSummary");
  if (sum) {
    sum.className = "refsum " + (!refs.length ? "" : waiting ? "warn" : "ok");
    sum.innerHTML = `<b>${!refs.length ? "No references entered yet" : waiting ? `${got} of ${REFS_NEEDED} required references received · need ${waiting} more` : `${got} of ${refs.length} references received · requirement met`}</b>
      <span>${REFS_NEEDED} references must be in before the application goes to the board${refs.length > REFS_NEEDED ? "; any " + REFS_NEEDED + " of the " + refs.length + " listed will do" : ""}. The applicant sees each name with Received or Waiting in their portal; email addresses, dates and initials stay private.</span>
      ${S.canEdit && refs.some(r => !r.received && !get(a,`refs.r${r.i}.form`) && (!get(a,`refs.r${r.i}.contacted`) || refNudge(a, r.i))) ? `<span class="refsum-act"><button class="btn small primary" type="button" data-act="refsall">Email all reference forms</button></span>` : ""}`;
  }
  for (const i of [1,2,3,4]) {
    const badge = $("#refBadge" + i); if (!badge) continue;
    const name = String(get(a,`refs.r${i}.name`) || "").trim(), ret = get(a,`refs.r${i}.returned`);
    badge.className = "badge " + (!name ? "" : ret ? "ok" : "wait"); badge.textContent = !name ? "" : ret ? "Received" : "Waiting";
    $("#refRcv" + i).textContent = !name ? "Enter a name first" : ret ? "Received " + fmtDate(ret) : "Waiting on this reference";
    const b = $("#refBtn" + i); b.textContent = ret ? "Undo" : "Mark received"; b.disabled = !name; b.classList.toggle("primary", !!name && !ret);
    const rep = get(a,`refs.r${i}.replace`), was = get(a,`refs.r${i}.replacedFrom`), when = get(a,`refs.r${i}.replacedAt`);
    if (rep) { badge.className = "badge bad"; badge.textContent = "Replacement asked"; }
    $("#refRepNote" + i).textContent = rep ? `Asked ${fmtDate(rep)}. ${first(a.name) || "The applicant"} can send a new one from their portal; it replaces this reference automatically.`
      : was ? `Sent by the applicant ${fmtDate(when)}, replacing ${was}.`
      : !name ? "—" : get(a,"portal.invited") ? "The applicant gets a form in their portal to send someone else." : "They'll need portal access first (Application tab → invite).";
    const rb = $("#refRepBtn" + i); rb.textContent = rep ? "Cancel request" : "Ask for a new one"; rb.disabled = !name && !rep;
    const form = get(a,`refs.r${i}.form`), link = get(a,`refs.r${i}.link`), exp = get(a,`refs.r${i}.linkExp`) || 0;
    $("#refFormNote" + i).textContent = form ? `Answered ${fmtDate(form.date)} by ${(form.answers && form.answers.signName) || name}`
      : !name ? "Enter a name first"
      : refNudge(a, i) ? `Emailed ${fmtDate(get(a,`refs.r${i}.contacted`))}, no answer after ${daysSince(get(a,`refs.r${i}.contacted`))} days${get(a,`refs.r${i}.reminded`) ? ` (reminded ${fmtDate(get(a,`refs.r${i}.reminded`))})` : ""}. Time for a reminder.`
      : link && exp > Date.now() ? `Link made ${fmtDate(get(a,`refs.r${i}.linkAt`))}${get(a,`refs.r${i}.reminded`) ? ` · reminded ${fmtDate(get(a,`refs.r${i}.reminded`))}` : ""} · waiting for their answers · works until ${new Date(exp).toLocaleDateString()}`
      : `Send ${first(name)} a private link to the reference form. Their answers land here and mark this reference received.`;
    $("#refView" + i).hidden = !form;
    for (const id0 of ["#refMail", "#refCopy"]) { const x = $(id0 + i); x.hidden = !!form || !S.canEdit; x.disabled = !name; }
    $("#refRemind" + i).hidden = !(S.canEdit && refNudge(a, i));
  }
  const bn = $("#boardRefNote");
  if (bn) { bn.hidden = !(refs.length === 0 || waiting); bn.textContent = refs.length === 0 ? `No references entered yet. ${REFS_NEEDED} references must be in before this goes to the board.` : `Need ${waiting} more reference${waiting===1?"":"s"} (${got} of ${REFS_NEEDED} received${rs.pending.length ? "; still out: " + rs.pending.map(x => x.name).join(", ") : ""}). ${REFS_NEEDED} references must be in before this goes to the board.`; }
}
function requestedDocs(a){
  return Object.entries(get(a,"docs.requested") || {}).filter(([,v]) => v && v.label && !v.removed)
    .sort((x,y) => (x[1].requestedAt||0) - (y[1].requestedAt||0)).map(([key,v]) => ({ key, label: v.label, received: v.received === "yes", requestedAt: v.requestedAt }));
}
function renderDocs(a){
  const el = $("#docList"); if (!el) return;
  const docs = requestedDocs(a), files = S.files;
  const fileRow = f => f.confidential
    ? `<div class="row"><span class="lbl">🔒 Secure document<small>${esc(f.label || "Secure document")} · ${new Date(f.uploadedAt).toLocaleDateString()} · sent to ${esc(PAPERWORK_EMAIL)}</small></span></div>`
    : `<div class="row"><span class="lbl"><button class="filelink" type="button" data-file="${esc(f.id)}">${esc(f.name)}</button><small>${esc(f.label || "Other")} · ${new Date(f.uploadedAt).toLocaleDateString()} · ${Math.max(1, Math.round((f.size||0)/1024))} KB</small></span></div>`;
  const rows = docs.map(d => { const up = files.filter(f => f.docKey === d.key).length;
    return `<div class="row"><span class="lbl">${esc(d.label)}${isConfidential(d.label) ? " 🔒" : ""}<small>${d.received ? "Received" : up ? `${up} file${up>1?"s":""} uploaded · not marked received` : "Waiting on applicant"}${isConfidential(d.label) ? ` · goes privately to ${esc(PAPERWORK_EMAIL)}` : ""}</small></span>
      <div class="seg" role="group" aria-label="Received"><button type="button" class="${d.received?"on good":"good"}" data-docrcv="${esc(d.key)}">${d.received?"Received ✓":"Mark received"}</button></div>
      <button class="copy" type="button" data-docrm="${esc(d.key)}" aria-label="Remove ${esc(d.label)}">Remove</button></div>`; }).join("");
  const other = files.filter(f => !f.docKey || !docs.some(d => d.key === f.docKey));
  el.innerHTML = (rows || `<div class="row"><span class="lbl" style="color:var(--fg2)">No documents requested.</span></div>`)
    + (files.length ? `<div class="note">Uploaded by the applicant</div>${files.map(fileRow).join("")}` : "")
    + (!files.length && other.length ? "" : "");
  renderRecords();
}
// Original application: the online form as submitted, and/or paper copies uploaded as "Application" records.
const isAppRec = r => r.label === "Application" && !r.confidential && r.path;
function renderOriginal(){
  const el = $("#origList"), a = S.apps.get(S.sel); if (!el || !a) return;
  const f = a.form, papers = S.records.filter(isAppRec);
  const when = ms => new Date(ms).toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
  el.innerHTML = (f ? `<div class="row"><span class="lbl">Submitted online<small>${esc(when(f.submittedAt))} · signed “${esc(f.signature?.name || "")}”</small></span>
      <button class="btn small" type="button" data-act="viewform">View</button><button class="btn small" type="button" data-act="printform">Print</button></div>` : "")
    + (a.otherForms || []).map((x, i) => `<div class="row"><span class="lbl">Also submitted online<small>${esc(when(x.submittedAt))} · from a combined file</small></span><button class="btn small" type="button" data-printother="${i}">Print</button></div>`).join("")
    + papers.map(r => `<div class="row"><span class="lbl">Paper copy<small>${esc(r.name)} · uploaded ${esc(new Date(r.uploadedAt).toLocaleDateString())}</small></span>
      <button class="btn small" type="button" data-rec="${esc(r.id)}" title="Opens in a new tab; press ⌘P there to print">Open to print</button></div>`).join("")
    + (!f && !papers.length ? `<div class="row"><span class="lbl" style="color:var(--fg2)">No original on file<small>${S.canEdit ? "Scan the signed paper application and click Upload original." : "The owner can upload a scan of the paper application."}</small></span></div>` : "");
}
const printForm = f => printHTML(`<section class="pk">${formHTML(f, true)}</section>`);
// Header / ⌘K "Application": prints the online form, or opens the newest paper copy (PDFs can't be printed from here).
async function printOriginal(id){
  const a = S.apps.get(id); if (!a) return;
  if (a.form) return printForm(a.form);
  const w = window.open("", "_blank");   // open the tab during the click so Safari doesn't block it
  let recs = S.sel === id ? S.records : [];
  if (!recs.length) { try { recs = (await getDocs(collection(db, "applicants", id, "records"))).docs.map(d => ({ id: d.id, ...d.data() })); } catch { recs = []; } }
  const r = recs.filter(isAppRec).sort((x, y) => (y.uploadedAt || 0) - (x.uploadedAt || 0))[0];
  if (!r) { if (w) w.close(); return toast(S.canEdit ? "No original application on file. Upload the paper copy on the Application tab (Original application → Upload original)." : "No original application on file yet."); }
  try { const url = await getDownloadURL(ref(storage, r.path)); if (w) w.location = url; else location.href = url; toast("Opened the paper application. Press ⌘P in that tab to print."); }
  catch { if (w) w.close(); toast("Couldn't open the paper application."); }
}
function renderRecords(){
  renderOriginal();
  if (S.sel && S.apps.has(S.sel)) renderOrientDocs(S.apps.get(S.sel));
  const el = $("#recList"); if (!el) return;
  const recs = S.records.filter(r => !isOrRec(r));
  el.innerHTML = `<div class="note">Squad records · staff only, never shown to the applicant${recs.length ? ` · ${recs.length} file${recs.length===1?"":"s"}` : ""}</div>`
    + (recs.length ? recs.map(r => r.confidential ? `<div class="row"><span class="lbl">🔒 Secure document<small>${esc(r.label || "Confidential")} · ${esc(new Date(r.uploadedAt).toLocaleDateString())} · only ${esc(PAPERWORK_EMAIL)} can open it</small></span>
        <button class="copy" type="button" data-recrm="${esc(r.id)}" aria-label="Remove this entry">Remove</button></div>`
      : `<div class="row"><span class="lbl"><button class="filelink" type="button" data-rec="${esc(r.id)}" title="Open (then ⌘P to print)">${esc(r.name)}</button>
        <small>${esc(r.label || "Other")} · ${esc(new Date(r.uploadedAt).toLocaleDateString())} · ${Math.max(1, Math.round((r.size||0)/1024))} KB${r.uploadedBy ? " · " + esc(personName(r.uploadedBy)) : ""}</small></span>
        <button class="btn small" type="button" data-rec="${esc(r.id)}">Open</button>
        <button class="copy" type="button" data-recrm="${esc(r.id)}" aria-label="Remove ${esc(r.name)}">Remove</button></div>`).join("")
      : `<div class="row"><span class="lbl" style="color:var(--fg2)">${S.canEdit ? "No records yet. Click <b>Upload records</b> to add MVRs, background checks, intake forms and other copies." : "No records uploaded yet."}</span></div>`);
  if (!S.canEdit) el.querySelectorAll(OWNER_ONLY).forEach(b => { b.hidden = !(S.sched && b.matches(SCHED_OK)); });
}

/* ---------- writes ---------- */
function setSave(t){ const el = $("#saveState"); if (!el) return; el.textContent = t; el.title = t; el.classList.toggle("busy", /…$/.test(t)); el.classList.toggle("err", t === "Not saved"); }
function queue(kind, id, patch){
  const key = kind + "|" + id;
  pending[key] = merge(pending[key] || {}, patch);
  clearTimeout(timers[key]); timers[key] = setTimeout(() => flush(key), 600);
}
function edit(id, path, value){
  if (!S.apps.has(id)) return;
  if (!canEditPath(path)) { ownerOnlyToast(); syncDetail(); return; }
  const kind = SECURE.has(path.split(".")[0]) ? "sec" : "pub";
  if (kind === "sec" && !S.canEdit && !(S.sched && path === "portal.bookingOpen")) return;
  const now = Date.now();
  const meta = kind === "pub" ? { updatedAt: now, updatedBy: S.me } : { secUpdatedAt: now, secUpdatedBy: S.me };
  const patch = merge(nest(path, value), meta);
  const before = S.apps.get(id), wasApproved = get(before, "board.result") === "approved", wasActive = progress(before).stage === "act";
  logChange(id, path, get(S.apps.get(id), path), value);
  const store = kind === "pub" ? S.shared : S.secure;
  store.set(id, merge(store.get(id) || {}, clone(patch)));
  queue(kind, id, patch);
  rebuild(id);
  if (S.canEdit) {   // mirror the stage onto the shared record so members see where an applicant stands
    const st = progress(S.apps.get(id)).stage;
    if (S.shared.get(id).stage !== st) { S.shared.get(id).stage = st; queue("pub", id, { stage: st }); rebuild(id); }
    schedulePortal(id);
    const a = S.apps.get(id);
    if (!wasActive && st === "act") celebrate(`🎉 ${first(a.name) || "They"} ${a.name ? "is" : "are"} now an active member!`);
    else if (!wasApproved && get(a, "board.result") === "approved") celebrate(`🎉 ${a.name || "Applicant"} approved by the board!`);
  }
  else if (S.coord && path === "portal.bookingOpen") coordBooking(id);
  setSave("Editing…");
  renderList(); syncDetail();
}
// The coordinator's desk can't rewrite an applicant's whole portal page (only the owner's does), so it flips just the
// booking switch on it. Applicants who haven't been welcomed have no page yet; the owner's desk fills it in then.
function coordBooking(id){
  const a = S.apps.get(id); if (!a || !S.portal.has(id)) return;
  updateDoc(doc(db, "portal", id), { bookingOpen: get(a, "portal.bookingOpen") === "yes" && !isDeclined(a), updatedAt: Date.now() }).catch(e => console.error(e));
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
    refs: refList(a).map(r => ({ slot: r.i, name: r.name, received: r.received, ...(r.replace ? { replace: true } : {}) })),
    refReplace: refList(a).filter(r => r.replace).map(r => r.i),
    bookingOpen: get(a,"portal.bookingOpen") === "yes" && !isDeclined(a),
    orientation: orientPayload(a), checkin: checkinDue(a) };
}
const portalKey = p => JSON.stringify([p.email, p.name, p.firstName, p.type, p.steps, p.docs, p.refs || [], p.refReplace || [], p.bookingOpen, p.orientation || null, p.checkin || null]);
const portalTimers = {};
function schedulePortal(id, delay = 1500){ if (!S.canEdit) return; clearTimeout(portalTimers[id]); portalTimers[id] = setTimeout(() => syncPortal(id), delay); }
async function syncPortal(id, force = false){
  const a = S.apps.get(id); if (!a || !S.canEdit) return;
  if (!force && (!get(a,"portal.invited") || !a.email)) return;
  const next = portalPayload(a), cur = S.portal.get(id);
  if (!force && cur && portalKey(cur) === portalKey(next)) return;
  try { await setDoc(doc(db, "portal", id), { ...next, updatedAt: Date.now() }, { merge: true }); if (next.email) await setDoc(doc(db, "portalEmails", next.email), { id, at: Date.now() }); }
  catch (e) { console.error(e); }
}
// Others can complete interviews but can't write the stage, so the owner's desk keeps the shared stage current.
let mirrorT;
function mirrorStages(){ clearTimeout(mirrorT); mirrorT = setTimeout(() => {
  for (const [id, a] of S.apps) { const st = progress(a).stage, sh = S.shared.get(id); if (sh && sh.stage !== st) { sh.stage = st; queue("pub", id, { stage: st }); } }
}, 2000); }
// Owner only: keep portalEmails/{email} matching the portal docs, so the rules can tell invited applicants
// (who may see interview times) from anyone else who signs in.
let peKnown = null, peT;
function reconcilePortalEmails(){ if (!S.canEdit || !peKnown) return; clearTimeout(peT); peT = setTimeout(async () => {
  const want = new Map(); for (const [id, pd] of S.portal) if (pd && pd.email) want.set(lower(pd.email), id);
  for (const [email, id] of want) if (peKnown.get(email) !== id) await setDoc(doc(db, "portalEmails", email), { id, at: Date.now() }).catch(e => console.error(e));
  for (const email of peKnown.keys()) if (!want.has(email)) await deleteDoc(doc(db, "portalEmails", email)).catch(e => console.error(e));
}, 1200); }
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
  if (!S.sched) return ownerOnlyToast();
  const a = S.apps.get(id);
  const open = [...S.slots.values()].filter(s => !s.bookedBy && s.start > Date.now()).sort((x,y) => x.start - y.start);
  const M = openModal(`<h3>Book a time</h3><p class="help">For ${esc(a.name || "this applicant")}. Booking here works even inside 24 hours.</p>
    ${open.length ? `<div class="ios slotlist">${open.map(s => `<div class="row"><span class="lbl"><span class="when">${esc(slotLong(s.start))}</span><small>${esc([s.duration?s.duration+" min":"", s.location, s.hostName ? "with " + s.hostName : ""].filter(Boolean).join(" · "))}</small></span><button class="btn small primary" type="button" data-bk="${esc(s.id)}">Book</button></div>`).join("")}</div>`
      : `<p class="help">No open interview times. Add some under <b>Interview times</b>.</p>`}
    <div class="acts"><button class="btn" type="button" data-x>Close</button></div>`, true);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const b = e.target.closest("[data-bk]"); if (!b) return;
    const s = S.slots.get(b.dataset.bk);
    try { await bookFor(id, s); closeModal(); toast(`Booked ${slotLong(s.start)}`); } catch (err) { console.error(err); toast("Couldn't book that time. It may have just been taken."); }
  };
}
const canHostSlots = () => S.owner || S.admin || S.role === "interviewer";
function openSlots(){
  if (!canHostSlots()) return ownerOnlyToast();
  const def = S.settings.defaultLocation || "";
  const hosts = S.sched ? [...S.staff.entries()].filter(([, s]) => canInterview(s)) : [];
  const d0 = new Date(Date.now() + 3*864e5), dStr = `${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,"0")}-${String(d0.getDate()).padStart(2,"0")}`;
  const M = openModal(`<h3>${S.sched ? "Interview times" : "My interview times"}</h3><p class="help">${S.sched ? "Applicants with booking turned on can pick any open time at least 24 hours out." : "Add the times you're free to interview. When an applicant books one, they're assigned to you automatically."}</p>
    <form id="slotForm" class="ios" style="padding:14px"><div class="addslot">
      <div class="field"><label for="slDate">Date</label><input id="slDate" type="date" value="${dStr}" required></div>
      <div class="field"><label for="slTime">First start time</label><input id="slTime" type="time" value="18:00" required></div>
      <div class="field"><label for="slDur">Length</label><select id="slDur"><option>20</option><option selected>30</option><option>45</option><option>60</option></select></div>
      <div class="field"><label for="slCount">Back-to-back slots</label><select id="slCount">${[1,2,3,4,5,6,8,10].map(n=>`<option>${n}</option>`).join("")}</select></div>
      ${hosts.length ? `<div class="field full"><label for="slHost">Interviewer</label><select id="slHost"><option value="">Membership Committee (no one assigned)</option>${hosts.map(([e, s]) => `<option value="${esc(e)}">${esc(s.name || e)}</option>`).join("")}</select></div>` : ""}
      <div class="field full"><label for="slLoc">Location</label><input id="slLoc" type="text" placeholder="PVRS building, room…" value="${esc(def)}"></div>
      <div class="full" style="display:flex;justify-content:flex-end"><button class="btn primary" type="submit">Add times</button></div></div></form>
    <div id="slotList"></div>
    <div class="acts"><button class="btn" type="button" id="slIcs" title="Every booked interview as one calendar file">Add booked interviews to Calendar</button><button class="btn" type="button" data-x>Done</button></div>`, true);
  const paint = () => {
    if (!$("#slotList")) return;
    const up = [...S.slots.values()].filter(s => s.start > Date.now() - 864e5 && (S.sched || s.host === S.me)).sort((x,y) => x.start - y.start);
    const days = {}; up.forEach(s => { const k = slotDay(s.start); (days[k] = days[k] || []).push(s); });
    $("#slotList").innerHTML = up.length ? Object.entries(days).map(([day, list]) => `<div class="group"><h3><span>${esc(day)}</span></h3><div class="ios slotlist">${list.map(s => {
      const who = s.bookedBy ? (S.apps.get(s.bookedBy)?.name || "Applicant") : "";
      return `<div class="row"><span class="lbl"><span class="when">${esc(slotTime(s.start))}</span><small>${esc([s.duration?s.duration+" min":"", s.location, S.sched && s.hostName ? "with " + s.hostName : ""].filter(Boolean).join(" · "))}</small></span>
        ${who ? `<span class="badge ok">${esc(who)}</span>${S.sched ? `<button class="btn small" type="button" data-rel="${esc(s.id)}">Release</button>` : ""}` : `<span class="badge wait">Open</span><button class="btn small danger" type="button" data-del="${esc(s.id)}">Delete</button>`}</div>`; }).join("")}</div></div>`).join("")
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
      const hostEmail = S.sched ? ($("#slHost")?.value || "") : S.me;
      const host = hostEmail ? { host: hostEmail, hostName: first(hostEmail === S.me ? S.name : S.staff.get(hostEmail)?.name) || hostEmail.split("@")[0] } : {};
      for (let i = 0; i < n; i++) { const start = new Date(y, mo-1, d, h, mi + i*dur).getTime(); await addDoc(collection(db, "slots"), { start, duration: dur, location: where, bookedBy: null, createdAt: Date.now(), ...host }); }
      if (where && where !== S.settings.defaultLocation && S.sched) { S.settings.defaultLocation = where; setDoc(doc(db, "settings", "main"), { defaultLocation: where }, { merge: true }).catch(() => {}); }
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
  if (!S.canEdit) return ownerOnlyToast();
  const a = S.apps.get(id); const have = requestedDocs(a).map(d => d.label);
  const picked = new Set(), custom = [];
  const M = openModal(`<h3>Request documents</h3><p class="help">They'll see these in their portal with an upload button.</p>
    <div class="chips" style="flex-wrap:wrap" id="rqChips">${DOC_ITEMS.map((d,i) => `<button class="chip" type="button" data-i="${i}" aria-pressed="${have.includes(d)}" ${have.includes(d)?"disabled":""}>${have.includes(d)?"✓ ":""}${esc(d)}${isConfidential(d)?" 🔒":""}</button>`).join("")}</div>
    <p class="help">🔒 Medical and Social Security items go through secure document upload to ${esc(PAPERWORK_EMAIL)}. You'll see that they arrived, not what's in them.</p>
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
  const f = S.files.find(x => x.id === fid); if (!f || !f.path) return;
  const w = window.open("", "_blank");
  try { const url = await getDownloadURL(ref(storage, f.path)); if (w) w.location = url; else location.href = url; }
  catch (e) { if (w) w.close(); toast("Couldn't open that file."); }
}
/* ---------- messages ---------- */
const threadOf = id => S.msgs.filter(m => m.appId === id).sort((x,y) => (x.at||0) - (y.at||0));
const unreadOf = id => S.msgs.filter(m => m.appId === id && m.from === "applicant" && !m.readAt).length;
const unreadTotal = () => S.msgs.filter(m => m.from === "applicant" && !m.readAt && S.apps.has(m.appId)).length;
const markedRead = new Set();
function renderMessages(){
  const el = $("#dThread"), a = S.apps.get(S.sel); if (!el || !a) return;
  el.innerHTML = threadHTML(threadOf(S.sel), "staff");
  el.scrollTop = el.scrollHeight;
  const note = $("#msgNote");
  if (note) note.innerHTML = !get(a, "portal.invited") ? `${esc(first(a.name))} hasn't been invited to the portal yet, so they can't see messages. Send an invite from the Application tab first.`
    : `${esc(first(a.name))} sees these in their applicant portal. They're signed in as ${esc(a.email || "their application email")}.`;
  if (S.canEdit && S.tab === "msgs") for (const m of threadOf(S.sel)) if (m.from === "applicant" && !m.readAt && !markedRead.has(m.key)) {
    markedRead.add(m.key); updateDoc(doc(db, "portal", S.sel, "messages", m.id), { readAt: Date.now() }).catch(() => markedRead.delete(m.key));
  }
}
// Saved replies: one tap drops the text into the reply box ({first} becomes the applicant's first name). Edited in Settings.
const DEFAULT_REPLIES = [
  { title: "Got it", text: "Thanks, {first}! We got it and we'll be in touch soon." },
  { title: "Documents received", text: "Thanks, {first}. We received your documents and they're under review." },
  { title: "Interview times open", text: "Hi {first}, interview times are open in your portal now. Pick whichever one works best for you." },
  { title: "References", text: "Hi {first}, we're still waiting to hear from some of your references. A quick reminder from you can help move things along." },
  { title: "When's the board?", text: "Hi {first}, your application goes to the next board meeting once your references, interview and the other checks are complete. You'll hear from us within about a week of that meeting." },
];
const savedReplies = () => Array.isArray(S.settings.replies) ? S.settings.replies : DEFAULT_REPLIES;
const quickRepliesHTML = () => (aiOn() ? `<button class="chip aichip" type="button" data-aireply>Draft with Med Control</button>` : "") + savedReplies().map((r, i) => `<button class="chip" type="button" data-qr="${i}">${esc(r.title)}</button>`).join("");
function useQuickReply(i){
  const r = savedReplies()[i], a = S.apps.get(S.sel), ta = $("#replyText"); if (!r || !a || !ta) return;
  const text = r.text.replace(/\{first\}/g, first(a.name));
  ta.value = ta.value.trim() ? ta.value.trimEnd() + "\n\n" + text : text;
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
}
const replyRowHTML = (r = { title: "", text: "" }) => `<div class="row stack qredit"><div style="display:flex;gap:8px;align-items:center"><input type="text" class="qrTitle" maxlength="40" placeholder="Button label" value="${esc(r.title)}"><button class="copy" type="button" data-qrrm>Remove</button></div>
  <textarea class="qrText" rows="2" maxlength="2000" placeholder="Reply text. {first} becomes their first name.">${esc(r.text)}</textarea></div>`;
async function sendReply(){
  if (!canReplyApp(S.sel)) return toast("Only the people in this conversation can reply. The membership coordinator can add you.");
  const a = S.apps.get(S.sel), ta = $("#replyText"); if (!a || !ta) return;
  const text = ta.value.trim(); if (!text) return ta.focus();
  if (text.length > 2000) return toast("Replies can be up to 2,000 characters.");
  try {
    await addDoc(collection(db, "portal", S.sel, "messages"), { text, from: "staff", by: S.me, name: first(S.name) || "PVRS", at: Date.now() });
    ta.value = ""; toast("Reply sent");
    if ($("#replyMail")?.checked && a.email) {
      const body = `Hi ${first(a.name)},\n\nYou have a new message about your PVRS application:\n\n"${text}"\n\nYou can read it and reply in your applicant portal:\n${location.origin}\n\nThank you,\n${sig()}`;
      const link = document.createElement("a"); link.href = `mailto:${encodeURIComponent(a.email)}?subject=${encodeURIComponent("New message from PVRS Membership")}&body=${encodeURIComponent(body)}`; link.click();
    }
  } catch (e) { console.error(e); toast("Couldn't send the reply. Try again."); }
}
function updateMsgBadges(){
  const n = unreadChatTotal(), b = $("#msgsBtn"); if (!b) return;
  let badge = b.querySelector(".navbadge"); if (!badge) { badge = document.createElement("b"); badge.className = "navbadge"; b.appendChild(badge); }
  badge.textContent = n || ""; badge.hidden = !n; b.title = n ? `Messages · ${n} unread` : "Messages";
  const mb = $("#mnav [data-m=msgs] .navbadge"); if (mb) { mb.textContent = n || ""; mb.hidden = !n; }
  const tb = document.querySelector('.tabdock [data-tab="msgs"]'); if (tb && S.sel) tb.classList.toggle("unread", unreadOf(S.sel) > 0);
}
function openInbox(){
  const threads = [...new Set(S.msgs.map(m => m.appId))].filter(id => S.apps.has(id))
    .map(id => { const t = threadOf(id); return { id, last: t[t.length-1], unread: unreadOf(id) }; }).sort((x,y) => (y.last.at||0) - (x.last.at||0));
  const M = openModal(`<h3>Messages</h3><p class="help">Conversations with applicants, newest first.${S.canEdit ? "" : " View only."}</p>
    <div class="ios">${threads.length ? threads.map(t => { const a = S.apps.get(t.id);
      return `<button class="oitem" type="button" data-thread="${esc(t.id)}" style="width:100%"><span class="av" style="--stage-c:${stageVar(view(a).stage)}" aria-hidden="true">${esc(initials(a.name))}</span>
        <span class="ot"><b>${esc(a.name || "Applicant")}${t.unread ? ` <span class="badge wait">${t.unread} new</span>` : ""}</b><small>${t.last.from === "staff" ? "You: " : ""}${esc(t.last.text.slice(0, 90))}</small></span>
        <span class="when">${esc(ago(t.last.at))}</span></button>`; }).join("") : `<div class="oempty">No messages yet. Applicants can send questions from their portal.</div>`}</div>
    <div class="acts"><button class="btn" type="button" data-x>Close</button></div>`, true);
  M.onclick = e => { if (e.target.closest("[data-x]")) return closeModal(); const t = e.target.closest("[data-thread]"); if (t) { closeModal(); select(t.dataset.thread); switchTab("msgs"); } };
}
let msgsPrimed = false;
function watchMessages(){
  onSnapshot(collectionGroup(db, "messages"), snap => {
    const before = new Set(S.msgs.map(m => m.key));
    S.msgs = snap.docs.map(d => ({ id: d.id, key: d.ref.path, appId: d.ref.parent.parent.id, ...d.data() }));
    const fresh = S.msgs.filter(m => !before.has(m.key) && m.from === "applicant" && S.apps.has(m.appId));
    if (msgsPrimed && fresh.length && !(S.sel === fresh[0].appId && S.tab === "msgs")) toast(`New message from ${S.apps.get(fresh[0].appId).name}`);
    msgsPrimed = true;
    updateMsgBadges();
    if (S.sel && S.tab === "msgs") renderMessages();
    if (!S.sel) renderOverview();
  }, e => console.error(e));
}

let recUnsub = null;
function watchRecords(id){
  if (recUnsub) { recUnsub(); recUnsub = null; }
  S.records = [];
  if (!S.admin || !id) return;
  recUnsub = onSnapshot(collection(db, "applicants", id, "records"), s => {
    S.records = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((x,y) => (y.uploadedAt||0) - (x.uploadedAt||0));
    if (S.sel === id) renderRecords();
  }, () => {});
}
async function openRecord(rid){
  const r = S.records.find(x => x.id === rid); if (!r || !r.path) return;
  const w = window.open("", "_blank");
  try { const url = await getDownloadURL(ref(storage, r.path)); if (w) w.location = url; else location.href = url; }
  catch (e) { if (w) w.close(); toast("Couldn't open that file."); }
}
const RECORD_LABELS = ["Application","Interview intake","MVR (driving record)","Driver's license copy","Background check (Sterling)","Reference letter","EMT / CPR certification","Medical documentation","Social Security card","Board paperwork","Other"];
const RECORD_MAX = 25 * 1024 * 1024;
function openUploadRecords(id, preset){
  if (!S.canEdit) return ownerOnlyToast();
  const a = S.apps.get(id); if (!a) return;
  const M = openModal(`<h3>Upload records</h3><p class="help">For ${esc(a.name || "this applicant")}. Staff only: admins can open and print these; the applicant never sees them. PDFs or photos, up to 25 MB each.</p>
    <div class="field"><label for="recLabel">What is it?</label><select id="recLabel">${RECORD_LABELS.map(l => `<option${l === preset ? " selected" : ""}>${esc(l)}${isConfidential(l) ? " 🔒" : ""}</option>`).join("")}</select></div>
    <p class="help lockline" id="recConf" hidden>🔒 Secure document: this goes only to ${esc(PAPERWORK_EMAIL)}. Once uploaded, you won't be able to open it.</p>
    <label class="dropzone" id="recDrop" for="recFiles"><input type="file" id="recFiles" accept="application/pdf,image/*" multiple hidden>
      <b>Drop files here</b><span>or click to choose from your Mac</span></label>
    <div id="recQueue" class="ios" hidden></div>
    <div class="acts"><button class="btn" type="button" data-x>Done</button></div>`);
  const queue = $("#recQueue");
  const recLabel = () => $("#recLabel").value.replace(/ 🔒$/, "");
  $("#recLabel").addEventListener("change", () => { $("#recConf").hidden = !isConfidential(recLabel()); });
  const upload = async list => {
    const label = recLabel(), conf = isConfidential(label);
    for (const f of list) {
      const row = document.createElement("div"); row.className = "row"; row.innerHTML = `<span class="lbl">${esc(f.name)}<small>Uploading…</small></span>`; queue.hidden = false; queue.appendChild(row);
      const note = row.querySelector("small");
      if (!(f.type === "application/pdf" || /^image\//.test(f.type))) { note.textContent = "Skipped: only PDFs and photos"; continue; }
      if (f.size > RECORD_MAX) { note.textContent = "Skipped: over 25 MB"; continue; }
      try {
        const safe = `${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
        if (conf) {
          const path = `confidential/${id}/${safe}`;
          await uploadBytes(ref(storage, path), f, { contentType: f.type });
          await addDoc(collection(db, "vault"), { appId: id, appName: a.name || "", label, name: f.name, path, size: f.size, contentType: f.type, uploadedAt: Date.now(), uploadedBy: S.me, from: "staff" });
          await addDoc(collection(db, "applicants", id, "records"), { name: "Private document", label, path: "", size: f.size, contentType: f.type, uploadedAt: Date.now(), uploadedBy: S.me, confidential: true });
          note.textContent = `Sent securely to ${PAPERWORK_EMAIL}`;
        } else {
          const path = `records/${id}/${safe}`;
          await uploadBytes(ref(storage, path), f, { contentType: f.type });
          await addDoc(collection(db, "applicants", id, "records"), { name: f.name, label, path, size: f.size, contentType: f.type, uploadedAt: Date.now(), uploadedBy: S.me });
          note.textContent = `Uploaded · ${label}`;
        }
      } catch (e) { console.error(e); note.textContent = "Couldn't upload. Try again."; }
    }
  };
  $("#recFiles").addEventListener("change", e => { const l = [...e.target.files]; e.target.value = ""; if (l.length) upload(l); });
  const dz = $("#recDrop");
  ["dragenter","dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave","drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", e => { const l = [...(e.dataTransfer?.files || [])]; if (l.length) upload(l); });
  M.onclick = e => { if (e.target.closest("[data-x]")) closeModal(); };
}
async function removeRecord(rid){
  const r = S.records.find(x => x.id === rid); if (!r || !S.canEdit) return;
  try {
    if (r.path) await deleteObject(ref(storage, r.path)).catch(() => {});
    await deleteDoc(doc(db, "applicants", S.sel, "records", rid));
    toast(r.confidential ? `Removed from this list. The private copy stays with ${PAPERWORK_EMAIL}.` : "Record removed");
  }
  catch (e) { console.error(e); toast("Couldn't remove that record."); }
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

/* ---------- portal invite = welcome ---------- */
// The first invite is the applicant's welcome, all in one step: portal access + sign-in link, a welcome message
// waiting in their portal's Messages, and the welcome email ready to send. Later clicks just resend the link.
const welcomeText = a => `Hi ${first(a.name)}, welcome, and thank you for applying to the Potsdam Volunteer Rescue Squad!

This page is your applicant portal. Here's what happens next:
• We check your driving record and verify your driver's license.
• We contact your references (we need ${REFS_NEEDED}). You'll see here when each one comes back.
• You book an interview with the Membership Committee here once times open.
• Your application then goes to the board.

You can follow every step on this page. If you have a question at any point, send us a message right here.`;
async function inviteToPortal(id, showEmail = true){
  if (!S.canEdit) return ownerOnlyToast();
  const a = S.apps.get(id); if (!a) return;
  const email = lower(a.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Add a valid email on the Application tab first.");
  const welcome = !get(a,"portal.welcomed");
  if (!get(a,"portal.invited")) edit(id, "portal.invited", today());
  if (welcome) edit(id, "portal.welcomed", today());
  flushAll();
  try {
    await syncPortal(id, true);
    await sendSignInLinkToEmail(auth, email, linkSettings());
    if (welcome) await addDoc(collection(db, "portal", id, "messages"), { text: welcomeText(a), from: "staff", by: S.me, name: first(S.name) || "PVRS", at: Date.now() })
      .catch(e => console.error(e));
    toast(welcome ? `Welcomed ${first(a.name)}: sign-in link sent and a welcome message is in their portal` : `Sign-in link sent to ${email}`);
    if (showEmail) openEmail("portal", undefined, id);
  } catch (e) { console.error(e); toast("Couldn't send the invite. Check the email address and try again."); }
}

/* ---------- emails ---------- */
const TEMPLATES = {
  portal: a => ({ subject: "Welcome to PVRS: your applicant portal",
    body: `Hi ${first(a.name)},\n\nWelcome, and thank you for applying to the Potsdam Volunteer Rescue Squad! We've received your application. You can follow it, upload documents, message us and book your interview in your applicant portal:\n\n${location.origin}\n\nSign in with this email address (${lower(a.email)}). We just sent you a separate sign-in link, and you can request a new one from that page any time. No password needed.\n\nQuestions? Email ${S.settings.docsEmail || CONTACT_EMAIL}.\n\nThank you,\n${sig()}` }),
  docs: (a, list = []) => ({ subject: "PVRS application: documents needed",
    body: `Hi ${first(a.name)},\n\nTo keep your application moving, please upload the following in your applicant portal:\n\n${list.length ? list.map(l => "• " + l).join("\n") : "• "}\n\n${location.origin}\n\nIf the upload gives you trouble, email them to ${S.settings.docsEmail || CONTACT_EMAIL} instead.\n\nThank you,\n${sig()}` }),
  orientdocs: (a, list = []) => ({ subject: "PVRS orientation: documents needed",
    body: `Hi ${first(a.name)},\n\nTo finish your orientation paperwork, please upload the following from your PVRS dashboard. Each one has its own Upload button on your checklist (a PDF or a clear photo is fine):\n\n${list.length ? list.map(l => "• " + l).join("\n") : "• "}\n\nSign in at ${location.origin}/signin with ${lower(a.email)}. The sign-in email often lands in spam or junk, so check there if you don't see it.\n\nAll of these are required before you can be issued equipment or run calls. If the upload gives you trouble, reply to this email and we'll sort it out.\n\nThank you,\n${sig()}` }),
  refs: (a, list = []) => ({ subject: "PVRS application: references still needed",
    body: `Hi ${first(a.name)},\n\nWe're still waiting to hear from ${list.length === 1 ? "one of your references" : "some of your references"}:\n\n${list.length ? list.map(l => "• " + l).join("\n") : "• "}\n\nWe need ${REFS_NEEDED} references before your application can go to the board. If you can, please check in with them, or let us know if one of them is hard to reach and you'd like to suggest someone else.\n\nYou can see which references we've heard from in your applicant portal:\n${location.origin}\n\nThank you,\n${sig()}` }),
  interview: a => ({ subject: "PVRS interview: pick a time",
    body: `Hi ${first(a.name)},\n\nThe next step in your application is an interview with the Membership Committee. Interview times are now open in your applicant portal. Sign in and pick the one that works best for you:\n\n${location.origin}\n\nIf none of the times work, reply to this email and we'll find another.\n\nThank you,\n${sig()}` }),
};
function openEmail(kind, extra, id = S.sel){
  const a = S.apps.get(id); if (!a) return;
  const t = TEMPLATES[kind](a, extra);
  const titles = { portal: "Welcome email", docs: "Documents email", orientdocs: "Orientation documents email", refs: "References email", interview: "Interview email" };
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

/* ---------- settings (owner only; the button is hidden for everyone else and the rules block their writes) ---------- */
function gateSettings(){ if (S.owner) openSettings(); }
function requestsHTML(){
  if (!S.requests.length) return "";
  return `<div class="note warn"><b>${S.requests.length} access request${S.requests.length===1?"":"s"}</b> waiting for you</div>` + S.requests.map(q => `<div class="row reqrow" style="flex-wrap:wrap">
    <span class="lbl">${esc(q.name || q.email)}<small>${esc(q.email)}${q.note ? " · " + esc(q.note) : ""} · requested ${esc(ago(q.requestedAt))}</small></span>
    <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn small primary" type="button" data-approve="${esc(q.email)}" data-v="member">Approve</button>
      <button class="btn small danger" type="button" data-deny="${esc(q.email)}">Deny</button></span></div>`).join("")
    + `<div class="row"><span class="lbl"><small>Approved people join as members. To make someone an admin (like the administrator), switch them to Admin in the list below.</small></span></div>`;
}
async function decideRequest(email, role){
  const q = S.requests.find(x => x.email === email); if (!q) return;
  try {
    const b = writeBatch(db);
    if (role) b.set(doc(db, "staff", email), { role, name: q.name || "", addedAt: Date.now(), addedBy: S.me, via: "request" });
    b.update(doc(db, "accessRequests", email), { status: role ? "approved" : "denied", decidedAt: Date.now(), decidedBy: S.me });
    await b.commit();
    toast(role ? `${q.name || email} approved as ${role}. They can sign in now.` : `Request from ${q.name || email} denied.`);
  } catch (e) { console.error(e); toast("Couldn't save that. Try again."); }
}
const ROLE_LABEL = { admin: "Admin", coordinator: "Interview coordinator", interviewer: "Interviewer", member: "Member" };
// Who can be put on an interview or host a time.
const canInterview = s => ["interviewer", "admin", "coordinator"].includes(s.role);
const roleLabel = r => ROLE_LABEL[r] || "Member";
function teamHTML(){
  const rows = [...S.staff.entries()].sort((x,y) => x[0].localeCompare(y[0])).map(([email, s]) => `<div class="row"><span class="lbl">${esc(s.name || email)}<small>${esc(email)}</small></span>
    <span class="teamact"><select class="rolesel" data-rolesel="${esc(email)}" aria-label="Role for ${esc(s.name || email)}">${[["member","Member"],["interviewer","Interviewer"],["coordinator","Interview coordinator"],["admin","Admin"]].map(([v,l]) => `<option value="${v}"${(ROLE_LABEL[s.role] ? s.role : "member")===v?" selected":""}>${l}</option>`).join("")}</select>
    <button class="copy" type="button" data-rmstaff="${esc(email)}">Remove</button></span></div>`).join("");
  return `<div class="row"><span class="lbl">${esc(OWNER_EMAIL)}<small>Owner · full access</small></span></div>${rows}
    <p class="help" style="margin:6px 12px">Admin: sees every file (view only). Coordinator: sees every file and runs the interviews (posts times, books and reschedules, opens booking, assigns interviewers, messages applicants). Interviewer: only the applicants assigned on their Interview tab. Member: Messages only.</p>
    <div class="row" style="flex-wrap:wrap"><input id="tmEmail" type="email" placeholder="member@pvrs.org" class="inlinefield" style="flex:2 1 180px">
      <input id="tmName" type="text" placeholder="Name" class="inlinefield" style="flex:1 1 120px">
      <button class="btn small primary" type="button" id="tmAdd">Add member</button></div>`;
}
function openSettings(){
  const s = S.settings;
  $("#modal").onchange = async e => { const rs = e.target.closest?.("[data-rolesel]"); if (!rs) return;
    try { await setDoc(doc(db, "staff", rs.dataset.rolesel), { role: rs.value }, { merge: true }); toast(`${S.staff.get(rs.dataset.rolesel)?.name || rs.dataset.rolesel} is now ${/^[AEIOU]/.test(roleLabel(rs.value)) ? "an" : "a"} ${roleLabel(rs.value)}.`); } catch { toast("Couldn't change the role."); } };
  const M = openModal(`<h3>Settings</h3>
    <div class="group"><h3><span>Team</span></h3><div class="ios" id="reqList">${requestsHTML()}</div><div class="ios" id="teamList">${teamHTML()}</div>
      <p class="help" style="margin:4px 4px 0"><b>Members</b> can view the Application and Interview tabs. <b>Admins</b> can view every tab except Settings. Both can only fill in and complete the interview questionnaire; everything else is yours to change. They sign in on the Squad member tab with this address.</p></div>
    <div class="group"><h3><span>Emails</span></h3><div class="ios">
      <label class="row stack"><span class="lbl">Email signature<small>Printed at the end of every email</small></span><textarea id="sSig" rows="4" placeholder="Name, credentials">${esc(s.signature||"")}</textarea></label>
      <label class="row stack"><span class="lbl">Documents and questions go to</span><input type="text" id="sDocs" placeholder="${esc(CONTACT_EMAIL)}" value="${esc(s.docsEmail||"")}"></label>
      <label class="row stack"><span class="lbl">Board emails<small>For "Email the board" in Board meeting mode; separate with commas</small></span><input type="text" id="sBoard" placeholder="president@pvrs.org, secretary@pvrs.org" value="${esc(s.boardEmails||"")}"></label>
      <label class="row stack"><span class="lbl">Default interview location</span><input type="text" id="sLoc" placeholder="PVRS building" value="${esc(s.defaultLocation||"")}"></label></div></div>
    <div class="group"><h3><span>Saved replies</span><button class="btn small" type="button" id="qrAdd">Add reply</button></h3><div class="ios" id="qrList">${savedReplies().map(replyRowHTML).join("")}</div>
      <p class="help" style="margin:4px 4px 0">Buttons above the reply box on the Messages tab. <b>{first}</b> becomes the applicant's first name.</p></div>
    <div class="group"><h3><span>Med Control (AI assistant)</span></h3><div class="ios">
      ${F.seg("_ai","Med Control",[["on","On","good"],["off","Off"]]).replace('data-k="_ai"', 'id="sAi"')}
      <div class="row"><span class="lbl"><small>Chat, applicant briefs and reply drafts for you and admins, powered by Claude. Only turn on after the board has OK'd it and the API key is set (docs/med-control.md). It never sees license numbers, birth dates, addresses, phone numbers, conviction details or uploaded files, and it only drafts: nothing is sent without you.</small></span></div></div></div>
    <div class="group"><h3><span>New-member checklist</span></h3><div class="ios"><label class="row stack"><span class="lbl">One item per line<small>Shown on the Onboard tab and, once you move them to orientation, on the new member's dashboard. Add a link with a bar: <b>HIPAA training | https://…</b> Renaming an item starts it fresh.</small></span><textarea id="sOnb" rows="8">${esc(onbRaw().join("\n"))}</textarea></label>
      <label class="row stack"><span class="lbl">Finish orientation within (days)<small>Counts from the day you move them to orientation. Leave blank for no deadline.</small></span><input type="number" id="sOrientDays" min="1" max="365" class="inlinefield" value="${esc(s.orientDays || "")}"></label>
      <label class="row stack"><span class="lbl">Trainer sign-off list<small>One per line. Used when you first assign a trainer to a new member.</small></span><textarea id="sSkills" rows="5">${esc(skillItems().map(x => x[1]).join("\n"))}</textarea></label>
      <label class="row stack"><span class="lbl">Chief's email<small>For the duty-crew handoff</small></span><input type="email" id="sChief" class="inlinefield" value="${esc(s.chiefEmail || "")}"></label>
      <label class="row stack"><span class="lbl">Tech chair's email<small>For the email-account handoff</small></span><input type="email" id="sTech" class="inlinefield" value="${esc(s.techEmail || "")}"></label></div></div>
    <div class="group"><h3><span>Data retention</span></h3><div class="ios">
      <label class="row"><span class="lbl">Keep declined and withdrawn files for<small>Years with no changes before they're flagged for you to review and delete. Blank = off. Match the board's policy.</small></span><input type="number" id="sRet" min="1" max="20" placeholder="Off" value="${esc(s.retentionYears||"")}"></label>
      <div class="row"><span class="lbl">Old files<small>${pastRetention().length} past the retention period</small></span><button class="btn small" type="button" id="sRetReview">Review</button></div></div></div>
    <div class="group"><h3><span>Security</span></h3><div class="ios">
      <label class="row"><span class="lbl">Sign out after inactivity<small>Minutes with no mouse or keyboard use, for everyone on the team (5–240)</small></span><input type="number" id="sIdle" min="5" max="240" placeholder="30" value="${esc(s.idleMinutes||"")}"></label></div></div>
    <div class="group"><h3><span>Online application</span></h3><div class="ios">
      <div class="row"><span class="lbl">Application link for the squad website<small>${esc(location.origin)}/apply</small></span><button class="btn small" type="button" id="sCopyApply">Copy link</button><a class="btn small" href="/apply" target="_blank" rel="noopener">Open</a></div></div>
      <p class="help" style="margin:4px 4px 0">New applications appear in your list automatically (marked Online) the next time your desk is open, with the full form under Application → Online application.</p></div>
    <div class="group"><h3><span>Applicant view</span></h3><div class="ios">
      <div class="row"><span class="lbl">See what applicants see<small>Their portal, for any applicant on the roster</small></span><button class="btn small" type="button" id="sPreview">Preview</button></div></div></div>
    <div class="group"><h3><span>Backups</span></h3><div class="ios">
      <div class="row"><span class="lbl">Full export<small>Every field for every applicant. Save one to the PVRS Drive monthly.</small></span><button class="btn small" type="button" id="sFull">Export</button></div>
      <div class="row"><span class="lbl">Summary CSV<small>Dates, results and board votes only</small></span><button class="btn small" type="button" id="sSummary">Export</button></div>
      <div class="row"><span class="lbl">Import records<small>The migration file from the old Claude version</small></span><label class="btn small" for="sImport">Choose file</label><input type="file" id="sImport" accept="application/json,.json" hidden></div></div></div>
    <div class="acts"><button class="btn" type="button" id="sCancel">Cancel</button><button class="btn primary" type="button" id="sSave">Save</button></div>`, true);
  $("#sImport").addEventListener("change", e => importFile(e.target.files && e.target.files[0]));
  $("#sAi").querySelectorAll("button").forEach(b => { const on = b.dataset.v === (s.ai ? "on" : "off"); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
  M.onclick = async e => {
    const id = e.target.id;
    if (id === "sCancel") closeModal();
    if (id === "sPreview") openPreview(S.sel);
    if (id === "sRetReview") return openRetention();
    const sa = e.target.closest("#sAi button"); if (sa) { $("#sAi").querySelectorAll("button").forEach(b => { b.classList.toggle("on", b === sa); b.setAttribute("aria-pressed", b === sa); }); return; }
    if (id === "qrAdd") { $("#qrList").insertAdjacentHTML("beforeend", replyRowHTML()); $("#qrList .qredit:last-child .qrTitle").focus(); return; }
    const qrm = e.target.closest("[data-qrrm]"); if (qrm) { qrm.closest(".qredit").remove(); return; }
    if (id === "sCopyApply") { const u = location.origin + "/apply"; toast((await copyText(u)) ? "Copied " + u : u); }
    if (id === "sFull") exportFull();
    if (id === "sSummary") exportSummary();
    if (id === "tmAdd") {
      const email = lower($("#tmEmail").value), name = $("#tmName").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Enter a valid email.");
      if (email === lower(OWNER_EMAIL)) return toast("That's the owner account.");
      try { await setDoc(doc(db, "staff", email), { role: "member", name, addedAt: Date.now(), addedBy: S.me }); toast(`Added ${email} as a member`); } catch { toast("Couldn't add that member."); }
    }
    const ap = e.target.closest("[data-approve]"); if (ap) { ap.disabled = true; return decideRequest(ap.dataset.approve, ap.dataset.v); }
    const dn = e.target.closest("[data-deny]"); if (dn) { if (dn.dataset.confirm !== "1") { dn.dataset.confirm = "1"; dn.textContent = "Confirm deny"; return; } dn.disabled = true; return decideRequest(dn.dataset.deny, null); }

    const rm = e.target.closest("[data-rmstaff]"); if (rm) {
      if (rm.dataset.confirm !== "1") { rm.dataset.confirm = "1"; rm.textContent = "Confirm remove"; return; }
      try { await deleteDoc(doc(db, "staff", rm.dataset.rmstaff)); toast("Removed"); } catch { toast("Couldn't remove."); } }
    if (id === "sSave") {
      const idle = parseInt($("#sIdle").value, 10);
      const next = { signature: $("#sSig").value.trim(), docsEmail: $("#sDocs").value.trim(), defaultLocation: $("#sLoc").value.trim(), boardEmails: $("#sBoard").value.trim(), idleMinutes: idle ? Math.min(240, Math.max(5, idle)) : null, updatedAt: Date.now(),
        ai: $("#sAi .on")?.dataset.v === "on",
        retentionYears: parseInt($("#sRet").value, 10) > 0 ? Math.min(20, parseInt($("#sRet").value, 10)) : null,
        onbItems: [...new Set($("#sOnb").value.split("\n").map(x => x.trim()).filter(Boolean))].slice(0, 40),
        skillItems: [...new Set($("#sSkills").value.split("\n").map(x => x.trim()).filter(Boolean))].slice(0, 40),
        orientDays: +$("#sOrientDays").value > 0 ? Math.min(365, +$("#sOrientDays").value) : null, chiefEmail: $("#sChief").value.trim(), techEmail: $("#sTech").value.trim(),
        replies: [...document.querySelectorAll("#qrList .qredit")].map(r => ({ title: r.querySelector(".qrTitle").value.trim(), text: r.querySelector(".qrText").value.trim() })).filter(r => r.title && r.text).slice(0, 20) };
      try { await setDoc(doc(db, "settings", "main"), next, { merge: true }); closeModal(); toast("Settings saved"); } catch { toast("Couldn't save settings."); }
    }
  };
  S._teamPaint = () => { const el = $("#teamList"); if (el) el.innerHTML = teamHTML(); const rq = $("#reqList"); if (rq) { rq.innerHTML = requestsHTML(); rq.hidden = !S.requests.length; } };
  $("#reqList").hidden = !S.requests.length;
  M._cleanup = () => { S._teamPaint = null; };
}

/* ---------- exports / import ---------- */
const csvQ = v => `"${String(v ?? "").replace(/^yesbad$/,"yes").replace(/"/g,'""')}"`;
function exportSummary(){
  const cols = [["Name","name"],["Phone","phone"],["Email","email"],["Type","type"],["Location","_loc"],["Received","app.received"],["Complete","app.complete"],
    ["MVR completed","mvr.completed"],["MVR violations","mvr.violations"],["License verified","dl.date"],["License valid","dl.valid"],["License expires","dl.expires"],
    ["Sterling completed","bg.sterDone"],["Sterling result","bg.sterResult"],["Interview","_iv"],["Interview completed","sched.completed"],
    ["Committee","appr.committee"],["Board date","board.date"],["Board result","board.result"],["For","board.for"],["Against","board.against"],["Abstain","board.abstain"],
    ["Applicant notified","notify.applicant"],["Orientation notified","notify.orientation"],["Chief notified","notify.chief"],["Tech notified","notify.tech"]];
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
// Owner only. For clearing out test applicants (or anyone who withdraws).
function confirmDelete(id){
  if (!S.canEdit) return ownerOnlyToast();
  const a = S.apps.get(id); if (!a) return;
  const M = openModal(`<h3>Delete ${esc(a.name || "this applicant")}?</h3>
    <p class="help">Removes their file, interview answers, references, notes, history, portal, messages, uploads, staff records and their online application. This can't be undone.</p>
    <p class="help">🔒 Secure documents (medical, Social Security) stay with ${esc(PAPERWORK_EMAIL)}, who can delete it there.</p>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn danger" type="button" id="delGo">Delete permanently</button></div>`);
  $("#delGo").focus();
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    if (e.target.closest("#delGo")) { e.target.closest("#delGo").disabled = true; await deleteApplicant(id); closeModal(); }
  };
}
async function deleteApplicant(id, quiet = false, { keepRecordFiles = false } = {}){
  if (!S.canEdit) return ownerOnlyToast();
  const a = S.apps.get(id);
  try {
    if (a && a._booked) await releaseFor(id).catch(() => {});
    const files = await getDocs(collection(db, "portal", id, "files")).catch(() => null);
    if (files) for (const f of files.docs) { if (f.data().path) await deleteObject(ref(storage, f.data().path)).catch(() => {}); await deleteDoc(f.ref).catch(() => {}); }
    const pe = S.portal.get(id)?.email; if (pe) await deleteDoc(doc(db, "portalEmails", pe)).catch(() => {});
    await deleteDoc(doc(db, "portal", id)).catch(() => {});
    delete logBuf[id]; clearTimeout(logTimers[id]);
    const ms = await getDocs(collection(db, "portal", id, "messages")).catch(() => null);
    if (ms) for (const m of ms.docs) await deleteDoc(m.ref).catch(() => {});
    const links = await getDocs(query(collection(db, "refLinks"), where("appId", "==", id))).catch(() => null);
    if (links) for (const l of links.docs) { if (S._keepLinks?.has(l.id)) continue; await deleteDoc(doc(db, "refResponses", l.id)).catch(() => {}); await deleteDoc(l.ref).catch(() => {}); }
    const rus = await getDocs(collection(db, "portal", id, "refUpdates")).catch(() => null);
    if (rus) for (const u of rus.docs) await deleteDoc(u.ref).catch(() => {});
    const recs = await getDocs(collection(db, "applicants", id, "records")).catch(() => null);
    if (recs) for (const r0 of recs.docs) { if (r0.data().path && !keepRecordFiles) await deleteObject(ref(storage, r0.data().path)).catch(() => {}); await deleteDoc(r0.ref).catch(() => {}); }
    const hist = await getDocs(collection(db, "applicants", id, "history")).catch(() => null);
    if (hist) for (const h of hist.docs) await deleteDoc(h.ref).catch(() => {});
    const subs = await getDocs(query(collection(db, "submissions"), where("applicantId", "==", id))).catch(() => null);
    if (subs) for (const sd of subs.docs) await deleteDoc(sd.ref).catch(() => {});
    await deleteDoc(doc(db, "convos", id)).catch(() => {});
    await deleteDoc(doc(db, "signoffs", id)).catch(() => {});
    for (const [slotId, s0] of S.oslots) if (s0.bookedBy === id) await updateDoc(doc(db, "orientSlots", slotId), { bookedBy: null }).catch(() => {});
    const chk = await getDocs(collection(db, "portal", id, "checkins")).catch(() => null);
    if (chk) for (const c0 of chk.docs) await deleteDoc(c0.ref).catch(() => {});
    const toks = await getDocs(query(collection(db, "applicantTokens"), where("appId", "==", id))).catch(() => null);
    if (toks) for (const t of toks.docs) await deleteDoc(t.ref).catch(() => {});
    await deleteDoc(doc(db, "applicants", id, "private", "main"));
    await deleteDoc(doc(db, "applicants", id));
    if (S.sel === id) S.sel = null;
    renderList(); renderDetail(); if (!quiet) toast("Applicant deleted");
  } catch (e) { console.error(e); toast("Couldn't delete. Try again."); }
}

/* ---------- events ---------- */
const prefs = { get(k){ try { return localStorage.getItem("pvrsDesk." + k); } catch { return null; } }, set(k, v){ try { localStorage.setItem("pvrsDesk." + k, v); } catch {} } };
function switchTab(k){ flushAll(); if (S.ivMode && k !== "iv") exitIvMode(); S.tab = k; renderDetail(); const b = $("#dbody"); if (b) b.scrollTop = 0; }
/* ---------- celebrations ---------- */
// A short confetti burst in squad colours (skipped when the system asks for reduced motion) plus a toast.
function celebrate(msg){
  toast(msg);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas"); c.className = "confetti"; c.setAttribute("aria-hidden", "true");
  const dpr = Math.min(2, devicePixelRatio || 1); c.width = innerWidth * dpr; c.height = innerHeight * dpr; document.body.appendChild(c);
  const x = c.getContext("2d"); x.scale(dpr, dpr);
  const colors = ["#c8102e", "#ff4d5e", "#1f5fff", "#4c8dff", "#ffd66b", "#ffffff"];
  const P = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .35, vx: (Math.random() - .5) * 13, vy: -Math.random() * 12 - 4,
    r: 4 + Math.random() * 5, a: Math.random() * 6, va: (Math.random() - .5) * .35, c: colors[Math.floor(Math.random() * colors.length)] }));
  const t0 = performance.now();
  const frame = t => {
    const k = (t - t0) / 2400; x.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of P) { p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      x.save(); x.globalAlpha = Math.max(0, 1 - k); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); x.restore(); }
    if (k < 1) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}
// A small badge on the applicant's card for a few weeks after a big moment.
function milestoneChip(a){
  if (!S.admin) return "";
  const st = progress(a).stage, bd = get(a, "board.date"), recent = d => d && daysSince(d) <= 30;
  if (st === "act" && recent(get(a, "notify.tech") || get(a, "notify.chief") || bd)) return `<span class="mschip act" title="Finished onboarding">⭐ New member</span>`;
  if (get(a, "board.result") === "approved" && st !== "act" && recent(bd)) return `<span class="mschip" title="Approved by the board ${esc(fmtDate(bd))}">🎉 Approved</span>`;
  return "";
}

/* ---------- ⌘K: search applicants and run commands ---------- */
function openPalette(){
  const narrow = matchMedia("(max-width:860px)").matches;
  const go = fn => () => { closeModal(); setTimeout(fn, 60); };
  const openFile = (id, tab) => go(() => { select(id); if (tab && tab !== S.tab) switchTab(tab); });
  const commands = [
    { label: "New applicant", hint: "N", show: S.canEdit, words: "new add create applicant", run: go(openNew) },
    { label: "Overview", show: true, words: "overview home dashboard to do", run: go(() => narrow ? mnavGo("ov") : (S.sel ? deselect() : renderOverview())) },
    { label: "Board meeting", show: S.admin, words: "board meeting agenda packet vote", run: go(openBoardMtg) },
    { label: "Recruiting flyer (print)", show: S.admin, words: "flyer poster qr recruit print", run: go(printFlyer) },
    { label: "Year-end report (print)", show: S.admin, words: "year end annual report stats print", run: go(printYearReport) },
    { label: S.canEdit ? "Interview times" : "My interview times", show: canHostSlots(), words: "interview times slots schedule calendar", run: go(openSlots) },
    { label: "Orientation", show: S.admin || S.owner, words: "orientation new members board checklist", run: go(openOrientBoard) },
    { label: "Orientation times", show: S.canEdit, words: "orientation times schedule slots", run: go(openOrientTimes) },
    { label: "Sign-offs", show: !$("#trainBtn").hidden, words: "sign offs trainer skills", run: go(openSignoffs) },
    { label: "Documents", show: true, words: "documents library handbook policies forms", run: go(openLibrary) },
    { label: "Messages", show: !$("#msgsBtn").hidden, words: "messages inbox questions", run: go(() => openChat()) },
    { label: "Settings", show: S.owner, words: "settings team access signature", run: go(gateSettings) },
    { label: "Med Control", show: aiOn(), words: "ai assistant ask med control chat draft question", run: go(openMedControl) },
    { label: "Notifications", show: true, words: "notifications alerts push bell phone", run: go(openNotifications) },
    { label: "Show the tour", show: !S.owner, words: "tour tutorial help how guide welcome what can i do", run: go(() => showTour(S.role, tourOpts())) },
    ...(S.owner ? [["admin", "an Admin"], ["coordinator", "the Interview coordinator"], ["interviewer", "an Interviewer"], ["member", "a Member"], ["applicant", "an applicant"], ["newmember", "a new member in orientation"]]
      .map(([r, l]) => ({ label: `Tour: what ${l} is shown`, show: true, words: "tour tutorial help guide welcome preview " + r, run: go(() => showTour(r, { email: S.me })) })) : []),
    { label: "Two-step sign-in", show: true, words: "two step 2fa mfa authenticator security code", run: go(openTwoStep) },
    { label: "Sign-in password", show: true, words: "password key sign in", run: go(openPassword) },
    { label: "Keyboard shortcuts", hint: "?", show: true, words: "keyboard shortcuts help keys", run: go(openShortcuts) },
    { label: "Sign out", show: true, words: "sign out log out logout", run: go(() => document.querySelector("[data-signout]").click()) },
  ].filter(c => c.show);
  const M = openModal(`<div class="pal"><input id="palQ" type="search" placeholder="Find an applicant or type a command…" autocomplete="off" spellcheck="false" aria-label="Find an applicant or run a command" aria-controls="palList">
    <div class="pallist" id="palList" role="listbox"></div><p class="help palhint"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>↩</kbd> to open · <kbd>esc</kbd> to close</p></div>`);
  let items = [], cur = 0;
  // Every typed word must start some word in the text ("board" matches "Board meeting", not "dashboard").
  const has = (hay, q) => { const words = hay.split(/[^a-z0-9@.]+/).filter(Boolean); return q.split(/\s+/).filter(Boolean).every(w => words.some(x => x.startsWith(w))); };
  const build = () => {
    const q = $("#palQ").value.trim().toLowerCase(), out = [];
    const people = sorted().map(r => r.a).filter(a => !q || has(`${a.name || ""} ${a.email || ""} ${a.phone || ""} ${String(a.phone || "").replace(/\D/g, "")}`.toLowerCase(), q));
    people.slice(0, q ? 6 : 5).forEach(a => out.push({ label: a.name || "Unnamed applicant", sub: [STAGES[view(a).stage]?.label, a.type].filter(Boolean).join(" · "), av: a, run: openFile(a._id) }));
    const top = q && people[0];
    if (top && people.length <= 3) {
      const fn = top.name || "applicant", id = top._id;
      out.push({ label: `Interview mode`, sub: fn, icon: "▶", run: go(() => { select(id); enterIvMode(); }) });
      if (S.admin) out.push({ label: "Open Checks", sub: fn, icon: "✓", run: openFile(id, "checks") });
      if (S.admin) out.push({ label: "Print application", sub: fn, icon: "⎙", run: go(() => printOriginal(id)) });
      if (S.canEdit && refList(top).length) out.push({ label: "Email reference forms", sub: fn, icon: "✉", run: go(() => openRefsAll(id)) });
      if (S.canEdit && !get(top, "portal.invited") && okEmail(top.email)) out.push({ label: `Welcome ${first(top.name)}`, sub: "Portal invite, welcome message and email", icon: "✉", run: go(() => inviteToPortal(id)) });
      if (S.canEdit && okEmail(top.email)) out.push({ label: `Email ${first(top.name)}`, sub: top.email, icon: "✉", run: go(() => { select(id); openEmailPicker(); }) });
    }
    if (q) searchAll(q).forEach(h => out.push({ label: h.label, sub: h.sub, icon: h.icon, run: go(h.open) }));
    commands.filter(c => !q || has(`${c.label.toLowerCase()} ${c.words}`, q))
      .sort((x, y) => (q && !x.label.toLowerCase().startsWith(q)) - (q && !y.label.toLowerCase().startsWith(q)))
      .forEach(c => out.push({ ...c, cmd: true }));
    items = out; cur = Math.min(cur, Math.max(0, items.length - 1));
    $("#palList").innerHTML = items.length ? items.map((x, i) => `<button type="button" class="palitem${i === cur ? " on" : ""}" role="option" aria-selected="${i === cur}" data-pi="${i}">
        ${x.av ? `<span class="av" style="--stage-c:${stageVar(view(x.av).stage)}" aria-hidden="true">${esc(initials(x.av.name))}</span>` : `<span class="palic" aria-hidden="true">${esc(x.icon || "›")}</span>`}
        <span class="ot"><b>${esc(x.label)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</span>${x.hint ? `<kbd>${esc(x.hint)}</kbd>` : x.cmd ? `<small class="paltag">Command</small>` : ""}</button>`).join("")
      : `<div class="oempty">Nothing matches “${esc(q)}”.</div>`;
    $("#palList .palitem.on")?.scrollIntoView({ block: "nearest" });
  };
  const q = $("#palQ");
  q.addEventListener("input", () => { cur = 0; build(); });
  q.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); cur = (cur + 1) % Math.max(1, items.length); build(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); cur = (cur - 1 + items.length) % Math.max(1, items.length); build(); }
    else if (e.key === "Enter") { e.preventDefault(); items[cur]?.run(); }
  });
  M.onclick = e => { const b = e.target.closest("[data-pi]"); if (b) items[+b.dataset.pi]?.run(); };
  build(); q.focus();
}

/* ---------- interview mode ---------- */
// The Interview tab, full screen and one section at a time. Sections that don't apply (hidden by SHOW) are skipped;
// the page sign-off is the last step. Inputs are the normal ones, so everything saves exactly as usual.
function enterIvMode(){
  const a = S.apps.get(S.sel); if (!a) return;
  if (S.tab !== "iv") switchTab("iv");
  S.ivMode = true; S.ivStep = 0;
  $("#app").classList.add("ivmode");
  applyIvMode();
}
function exitIvMode(){
  S.ivMode = false;
  $("#app").classList.remove("ivmode");
  document.querySelectorAll("#dpanel .ivcur").forEach(g => g.classList.remove("ivcur"));
  $("#ivBar")?.remove(); $("#ivTop")?.remove();
  const b = $("#dbody"); if (b) b.scrollTop = 0;
}
// In question order: stackCols() splits sections into two columns (keeping style.order), so sort by that, then the sign-off.
const ivSteps = () => {
  const out = [];
  document.querySelectorAll("#dpanel .cols").forEach(c => out.push(...[...c.querySelectorAll(".group")].sort((x, y) => (+x.style.order || 0) - (+y.style.order || 0))));
  document.querySelectorAll("#dpanel > .group").forEach(g => out.push(g));
  return out.filter(g => !g.hidden && !g.closest("[hidden]") && !g.classList.contains("noiv"));
};
function applyIvMode(){
  if (!S.ivMode || S.tab !== "iv" || !S.sel) return exitIvMode();
  const steps = ivSteps(); if (!steps.length) return;
  S.ivStep = Math.max(0, Math.min(S.ivStep || 0, steps.length - 1));
  document.querySelectorAll("#dpanel .group").forEach(g => g.classList.toggle("ivcur", g === steps[S.ivStep]));
  const D = $("#detail"), a = S.apps.get(S.sel), cur = steps[S.ivStep];
  const title = cur.querySelector("h3 span")?.textContent || "Section";
  if (!$("#ivTop")) D.insertAdjacentHTML("beforeend", `<div class="ivtop glass" id="ivTop"><span class="ivwho"></span><button class="btn small" type="button" data-iv="exit">Done</button></div>`);
  if (!$("#ivBar")) D.insertAdjacentHTML("beforeend", `<div class="ivbar glass" id="ivBar"><button class="btn" type="button" data-iv="prev">‹ Back</button><div class="ivpos"><b></b><small></small><span class="ivprog"><i></i></span></div><button class="btn primary" type="button" data-iv="next">Next ›</button></div>`);
  $("#ivTop .ivwho").textContent = `Interview · ${a.name || "Applicant"}`;
  $("#ivBar .ivpos b").textContent = title;
  $("#ivBar .ivpos small").textContent = `${S.ivStep + 1} of ${steps.length}`;
  $("#ivBar .ivprog i").style.width = `${Math.round((S.ivStep + 1) / steps.length * 100)}%`;
  $("#ivBar [data-iv=prev]").disabled = S.ivStep === 0;
  const last = S.ivStep === steps.length - 1, nb = $("#ivBar [data-iv=next]");
  nb.textContent = last ? "Finish" : "Next ›";
}
function ivGo(d){
  const steps = ivSteps();
  if (d > 0 && S.ivStep >= steps.length - 1) { exitIvMode(); toast("Interview mode closed. Everything is saved."); return; }
  flushAll(); S.ivStep = Math.max(0, S.ivStep + d); applyIvMode();
  const b = $("#dbody"); if (b) b.scrollTop = 0;
  const f = steps[S.ivStep] && ivSteps()[S.ivStep]?.querySelector("textarea,input:not([type=hidden]),.seg button"); if (f && matchMedia("(min-width:861px)").matches) f.focus({ preventScroll: true });
}

/* ---------- phone menu (floating glass bar at the bottom) ---------- */
// It mirrors the sidebar: each item is shown only when the matching sidebar button is, so roles stay the same.
function paintMnav(){
  const m = $("#mnav"); if (!m) return;
  m.querySelector('[data-m="msgs"]').hidden = $("#msgsBtn").hidden;
  m.querySelectorAll("[data-m]").forEach(b => b.classList.toggle("on", b.dataset.m === (S.chatOn ? "msgs" : S.mOv ? "ov" : S.filter === "orient" ? "orient" : "list")));
  $("#app").classList.toggle("ovopen", !!S.mOv && !S.sel);
}
function mnavGo(k){
  if (k === "new") return openNew();
  if (k === "msgs") return openChat();
  if (S.chatOn) closeChat();
  if (k === "more") return openMore();
  S.mOv = k === "ov";
  if (k === "orient") S.filter = "orient"; else if (k === "list" && S.filter === "orient") S.filter = "all";   // Applicants and Orientation are separate lists
  if (S.sel) deselect(); else { renderList(); renderDetail(); }
  if (k === "list") { const l = $("#list"); if (l) l.scrollTop = 0; }
  paintMnav();
}
// Phones: the file's header icons collapse into one Actions button; this sheet lists them with labels.
function openActions(){
  const a = S.apps.get(S.sel); if (!a) return;
  const btns = [...document.querySelectorAll(".dhead .hacts [data-act]")].filter(b => b.dataset.act !== "actions");
  const M = openModal(`<h3>${esc(a.name || "Applicant")}</h3>
    <div class="ios morelist">${btns.map((b, i) => `<button class="row" type="button" data-pick="${i}"><span class="mi">${b.querySelector("svg")?.outerHTML || ""}</span><span class="lbl"${b.dataset.act === "delete" ? ' style="color:var(--s-dec)"' : ""}>${esc(b.title || b.textContent.trim())}</span><span class="chev" aria-hidden="true">›</span></button>`).join("")}</div>
    <div class="acts"><button class="btn" type="button" data-x>Close</button></div>`);
  M.onclick = e => { if (e.target.closest("[data-x]")) return closeModal(); const p = e.target.closest("[data-pick]"); if (p) { closeModal(); const b = btns[+p.dataset.pick]; setTimeout(() => b.click(), 60); } };
}
function openMore(){
  const tools = [["newBtn", "New applicant"], ["aiBtn", "Med Control"], ["slotsBtn", "Interview times"], ["orientBtn", "Orientation"], ["trainBtn", "Sign-offs"], ["libBtn", "Documents"], ["boardBtn", "Board meeting"], ["settingsBtn", "Settings"], ["kbdBtn", null], ["pwBtn", "Sign-in password"]]
    .filter(([id, label]) => label && $("#" + id) && !$("#" + id).hidden);
  const icon = id => { const svg = $("#" + id).querySelector("svg"); return svg ? svg.outerHTML : ""; };
  const M = openModal(`<div class="moreme"><span class="av" aria-hidden="true">${esc(initials(S.name || S.me))}</span><span><b>${esc(S.name || S.me)}</b><small>${S.owner ? "Owner" : roleLabel(S.role)} · ${esc(S.me)}</small></span></div>
    <div class="ios morelist">${tools.map(([id, label]) => `<button class="row" type="button" data-more="${id}"><span class="mi">${icon(id)}</span><span class="lbl">${esc(label)}</span><span class="chev" aria-hidden="true">›</span></button>`).join("")}
      ${S.me ? `<button class="row" type="button" data-notif><span class="mi"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1 1H3l1-1zM6.5 14h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="lbl">Notifications</span><span class="chev" aria-hidden="true">›</span></button>` : ""}
      ${S.owner ? "" : `<button class="row" type="button" data-tour><span class="mi"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6.4 6.3a1.7 1.7 0 1 1 2.4 1.6c-.5.3-.8.6-.8 1.2M8 11.4v.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span><span class="lbl">How this works</span><span class="chev" aria-hidden="true">›</span></button>`}
      <button class="row" type="button" data-signout><span class="mi">${$(".me [data-signout] svg")?.outerHTML || ""}</span><span class="lbl" style="color:var(--s-dec)">Sign out</span></button></div>
    <div class="acts"><button class="btn" type="button" data-x>Close</button></div>`);
  M.onclick = e => { if (e.target.closest("[data-x]")) return closeModal(); if (e.target.closest("[data-notif]")) { closeModal(); setTimeout(openNotifications, 60); return; } if (e.target.closest("[data-tour]")) { closeModal(); setTimeout(() => showTour(S.role, tourOpts()), 60); return; } const b = e.target.closest("[data-more]"); if (b) { closeModal(); setTimeout(() => $("#" + b.dataset.more).click(), 60); } };
}
function deselect(){ if (S.ivMode) exitIvMode(); flushAll(); S.sel = null; watchFiles(null); watchHistory(null); watchRecords(null); renderList(); renderDetail(); }
// Choosing a filter (sidebar or stage tile) shows the results in the dashboard's Applicants box.
function setFilter(f, focusList){
  S.filter = f;
  if (isDesk()) { if (S.chatOn) { closeChat(); } if (S.sel) deselect(); else renderDetail(); }
  renderList();
  const slot = $("#ovRoster"); if (slot && isDesk()) slot.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth" });
  if (focusList) { const L = $("#list"); $(".roster").scrollTop = 0; const first = L.querySelector(".arow"); if (first && innerWidth > 860) first.focus({ preventScroll: true }); }
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
  if (!S.sched) return ownerOnlyToast();
  if (S.coord) return openEmail("interview");   // the coordinator's one email: pick an interview time
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
    ${k("⌘","K")}<span>Search applicants or run a command</span>
    ${k("/")}<span>Filter the applicant list</span>
    ${k("J")}<span>Next applicant (or <kbd>↓</kbd> in the list)</span>
    ${k("K")}<span>Previous applicant (or <kbd>↑</kbd> in the list)</span>
    ${k("/")}<span>Search</span>
    ${S.canEdit ? `${k("N")}<span>New applicant</span>` : ""}
    ${k("1")}<span>…through <kbd>7</kbd>: switch tabs on the open file</span>
    ${k("[")}<span>Previous tab</span>
    ${k("]")}<span>Next tab</span>
    ${S.canEdit ? `${k("E")}<span>Write an email to the open applicant</span>` : ""}
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
    return openPalette();
  }
  if (e.key === "Escape") {
    if (modalOpen) return;   // the modal handles its own Escape
    if (tg && tg.id === "q") { if (S.q) { S.q = ""; tg.value = ""; renderList(); } else tg.blur(); return; }
    if (S.ivMode) { if (typing) tg.blur(); exitIvMode(); return; }
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
  else if ((e.key === "n" || e.key === "N") && S.canEdit) { e.preventDefault(); openNew(); }
  else if (e.key === "/") { e.preventDefault(); if (isDesk() && (S.sel || S.chatOn)) { if (S.chatOn) closeChat(); if (S.sel) deselect(); else renderDetail(); } $("#q").focus(); }
  else if (e.key === "?") { e.preventDefault(); openShortcuts(); }
  else if (S.sel && /^[1-9]$/.test(e.key) && tabs[+e.key - 1]) { e.preventDefault(); switchTab(tabs[+e.key - 1]); }
  else if (S.sel && (e.key === "[" || e.key === "]")) { e.preventDefault(); const i = tabs.indexOf(S.tab); switchTab(tabs[(i + (e.key === "]" ? 1 : -1) + tabs.length) % tabs.length]); }
  else if (S.sel && S.canEdit && (e.key === "e" || e.key === "E")) { e.preventDefault(); openEmailPicker(); }
}
function bindEvents(){
  $("#list").addEventListener("click", e => { const c = e.target.closest(".arow"); if (!c) return;
    if (S.bulk) { const id = c.dataset.id; S.bulk.has(id) ? S.bulk.delete(id) : S.bulk.add(id); renderList(); paintBulk(); return; }
    select(c.dataset.id); });
  if (S.owner) { $("#bulkBtn").hidden = false; $("#bulkBtn").addEventListener("click", () => bulkToggle(!S.bulk));
    $("#bulkBar").addEventListener("click", e => { const b = e.target.closest("[data-bulk]"); if (!b) return; const k = b.dataset.bulk;
      if (k === "all") { const all = S.vis || []; S.bulk = S.bulk.size === all.length ? new Set() : new Set(all); renderList(); paintBulk(); return; }
      if (k === "assign") return bulkAssign(); if (k === "msg") return bulkMessage(); if (k === "refs") return bulkRefs(); }); }
  const onFilter = e => { const c = e.target.closest("[data-f]"); if (!c) return; if (innerWidth <= 860 && S.sel) deselect(); setFilter(c.dataset.f); };
  $("#chips").addEventListener("click", onFilter);
  $("#chipsMini").addEventListener("click", onFilter);
  $("#q").addEventListener("input", e => { S.q = e.target.value; renderList(); });
  matchMedia("(min-width:861px)").addEventListener("change", () => { if (!S.sel && !S.chatOn) renderDetail(); placeRoster(); });
  const sortSel = $("#sort"); sortSel.value = S.sort; sortSel.addEventListener("change", e => { S.sort = e.target.value; prefs.set("sort", S.sort); renderList(); });
  $("#overviewBtn").addEventListener("click", () => { if (S.chatOn) { closeChat(); renderDetail(); return; } if (S.sel) deselect(); else { S.filter = "all"; renderList(); } });
  $("#mnav").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (b) mnavGo(b.dataset.m); });
  $("#detail").addEventListener("pointerover", statsHover); $("#detail").addEventListener("pointerleave", () => { const t = $("#mtip"); if (t) t.hidden = true; });
  $("#kbdBtn").addEventListener("click", openShortcuts);
  addEventListener("keydown", onKeys);
  const D = $("#detail");
  D.addEventListener("input", e => { const el = e.target.closest("[data-k]"); if (!el || el.classList.contains("seg")) return;
    let v = el.value; if (el.classList.contains("init")) v = v.toUpperCase(); if (el.type === "number") v = v === "" ? "" : Math.max(0, parseInt(v,10) || 0);
    edit(S.sel, el.dataset.k, v); });
  D.addEventListener("focusout", e => { if (e.target.matches("[data-k]")) flushAll(); });
  D.addEventListener("keydown", e => { if (e.target.id === "replyText" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply(); } });
  D.addEventListener("click", async e => {
    const t = e.target;
    const ivb = t.closest("[data-iv]"); if (ivb) { const k = ivb.dataset.iv; if (k === "exit") exitIvMode(); else ivGo(k === "next" ? 1 : -1); return; }
    const tab = t.closest("[data-tab]");
    if (tab) { switchTab(tab.dataset.tab); return; }
    const po = t.closest("[data-printother]"); if (po) { const x = S.apps.get(S.sel)?.otherForms?.[+po.dataset.printother]; if (x) printForm(x); return; }
    const oa = t.closest("[data-oact]"); if (oa && S.sel) { const k = oa.dataset.oact; if (k === "move") return openMoveToOrientation(S.sel); if (k === "member") return openMakeMember(S.sel); if (k === "back") return moveBackToApplicant(S.sel); if (k === "book") return openOrientBook(S.sel); if (k === "attend") return markAttended(S.sel); if (k === "record") return printOrientRecord(S.sel); if (k === "trainers") return openTrainers(S.sel); if (k === "reqdocs") return openOrientDocs(S.sel); }
    const oru = t.closest("[data-orup]"); if (oru && S.sel) return pickOrientDoc(S.sel, oru.dataset.orup, oru.dataset.orlabel);
    const oap = t.closest("[data-oapprove]"); if (oap) { edit(S.sel, `onb.items.${oap.dataset.oapprove}`, today()); toast("Approved"); return; }
    const ord = t.closest("[data-oread]"); if (ord) { edit(S.sel, `onb.checkinRead.${ord.dataset.oread}`, today()); return; }
    const si = t.closest("[data-startiv]"); if (si) { select(si.dataset.startiv); switchTab("iv"); enterIvMode(); return; }
    const dp = t.closest("[data-dupe]"); if (dp) return openDupe(S.sel, dp.dataset.dupe);
    const op = t.closest("[data-open]"); if (op) return select(op.dataset.open);
    const fl0 = t.closest("[data-filter]"); if (fl0) return setFilter(fl0.dataset.filter, true);
    const td = t.closest("[data-todo]"); if (td) { const tab = td.dataset.totab; select(td.dataset.todo); if (tab && tab !== S.tab) switchTab(tab); return; }
    const ta = t.closest("[data-todoact]");
    if (ta) { const id = ta.dataset.id, k = ta.dataset.todoact;
      if (k === "refsall") return openRefsAll(id);
      if (k === "dupe") return openDupe(id);
      if (k === "omove") return openMoveToOrientation(id);
      if (k === "omember") return openMakeMember(id);
      if (k === "oattend") return markAttended(id);
      if (k === "obook") return openOrientBook(id);
      if (k === "handoff_chief") return handoffMail(id, "chief");
      if (k === "handoff_tech") return handoffMail(id, "tech");
      if (k === "retention") return openRetention();
      if (k === "nextgo") { select(id); setTimeout(goNextStep, 60); return; }
      if (k === "invite") return inviteToPortal(id);
      if (k === "book") return openBook(id);
      if (k === "assigniv") return openAssignInterviewers(id);
      if (k === "slots") return openSlots();
      if (k === "ivmail") return openEmail("interview", undefined, id);
      if (k === "booking") { edit(id, "portal.bookingOpen", "yes"); toast(`Booking opened for ${S.apps.get(id)?.name || "them"}`); renderOverview(); return; }
      return; }
    const cmd = t.closest("[data-cmd]"); if (cmd) { if (cmd.dataset.cmd === "todoall") { S.todoAll = !S.todoAll; renderOverview(); return; } if (cmd.dataset.cmd === "board") return openBoardMtg(); if (cmd.dataset.cmd === "flyer") return printFlyer(); if (cmd.dataset.cmd === "yearreport") return printYearReport(); if (cmd.dataset.cmd === "palette") return openPalette(); if (cmd.dataset.cmd === "slots") openSlots(); if (cmd.dataset.cmd === "settings") gateSettings(); if (cmd.dataset.cmd === "inbox") openChat(); return; }
    const om = t.closest("[data-openmsg]"); if (om) return openChat("a:" + om.dataset.openmsg);
    const qr = t.closest("[data-qr]"); if (qr) return useQuickReply(+qr.dataset.qr);
    const air = t.closest("[data-aireply]"); if (air) return aiDraftReply(air);
    const aib = t.closest("[data-aibrief]"); if (aib) return aiMakeBrief(aib);
    const step = t.closest("[data-step]");
    if (step) { const tb = STEP_TAB[+step.dataset.step]; if (tb && tb !== S.tab && (S.admin ? TABS_ADMIN : TABS_MEMBER).some(x => x[0] === tb)) switchTab(tb); return; }
    if (!S.canEdit && t.closest(OWNER_ONLY) && !(S.sched && t.closest(SCHED_OK))) return ownerOnlyToast();
    const act = t.closest("[data-act]");
    if (act) {
      const k = act.dataset.act;
      if (k === "nextgo") return goNextStep();
      if (k === "email") return openEmailPicker();
      if (k === "invite") return inviteToPortal(S.sel);
      if (k === "preview") { flushAll(); return openPreview(S.sel); }
      if (k === "delete") return confirmDelete(S.sel);
      if (k === "refsall") return openRefsAll(S.sel);
      if (k === "actions") return openActions();
      if (k === "ivmode") return enterIvMode();
      if (k === "docs") return openRequestDocs(S.sel);
      if (k === "records") return openUploadRecords(S.sel);
      if (k === "viewform") return openForm(S.sel);
      if (k === "printform") { const a = S.apps.get(S.sel); if (a && a.form) printForm(a.form); return; }
      if (k === "printapp") return printOriginal(S.sel);
      if (k === "assigniv") return openAssignInterviewers(S.sel);
      if (k === "uploadapp") return openUploadRecords(S.sel, "Application");
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
    const rv = t.closest("[data-refview]"); if (rv) return openRefAnswers(S.sel, +rv.dataset.refview);
    const rcp = t.closest("[data-refcopy]");
    if (rcp) { const url = await refLink(S.sel, +rcp.dataset.refcopy); if (url) toast((await copyText(url)) ? "Link copied. It's private to this reference and works once." : url); return; }
    const rml = t.closest("[data-refmail]"); if (rml) return emailRefLink(S.sel, +rml.dataset.refmail);
    const rrem = t.closest("[data-refremind]"); if (rrem) return remindRefLink(S.sel, +rrem.dataset.refremind);
    const rp = t.closest("[data-refrep]");
    if (rp) { const a = S.apps.get(S.sel), i = rp.dataset.refrep;
      if (get(a,`refs.r${i}.replace`)) { edit(S.sel, `refs.r${i}.replace`, ""); toast("Request cancelled"); return; }
      if (!String(get(a,`refs.r${i}.name`) || "").trim()) return toast("Enter the reference's name first.");
      edit(S.sel, `refs.r${i}.replace`, today());
      toast(get(a,"portal.invited") ? `Asked ${first(a.name)} for a different reference. They'll see it in their portal.` : "Saved. Invite them to the portal so they can send a new reference.");
      return; }
    const rr = t.closest("[data-refrcv]");
    if (rr) { const a = S.apps.get(S.sel), i = rr.dataset.refrcv; if (!String(get(a,`refs.r${i}.name`) || "").trim()) return toast("Enter the reference's name first.");
      edit(S.sel, `refs.r${i}.returned`, get(a,`refs.r${i}.returned`) ? "" : today()); return; }
    const rc = t.closest("[data-docrcv]"); if (rc) { const a = S.apps.get(S.sel); const k = rc.dataset.docrcv; edit(S.sel, `docs.requested.${k}.received`, get(a,`docs.requested.${k}.received`) === "yes" ? "" : "yes"); return; }
    const rm = t.closest("[data-docrm]"); if (rm) { if (rm.dataset.confirm !== "1") { rm.dataset.confirm = "1"; rm.textContent = "Confirm"; return; } edit(S.sel, `docs.requested.${rm.dataset.docrm}.removed`, true); return; }
    const fl = t.closest("[data-file]"); if (fl) return openFile(fl.dataset.file);
    if (t.closest("[data-reply]")) return sendReply();
    const rc0 = t.closest("[data-rec]"); if (rc0) return openRecord(rc0.dataset.rec);
    const rrm = t.closest("[data-recrm]"); if (rrm) { if (rrm.dataset.confirm !== "1") { rrm.dataset.confirm = "1"; rrm.textContent = "Confirm remove"; return; } return removeRecord(rrm.dataset.recrm); }
    const segBtn = t.closest(".seg button");
    if (segBtn && segBtn.parentElement.dataset.k) { const k = segBtn.parentElement.dataset.k; const cur = get(S.apps.get(S.sel), k);
      const v = cur === segBtn.dataset.v && k !== "status" ? "" : segBtn.dataset.v; edit(S.sel, k, v);
      if (k === "portal.bookingOpen" && v === "yes") { const a = S.apps.get(S.sel); if (a.email && !get(a,"portal.invited")) toast("Welcome them first (the Welcome button above) so they can sign in and book."); else if (a.email) setTimeout(() => openEmail("interview"), 300); }
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
  $("#aiBtn").addEventListener("click", openMedControl);
  $("#slotsBtn").addEventListener("click", openSlots);
  $("#newBtn").addEventListener("click", openNew);
  $("#boardBtn").addEventListener("click", () => openBoardMtg());
  $("#pwBtn").addEventListener("click", openPassword);
  $("#orientBtn").addEventListener("click", openOrientBoard);
  $("#trainBtn").addEventListener("click", openSignoffs);
  $("#libBtn").addEventListener("click", openLibrary);
  $("#msgsBtn").addEventListener("click", () => openChat());
  bindChat();

}
function select(id){
  if (!S.apps.has(id)) return;
  if (S.chatOn) closeChat();
  flushAll(); const same = S.sel === id; S.sel = id;
  if (!same && S.admin && inOrient(S.apps.get(id))) S.tab = "onb";   // someone in orientation opens on their orientation page
  if (!same) { watchFiles(id); watchHistory(id); watchRecords(id); }
  renderList(); renderDetail();
  const b = $("#dbody"); if (b && !same) b.scrollTop = 0;
  if (S.canEdit) schedulePortal(id, 200);
}

function openNew(){
  if (!S.canEdit) return ownerOnlyToast();
  const M = openModal(`<form id="newAppForm" style="display:contents" novalidate><h3>New applicant</h3>
    <div class="ios">${F.text("n.name","Full name","First Last")}${F.text("n.phone","Phone","(315) 555-0100","tel")}${F.text("n.email","Email","name@example.com","email")}${F.date("n.received","Date received")}</div>
    <div class="ios">${F.seg("n.type","Membership type",TYPES.map(t=>[t,t]),true)}${F.seg("n.location","Location",[["Potsdam","Potsdam"],["other","Other"]])}<div id="nLocRow" hidden>${F.text("n.locationOther","Where?","Town")}</div></div>
    <div class="acts"><button class="btn" type="button" id="nCancel">Cancel</button><button class="btn primary" type="submit">Add applicant</button></div></form>`);
  const draft = { type:"Regular", location:"Potsdam" };
  const paintSeg = () => M.querySelectorAll(".seg").forEach(s => s.querySelectorAll("button").forEach(b => b.classList.toggle("on", draft[s.dataset.k.slice(2)] === b.dataset.v)));
  const paint = () => { $("#nLocRow").hidden = draft.location !== "other"; };
  $("#f-n-received").value = today(); paintSeg(); paint(); $("#f-n-name").focus();
  M.onclick = e => { const b = e.target.closest(".seg button"); if (b) { draft[b.parentElement.dataset.k.slice(2)] = b.dataset.v; paintSeg(); paint(); if (draft.location === "other") $("#f-n-locationOther").focus(); } if (e.target.id === "nCancel") closeModal(); };
  $("#newAppForm").onsubmit = async e => {
    e.preventDefault();
    const name = $("#f-n-name").value.trim(); if (!name) { $("#f-n-name").focus(); return toast("Enter the applicant's name."); }
    const data = { name, phone:$("#f-n-phone").value.trim(), email:$("#f-n-email").value.trim(), type:draft.type, location:draft.location, ...(draft.location==="other"?{locationOther:$("#f-n-locationOther").value.trim()}:{}), stage:"screen",
      app:{ received:$("#f-n-received").value || today() }, createdAt:Date.now(), updatedAt:Date.now(), createdBy:S.me, updatedBy:S.me };
    try { const r = doc(collection(db, "applicants")); await setDoc(r, data); S.shared.set(r.id, data); rebuild(r.id); writeLog(r.id, [{ path: "_created", from: "", to: name }]); closeModal(); S.tab = "app"; select(r.id); toast("Added " + name); }
    catch (err) { console.error(err); toast("Couldn't add the applicant."); }
  };
}
/* ---------- board meeting mode ---------- */
// The board queue, one applicant per screen: their checks at a glance and the vote, with Copy agenda / Print packet.
// The list is fixed when the meeting opens, so applicants don't vanish from it as votes are recorded.
const BM = { ids: [], i: 0, date: "" };
function openBoardMtg(){
  if (!S.admin) return;
  flushAll();
  BM.ids = sorted().filter(r => inBoardQueue(r.a)).map(r => r.a._id); BM.i = 0; BM.date = BM.date || today();
  let el = $("#boardMtg");
  if (!el) { el = document.createElement("div"); el.id = "boardMtg"; el.className = "bmtg"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Board meeting"); document.body.appendChild(el); wireBoardMtg(el); }
  el.hidden = false; document.body.classList.add("bmopen"); $("#app").inert = true; paintBoardMtg(); el.querySelector("[data-bm=close]")?.focus();
}
function closeBoardMtg(){ const el = $("#boardMtg"); if (el) el.hidden = true; document.body.classList.remove("bmopen"); $("#app").inert = false; flushAll(); renderList(); if (!S.sel) renderOverview(); }
const avgRating = a => { const vals = []; [1,2,3,4].forEach(i => Object.values(get(a,`refs.r${i}.form.answers.ratings`) || {}).forEach(v => { if (typeof v === "number") vals.push(v); })); return vals.length ? (vals.reduce((x, y) => x + y, 0) / vals.length) : null; };
function paintBoardMtg(){
  const el = $("#boardMtg"); if (!el) return;
  const n = BM.ids.length, id = BM.ids[BM.i], a = id && S.apps.get(id), ro = !S.canEdit ? "disabled" : "";
  const top = `<div class="bmtop glass"><div class="bmt"><b>Board meeting</b><label>Meeting date <input type="date" id="bmDate" value="${esc(BM.date)}" ${ro}></label></div>
    <div class="bmacts"><button class="btn small" type="button" data-bm="agenda">Copy agenda</button><button class="btn small" type="button" data-bm="email" ${n ? "" : "disabled"}>Email the board</button><button class="btn small" type="button" data-bm="packet" ${n ? "" : "disabled"}>Print packet</button><button class="btn small primary" type="button" data-bm="close">Done</button></div></div>`;
  if (!a) { el.innerHTML = top + `<div class="bmbody"><div class="bmempty"><h2>Nobody is on the board queue</h2><p>Applicants show up here once the membership committee approves them and their references are in.</p></div></div>`; return; }
  const g = k => get(a, k), rs = refStatus(a), avg = avgRating(a);
  const chk = (ok, label, detail, bad) => `<div class="bmchk ${bad ? "bad" : ok ? "ok" : "no"}"><span class="dot" aria-hidden="true">${bad ? "!" : ok ? "✓" : "–"}</span><span><b>${esc(label)}</b><small>${esc(detail || "")}</small></span></div>`;
  const panel = [1,2,3,4,5].map(i => g("iv.panel.m" + i)).filter(Boolean).join(", ");
  const ivDate = g("sched.completed");
  const q = (label, k) => g(k) ? `<div class="bmq"><b>${esc(label)}</b><p>${esc(g(k))}</p></div>` : "";
  el.innerHTML = top + `<div class="bmbody"><article class="bmcard glass">
      <header><span class="av" style="--stage-c:${stageVar(view(a).stage)}" aria-hidden="true">${esc(initials(a.name))}</span><div><h2>${esc(a.name || "Applicant")}</h2>
        <p>${esc([a.type ? a.type + " membership" : "", loc(a), g("app.received") ? "applied " + fmtDate(g("app.received")) : ""].filter(Boolean).join(" · "))}</p></div>
        ${g("board.result") === "tabled" && !g("board.date") ? `<span class="badge wait">Tabled last time</span>` : ""}</header>
      <div class="bmchecks">
        ${chk(g("app.complete") === "yes", "Application", g("app.complete") === "yes" ? "Complete" : "Not complete")}
        ${chk(!!g("mvr.completed"), "Driving record", g("mvr.completed") ? `Completed ${fmtDate(g("mvr.completed"))}${g("mvr.violations") === "yesbad" ? " · violations" : ""}` : "Not completed", g("mvr.violations") === "yesbad")}
        ${chk(!!g("dl.date") && g("dl.valid") === "yes", "Driver's license", g("dl.date") ? (g("dl.valid") === "yes" ? "Valid" : "Issue noted") : "Not verified", g("dl.valid") === "no")}
        ${chk(rs.done, "References", `${rs.got} of ${REFS_NEEDED} in${avg != null ? ` · average rating ${avg.toFixed(1)} / 5` : ""}`)}
        ${chk(!!ivDate, "Interview", ivDate ? `${fmtDate(ivDate)}${panel ? " · " + panel : ""}${ivScore(a).n ? " · score " + ivScore(a).avg.toFixed(1) + " / 5" : ""}` : "Not completed")}
        ${chk(g("appr.committee") === "yes", "Committee", g("appr.committee") === "yes" ? "Recommends approval" : "No decision")}
      </div>
      ${q("Why PVRS?", "iv.why")}${q("About them", "iv.about")}${g("iv.convicted") === "yesbad" ? q("Conviction (from the interview)", "iv.convictedExplain") : ""}
    </article>
    <section class="bmvote glass"><h3>Vote</h3>
      <div class="bmgrid"><label>Motion by<input type="text" data-bk="board.motion" value="${esc(g("board.motion") || "")}" ${ro}></label><label>Seconded by<input type="text" data-bk="board.second" value="${esc(g("board.second") || "")}" ${ro}></label></div>
      <div class="bmgrid three"><label>For<input type="number" min="0" inputmode="numeric" data-bk="board.for" value="${esc(g("board.for") ?? "")}" ${ro}></label><label>Against<input type="number" min="0" inputmode="numeric" data-bk="board.against" value="${esc(g("board.against") ?? "")}" ${ro}></label><label>Abstain<input type="number" min="0" inputmode="numeric" data-bk="board.abstain" value="${esc(g("board.abstain") ?? "")}" ${ro}></label></div>
      <div class="seg wide bmres" role="group" aria-label="Result">${[["approved","Approved","good"],["tabled","Tabled","warn"],["denied","Denied","bad"]].map(([v, l, c]) => `<button type="button" class="${c}${g("board.result") === v ? " on" : ""}" data-bres="${v}" ${ro}>${l}</button>`).join("")}</div>
      <label class="bmnotes">Notes<textarea rows="3" data-bk="board.notes" ${ro} placeholder="Discussion or conditions">${esc(g("board.notes") || "")}</textarea></label>
      ${S.canEdit ? "" : `<p class="help">View only. The owner records the vote.</p>`}
    </section></div>
    <div class="bmbar glass"><button class="btn" type="button" data-bm="prev" ${BM.i ? "" : "disabled"}>‹ Previous</button><span><b>${BM.i + 1} of ${n}</b><small>${esc(a.name || "")}</small></span><button class="btn primary" type="button" data-bm="next">${BM.i < n - 1 ? "Next ›" : "Finish"}</button></div>`;
}
function wireBoardMtg(el){
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-bm]"); const r = e.target.closest("[data-bres]");
    const id = BM.ids[BM.i];
    if (r && id && S.canEdit) { const a = S.apps.get(id), v = r.dataset.bres; edit(id, "board.result", get(a,"board.result") === v ? "" : v); if (!get(a,"board.date")) edit(id, "board.date", BM.date || today()); paintBoardMtg(); return; }
    if (!b) return;
    const k = b.dataset.bm;
    if (k === "close") return closeBoardMtg();
    if (k === "agenda") return copyAgenda();
    if (k === "email") return emailBoard();
    if (k === "packet") { flushAll(); return printPacket(BM.ids.map(x => S.apps.get(x)).filter(Boolean)); }
    if (k === "prev" && BM.i > 0) { flushAll(); BM.i--; paintBoardMtg(); }
    if (k === "next") { flushAll(); if (BM.i < BM.ids.length - 1) { BM.i++; paintBoardMtg(); } else { closeBoardMtg(); toast("Board meeting closed. Everything is saved."); } }
  });
  el.addEventListener("input", e => {
    if (e.target.id === "bmDate") { BM.date = e.target.value; return; }
    const k = e.target.dataset.bk, id = BM.ids[BM.i]; if (!k || !id || !S.canEdit) return;
    const v = e.target.type === "number" ? (e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0)) : e.target.value;
    edit(id, k, v);
    if (!get(S.apps.get(id), "board.date")) edit(id, "board.date", BM.date || today());
  });
  el.addEventListener("keydown", e => { if (e.key === "Escape" && $("#modal").hidden) { e.stopPropagation(); closeBoardMtg(); } });
}
function agendaText(list){   // list: applicants to include (default: the board queue right now)
  const q = list ? list.map(a => ({ a })) : sorted().filter(r => inBoardQueue(r.a));
  const dates = q.map(r => get(r.a,"board.date")).filter(Boolean).sort();
  const lines = q.map((r,i) => { const a = r.a; const bits = [a.type, loc(a), get(a,"sched.completed") ? "interviewed " + fmtDate(get(a,"sched.completed")) : null, get(a,"board.result")==="tabled" ? "tabled at last meeting" : null].filter(Boolean);
    return `${i+1}. ${a.name || "Unnamed"} (${bits.join(", ")})`; });
  return { n: q.length, text: `PVRS Board: membership applications for approval${dates.length?`\nMeeting: ${longDate(dates[dates.length-1])}`:""}\n\nRecommended by the Membership Committee:\n${lines.join("\n")}` };
}
async function copyAgenda(){
  const { n, text } = agendaText();
  toast((await copyText(text)) ? `Agenda copied (${n} applicant${n===1?"":"s"})` : "Couldn't copy the agenda");
}
// Opens an email to the board (Settings → Board emails) with the agenda filled in; the packet PDF is attached by hand
// (Print packet → Save as PDF), since the app can't send email itself yet.
function emailBoard(){
  const { n, text } = agendaText(BM.ids.map(x => S.apps.get(x)).filter(Boolean)), to = (S.settings.boardEmails || "").trim();
  const body = `${text}\n\nThe board packet is attached (${n} applicant${n===1?"":"s"}). It's confidential: please don't forward it.\n\n${sig()}`;
  const l = document.createElement("a"); l.href = `mailto:${to.split(/[,;\s]+/).filter(Boolean).map(encodeURIComponent).join(",")}?subject=${encodeURIComponent("PVRS Board: membership applications" + (n ? ` (${n})` : ""))}&body=${encodeURIComponent(body)}`; l.click();
  toast(to ? "Email opened. Attach the packet: Print packet → Save as PDF" : "Email opened. Add board addresses in Settings → Emails to fill them in next time");
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
        ${row("References", refs.length ? `${refStatus(a).got} of ${refs.length} received` + (refStatus(a).done ? "" : ` · NEED ${REFS_NEEDED}`) : "None entered", !refStatus(a).done)}
      </table></div>
      <div><h2>Interview and committee</h2><table>
        ${row("Interview", g("sched.completed") ? "Completed " + d8(g("sched.completed")) + (g("sched.completedInit") ? " · " + esc(g("sched.completedInit")) : "") : iv ? "Scheduled " + esc(iv) : "Not scheduled")}
        ${row("Interviewers", panel.length ? esc(panel.join(", ")) : "—")}
        ${row("Interview score", esc(ivScoreText(a)) + (ivScore(a).n ? " · " + IV_SCORE.filter(([k]) => g("iv.score." + k)).map(([k, l]) => `${l} ${g("iv.score." + k)}`).join(", ") : ""), ivScore(a).n > 0 && ivScore(a).avg < 3)}
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
  printHTML(list.map(packetPage).join(""));
}
function printHTML(html){
  let el = $("#print"); if (!el) { el = document.createElement("div"); el.id = "print"; document.body.appendChild(el); }
  el.innerHTML = html;
  document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); el.innerHTML = ""; removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  const img = el.querySelector("img");
  const go = () => setTimeout(() => window.print(), 50);
  if (img && !img.complete) { img.onload = go; img.onerror = go; } else go();
}

/* ---------- online applications ---------- */
// The full submitted application, for viewing and printing (admins; it lives in the private record).
function formHTML(f, forPrint){
  const p = f.person || {}, ed = f.education || {}, ex = f.experience || {}, em = f.employment || {}, bg = f.background || {};
  const v = x => (x == null || x === "") ? "—" : esc(x);
  const addr = a => a ? [a.street, a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  const row = (k, x, flag) => `<tr${flag ? ' class="flag"' : ""}><th>${esc(k)}</th><td>${v(x)}</td></tr>`;
  const sec = (t, rows) => `<h2>${esc(t)}</h2><table>${rows}</table>`;
  const school = (label, s) => s && s.name ? row(label, [s.name, s.location, s.study, s.from && s.to ? `${s.from} – ${s.to}` : (s.from || s.to), s.grad ? "graduation " + s.grad : ""].filter(Boolean).join(" · ")) : "";
  return `${forPrint ? `<header><img src="/img/logo.png" alt=""><div><div class="pk-k">Membership application · submitted online</div><h1>${esc(p.first)} ${esc(p.last)}</h1>
      <div class="pk-s">Submitted ${esc(new Date(f.submittedAt).toLocaleString())}</div></div></header>` : ""}
    <div class="formview">
    ${sec("Personal information", row("Legal name", `${p.last}, ${p.first}`) + row("Email", p.email) + row("Cell phone", p.phone) + row("Date of birth", p.dob) + row("Place of birth", p.birthplace)
      + row("Permanent address", addr(p.permAddr)) + row("School / local address", p.localAddr ? addr(p.localAddr) : "Same as permanent") + row("Driver's license", p.dlState === "none" ? "No driver's license" : [p.dlState, p.dlNumber].filter(Boolean).join(" · ")) + row("Membership type", p.type))}
    ${sec("Education", school("High school", { name: ed.hs?.name, location: ed.hs?.location, grad: ed.hs?.grad }) + school("College", ed.college) + school("Other", ed.other) || row("Education", ""))}
    ${sec("Health care / EMS experience", row("Certifications", [...(ex.certs || []), ex.certOther].filter(Boolean).join(", ")) + row("Applied to / member of other public safety agencies", ex.otherAgencies === "yes" ? "Yes: " + (ex.agenciesDetail || "") : ex.otherAgencies === "no" ? "No" : ""))}
    ${sec("Employment history", (em.jobs || []).map((j, i) => row(`Employer ${i + 1}`, [j.place, j.location, j.length, j.supervisor ? "Supervisor: " + j.supervisor : "", j.duties ? "Duties: " + j.duties : ""].filter(Boolean).join(" · "))).join("")
      + row("Community service", em.community) + row("Other employment", em.other))}
    ${sec("Criminal history", row("Ever convicted, fined, on probation or imprisoned for a misdemeanor or felony?", bg.convicted === "yes" ? "Yes" : bg.convicted === "no" ? "No" : "", bg.convicted === "yes") + (bg.convicted === "yes" ? row("Details", bg.detail, true) : ""))}
    ${sec("References", (f.references || []).map((r, i) => row(`Reference ${i + 1}`, [r.name, r.relationship, r.phone, r.email, r.address].filter(Boolean).join(" · "))).join(""))}
    ${sec("Signature", row("Electronic signature", f.signature?.confirmed ? `Confirmed · “${f.signature.name}”` : "") + row("Submitted", new Date(f.submittedAt).toLocaleString()))}
    </div>`;
}
function openForm(id){
  const a = S.apps.get(id); if (!a || !a.form) return;
  const M = openModal(`<h3>Online application · ${esc(a.name || "")}</h3><div class="formmodal">${formHTML(a.form, false)}</div>
    <div class="acts"><button class="btn" type="button" data-x>Close</button><button class="btn primary" type="button" data-printform>Print</button></div>`, true);
  M.onclick = e => { if (e.target.closest("[data-x]")) return closeModal(); if (e.target.closest("[data-printform]")) { closeModal(); printForm(a.form); } };
}
const isoDay = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const importing = new Set();
async function importSubmission(snap){
  if (importing.has(snap.id)) return; importing.add(snap.id);
  const f = snap.data(); if (f.status !== "new") return;
  const p = f.person || {}, local = p.localAddr || p.permAddr || {};
  const potsdam = /potsdam/i.test(local.city || "");
  const certs = (f.experience && f.experience.certs) || [], col = (f.education && f.education.college) || {};
  const id = doc(collection(db, "applicants")).id, now = Date.now(), name = `${p.first || ""} ${p.last || ""}`.trim();
  const shared = { name, phone: p.phone || "", email: lower(p.email), type: p.type || "", location: potsdam ? "Potsdam" : "other", ...(potsdam ? {} : { locationOther: local.city || "" }),
    stage: "screen", app: { received: isoDay(f.submittedAt || now), source: "online", ...(f.heard?.source ? { heard: String(f.heard.source).slice(0, 60), heardDetail: String(f.heard.detail || "").slice(0, 200) } : {}) },
    iv: { college: col.name ? "yes" : "", collegeWhere: [col.name, col.grad ? "graduating " + col.grad : ""].filter(Boolean).join(", "),
      isEmt: certs.some(c => /^(EMT|AEMT|Paramedic)$/.test(c)) ? "yes" : "",
      otherOrg: f.experience?.otherAgencies === "yes" ? "yes" : f.experience?.otherAgencies === "no" ? "no" : "", otherOrgWhere: f.experience?.agenciesDetail || "",
      convicted: f.background?.convicted === "yes" ? "yesbad" : f.background?.convicted === "no" ? "no" : "", convictedExplain: f.background?.detail || "" },
    createdAt: now, createdBy: "online application", updatedAt: now, updatedBy: S.me };
  const refs = {}; (f.references || []).slice(0, 4).forEach((r, i) => { refs["r" + (i + 1)] = { name: r.name || "", email: lower(r.email), phone: r.phone || "", relationship: r.relationship || "", address: r.address || "" }; });
  const form = { ...f }; delete form.hp; delete form.status;
  try {
    // Claim it against the live database: if the desk is open in several places (another tab, the Dock app, a laptop
    // waking up with an out-of-date copy), only the first one imports it; the rest see it's taken and skip.
    const subRef = doc(db, "submissions", snap.id);
    const claimed = await runTransaction(db, async tx => {
      const cur = await tx.get(subRef);
      if (!cur.exists() || cur.data().status !== "new") return false;
      tx.set(doc(db, "applicants", id), shared);
      tx.set(doc(db, "applicants", id, "private", "main"), { refs, form, secUpdatedAt: now, secUpdatedBy: S.me });
      tx.update(subRef, { status: "imported", applicantId: id, importedAt: now });
      return true;
    });
    if (!claimed) return;
    addDoc(collection(db, "applicants", id, "history"), { at: Date.now(), by: S.me, changes: [{ path: "_created", from: "", to: "Online application from " + name }] }).catch(() => {});
    toast(`New online application from ${name}`);
  } catch (e) { console.error(e); importing.delete(snap.id); }
}
// New references applicants send when asked for a different one (owner's desk applies them to the file).
let refUps = [];
const applyingRefs = new Set();
function watchRefUpdates(){
  onSnapshot(collectionGroup(db, "refUpdates"), snap => { refUps = snap.docs; processRefUpdates(); }, e => console.error(e));
}
// Claim an item against the live database before acting on it: if the desk is open in several places, or one is
// working from an out-of-date copy, only the first claim succeeds. Returns false if someone already handled it.
const claimOnce = (ref0, field) => runTransaction(db, async tx => {
  const cur = await tx.get(ref0);
  if (!cur.exists() || cur.data()[field]) return false;
  tx.update(ref0, { [field]: Date.now() });
  return true;
});
function processRefUpdates(){
  for (const d of refUps) {
    const u = d.data(), id = d.ref.parent.parent.id;
    if (u.appliedAt || applyingRefs.has(d.ref.path) || !S.apps.has(id) || !S.secure.has(id)) continue;
    applyingRefs.add(d.ref.path); applyRefUpdate(id, d.ref, u);
  }
}
async function applyRefUpdate(id, ref0, u){
  const a = S.apps.get(id), i = u.slot; if (![1,2,3,4].includes(i)) return;
  let mine = false;
  try { mine = await claimOnce(ref0, "appliedAt"); } catch (e) { console.error(e); applyingRefs.delete(ref0.path); return; }
  if (!mine) return;   // another desk already swapped this reference in; re-doing it would wipe the new reference's progress
  const set = (k, v) => { if ((get(a,`refs.r${i}.${k}`) || "") !== v) edit(id, `refs.r${i}.${k}`, v); };
  const old = String(get(a,`refs.r${i}.name`) || "").trim();
  set("name", u.name || ""); set("email", lower(u.email)); set("phone", u.phone || ""); set("relationship", u.relationship || ""); set("address", u.address || "");
  const oldTok = get(a,`refs.r${i}.link`); if (oldTok) deleteDoc(doc(db, "refLinks", oldTok)).catch(() => {});
  for (const k of ["contacted","method","returned","init","replace","link","linkAt","linkExp","form"]) if (get(a,`refs.r${i}.${k}`)) edit(id, `refs.r${i}.${k}`, "");
  set("replacedFrom", old); set("replacedAt", today());
  flushAll();
  toast(`${a.name || "An applicant"} sent a new reference: ${u.name}`);
  if (S.sel === id) syncDetail();
}
/* ---------- reference forms (private link per reference → answers filed here) ---------- */
const REF_DAYS = 60;
const newToken = () => { const b = new Uint8Array(18); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
// The reference's private link, made on first use (and again if the old one has run out).
async function refLink(id, i){
  if (!S.canEdit) { ownerOnlyToast(); return null; }
  const a = S.apps.get(id); if (!a) return null;
  const tok = get(a,`refs.r${i}.link`), exp = get(a,`refs.r${i}.linkExp`) || 0;
  if (tok && exp > Date.now() + 864e5) return `${location.origin}/ref/${tok}`;
  const name = String(get(a,`refs.r${i}.name`) || "").trim(); if (!name) { toast("Enter the reference's name first."); return null; }
  const t = newToken(), now = Date.now(), expiresAt = now + REF_DAYS * 864e5;
  try { await setDoc(doc(db, "refLinks", t), { appId: id, slot: i, applicant: a.name || "", first: first(a.name) || "", refName: name, createdAt: now, expiresAt, by: S.me }); }
  catch (e) { console.error(e); toast("Couldn't make the link. Try again."); return null; }
  if (tok) deleteDoc(doc(db, "refLinks", tok)).catch(() => {});
  edit(id, `refs.r${i}.link`, t); edit(id, `refs.r${i}.linkAt`, today()); edit(id, `refs.r${i}.linkExp`, expiresAt);
  return `${location.origin}/ref/${t}`;
}
// Nudges: a reference emailed 7+ days ago who hasn't answered gets a "Send reminder" (at most once a week).
const NUDGE_DAYS = 7;
function refNudge(a, i){
  const g = k => get(a,`refs.r${i}.${k}`);
  if (!String(g("name") || "").trim() || g("form") || (g("returned") && !g("replace")) || !g("contacted")) return false;
  return daysSince(g("contacted")) >= NUDGE_DAYS && (!g("reminded") || daysSince(g("reminded")) >= NUDGE_DAYS);
}
async function remindRefLink(id, i){
  const a = S.apps.get(id); if (!a) return;
  const to = lower(get(a,`refs.r${i}.email`) || ""), name = String(get(a,`refs.r${i}.name`) || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { toast("Add the reference's email address first."); return; }
  const url = await refLink(id, i); if (!url) return;
  const body = `Hi ${first(name)},\n\nJust a friendly reminder: ${a.name} listed you as a reference for the Potsdam Volunteer Rescue Squad, and we'd still love to hear from you. It takes about 5 minutes:\n\n${url}\n\nIf you've already sent it, thank you, and please ignore this note.\n\nThank you,\n${sig()}`;
  const l = document.createElement("a"); l.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Reminder: reference for ${a.name}`)}&body=${encodeURIComponent(body)}`; l.click();
  edit(id, `refs.r${i}.reminded`, today());
}
async function emailRefLink(id, i){
  const a = S.apps.get(id); if (!a) return;
  const to = lower(get(a,`refs.r${i}.email`) || ""), name = String(get(a,`refs.r${i}.name`) || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { toast("Add the reference's email address first."); $(`#f-refs-r${i}-email`)?.focus(); return; }
  const url = await refLink(id, i); if (!url) return;
  const body = `Hi ${first(name)},\n\n${a.name} has applied to volunteer with the Potsdam Volunteer Rescue Squad and listed you as a reference. We'd be grateful if you could answer a few questions about them. It takes about 5 minutes:\n\n${url}\n\nThe link is just for you and works once. Your answers go only to the PVRS Membership Committee.\n\nThank you,\n${sig()}`;
  const l = document.createElement("a"); l.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Reference for ${a.name}: Potsdam Volunteer Rescue Squad`)}&body=${encodeURIComponent(body)}`; l.click();
  if (!get(a,`refs.r${i}.contacted`)) { edit(id, `refs.r${i}.contacted`, today()); edit(id, `refs.r${i}.method`, "Email"); }
}
// Every reference needs their own private link, so it's one email each: this lists them with a button per person.
function openRefsAll(id){
  if (!S.canEdit) return ownerOnlyToast();
  const a = S.apps.get(id); if (!a) return;
  const rows = [1,2,3,4].map(i => ({ i, name: String(get(a,`refs.r${i}.name`) || "").trim(), email: lower(get(a,`refs.r${i}.email`) || "") })).filter(r => r.name);
  const status = r => { const x = S.apps.get(id);
    if (get(x,`refs.r${r.i}.form`)) return { done: true, text: "Already answered" };
    if (get(x,`refs.r${r.i}.returned`) && !get(x,`refs.r${r.i}.replace`)) return { done: true, text: "Already received" };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) return { done: true, text: "No email on file. Add one on the References tab" };
    const c = get(x,`refs.r${r.i}.contacted`);
    if (c && !refNudge(x, r.i)) return { done: true, text: `Emailed ${fmtDate(c)} · waiting for their answers` };
    return { done: false, nudge: !!c, text: r.email + (c ? ` · emailed ${fmtDate(c)}, no answer yet` : "") };
  };
  const paint = () => {
    const todo = rows.filter(r => !status(r).done).length;
    $("#rallList").innerHTML = rows.map(r => { const st = status(r);
      return `<div class="row"><span class="lbl">${esc(r.name)}<small>${esc(st.text)}</small></span>${st.done && !sent.has(r.i) ? "" : `<button class="btn small ${sent.has(r.i) ? "" : "primary"}" type="button" data-allmail="${r.i}" data-nudge="${st.nudge ? 1 : ""}">${sent.has(r.i) ? "Opened ✓" : st.nudge ? "Send reminder" : "Open email"}</button>`}</div>`; }).join("");
    $("#rallNote").textContent = todo ? `${todo} to send. Click each button, then press Send in Mail.` : "Everyone here has answered or been received.";
  };
  const sent = new Set();
  const M = openModal(`<h3>Email reference forms</h3>
    <p class="help">Each reference gets their own email with a private link to the reference form for ${esc(a.name || "this applicant")}, so they go one at a time.</p>
    <div class="ios" id="rallList"></div><p class="help" id="rallNote"></p>
    <div class="acts"><button class="btn" type="button" data-x>Done</button></div>`);
  paint();
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const b = e.target.closest("[data-allmail]"); if (!b) return;
    b.disabled = true; await (b.dataset.nudge ? remindRefLink : emailRefLink)(id, +b.dataset.allmail); sent.add(+b.dataset.allmail); paint();
  };
}
function refAnswersHTML(a, i){
  const f = get(a,`refs.r${i}.form`) || {}, ans = f.answers || {}, fn = first(a.name) || "the applicant", qs = refQuestions(fn);
  const qa = ([k, l]) => ans[k] ? `<dt>${esc(l)}</dt><dd>${esc(ans[k])}</dd>` : "";
  return `<h3>Reference for ${esc(a.name || "applicant")}</h3>
    <p class="help">From <b>${esc(ans.signName || get(a,`refs.r${i}.name`) || "")}</b>${get(a,`refs.r${i}.relationship`) ? " · " + esc(get(a,`refs.r${i}.relationship`)) : ""} · answered ${esc(fmtDate(ans.signDate || f.date))} through the online form</p>
    <dl class="refanswers">${qs.slice(0, 4).map(qa).join("")}
      <dt>Ratings (1 = poor, 5 = excellent)</dt><dd>${RATINGS.map(([k, l]) => `${esc(l)}: <b class="stars">${(ans.ratings || {})[k] || "—"} / 5</b>`).join("<br>")}</dd>
      <dt>${esc(TRUST_Q(fn))}</dt><dd>${ans.trustworthy === "yes" ? "Yes" : ans.trustworthy === "no" ? "No" : "—"}</dd>
      ${qs.slice(4).map(qa).join("")}</dl>`;
}
function openRefAnswers(id, i){
  const a = S.apps.get(id); if (!a || !get(a,`refs.r${i}.form`)) return;
  const html = refAnswersHTML(a, i);
  const M = openModal(`${html}<p class="help">Admins only. ${esc(first(a.name) || "The applicant")} never sees these answers.</p>
    <div class="acts"><button class="btn" type="button" data-x>Close</button><button class="btn primary" type="button" id="refPrint">Print</button></div>`, true);
  M.onclick = e => { if (e.target.closest("[data-x]")) return closeModal(); if (e.target.closest("#refPrint")) { closeModal(); printHTML(`<section class="pk">${html}</section>`); } };
}
let refResps = [];
const importingResp = new Set();
function watchRefResponses(){
  onSnapshot(collection(db, "refResponses"), snap => { refResps = snap.docs; processRefResponses(); }, e => console.error(e));
}
async function processRefResponses(){
  for (const d of refResps) {
    const r = d.data(); if (r.importedAt || importingResp.has(d.id)) continue;
    importingResp.add(d.id);
    try {
      const ls = await getDoc(doc(db, "refLinks", d.id)); const L = ls.exists() ? ls.data() : null;
      if (!L || !S.apps.has(L.appId)) {
        if (S.ready && (!L || !S.apps.has(L.appId))) await updateDoc(d.ref, { importedAt: Date.now(), orphan: true });   // applicant was deleted
        else importingResp.delete(d.id);
        continue;
      }
      if (!S.secure.has(L.appId)) { importingResp.delete(d.id); continue; }
      if (!(await claimOnce(d.ref, "importedAt"))) continue;   // another desk already filed these answers
      const a = S.apps.get(L.appId), i = L.slot, ans = r.answers || {};
      const rec = { label: `Online reference form from ${ans.signName || L.refName}`, answers: ans, date: isoDay(r.submittedAt || Date.now()) };
      if (get(a,`refs.r${i}.link`) === d.id) {
        edit(L.appId, `refs.r${i}.form`, rec);
        if (!get(a,`refs.r${i}.returned`)) edit(L.appId, `refs.r${i}.returned`, rec.date);
      } else edit(L.appId, `refs.late.${d.id}`, { ...rec, refName: L.refName });   // that reference was replaced in the meantime
      flushAll();
      toast(`Reference from ${L.refName} for ${a.name} came in`);
      if (S.sel === L.appId) syncDetail();
    } catch (e) { console.error(e); importingResp.delete(d.id); }
  }
}
function watchSubmissions(){
  onSnapshot(query(collection(db, "submissions"), where("status", "==", "new")), snap => { snap.docs.forEach(importSubmission); }, e => console.error(e));
}

/* ---------- activity feed (admins): uploads and bookings from applicants ---------- */
function activity(){
  const since = Date.now() - 14*864e5, out = [];
  for (const f of S.feedFiles) if ((f.uploadedAt||0) > since && S.apps.has(f.appId)) out.push({ at: f.uploadedAt, id: f.appId, kind: "upload", text: f.confidential ? "sent a secure document 🔒" : `uploaded ${f.name}`, sub: f.label || "Document" });
  for (const a of S.apps.values()) if (get(a, "app.source") === "online" && (a.createdAt || 0) > since) out.push({ at: a.createdAt, id: a._id, kind: "apply", text: "applied online", sub: [a.type, loc(a)].filter(Boolean).join(" · ") || "New application" });
  for (const [id, pd] of S.portal) { const iv = pd.interview; if (iv && iv.bookedAt > since && S.apps.has(id)) out.push({ at: iv.bookedAt, id, kind: "book", text: `booked an interview`, sub: slotLong(iv.start) }); }
  return out.sort((x,y) => y.at - x.at);
}
function activityCard(){
  if (!S.admin) return "";
  const items = activity().slice(0, 5);
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
      if (fresh.length) { const a = S.apps.get(fresh[0].appId); toast(`${a ? a.name : "An applicant"} uploaded ${fresh.length === 1 ? (fresh[0].confidential ? "a secure document 🔒" : fresh[0].name) : fresh.length + " files"}`); }
    }
    feedPrimed = true;
    if (!S.sel) renderOverview();
  }, e => console.error(e));
}

/* ---------- sign-in password ---------- */
// Adds (or changes) an email + password sign-in on the current account. Firebase stores the password; it never touches the code.
function openPassword(){
  const user = auth.currentUser; if (!user) return;
  const has = user.providerData.some(p => p.providerId === "password");
  const M = openModal(`<form id="pwSetForm" style="display:contents" novalidate><h3>${has ? "Change" : "Set"} your sign-in password</h3>
    <p class="help">Then sign in on the <b>Squad member</b> tab with <b>${esc(user.email)}</b> and this password.${has ? "" : " Google sign-in keeps working as a backup."}</p>
    <div class="field"><label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password" minlength="10" required>
      <label for="pwAgain">Type it again</label><input id="pwAgain" type="password" autocomplete="new-password" required>
      <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="pwShow" style="width:auto"> Show password</label></div>
    <p class="help">At least 10 characters. Don't reuse a password from another site.</p>
    <div class="ios" style="margin-top:6px"><div class="row"><span class="lbl">Two-step sign-in<small>${twoStepOn(user) ? "On: a code from your authenticator app at each sign-in" : "Off: add a code from an authenticator app"}</small></span><button class="btn small" type="button" id="twoStepBtn">${twoStepOn(user) ? "Manage" : "Set up"}</button></div>
      ${S.me ? `<div class="row"><span class="lbl">Notifications<small>Alerts on this device</small></span><button class="btn small" type="button" id="notifBtn">${pushToken() ? "On" : "Set up"}</button></div>` : ""}</div>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="submit">Save password</button></div></form>`);
  $("#pwNew").focus();
  $("#pwShow").addEventListener("change", e => { $("#pwNew").type = $("#pwAgain").type = e.target.checked ? "text" : "password"; });
  M.onclick = e => { if (e.target.closest("[data-x]")) closeModal(); if (e.target.closest("#twoStepBtn")) openTwoStep(); if (e.target.closest("#notifBtn")) openNotifications(); };
  const save = async pw => {
    if (user.providerData.some(p => p.providerId === "password")) await updatePassword(user, pw);
    else await linkWithCredential(user, EmailAuthProvider.credential(user.email, pw));
  };
  $("#pwSetForm").onsubmit = async e => {
    e.preventDefault();
    const pw = $("#pwNew").value;
    if (pw.length < 10) { $("#pwNew").focus(); return toast("Use at least 10 characters."); }
    if (pw !== $("#pwAgain").value) { $("#pwAgain").select(); return toast("The two passwords don't match."); }
    const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
    try {
      try { await save(pw); }
      catch (err) {
        if (err && err.code === "auth/requires-recent-login" && user.providerData.some(p => p.providerId === "google.com")) {
          toast("For security, confirm it's you with Google first.");
          await reauthenticateWithPopup(user, new GoogleAuthProvider()); await save(pw);
        } else throw err;
      }
      closeModal(); toast("Password saved. Use it on the Squad member sign-in tab.");
    } catch (err) {
      console.error(err);
      const c = err && err.code;
      toast(c === "auth/weak-password" ? "That password is too weak. Try a longer one."
        : c === "auth/requires-recent-login" ? "For security, sign out, sign back in, and set the password again."
        : c === "auth/popup-closed-by-user" ? "Google confirmation was closed. Try again."
        : "Couldn't save the password. Try again.");
    } finally { btn.disabled = false; }
  };
}

/* ---------- two-step sign-in (authenticator app codes, Firebase TOTP) ---------- */
// Needs the project upgraded to Identity Platform with TOTP switched on (docs/two-step-sign-in.md).
const totpFactor = user => multiFactor(user).enrolledFactors.find(f => f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
const twoStepOn = user => { try { return !!totpFactor(user); } catch { return false; } };
// Changing sign-in settings needs a recent sign-in; Google accounts can confirm in a popup, others sign out and back in.
async function recentLogin(user, fn){
  try { return await fn(); }
  catch (err) {
    if (err && err.code === "auth/requires-recent-login" && user.providerData.some(p => p.providerId === "google.com")) {
      toast("For security, confirm it's you with Google first.");
      await reauthenticateWithPopup(user, new GoogleAuthProvider()); return fn();
    }
    throw err;
  }
}
const twoStepError = err => { const c = err && err.code; if (c !== "auth/invalid-verification-code") console.error(err);
  toast(c === "auth/requires-recent-login" || c === "auth/multi-factor-auth-required" ? "For security, sign out, sign back in, and try again."
    : c === "auth/invalid-verification-code" ? "That code didn't match. Wait for the next code and try again."
    : c === "auth/operation-not-allowed" || c === "auth/admin-restricted-operation" || c === "auth/unsupported-first-factor" ? "Two-step sign-in isn't switched on for the PVRS project yet (see docs/two-step-sign-in.md)."
    : c === "auth/unverified-email" ? "Confirm your email address first." : "Couldn't change two-step sign-in. Try again."); };
function openTwoStep(){
  const user = auth.currentUser; if (!user) return;
  const f = (() => { try { return totpFactor(user); } catch { return null; } })();
  if (f) {
    const M = openModal(`<h3>Two-step sign-in is on</h3>
      <p class="help">Each time you sign in, PVRS Membership asks for the 6-digit code from ${esc(f.displayName || "your authenticator app")}${f.enrollmentTime ? `, set up ${esc(new Date(f.enrollmentTime).toLocaleDateString())}` : ""}.</p>
      <p class="help">Got a new phone? Turn it off, then set it up again on the new phone.</p>
      <div class="acts"><button class="btn" type="button" data-x>Done</button><button class="btn danger" type="button" id="tsOff">Turn off</button></div>`);
    M.onclick = async e => {
      if (e.target.closest("[data-x]")) return closeModal();
      const b = e.target.closest("#tsOff"); if (!b) return;
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirm turn off"; return; }
      b.disabled = true;
      try { await recentLogin(user, () => multiFactor(user).unenroll(f)); closeModal(); toast("Two-step sign-in is off."); }
      catch (err) { twoStepError(err); b.disabled = false; }
    };
    return;
  }
  const M = openModal(`<h3>Set up two-step sign-in</h3>
    <p class="help">After your password or Google, you'll also type a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, or the iPhone Passwords app). Someone with your password still can't get in without your phone.</p>
    <div id="tsBody"><div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="tsStart">Start</button></div></div>`);
  let secret = null;
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    if (e.target.closest("[data-tscopy]")) return toast((await copyText(secret.secretKey)) ? "Setup key copied" : secret.secretKey);
    const st = e.target.closest("#tsStart"); if (!st) return;
    st.disabled = true;
    try {
      secret = await recentLogin(user, async () => TotpMultiFactorGenerator.generateSecret(await multiFactor(user).getSession()));
      const url = secret.generateQrCodeUrl(user.email, "PVRS Membership"), key = secret.secretKey.replace(/(.{4})/g, "$1 ").trim();
      $("#tsBody").innerHTML = `<form id="tsForm" style="display:contents" novalidate><div class="ios">
        <div class="row stack"><span class="lbl">1. In your authenticator app, add an account with a setup key<small>Account: ${esc(user.email)} · Key type: time based</small></span>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><code class="tskey">${esc(key)}</code><button class="copy" type="button" data-tscopy>Copy</button><a class="btn small" href="${esc(url)}">Open in app</a></div>
          <small class="help" style="margin:0">On this phone? Tap Open in app instead of typing the key.</small></div>
        <label class="row stack"><span class="lbl">2. Type the 6-digit code it shows</span><input id="tsCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label></div>
        <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="submit">Turn on</button></div></form>`;
      $("#tsCode").focus();
      $("#tsForm").onsubmit = async ev => {
        ev.preventDefault();
        const code = $("#tsCode").value.replace(/\D/g, ""); if (code.length !== 6) return toast("Type the 6 digits from your app.");
        const b = ev.target.querySelector("button[type=submit]"); b.disabled = true;
        try { await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code), "Authenticator app"); closeModal(); toast("Two-step sign-in is on. Keep your phone handy when you sign in."); }
        catch (err) { twoStepError(err); $("#tsCode").select(); b.disabled = false; }
      };
    } catch (err) { twoStepError(err); st.disabled = false; }
  };
}

/* ---------- Med Control: the AI assistant (functions/medcontrol.js does the work and the privacy filtering) ---------- */
// Off until the owner switches it on in Settings (after the board's OK and the API key are in place).
const aiOn = () => !!(S.owner && S.settings.ai === true);   // owner only; the function refuses everyone else too
function paintAi(){ const b = $("#aiBtn"); if (b) b.hidden = !aiOn(); }
const FN_URL = "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
let aiCall = null;
async function medControl(data){
  if (!aiCall) { const m = await import(FN_URL); aiCall = m.httpsCallable(m.getFunctions(app), "ai-medControl", { timeout: 120000 }); }
  try { return (await aiCall(data)).data; }
  catch (e) {
    const c = String(e && e.code || "").replace("functions/", "");
    const msg = ["not-found", "internal", "unavailable", "failed-precondition", "resource-exhausted", "permission-denied", "invalid-argument"].includes(c) && e.message && c !== "not-found" && c !== "internal" ? e.message
      : c === "not-found" ? "Med Control isn't set up yet (docs/med-control.md)." : "Med Control couldn't answer. Try again.";
    if (!["invalid-argument", "not-found", "resource-exhausted", "permission-denied", "failed-precondition"].includes(c)) console.error(e);
    throw new Error(msg);
  }
}
// What the desk already knows (stage label, next step, to do, booked interview) goes along as short hints.
function aiHints(){
  const todo = {}; for (const x of todoItems()) (todo[x.id] = todo[x.id] || []).push(x.text);
  const out = {};
  for (const a of S.apps.values()) { const p = progress(a);
    out[a._id] = { stage: STAGES[view(a).stage]?.label || "", next: p.next || "", todo: (todo[a._id] || []).join("; ").slice(0, 300), booked: a._booked ? slotLong(a._booked.start) : "" }; }
  return out;
}
const aiText = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
function aiPeople(t){ return [...S.apps.values()].filter(a => a.name && t.includes(a.name)).slice(0, 4); }
S.aiChat = [];
function openMedControl(){
  if (!aiOn()) return;
  const SUGGEST = ["Who's waiting on references more than 2 weeks?", "What's on the board agenda?", "Who needs a portal invite?", "Which cards expire this month?"];
  const paint = () => {
    const T = $("#mcThread"); if (!T) return;
    T.innerHTML = S.aiChat.length ? S.aiChat.map((m, i) => m.role === "user" ? `<div class="mc-me">${esc(m.text)}</div>`
      : `<div class="mc-ai"><span class="mc-badge" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M6.6 1.5h2.8v4l3.5-2 1.4 2.4L10.8 8l3.5 2.1-1.4 2.4-3.5-2v4H6.6v-4l-3.5 2-1.4-2.4L5.2 8 1.7 5.9l1.4-2.4 3.5 2z"/></svg></span>
        <div class="mc-body">${m.pending ? `<span class="spin" aria-label="Thinking"></span>` : m.error ? `<span class="mc-err">${esc(m.text)}</span>` : `<div class="mc-text">${aiText(m.text)}</div>
          <div class="mc-acts">${aiPeople(m.text).map(a => `<button class="btn small" type="button" data-mcopen="${esc(a._id)}">Open ${esc(a.name)}</button>`).join("")}
            <button class="btn small" type="button" data-mccopy="${i}">Copy</button>${/^Subject:/im.test(m.text) ? `<button class="btn small" type="button" data-mcmail="${i}">Open in Mail</button>` : ""}</div>`}</div></div>`).join("")
      : `<div class="mc-empty"><b>Ask about applicants, deadlines or the board, or ask for a draft.</b><small>Med Control reads the desk's records (never license numbers, birth dates, addresses, phone numbers, conviction details or files). It finds and drafts; you decide and send.</small></div>`;
    T.scrollTop = T.scrollHeight;
  };
  const M = openModal(`<h3>Med Control</h3>
    <div class="mc-thread" id="mcThread" aria-live="polite"></div>
    <div class="mc-chips">${SUGGEST.map(q => `<button class="chip" type="button" data-mcq="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <form id="mcForm" class="mc-form"><label class="sr" for="mcIn">Ask Med Control</label><textarea id="mcIn" rows="2" maxlength="2000" placeholder="Ask anything about your applicants… (Enter to send)"></textarea>
      <button class="btn primary" type="submit">Ask</button></form>
    <div class="acts"><button class="btn" type="button" data-mcclear>New chat</button><button class="btn" type="button" data-x>Close</button></div>`, true);
  M.querySelector(".sheet").classList.add("mcsheet");
  paint(); $("#mcIn").focus();
  const ask = async q => {
    q = String(q || "").trim(); if (!q || S.aiChat.some(m => m.pending)) return;
    S.aiChat.push({ role: "user", text: q }); const ans = { role: "assistant", pending: true, text: "" }; S.aiChat.push(ans); paint();
    try { const r = await medControl({ job: "chat", messages: S.aiChat.filter(m => !m.pending && !m.error).map(m => ({ role: m.role, text: m.text })), hints: aiHints() }); ans.text = r.text || "No answer."; }
    catch (e) { ans.error = true; ans.text = e.message; }
    ans.pending = false; paint();
  };
  $("#mcForm").onsubmit = e => { e.preventDefault(); const v = $("#mcIn").value; $("#mcIn").value = ""; ask(v); };
  $("#mcIn").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#mcForm").requestSubmit(); } });
  M.onclick = async e => {
    const t = e.target;
    if (t.closest("[data-x]")) return closeModal();
    if (t.closest("[data-mcclear]")) { S.aiChat = []; paint(); return $("#mcIn").focus(); }
    const q = t.closest("[data-mcq]"); if (q) return ask(q.dataset.mcq);
    const o = t.closest("[data-mcopen]"); if (o) { closeModal(); return select(o.dataset.mcopen); }
    const c = t.closest("[data-mccopy]"); if (c) { const ok = await copyText(S.aiChat[+c.dataset.mccopy].text); return toast(ok ? "Copied" : "Select the text and copy it"); }
    const ml = t.closest("[data-mcmail]"); if (ml) { const txt = S.aiChat[+ml.dataset.mcmail].text, sm = /^Subject:\s*(.*)$/im.exec(txt);
      const body = txt.slice(sm.index + sm[0].length).replace(/^\s+/, ""); const a = document.createElement("a");
      a.href = `mailto:?subject=${encodeURIComponent(sm[1].trim())}&body=${encodeURIComponent(body)}`; a.click(); }
  };
}
async function aiDraftReply(btn){
  if (!S.canEdit) return ownerOnlyToast();
  const a = S.apps.get(S.sel), ta = $("#replyText"); if (!a || !ta) return;
  if (!threadOf(S.sel).some(m => m.from === "applicant")) return toast(`${first(a.name)} hasn't sent a message to answer yet.`);
  const label = btn.textContent; btn.disabled = true; btn.textContent = "Drafting…";
  try {
    const h = aiHints()[a._id];
    const r = await medControl({ job: "reply", id: a._id, hint: h, typeInfo: TYPE_INFO[a.type] || "" });
    ta.value = r.text || ""; ta.focus(); toast("Draft ready. Check it, then send.");
  } catch (e) { toast(e.message); }
  finally { btn.disabled = false; btn.textContent = label; }
}
async function aiMakeBrief(btn){
  if (!S.canEdit) return ownerOnlyToast();
  const id = S.sel; if (!id) return;
  btn.disabled = true; btn.textContent = "Writing brief…";
  try { await medControl({ job: "brief", id }); toast("Brief ready"); }
  catch (e) { toast(e.message); }
  finally { btn.disabled = false; const a = S.apps.get(id); btn.textContent = a && get(a, "ai.brief") ? "Redo brief" : "Make brief"; }
}
const TONE = { strong: ["Strong", "good"], positive: ["Positive", "good"], mixed: ["Mixed", "warn"], concern: ["Concern", "bad"], waiting: ["Waiting", ""] };
function briefHTML(b){
  if (!b) return `<div class="row"><span class="lbl"><small>${S.canEdit ? "Make brief writes a summary from the application, interview answers and reference answers: what they said in their interview, all the references together, and whether they look ready to proceed or need a closer look. It's advice only; the committee decides. Remake it after new answers come in." : "No brief yet. The owner can make one."}</small></span></div>`;
  const list = (title, xs, cls) => xs && xs.length ? `<div class="aib-sec"><h4 class="${cls}">${title}</h4><ul>${xs.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  const REC = { proceed: ["Looks ready to proceed", "good"], look_closer: ["Worth looking into more", "warn"], not_ready: ["Not enough to go on yet", ""] }, rec = REC[b.recommendation];
  return `<div class="aibody"><div class="aib-tag">AI draft · check before using · the committee decides · ${esc(new Date(b.at).toLocaleDateString())}</div>
    ${rec ? `<div class="aib-rec ${rec[1]}"><b>${esc(rec[0])}</b>${(b.recommendationReasons || []).length ? `<ul>${b.recommendationReasons.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>` : ""}
    <p class="aib-sum">${esc(b.summary || "")}</p>
    ${b.interviewSummary ? `<div class="aib-sec"><h4>What they said in their interview</h4><p>${esc(b.interviewSummary)}</p></div>` : ""}
    ${b.referencesSummary ? `<div class="aib-sec"><h4>What their references said</h4><p>${esc(b.referencesSummary)}</p></div>` : ""}
    <div class="aib-cols">${list("Strengths", b.strengths, "good")}${list("Follow up on", b.followUps, "warn")}</div>
    ${list("Interview follow-up questions", b.questions, "")}
    ${b.references && b.references.length ? `<div class="aib-sec"><h4>References</h4>${b.references.map(r => { const [l, c] = TONE[r.tone] || [r.tone, ""];
      return `<div class="aib-ref"><b>${esc(r.name)}</b><span class="badge ${c === "good" ? "ok" : c === "bad" ? "bad" : "wait"}">${esc(l)}</span><small>${esc(r.note)}</small></div>`; }).join("")}</div>` : ""}</div>`;
}

// Tapping a notification opens the desk at /?open=<applicant id> (functions/push.js): select that file once, then tidy the address.
function openFromLink(){
  let id = "", chat = ""; try { const u = new URLSearchParams(location.search); id = u.get("open") || ""; chat = u.get("chat") || ""; } catch {}
  if (chat) { history.replaceState(null, "", location.pathname); return openChat(chat); }
  if (!id) return;
  history.replaceState(null, "", location.pathname);
  if (S.apps.has(id)) select(id);
}

/* ---------- interviewers: the owner assigns who can open an applicant's file and do the interview ---------- */
// applicants/{id}.interviewers = [emails] (rules: interviewers read + fill in only those files). Assigning also adds them to
// the applicant's conversation (convos/{id}); removing takes them out of it.
function renderInterviewers(a){
  const el = $("#ivAssign"); if (!el) return;
  const list = Array.isArray(a.interviewers) ? a.interviewers : [];
  el.innerHTML = list.length ? list.map(e => `<div class="row"><span class="av sm" style="--stage-c:${personColor(e)}" aria-hidden="true">${esc(initials(memberName(e)))}</span><span class="lbl">${esc(memberName(e))}<small>${esc(e)} · ${esc(roleLabel(S.staff.get(e)?.role))}</small></span></div>`).join("")
    : `<div class="row"><span class="lbl" style="color:var(--fg2)">Nobody assigned yet${S.sched ? ". Click <b>Assign</b> to pick who interviews " + esc(first(a.name) || "them") + "." : "."}</span></div>`;
}
async function saveInterviewers(id, next){
  const a = S.apps.get(id), cur = Array.isArray(a?.interviewers) ? a.interviewers : [];
  const added = next.filter(x => !cur.includes(x)), removed = cur.filter(x => !next.includes(x));
  await updateDoc(doc(db, "applicants", id), { interviewers: next, updatedAt: Date.now(), updatedBy: S.me });
  const cv = C.convos.get(id) || {}, members = [...new Set([...(cv.members || []).filter(m => !removed.includes(m)), ...added])].filter(m => m !== OWNER_EMAIL);
  if (members.length) await setDoc(doc(db, "convos", id), { members, names: Object.fromEntries(members.map(m => [m, S.staff.get(m)?.name || m.split("@")[0]])), updatedAt: Date.now() });
  else if (C.convos.has(id)) await deleteDoc(doc(db, "convos", id));
  addDoc(collection(db, "applicants", id, "history"), { at: Date.now(), by: S.me, changes: [{ path: "interviewers", from: cur.join(", "), to: next.join(", ") }] }).catch(() => {});
}
function openAssignInterviewers(id){
  if (!S.sched) return ownerOnlyToast();
  const a = S.apps.get(id); if (!a) return;
  const cur = Array.isArray(a.interviewers) ? a.interviewers : [];
  const team = [...S.staff.entries()].filter(([, s]) => canInterview(s)).sort((x, y) => (x[1].name || x[0]).localeCompare(y[1].name || y[0]));
  const M = openModal(`<h3>Who interviews ${esc(first(a.name) || "this applicant")}?</h3>
    <p class="help">They can open ${esc(first(a.name) || "the")}'s Application and Interview tabs, fill in the interview, and message ${esc(first(a.name) || "them")}. Nothing else.</p>
    <div class="ios cv-pick">${team.length ? team.map(([e, s]) => `<label class="row"><input type="checkbox" value="${esc(e)}"${cur.includes(e) ? " checked" : ""}><span class="lbl">${esc(s.name || e)}<small>${esc(e)} · ${roleLabel(s.role)}</small></span></label>`).join("")
      : `<div class="row"><span class="lbl" style="color:var(--fg2)">No interviewers yet. In Settings → Team, set someone's role to <b>Interviewer</b>.</span></div>`}</div>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="ivaSave">Save</button></div>`);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    if (!e.target.closest("#ivaSave")) return;
    const next = [...M.querySelectorAll(".cv-pick input:checked")].map(i => i.value);
    try {
      await saveInterviewers(id, next);
      closeModal(); toast(next.length ? `Saved. ${next.map(m => first(memberName(m))).join(", ")} can now see ${first(a.name)}'s interview.` : "No interviewers assigned.");
    } catch (err) { console.error(err); toast("Couldn't save. Try again."); }
  };
}

/* ---------- team messaging: squad channels + applicant conversations (one Messages screen) ---------- */
// channels/{cid} {name, color, members[], names{}} + channels/{cid}/posts: squad-only group chats the owner creates.
// Applicant conversations stay in portal/{id}/messages; convos/{id}.members = squad members the owner added (they can read and reply).
// chatReads/{me} = {"c:<cid>"|"a:<appId>": ms} drives unread badges per person.
const CH_COLORS = { int: "var(--g-int)", appr: "var(--g-appr)", onb: "var(--g-onb)", screen: "var(--g-screen)", act: "var(--g-act)" };
const C = { channels: new Map(), posts: new Map(), convos: new Map(), reads: {}, postUnsubs: new Map(), msgUnsubs: new Map(), key: null, q: "", info: false, primed: new Set() };
const chatKeyOf = (kind, id) => (kind === "c" ? "c:" : "a:") + id;
const parseKey = k => k ? { kind: k[0], id: k.slice(2) } : null;
const channelPosts = cid => (C.posts.get(cid) || []).slice().sort((x, y) => (x.at || 0) - (y.at || 0));
const canSeeApp = id => S.sched || C.convos.has(id);
const canReplyApp = id => S.sched || (C.convos.get(id)?.members || []).includes(S.me);
function lastReadOf(key){ return C.reads[key] || 0; }
function unreadIn(key){
  const k = parseKey(key); if (!k) return 0;
  if (k.kind === "c") { const r = lastReadOf(key); return channelPosts(k.id).filter(p => p.by !== S.me && (p.at || 0) > r).length; }
  const t = threadOf(k.id), r = C.reads[key];
  // Before someone has a read marker for this conversation, the old owner-only "readAt" still counts as read.
  return t.filter(m => m.by !== S.me && (r ? (m.at || 0) > r : (m.from === "applicant" && !m.readAt && S.owner))).length;
}
let readTimer = null;
function markChatRead(key){
  if (!key || !S.me) return;
  C.reads[key] = Date.now();
  clearTimeout(readTimer);
  readTimer = setTimeout(() => setDoc(doc(db, "chatReads", S.me), { [key]: C.reads[key] }, { merge: true }).catch(() => {}), 400);
  const k = parseKey(key);
  if (k.kind === "a" && S.owner) for (const m of threadOf(k.id)) if (m.from === "applicant" && !m.readAt && !markedRead.has(m.key)) {
    markedRead.add(m.key); updateDoc(doc(db, "portal", k.id, "messages", m.id), { readAt: Date.now() }).catch(() => markedRead.delete(m.key));
  }
  updateMsgBadges();
}
function chatItems(){
  const chans = [...C.channels.entries()].map(([id, c]) => { const ps = channelPosts(id), last = ps[ps.length - 1];
    return { key: chatKeyOf("c", id), kind: "c", id, name: c.name, color: c.color, last, at: last ? last.at : (c.createdAt || 0) }; });
  const ids = new Set([...S.msgs.map(m => m.appId), ...C.convos.keys()].filter(id => S.apps.has(id) && canSeeApp(id)));
  const apps = [...ids].map(id => { const t = threadOf(id), last = t[t.length - 1];
    return { key: chatKeyOf("a", id), kind: "a", id, name: S.apps.get(id).name || "Applicant", last, at: last ? last.at : 0 }; });
  const byNew = (x, y) => (y.at || 0) - (x.at || 0);
  return { chans: chans.sort(byNew), apps: apps.sort(byNew) };
}
function unreadChatTotal(){ const { chans, apps } = chatItems(); return [...chans, ...apps].reduce((n, it) => n + unreadIn(it.key), 0); }

function watchChat(){
  if (!S.me) return;
  const chQ = S.owner ? collection(db, "channels") : query(collection(db, "channels"), where("members", "array-contains", S.me));
  onSnapshot(chQ, snap => {
    const next = new Map(snap.docs.map(d => [d.id, d.data()]));
    for (const [id, un] of C.postUnsubs) if (!next.has(id)) { un(); C.postUnsubs.delete(id); C.posts.delete(id); }
    for (const id of next.keys()) if (!C.postUnsubs.has(id)) C.postUnsubs.set(id, onSnapshot(collection(db, "channels", id, "posts"), ps => {
      const before = new Set((C.posts.get(id) || []).map(p => p.id));
      C.posts.set(id, ps.docs.map(d => ({ id: d.id, ...d.data() })));
      const fresh = C.posts.get(id).filter(p => !before.has(p.id) && p.by !== S.me);
      if (C.primed.has("c:" + id) && fresh.length && !(S.chatOn && C.key === "c:" + id)) toast(`${fresh[0].name || "New message"} in #${(C.channels.get(id) || {}).name || "channel"}`);
      C.primed.add("c:" + id);
      chatChanged();
    }, () => {}));
    C.channels = next; chatChanged();
  }, e => console.error(e));
  const cvQ = S.sched ? collection(db, "convos") : query(collection(db, "convos"), where("members", "array-contains", S.me));
  onSnapshot(cvQ, snap => {
    C.convos = new Map(snap.docs.map(d => [d.id, d.data()]));
    // The owner and the coordinator already load every conversation (watchMessages); everyone else loads just the ones they're in.
    if (!S.sched) {
      for (const [id, un] of C.msgUnsubs) if (!C.convos.has(id)) { un(); C.msgUnsubs.delete(id); S.msgs = S.msgs.filter(m => m.appId !== id); }
      for (const id of C.convos.keys()) if (!C.msgUnsubs.has(id)) C.msgUnsubs.set(id, onSnapshot(collection(db, "portal", id, "messages"), ms => {
        S.msgs = S.msgs.filter(m => m.appId !== id).concat(ms.docs.map(d => ({ id: d.id, key: d.ref.path, appId: id, ...d.data() })));
        updateMsgBadges(); if (S.sel === id && S.tab === "msgs") renderMessages(); chatChanged();
      }, () => {}));
    }
    chatChanged();
  }, e => console.error(e));
  onSnapshot(doc(db, "chatReads", S.me), d => { const mine = d.exists() ? d.data() : {}; for (const k in mine) if ((mine[k] || 0) > (C.reads[k] || 0)) C.reads[k] = mine[k]; chatChanged(); }, () => {});
}
const chatReady = key => { const k = parseKey(key); return k && (k.kind === "c" ? C.channels.has(k.id) : S.apps.has(k.id) && canSeeApp(k.id)); };
function chatChanged(){
  if (C.pendingKey && chatReady(C.pendingKey)) { C.key = C.pendingKey; C.pendingKey = null; if (S.chatOn) $("#detail")._chatKey = undefined; else return openChat(C.key); }
  updateMsgBadges(); if (S.chatOn) paintChat();
}

// The screen. Lives in #detail like the Overview; the composer is built once per conversation so typing isn't interrupted.
function openChat(key){
  if (key) { if (chatReady(key)) { C.key = key; C.pendingKey = null; } else C.pendingKey = key; }
  if (S.sel) { if (S.ivMode) exitIvMode(); flushAll(); S.sel = null; watchFiles(null); watchHistory(null); watchRecords(null); renderList(); }
  S.chatOn = true; S.mOv = false;
  if (!C.key && !matchMedia("(max-width:860px)").matches) { const { chans, apps } = chatItems(); C.key = (chans[0] || apps[0] || {}).key || null; }
  parkRoster();
  const D = $("#detail"); D._chatKey = undefined; D.innerHTML = "";
  $("#app").classList.remove("open"); $("#app").classList.add("chatopen"); $("#overviewBtn").classList.remove("on"); $("#msgsBtn").classList.add("on");
  paintChat(); renderDetail();
}
function closeChat(){
  if (!S.chatOn) return;
  S.chatOn = false; $("#app").classList.remove("chatopen"); $("#msgsBtn").classList.remove("on");
  parkRoster();
  const D = $("#detail"); D._chatKey = undefined; D.innerHTML = "";
}
const chIcon = (it, big) => it.kind === "c"
  ? `<span class="cv-ic${big ? " big" : ""}" style="background:${CH_COLORS[it.color] || CH_COLORS.int}" aria-hidden="true">#</span>`
  : `<span class="av${big ? " big" : ""}" style="--stage-c:${stageVar(view(S.apps.get(it.id)).stage)}" aria-hidden="true">${esc(initials(it.name))}</span>`;
function chatListHTML(){
  const { chans, apps } = chatItems(), q = C.q.trim().toLowerCase();
  const hit = it => !q || it.name.toLowerCase().includes(q) || (it.kind === "c" ? channelPosts(it.id) : threadOf(it.id)).some(m => String(m.text || "").toLowerCase().includes(q));
  // Owner's search also offers invited applicants with no messages yet, so a conversation can be started.
  const extra = S.sched && q ? [...S.apps.values()].filter(a => get(a, "portal.invited") && !apps.some(x => x.id === a._id) && (a.name || "").toLowerCase().includes(q)).slice(0, 5)
    .map(a => ({ key: chatKeyOf("a", a._id), kind: "a", id: a._id, name: a.name || "Applicant", last: null })) : [];
  const row = it => { const n = unreadIn(it.key), st = it.kind === "a" ? STAGES[view(S.apps.get(it.id)).stage] : null;
    const prev = it.last ? (it.last.by === S.me ? "You: " : it.kind === "c" || it.last.from === "staff" ? (first(it.last.name) || "Squad") + ": " : "") + postPreview(it.last) : it.kind === "c" ? "No messages yet" : "Start the conversation";
    return `<button class="cv-row${C.key === it.key ? " on" : ""}" type="button" data-chat="${esc(it.key)}">${chIcon(it)}
      <span class="cv-rt"><b>${it.kind === "c" ? "#" : ""}${esc(it.name)}${st ? ` <span class="cv-tag">${esc(st.label)}</span>` : ""}</b><small>${esc(prev.slice(0, 80))}</small></span>
      <span class="cv-meta">${it.last ? esc(ago(it.last.at)) : ""}${n ? `<span class="cv-un">${n}</span>` : ""}</span></button>`; };
  const cs = chans.filter(hit), as = [...apps.filter(hit), ...extra];
  return `${cs.length || S.owner ? `<div class="cv-grp">Channels</div>${cs.map(row).join("") || `<p class="cv-none">${S.owner ? "No channels yet. Click <b>+ Channel</b> to make one." : ""}</p>`}` : ""}
    ${as.length || S.owner ? `<div class="cv-grp">Applicants</div>${as.map(row).join("") || `<p class="cv-none">${q ? "No matches." : "Applicant conversations show up here."}</p>`}` : ""}
    ${!cs.length && !as.length && !S.owner ? `<p class="cv-none">You're not in any channels or conversations yet. The membership coordinator adds you.</p>` : ""}`;
}
const dayLabel = ms => { const d = new Date(ms), t = new Date(); const y = new Date(t); y.setDate(t.getDate() - 1);
  return d.toDateString() === t.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }); };
function chatThreadHTML(k){
  const items = k.kind === "c" ? channelPosts(k.id).map(p => ({ ...p, mine: p.by === S.me }))
    : threadOf(k.id).map(m => ({ ...m, mine: m.from === "staff", name: m.from === "staff" ? (m.by === S.me ? "" : m.name || "PVRS") : (S.apps.get(k.id)?.name || m.name || "Applicant") }));
  if (!items.length) return `<div class="cv-empty">${k.kind === "c" ? "No messages yet. Say hi 👋" : "No messages yet. Anything you send shows up in their applicant portal."}</div>`;
  let day = "";
  return items.map(m => { const dl = dayLabel(m.at || 0), sep = dl !== day ? `<div class="cv-day">${esc(dl)}</div>` : ""; day = dl;
    const me = m.by === S.me, who = me ? "You" : (m.name || personName(m.by) || "Squad");
    return `${sep}<div class="cv-m${m.mine ? " mine" : ""}"><span class="av sm" style="--stage-c:${m.from === "applicant" ? stageVar(view(S.apps.get(k.id)).stage) : personColor(m.by)}" aria-hidden="true">${esc(initials(me ? (S.name || S.me) : who))}</span>
      <div><div class="cv-who">${me ? "" : `<b>${esc(who)}</b> · `}${esc(slotTime(m.at || 0))}${me ? " · You" : ""}${m.from === "staff" && m.seenAt ? " · Seen" : ""}</div>${m.text ? `<div class="cv-bub">${esc(m.text)}</div>` : ""}
      ${m.file ? `<button class="cv-att" type="button" data-chfile="${esc(m.id)}"><i aria-hidden="true"></i><span><b>${esc(m.file.name)}</b><small>${m.file.type === "application/pdf" ? "PDF" : "Photo"} · ${Math.max(1, Math.round((m.file.size || 0) / 1024))} KB</small></span></button>` : ""}
      ${k.kind === "c" ? `<div class="cv-react">${Object.entries(m.reactions || {}).filter(([, who]) => who.length).map(([e, who]) => `<button type="button" class="${who.includes(S.me) ? "on" : ""}" data-react="${esc(e)}" data-pid="${esc(m.id)}" aria-label="${esc(e)}, ${who.length}">${esc(e)} ${who.length}</button>`).join("")}
        <span class="cv-pickr">${REACTIONS.filter(e => !(m.reactions || {})[e]?.length).map(e => `<button type="button" data-react="${esc(e)}" data-pid="${esc(m.id)}" aria-label="React ${esc(e)}">${esc(e)}</button>`).join("")}${S.owner && m.text ? `<button type="button" data-pinpost="${esc(m.id)}" aria-label="Pin this message">📌</button>` : ""}</span></div>` : ""}</div></div>`; }).join("");
}
// Each squad member gets their own avatar colour (same everywhere).
const PERSON_COLORS = ["#2F5BE0", "#6E48E0", "#F07A1A", "#0B9A8C", "#1F9A45", "#E8432B", "#C2338A"];
const personColor = e => { let h = 0; for (const ch of String(e || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PERSON_COLORS[h % PERSON_COLORS.length]; };
const memberName = (e, names) => e === S.me ? (S.name || "You") : (names || {})[e] || (S.staff.get(e)?.name) || e.split("@")[0];
function chatMembers(k){
  if (k.kind === "c") { const c = C.channels.get(k.id) || {}; return [...new Set([OWNER_EMAIL, ...(c.members || [])])].map(e => ({ email: e, name: memberName(e, c.names) })); }
  const cv = C.convos.get(k.id) || {};
  return [...new Set([OWNER_EMAIL, ...(cv.members || [])])].map(e => ({ email: e, name: memberName(e, cv.names) }));
}
function chatInfoHTML(k){
  const mem = chatMembers(k), roleOf = e => e === OWNER_EMAIL ? "Owner" : !S.staff.has(e) ? "Squad" : roleLabel(S.staff.get(e).role);
  const row = m => `<div class="cv-mem"><span class="av sm" style="--stage-c:${personColor(m.email)}" aria-hidden="true">${esc(initials(m.name))}</span><span><b>${esc(m.name)}</b><small>${esc(roleOf(m.email))}</small></span><span class="cv-dot" data-online="${esc(m.email)}" title="Online"></span></div>`;
  if (k.kind === "c") return `<h3>Members · ${mem.length}</h3>${mem.map(row).join("")}
    ${S.owner ? `<button class="btn small" type="button" data-chedit="${esc(k.id)}">Edit channel</button>` : ""}
    <p class="cv-note">Only the people listed here can see this channel. Applicants never see squad channels.</p>`;
  const a = S.apps.get(k.id) || {};
  return `<h3>In this conversation</h3>
    <div class="cv-mem"><span class="av sm" style="--stage-c:${stageVar(view(a).stage)}" aria-hidden="true">${esc(initials(a.name))}</span><span><b>${esc(a.name || "Applicant")}</b><small>Applicant</small></span></div>
    ${mem.map(row).join("")}
    ${S.sched ? `<button class="btn small" type="button" data-cvedit="${esc(k.id)}">+ Add squad member</button>` : ""}
    ${S.admin ? `<button class="btn small" type="button" data-cvfile="${esc(k.id)}">Open file</button>` : ""}
    <p class="cv-note">${esc(first(a.name) || "The applicant")} sees replies in the applicant portal as <b>PVRS Membership</b> with the sender's first name, and never sees other applicants or squad channels.${get(a, "portal.invited") ? "" : ` <b>Not invited to the portal yet</b>, so they can't see messages.`}</p>`;
}
function paintChat(){
  const D = $("#detail"); if (!D || !S.chatOn) return;
  const k = parseKey(C.key), narrow = matchMedia("(max-width:860px)").matches;
  if (k && ((k.kind === "c" && !C.channels.has(k.id)) || (k.kind === "a" && !S.apps.has(k.id)))) C.key = null;
  const kk = parseKey(C.key);
  if (D._chatKey !== C.key || !D.querySelector(".cv")) {
    const it = kk ? (kk.kind === "c" ? { kind: "c", id: kk.id, name: C.channels.get(kk.id).name, color: C.channels.get(kk.id).color } : { kind: "a", id: kk.id, name: S.apps.get(kk.id).name || "Applicant" }) : null;
    const canSend = kk && (kk.kind === "c" || canReplyApp(kk.id));
    D.innerHTML = `<div class="cv${kk ? " has" : ""}${C.info ? " info" : ""}">
      <section class="cv-list glass" aria-label="Conversations"><div class="cv-lh"><h1>Messages</h1>${S.owner ? `<button class="btn small primary" type="button" data-chnew>+ Channel</button>` : ""}</div>
        <label class="search cv-search"><input id="cvQ" type="search" placeholder="${S.sched ? "Search or find an applicant" : "Search messages"}" autocomplete="off" value="${esc(C.q)}" aria-label="Search conversations"></label>
        <div class="cv-rows" id="cvRows"></div></section>
      <section class="cv-thread glass" aria-label="Conversation">${it ? `<header class="cv-th"><button class="btn small cv-back" type="button" data-chback aria-label="Back to conversations">‹</button>${chIcon(it, true)}
          <div class="cv-tt"><h2>${it.kind === "c" ? "#" : ""}${esc(it.name)}</h2><small id="cvSub"></small></div>
          <button class="btn small cv-infob" type="button" data-chinfo aria-pressed="${C.info}">${it.kind === "c" ? "Members" : "People"}</button></header>
        <div class="cv-pinbar" id="cvPin" hidden></div>
        <div class="cv-msgs" id="cvMsgs" aria-live="polite"></div><div class="cv-typing" id="cvTyping" aria-live="polite"></div>
        ${canSend ? `<div class="cv-compose">${it.kind === "a" && S.sched ? `<div class="chips cv-chips">${savedReplies().map((r, i) => `<button class="chip" type="button" data-qr="${i}">${esc(r.title)}</button>`).join("")}</div>` : ""}
          <div class="cv-crow"><textarea id="cvText" rows="1" maxlength="${it.kind === "c" ? 4000 : 2000}" placeholder="${it.kind === "c" ? `Message #${esc(it.name)}` : `Reply to ${esc(first(it.name))}…`}" aria-label="Message"></textarea>
          ${it.kind === "c" ? `<label class="btn cv-attach" title="Post a PDF or photo (up to 15 MB). Nothing medical or Social Security."><input type="file" id="cvFile" accept="application/pdf,image/*" hidden>📎<span class="sr">Attach a file</span></label>` : ""}
          <button class="btn primary" type="button" data-chsend>Send</button></div><small class="cv-hint">Enter to send · Shift+Enter for a new line</small></div>`
        : `<p class="cv-note cv-ro">You can read this conversation but not reply.</p>`}`
      : `<div class="cv-empty big"><h3>Pick a conversation</h3><p>${S.owner ? "Or make a channel for a team: interviewers, the board, orientation…" : "Your channels and the applicant conversations you're added to show up here."}</p></div>`}</section>
      ${kk ? `<aside class="cv-info glass" id="cvInfo" aria-label="People"></aside>` : ""}</div>`;
    D._chatKey = C.key;
    const q = $("#cvQ"); q.addEventListener("input", () => { C.q = q.value; $("#cvRows").innerHTML = chatListHTML(); });
    const ta = $("#cvText");
    if (ta) { ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(); } });
      ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; noteTyping(!!ta.value.trim()); });
      $("#cvFile")?.addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) postFile(f); });
      if (!narrow) ta.focus(); }
  }
  $("#cvRows").innerHTML = chatListHTML();
  if (kk) {
    const box = $("#cvMsgs"), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 80 || !box.childElementCount;
    box.innerHTML = chatThreadHTML(kk); if (atEnd) box.scrollTop = box.scrollHeight;
    $("#cvInfo").innerHTML = chatInfoHTML(kk); paintPresence();
    const pinEl = $("#cvPin"), pin = kk.kind === "c" ? C.channels.get(kk.id)?.pin : null;
    if (pinEl) { pinEl.hidden = !pin; pinEl.innerHTML = pin ? `<span>📌 ${esc(pin.text)}</span>${S.owner ? `<button class="copy" type="button" data-unpin>Unpin</button>` : ""}` : ""; }
    const n = chatMembers(kk).length;
    $("#cvSub").textContent = kk.kind === "c" ? `${n} member${n === 1 ? "" : "s"} · squad only` : `Applicant · ${STAGES[view(S.apps.get(kk.id)).stage]?.label || ""} · sees this in their portal`;
    if (document.visibilityState === "visible" && unreadIn(C.key)) markChatRead(C.key);
  }
}
async function sendChat(){
  const k = parseKey(C.key), ta = $("#cvText"); if (!k || !ta) return;
  const text = ta.value.trim(); if (!text) return ta.focus();
  const btn = $("[data-chsend]"); if (btn) btn.disabled = true;
  try {
    if (k.kind === "c") await addDoc(collection(db, "channels", k.id, "posts"), { text: text.slice(0, 4000), by: S.me, name: S.name || S.me.split("@")[0], at: Date.now() });
    else { if (!canReplyApp(k.id)) return toast("You can read this conversation but not reply.");
      if (text.length > 2000) return toast("Replies to applicants can be up to 2,000 characters.");
      await addDoc(collection(db, "portal", k.id, "messages"), { text, from: "staff", by: S.me, name: first(S.name) || "PVRS", at: Date.now() }); }
    ta.value = ""; ta.style.height = ""; noteTyping(false); markChatRead(C.key); ta.focus();
  } catch (e) { console.error(e); toast("Couldn't send. Try again."); }
  finally { if (btn) btn.disabled = false; }
}
// Owner: make, rename, recolour or delete a channel and pick its members from the team.
function openChannelEditor(cid){
  if (!S.owner) return;
  const c = cid ? C.channels.get(cid) : { name: "", color: "int", members: [] };
  const team = [...S.staff.entries()].sort((x, y) => (x[1].name || x[0]).localeCompare(y[1].name || y[0]));
  const M = openModal(`<h3>${cid ? "Edit channel" : "New channel"}</h3>
    <div class="field"><label for="chName">Name</label><input id="chName" maxlength="60" placeholder="interview-team" value="${esc(c.name || "")}"></div>
    <div class="field"><label>Colour</label><div class="cv-colors">${Object.entries(CH_COLORS).map(([k, v]) => `<button type="button" class="cv-ic${(c.color || "int") === k ? " pick" : ""}" data-chcolor="${k}" style="background:${v}" aria-label="${k}" aria-pressed="${(c.color || "int") === k}">#</button>`).join("")}</div></div>
    <div class="field"><label>Members</label><div class="ios cv-pick">${team.length ? team.map(([e, s]) => `<label class="row"><input type="checkbox" value="${esc(e)}"${(c.members || []).includes(e) ? " checked" : ""}><span class="lbl">${esc(s.name || e)}<small>${esc(e)} · ${roleLabel(s.role)}</small></span></label>`).join("")
      : `<div class="row"><span class="lbl" style="color:var(--fg2)">No team members yet. Approve them in Settings → Team first.</span></div>`}</div>
      <p class="help">You're always in every channel.</p></div>
    <div class="acts">${cid ? `<button class="btn danger" type="button" id="chDel">Delete channel</button>` : ""}<span style="flex:1"></span><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="chSave">${cid ? "Save" : "Create channel"}</button></div>`);
  let color = c.color || "int";
  $("#chName").focus();
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const cb = e.target.closest("[data-chcolor]"); if (cb) { color = cb.dataset.chcolor; M.querySelectorAll("[data-chcolor]").forEach(b => { b.classList.toggle("pick", b === cb); b.setAttribute("aria-pressed", b === cb); }); return; }
    const del = e.target.closest("#chDel");
    if (del) { if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = "Delete channel and its messages?"; return; }
      try { const ps = await getDocs(collection(db, "channels", cid, "posts")); const b = writeBatch(db); ps.docs.forEach(d => { if (d.data().file?.path) deleteObject(ref(storage, d.data().file.path)).catch(() => {}); b.delete(d.ref); }); b.delete(doc(db, "channels", cid)); await b.commit();
        closeModal(); if (C.key === "c:" + cid) C.key = null; toast("Channel deleted"); paintChat(); } catch (err) { console.error(err); toast("Couldn't delete the channel."); }
      return; }
    if (e.target.closest("#chSave")) {
      const name = $("#chName").value.trim().replace(/^#+/, "").slice(0, 60); if (!name) { toast("Give the channel a name."); return $("#chName").focus(); }
      const members = [...M.querySelectorAll(".cv-pick input:checked")].map(i => i.value).filter(x => x !== OWNER_EMAIL);
      const names = Object.fromEntries([[OWNER_EMAIL, S.name || "Owner"], ...members.map(m => [m, S.staff.get(m)?.name || m.split("@")[0]])]);
      try {
        const id = cid || doc(collection(db, "channels")).id;
        await setDoc(doc(db, "channels", id), { name, color, members: [OWNER_EMAIL, ...members], names, createdAt: c.createdAt || Date.now(), createdBy: c.createdBy || S.me, updatedAt: Date.now(), pin: c.pin || null });
        closeModal(); toast(cid ? "Channel saved" : `#${name} created`); C.key = "c:" + id; if (S.chatOn) { $("#detail")._chatKey = undefined; paintChat(); } else openChat(C.key);
      } catch (err) { console.error(err); toast("Couldn't save the channel."); }
    }
  };
}
// Owner: choose which squad members can read and reply in an applicant's conversation.
function openConvoEditor(appId){
  if (!S.sched) return;
  const a = S.apps.get(appId); if (!a) return;
  const cur = C.convos.get(appId)?.members || [];
  const team = [...S.staff.entries()].sort((x, y) => (x[1].name || x[0]).localeCompare(y[1].name || y[0]));
  const M = openModal(`<h3>People in ${esc(first(a.name) || "this")}'s conversation</h3><p class="help">They can read everything in it and reply. ${esc(first(a.name) || "The applicant")} sees their first name on replies.</p>
    <div class="ios cv-pick">${team.length ? team.map(([e, s]) => `<label class="row"><input type="checkbox" value="${esc(e)}"${cur.includes(e) ? " checked" : ""}><span class="lbl">${esc(s.name || e)}<small>${esc(e)} · ${roleLabel(s.role)}</small></span></label>`).join("")
      : `<div class="row"><span class="lbl" style="color:var(--fg2)">No team members yet. Approve them in Settings → Team first.</span></div>`}</div>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="cvSave">Save</button></div>`);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    if (!e.target.closest("#cvSave")) return;
    const members = [...M.querySelectorAll(".cv-pick input:checked")].map(i => i.value).filter(x => x !== OWNER_EMAIL);
    try {
      if (members.length) await setDoc(doc(db, "convos", appId), { members, names: Object.fromEntries(members.map(m => [m, S.staff.get(m)?.name || m.split("@")[0]])), updatedAt: Date.now() });
      else await deleteDoc(doc(db, "convos", appId));
      closeModal(); toast("Saved"); $("#detail")._chatKey = undefined; paintChat();
    } catch (err) { console.error(err); toast("Couldn't save."); }
  };
}
function bindChat(){
  $("#detail").addEventListener("click", e => {
    if (!S.chatOn) return;
    const t = e.target;
    const row = t.closest("[data-chat]"); if (row) { C.key = row.dataset.chat; paintChat(); return; }
    const ck = parseKey(C.key);
    if (ck?.kind === "c") {
      const rc = t.closest("[data-react]"); if (rc) return toggleReact(ck.id, rc.dataset.pid, rc.dataset.react);
      const cf = t.closest("[data-chfile]"); if (cf) return openChatFile(ck.id, cf.dataset.chfile);
      const pp = t.closest("[data-pinpost]"); if (pp) { const p = (C.posts.get(ck.id) || []).find(x => x.id === pp.dataset.pinpost); if (p) setPin(ck.id, p.text); return; }
      if (t.closest("[data-unpin]")) return setPin(ck.id, "");
    }
    if (t.closest("[data-chback]")) { C.key = null; paintChat(); return; }
    if (t.closest("[data-chsend]")) return sendChat();
    if (t.closest("[data-chnew]")) return openChannelEditor(null);
    const ce = t.closest("[data-chedit]"); if (ce) return openChannelEditor(ce.dataset.chedit);
    const cv = t.closest("[data-cvedit]"); if (cv) return openConvoEditor(cv.dataset.cvedit);
    const cf = t.closest("[data-cvfile]"); if (cf) { closeChat(); select(cf.dataset.cvfile); switchTab("msgs"); return; }
    if (t.closest("[data-chinfo]")) { C.info = !C.info; $(".cv")?.classList.toggle("info", C.info); t.closest("[data-chinfo]").setAttribute("aria-pressed", C.info); return; }
    const qr = t.closest("[data-qr]"); if (qr && $("#cvText")) { e.stopPropagation(); const k = parseKey(C.key), a = S.apps.get(k?.id), r = savedReplies()[+qr.dataset.qr], ta = $("#cvText"); if (!r || !a) return;
      const text = r.text.replace(/\{first\}/g, first(a.name)); ta.value = ta.value.trim() ? ta.value.trimEnd() + "\n\n" + text : text; ta.focus(); return; }
  }, true);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.chatOn && C.key && unreadIn(C.key)) markChatRead(C.key); });
}

/* ---------- interviewers: their own home screen ---------- */
// "My interviews" replaces the Overview for the interviewer role: what's coming, what still needs a time, what's done.
function renderMyInterviews(D){
  const mine = [...S.apps.values()], now = Date.now();
  const whenOf = a => a._booked ? a._booked.start : get(a, "sched.scheduled") ? new Date(get(a, "sched.scheduled") + "T12:00").getTime() : 0;
  const done = mine.filter(a => get(a, "sched.completed"));
  const up = mine.filter(a => !get(a, "sched.completed") && whenOf(a)).sort((x, y) => whenOf(x) - whenOf(y));
  const toSet = mine.filter(a => !get(a, "sched.completed") && !whenOf(a));
  const openTimes = [...S.slots.values()].filter(s => s.host === S.me && !s.bookedBy && s.start > now).length;
  const av = a => `<span class="av" style="--stage-c:${stageVar(view(a).stage)}" aria-hidden="true">${esc(initials(a.name))}</span>`;
  const whenText = a => a._booked ? `${slotLong(a._booked.start)}${a._booked.location ? " · " + a._booked.location : ""}` : `${longDate(get(a, "sched.scheduled"))}${get(a, "sched.time") ? " at " + get(a, "sched.time") : ""}`;
  const row = (a, sub, btn) => `<div class="oitem" style="cursor:default">${av(a)}<span class="ot"><b>${esc(a.name || "Applicant")}</b><small>${esc(sub)}</small></span>
    <span class="mi-acts">${btn ? `<button class="btn small primary" type="button" data-startiv="${esc(a._id)}">Start interview</button>` : ""}<button class="btn small" type="button" data-open="${esc(a._id)}">Open</button></span></div>`;
  const name = first(S.name) || "";
  const html = `<div class="ov"><div class="ovin"><div class="ovhead"><div><div class="eyebrow">${esc(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</div><h2>My interviews</h2>
      <p>${name ? esc(name) + ", you" : "You"} have ${up.length ? `${up.length} interview${up.length === 1 ? "" : "s"} coming up` : "no interviews coming up"}${toSet.length ? ` and ${toSet.length} waiting on a time` : ""}.</p></div>
      <button class="btn" type="button" data-cmd="slots">My interview times${openTimes ? ` · ${openTimes} open` : ""}</button></div>
    <section class="ovcard"><h3>Coming up</h3><div class="olist">${up.map(a => row(a, whenText(a), true)).join("") || `<div class="oempty">Nothing booked yet.</div>`}</div></section>
    ${toSet.length ? `<section class="ovcard"><h3>Waiting on a time</h3><div class="olist">${toSet.map(a => row(a, a.phone || a.email || "Not booked yet", true)).join("")}</div></section>` : ""}
    ${!mine.length ? `<section class="ovcard"><div class="oempty">When the membership coordinator assigns you an applicant, or an applicant books a time you offered, they'll show up here.</div></section>` : ""}
    ${done.length ? `<section class="ovcard"><h3>Done</h3><div class="olist">${done.map(a => row(a, "Completed " + longDate(get(a, "sched.completed")), false)).join("")}</div></section>` : ""}
    ${mine.length ? `<div id="ovRoster" class="ovroster"></div>` : ""}</div></div>`;
  if (D.querySelector(".ov") && D._ovHTML === html) return placeRoster();
  const rst = rosterState(); parkRoster();
  D._ovHTML = html; D.innerHTML = html; placeRoster(rst);
}

/* ---------- duplicates: same email, phone or name ---------- */
const normName = n => String(n || "").toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, " ");
const lastTen = p => String(p || "").replace(/\D/g, "").slice(-10);
function dupeWhy(a, b){
  if (a.email && lower(a.email) === lower(b.email)) return "same email";
  if (lastTen(a.phone).length === 10 && lastTen(a.phone) === lastTen(b.phone)) return "same phone";
  if (normName(a.name).includes(" ") && normName(a.name) === normName(b.name)) return "same name";
  return "";
}
const dupesOf = a => !S.owner ? [] : [...S.apps.values()].filter(b => b._id !== a._id && !get(a, `notDupes.${b._id}`) && !get(b, `notDupes.${a._id}`) && dupeWhy(a, b));
function renderDupeNote(a){
  const el = $("#dupeNote"); if (!el) return;
  const list = dupesOf(a); el.hidden = !list.length;
  el.innerHTML = list.map(b => `<b>Possible duplicate:</b> ${esc(b.name || "Unnamed")} (${esc(dupeWhy(a, b))}). <button class="btn small" type="button" data-dupe="${esc(b._id)}">Review</button>`).join("<br>");
}
function openDupe(id, otherId){
  const a = S.apps.get(id), b = S.apps.get(otherId || (a && dupesOf(a)[0]?._id)); if (!a || !b) return;
  const inv = x => !!get(x, "portal.invited") || S.portal.has(x._id);
  const both = inv(a) && inv(b);
  const row = (l, f) => `<tr><th>${esc(l)}</th><td>${esc(f(a) || "—")}</td><td>${esc(f(b) || "—")}</td></tr>`;
  let keep = inv(b) && !inv(a) ? b._id : a._id;
  const M = openModal(`<h3>Are these the same person?</h3><p class="help">They have the ${esc(dupeWhy(a, b))}.</p>
    <div class="cv-dupe"><table><tr><th></th><th>${esc(a.name || "Unnamed")}</th><th>${esc(b.name || "Unnamed")}</th></tr>
      ${row("Email", x => x.email)}${row("Phone", x => x.phone)}${row("Received", x => get(x, "app.received"))}${row("Stage", x => STAGES[view(x).stage]?.label)}
      ${row("Applied online", x => x.form ? "Yes" : "No")}${row("Portal", x => inv(x) ? "Invited" : "Not invited")}${row("Interview booked", x => x._booked ? slotLong(x._booked.start) : "")}</table></div>
    ${both ? `<p class="help"><b>Both people have portal access,</b> so these can't be combined automatically: each may have messages and uploads of their own. Delete the extra file by hand if you're sure.</p>` : `
      <div class="field"><label>Keep which file?</label><div class="seg" role="group" aria-label="Keep which file" id="dupKeep">${[a, b].map(x => `<button type="button" class="${keep === x._id ? "on" : ""}" data-keep="${esc(x._id)}" ${inv(a) !== inv(b) && !inv(x) ? "disabled" : ""}>${esc(x.name || "Unnamed")}, ${esc(x.email || x.phone || "no contact")}</button>`).join("")}</div></div>
      <p class="help">The kept file keeps everything it has and picks up whatever it's missing from the other: answers, references, notes, uploaded records and any second online application. The other file is then deleted, and any interview time it held is released. This can't be undone from the desk.</p>`}
    <div class="acts"><button class="btn" type="button" id="dupNo">Not the same person</button><span style="flex:1"></span><button class="btn" type="button" data-x>Cancel</button>${both ? "" : `<button class="btn primary" type="button" id="dupYes">Combine files</button>`}</div>`);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const k = e.target.closest("[data-keep]"); if (k && !k.disabled) { keep = k.dataset.keep; M.querySelectorAll("[data-keep]").forEach(x => x.classList.toggle("on", x === k)); return; }
    if (e.target.closest("#dupNo")) { edit(a._id, `notDupes.${b._id}`, true); closeModal(); toast("Got it. They won't be flagged again."); renderOverview(); renderDupeNote(a); return; }
    const go = e.target.closest("#dupYes"); if (!go) return;
    go.disabled = true; go.textContent = "Combining…";
    try { await mergeFiles(keep, keep === a._id ? b._id : a._id); closeModal(); }
    catch (err) { console.error(err); go.disabled = false; go.textContent = "Combine files"; toast("Couldn't combine them. Nothing was deleted. Try again."); }
  };
}
// Keep one file, fill its blanks from the other, then delete the other. Everything is written to the kept file BEFORE anything is deleted.
async function mergeFiles(keepId, dropId){
  const fill = (base, extra) => { for (const k of Object.keys(extra || {})) { const v = extra[k], cur = base[k];
    if (isObj(v) && isObj(cur)) fill(cur, v); else if (cur === undefined || cur === null || cur === "") base[k] = clone(v); } return base; };
  const ks = clone(S.shared.get(keepId) || {}), ds = clone(S.shared.get(dropId) || {}), kp = clone(S.secure.get(keepId) || {}), dp = clone(S.secure.get(dropId) || {});
  const dropName = ds.name || "the other file", moved = new Set();
  // references: skip people already on the kept file, then keep the slot if it's free or take the first free one
  const krefs = kp.refs = kp.refs || {}, keptNames = new Set(Object.values(krefs).map(r => normName(r.name)));
  for (const [slot, r] of Object.entries(dp.refs || {})) { if (!String(r.name || "").trim() || keptNames.has(normName(r.name))) continue;
    const free = !String(krefs[slot]?.name || "").trim() ? slot : ["r1", "r2", "r3", "r4"].find(s => !String(krefs[s]?.name || "").trim()); if (!free) continue;
    krefs[free] = clone(r); keptNames.add(normName(r.name)); if (free === slot && r.link) moved.add(r.link); else { delete krefs[free].link; delete krefs[free].linkAt; delete krefs[free].linkExp; } }
  delete dp.refs;
  if (kp.notes && dp.notes && kp.notes !== dp.notes) { kp.notes = `${kp.notes}\n\nFrom the combined file (${dropName}):\n${dp.notes}`; delete dp.notes; }
  const forms = [...(kp.otherForms || []), ...(dp.otherForms || [])];
  if (kp.form && dp.form) { if (kp.form.submittedAt !== dp.form.submittedAt) forms.push(dp.form); delete dp.form; }
  if (forms.length) kp.otherForms = forms; delete dp.otherForms; delete dp.notDupes; if (kp.notDupes) delete kp.notDupes[dropId];
  fill(ks, ds); fill(kp, dp);
  ks.interviewers = [...new Set([...(S.shared.get(keepId)?.interviewers || []), ...(ds.interviewers || [])])];
  ks.updatedAt = Date.now(); ks.updatedBy = S.me; kp.secUpdatedAt = Date.now(); kp.secUpdatedBy = S.me;
  await setDoc(doc(db, "applicants", keepId), ks, { merge: true });
  await setDoc(doc(db, "applicants", keepId, "private", "main"), kp, { merge: true });
  for (const r0 of (await getDocs(collection(db, "applicants", dropId, "records"))).docs) await addDoc(collection(db, "applicants", keepId, "records"), r0.data());
  for (const t of moved) await updateDoc(doc(db, "refLinks", t), { appId: keepId, applicant: ks.name || "" }).catch(() => {});
  moved.forEach(t => S._keepLinks = (S._keepLinks || new Set()).add(t));
  const cvK = C.convos.get(keepId)?.members || [], cvD = C.convos.get(dropId)?.members || [];
  if (cvD.length) { const members = [...new Set([...cvK, ...cvD])]; await setDoc(doc(db, "convos", keepId), { members, names: { ...(C.convos.get(keepId)?.names || {}), ...(C.convos.get(dropId)?.names || {}) }, updatedAt: Date.now() }); }
  await addDoc(collection(db, "applicants", keepId, "history"), { at: Date.now(), by: S.me, changes: [{ path: "_merged", from: dropName, to: ks.name || "" }] }).catch(() => {});
  await deleteApplicant(dropId, true, { keepRecordFiles: true });
  select(keepId); toast("Files combined.");
}

/* ---------- bulk actions on the applicant list (owner) ---------- */
function bulkToggle(on){
  S.bulk = on ? new Set() : null;
  $("#bulkBtn").setAttribute("aria-pressed", String(!!on)); $("#bulkBtn").textContent = on ? "Cancel" : "Select";
  renderList(); paintBulk();
}
function paintBulk(){
  const bar = $("#bulkBar"); if (!bar) return;
  bar.hidden = !S.bulk; if (!S.bulk) return;
  const n = S.bulk.size;
  bar.innerHTML = `<b>${n} selected</b><button class="btn small" type="button" data-bulk="all">${S.vis && n === S.vis.length && n ? "Clear" : "All"}</button>
    <span class="bk-acts"><button class="btn small primary" type="button" data-bulk="assign" ${n ? "" : "disabled"}>Assign interviewer</button>
    <button class="btn small primary" type="button" data-bulk="msg" ${n ? "" : "disabled"}>Message</button>
    <button class="btn small primary" type="button" data-bulk="refs" ${n ? "" : "disabled"}>Email references</button></span>`;
}
const bulkApps = () => [...(S.bulk || [])].map(id => S.apps.get(id)).filter(Boolean);
function bulkAssign(){
  const list = bulkApps();
  const team = [...S.staff.entries()].filter(([, s]) => canInterview(s)).sort((x, y) => (x[1].name || x[0]).localeCompare(y[1].name || y[0]));
  const M = openModal(`<h3>Assign to ${list.length} applicant${list.length === 1 ? "" : "s"}</h3><p class="help">Adds them alongside anyone already assigned. To take someone off, use that applicant's Interview tab.</p>
    <div class="ios cv-pick">${team.map(([e, s]) => `<label class="row"><input type="checkbox" value="${esc(e)}"><span class="lbl">${esc(s.name || e)}<small>${esc(e)} · ${roleLabel(s.role)}</small></span></label>`).join("") || `<div class="row"><span class="lbl" style="color:var(--fg2)">No interviewers yet. In Settings → Team, set someone's role to <b>Interviewer</b>.</span></div>`}</div>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="bkaSave">Assign</button></div>`);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    if (!e.target.closest("#bkaSave")) return;
    const add = [...M.querySelectorAll(".cv-pick input:checked")].map(i => i.value); if (!add.length) return toast("Tick at least one person.");
    try { for (const a of list) await saveInterviewers(a._id, [...new Set([...(a.interviewers || []), ...add])]);
      closeModal(); toast(`Assigned to ${list.length} applicant${list.length === 1 ? "" : "s"}.`); bulkToggle(false);
    } catch (err) { console.error(err); toast("Couldn't finish. Check who was assigned and try again."); }
  };
}
function bulkMessage(){
  const list = bulkApps(), ok = list.filter(a => get(a, "portal.invited")), skip = list.filter(a => !get(a, "portal.invited"));
  const M = openModal(`<h3>Message ${ok.length} applicant${ok.length === 1 ? "" : "s"}</h3>
    <p class="help">Each one gets it in their own private conversation, so they don't see each other. {first} becomes their first name.</p>
    ${skip.length ? `<p class="help"><b>Skipped, not invited to the portal yet:</b> ${esc(skip.map(a => a.name).join(", "))}</p>` : ""}
    <textarea id="bkText" rows="5" maxlength="2000" class="cv-bktext" placeholder="Hi {first}, …" aria-label="Message"></textarea>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="bkSend" ${ok.length ? "" : "disabled"}>Send to ${ok.length}</button></div>`);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const go = e.target.closest("#bkSend"); if (!go) return;
    const text = $("#bkText").value.trim(); if (!text) return $("#bkText").focus();
    go.disabled = true; let sent = 0;
    try { for (const a of ok) { await addDoc(collection(db, "portal", a._id, "messages"), { text: text.replace(/\{first\}/g, first(a.name) || "there"), from: "staff", by: S.me, name: first(S.name) || "PVRS", at: Date.now() }); sent++; }
      closeModal(); toast(`Sent to ${sent} applicant${sent === 1 ? "" : "s"}.`); bulkToggle(false);
    } catch (err) { console.error(err); go.disabled = false; toast(`Sent to ${sent} of ${ok.length}. Try the rest again.`); }
  };
}
function bulkRefs(){
  const okEmail = x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x || "");
  const rows = bulkApps().flatMap(a => [1, 2, 3, 4].map(i => ({ a, i, r: get(a, `refs.r${i}`) || {} })).filter(({ a, i, r }) => String(r.name || "").trim() && !r.form && !(r.returned && !r.replace) && okEmail(r.email) && (!r.contacted || refNudge(a, i))));
  const sent = new Set();
  const M = openModal(`<h3>Email references</h3><p class="help">References who haven't answered and are due an email. Each gets their own private link, so it's one email each: click a button, then press Send in Mail.</p>
    <div class="ios">${rows.map((x, n) => `<div class="row"><span class="lbl">${esc(x.r.name)}<small>For ${esc(x.a.name)} · ${esc(x.r.email)}${x.r.contacted ? ` · emailed ${esc(fmtDate(x.r.contacted))}, no answer yet` : ""}</small></span><button class="btn small primary" type="button" data-bkr="${n}">${x.r.contacted ? "Send reminder" : "Open email"}</button></div>`).join("") || `<div class="row"><span class="lbl" style="color:var(--fg2)">Nobody here needs an email right now.</span></div>`}</div>
    <div class="acts"><button class="btn" type="button" data-x>Done</button></div>`);
  M.onclick = e => {
    if (e.target.closest("[data-x]")) { closeModal(); if (sent.size) bulkToggle(false); return; }
    const b = e.target.closest("[data-bkr]"); if (!b) return; const x = rows[+b.dataset.bkr];
    x.r.contacted ? remindRefLink(x.a._id, x.i) : emailRefLink(x.a._id, x.i);
    sent.add(+b.dataset.bkr); b.textContent = "Opened ✓"; b.classList.remove("primary");
  };
}

/* ---------- search everything (⌘K) ---------- */
// Only ever searches what this person's desk already loaded, so nobody can find anything they aren't allowed to see.
// License numbers and the rest of the online form are left out on purpose.
function searchAll(q){
  q = q.toLowerCase(); if (q.length < 3) return [];
  const snip = t => { const s = String(t), i = s.toLowerCase().indexOf(q), st = Math.max(0, i - 30); return (st ? "…" : "") + s.slice(st, st + 90); };
  const out = [];
  for (const a of S.apps.values()) {
    if (typeof a.notes === "string" && a.notes.toLowerCase().includes(q)) out.push({ label: `Notes: ${a.name || "Applicant"}`, sub: snip(a.notes), icon: "✎", at: lastTouched(a) || 0, open: () => { select(a._id); switchTab("notes"); } });
    const iv = a.iv || {}; for (const k of Object.keys(iv)) if (typeof iv[k] === "string" && iv[k].length > 3 && iv[k].toLowerCase().includes(q)) { out.push({ label: `Interview answer: ${a.name || "Applicant"}`, sub: snip(iv[k]), icon: "✓", at: lastTouched(a) || 0, open: () => { select(a._id); switchTab("iv"); } }); break; }
  }
  for (const m of S.msgs) if (S.apps.has(m.appId) && canSeeApp(m.appId) && String(m.text || "").toLowerCase().includes(q)) out.push({ label: `Message: ${S.apps.get(m.appId).name || "Applicant"}`, sub: snip(m.text), icon: "✉", at: m.at || 0, open: () => openChat("a:" + m.appId) });
  for (const [cid, ps] of C.posts) { const c = C.channels.get(cid); if (c) for (const p of ps) { const hay = [p.text, p.file?.name].filter(Boolean).join(" "); if (hay.toLowerCase().includes(q)) out.push({ label: `#${c.name}: ${p.name || "Squad"}`, sub: snip(hay), icon: "#", at: p.at || 0, open: () => openChat("c:" + cid) }); } }
  return out.sort((x, y) => y.at - x.at).slice(0, 8);
}

/* ---------- channel extras: reactions, files, pinned notes, who's online, who's typing ---------- */
const REACTIONS = ["👍", "❤️", "🎉", "✅"];
const postPreview = p => String(p.text || "").trim() || (p.file ? "📎 " + p.file.name : "");
async function toggleReact(cid, pid, emoji){
  const p = (C.posts.get(cid) || []).find(x => x.id === pid); if (!p) return;
  const r = clone(p.reactions || {}), who = r[emoji] || [];
  r[emoji] = who.includes(S.me) ? who.filter(x => x !== S.me) : [...who, S.me];
  try { await updateDoc(doc(db, "channels", cid, "posts", pid), { reactions: r }); } catch (e) { console.error(e); toast("Couldn't save that."); }
}
async function postFile(file){
  const k = parseKey(C.key); if (!k || k.kind !== "c" || !file) return;
  if (!(file.type === "application/pdf" || /^image\//.test(file.type))) return toast("Only PDFs and photos can be posted.");
  if (file.size > 15 * 1024 * 1024) return toast("That file is over 15 MB.");
  if (isConfidential(file.name)) return toast("That looks medical or Social Security. Use the secure upload on the applicant's file instead.");
  const ta = $("#cvText"), text = ta ? ta.value.trim() : "";
  try {
    toast("Uploading…");
    const path = `chat/${k.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
    await uploadBytes(ref(storage, path), file, { contentType: file.type });
    await addDoc(collection(db, "channels", k.id, "posts"), { text, by: S.me, name: S.name || S.me.split("@")[0], at: Date.now(), file: { name: file.name.slice(0, 200), path, size: file.size, type: file.type } });
    if (ta) ta.value = ""; toast("Posted.");
  } catch (e) { console.error(e); toast("Couldn't post that file. Try again."); }
}
async function openChatFile(cid, pid){
  const p = (C.posts.get(cid) || []).find(x => x.id === pid); if (!p?.file) return;
  const w = window.open("", "_blank");
  try { const url = await getDownloadURL(ref(storage, p.file.path)); if (w) w.location = url; else location.href = url; }
  catch { if (w) w.close(); toast("Couldn't open that file."); }
}
async function setPin(cid, text){
  try { await setDoc(doc(db, "channels", cid), { pin: text ? { text: String(text).slice(0, 500), by: S.me, at: Date.now() } : null }, { merge: true }); toast(text ? "Pinned" : "Unpinned"); }
  catch (e) { console.error(e); toast("Couldn't save the pin."); }
}
const ONLINE_MS = 150000, TYPING_MS = 6000;
const isOnline = e => e === S.me || Date.now() - ((C.presence || new Map()).get(e)?.at || 0) < ONLINE_MS;
function presenceBeat(){ if (document.visibilityState === "visible" && S.me) setDoc(doc(db, "presence", S.me), { at: Date.now(), typing: C.typing || "", typingAt: C.typingAt || 0 }, { merge: true }).catch(() => {}); }
function noteTyping(on){
  const key = on ? C.key : "", now = Date.now();
  if (on && C.typing === key && now - (C.typingAt || 0) < 3000) return;
  if (!on && !C.typing) return;
  C.typing = key; C.typingAt = now; presenceBeat();
}
function paintPresence(){
  if (!S.chatOn) return;
  const el = $("#cvTyping");
  if (el) { const who = [...(C.presence || new Map()).entries()].filter(([e, p]) => e !== S.me && p.typing === C.key && Date.now() - (p.typingAt || 0) < TYPING_MS).map(([e]) => first(memberName(e)));
    const t = who.length ? `${who.join(", ")} ${who.length === 1 ? "is" : "are"} typing…` : ""; if (el.textContent !== t) el.textContent = t; }
  document.querySelectorAll("#cvInfo [data-online]").forEach(d => d.classList.toggle("on", isOnline(d.dataset.online)));
}
function startPresence(){
  C.presence = new Map();
  presenceBeat(); setInterval(presenceBeat, 60000); document.addEventListener("visibilitychange", presenceBeat);
  onSnapshot(collection(db, "presence"), s => { C.presence = new Map(s.docs.map(d => [d.id, d.data()])); paintPresence(); }, () => {});
  setInterval(paintPresence, 2000);
}

/* ---------- orientation: one-on-one with the owner, and only once Sterling is complete and clear ---------- */
const sterlingClear = a => !!get(a, "bg.sterDone") && get(a, "bg.sterResult") === "clear";
const isClosedFile = a => isDeclined(a) || a.status === "withdrawn";
// Status is moved by hand: Applicant → (Sterling complete and clear) → New member, then Squad member when they finish.
const orientReady = a => get(a, "board.result") === "approved" && !isClosedFile(a) && sterlingClear(a) && !get(a, "onb.orientStarted");
const orientOpen = a => get(a, "board.result") === "approved" && !isClosedFile(a) && sterlingClear(a) && !!get(a, "onb.orientStarted");
const orientWaiting = a => get(a, "board.result") === "approved" && !isClosedFile(a) && !sterlingClear(a);
const orientCounts = a => { const its = onbItems(); return { total: its.length, done: its.filter(([k]) => get(a, `onb.items.${k}`)).length }; };
const orientAllDone = a => { const c = orientCounts(a); return c.total > 0 && c.done >= c.total; };
function orientDue(a){ const days = +S.settings.orientDays, st = get(a, "onb.orientStarted"); if (!days || !st) return ""; const d = new Date(st + "T12:00"); d.setDate(d.getDate() + days); return isoDay(d.getTime()); }
const orientDaysLeft = a => { const d = orientDue(a); return d ? Math.round((new Date(d + "T12:00") - new Date(today() + "T12:00")) / 864e5) : null; };
const orientSession = id => S.portal.get(id)?.orient || null;
const orientItemKey = () => (onbItems().find(([, l]) => /orientation/i.test(l)) || [])[0] || "";
// A new member can upload proof for every checklist item (whatever it's called in Settings), except the
// application itself and the signed orientation form, which stay with you. `req` = you asked for it (Request documents).
const NOT_CERT_RE = /^completed application|^orientation/i;
function orientPayload(a){
  if (!orientOpen(a)) return null;
  const c = orientCounts(a);
  return { start: get(a, "onb.orientStarted"), due: orientDue(a), done: c.done, total: c.total, items: onbItems().map(([key, label]) => ({ key, label, date: get(a, `onb.items.${key}`) || "", link: onbLink(key), cert: !NOT_CERT_RE.test(label), ...(get(a, `onb.requested.${key}`) && !get(a, `onb.items.${key}`) ? { req: true } : {}) })) };
}
function checkinDue(a){
  if (!orientOpen(a)) return null;
  const n = daysSince(get(a, "onb.orientStarted")), id = a._id;
  if (n >= 90) return S.checkins.has(`${id}:90`) ? null : "90";
  if (n >= 30) return S.checkins.has(`${id}:30`) ? null : "30";
  return null;
}
function watchOrientation(){
  if (S.admin || S.owner) {
    onSnapshot(collection(db, "orientSlots"), s => { S.oslots = new Map(s.docs.map(d => [d.id, { id: d.id, ...d.data() }])); S._oPaint?.(); S._boardPaint?.(); }, () => {});
    onSnapshot(collectionGroup(db, "checkins"), s => { S.checkins = new Map(s.docs.map(d => [`${d.ref.parent.parent.id}:${d.id}`, { n: d.id, appId: d.ref.parent.parent.id, ...d.data() }])); if (S.sel) syncDetail(); else renderOverview(); if (S.canEdit) syncAllPortals(); }, () => {});
    $("#orientBtn").hidden = false;
  }
  const q0 = S.admin || S.owner ? collection(db, "signoffs") : query(collection(db, "signoffs"), where("trainers", "array-contains", S.me));
  onSnapshot(q0, s => { S.signoffs = new Map(s.docs.map(d => [d.id, d.data()])); $("#trainBtn").hidden = ![...S.signoffs.values()].some(x => (x.trainers || []).includes(S.me)); S._trainPaint?.(); S._boardPaint?.(); if (S.sel) syncDetail(); paintMnav(); }, () => {});
  const q1 = S.owner ? collection(db, "library") : query(collection(db, "library"), where("roles", "array-contains", S.coord ? "admin" : S.role));
  onSnapshot(q1, s => { S.library = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((x, y) => (x.name || "").localeCompare(y.name || "")); S._libPaint?.(); }, () => {});
}
function orientToDo(){
  const out = []; if (!S.owner) return out;
  const td = today();
  for (const a of S.apps.values()) { if (isClosedFile(a)) continue;
    const id = a._id, push = (pri, text, sub, tab = "onb", act, btn) => out.push({ id, a, pri, text, sub, tab, act, btn, age: 0 });
    if (orientOpen(a) && orientAllDone(a) && !get(a, "onb.memberSince")) push(1, `${first(a.name) || a.name} finished orientation`, "Ready to become a squad member", "onb", "omember", "Make squad member");
    if (orientOpen(a)) {
      const s = orientSession(id), key = orientItemKey(), attended = key && get(a, `onb.items.${key}`);
      if (s && !attended) { const d = isoDay(s.start);
        if (d === td) push(0, `Orientation today with ${first(a.name) || a.name}`, slotTime(s.start) + (s.location ? " · " + s.location : ""), "onb", "oattend", "Mark attended");
        else if (d < td) push(1, `Did ${first(a.name) || a.name} attend orientation?`, "Was " + longDate(d), "onb", "oattend", "Mark attended"); }
      if (!s && !attended) push(3, `${first(a.name) || a.name} hasn't booked orientation`, "Sterling is complete. They can pick a time in their portal.", "onb", "obook", "Book");
      const left = orientDaysLeft(a); if (left !== null && left < 0 && !orientAllDone(a)) { const c = orientCounts(a); push(1, `${first(a.name) || a.name} is behind on orientation`, `${c.done} of ${c.total} done · was due ${longDate(orientDue(a))}`); }
    }
    for (const [cn, c] of S.checkins) if (c.appId === id && !get(a, `onb.checkinRead.${c.n}`)) push(c.rating <= 2 ? 0 : 2, `Read ${first(a.name) || a.name}'s ${c.n}-day check-in`, `Rated it ${c.rating} of 5`);
  }
  const certs = (S.feedFiles || []).filter(f => String(f.docKey || "").startsWith("onb:") && S.apps.has(f.appId) && !get(S.apps.get(f.appId), `onb.items.${f.docKey.slice(4)}`));
  for (const f of certs) { const a = S.apps.get(f.appId); out.push({ id: a._id, a, pri: 1, text: `Review ${first(a.name) || a.name}'s certificate`, sub: f.label || "", tab: "onb", age: 0 }); }
  return out;
}
const SHORT_ONB = [[/completed application/i, "Application"], [/driver/i, "License"], [/training records/i, "Training records"], [/beneficiary/i, "Insurance card"], [/physical|hep b|ppd/i, "Health records"], [/is-100/i, "IS-100 / 700"], [/blood/i, "Blood borne"], [/sop|constitution/i, "SOP form"], [/confidential/i, "Confidentiality"], [/equipment/i, "Equipment"], [/orientation/i, "Orientation form"]];
const shortOnb = l => (SHORT_ONB.find(([re]) => re.test(l)) || [])[1] || l;
/* the board: everyone in orientation against every requirement */
function openOrientBoard(){
  const cols = onbItems();
  const M = openModal(`<div class="or-head"><h3>Orientation</h3><small class="help" style="margin:0">Required before issuing equipment or running calls</small><span style="flex:1"></span>${S.canEdit ? `<button class="btn small" type="button" data-otimes>Orientation times</button>` : ""}</div>
    <p class="help">${S.canEdit ? "Click a box to mark it done today; click again to undo." : "View only."} You move people in by hand once Sterling is complete and clear.</p><div id="orBoard"></div>
    <div class="acts"><button class="btn" type="button" data-x>Close</button></div>`, true);
  M.classList.add("wide");
  const paint = () => { const el = $("#orBoard"); if (!el) return;
    const ready = [...S.apps.values()].filter(orientReady);
    const all = [...S.apps.values()], now = all.filter(a => orientOpen(a) && !orientAllDone(a)).sort((x, y) => (orientDaysLeft(x) ?? 9e9) - (orientDaysLeft(y) ?? 9e9)), wait = all.filter(orientWaiting), fin = all.filter(a => orientOpen(a) && orientAllDone(a));
    const dueChip = a => { const l = orientDaysLeft(a); return l === null ? "" : `<span class="or-due${l < 0 ? " late" : l <= 7 ? " soon" : ""}">${l < 0 ? `${-l}d late` : l === 0 ? "due today" : `${l}d left`}</span>`; };
    const row = a => { const s = orientSession(a._id), c = orientCounts(a);
      return `<tr><th scope="row"><button class="or-name" type="button" data-orfile="${esc(a._id)}">${esc(a.name || "Unnamed")}</button><small>${c.done} of ${c.total} ${dueChip(a)}</small>
          <small>${s ? esc(slotLong(s.start)) : "Not booked"}</small>
          <span class="or-acts">${S.canEdit ? `<button class="copy" type="button" data-obook="${esc(a._id)}">${s ? "Change" : "Book"}</button>` : ""}<button class="copy" type="button" data-orec="${esc(a._id)}">Record</button></span></th>
        ${cols.map(([k, l]) => { const d = get(a, `onb.items.${k}`); return `<td><button type="button" class="or-c${d ? " on" : ""}" ${S.canEdit ? "" : "disabled"} data-ocell="${esc(a._id)}" data-k="${esc(k)}" aria-pressed="${!!d}" title="${esc(l)}${d ? " · " + esc(fmtDate(d)) : ""}" aria-label="${esc(a.name || "")}: ${esc(l)}">${d ? "✓" : ""}</button></td>`; }).join("")}</tr>`; };
    el.innerHTML = (now.length ? `<div class="or-scroll"><table class="or-grid"><thead><tr><th>New member</th>${cols.map(([, l]) => `<th title="${esc(l)}"><span>${esc(shortOnb(l))}</span></th>`).join("")}</tr></thead><tbody>${now.map(row).join("")}</tbody></table></div>` : `<div class="oempty">Nobody is in orientation right now.</div>`)
      + (ready.length ? `<div class="group"><h3><span>Ready to move to orientation</span></h3><div class="ios">${ready.map(a => `<div class="row"><span class="lbl">${esc(a.name || "Unnamed")}<small>Sterling complete ${esc(fmtDate(get(a, "bg.sterDone")))}</small></span>${S.canEdit ? `<button class="btn small primary" type="button" data-omove="${esc(a._id)}">Move to orientation</button>` : ""}</div>`).join("")}</div></div>` : "")
      + (wait.length ? `<div class="group"><h3><span>Waiting on Sterling</span></h3><div class="ios">${wait.map(a => `<div class="row"><span class="lbl">${esc(a.name || "Unnamed")}<small>${get(a, "bg.sterDone") ? "Sterling needs review" : get(a, "bg.sterReq") ? "Requested " + esc(fmtDate(get(a, "bg.sterReq"))) : "Not requested yet"}</small></span></div>`).join("")}</div></div>` : "")
      + (fin.length ? `<div class="group"><h3><span>Finished</span></h3><div class="ios">${fin.map(a => `<div class="row"><span class="lbl">${esc(a.name || "Unnamed")}<small>${get(a, "onb.memberSince") ? "Squad member since " + esc(fmtDate(get(a, "onb.memberSince"))) : "Not a squad member yet"}</small></span>${S.canEdit && !get(a, "onb.memberSince") ? `<button class="btn small primary" type="button" data-omember="${esc(a._id)}">Make squad member</button>` : ""}<button class="btn small" type="button" data-orec="${esc(a._id)}">Print record</button></div>`).join("")}</div></div>` : ""); };
  paint(); S._boardPaint = paint; M._cleanup = () => { S._boardPaint = null; M.classList.remove("wide"); };
  M.onclick = e => { const t = e.target;
    if (t.closest("[data-x]")) return closeModal();
    if (t.closest("[data-otimes]")) { closeModal(); return setTimeout(openOrientTimes, 60); }
    const f = t.closest("[data-orfile]"); if (f) { closeModal(); select(f.dataset.orfile); switchTab("onb"); return; }
    const b = t.closest("[data-obook]"); if (b) { closeModal(); return setTimeout(() => openOrientBook(b.dataset.obook), 60); }
    const r = t.closest("[data-orec]"); if (r) { closeModal(); return printOrientRecord(r.dataset.orec); }
    const mv = t.closest("[data-omove]"); if (mv) { closeModal(); return setTimeout(() => openMoveToOrientation(mv.dataset.omove), 60); }
    const mm = t.closest("[data-omember]"); if (mm) { closeModal(); return setTimeout(() => openMakeMember(mm.dataset.omember), 60); }
    const c = t.closest("[data-ocell]"); if (c) { const a = S.apps.get(c.dataset.ocell), p = `onb.items.${c.dataset.k}`; edit(a._id, p, get(a, p) ? "" : today()); setTimeout(paint, 60); }
  };
}
function openOrientTimes(){
  if (!S.canEdit) return ownerOnlyToast();
  const d0 = new Date(Date.now() + 3 * 864e5), dStr = isoDay(d0.getTime());
  const M = openModal(`<h3>Orientation times</h3><p class="help">When you're free to bring someone in. New members can book any open time at least 24 hours out, once Sterling is complete.</p>
    <form id="oForm" class="ios" style="padding:14px"><div class="addslot">
      <div class="field"><label for="oDate">Date</label><input id="oDate" type="date" value="${dStr}" required></div>
      <div class="field"><label for="oTime">First start time</label><input id="oTime" type="time" value="18:00" required></div>
      <div class="field"><label for="oDur">Length</label><select id="oDur"><option>30</option><option>45</option><option selected>60</option><option>90</option><option>120</option></select></div>
      <div class="field"><label for="oCount">Back-to-back times</label><select id="oCount">${[1, 2, 3, 4].map(n => `<option>${n}</option>`).join("")}</select></div>
      <div class="field full"><label for="oLoc">Location</label><input id="oLoc" type="text" placeholder="PVRS building" value="${esc(S.settings.defaultLocation || "")}"></div>
      <div class="full" style="display:flex;justify-content:flex-end"><button class="btn primary" type="submit">Add times</button></div></div></form><div id="oList"></div>
    <div class="acts"><button class="btn" type="button" id="oIcs">Add booked orientations to Calendar</button><button class="btn" type="button" data-x>Done</button></div>`, true);
  const paint = () => { const el = $("#oList"); if (!el) return;
    const up = [...S.oslots.values()].filter(s => s.start > Date.now() - 864e5).sort((x, y) => x.start - y.start);
    el.innerHTML = up.length ? `<div class="ios slotlist">${up.map(s => `<div class="row"><span class="lbl"><span class="when">${esc(slotLong(s.start))}</span><small>${esc([s.duration ? s.duration + " min" : "", s.location].filter(Boolean).join(" · "))}</small></span>
      ${s.bookedBy ? `<span class="badge ok">${esc(S.apps.get(s.bookedBy)?.name || "New member")}</span><button class="btn small" type="button" data-orel="${esc(s.id)}">Release</button>` : `<span class="badge wait">Open</span><button class="btn small danger" type="button" data-odel="${esc(s.id)}">Delete</button>`}</div>`).join("")}</div>` : `<p class="help">No orientation times yet.</p>`; };
  paint(); S._oPaint = paint; M._cleanup = () => { S._oPaint = null; };
  $("#oForm").onsubmit = async e => { e.preventDefault();
    const [y, mo, d] = $("#oDate").value.split("-").map(Number), [h, mi] = $("#oTime").value.split(":").map(Number); if (!y || isNaN(h)) return toast("Pick a date and time.");
    const dur = +$("#oDur").value, n = +$("#oCount").value, where = $("#oLoc").value.trim();
    try { for (let i = 0; i < n; i++) await addDoc(collection(db, "orientSlots"), { start: new Date(y, mo - 1, d, h, mi + i * dur).getTime(), duration: dur, location: where, bookedBy: null, createdAt: Date.now() }); toast(`Added ${n} time${n > 1 ? "s" : ""}`); }
    catch (err) { console.error(err); toast("Couldn't add those times."); } };
  M.onclick = async e => { const t = e.target;
    if (t.closest("[data-x]")) return closeModal();
    if (t.id === "oIcs") { const ev = [...S.oslots.values()].filter(s => s.bookedBy && s.start > Date.now() - 864e5 && S.apps.has(s.bookedBy)).map(s => ({ ...icsEvent(S.apps.get(s.bookedBy), s), uid: "or-" + s.id, title: `PVRS orientation: ${S.apps.get(s.bookedBy).name || "New member"}` }));
      if (!ev.length) return toast("No booked orientations to add."); download(`PVRS-orientation-${today()}.ics`, icsFile(ev), "text/calendar"); return toast("Calendar file downloaded. Open it to add them."); }
    const del = t.closest("[data-odel]"); if (del) { try { await deleteDoc(doc(db, "orientSlots", del.dataset.odel)); } catch { toast("Couldn't delete that time."); } return; }
    const rel = t.closest("[data-orel]"); if (rel) { try { await releaseOrient(S.oslots.get(rel.dataset.orel).bookedBy); toast("Time released"); } catch (err) { console.error(err); toast("Couldn't release that time."); } }
  };
}
async function releaseOrient(id){
  const s = orientSession(id); if (!s) return;
  const b = writeBatch(db); b.update(doc(db, "orientSlots", s.slotId), { bookedBy: null }); b.set(doc(db, "portal", id), { orient: null }, { merge: true }); await b.commit();
}
function openOrientBook(id){
  const a = S.apps.get(id); if (!S.canEdit || !a) return;
  if (!orientOpen(a)) return toast("Move them to orientation first. That needs Sterling complete and clear.");
  if (!get(a, "portal.invited")) return toast("Welcome them to the portal first.");
  const cur = orientSession(id), open = [...S.oslots.values()].filter(s => !s.bookedBy && s.start > Date.now()).sort((x, y) => x.start - y.start);
  const M = openModal(`<h3>Orientation for ${esc(a.name || "this new member")}</h3>${cur ? `<p class="help">Booked for <b>${esc(slotLong(cur.start))}</b>. Pick another time to move it.</p>` : `<p class="help">Booking here works even inside 24 hours.</p>`}
    ${open.length ? `<div class="ios slotlist">${open.map(s => `<div class="row"><span class="lbl"><span class="when">${esc(slotLong(s.start))}</span><small>${esc([s.duration ? s.duration + " min" : "", s.location].filter(Boolean).join(" · "))}</small></span><button class="btn small primary" type="button" data-opick="${esc(s.id)}">Book</button></div>`).join("")}</div>` : `<p class="help">No open times. Add some under <b>Orientation times</b>.</p>`}
    <div class="acts">${cur ? `<button class="btn danger" type="button" id="oRel">Release this time</button>` : ""}<span style="flex:1"></span><button class="btn" type="button" id="oTimes">Orientation times</button><button class="btn" type="button" data-x>Close</button></div>`, true);
  M.onclick = async e => { const t = e.target;
    if (t.closest("[data-x]")) return closeModal();
    if (t.id === "oTimes") { closeModal(); return setTimeout(openOrientTimes, 60); }
    if (t.id === "oRel") { try { await releaseOrient(id); closeModal(); toast("Time released"); } catch { toast("Couldn't release that time."); } return; }
    const p = t.closest("[data-opick]"); if (!p) return; const s = S.oslots.get(p.dataset.opick);
    try { const b = writeBatch(db); if (cur && cur.slotId !== s.id) b.update(doc(db, "orientSlots", cur.slotId), { bookedBy: null }); b.update(doc(db, "orientSlots", s.id), { bookedBy: id });
      b.set(doc(db, "portal", id), { orient: { slotId: s.id, start: s.start, duration: s.duration || null, location: s.location || "", bookedAt: Date.now() } }, { merge: true }); await b.commit(); closeModal(); toast(`Booked ${slotLong(s.start)}`); }
    catch (err) { console.error(err); toast("Couldn't book that time. It may have just been taken."); } };
}
// Applicant → New member. Only possible once the board approved and Sterling is complete and clear (Dkota's rule).
function openMoveToOrientation(id){
  const a = S.apps.get(id); if (!S.canEdit || !a) return ownerOnlyToast();
  if (!orientReady(a)) return toast(sterlingClear(a) ? "They're not ready to move." : "Orientation stays locked until Sterling is complete and clear.");
  const M = openModal(`<h3>Move ${esc(first(a.name) || "them")} to orientation?</h3>
    <p class="help">Sterling is complete and clear. Their next sign-in shows only the orientation dashboard: checklist, booking a time with you, documents and messages. The application pages go away for them. Nothing in their file changes.</p>
    <div class="field"><label for="mvEmail">Sign-in email</label><input id="mvEmail" type="email" value="${esc(a.email || "")}"><p class="help">Change this if they should now sign in with a different address, like a PVRS one. They'd need to use the new address from then on.</p></div>
    <label class="row" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="mvMail" checked style="width:auto"> Also open an email telling them</label>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="mvGo">Move to orientation</button></div>`);
  M.onclick = async e => { if (e.target.closest("[data-x]")) return closeModal(); const go = e.target.closest("#mvGo"); if (!go) return;
    const email = lower($("#mvEmail").value.trim()), mail = $("#mvMail").checked;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Enter a valid email address.");
    go.disabled = true;
    try {
      if (email !== lower(a.email)) edit(id, "email", email);
      edit(id, "onb.orientStarted", today());
      const appKey = (onbItems().find(([, l]) => /^completed application/i.test(l)) || [])[0];   // already known from their file
      if (appKey && get(a, "app.complete") === "yes" && !get(a, `onb.items.${appKey}`)) edit(id, `onb.items.${appKey}`, get(a, "app.received") || today());
      if (!get(a, "portal.invited")) await inviteToPortal(id, false);
      await addDoc(collection(db, "portal", id, "messages"), { text: `Hi ${first(a.name) || "there"}, your background check is complete, so you're moving on to orientation! Your dashboard now has your checklist. Please pick a time to come in and meet with me.`, from: "staff", by: S.me, name: first(S.name) || "PVRS", at: Date.now() });
      closeModal(); toast(`${first(a.name) || "They"} moved to orientation.`);
      if (mail) { const l = document.createElement("a"); l.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("PVRS orientation: you're cleared to start")}&body=${encodeURIComponent(`Hi ${first(a.name) || "there"},\n\nYour background check is complete, so you're moving on to orientation.\n\nSign in at ${location.origin}/signin with ${email} to see your checklist and pick a time to come in. The sign-in email often lands in spam or junk, so check there if you don't see it.\n\nThank you,\n${sig()}`)}`; l.click(); }
    } catch (err) { console.error(err); go.disabled = false; toast("Couldn't finish that. Try again."); } };
}
// Checklist items the new member can still send in (not dated yet, and not the application / orientation form).
const orientDocItems = a => onbItems().filter(([k, l]) => !NOT_CERT_RE.test(l) && !get(a, `onb.items.${k}`));
// Onboard tab → Request documents: marks the picked checklist items as requested (they're highlighted in the new
// member's dashboard with an Upload button), adds anything extra as a normal document request, and opens the email.
function openOrientDocs(id){
  const a = S.apps.get(id); if (!S.canEdit || !a) return ownerOnlyToast();
  if (!orientOpen(a)) return toast("Move them to orientation first.");
  const items = orientDocItems(a), picked = new Set(items.map(([k]) => k)), custom = [];
  const M = openModal(`<h3>Request orientation documents</h3><p class="help">${esc(first(a.name) || "They")} will see these marked <b>Requested</b> on the orientation dashboard, each with an Upload button. Tap any you don't need right now.</p>
    <div class="chips" style="flex-wrap:wrap" id="odChips">${items.map(([k, l]) => `<button class="chip" type="button" data-k="${esc(k)}" aria-pressed="true">${esc(l)}${isConfidential(l) ? " 🔒" : ""}</button>`).join("") || `<span class="help">Every checklist item is already done.</span>`}</div>
    <p class="help">🔒 Medical and Social Security items go through secure document upload to ${esc(PAPERWORK_EMAIL)}. You'll see that they arrived, not what's in them.</p>
    <div class="ios"><div class="row"><input id="odCustom" class="inlinefield" type="text" placeholder="Something else…" aria-label="Another document" style="flex:1"><button class="btn small" type="button" id="odAdd">Add</button></div><div id="odCustomList"></div></div>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="odSave">Request</button></div>`, true);
  const paintCustom = () => { $("#odCustomList").innerHTML = custom.map((c, i) => `<div class="row"><span class="lbl">${esc(c)}</span><button class="copy" type="button" data-rmc="${i}">Remove</button></div>`).join(""); };
  const addCustom = () => { const v = $("#odCustom").value.trim(); if (!v) return; custom.push(v); $("#odCustom").value = ""; paintCustom(); };
  $("#odCustom").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } });
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const c = e.target.closest("[data-k]"); if (c) { const k = c.dataset.k; picked.has(k) ? picked.delete(k) : picked.add(k); c.setAttribute("aria-pressed", picked.has(k)); return; }
    if (e.target.id === "odAdd") return addCustom();
    const rm = e.target.closest("[data-rmc]"); if (rm) { custom.splice(+rm.dataset.rmc, 1); paintCustom(); return; }
    if (e.target.id !== "odSave") return;
    if ($("#odCustom").value.trim()) addCustom();
    const asked = items.filter(([k]) => picked.has(k));
    if (!asked.length && !custom.length) return toast("Pick or type at least one document.");
    const now = Date.now();
    asked.forEach(([k]) => edit(id, `onb.requested.${k}`, today()));
    custom.forEach((label, i) => edit(id, `docs.requested.d${now}${i}`, { label, requestedAt: now + i, received: "" }));
    closeModal(); flushAll();
    if (a.email && !get(a, "portal.invited")) await inviteToPortal(id, false); else schedulePortal(id, 300);
    openEmail("orientdocs", [...asked.map(([, l]) => l), ...custom], id);
  };
}
function moveBackToApplicant(id){ const a = S.apps.get(id); if (!S.canEdit || !a) return; edit(id, "onb.orientStarted", ""); toast(`${first(a.name) || "They"} moved back to the applicant view.`); }
// New member → Squad member: gives them a Member account, so their next sign-in opens the desk (Messages) instead of the dashboard.
function openMakeMember(id){
  const a = S.apps.get(id); if (!S.canEdit || !a) return ownerOnlyToast();
  const c = orientCounts(a), email = lower(a.email);
  if (!email) return toast("Add their email first.");
  const M = openModal(`<h3>Make ${esc(first(a.name) || "them")} a squad member?</h3>
    ${orientAllDone(a) ? `<p class="help">Orientation is complete.</p>` : `<p class="help"><b>Orientation isn't finished: ${c.done} of ${c.total} done.</b> These are required before issuing equipment or running calls. You can still go ahead.</p>`}
    <p class="help">${esc(email)} becomes a <b>Member</b>: their next sign-in opens the desk with Messages instead of the orientation dashboard. You can change their role in Settings → Team.</p>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="mmGo">Make squad member</button></div>`);
  M.onclick = async e => { if (e.target.closest("[data-x]")) return closeModal(); if (!e.target.closest("#mmGo")) return;
    try { const cur = S.staff.get(email); if (!cur) await setDoc(doc(db, "staff", email), { role: "member", name: a.name || "", addedAt: Date.now(), addedBy: S.me }); edit(id, "onb.memberSince", today()); closeModal(); toast(`${first(a.name) || "They"} ${a.name ? "is" : "are"} now a squad member.`); }
    catch (err) { console.error(err); toast("Couldn't save. Try again."); } };
}
function markAttended(id){
  const a = S.apps.get(id), key = orientItemKey(), s = orientSession(id); if (!a) return;
  if (!key) return toast("Add an item with \"orientation\" in its name to the checklist in Settings first.");
  edit(id, `onb.items.${key}`, s ? isoDay(Math.min(s.start, Date.now())) : today()); toast(`${first(a.name) || a.name}'s orientation is marked attended.`);
}
function printOrientRecord(id){
  const a = S.apps.get(id); if (!a) return;
  const so = S.signoffs.get(id), s = orientSession(id), row = (k, v) => `<tr><th>${esc(k)}</th><td>${esc(v || "—")}</td></tr>`;
  printHTML(`<section class="pk"><header><img src="/img/logo.png" alt=""><div><div class="pk-k">Orientation record</div><h1>${esc(a.name || "New member")}</h1>
      <div class="pk-s">${esc([a.type ? a.type + " membership" : "", get(a, "board.date") ? "Board approved " + longDate(get(a, "board.date")) : "", get(a, "bg.sterDone") ? "Sterling complete " + longDate(get(a, "bg.sterDone")) : ""].filter(Boolean).join(" · "))}</div></div></header>
    <h2>Orientation</h2><table>${row("Session", s ? slotLong(s.start) : "")}${row("Mentor", get(a, "onb.mentor"))}${row("EMT card number", get(a, "onb.emtCard"))}${row("EMT card expires", get(a, "onb.emtExpires") ? fmtDate(get(a, "onb.emtExpires")) : "")}</table>
    <h2>Mandatory information, required before issuing any equipment and/or the ability to run calls</h2><table>${onbItems().map(([k, l]) => row(l, get(a, `onb.items.${k}`) ? fmtDate(get(a, `onb.items.${k}`)) : "")).join("")}</table>
    ${so ? `<h2>Trainer sign-offs</h2><table>${(so.items || []).map(i => { const d = (so.done || {})[i.key]; return row(i.label, d ? `${d.name || d.by} · ${new Date(d.at).toLocaleDateString()}` : ""); }).join("")}</table>` : ""}
    <h2>Sign-off</h2><table class="vote"><tr><th>Orientation chair</th><td></td><th>Date</th><td></td></tr><tr><th>New member</th><td></td><th>Date</th><td></td></tr></table>
    <footer>Potsdam Volunteer Rescue Squad · Printed ${esc(new Date().toLocaleDateString())}</footer></section>`);
}
/* Onboard tab */
function renderOrientTab(a){
  const el = $("#orientBox"); if (!el) return; const id = a._id;
  if (orientReady(a)) { el.innerHTML = `<div class="row"><span class="lbl">Status: Applicant<small>Sterling is complete and clear, so they're ready for orientation.</small></span>${S.canEdit ? `<button class="btn small primary" type="button" data-oact="move">Move to orientation</button>` : ""}</div>`; }
  else if (!orientOpen(a)) { el.innerHTML = `<div class="row"><span class="lbl" style="color:var(--fg2)">Locked until Sterling is complete and clear.<small>${get(a, "bg.sterDone") ? (get(a, "bg.sterResult") ? "Sterling is marked Needs review." : "Enter the Sterling result above.") : get(a, "bg.sterReq") ? "Requested " + esc(fmtDate(get(a, "bg.sterReq"))) + "." : "Not requested yet."}</small></span></div>`; }
  else { const s = orientSession(id), c = orientCounts(a), l = orientDaysLeft(a), key = orientItemKey(), att = key && get(a, `onb.items.${key}`);
    el.innerHTML = `<div class="row"><span class="lbl">Status: ${get(a, "onb.memberSince") ? "Squad member" : "New member"}<small>In orientation since ${esc(fmtDate(get(a, "onb.orientStarted")))}${get(a, "onb.memberSince") ? " · member since " + esc(fmtDate(get(a, "onb.memberSince"))) : ""}</small></span>
        ${S.canEdit && !get(a, "onb.memberSince") ? `<button class="copy" type="button" data-oact="back">Move back</button><button class="btn small" type="button" data-oact="member">Make squad member</button>` : ""}</div>
      <div class="row"><span class="lbl">One-on-one session<small>${s ? esc(slotLong(s.start)) + (s.location ? " · " + esc(s.location) : "") : "Not booked yet"}${att ? " · attended " + esc(fmtDate(att)) : ""}</small></span>
        ${S.canEdit ? `<button class="btn small" type="button" data-oact="book">${s ? "Change" : "Book"}</button>${att ? "" : `<button class="btn small primary" type="button" data-oact="attend">Mark attended</button>`}` : ""}</div>
      <div class="row"><span class="lbl">Progress<small>${c.done} of ${c.total} done${l === null ? "" : l < 0 ? ` · ${-l} days late` : ` · due ${esc(longDate(orientDue(a)))}`}</small></span><button class="btn small" type="button" data-oact="record">Print record</button></div>`; }
  renderOrientDocs(a);
  const sb = $("#trainBox"); if (sb) { const so = S.signoffs.get(id);
    sb.innerHTML = so ? `<div class="row"><span class="lbl">Trainers<small>${esc((so.trainers || []).map(e => memberName(e)).join(", ") || "None")}</small></span></div>` + (so.items || []).map(i => { const d = (so.done || {})[i.key]; return `<div class="row"><span class="lbl">${esc(i.label)}<small>${d ? `Signed off by ${esc(d.name || d.by)} · ${esc(new Date(d.at).toLocaleDateString())}` : "Not signed off yet"}</small></span>${d ? `<span class="badge ok">Done</span>` : ""}</div>`; }).join("")
      : `<div class="row"><span class="lbl" style="color:var(--fg2)">No trainer yet. A trainer signs off skills and first shifts from their own phone and sees nothing else on this file.</span></div>`; }
  const cb = $("#checkinBox"); if (cb) { const list = [...S.checkins.values()].filter(c => c.appId === id).sort((x, y) => +x.n - +y.n);
    cb.innerHTML = list.map(c => `<div class="row stack"><span class="lbl">${esc(c.n)}-day check-in · rated it ${esc(c.rating)} of 5<small>${esc(new Date(c.at).toLocaleDateString())}</small></span><p class="cv-note"><b>How it's going:</b> ${esc(c.going || "—")}<br><b>What would help:</b> ${esc(c.help || "—")}</p>${S.canEdit && !get(a, `onb.checkinRead.${c.n}`) ? `<div><button class="btn small" type="button" data-oread="${esc(c.n)}">Mark read</button></div>` : ""}</div>`).join("") || `<div class="row"><span class="lbl" style="color:var(--fg2)">New members are asked how it's going 30 and 90 days after moving to orientation. Answers show here.</span></div>`; }
}
// Onboard tab → Orientation documents: one line per checklist document, with what the new member sent, what you
// uploaded for them, and an Upload button. Kept apart from the application's Documents and Squad records.
const OR_LABEL = "Orientation: ", orLabel = l => OR_LABEL + l, isOrRec = r => String(r.label || "").startsWith(OR_LABEL);
function renderOrientDocs(a){
  const g = $("#orDocsGroup"), el = $("#orDocs"); if (!g || !el) return;
  g.hidden = !orientOpen(a); if (g.hidden) return;
  const day = ms => new Date(ms).toLocaleDateString();
  const fileRow = (f, mine) => f.confidential ? `<span class="orfile">🔒 Secure document · ${esc(day(f.uploadedAt))} · sent to ${esc(PAPERWORK_EMAIL)}</span>`
    : `<span class="orfile"><button class="filelink" type="button" ${mine ? `data-rec="${esc(f.id)}"` : `data-file="${esc(f.id)}"`}>${esc(f.name)}</button> · ${mine ? "you" : esc(first(a.name))} · ${esc(day(f.uploadedAt))}</span>`;
  const row = (key, label) => { const done = key && get(a, `onb.items.${key}`), asked = key && get(a, `onb.requested.${key}`);
    const theirs = key ? (S.files || []).filter(f => f.docKey === "onb:" + key) : [], mine = S.records.filter(r => r.label === orLabel(label));
    const state = done ? `<span class="badge ok">Done ${esc(fmtDate(done))}</span>` : theirs.length ? `<span class="badge wait">Needs your OK</span>` : asked ? `<span class="badge wait">Requested</span>` : "";
    return `<div class="row ordoc"><span class="lbl">${esc(label)}${isConfidential(label) ? " 🔒" : ""}<small>${theirs.length + mine.length ? "" : key ? (asked ? `Asked ${esc(fmtDate(asked))}, nothing in yet` : "Nothing in yet") : "Anything else for their orientation file"}</small>${[...theirs.map(f => fileRow(f, false)), ...mine.map(f => fileRow(f, true))].join("")}</span>
      ${state}${S.canEdit && key && !done && theirs.length ? `<button class="btn small primary" type="button" data-oapprove="${esc(key)}">Approve</button>` : ""}
      ${S.canEdit ? `<button class="btn small" type="button" data-orup="${esc(key)}" data-orlabel="${esc(label)}">Upload</button>` : ""}</div>`; };
  el.innerHTML = `<div class="note">${S.canEdit ? "Upload a scan or photo for any line and it's checked off. What the new member sends from their dashboard shows here too." : "What the new member and the orientation chair have sent in."} 🔒 lines go only to ${esc(PAPERWORK_EMAIL)}.</div>`
    + onbItems().filter(([, l]) => !NOT_CERT_RE.test(l)).map(([k, l]) => row(k, l)).join("") + row("", "Other orientation paperwork");
}
// One file into an applicant's staff records (or the vault when the label is medical / Social Security).
const REC_EXT = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp", gif: "image/gif" };
async function uploadRecord(id, f, label){
  const a = S.apps.get(id), type = f.type || REC_EXT[String(f.name || "").split(".").pop().toLowerCase()] || "";
  if (!(type === "application/pdf" || /^image\//.test(type))) throw new Error("type");
  if (f.size > RECORD_MAX) throw new Error("size");
  const safe = `${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
  if (isConfidential(label)) {
    const path = `confidential/${id}/${safe}`;
    await uploadBytes(ref(storage, path), f, { contentType: type });
    await addDoc(collection(db, "vault"), { appId: id, appName: a.name || "", label, name: f.name, path, size: f.size, contentType: type, uploadedAt: Date.now(), uploadedBy: S.me, from: "staff" });
    await addDoc(collection(db, "applicants", id, "records"), { name: "Private document", label, path: "", size: f.size, contentType: type, uploadedAt: Date.now(), uploadedBy: S.me, confidential: true });
  } else {
    const path = `records/${id}/${safe}`;
    await uploadBytes(ref(storage, path), f, { contentType: type });
    await addDoc(collection(db, "applicants", id, "records"), { name: f.name, label, path, size: f.size, contentType: type, uploadedAt: Date.now(), uploadedBy: S.me });
  }
}
let orPicker = null;
function pickOrientDoc(id, key, label){
  if (!S.canEdit) return ownerOnlyToast();
  if (!orPicker) { orPicker = document.createElement("input"); orPicker.type = "file"; orPicker.id = "orPicker"; orPicker.accept = "application/pdf,image/*"; orPicker.multiple = true; orPicker.hidden = true; document.body.appendChild(orPicker); }
  orPicker.onchange = async () => { const list = [...orPicker.files]; orPicker.value = ""; let n = 0;
    for (const f of list) { toast(`Uploading ${f.name}…`);
      try { await uploadRecord(id, f, orLabel(label)); n++; }
      catch (e) { console.error(e); toast(e.message === "type" ? `${f.name} isn't a PDF or photo.` : e.message === "size" ? `${f.name} is over 25 MB.` : `Couldn't upload ${f.name}. Try again.`); } }
    if (!n) return;
    if (key && !get(S.apps.get(id), `onb.items.${key}`)) edit(id, `onb.items.${key}`, today());
    toast(key ? `Uploaded and checked off: ${label}` : `Uploaded ${n} file${n === 1 ? "" : "s"}`); };
  orPicker.click();
}
function openTrainers(id){
  if (!S.canEdit) return ownerOnlyToast();
  const a = S.apps.get(id), so = S.signoffs.get(id) || {}, cur = so.trainers || [];
  const team = [...S.staff.entries()].sort((x, y) => (x[1].name || x[0]).localeCompare(y[1].name || y[0]));
  const M = openModal(`<h3>Trainers for ${esc(first(a.name) || "this new member")}</h3><p class="help">They see only this person's name and sign-off list, nothing else on the file. Any role can be a trainer.</p>
    <div class="ios cv-pick">${team.map(([e, s]) => `<label class="row"><input type="checkbox" value="${esc(e)}"${cur.includes(e) ? " checked" : ""}><span class="lbl">${esc(s.name || e)}<small>${esc(e)} · ${roleLabel(s.role)}</small></span></label>`).join("") || `<div class="row"><span class="lbl" style="color:var(--fg2)">No team members yet.</span></div>`}</div>
    <div class="acts"><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="trSave">Save</button></div>`);
  M.onclick = async e => { if (e.target.closest("[data-x]")) return closeModal(); if (!e.target.closest("#trSave")) return;
    const trainers = [...M.querySelectorAll(".cv-pick input:checked")].map(i => i.value);
    try { await setDoc(doc(db, "signoffs", id), { name: a.name || "", trainers, items: so.items || skillItems().map(([key, label]) => ({ key, label })), done: so.done || {}, updatedAt: Date.now() }); closeModal(); toast("Saved"); }
    catch (err) { console.error(err); toast("Couldn't save."); } };
}
function openSignoffs(){
  const M = openModal(`<h3>Sign-offs</h3><p class="help">New members you're training. Sign off each item when they've shown you they can do it.</p><div id="trList"></div><div class="acts"><button class="btn" type="button" data-x>Done</button></div>`, true);
  const paint = () => { const el = $("#trList"); if (!el) return; const mine = [...S.signoffs.entries()].filter(([, x]) => (x.trainers || []).includes(S.me));
    el.innerHTML = mine.map(([id, x]) => `<div class="group"><h3><span>${esc(x.name || "New member")}</span></h3><div class="ios">${(x.items || []).map(i => { const d = (x.done || {})[i.key];
      return `<div class="row"><span class="lbl">${esc(i.label)}<small>${d ? `${esc(d.name || d.by)} · ${esc(new Date(d.at).toLocaleDateString())}` : "Not signed off yet"}</small></span>${d ? (d.by === S.me ? `<button class="btn small" type="button" data-tr="${esc(id)}" data-k="${esc(i.key)}">Undo</button>` : `<span class="badge ok">Done</span>`) : `<button class="btn small primary" type="button" data-tr="${esc(id)}" data-k="${esc(i.key)}">Sign off</button>`}</div>`; }).join("")}</div></div>`).join("") || `<p class="help">Nobody assigned to you right now.</p>`; };
  paint(); S._trainPaint = paint; M._cleanup = () => { S._trainPaint = null; };
  M.onclick = async e => { if (e.target.closest("[data-x]")) return closeModal(); const b = e.target.closest("[data-tr]"); if (!b) return;
    const x = S.signoffs.get(b.dataset.tr), done = { ...(x.done || {}) }, k = b.dataset.k;
    if (done[k]) delete done[k]; else done[k] = { by: S.me, name: first(S.name) || S.me.split("@")[0], at: Date.now() };
    try { await updateDoc(doc(db, "signoffs", b.dataset.tr), { done, updatedAt: Date.now() }); x.done = done; paint(); } catch (err) { console.error(err); toast("Couldn't save that."); } };
}
function handoffMail(id, who){
  const a = S.apps.get(id); if (!a) return;
  const to = (who === "chief" ? S.settings.chiefEmail : S.settings.techEmail) || "", path = who === "chief" ? "notify.chief" : "notify.tech";
  const subject = who === "chief" ? `New member for duty crew: ${a.name}` : `PVRS email account for ${a.name}`;
  const lines = who === "chief" ? `${a.name} has been approved by the board and cleared Sterling, and is ready to be added to duty crew.` : `${a.name} has been approved by the board and cleared Sterling. Please set up a PVRS email account.`;
  const body = `${lines}\n\nName: ${a.name}\nPhone: ${a.phone || "—"}\nEmail: ${a.email || "—"}\nMembership type: ${a.type || "—"}\n\nThank you,\n${sig()}`;
  const l = document.createElement("a"); l.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; l.click();
  edit(id, path, today()); toast(to ? "Email opened in Mail." : "Email opened. Add their address in Settings → Emails to fill it in next time.");
}
/* squad documents */
function openLibrary(){
  const ROLES = [["admin", "Admins"], ["interviewer", "Interviewers"], ["member", "Members"]];
  const M = openModal(`<h3>Documents</h3><p class="help">Squad handbook, policies and forms.${S.canEdit ? " Choose who sees each one. Nothing medical or Social Security." : ""}</p>
    ${S.canEdit ? `<div class="ios" style="padding:12px"><div class="field"><label>Who can see it</label><div class="cv-rolepick">${ROLES.map(([v, l]) => `<label><input type="checkbox" value="${v}" checked> ${l}</label>`).join("")}<label><input type="checkbox" id="libNew" checked> New members in orientation</label></div></div>
      <label class="dropzone" for="libFile"><input type="file" id="libFile" accept="application/pdf,image/*" hidden><b>Add a document</b><span>PDF or photo, up to 25 MB</span></label></div>` : ""}
    <div id="libList" class="ios" style="margin-top:10px"></div><div class="acts"><button class="btn" type="button" data-x>Done</button></div>`, true);
  const paint = () => { const el = $("#libList"); if (!el) return;
    el.innerHTML = (S.library || []).map(d => `<div class="row"><span class="lbl">${esc(d.name)}<small>${S.canEdit ? esc([...(d.roles || []).map(r => roleLabel(r)), d.newMembers ? "New members" : ""].filter(Boolean).join(", ") || "Only you") : esc(new Date(d.uploadedAt).toLocaleDateString())}</small></span><button class="btn small" type="button" data-libopen="${esc(d.id)}">Open</button>${S.canEdit ? `<button class="copy" type="button" data-libdel="${esc(d.id)}">Remove</button>` : ""}</div>`).join("") || `<div class="row"><span class="lbl" style="color:var(--fg2)">No documents yet.</span></div>`; };
  paint(); S._libPaint = paint; M._cleanup = () => { S._libPaint = null; };
  $("#libFile")?.addEventListener("change", async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (!(f.type === "application/pdf" || /^image\//.test(f.type))) return toast("Only PDFs and photos.");
    if (f.size > 25 * 1024 * 1024) return toast("That file is over 25 MB.");
    if (isConfidential(f.name)) return toast("That looks medical or Social Security, so it can't go in Documents.");
    const roles = [...M.querySelectorAll('.cv-rolepick input[value]')].filter(i => i.checked).map(i => i.value), newMembers = !!$("#libNew")?.checked;
    try { const id = doc(collection(db, "library")).id, path = `library/${id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
      await setDoc(doc(db, "library", id), { name: f.name.slice(0, 200), path, size: f.size, type: f.type, roles, newMembers, uploadedAt: Date.now(), uploadedBy: S.me });
      await uploadBytes(ref(storage, path), f, { contentType: f.type }); toast("Added."); }
    catch (err) { console.error(err); toast("Couldn't add that document."); } });
  M.onclick = async e => { const t = e.target; if (t.closest("[data-x]")) return closeModal();
    const o = t.closest("[data-libopen]"); if (o) { const d = (S.library || []).find(x => x.id === o.dataset.libopen); if (!d) return; const w = window.open("", "_blank");
      try { const url = await getDownloadURL(ref(storage, d.path)); if (w) w.location = url; else location.href = url; } catch { if (w) w.close(); toast("Couldn't open that file."); } return; }
    const r = t.closest("[data-libdel]"); if (r) { if (r.dataset.confirm !== "1") { r.dataset.confirm = "1"; r.textContent = "Confirm remove"; return; } const d = (S.library || []).find(x => x.id === r.dataset.libdel);
      try { await deleteObject(ref(storage, d.path)).catch(() => {}); await deleteDoc(doc(db, "library", d.id)); } catch { toast("Couldn't remove that."); } } };
}

/* ---------- push notifications on this device (functions/push.js sends them) ---------- */
// The messaging SDK loads only here, so the public pages never pay for it. Each device that turns them on gets
// pushTokens/{token} = {email, device, at}; the owner's devices get everything, admins' devices get interview bookings.
const FM_URL = "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
const PUSH_KEY = "pvrsPushToken";
const pushToken = () => { try { return localStorage.getItem(PUSH_KEY) || ""; } catch { return ""; } };
const deviceName = () => { const u = navigator.userAgent;
  return (/iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : "Computer")
    + " · " + (/Edg\//.test(u) ? "Edge" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "browser"); };
let fmMod = null;
const fm = async () => fmMod || (fmMod = await import(FM_URL));
// Phones swap or drop a device's push registration without telling anyone (iPhones especially), and the server
// forgets a registration the moment a send to it fails. So every time the desk opens (and every few hours while it
// stays open) a device that had alerts on asks for its current registration and saves it again.
let pushChecked = 0, pushLost = false;
async function refreshPush(){
  const old = pushToken(); if (!old || !VAPID_KEY || !S.me || Date.now() - pushChecked < 6 * 36e5) return;
  pushChecked = Date.now();
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "granted") {   // the phone or browser switched them off
      try { localStorage.removeItem(PUSH_KEY); } catch {}
      deleteDoc(doc(db, "pushTokens", old)).catch(() => {});
      pushLost = true; setTimeout(() => { if ($("#modal").hidden) openNotifications(); }, 1500); return;
    }
    const m = await fm(), reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await m.getToken(m.getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return;
    await setDoc(doc(db, "pushTokens", token), { email: S.me, device: deviceName(), at: Date.now() });
    if (token !== old) { try { localStorage.setItem(PUSH_KEY, token); } catch {} deleteDoc(doc(db, "pushTokens", old)).catch(() => {}); }
  } catch (e) { console.error(e); }
}
const tourOpts = () => ({ name: first(S.name), email: S.me, onNotif: openNotifications });
async function pushState(){
  if (!VAPID_KEY) return "unset";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return /iPhone|iPad/.test(navigator.userAgent) ? "ios" : "unsupported";
  try { if (!(await (await fm()).isSupported())) return /iPhone|iPad/.test(navigator.userAgent) ? "ios" : "unsupported"; } catch { return "unsupported"; }
  if (Notification.permission === "denied") return "blocked";
  return pushToken() ? "on" : "off";
}
async function pushOn(){
  const m = await fm(), messaging = m.getMessaging(app);
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const token = await m.getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) throw new Error("no token");
  await setDoc(doc(db, "pushTokens", token), { email: S.me, device: deviceName(), at: Date.now() });
  try { localStorage.setItem(PUSH_KEY, token); } catch {}
  pushLost = false; pushChecked = Date.now();
  startPushToasts();
}
async function pushOff(){
  const token = pushToken(); if (!token) return;
  await deleteDoc(doc(db, "pushTokens", token)).catch(e => console.error(e));
  try { const m = await fm(); await m.deleteToken(m.getMessaging(app)); } catch (e) { console.error(e); }
  try { localStorage.removeItem(PUSH_KEY); } catch {}
}
// While the desk is open and in front, alerts arrive here instead of as system notifications.
let pushToasting = false;
async function startPushToasts(){
  if (pushToasting || !pushToken() || !VAPID_KEY) return; pushToasting = true;
  // The service worker shows every alert as a notification and also tells an open desk, which shows it as a toast.
  try { navigator.serviceWorker?.addEventListener?.("message", e => { const d = e.data || {}; if (d.type === "pvrs-push" && document.visibilityState === "visible") toast([d.title, d.body].filter(Boolean).join(": ")); }); } catch {}
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshPush(); });
}
async function openNotifications(){
  const st = await pushState();
  const what = S.owner ? "a new online application, a reference check answered, all references in, a page marked complete (Application, Checks, Interview, Board, Onboard), an interview booked or cancelled, an applicant message or upload, desk access requests, and new messages in your channels"
    : S.admin ? "an interview booked or cancelled and new messages in your channels and conversations"
    : S.coord ? "every interview booked or cancelled, each morning's interviews, applicant messages, and new messages in your channels"
    : S.role === "interviewer" ? "being assigned an interview, your applicants booking or cancelling, and new messages in your channels and conversations"
    : "new messages in your channels";
  const body = {
    unset: `<p class="help">Notifications aren't set up for PVRS yet. The owner needs to add the Web Push key (docs/notifications.md).</p>`,
    ios: `<p class="help">On iPhone and iPad, notifications only work from the Home Screen app: in Safari tap Share → <b>Add to Home Screen</b>, open PVRS Desk from your Home Screen, sign in, and come back here.</p>`,
    unsupported: `<p class="help">This browser can't receive notifications. Try Chrome, Edge, Firefox or Safari (on Mac), or the Home Screen app on iPhone.</p>`,
    blocked: `<p class="help">Notifications are blocked for this site. Allow them in your browser's site settings (the icon left of the address), then reload.</p>`,
    off: `${pushLost ? `<div class="note warn"><b>Notifications stopped on this device.</b> Your phone or browser switched them off. Turn them back on below.</div>` : ""}<p class="help">Get an alert on <b>this device</b> for ${what}. Alerts say who and what, never the message itself.</p>`,
    on: `<p class="help">This device (${esc(deviceName())}) gets an alert for ${what}.</p>`,
  }[st];
  const M = openModal(`<h3>Notifications</h3>${body}
    <div class="acts"><button class="btn" type="button" data-x>${st === "on" || st === "off" ? "Cancel" : "Close"}</button>
      ${st === "off" ? `<button class="btn primary" type="button" id="pushGo">Turn on</button>` : st === "on" ? `<button class="btn danger" type="button" id="pushStop">Turn off on this device</button>` : ""}</div>`);
  M.onclick = async e => {
    if (e.target.closest("[data-x]")) return closeModal();
    const go = e.target.closest("#pushGo"), stop = e.target.closest("#pushStop");
    if (go) { go.disabled = true;
      try { await pushOn(); closeModal(); toast("Notifications are on for this device."); }
      catch (err) { console.error(err); go.disabled = false;
        toast(Notification.permission === "denied" || /permission/.test(err && err.code || "") ? "Notifications were blocked. Allow them in your browser's site settings." : "Couldn't turn on notifications. Try again."); } }
    if (stop) { stop.disabled = true; await pushOff(); closeModal(); toast("Notifications are off for this device."); }
  };
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
    if (idle > mins*6e4) {
      flushAll(); await new Promise(res => setTimeout(res, 1200));
      try { sessionStorage.setItem("pvrsIdle", String(mins)); } catch {}
      await signOut(auth).catch(() => {}); location.replace("/signin");
    } else if (idle > (mins - 1)*6e4 && !warned) { warned = true; toast("You'll be signed out in about a minute. Move the mouse to stay signed in."); }
  }, 15000);
}

/* ---------- start ---------- */
export function startDesk({ email, role, owner, name }){
  S.me = email; S.admin = role === "admin" || role === "coordinator"; S.owner = !!owner; S.canEdit = !!owner;
  // Interview coordinator: sees what an admin sees and runs scheduling. S.sched = may schedule (owner or coordinator).
  S.coord = !owner && role === "coordinator"; S.sched = !!owner || S.coord; S.name = name || "";
  S.role = owner ? "owner" : role; S.member = S.role === "member";
  S.sort = SORTS[prefs.get("sort")] ? prefs.get("sort") : "stage";
  bindEvents(); renderList(); renderDetail();
  const conn = $("#conn");
  conn.textContent = S.owner ? "Owner" : roleLabel(role);
  conn.classList.add("on");
  $("#meName").textContent = S.name || email;
  $("#meName").title = email;
  $("#meAv").textContent = initials(S.name || email);
  if (S.owner) $("#settingsBtn").hidden = false;
  if (canHostSlots()) $("#slotsBtn").hidden = false;
  $("#newBtn").hidden = !S.canEdit; paintMnav();
  if (!S.canEdit) document.body.classList.add("viewonly-user");
  S.seenBefore = +prefs.get("seen") || 0; prefs.set("seen", String(Date.now()));
  startIdleLock();
  startPushToasts(); refreshPush();
  if (!S.owner) maybeTour(S.role, tourOpts());   // first visit only: what this role can do
  watchOrientation(); watchChat(); startPresence(); $("#msgsBtn").hidden = false; paintMnav();
  const lost = () => { conn.classList.remove("on"); conn.textContent = "Connection lost · reload"; };

  // Admins load every file, interviewers only the ones assigned to them, members none (Messages only).
  const appsQ = S.admin || S.owner ? collection(db, "applicants") : S.member ? null : query(collection(db, "applicants"), where("interviewers", "array-contains", S.me));
  if (!appsQ) { S.ready = true; document.body.classList.add("member-user"); rebuildAll(); renderList(); setTimeout(() => { if (!S.chatOn) openChat(); }, 0); }
  if (appsQ) onSnapshot(appsQ, snap => {
    const next = new Map();
    snap.docs.forEach(d => { const data = d.data(); merge(data, clone(inflight["pub|"+d.id] || {})); merge(data, clone(pending["pub|"+d.id] || {})); next.set(d.id, data); });
    S.shared = next; S.ready = true; rebuildAll();
    if (S.sel && !S.apps.has(S.sel)) { S.sel = null; renderDetail(); }
    renderList(); if (S.sel) syncDetail();
    if (S.role === "interviewer" && !S.sel) renderOverview();
    openFromLink();
    if (S.canEdit) { syncAllPortals(); mirrorStages(); }
  }, lost);
  onSnapshot(collection(db, "slots"), snap => {
    S.slots = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    rebuildAll(); renderList(); if (S.sel) syncDetail(); if (S._slotPaint && !$("#modal").hidden) S._slotPaint();
    if (S.role === "interviewer" && !S.sel) renderOverview();
    if (S.canEdit) { syncAllPortals(); mirrorStages(); }
  }, () => {});
  if (S.admin) {
    onSnapshot(collectionGroup(db, "private"), snap => {
      const next = new Map();
      snap.docs.forEach(d => { if (d.id !== "main") return; const id = d.ref.parent.parent.id; const data = d.data(); merge(data, clone(inflight["sec|"+id] || {})); merge(data, clone(pending["sec|"+id] || {})); next.set(id, data); });
      S.secure = next; rebuildAll(); renderList(); if (S.sel) syncDetail(); if (S.canEdit) { syncAllPortals(); mirrorStages(); processRefUpdates(); processRefResponses(); }
    }, e => console.error(e));
    if (S.canEdit) onSnapshot(collection(db, "portalEmails"), snap => { peKnown = new Map(snap.docs.map(d => [d.id, d.data().id])); reconcilePortalEmails(); }, e => console.error(e));
    onSnapshot(collection(db, "portal"), snap => {
      const before = S.portal; S.portal = new Map(snap.docs.map(d => [d.id, d.data()]));
      if (before.size) for (const [id, pd] of S.portal) { const iv = pd.interview, old = before.get(id)?.interview;
        if (iv && iv.bookedAt && iv.bookedAt !== old?.bookedAt && Date.now() - iv.bookedAt < 6e4 && S.apps.get(id) && S._selfBooked !== id) toast(`${S.apps.get(id).name} booked ${slotLong(iv.start)}`); }
      if (!S.sel) renderOverview();
      reconcilePortalEmails();
    }, () => {});
    watchActivity();
    if (S.sched) watchMessages();
    if (S.owner) { watchSubmissions(); watchRefUpdates(); watchRefResponses(); }
    if (S.owner) {
      let primed = false;
      onSnapshot(collection(db, "accessRequests"), snap => {
        const before = new Set(S.requests.map(q => q.email));
        S.requests = snap.docs.map(d => d.data()).filter(q => q.status === "pending").sort((x,y) => (x.requestedAt||0) - (y.requestedAt||0));
        const fresh = S.requests.filter(q => !before.has(q.email));
        if (primed && fresh.length) toast(`${fresh[0].name || fresh[0].email} asked for team access. Review it in Settings.`);
        primed = true;
        const n = S.requests.length, sb = $("#settingsBtn");
        let badge = sb.querySelector(".navbadge"); if (!badge) { badge = document.createElement("b"); badge.className = "navbadge"; sb.appendChild(badge); }
        badge.textContent = n || ""; badge.hidden = !n; sb.title = n ? `Settings · ${n} access request${n===1?"":"s"}` : "Settings";
        if (S._teamPaint && !$("#modal").hidden) S._teamPaint();
        if (!S.sel) renderOverview();
      }, e => console.error(e));
    }
    onSnapshot(doc(db, "settings", "main"), s => { S.settings = s.exists() ? s.data() : {}; paintAi(); }, () => {});
    onSnapshot(collection(db, "staff"), snap => { S.staff = new Map(snap.docs.map(d => [d.id, d.data()])); if (S._teamPaint && !$("#modal").hidden) S._teamPaint(); if (S.sel) syncDetail(); }, () => {});
  }
}
