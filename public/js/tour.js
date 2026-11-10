// First-visit tour: a few short cards saying what this person can do here. Shown once per person, per role, on each
// device (remembered in the browser), and always available again from "How this works" / ⌘K → Show the tour.
import { $, esc, openModal, closeModal } from "./shared.js";

const NOTIF = ["Turn on notifications", "So you hear about it without keeping this open. On an iPhone or iPad, first add PVRS to your Home Screen (Safari → Share → <b>Add to Home Screen</b>) and open it from there."];
const TOURS = {
  coordinator: { title: "Interview coordinator", steps: [
    ["You run the interviews", "You can open every applicant's file to see where they stand. You change the interview side of it: times, bookings, who interviews, and messages. Everything else is view only."],
    ["Start with Interviews to do", "Your home screen lists what needs you, most urgent first. Each line has a button that does the job: <b>Add times</b>, <b>Open booking</b>, <b>Email</b>, <b>Book a time</b>, <b>Assign</b>."],
    ["Post interview times", "Open <b>Interview times</b> (sidebar, or More on a phone). Pick a date, a start time and how many back-to-back slots, and choose which interviewer each batch is for. Applicants can pick any open time at least 24 hours out."],
    ["Let them pick, or book for them", "On an applicant's <b>Application</b> tab, turn on <b>Let them book an interview</b> and send the email that pops up. Or on the <b>Interview</b> tab use <b>Book a time</b> to book it yourself. Change and Release are in the same spot."],
    ["Choose who interviews", "On the <b>Interview</b> tab, <b>Assign</b> picks the squad members for that interview. They can then open that applicant's Application and Interview tabs and message them, nothing else."],
    ["After the interview", "Fill in <b>Interview completed</b> and the initials on the Interview tab. That moves the applicant on to the committee decision. If they didn't come, <b>No-show</b> frees the time, reopens booking and drafts the follow-up email."],
    ["Messages", "You can read and reply to every applicant in <b>Messages</b>. They see your first name. Keep it to scheduling and questions: never share check results, votes or decisions."],
    NOTIF ] },
  admin: { title: "Admin", steps: [
    ["You can see every file", "Open any applicant from the list to follow their application: Application, Checks, Interview, Board, Onboard and Notes. It's view only, so you can't change anything by accident."],
    ["What you can fill in", "The <b>Interview</b> tab: the questionnaire, who was there, the completed date and the page sign-off. <b>Start interview mode</b> shows one section at a time, full screen."],
    ["Offer interview times", "<b>Interview times</b> lets you add the times you're free. When an applicant books one of yours, you're assigned to that interview automatically."],
    ["Reports", "<b>Reports</b> (on the Overview, in Year at a glance) shows how long each stretch takes, who has waited longest and who has stalled."],
    ["Board meetings and records", "<b>Board meeting</b> walks through the applicants who are ready, one per screen, with a printable packet. Uploaded records on a file can be opened and printed."],
    ["Messages", "<b>Messages</b> has your squad channels and any applicant conversations you've been added to."],
    NOTIF ] },
  interviewer: { title: "Interviewer", steps: [
    ["My interviews", "Your home screen shows the applicants assigned to you: what's coming up, who still needs a time, and what's done. You only see the applicants you're interviewing."],
    ["Offer the times you're free", "Open <b>My interview times</b> and add them. When an applicant books one, they're assigned to you automatically."],
    ["Doing the interview", "Open the applicant, go to the <b>Interview</b> tab and tap <b>Start interview mode</b>: one section at a time, big enough to read across the table. Answers save as you go."],
    ["Before and after", "<b>Applicant brief</b> is a one-page summary to read first. Afterwards, <b>My impressions</b> is a private note only you and the committee can read."],
    ["When you're done", "Enter <b>Interview completed</b> and your initials, then mark the Interview page complete. The Application tab is there to read beforehand; you can't change it."],
    ["Messages", "<b>Messages</b> has your squad channels and the conversations with the applicants you're interviewing."],
    NOTIF ] },
  member: { title: "Squad member", steps: [
    ["Welcome to the PVRS desk", "This is where the squad talks. You'll see the channels you've been added to under <b>Messages</b>."],
    ["Channels", "Tap a channel to read and post. You can react to a post and attach a PDF or photo. Please keep medical and Social Security paperwork out of channels."],
    ["Documents", "<b>Documents</b> has the squad handbook, policies and forms that are shared with members."],
    ["My paperwork", "If you still owe orientation paperwork, <b>My paperwork</b> opens your orientation checklist so you can upload what's left."],
    ["Sign-offs", "If you're asked to train a new member, <b>Sign-offs</b> appears with their list. Tap an item when they've done it."],
    NOTIF ] },
  applicant: { title: "Your applicant portal", steps: [
    ["Welcome", "This page follows your application to the Potsdam Volunteer Rescue Squad from start to finish. Check back any time; it updates as we work on it."],
    ["Your application", "The steps at the top show what's done and what's next. Nothing here needs you unless a step says so."],
    ["Interview", "When interview times open, they show up under <b>Interview</b>. Pick one that works. You can change or cancel it yourself up to 24 hours before."],
    ["References", "You can see which of your references we've heard from. A quick reminder from you helps the slow ones along."],
    ["Documents", "If we need something from you it appears under <b>Documents</b> with an Upload button. A PDF or a clear photo is fine. Use <b>Secure document upload</b> for medical or Social Security paperwork."],
    ["Questions?", "Send us a message under <b>Messages</b> and we'll reply there. Turn on alerts in that box to hear when we answer or your application moves forward."] ] },
  newmember: { title: "Your orientation", steps: [
    ["Welcome to the squad", "This is your orientation dashboard. Everything on the checklist is required before you can be issued equipment or run calls."],
    ["Your checklist", "Each item has an <b>Upload</b> button. Send a PDF or a clear photo; items we've asked for are marked <b>Requested</b>. Once we've looked at it, the item is checked off."],
    ["Medical paperwork", "Items with a lock 🔒 go straight to our orientation paperwork coordinator. Nobody else on the squad can open them."],
    ["Your session", "Under <b>Your session</b>, pick a time for your one-on-one with the orientation chair. You can change it up to 24 hours before."],
    ["Questions?", "Send us a message under <b>Messages</b> and we'll reply there."] ] },
};
export const TOUR_ROLES = Object.keys(TOURS);
const key = (role, email) => `pvrsTour:${email}:${role}`;
// True when this person has already had this role's tour on this device (or the browser won't let us remember).
export function tourSeen(role, email){ try { return !!localStorage.getItem("pvrsTourOff") || !!localStorage.getItem(key(role, email)); } catch { return true; } }

