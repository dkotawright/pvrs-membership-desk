import { useEffect, useState, type FormEvent } from "react";
import { useBackend, useToast } from "../appContext";
import { CONTACT_EMAIL } from "../lib/config";
import { RATINGS, blankRefAnswers, refProblems, refQuestions, refResponse, trustQuestion, type RefAnswers } from "../lib/reference";

export function ReferencePage({ token }: { token: string }) {
  const backend = useBackend();
  const toast = useToast();
  const [state, setState] = useState<"loading" | "bad" | "expired" | "already" | "form" | "done">("loading");
  const [link, setLink] = useState<Record<string, unknown> | null>(null);
  const [answers, setAnswers] = useState<RefAnswers>(blankRefAnswers());
  const [errors, setErrors] = useState<{ msg: string }[]>([]);
  const [sending, setSending] = useState(false);
  const key = "pvrsRef." + token;

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) { setState("bad"); return; }
      try {
        const s = await backend.get("refLinks/" + token);
        if (stop) return;
        if (!s) { setState("bad"); return; }
        setLink(s.data);
        if (s.data.submittedAt) { setState("already"); return; }
        if (Number(s.data.expiresAt || 0) < Date.now()) { setState("expired"); return; }
        let draft: Partial<RefAnswers> | null = null;
        try { draft = JSON.parse(localStorage.getItem(key) || "null"); } catch { /* ignore */ }
        const base = blankRefAnswers();
        setAnswers({ ...base, ...draft, ratings: { ...base.ratings, ...(draft?.ratings || {}) }, signName: draft?.signName || String(s.data.refName || "") });
        setState("form");
      } catch { if (!stop) setState("bad"); }
    })();
    return () => { stop = true; };
  }, [backend, token, key]);

  useEffect(() => {
    if (state !== "form") return;
    const t = setTimeout(() => { try { localStorage.setItem(key, JSON.stringify(answers)); } catch { /* ignore */ } }, 300);
    return () => clearTimeout(t);
  }, [answers, state, key]);

  const first = String(link?.first || "the applicant");
  const full = String(link?.applicant || "the applicant");

  async function send(e: FormEvent) {
    e.preventDefault();
    const hp = (document.getElementById("rf-hp") as HTMLInputElement | null)?.value;
    if (hp) { setState("done"); return; }
    const list = refProblems(answers, first);
    setErrors(list);
    if (list.length) return;
    setSending(true);
    try {
      const now = Date.now();
      await backend.commit([
        { op: "set", path: "refResponses/" + token, data: refResponse(answers, now) as unknown as Record<string, unknown>, merge: false },
        { op: "set", path: "refLinks/" + token, data: { submittedAt: now }, merge: true },
      ]);
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      setState("done");
    } catch (err) {
      console.error(err);
      toast(`Couldn't send your reference. Check your connection and try again, or email ${CONTACT_EMAIL}.`);
    } finally { setSending(false); }
  }

  return (
    <div data-screen="reference" className="min-h-full bg-canvas">
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="card rise p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Potsdam Volunteer Rescue Squad · Reference</p>
          {state === "loading" ? <p className="mt-6 text-muted">Loading…</p> : null}
          {state === "bad" ? <><h1 className="mt-2 text-3xl font-semibold">This link doesn’t work</h1><p className="mt-2 text-muted">Use the full link from the email, or contact {CONTACT_EMAIL}.</p></> : null}
          {state === "expired" ? <><h1 className="mt-2 text-3xl font-semibold">This link has expired</h1><p className="mt-2 text-muted">Contact {CONTACT_EMAIL} and we’ll send a new one.</p></> : null}
          {state === "already" ? <><h1 className="mt-2 text-3xl font-semibold">We already have your reference</h1><p className="mt-2 text-muted">Thank you. Your reference for {full} is with the membership committee.</p></> : null}
          {state === "done" ? <><h1 className="mt-2 text-3xl font-semibold">Thank you{answers.signName ? `, ${answers.signName.split(" ")[0]}` : ""}.</h1><p className="mt-2 text-muted">Your reference for {full} is with the PVRS Membership Committee.</p></> : null}
          {state === "form" ? (
            <form onSubmit={send} className="mt-2 space-y-5">
              <h1 className="text-3xl font-semibold tracking-tight">Reference for {full}</h1>
              <p className="text-sm leading-relaxed text-muted">{link?.refName ? `Hi ${String(link.refName).split(" ")[0]}, ` : ""}{full} applied to volunteer with the Potsdam Volunteer Rescue Squad and listed you as a reference. About 5 minutes. Your answers go only to the membership committee. {first} won’t see them.</p>
              <input id="rf-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 opacity-0" />
              {refQuestions(first).slice(0, 4).map(([k, label, req]) => (
                <label key={k} className="block text-sm font-medium">{label}{req ? <i className="text-crimson"> *</i> : <span className="text-muted"> optional</span>}
                  <textarea value={String(answers[k as keyof RefAnswers] || "")} onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })} rows={3} maxLength={4000} className="mt-1 w-full rounded-xl bg-[#f5f5f7] p-3 font-normal hairline" />
                </label>
              ))}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Please rate {first} <i className="text-crimson">*</i></legend>
                {RATINGS.map(([k, label]) => (
                  <div key={k} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">{label}</span>
                    <div className="flex gap-1" role="radiogroup" aria-label={label}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button type="button" key={n} aria-checked={answers.ratings[k] === n} role="radio" onClick={() => setAnswers({ ...answers, ratings: { ...answers.ratings, [k]: n } })} className={`h-10 w-10 rounded-full text-sm font-semibold press ${answers.ratings[k] === n ? "bg-blue text-white" : "bg-[#f5f5f7]"}`}>{n}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted">1 poor · 5 excellent</p>
              </fieldset>
              <div>
                <p className="text-sm font-medium">{trustQuestion(first)} <i className="text-crimson">*</i></p>
                <div className="mt-2 flex gap-2">
                  {["yes", "no"].map((v) => (
                    <button type="button" key={v} aria-pressed={answers.trustworthy === v} onClick={() => setAnswers({ ...answers, trustworthy: v })} className={`rounded-full px-4 py-2 text-sm ${answers.trustworthy === v ? "bg-ink text-white" : "bg-[#f5f5f7]"}`}>{v === "yes" ? "Yes" : "No"}</button>
                  ))}
                </div>
              </div>
              {refQuestions(first).slice(4).map(([k, label, req]) => (
                <label key={k} className="block text-sm font-medium">{label}{req ? <i className="text-crimson"> *</i> : <span className="text-muted"> optional</span>}
                  <textarea value={String(answers[k as keyof RefAnswers] || "")} onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })} rows={3} maxLength={4000} className="mt-1 w-full rounded-xl bg-[#f5f5f7] p-3 font-normal hairline" />
                </label>
              ))}
              <label className="block text-sm font-medium">Your name <i className="text-crimson">*</i>
                <input value={answers.signName} onChange={(e) => setAnswers({ ...answers, signName: e.target.value })} className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 hairline" />
              </label>
              {errors.length ? <div role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-crimson"><ul>{errors.map((er) => <li key={er.msg}>{er.msg}</li>)}</ul></div> : null}
              <button disabled={sending} className="rounded-full bg-blue px-5 py-2.5 font-semibold text-white press">{sending ? "Sending…" : "Send reference"}</button>
            </form>
          ) : null}
        </div>
      </main>
    </div>
  );
}
