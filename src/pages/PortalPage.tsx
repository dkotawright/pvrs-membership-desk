import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useBackend, useGo, useToast } from "../appContext";
import { CONTACT_EMAIL } from "../lib/config";
import { DAY, first, isConfidential, icsFile, slotLong, slotTime } from "../lib/domain";
import { docId } from "../lib/backend";
import { FORMS, HEPB_LABEL, SIGNABLE, formByKey, readFormValues } from "../lib/forms";

const MAX = 25 * 1024 * 1024;
const WORD = ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
function typeOf(f: File) {
  if (f.type) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", doc: WORD[0], docx: WORD[1] };
  return map[ext] || "";
}
function okType(f: File) {
  const t = typeOf(f);
  return t.startsWith("image/") || t === "application/pdf" || WORD.includes(t);
}

interface Step { label: string; detail?: string; state: string; short?: string }

export function PortalPage({ id, backToDesk = false }: { id: string; backToDesk?: boolean }) {
  const backend = useBackend();
  const toast = useToast();
  const go = useGo();
  const [pd, setPd] = useState<Record<string, unknown> | null>(null);
  const [files, setFiles] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [msgs, setMsgs] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [slots, setSlots] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [oslots, setOslots] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [forms, setForms] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const [signing, setSigning] = useState<string | null>(null);
  const me = backend.current();

  useEffect(() => backend.watch("portal", (docs) => {
    const mine = docs.find((d) => d.id === id);
    setPd(mine?.data || null);
  }), [backend, id]);
  useEffect(() => backend.watch(`portal/${id}/files`, (docs) => setFiles(docs.map((d) => ({ id: d.id, data: d.data })))), [backend, id]);
  useEffect(() => backend.watch(`portal/${id}/messages`, (docs) => setMsgs(docs.map((d) => ({ id: d.id, data: d.data })).sort((a, b) => Number(a.data.at) - Number(b.data.at)))), [backend, id]);
  useEffect(() => backend.watch(`portal/${id}/forms`, (docs) => setForms(docs.map((d) => ({ id: d.id, data: d.data })))), [backend, id]);
  useEffect(() => backend.watch("slots", (docs) => setSlots(docs.map((d) => ({ id: d.id, data: d.data })))), [backend]);
  useEffect(() => backend.watch("orientSlots", (docs) => setOslots(docs.map((d) => ({ id: d.id, data: d.data })))), [backend]);

  const steps = (pd?.steps as Step[]) || [];
  const nm = !!pd?.orientation;
  const cur = steps.findIndex((s) => s.state === "now");
  const lane = nm ? "onb" : cur <= 2 ? "screen" : cur === 3 ? "int" : cur === 4 ? "appr" : "onb";
  const openSlots = useMemo(() => slots.filter((s) => !s.data.bookedBy && Number(s.data.start) > Date.now() + DAY).sort((a, b) => Number(a.data.start) - Number(b.data.start)), [slots]);
  const interview = pd?.interview as { slotId?: string; start: number; location?: string; duration?: number } | null;
  const ivDone = steps.some((s) => s.label === "Interview" && s.state === "done");

  async function book(slotId: string) {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    if (Number(slot.data.start) < Date.now() + DAY) return toast("That time is inside 24 hours. Message us to reschedule.");
    try {
      await backend.commit([
        { op: "set", path: "slots/" + slotId, data: { bookedBy: id }, merge: true },
        { op: "set", path: "portal/" + id, data: { interview: { slotId, start: slot.data.start, duration: slot.data.duration || null, location: slot.data.location || "", bookedAt: Date.now() } }, merge: true },
      ]);
      toast("Interview booked.");
      setPick(null);
    } catch { toast("Couldn't book that time. Try again."); }
  }
  async function cancelIv() {
    if (!interview?.slotId) return;
    if (interview.start < Date.now() + DAY) {
      await send("I need to reschedule my interview.");
      return;
    }
    try {
      await backend.commit([
        { op: "set", path: "slots/" + interview.slotId, data: { bookedBy: null }, merge: true },
        { op: "set", path: "portal/" + id, data: { interview: null }, merge: true },
      ]);
      toast("Interview cancelled.");
    } catch { toast("Couldn't cancel. Try again."); }
  }
  async function send(body?: string) {
    const value = (body ?? text).trim();
    if (!value || !me) return;
    try {
      await backend.add(`portal/${id}/messages`, { text: value.slice(0, 2000), from: "applicant", by: me.email, name: pd?.name || me.name, at: Date.now() });
      setText("");
    } catch { toast("Couldn't send. Try again."); }
  }
  async function upload(file: File, docKey: string, label: string) {
    if (!me) return;
    if (file.size > MAX || !okType(file)) {
      const why = file.size > MAX ? "That file is over 25 MB." : "Send a PDF, photo, or Word file.";
      await backend.add(`portal/${id}/uploadErrors`, { name: file.name, size: file.size, type: file.type, label, code: "invalid", message: why, at: Date.now(), by: me.email, device: navigator.userAgent.slice(0, 80) }).catch(() => {});
      toast(why);
      return;
    }
    const conf = docKey === "_private" || isConfidential(label);
    const fid = docId();
    const path = conf ? `confidential/${id}/${fid}` : `uploads/${id}/${fid}`;
    try {
      await backend.upload(path, file, typeOf(file) || "application/octet-stream");
      const now = Date.now();
      if (conf) {
        await backend.set("vault/" + fid, { appId: id, appName: pd?.name || "", label: label || "Secure document", name: file.name, path, size: file.size, contentType: typeOf(file), uploadedAt: now, uploadedBy: me.email, from: "applicant" });
        await backend.set(`portal/${id}/files/${fid}`, { docKey, label, name: "Private document", path: "", size: file.size, contentType: typeOf(file), uploadedAt: now, uploadedBy: me.email, confidential: true });
      } else {
        await backend.set(`portal/${id}/files/${fid}`, { docKey, label, name: file.name, path, size: file.size, contentType: typeOf(file), uploadedAt: now, uploadedBy: me.email });
      }
      toast(conf ? "Sent securely." : "Uploaded.");
    } catch { toast("The upload didn't go through. Try again, or email " + CONTACT_EMAIL); }
  }
  function onDrop(e: DragEvent, docKey: string, label: string) {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void upload(f, docKey, label);
  }
  function pickFile(docKey: string, label: string) {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*,.pdf,.doc,.docx";
    input.onchange = () => { const f = input.files?.[0]; if (f) void upload(f, docKey, label); };
    input.click();
  }
  function calendar(start: number, title: string) {
    const blob = new Blob([icsFile([{ uid: id + "-" + start, start, duration: 45, title, location: "Potsdam Volunteer Rescue Squad" }])], { type: "text/calendar" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "pvrs.ics"; a.click();
  }

  if (!pd) return <div className="grid min-h-full place-items-center text-muted">Loading your page…</div>;
  const docs = (pd.docs as { key: string; label: string; received?: boolean }[]) || [];
  const soon = interview && !ivDone && interview.start > Date.now() && interview.start - Date.now() < 2 * DAY;
  const signOpen = Number(pd.signUntil || 0) > Date.now();
  const orient = pd.orientation as { done: number; total: number; items: { key: string; label: string; date?: string; req?: boolean; link?: string; cert?: boolean }[]; due?: string } | null;

  const move = (() => {
    const refReplace = (pd.refReplace as number[]) || [];
    if (refReplace.length) return { title: "We need a different reference", sub: "One of your references couldn't be reached.", act: "Add a reference" };
    if (!nm && !ivDone && !interview && pd.bookingOpen && openSlots.length) return { title: "Pick your interview time", sub: "Choose an open time. You can change it up to 24 hours before.", act: "times" };
    if (soon && interview) return { title: `Your interview is ${slotLong(interview.start)}`, sub: String(pd.bring || ""), act: "calendar" };
    const missing = docs.find((d) => !d.received && !files.some((f) => f.data.docKey === d.key));
    if (missing) return { title: `Upload: ${missing.label}`, sub: "A PDF or a clear photo is fine.", act: missing.key, label: missing.label };
    return null;
  })();

  return (
    <div data-screen="portal" className={`flex h-dvh flex-col overflow-hidden bg-canvas lane-${lane}`}>
      <header className="frost z-20 shrink-0 border-b border-black/5">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <img src="/img/logo.png" alt="Potsdam Volunteer Rescue Squad" className="h-12 w-12 crest" />
          <div className="flex gap-2 text-sm">
            {backToDesk ? <button type="button" className="rounded-full px-3 py-1 hairline" onClick={() => go("/")}>Back to the desk</button> : null}
            <button type="button" className="rounded-full px-3 py-1 hairline" onClick={() => backend.signOut().then(() => location.replace("/signin"))}>Sign out</button>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{nm ? "New member" : "Applicant portal"}</p>
        <h1 className="text-4xl font-semibold">Hi {String(pd.firstName || first(String(pd.name || "")) || "there")}</h1>
        <p className="mt-1 text-muted">{nm ? "Welcome to the squad." : String(pd.type || "Membership") + " · follow every step here"}</p>
      </div>
      <main className="mx-auto mt-4 max-w-3xl space-y-4 px-4 pb-6">
        <section className="card p-5" aria-label="Your next step" data-screen="next-step">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--lane)]">Your next step</p>
          {move ? (
            <>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">{move.title}</h2>
              {move.sub ? <p className="mt-1 text-sm text-muted">{move.sub}</p> : null}
              {move.act === "times" ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {openSlots.slice(0, 3).map((s) => (
                    <button key={s.id} type="button" onClick={() => setPick(s.id)} className={`rounded-2xl p-3 text-left press ${pick === s.id ? "bg-blue text-white" : "bg-[#f5f5f7]"}`}>
                      <div className="text-xs">{new Date(Number(s.data.start)).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
                      <div className="text-lg font-semibold">{slotTime(Number(s.data.start))}</div>
                      {s.data.hostName ? <div className="text-xs opacity-80">with {String(s.data.hostName)}</div> : null}
                    </button>
                  ))}
                </div>
              ) : null}
              {pick ? <button type="button" className="mt-3 rounded-full bg-blue px-4 py-2 font-semibold text-white" onClick={() => book(pick)}>Book this time</button> : null}
              {move.act === "calendar" && interview ? <button type="button" className="mt-3 rounded-full bg-blue px-4 py-2 font-semibold text-white" onClick={() => calendar(interview.start, "PVRS interview")}>Add to calendar</button> : null}
              {move.label ? <button type="button" className="mt-3 rounded-full bg-blue px-4 py-2 font-semibold text-white" onClick={() => pickFile(move.act, move.label!)}>{isConfidential(move.label) ? "Secure upload" : "Upload"}</button> : null}
            </>
          ) : (
            <>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Nothing needed from you right now</h2>
              <p className="mt-1 text-sm text-muted">We’ll let you know here, and by email, as soon as there’s a next step.</p>
            </>
          )}
        </section>

        {soon && interview ? <section className="card border-amber-200 bg-amber-50 p-4 text-sm">Your interview is coming up: <b>{slotLong(interview.start)}</b>. <button type="button" className="font-semibold text-blue" onClick={() => calendar(interview.start, "PVRS interview")}>Add to calendar</button></section> : null}

        {nm && orient ? (
          <section className="card p-5" id="orient">
            <h2 className="text-xl font-semibold">Orientation</h2>
            <p className="mt-1 text-3xl font-semibold tracking-tight"><span className="text-[var(--lane)]">{orient.done}</span> of {orient.total} done</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full bg-[var(--lane)]" style={{ width: `${orient.total ? (orient.done / orient.total) * 100 : 0}%` }} /></div>
            <ul className="mt-4 space-y-2">
              {orient.items.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f5f5f7] px-3 py-3 text-sm">
                  <span><b className={item.date ? "text-act" : ""}>{item.date ? "✓ " : ""}{item.label}</b>{item.link ? <a className="mt-1 block text-xs text-blue" href={item.link} target="_blank" rel="noreferrer">Take the free course</a> : null}</span>
                  {item.cert || item.req ? <button type="button" className="rounded-full bg-white px-3 py-1 hairline" onClick={() => pickFile("onb:" + item.key, item.label)}>{item.date ? "Add file" : "Upload"}</button> : null}
                </li>
              ))}
            </ul>
            <h3 className="mt-6 font-semibold">Forms to sign</h3>
            <p className="text-sm text-muted">{signOpen ? "Signing is open. Read each form, then sign with your name." : "These unlock during your orientation session."}</p>
            <ul className="mt-2 space-y-2">
              {FORMS.map((f) => {
                const sent = forms.find((x) => x.id === f.key);
                return (
                  <li key={f.key} className="flex items-center justify-between rounded-2xl bg-[#f5f5f7] px-3 py-2 text-sm">
                    <span>{f.title}{f.confidential ? " · secure" : ""}</span>
                    {sent ? <span className="text-act">Signed</span> : signOpen && !f.confidential ? <button type="button" className="rounded-full bg-blue px-3 py-1 text-white" onClick={() => setSigning(f.key)}>Sign</button> : f.confidential && signOpen ? <button type="button" className="rounded-full bg-ink px-3 py-1 text-white" onClick={() => setSigning(f.key)}>Sign securely</button> : <span className="text-muted">At your session</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <section className="card p-5" id="journey">
            <h2 className="text-xl font-semibold">Your application</h2>
            {steps.length ? (
              <>
                <p className="mt-1 text-sm text-muted">{steps.every((s) => s.state === "done") ? "All steps complete" : `Step ${Math.max(1, cur + 1)} of ${steps.length}: ${steps[Math.max(0, cur)]?.label || ""}${steps[Math.max(0, cur)]?.short ? ` (${steps[Math.max(0, cur)].short})` : ""}`}</p>
                <div className="mt-3 flex gap-1">{steps.map((s, i) => <i key={i} className={`h-1.5 flex-1 rounded-full ${s.state === "done" ? "bg-[var(--lane)]" : s.state === "now" ? "bg-[var(--lane)]/50" : "bg-black/10"}`} />)}</div>
                <ol className="mt-4 space-y-3">
                  {steps.map((s) => (
                    <li key={s.label} className="flex gap-3 text-sm">
                      <span className={`mt-0.5 grid h-5 w-5 place-items-center rounded-full text-[10px] ${s.state === "done" ? "bg-act text-white" : s.state === "now" ? "bg-[var(--lane)] text-white" : "bg-black/10"}`}>{s.state === "done" ? "✓" : ""}</span>
                      <span><b>{s.label}</b>{s.state !== "todo" && s.detail ? <div className="text-muted">{s.detail}</div> : null}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : <p className="text-sm text-muted">We’ve received your application. Your progress will show here soon.</p>}
          </section>
        )}

        {!nm ? (
          <section className="card p-5" id="interview">
            <h2 className="text-xl font-semibold">Interview</h2>
            {ivDone ? <p className="mt-2 text-sm text-muted">Your interview is complete. Thank you.</p> : interview ? (
              <div className="mt-3">
                <p className="text-lg font-semibold">{slotLong(interview.start)}</p>
                {pd.bring ? <p className="mt-1 text-sm text-muted"><b>What to bring:</b> {String(pd.bring)}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="rounded-full bg-[#f5f5f7] px-3 py-1.5 text-sm" onClick={() => calendar(interview.start, "PVRS interview")}>Add to calendar</button>
                  <button type="button" className="rounded-full bg-[#f5f5f7] px-3 py-1.5 text-sm" onClick={() => cancelIv()}>{interview.start > Date.now() + DAY ? "Cancel interview" : "I need to reschedule"}</button>
                </div>
              </div>
            ) : pd.bookingOpen ? (
              <div className="mt-3 grid gap-2">
                {openSlots.length ? openSlots.map((s) => (
                  <button key={s.id} type="button" onClick={() => book(s.id)} className="flex items-center justify-between rounded-2xl bg-[#f5f5f7] px-4 py-3 text-left press">
                    <span>{slotLong(Number(s.data.start))}{s.data.hostName ? ` · with ${s.data.hostName}` : ""}</span>
                    <span className="text-sm font-semibold text-blue">Book</span>
                  </button>
                )) : <p className="text-sm text-muted">No interview times are open right now.</p>}
              </div>
            ) : <p className="mt-2 text-sm text-muted">Interview times will open here once your application review is underway.</p>}
          </section>
        ) : null}

        <section className="card p-5" id="messages">
          <h2 className="text-xl font-semibold">Messages</h2>
          <div className="mt-3 space-y-2">
            {msgs.length ? msgs.map((m) => (
              <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.data.from === "applicant" ? "ml-auto bg-blue text-white" : "bg-[#f5f5f7]"}`}>
                <p>{String(m.data.text || "")}</p>
                <p className={`mt-1 text-[10px] ${m.data.from === "applicant" ? "text-white/70" : "text-muted"}`}>{m.data.from === "staff" ? `${String(m.data.name || "PVRS").split(" ")[0]} · PVRS Membership` : "You"}</p>
              </div>
            )) : <p className="text-sm text-muted">No messages yet. Questions about your application go here.</p>}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} aria-label="Your message" placeholder="Type your question…" className="flex-1 rounded-2xl bg-[#f5f5f7] p-3 text-sm hairline" />
            <button className="self-end rounded-full bg-blue px-4 py-2 text-sm font-semibold text-white">Send</button>
          </form>
        </section>

        <section className="card p-5" id="documents"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => onDrop(e, "", "Document")}>
          <h2 className="text-xl font-semibold">Documents</h2>
          <div className={`mt-3 rounded-2xl border border-dashed p-6 text-center text-sm ${drag ? "border-blue bg-blue/5" : "border-black/15"}`}>
            Drop a PDF or photo here, or use Upload. Up to 25 MB.
          </div>
          <ul className="mt-3 space-y-2">
            {docs.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-2 text-sm">
                <span>{d.label}{isConfidential(d.label) ? <span className="block text-xs text-muted">Secure upload. Only the membership coordinator, administrators and the paperwork coordinator can open it.</span> : null}</span>
                {d.received ? <span className="text-act">Received</span> : <button type="button" className="rounded-full bg-blue px-3 py-1 text-white" onClick={() => pickFile(d.key, d.label)}>Upload</button>}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="rounded-full px-3 py-1.5 text-sm hairline" onClick={() => pickFile("", "Document")}>Send another document</button>
            <button type="button" className="rounded-full px-3 py-1.5 text-sm hairline" onClick={() => pickFile("_private", "Secure document")}>Secure document upload</button>
          </div>
        </section>
      </main>
      </div>
      <nav className="frost flex shrink-0 justify-around border-t border-black/5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs sm:hidden" aria-label="Jump to">
        <a href={nm ? "#orient" : "#journey"} className="px-3 py-2">{nm ? "Orientation" : "My application"}</a>
        <a href="#documents" className="px-3 py-2">Documents</a>
        <a href="#messages" className="px-3 py-2">Messages</a>
      </nav>
      {signing ? <SignSheet formKey={signing} appId={id} onClose={() => setSigning(null)} /> : null}
    </div>
  );
}

function SignSheet({ formKey, appId, onClose }: { formKey: string; appId: string; onClose: () => void }) {
  const f = formByKey(formKey);
  const backend = useBackend();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  if (!f) return null;
  async function sign() {
    const read = readFormValues(f!, values);
    if ("missing" in read && read.missing) return toast(read.missing);
    if (name.trim().length < 2) return toast("Type your name to sign.");
    const me = backend.current();
    if (!me) return;
    const payload = { key: f!.key, title: f!.title, values, name: name.trim(), sig: "", signedAt: Date.now(), by: me.email };
    try {
      if (f!.confidential || f!.key === "hepb") {
        const fid = docId();
        await backend.set("vault/" + fid, { appId, appName: "", label: HEPB_LABEL, name: "Private document", path: "", size: 0, contentType: "", uploadedAt: Date.now(), uploadedBy: me.email, from: "applicant", form: { ...payload, key: "hepb", sig: name } });
        await backend.set(`portal/${appId}/files/${fid}`, { docKey: "", label: HEPB_LABEL, name: "Private document", path: "", size: 0, contentType: "", uploadedAt: Date.now(), uploadedBy: me.email, confidential: true });
      } else if (SIGNABLE.includes(f!.key)) {
        await backend.set(`portal/${appId}/forms/${f!.key}`, payload);
      }
      toast("Signed.");
      onClose();
    } catch { toast("Signing is only open during your session. If it should be open, ask the orientation chair."); }
  }
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black/40 p-4" role="dialog">
      <div className="card mx-auto max-w-lg p-6">
        <h2 className="text-xl font-semibold">{f.title}</h2>
        {f.intro ? <p className="mt-2 text-sm leading-relaxed">{f.intro}</p> : null}
        {f.bullets ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{f.bullets.map((b) => <li key={b.slice(0, 24)}>{b}</li>)}</ul> : null}
        {f.statement ? <p className="mt-2 text-sm">{f.statement.replace("{name}", name || "__________").replace("{date}", new Date().toLocaleDateString())}</p> : null}
        {(f.tf || []).map((q, i) => (
          <fieldset key={q} className="mt-3 text-sm"><legend>{i + 1}. {q}</legend>
            {["True", "False"].map((v) => <label key={v} className="mr-3"><input type="radio" name={"tf" + i} onChange={() => setValues({ ...values, ["tf" + i]: v })} /> {v}</label>)}
          </fieldset>
        ))}
        {(f.scen || []).map((q, i) => (
          <label key={q} className="mt-3 block text-sm">{i + 1}. {q}<textarea className="mt-1 w-full rounded-xl bg-[#f5f5f7] p-2" rows={2} onChange={(e) => setValues({ ...values, ["sc" + i]: e.target.value })} /></label>
        ))}
        {(f.groups || []).map(([title, fields]) => (
          <div key={title} className="mt-3">
            <h3 className="font-semibold">{title}</h3>
            {fields.map(([k, l, req]) => <label key={k} className="mt-2 block text-sm">{l}{req ? "" : " (optional)"}<input className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-2" onChange={(e) => setValues({ ...values, [k]: e.target.value })} /></label>)}
          </div>
        ))}
        <label className="mt-4 block text-sm font-medium">Type your full name to sign<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 hairline" /></label>
        <div className="mt-4 flex gap-2">
          <button type="button" className="rounded-full px-4 py-2 hairline" onClick={onClose}>Close</button>
          <button type="button" className="rounded-full bg-blue px-4 py-2 font-semibold text-white" onClick={() => sign()}>Sign</button>
        </div>
      </div>
    </div>
  );
}