// `onNotif`: what "Turn on notifications" does on the last card (desk roles).
export function showTour(role, { name = "", email = "", onNotif = null } = {}){
  const T = TOURS[role]; if (!T) return;
  try { localStorage.setItem(key(role, email), String(Date.now())); } catch {}
  let i = 0;
  const paint = () => {
    const [h, body] = T.steps[i], last = i === T.steps.length - 1, notif = last && onNotif && T.steps[i] === NOTIF;
    const M = openModal(`<div class="tour"><div class="eyebrow">${esc(T.title)} · ${i + 1} of ${T.steps.length}</div>
      <h3>${i === 0 && name ? esc(h) + ", " + esc(name) : esc(h)}</h3><p class="help tourbody">${body}</p>
      <div class="tourdots" aria-hidden="true">${T.steps.map((_, n) => `<i class="${n === i ? "on" : ""}"></i>`).join("")}</div></div>
      <div class="acts">${last ? "" : `<button class="btn" type="button" data-tskip>Skip</button>`}<span style="flex:1"></span>
        ${i ? `<button class="btn" type="button" data-tback>Back</button>` : ""}
        ${notif ? `<button class="btn" type="button" data-tdone>Not now</button><button class="btn primary" type="button" data-tnotif>Turn on</button>`
          : `<button class="btn primary" type="button" ${last ? "data-tdone" : "data-tnext"}>${last ? "Got it" : "Next"}</button>`}</div>`);
    M.onclick = e => { const t = e.target;
      if (t.closest("[data-tnext]")) { i++; return paint(); }
      if (t.closest("[data-tback]")) { i--; return paint(); }
      if (t.closest("[data-tnotif]")) { closeModal(); return setTimeout(onNotif, 60); }
      if (t.closest("[data-tskip]") || t.closest("[data-tdone]")) return closeModal(); };
    (M.querySelector("[data-tnotif]") || M.querySelector("[data-tnext]") || M.querySelector("[data-tdone]"))?.focus({ preventScroll: true });
  };
  paint();
}
// Shows the tour the first time only. Waits a moment so the page is drawn, and stays out of the way of another window.
export function maybeTour(role, opts){ if (tourSeen(role, opts.email)) return; setTimeout(() => { if ($("#modal")?.hidden) showTour(role, opts); }, 1200); }
