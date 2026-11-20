import { useEffect, useState } from "react";
import { useBackend, useToast } from "../appContext";
import type { Snap } from "../lib/backend";
import { icsFile, ivScore, showField, slotLong, today, type Applicant } from "../lib/domain";

export const box = "w-full rounded-xl bg-[#f5f5f7] px-3 py-2 outline-none hairline";

type Kind = "area" | "text" | "yn" | "ynBad" | "seg";
interface Q { n?: number; path: string; label: string; kind: Kind; opts?: [string, string][]; show?: string }
interface Section { title: string; show?: string; note?: string; questions: Q[] }

const YN: [string, string][] = [["yes", "Yes"], ["no", "No"]];
export const INTERVIEW_SECTIONS: Section[] = [
  { title: "Scheduling", questions: [
    { path: "sched.contacted", label: "Applicant contacted", kind: "text" },
    { path: "sched.scheduled", label: "Interview date", kind: "text" },
    { path: "sched.time", label: "Interview time", kind: "text" },
    { path: "sched.completed", label: "Interview completed", kind: "text" },
    { path: "sched.completedInit", label: "Completed by (initials)", kind: "text" },
  ]},
  { title: "About the applicant", questions: [
    { n: 5, path: "iv.about", label: "Tell us a bit about yourself", kind: "area" },
    { n: 6, path: "iv.hobbies", label: "What are your hobbies and/or interests?", kind: "area" },
    { n: 7, path: "iv.college", label: "Are you a college student?", kind: "yn" },
    { n: 8, path: "iv.collegeWhere", label: "Where, and expected graduation date?", kind: "text", show: "college" },
    { n: 9, path: "iv.avail", label: "Here year round or during school only?", kind: "seg", opts: [["year", "Year round"], ["semester", "Semester only"], ["other", "Other"]] },
    { path: "iv.availOther", label: "Other availability", kind: "text", show: "availOther" },
    { n: 10, path: "iv.resident", label: "Permanent Potsdam resident?", kind: "seg", opts: [["yes", "Yes"], ["no", "No"], ["other", "Other"]] },
    { path: "iv.residentOther", label: "Other residence", kind: "text", show: "residentOther" },
  ]},
  { title: "EMS questions", questions: [
    { n: 11, path: "iv.why", label: "What made you interested in joining PVRS?", kind: "area" },
    { n: 12, path: "iv.knowsMembers", label: "Do you know any other members of the squad?", kind: "area" },
    { n: 13, path: "iv.otherOrg", label: "Member of another fire/rescue organization?", kind: "yn" },
  ]},
  { title: "Past experience", show: "otherOrg", questions: [
    { n: 14, path: "iv.otherOrgWhere", label: "Where were you previously a member?", kind: "text" },
    { n: 15, path: "iv.otherOrgCurrent", label: "Are you still a member there?", kind: "seg", opts: [["yes", "Yes"], ["no", "No"], ["other", "Other"]] },
    { path: "iv.otherOrgCurrentOther", label: "Other", kind: "text", show: "otherOrgCurrentOther" },
    { n: 16, path: "iv.refsFromOrgWhy", label: "Are any of your references from there? Why or why not?", kind: "area" },
    { n: 17, path: "iv.pastExperience", label: "How did your past experiences go with the agencies?", kind: "area" },
  ]},
  { title: "Certification", questions: [
    { n: 18, path: "iv.isEmt", label: "Are you currently an EMT?", kind: "seg", opts: [["yes", "Yes"], ["no", "No"], ["lapsed", "Lapsed"]] },
  ]},
  { title: "Current EMTs", show: "emtYes", questions: [
    { n: 19, path: "iv.emtState", label: "In what state are you licensed?", kind: "seg", opts: [["NY", "NY"], ["other", "Other"]] },
    { path: "iv.emtStateOther", label: "State", kind: "text", show: "emtStateOther" },
    { n: 20, path: "iv.emtYears", label: "How long have you been an EMT?", kind: "text" },
    { n: 21, path: "iv.emtStrengths", label: "What do you feel your strengths are as an EMT?", kind: "area" },
    { n: 22, path: "iv.emtImprove", label: "What areas of growth do you see in your skills?", kind: "area" },
  ]},
  { title: "Currently uncertified", show: "emtNo", note: "New members enroll in EMT class within the first year. The squad pays for the training if they stay active for a year after.", questions: [
    { n: 23, path: "iv.emtClass", label: "Can you realistically take an EMT class within 12 months?", kind: "seg", opts: [["yes", "Yes"], ["no", "No"], ["other", "Other"]] },
    { path: "iv.emtClassOther", label: "Other", kind: "text", show: "emtClassOther" },
    { n: 24, path: "iv.emtChallenge", label: "What would be the biggest challenge?", kind: "area" },
  ]},
  { title: "General questions", questions: [
    { n: 25, path: "iv.volunteer", label: "What other types of volunteer work have you done?", kind: "area" },
    { n: 26, path: "iv.stress", label: "How do you prefer to decompress after a stressful situation?", kind: "area" },
    { n: 27, path: "iv.concerns", label: "If you had questions about how part of a call was handled, how would you handle that?", kind: "area" },
    { n: 28, path: "iv.driving", label: "Any restrictions or citations on your driving record?", kind: "ynBad" },
    { path: "iv.drivingExplain", label: "Explain", kind: "area", show: "driving" },
    { n: 29, path: "iv.convicted", label: "Have you ever been convicted of a crime?", kind: "ynBad" },
    { path: "iv.convictedExplain", label: "Explain", kind: "area", show: "convicted" },
  ]},
  { title: "Non-operational members", show: "nonop", questions: [
    { n: 31, path: "iv.nonopSkills", label: "What skills would be useful at PVRS if you are not on a duty crew?", kind: "area" },
    { n: 32, path: "iv.nonopCommittees", label: "Could you contribute to Membership or Fundraising?", kind: "yn" },
  ]},
  { title: "Wrap-up", questions: [
    { n: 33, path: "iv.addlExplain", label: "Any other skills relevant to your role?", kind: "area" },
    { n: 34, path: "iv.more", label: "Anything else you'd like to share, or any questions?", kind: "area" },
  ]},
  { title: "Membership requirements", note: "Duty crew: at least 4 shifts a month. Meetings: 2nd Tuesday. Training is encouraged.", questions: [
    { n: 35, path: "iv.understands", label: "Do you understand these requirements?", kind: "yn" },
    { n: 36, path: "iv.ableToMeet", label: "Do you feel you are able to meet them?", kind: "yn" },
    { path: "iv.nextStepsReviewed", label: "Next steps reviewed with the applicant", kind: "yn" },
  ]},
];

