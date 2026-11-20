import { useCallback, useEffect, useRef, useState } from "react";
import { useBackend, useToast } from "../appContext";

export interface McContext { view: string; applicantId?: string; applicantName?: string }
export interface McItem { id: string; title: string; sub?: string }
interface Calls { n: number; limit: number; provider: string; fastModel?: string; deepModel?: string }

export function MedControl({ open, onClose, context, hints, onOpen }: {
  open: boolean;
  onClose: () => void;
  context: McContext;
  hints: Record<string, { stage?: string; next?: string; todo?: string; booked?: string }>;
  onOpen: (id: string) => void;
}) {
  const backend = useBackend();
  const toast = useToast();
  const [calls, setCalls] = useState<Calls | null>(null);
  const [log, setLog] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [items, setItems] = useState<McItem[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const turn = useRef(0);
  const wipe = useCallback(() => {
    turn.current += 1;
    setLog([]);
    setItems([]);
    setDraft("");
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) wipe();
  }, [open, wipe]);
  useEffect(() => { wipe(); }, [context.view, context.applicantId, wipe]);
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) wipe(); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [wipe]);

  useEffect(() => {
    if (!open) return;
    backend.call("medControl", { job: "usage" }).then((r) => setCalls(r as Calls)).catch(() => {});
  }, [open, backend]);

  async function ask(job: string, extra: Record<string, unknown> = {}, display?: string) {
    const mine = turn.current;
    setBusy(true);
    const prior = log;
    if (display) setLog((l) => (mine === turn.current ? [...l, { role: "user", text: display }] : l));
    try {
      const messages = job === "chat" ? [...prior, { role: "user" as const, text: display || draft }].map((m) => ({ role: m.role, text: m.text })) : undefined;
      const res = await backend.call("medControl", { job, messages, hints, context, ...extra }) as {
        text?: string; items?: McItem[]; calls?: Calls; questions?: string[]; subject?: string;
      };
      if (mine !== turn.current) return;
      if (res.calls) setCalls(res.calls);
      if (res.items) setItems(res.items);
      const text = res.questions ? res.questions.map((q, i) => `${i + 1}. ${q}`).join("\n") : res.subject ? `Subject: ${res.subject}\n\n${res.text || ""}` : res.text || "";
      if (text) setLog((l) => [...l, { role: "assistant", text }]);
      setDraft("");
    } catch (e) {
      if (mine === turn.current) toast((e as Error).message || "Med Control couldn't answer.");
    } finally { if (mine === turn.current) setBusy(false); }
  }

  if (!open) return null;
  return (
    <aside data-screen="medcontrol" className="fixed inset-0 z-[70] flex flex-col bg-white shadow-2xl sm:left-auto sm:w-full sm:max-w-md sm:border-l sm:border-black/10" role="dialog" aria-label="Med Control">
      <header className="flex items-start justify-between gap-3 border-b border-black/5 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue">Med Control</p>
          <h2 className="text-lg font-semibold tracking-tight">PVRS assistant</h2>
          <p className="text-xs text-muted">{context.applicantName ? context.applicantName : "Pipeline"} · {calls ? `${calls.n} / ${calls.limit} today` : "…"} · {calls?.provider === "anthropic" ? "Claude" : calls?.provider === "groq" ? "Groq" : calls?.provider || "checking"}</p>
          <p className="mt-1 text-xs text-muted">Chats aren't saved and clear when you close this.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="rounded-full px-3 py-1 text-sm hairline" onClick={wipe}>Clear</button>
          <button type="button" className="rounded-full px-3 py-1 text-sm hairline" onClick={onClose}>Close</button>
        </div>
      </header>
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        <button type="button" className="shrink-0 rounded-full bg-[#f5f5f7] px-3 py-1.5 text-xs font-medium" onClick={() => ask("briefing", {}, "What needs my attention today?")}>Today</button>
        {context.applicantId ? <button type="button" className="shrink-0 rounded-full bg-[#f5f5f7] px-3 py-1.5 text-xs font-medium" onClick={() => ask("brief", { id: context.applicantId }, "Applicant brief")}>Brief</button> : null}
        {context.applicantId ? <button type="button" className="shrink-0 rounded-full bg-[#f5f5f7] px-3 py-1.5 text-xs font-medium" onClick={() => ask("questions", { id: context.applicantId }, "Interview questions")}>Questions</button> : null}
        {context.applicantId ? <button type="button" className="shrink-0 rounded-full bg-[#f5f5f7] px-3 py-1.5 text-xs font-medium" onClick={() => ask("draft_email", { id: context.applicantId, kind: "welcome" }, "Draft welcome email")}>Welcome email</button> : null}
      </div>
      <div className="flex-1 space-y-3 overflow-auto px-4 pb-3">
        {items.map((item) => (
          <button key={item.id + item.title} type="button" onClick={() => onOpen(item.id)} className="block w-full rounded-2xl bg-[#f5f5f7] px-3 py-2 text-left text-sm press">
            <b>{item.title}</b>
            {item.sub ? <div className="text-xs text-muted">{item.sub}</div> : null}
          </button>
        ))}
        {log.map((m, i) => (
          <div key={i} className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "bg-blue text-white" : "bg-[#f5f5f7]"}`}>
            {m.text.split(/(\[\[[^\]]+\]\])/).map((part, n) => {
              const hit = part.match(/^\[\[(.+)\|([A-Za-z0-9_-]+)\]\]$/);
              if (!hit) return <span key={n}>{part}</span>;
              return <button key={n} type="button" className="font-semibold underline" onClick={() => onOpen(hit[2])}>{hit[1]}</button>;
            })}
          </div>
        ))}
        {!log.length ? <p className="text-sm text-muted">Ask about the roster, or start with what needs you today.</p> : null}
      </div>
      <form className="border-t border-black/5 p-3" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) void ask("chat", {}, draft.trim()); }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Ask Med Control…" aria-label="Message Med Control" className="w-full rounded-2xl bg-[#f5f5f7] p-3 text-sm hairline" />
        <button disabled={busy} className="mt-2 rounded-full bg-blue px-4 py-2 text-sm font-semibold text-white">{busy ? "Thinking…" : "Send"}</button>
      </form>
    </aside>
  );
}
