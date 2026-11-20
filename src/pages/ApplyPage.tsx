import { useEffect, useState, type FormEvent } from "react";
import { PublicBar } from "./Public";
import { useBackend, useToast } from "../appContext";
import { CONTACT_EMAIL } from "../lib/config";
import { TYPE_INFO, TYPES } from "../lib/domain";
import {
  APPLY_STEPS, CERTS, RELEASE, STATES, applyProblems, blankApply, blankJob, blankRef, heardOptions, refUsed, submissionDoc, type ApplyData,
} from "../lib/apply";

const KEY = "pvrsApplyDraft";

function load(): { step: number; data: ApplyData } | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    if (d?.data) return { step: d.step || 0, data: { ...blankApply(), ...d.data, person: { ...blankApply().person, ...d.data.person } } };
  } catch { /* ignore */ }
  return null;
}

export function ApplyPage() {
  const backend = useBackend();
  const toast = useToast();
  const saved = load();
  const [step, setStep] = useState(saved?.step || 0);
  const [maxStep, setMaxStep] = useState(saved?.step || 0);
  const [data, setData] = useState<ApplyData>(saved?.data || blankApply());
  const [errors, setErrors] = useState<{ path: string; msg: string }[]>([]);
  const [done, setDone] = useState<{ first: string; email: string } | null>(null);
  const [saving, setSaving] = useState("Saved on this device");

  useEffect(() => {
    try {
      const src = new URLSearchParams(location.search).get("src");
      if (src === "flyer" && !data.heard.source) setData((d) => ({ ...d, heard: { ...d.heard, source: "Flyer or poster" } }));
    } catch { /* ignore */ }
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify({ step, data })); } catch { /* ignore */ }
      setSaving("Saved on this device");
    }, 300);
    return () => clearTimeout(t);
  }, [data, step, done]);

  function patch(partial: ApplyData | ((d: ApplyData) => ApplyData)) {
    setSaving("Saving…");
    setData((d) => (typeof partial === "function" ? partial(d) : { ...d, ...partial }));
  }
  function setPerson<K extends keyof ApplyData["person"]>(k: K, v: ApplyData["person"][K]) {
    patch((d) => ({ ...d, person: { ...d.person, [k]: v } }));
  }

  function go(n: number) {
    const next = Math.max(0, Math.min(APPLY_STEPS.length - 1, n));
    setStep(next);
    setMaxStep((m) => Math.max(m, next));
    setErrors([]);
    window.scrollTo(0, 0);
  }

  async function submit() {
    if (data.signature.name && (document.getElementById("hp") as HTMLInputElement | null)?.value) {
      setDone({ first: data.person.first, email: data.person.email });
      return;
    }
    try {
      await backend.add("submissions", submissionDoc(data) as unknown as Record<string, unknown>);
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      setDone({ first: data.person.first, email: data.person.email.toLowerCase() });
    } catch (e) {
      console.error(e);
      toast(`Couldn't send your application. Check your connection and try again, or email ${CONTACT_EMAIL}.`);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const list = applyProblems(step, data);
    setErrors(list);
    if (list.length) return;
    if (step < APPLY_STEPS.length - 1) return go(step + 1);
    for (let i = 0; i < APPLY_STEPS.length - 1; i++) {
      const p = applyProblems(i, data);
      if (p.length) { go(i); setErrors(p); return; }
    }
    void submit();
  }

  if (done) {
    return (
      <div data-screen="apply" className="min-h-full">
        <PublicBar />
        <main className="mx-auto max-w-lg px-5 py-16">
          <div className="card rise p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-act text-2xl text-white">✓</div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Application received</h1>
            <p className="mt-2 text-muted">Thank you, {done.first}. Your application is on its way to the PVRS Membership Committee.</p>
            <ol className="mt-6 space-y-3 text-left text-sm">
              <li><b>Watch your email</b> ({done.email}). We’ll send a link to your applicant portal.</li>
              <li><b>Give your references a heads-up.</b> We contact them by email.</li>
              <li><b>Questions?</b> <a className="text-blue" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
            </ol>
          </div>
        </main>
      </div>
    );
  }

  const st = APPLY_STEPS[step];
  const p = data.person;
  const input = (label: string, value: string, onChange: (v: string) => void, opts: { type?: string; required?: boolean; placeholder?: string; id?: string } = {}) => (
    <label className="block text-sm font-medium">
      {label}{opts.required ? <i className="text-crimson"> *</i> : null}
      <input id={opts.id} value={value} type={opts.type || "text"} placeholder={opts.placeholder} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 font-normal outline-none hairline focus:ring-2 focus:ring-blue/40" />
    </label>
  );

  return (
    <div data-screen="apply" className="min-h-full bg-canvas">
      <PublicBar />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="card rise p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Membership application · Step {step + 1} of {APPLY_STEPS.length}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">{st.title}</h1>
            </div>
            <span className="text-xs text-muted" data-save>{saving}</span>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/5" role="progressbar" aria-valuenow={step + 1} aria-valuemax={APPLY_STEPS.length}>
            <div className="h-full rounded-full bg-blue transition-all" style={{ width: `${((step + 1) / APPLY_STEPS.length) * 100}%` }} />
          </div>
          <ol className="mt-3 flex gap-1 overflow-x-auto text-[11px] text-muted">
            {APPLY_STEPS.map((s, i) => (
              <li key={s.key}>
                <button type="button" disabled={i > maxStep} onClick={() => go(i)} className={`rounded-full px-2 py-1 ${i === step ? "bg-ink text-white" : i < step ? "text-blue" : ""}`}>{s.title}</button>
              </li>
            ))}
          </ol>
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            {st.key === "you" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {input("First name", p.first, (v) => setPerson("first", v), { required: true })}
                  {input("Last name", p.last, (v) => setPerson("last", v), { required: true })}
                  {input("Email", p.email, (v) => setPerson("email", v), { type: "email", required: true })}
                  {input("Cell phone", p.phone, (v) => setPerson("phone", v), { type: "tel", required: true, placeholder: "(315) 555-0100" })}
                  {input("Date of birth", p.dob, (v) => setPerson("dob", v), { type: "date", required: true })}
                  {input("Place of birth", p.birthplace, (v) => setPerson("birthplace", v), { placeholder: "City, State" })}
                </div>
                <fieldset className="space-y-3 rounded-2xl bg-[#f5f5f7] p-4">
                  <legend className="text-sm font-semibold">Permanent address</legend>
                  {input("Street", p.permAddr.street, (v) => setPerson("permAddr", { ...p.permAddr, street: v }), { required: true })}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {input("City", p.permAddr.city, (v) => setPerson("permAddr", { ...p.permAddr, city: v }), { required: true })}
                    <label className="text-sm font-medium">State<select value={p.permAddr.state} onChange={(e) => setPerson("permAddr", { ...p.permAddr, state: e.target.value })} className="mt-1 w-full rounded-xl bg-white px-3 py-3">{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
                    {input("ZIP", p.permAddr.zip, (v) => setPerson("permAddr", { ...p.permAddr, zip: v }), { required: true })}
                  </div>
                </fieldset>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.sameLocal} onChange={(e) => setPerson("sameLocal", e.target.checked)} /> My school / local address is the same</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">License state<select value={p.dlState} onChange={(e) => setPerson("dlState", e.target.value)} className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 hairline">{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
                  {input("Driver's license ID number", p.dlNumber, (v) => setPerson("dlNumber", v), { required: true })}
                </div>
                <p className="text-xs text-muted">We use your license number only to run the driving record check. It stays with the membership officer and administrator.</p>
                <div className="grid gap-2">
                  {TYPES.map((t) => (
                    <button type="button" key={t} aria-pressed={p.type === t} onClick={() => setPerson("type", t)} className={`rounded-2xl p-3 text-left press ${p.type === t ? "bg-blue text-white" : "bg-[#f5f5f7]"}`}>
                      <b>{t}</b><div className={`text-xs ${p.type === t ? "text-white/80" : "text-muted"}`}>{TYPE_INFO[t]}</div>
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">How did you hear about PVRS? (optional)
                    <select value={data.heard.source} onChange={(e) => patch((d) => ({ ...d, heard: { ...d.heard, source: e.target.value } }))} className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3">
                      <option value="">Choose one</option>
                      {heardOptions().map((h) => <option key={h}>{h}</option>)}
                    </select>
                  </label>
                  {input("Anything to add?", data.heard.detail, (v) => patch((d) => ({ ...d, heard: { ...d.heard, detail: v } })))}
                </div>
              </>
            )}
            {st.key === "edu" && (
              <div className="space-y-4">
                {(["hs", "college", "other"] as const).map((k) => (
                  <fieldset key={k} className="space-y-2 rounded-2xl bg-[#f5f5f7] p-4">
                    <legend className="font-semibold">{k === "hs" ? "High school" : k === "college" ? "College" : "Other education"}</legend>
                    {input("Name", data.education[k].name, (v) => patch((d) => ({ ...d, education: { ...d.education, [k]: { ...d.education[k], name: v } } })))}
                    {input("Location", data.education[k].location, (v) => patch((d) => ({ ...d, education: { ...d.education, [k]: { ...d.education[k], location: v } } })))}
                    {k !== "hs" ? input("Course of study", (data.education[k] as { study: string }).study, (v) => patch((d) => ({ ...d, education: { ...d.education, [k]: { ...d.education[k], study: v } } }))) : null}
                    {input("Graduation", data.education[k].grad, (v) => patch((d) => ({ ...d, education: { ...d.education, [k]: { ...d.education[k], grad: v } } })))}
                  </fieldset>
                ))}
              </div>
            )}
            {st.key === "exp" && (
              <>
                <div className="flex flex-wrap gap-2">
                  {CERTS.map((c) => (
                    <button type="button" key={c} aria-pressed={data.experience.certs.includes(c)} onClick={() => patch((d) => ({ ...d, experience: { ...d.experience, certs: d.experience.certs.includes(c) ? d.experience.certs.filter((x) => x !== c) : [...d.experience.certs, c] } }))} className={`rounded-full px-3 py-1.5 text-sm press ${data.experience.certs.includes(c) ? "bg-blue text-white" : "bg-[#f5f5f7]"}`}>{c}</button>
                  ))}
                </div>
                {input("Other certifications", data.experience.certOther, (v) => patch((d) => ({ ...d, experience: { ...d.experience, certOther: v } })))}
                <div className="flex gap-2">
                  {["yes", "no"].map((v) => (
                    <button type="button" key={v} aria-pressed={data.experience.otherAgencies === v} onClick={() => patch((d) => ({ ...d, experience: { ...d.experience, otherAgencies: v } }))} className={`rounded-full px-4 py-2 text-sm ${data.experience.otherAgencies === v ? "bg-ink text-white" : "bg-[#f5f5f7]"}`}>{v === "yes" ? "Yes, other agencies" : "No other agencies"}</button>
                  ))}
                </div>
                {data.experience.otherAgencies === "yes" ? <textarea value={data.experience.agenciesDetail} onChange={(e) => patch((d) => ({ ...d, experience: { ...d.experience, agenciesDetail: e.target.value } }))} rows={3} className="w-full rounded-xl bg-[#f5f5f7] p-3 hairline" placeholder="Agency, location, dates" /> : null}
              </>
            )}
            {st.key === "work" && (
              <>
                {data.employment.jobs.map((j, i) => (
                  <fieldset key={i} className="space-y-2 rounded-2xl bg-[#f5f5f7] p-4">
                    <legend className="font-semibold">Employer {i + 1}</legend>
                    {input("Place", j.place, (v) => patch((d) => { const jobs = d.employment.jobs.slice(); jobs[i] = { ...jobs[i], place: v }; return { ...d, employment: { ...d.employment, jobs } }; }))}
                    {input("Duties", j.duties, (v) => patch((d) => { const jobs = d.employment.jobs.slice(); jobs[i] = { ...jobs[i], duties: v }; return { ...d, employment: { ...d.employment, jobs } }; }))}
                    {i > 0 ? <button type="button" className="text-sm text-crimson" onClick={() => patch((d) => ({ ...d, employment: { ...d.employment, jobs: d.employment.jobs.filter((_, n) => n !== i) } }))}>Remove</button> : null}
                  </fieldset>
                ))}
                {data.employment.jobs.length < 3 ? <button type="button" className="text-sm font-semibold text-blue" onClick={() => patch((d) => ({ ...d, employment: { ...d.employment, jobs: [...d.employment.jobs, blankJob()] } }))}>Add another employer</button> : null}
                <textarea value={data.employment.community} onChange={(e) => patch((d) => ({ ...d, employment: { ...d.employment, community: e.target.value } }))} rows={3} className="w-full rounded-xl bg-[#f5f5f7] p-3 hairline" placeholder="Community service" />
              </>
            )}
            {st.key === "bg" && (
              <>
                <p className="text-sm">Have you ever been convicted, fined, placed on probation or imprisoned for any misdemeanor or felony?</p>
                <div className="flex gap-2">
                  {["yes", "no"].map((v) => (
                    <button type="button" key={v} aria-pressed={data.background.convicted === v} onClick={() => patch((d) => ({ ...d, background: { ...d.background, convicted: v } }))} className={`rounded-full px-4 py-2 ${data.background.convicted === v ? "bg-ink text-white" : "bg-[#f5f5f7]"}`}>{v === "yes" ? "Yes" : "No"}</button>
                  ))}
                </div>
                {data.background.convicted === "yes" ? <textarea value={data.background.detail} onChange={(e) => patch((d) => ({ ...d, background: { ...d.background, detail: e.target.value } }))} rows={4} className="w-full rounded-xl bg-[#f5f5f7] p-3 hairline" placeholder="Offense, date, penalty" /> : null}
                <p className="text-xs text-muted">Answering yes doesn’t automatically disqualify you. Please be complete and honest.</p>
              </>
            )}
            {st.key === "refs" && (
              <>
                <p className="text-sm text-muted">List 3 or 4 people who know you well (not relatives). We contact references by email.</p>
                {data.references.map((r, i) => (
                  <fieldset key={i} className="space-y-2 rounded-2xl bg-[#f5f5f7] p-4">
                    <legend className="font-semibold">Reference {i + 1}{i >= 3 ? " · optional" : ""}</legend>
                    {input("Full name", r.name, (v) => patch((d) => { const references = d.references.slice(); references[i] = { ...references[i], name: v }; return { ...d, references }; }), { required: i < 3 })}
                    {input("Relationship", r.relationship, (v) => patch((d) => { const references = d.references.slice(); references[i] = { ...references[i], relationship: v }; return { ...d, references }; }))}
                    {input("Email", r.email, (v) => patch((d) => { const references = d.references.slice(); references[i] = { ...references[i], email: v }; return { ...d, references }; }), { type: "email" })}
                    {input("Phone", r.phone, (v) => patch((d) => { const references = d.references.slice(); references[i] = { ...references[i], phone: v }; return { ...d, references }; }), { type: "tel" })}
                  </fieldset>
                ))}
                {data.references.length < 4 ? <button type="button" className="text-sm font-semibold text-blue" onClick={() => patch((d) => ({ ...d, references: [...d.references, blankRef()] }))}>Add a fourth reference</button> : null}
                <p className="text-xs text-muted">{data.references.filter(refUsed).length} listed</p>
              </>
            )}
            {st.key === "sign" && (
              <>
                <div className="space-y-2 rounded-2xl bg-[#f5f5f7] p-4 text-sm">
                  <div className="flex justify-between"><span>Name</span><b>{p.first} {p.last}</b></div>
                  <div className="flex justify-between"><span>Email</span><b>{p.email}</b></div>
                  <div className="flex justify-between"><span>Membership</span><b>{p.type || "—"}</b></div>
                  <div className="flex justify-between"><span>License</span><b>{p.dlState} ending {String(p.dlNumber).slice(-4) || "—"}</b></div>
                  <div className="flex justify-between"><span>References</span><b>{data.references.filter(refUsed).map((r) => r.name).join(", ")}</b></div>
                </div>
                <div className="max-h-48 space-y-2 overflow-auto rounded-2xl p-4 text-xs leading-relaxed text-muted hairline">
                  {RELEASE.map((para) => <p key={para.slice(0, 24)}>{para}</p>)}
                </div>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={data.signature.confirmed} onChange={(e) => patch((d) => ({ ...d, signature: { ...d.signature, confirmed: e.target.checked } }))} /> I have read the statement above, and checking this box with my typed name is my electronic signature.</label>
                {input("Type your full legal name", data.signature.name, (v) => patch((d) => ({ ...d, signature: { ...d.signature, name: v } })), { required: true })}
                <input id="hp" name="website" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />
              </>
            )}
            {errors.length ? (
              <div role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-crimson">
                <b>Please fix {errors.length === 1 ? "this" : "these"}:</b>
                <ul className="mt-1 list-disc pl-5">{errors.map((er) => <li key={er.path}>{er.msg}</li>)}</ul>
              </div>
            ) : null}
            <div className="flex items-center justify-between pt-2">
              {step ? <button type="button" className="rounded-full px-4 py-2 hairline" onClick={() => go(step - 1)}>Back</button> : <span />}
              <button className="rounded-full bg-blue px-5 py-2.5 font-semibold text-white press">{step === APPLY_STEPS.length - 1 ? "Submit application" : "Continue"}</button>
            </div>
          </form>
          <p className="mt-4 text-xs text-muted">Fields marked * are required. Answers stay on this device until you submit.</p>
        </div>
      </main>
    </div>
  );
}