export const FLAT_QUESTIONS = INTERVIEW_SECTIONS.flatMap((s) => s.questions.filter((q) => !q.show));

function val(a: Applicant, path: string, fieldValue: (a: Applicant, p: string) => unknown) {
  return String(fieldValue(a, path) ?? "");
}

function Question({ a, q, fieldValue, edit }: { a: Applicant; q: Q; fieldValue: (a: Applicant, p: string) => unknown; edit: (a: Applicant, p: string, v: unknown) => void }) {
  if (q.show && !showField(q.show, a)) return null;
  const v = val(a, q.path, fieldValue);
  const label = <span className="text-sm font-medium">{q.n ? `${q.n}. ` : ""}{q.label}</span>;
  if (q.kind === "area") return <label className="block">{label}<textarea className={`${box} mt-1`} rows={3} value={v} onChange={(e) => edit(a, q.path, e.target.value)} /></label>;
  if (q.kind === "text") return <label className="block">{label}<input className={`${box} mt-1`} value={v} onChange={(e) => edit(a, q.path, e.target.value)} /></label>;
  const opts = q.kind === "yn" ? YN : q.kind === "ynBad" ? [["no", "No"], ["yesbad", "Yes"]] as [string, string][] : q.opts || YN;
  return (
    <div>
      {label}
      <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={q.label}>
        {opts.map(([value, text]) => (
          <button key={value} type="button" aria-pressed={v === value} onClick={() => edit(a, q.path, value)} className={`rounded-full px-3 py-1.5 text-sm ${v === value ? "bg-ink text-white" : "bg-[#f5f5f7]"}`}>{text}</button>
        ))}
      </div>
    </div>
  );
}

export function InterviewPanel({ a, fieldValue, edit, questions, onQuestions, canAi, canSchedule }: {
  a: Applicant; fieldValue: (a: Applicant, p: string) => unknown; edit: (a: Applicant, p: string, v: unknown) => void;
  questions: string[]; onQuestions: () => void; canAi: boolean; canSchedule: boolean;
}) {
  const backend = useBackend();
  const toast = useToast();
  const [mode, setMode] = useState(false);
  const [step, setStep] = useState(0);
  const [imps, setImps] = useState<Snap[]>([]);
  const [note, setNote] = useState("");
  const me = backend.current();
  const score = ivScore(a);
  const sections = INTERVIEW_SECTIONS.filter((s) => !s.show || showField(s.show, a));
  useEffect(() => backend.watch(`applicants/${a._id}/impressions`, setImps), [backend, a._id]);
  useEffect(() => { const mine = imps.find((d) => d.id === me?.email); setNote(String(mine?.data.text || "")); }, [imps, me?.email]);

  async function saveImpression() {
    if (!me) return;
    try {
      await backend.set(`applicants/${a._id}/impressions/${me.email}`, { text: note.slice(0, 4000), by: me.email, name: me.name || "", at: Date.now() });
      toast("Impression saved. Only you, the owner, and admins can read it.");
    } catch { toast("Couldn't save that note."); }
  }
  async function noShow() {
    if (!a._booked) return toast("No booked time to release.");
    const was = slotLong(a._booked.start);
    try {
      await backend.commit([
        { op: "set", path: "slots/" + a._booked.slotId, data: { bookedBy: null }, merge: true },
        { op: "set", path: "portal/" + a._id, data: { interview: null }, merge: true },
      ]);
      edit(a, "sched.noShow", today());
      edit(a, "sched.scheduled", "");
      edit(a, "portal.bookingOpen", "yes");
      window.location.href = `mailto:${encodeURIComponent(String(a.email || ""))}?subject=${encodeURIComponent("PVRS interview: let's find a new time")}&body=${encodeURIComponent(`Hi ${a.name?.split(" ")[0] || ""},\n\nWe missed you at your interview on ${was}. Sign in and pick a new time when you're ready.\n`)}`;
    } catch { toast("Couldn't release that time."); }
  }
  function calendar() {
    if (!a._booked) return;
    const blob = new Blob([icsFile([{ uid: a._id, start: a._booked.start, duration: a._booked.duration || 45, title: `PVRS interview: ${a.name}`, location: a._booked.location }])], { type: "text/calendar" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "interview.ics"; link.click();
  }

  return (
    <section className="space-y-4" data-screen="interview">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-ink px-3 py-1.5 text-sm font-semibold text-white" onClick={() => { setStep(0); setMode(true); }}>Interview mode</button>
        {canAi ? <button type="button" className="rounded-full bg-blue px-3 py-1.5 text-sm font-semibold text-white" onClick={onQuestions}>Tailored questions</button> : null}
        {a._booked ? <button type="button" className="rounded-full px-3 py-1.5 text-sm hairline" onClick={calendar}>Add to calendar</button> : null}
        {canSchedule && a._booked ? <button type="button" className="rounded-full px-3 py-1.5 text-sm hairline" onClick={noShow}>No-show</button> : null}
        <span className="self-center text-sm text-muted">Score {score.n ? `${score.avg.toFixed(1)} / 5` : "not scored"}{score.n && score.avg < 3 ? " · under 3" : ""}</span>
      </div>
      {a._booked ? <p className="text-sm">Booked {slotLong(a._booked.start)}{a._booked.location ? ` · ${a._booked.location}` : ""}</p> : null}
      {questions.length ? <ol className="list-decimal space-y-1 rounded-2xl bg-blue/5 p-4 pl-8 text-sm">{questions.map((q) => <li key={q}>{q}</li>)}</ol> : null}
      <div className="rounded-2xl bg-[#f5f5f7] p-3">
        <h3 className="text-sm font-semibold">Interviewers</h3>
        <p className="text-xs text-muted">{(a.interviewers || []).join(", ") || "Nobody assigned yet."}</p>
        {canSchedule ? <Assign a={a} /> : null}
      </div>
      <div className="rounded-2xl bg-[#f5f5f7] p-3">
        <h3 className="text-sm font-semibold">Private impressions</h3>
        <p className="text-xs text-muted">Only you, the owner, and admins can read your note.</p>
        <textarea className={`${box} mt-2 bg-white`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-label="My impressions" />
        <button type="button" className="mt-2 rounded-full bg-white px-3 py-1 text-sm hairline" onClick={saveImpression}>Save impression</button>
        {imps.filter((d) => d.id !== me?.email).map((d) => (
          <p key={d.id} className="mt-2 text-sm"><b>{String(d.data.name || d.id)}</b>: {String(d.data.text || "")}</p>
        ))}
      </div>
      {sections.map((s) => (
        <details key={s.title} open className="rounded-2xl bg-white p-3 hairline">
          <summary className="cursor-pointer font-semibold">{s.title}</summary>
          {s.note ? <p className="mt-1 text-xs text-muted">{s.note}</p> : null}
          <div className="mt-3 space-y-3">{s.questions.map((q) => <Question key={q.path} a={a} q={q} fieldValue={fieldValue} edit={edit} />)}</div>
        </details>
      ))}
      <div>
        <h3 className="font-semibold">Interview score</h3>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {([["comm", "Communication"], ["motiv", "Motivation"], ["avail", "Availability"], ["team", "Teamwork"], ["fit", "Fit"]] as const).map(([k, label]) => (
            <label key={k} className="text-xs text-muted">{label}
              <select className={`${box} mt-1`} aria-label={label} value={val(a, `iv.score.${k}`, fieldValue)} onChange={(e) => edit(a, `iv.score.${k}`, e.target.value)}>
                <option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>
      {mode ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas p-6" role="dialog" aria-label="Interview mode">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between">
            <p className="text-sm text-muted">{a.name} · {step + 1} of {sections.length}</p>
            <button type="button" className="rounded-full px-3 py-1 text-sm hairline" onClick={() => setMode(false)}>Close</button>
          </div>
          <div className="mx-auto mt-6 w-full max-w-2xl flex-1 space-y-4 overflow-auto">
            <h2 className="text-3xl font-semibold tracking-tight">{sections[step].title}</h2>
            {sections[step].questions.map((q) => <Question key={q.path} a={a} q={q} fieldValue={fieldValue} edit={edit} />)}
          </div>
          <div className="mx-auto flex w-full max-w-2xl justify-between pt-4">
            <button type="button" className="rounded-full px-4 py-2 hairline" onClick={() => setStep(Math.max(0, step - 1))}>Back</button>
            <button type="button" className="rounded-full bg-blue px-4 py-2 font-semibold text-white" onClick={() => step === sections.length - 1 ? setMode(false) : setStep(step + 1)}>{step === sections.length - 1 ? "Done" : "Next"}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Assign({ a }: { a: Applicant }) {
  const backend = useBackend();
  const [email, setEmail] = useState("");
  const list = a.interviewers || [];
  async function save(next: string[]) {
    await backend.set(`applicants/${a._id}`, { interviewers: next, updatedAt: Date.now() }, true);
    await backend.set(`convos/${a._id}`, { members: next, updatedAt: Date.now() }, true);
  }
  return (
    <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const em = email.trim().toLowerCase(); if (em && !list.includes(em)) void save([...list, em]); setEmail(""); }}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="interviewer@pvrs.org" aria-label="Assign interviewer" className={`${box} bg-white`} />
      <button className="rounded-full bg-white px-3 text-sm hairline">Assign</button>
      {list.map((em) => <button key={em} type="button" className="text-xs text-crimson" onClick={() => save(list.filter((x) => x !== em))}>Remove {em}</button>)}
    </form>
  );
}
