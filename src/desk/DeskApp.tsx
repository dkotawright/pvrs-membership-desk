import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Calendar, FileText, LayoutGrid, List, MessageSquare, Plus, Search, Settings as SettingsIcon, Shield, Sparkles, Users, BarChart3, ClipboardList } from "lucide-react";
import { useBackend, useGate, useToast } from "../appContext";
import { InterviewPanel } from "./interview";
import { BulkBar, DupeBanner, Flyer, NotifySheet, Tour, mailRef, refUrl, usePushRefresh } from "./tools";
import { MedControl, type McContext } from "./MedControl";
import { docId, type Snap } from "../lib/backend";
import {
  ALL_TABS, DAY, LANES, STAGES, TYPES, canEditPath, canSeeApplicant, daysWaiting, first, get, inBoardQueue, inOrient, okEmail, refNudge,
  isSecurePath, ivScore, laneOf, mergeApplicants, nest, nextActionLabel, phaseBits, progress, refStatus, searchDesk,
  statusOf, tabDone, todoItems, type Applicant, type Settings, type TabId, ROLE_LABEL, showField, needsAction,
  welcomeMessage, portalPayload, onbItems, issueItems, skillItems, today, HEARD, signatureText,
} from "../lib/domain";

type View = "pipeline" | "messages" | "slots" | "board" | "team" | "settings" | "reports" | "orient" | "signoffs" | "library";

export function DeskApp() {
  const backend = useBackend();
  const gate = useGate();
  const toast = useToast();
  const actor = gate.actor!;
  const [shared, setShared] = useState<Snap[]>([]);
  const [priv, setPriv] = useState<Snap[]>([]);
  const [slots, setSlots] = useState<Snap[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [channels, setChannels] = useState<Snap[]>([]);
  const [posts, setPosts] = useState<Snap[]>([]);
  const [staff, setStaff] = useState<Snap[]>([]);
  const [requests, setRequests] = useState<Snap[]>([]);
  const [channelId, setChannelId] = useState("general");
  const [view, setView] = useState<View>("pipeline");
  const [mode, setMode] = useState<"board" | "list">("board");
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("app");
  const [q, setQ] = useState("");
  const [palette, setPalette] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [save, setSave] = useState("Saved");
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [mobileMore, setMobileMore] = useState(false);
  const [thread, setThread] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [tourOn, setTourOn] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);
  usePushRefresh();

  useEffect(() => {
    const where = actor.adminView ? undefined : [{ field: "interviewers", op: "array-contains" as const, value: actor.email }];
    const u1 = backend.watch("applicants", setShared, where);
    const u2 = actor.adminView ? backend.watchGroup("private", setPriv) : () => {};
    const u3 = backend.watch("slots", setSlots);
    const u4 = backend.watch("settings", (docs) => setSettings((docs.find((d) => d.id === "main")?.data || {}) as Settings));
    const chWhere = actor.canEdit ? undefined : [{ field: "members", op: "array-contains" as const, value: actor.email }];
    const u5 = backend.watch("channels", setChannels, chWhere);
    const u6 = actor.adminView ? backend.watch("staff", setStaff) : () => {};
    const u7 = actor.canEdit ? backend.watch("accessRequests", setRequests) : () => {};
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); };
  }, [backend, actor]);

  useEffect(() => backend.watch(`channels/${channelId}/posts`, setPosts), [backend, channelId]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); if (actor.canEdit) setAiOpen((v) => !v); }
      if (e.key === "/" && !typing) { e.preventDefault(); setPalette(true); }
      if (e.key === "Escape") { setPalette(false); setAiOpen(false); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [actor.canEdit]);

  const apps = useMemo(() => {
    return shared.map((s) => {
      const p = priv.find((d) => d.path === `applicants/${s.id}/private/main`);
      const slot = slots.find((sl) => sl.data.bookedBy === s.id);
      const booked = slot ? { slotId: slot.id, start: Number(slot.data.start), duration: Number(slot.data.duration) || null, location: String(slot.data.location || ""), hostName: String(slot.data.hostName || "") } : null;
      return mergeApplicants(s.data, p?.data || null, s.id, booked);
    }).filter((a) => canSeeApplicant(actor, a));
  }, [shared, priv, slots, actor]);

  const todos = useMemo(() => (actor.canEdit ? todoItems(apps, settings) : []), [apps, settings, actor.canEdit]);
  const hints = useMemo(() => {
    const h: Record<string, { stage?: string; next?: string; todo?: string }> = {};
    for (const a of apps) {
      const p = progress(a);
      h[a._id] = { stage: STAGES[p.stage]?.label, next: p.next || "", todo: todos.find((t) => t.id === a._id)?.text };
    }
    return h;
  }, [apps, todos]);

  const selected = apps.find((a) => a._id === sel) || null;
  const visible = apps.filter((a) => {
    if (filter === "action") return needsAction(a, settings);
    if (filter === "interviews") return !!a._booked && a._booked.start > Date.now() - DAY && a._booked.start < Date.now() + 7 * DAY;
    if (filter === "board") return inBoardQueue(a);
    if (filter === "onb") return inOrient(a) && progress(a).stage !== "act";
    if (filter === "all") return true;
    return laneOf(a) === filter;
  });

  function openFile(id: string, next?: TabId) {
    const a = apps.find((x) => x._id === id);
    if (!a) return;
    setSel(id);
    setTab(next || (inOrient(a) ? "onb" : "app"));
    setView("pipeline");
    setMode("list");
    document.querySelector("[data-screen='desk'] main")?.scrollTo({ top: 0 });
  }

  function fieldValue(a: Applicant, path: string) {
    const k = a._id + ":" + path;
    if (k in draft) return draft[k];
    const v = get(a, path);
    return v == null ? "" : v;
  }
  function edit(a: Applicant, path: string, value: unknown) {
    if (!canEditPath(actor, path)) { toast(actor.sched ? "That part is changed by the owner." : "View only. You can fill in the Interview tab."); return; }
    setDraft((d) => ({ ...d, [a._id + ":" + path]: value }));
    setSave("Saving…");
    const patch = { ...nest(path, value), ...(isSecurePath(path) ? { secUpdatedAt: Date.now(), secUpdatedBy: actor.email } : { updatedAt: Date.now(), updatedBy: actor.email }) };
    const root = isSecurePath(path) ? `applicants/${a._id}/private/main` : `applicants/${a._id}`;
    window.setTimeout(async () => {
      try {
        await backend.set(root, patch, true);
        if (actor.canEdit || actor.coord) {
          const next = mergeApplicants({ ...a, ...nest(path, value) } as Record<string, unknown>, null, a._id, a._booked || null);
          const stage = progress({ ...a, ...(isSecurePath(path) ? {} : nest(path, value)) } as Applicant).stage;
          if (!isSecurePath(path)) await backend.set(`applicants/${a._id}`, { stage }, true);
          if (actor.canEdit && get(a, "portal.invited")) await backend.set(`portal/${a._id}`, { ...portalPayload(next, settings), updatedAt: Date.now() }, true);
        }
        await backend.add(`applicants/${a._id}/history`, { at: Date.now(), by: actor.email, changes: [{ path, from: "", to: String(value).slice(0, 300) }] }).catch(() => {});
        setSave("Saved");
      } catch { setSave("Not saved"); toast("Couldn't save."); }
    }, 400);
  }

  async function welcome(a: Applicant) {
    if (!actor.canEdit || !a.email) return toast("Add an email first.");
    const payload = portalPayload(a, settings);
    await backend.set(`applicants/${a._id}/private/main`, { portal: { invited: today(), welcomed: today() } }, true);
    await backend.set(`portal/${a._id}`, { ...payload, updatedAt: Date.now() }, true);
    await backend.set(`portalEmails/${payload.email}`, { id: a._id, at: Date.now() });
    await backend.add(`portal/${a._id}/messages`, { text: welcomeMessage(a), from: "staff", by: actor.email, name: actor.name || "PVRS", at: Date.now() });
    try { await backend.sendLink(String(a.email)); } catch { /* mailto still works */ }
    toast(`Welcome started for ${first(a.name) || a.name}.`);
  }

  const kpis = [
    ["action", "Needs your action", apps.filter((a) => needsAction(a, settings)).length],
    ["interviews", "Interviews coming up", apps.filter((a) => a._booked && a._booked.start > Date.now() && a._booked.start < Date.now() + 7 * DAY).length],
    ["board", "Board queue", apps.filter(inBoardQueue).length],
    ["onb", "In onboarding", apps.filter((a) => inOrient(a) && progress(a).stage !== "act").length],
  ] as const;

  const context: McContext = { view: selected ? tab : view, applicantId: selected?._id, applicantName: selected?.name };
  const hits = searchDesk(q, apps, actor, posts.map((p) => ({ id: p.id, text: String(p.data.text || ""), channel: channels.find((c) => c.id === channelId)?.data.name as string })));

  return (
    <div data-screen="desk" className="flex h-dvh overflow-hidden bg-canvas text-ink">
      <aside className="frost hidden h-full w-64 shrink-0 flex-col border-r border-black/5 px-3 py-4 md:flex">
        <div className="flex items-center gap-2 px-2">
          <img src="/img/logo.png" alt="Potsdam Volunteer Rescue Squad" className="h-12 w-12 crest" />
          <div>
            <div className="text-sm font-semibold">PVRS Membership</div>
            <div className="text-[11px] text-muted">{actor.role === "owner" ? "Owner" : actor.role === "full" ? "Full access" : ROLE_LABEL[actor.role] || actor.role}</div>
          </div>
        </div>
        <Nav view={view} setView={(v) => { setView(v); setSel(null); }} actorCan={actor.canEdit} admin={actor.adminView} requests={requests.filter((r) => r.data.status === "pending").length} />
        {actor.canEdit ? <button type="button" className="mx-2 mt-3 inline-flex items-center justify-center gap-1 rounded-full bg-crimson py-2.5 text-sm font-semibold text-white shadow-md" onClick={() => addApplicant(backend, actor.email, toast, openFile)}><Plus className="h-4 w-4" /> New applicant</button> : null}
        <button type="button" className="mx-2 mt-auto flex items-center gap-2 px-2 py-2 text-left text-xs text-muted" onClick={() => backend.signOut().then(() => location.replace("/signin"))}><span className="grid h-8 w-8 place-items-center rounded-full bg-blue/10 text-xs font-semibold text-blue">{initials(actor.name || actor.email)}</span><span><b className="block text-ink">{actor.name || "Signed in"}</b>Sign out</span></button>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="frost sticky top-0 z-20 flex items-center gap-2 border-b border-black/5 px-3 py-2.5">
          <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-white hairline md:hidden" aria-label="Find" onClick={() => setPalette(true)}><Search className="h-4 w-4" /></button>
          <div className="relative hidden min-w-0 flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPalette(true); }} onFocus={() => setPalette(true)} placeholder="Search people, stages, actions" aria-label="Search" className="w-full rounded-full bg-white/80 py-2 pl-9 pr-14 text-sm outline-none hairline" />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[#e8e8ed] px-2 py-0.5 text-[11px] font-medium" onClick={() => setPalette(true)}>⌘K</button>
          </div>
          {actor.canEdit ? <button type="button" data-screen="ai-button" aria-label="Med Control" className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/80 px-3 py-1.5 text-sm font-semibold text-blue shadow-sm hairline" onClick={() => setAiOpen(true)}><Sparkles className="h-4 w-4" /> <span className="hidden sm:inline">Med Control</span><span className="text-[11px] font-medium text-muted">⌘J</span></button> : null}
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-white hairline" aria-label="Notifications" onClick={() => setNotifyOn(true)}><Bell className="h-4 w-4" /></button>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-auto px-3 py-4 pb-8 md:px-6">
          {view === "pipeline" && (
            <section data-screen="pipeline">
              <div className={`flex flex-wrap items-end justify-between gap-3 ${selected ? "hidden lg:flex" : ""}`}>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">Pipeline</h1>
                  <p className="text-sm text-muted">{apps.length} people · {save}</p>
                </div>
                <div className="seg" role="tablist" aria-label="Pipeline layout">
                  <button type="button" aria-pressed={mode === "board"} className="inline-flex items-center gap-1 text-sm" onClick={() => setMode("board")}><LayoutGrid className="h-3.5 w-3.5" /> Board</button>
                  <button type="button" aria-pressed={mode === "list"} className="inline-flex items-center gap-1 text-sm" onClick={() => setMode("list")}><List className="h-3.5 w-3.5" /> List</button>
                  {actor.canEdit ? <button type="button" className="rounded-full px-3 text-sm" onClick={() => { setSelecting((v) => !v); setPicked([]); }}>Select</button> : null}
                </div>
              </div>
              <div className={`mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4 ${selected ? "hidden lg:grid" : ""}`}>
                {kpis.map(([id, label, n]) => (
                  <button key={id} type="button" onClick={() => setFilter(filter === id ? "all" : id)} className={`card p-4 text-left press ${filter === id ? "ring-2 ring-blue" : ""}`}>
                    <div className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</div>
                    <div className="tabular mt-1 text-3xl font-semibold">{n}</div>
                  </button>
                ))}
              </div>
              {selecting ? <div className={selected ? "hidden lg:block" : ""}><BulkBar ids={picked} apps={apps} onClear={() => setPicked([])} /></div> : null}
              {actor.canEdit && todos[0] ? (
                <button type="button" className={`card mt-4 flex w-full items-center justify-between p-4 text-left ${selected ? "hidden lg:flex" : ""}`} onClick={() => openFile(todos[0].id, todos[0].tab as TabId)}>
                  <span><span className="text-xs font-semibold uppercase tracking-widest text-blue">Your move</span><div className="text-lg font-semibold">{todos[0].text}</div><div className="text-sm text-muted">{todos[0].sub}</div></span>
                  <span className="rounded-full bg-blue px-3 py-1.5 text-sm font-semibold text-white">{todos[0].btn || "Open"}</span>
                </button>
              ) : null}
              {mode === "board" ? (
                <div data-screen="board" className={`mt-4 grid gap-3 md:grid-cols-5 ${selected ? "hidden lg:grid" : ""}`}>
                  {LANES.map((lane) => (
                    <div key={lane.id} className={`lane-${lane.id} rounded-3xl bg-[#efeff4] p-2`}>
                      <button type="button" className="flex w-full items-baseline justify-between px-2 py-1" onClick={() => setFilter(lane.id)}>
                        <span className="text-sm font-semibold">{lane.label}</span>
                        <span className="text-2xl font-semibold text-[var(--lane)]">{apps.filter((a) => laneOf(a) === lane.id).length}</span>
                      </button>
                      <div className="space-y-2">
                        {visible.filter((a) => laneOf(a) === lane.id).map((a) => <Card key={a._id} a={a} onOpen={() => selecting ? setPicked((p) => p.includes(a._id) ? p.filter((id) => id !== a._id) : [...p, a._id]) : openFile(a._id)} picked={picked.includes(a._id)} />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div data-screen="list" className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[320px_1fr]">
                  <div className={`card max-h-[70vh] overflow-auto ${selected ? "hidden lg:block" : ""}`}>
                    {!visible.length ? <div className="grid h-48 place-items-center p-6 text-center text-sm text-muted">Nobody in this view. Clear the filter or add an applicant.</div> : null}
                    {visible.map((a) => {
                      const p = progress(a);
                      return (
                        <button key={a._id} type="button" onClick={() => openFile(a._id)} className={`flex w-full items-center gap-3 border-b border-black/5 px-3 py-3 text-left ${sel === a._id ? "bg-blue/5" : ""}`}>
                          <span className={`lane-${laneOf(a)} grid h-9 w-9 place-items-center rounded-full bg-[var(--lane)]/10 text-xs font-semibold text-[var(--lane)]`}>{initials(a.name)}</span>
                          <span className="min-w-0"><b className="block truncate">{a.name}</b><span className="text-xs text-muted">{a.type} · {statusOf(a, p).pill}</span></span>
                        </button>
                      );
                    })}
                  </div>
                  <div className={`min-w-0 ${selected ? "" : "hidden lg:block"}`}>
                    {selected ? <button type="button" className="mb-3 text-sm font-semibold text-blue lg:hidden" onClick={() => setSel(null)}>‹ Pipeline</button> : null}
                    {selected ? <File a={selected} apps={apps} actor={actor} tab={tab} setTab={setTab} settings={settings} save={save} fieldValue={fieldValue} edit={edit} welcome={welcome} questions={questions} setQuestions={setQuestions} onMessage={() => { setThread(threadFor(selected)); setTab("msgs"); }} /> : <div className="card grid h-64 place-items-center p-6 text-center text-sm text-muted">Choose someone on the left. Their file opens here, and edits save as you go.</div>}
                  </div>
                </div>
              )}
              {mode === "board" && selected ? <div className="mt-4"><File a={selected} apps={apps} actor={actor} tab={tab} setTab={setTab} settings={settings} save={save} fieldValue={fieldValue} edit={edit} welcome={welcome} questions={questions} setQuestions={setQuestions} onMessage={() => setTab("msgs")} /></div> : null}
            </section>
          )}
          {view === "messages" && <Messages channels={channels} posts={posts} channelId={channelId} setChannelId={setChannelId} actorEmail={actor.email} actorName={actor.name} backend={backend} toast={toast} />}
          {view === "slots" && <Slots slots={slots} backend={backend} actor={actor} toast={toast} />}
          {view === "board" && <BoardMeet apps={apps.filter(inBoardQueue)} onOpen={openFile} settings={settings} />}
          {view === "team" && actor.canEdit && <Team staff={staff} requests={requests} backend={backend} toast={toast} />}
          {view === "settings" && actor.canEdit && <SettingsPanel settings={settings} backend={backend} toast={toast} />}
          {view === "reports" && <Reports apps={apps} />}
          {view === "orient" && <OrientBoard apps={apps} settings={settings} edit={edit} />}
          {view === "signoffs" && <Signoffs backend={backend} actorEmail={actor.email} />}
          {view === "library" && <Library backend={backend} canEdit={actor.canEdit} />}
        </main>
      <nav className="frost flex shrink-0 border-t border-black/5 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Desk">
        <button type="button" className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]" onClick={() => { setView("pipeline"); setFilter("all"); }}><LayoutGrid className="h-5 w-5" />Pipeline</button>
        <button type="button" className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]" onClick={() => { setView("pipeline"); setFilter("onb"); }}><ClipboardList className="h-5 w-5" />Onboard</button>
        <button type="button" className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]" onClick={() => setView("messages")}><MessageSquare className="h-5 w-5" />Messages</button>
        <button type="button" className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]" onClick={() => setMobileMore(true)}><Plus className="h-5 w-5" />More</button>
      </nav>
      </div>
      {palette ? (
        <div className="fixed inset-0 z-40 grid place-items-start bg-black/30 p-4 pt-[12vh]" onClick={() => setPalette(false)}>
          <div className="card w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Spotlight search" className="w-full border-b border-black/5 px-4 py-3 outline-none" />
            <ul className="max-h-80 overflow-auto">
              {hits.map((h) => (
                <li key={h.kind + h.id + h.title}>
                  <button type="button" className="block w-full px-4 py-2 text-left text-sm hover:bg-[#f5f5f7]" onClick={() => {
                    setPalette(false); setQ("");
                    if (h.kind === "person") openFile(h.id);
                    else if (h.id === "messages") setView("messages");
                    else if (h.id === "settings") setView("settings");
                    else if (h.id === "team") setView("team");
                    else if (h.id === "slots") setView("slots");
                    else if (h.id === "board") setView("board");
                    else if (h.id === "reports" || h.id === "flyer") setView("reports");
                    else if (h.id === "tour") setTourOn(true);
                    else if (h.id === "notif") setNotifyOn(true);
                    else if (h.id === "orient") setView("orient");
                    else if (h.id === "library") setView("library");
                    else if (h.id === "new") addApplicant(backend, actor.email, toast, openFile);
                  }}>
                    <b>{h.title}</b><div className="text-xs text-muted">{h.sub}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {mobileMore ? (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setMobileMore(false)}>
          <div className="card absolute inset-x-3 bottom-4 p-3" onClick={(e) => e.stopPropagation()}>
            {[["slots", "Interview times"], ["board", "Board meeting"], ["reports", "Reports"], ...(actor.canEdit ? [["team", "Team"], ["settings", "Settings"]] : [])].map(([id, label]) => (
              <button key={id} type="button" className="block w-full rounded-xl px-3 py-3 text-left" onClick={() => { setView(id as View); setMobileMore(false); }}>{label}</button>
            ))}
          </div>
        </div>
      ) : null}
      {actor.canEdit ? <MedControl open={aiOpen} onClose={() => setAiOpen(false)} context={context} hints={hints} onOpen={(id) => { openFile(id); setAiOpen(false); }} /> : null}
      <Tour role={actor.role === "owner" || actor.role === "full" ? "owner" : actor.role} email={actor.email} force={tourOn} onClose={() => setTourOn(false)} />
      {notifyOn ? <NotifySheet onClose={() => setNotifyOn(false)} /> : null}
    </div>
  );
}

function initials(name?: string) {
  const w = (name || "?").trim().split(/\s+/);
  return ((w[0]?.[0] || "?") + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
}
function threadFor(a: Applicant) { return a._id; }

function Nav({ view, setView, actorCan, admin, requests }: { view: View; setView: (v: View) => void; actorCan: boolean; admin: boolean; requests: number }) {
  const item = (id: View, label: string, Icon: typeof LayoutGrid, show = true) => show ? (
    <button key={id} type="button" onClick={() => setView(id)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${view === id ? "bg-blue/10 font-semibold text-blue" : "hover:bg-black/5"}`}>
      <Icon className="h-4 w-4 shrink-0" /> <span className="flex-1">{label}</span>{id === "team" && requests ? <span className="rounded-full bg-crimson px-1.5 text-[10px] text-white">{requests}</span> : null}
    </button>
  ) : null;
  return (
    <nav className="mt-4 space-y-4 overflow-auto text-sm" aria-label="Desk">
      <div><div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Pipeline</div>{item("pipeline", "Overview", LayoutGrid)}{admin ? item("board", "Board meeting", Users) : null}{admin ? item("orient", "Orientation board", ClipboardList) : null}{item("signoffs", "Trainer sign-offs", Shield, true)}</div>
      <div><div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Work</div>{item("slots", "Interview times", Calendar)}{item("messages", "Messages", MessageSquare)}{item("library", "Documents", FileText)}{admin ? item("reports", "Reports", BarChart3) : null}</div>
      {actorCan ? <div><div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Admin</div>{item("team", "Team", Users)}{item("settings", "Settings", SettingsIcon)}</div> : null}
    </nav>
  );
}

function Card({ a, onOpen, picked }: { a: Applicant; onOpen: () => void; picked?: boolean }) {
  const p = progress(a);
  const lane = laneOf(a);
  return (
    <button type="button" onClick={onOpen} className={`lane-${lane} card w-full p-3 text-left press hover:-translate-y-0.5 ${picked ? "ring-2 ring-blue" : ""}`}>
      <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--lane)]/15 text-[11px] font-semibold text-[var(--lane)]">{initials(a.name)}</span><span className="font-semibold">{a.name || "Unnamed"}</span></div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted"><span>{a.type || "Applicant"}</span><span className={`tabular rounded-full px-2 py-0.5 ${daysWaiting(a) >= 14 ? "bg-amber-100 text-amber-900" : "bg-black/5"}`}>{daysWaiting(a)}d</span></div>
      <div className="mt-2 flex gap-0.5">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={`h-1 flex-1 rounded-full ${i < Math.round((p.n / 14) * 5) ? "bg-[var(--lane)]" : "bg-black/10"}`} />)}</div>
      <div className="mt-2 text-xs font-medium text-[var(--lane)]">{nextActionLabel(a)}</div>
    </button>
  );
}

function File({ a, apps, actor, tab, setTab, settings, save, fieldValue, edit, welcome, questions, setQuestions, onMessage }: {
  a: Applicant; apps: Applicant[]; actor: ReturnType<typeof useGate>["actor"] & object; tab: TabId; setTab: (t: TabId) => void; settings: Settings; save: string;
  fieldValue: (a: Applicant, path: string) => unknown; edit: (a: Applicant, path: string, value: unknown) => void;
  welcome: (a: Applicant) => void; questions: string[]; setQuestions: (q: string[]) => void; onMessage: () => void;
}) {
  const backend = useBackend();
  const p = progress(a);
  const st = statusOf(a, p);
  const tabs = actor.role === "interviewer" ? ALL_TABS.filter((t) => t.id === "app" || t.id === "iv") : ALL_TABS;
  const todo = todoItems([a], settings)[0];
  return (
    <article data-screen="file" className="card min-w-0 overflow-hidden">
      <header className="border-b border-black/5 bg-white px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={`lane-${laneOf(a)} grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[var(--lane)]/15 text-lg font-semibold text-[var(--lane)]`}>{initials(a.name)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold">{a.name}</h2>
            <p className="text-sm text-muted [overflow-wrap:anywhere]">{a.type} · {a.location === "other" ? a.locationOther : a.location || "Potsdam"} · {st.head}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">{a.email ? <a className="rounded-full bg-[#f5f5f7] px-2 py-1" href={`mailto:${a.email}`}>{a.email}</a> : null}{a.phone ? <span className="rounded-full bg-[#f5f5f7] px-2 py-1">{a.phone}</span> : null}</div>
          </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {todo ? <button type="button" className="rounded-full bg-blue px-3 py-1.5 text-sm font-semibold text-white" onClick={() => { if (todo.act === "invite") void welcome(a); else setTab((todo.tab as TabId) || "app"); }}>{todo.btn || "Your move"}</button> : null}
            {actor.canEdit && !get(a, "portal.invited") ? <button type="button" className="rounded-full px-3 py-1.5 text-sm hairline" onClick={() => welcome(a)}>Invite to portal</button> : null}
            <button type="button" className="rounded-full px-3 py-1.5 text-sm hairline" onClick={onMessage}>Message</button>
            <button type="button" className="rounded-full px-3 py-1.5 text-sm hairline" onClick={() => printPacket(a)}>Print</button>
            {inBoardQueue(a) && actor.canEdit ? <button type="button" className="rounded-full px-3 py-1.5 text-sm hairline" onClick={() => setTab("board")}>Record vote</button> : null}
          </div>
        </div>
        <ol className="mt-4 flex w-full gap-1">
          {phaseBits(p).map((ph) => (
            <li key={ph.id} className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] leading-tight sm:text-[11px]"><span className={`h-1.5 rounded-full ${ph.state === "todo" ? "bg-black/10" : "bg-blue"}`} /><span className="font-medium">{ph.label}</span></li>
          ))}
        </ol>
        <div className="seg mt-3 flex w-full flex-wrap" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)} className="whitespace-nowrap text-sm">{t.label}{tabDone(a, t.id, settings) === "done" ? " ·" : ""}</button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{save === "Saved" ? "Saved" : save}</p>
      </header>
      <div className="space-y-4 p-4">
        {actor.canEdit ? <DupeBanner a={a} apps={apps} edit={edit} onMerge={async (drop) => {
          if (get(a, "portal.invited") || get(drop, "portal.invited")) return;
          if (!a.email && drop.email) edit(a, "email", drop.email);
          if (!a.phone && drop.phone) edit(a, "phone", drop.phone);
          await backend.del(`applicants/${drop._id}`);
        }} /> : null}
        {tab === "app" && <AppTab a={a} actor={actor} fieldValue={fieldValue} edit={edit} />}
        {tab === "checks" && actor.adminView && <Checks a={a} fieldValue={fieldValue} edit={edit} can={actor.canEdit} settings={settings} />}
        {tab === "iv" && <InterviewPanel a={a} fieldValue={fieldValue} edit={edit} questions={questions} onQuestions={async () => {
          const res = await backend.call("medControl", { job: "questions", id: a._id, context: { view: "iv", applicantId: a._id, applicantName: a.name } }) as { questions?: string[] };
          setQuestions(res.questions || []);
        }} canAi={!!actor.canEdit} canSchedule={!!(actor.canEdit || actor.sched)} />}
        {tab === "board" && actor.adminView && <BoardTab a={a} fieldValue={fieldValue} edit={edit} score={ivScore(a)} />}
        {tab === "onb" && actor.adminView && <Onboard a={a} settings={settings} fieldValue={fieldValue} edit={edit} />}
        {tab === "notes" && actor.adminView && (
          <label className="block text-sm font-medium">Admin notes
            <textarea value={String(fieldValue(a, "notes") || "")} onChange={(e) => edit(a, "notes", e.target.value)} rows={8} className="mt-1 w-full rounded-2xl bg-[#f5f5f7] p-3 font-normal hairline" />
          </label>
        )}
        {tab === "msgs" && <FileMessages id={a._id} />}
        {actor.role === "interviewer" && tab === "app" ? <p className="text-xs text-muted">Application is view only. The interview is yours to fill in.</p> : null}
      </div>
    </article>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm sm:grid-cols-[180px_1fr] sm:items-center"><span className="text-muted">{label}</span>{children}</label>;
}
const box = "w-full rounded-xl bg-[#f5f5f7] px-3 py-2 outline-none hairline";

function AppTab({ a, actor, fieldValue, edit }: { a: Applicant; actor: { canEdit: boolean; sched: boolean }; fieldValue: (a: Applicant, p: string) => unknown; edit: (a: Applicant, p: string, v: unknown) => void }) {
  return (
    <section className="space-y-3">
      <Row label="Full name"><input className={box} value={String(fieldValue(a, "name") || "")} onChange={(e) => edit(a, "name", e.target.value)} /></Row>
      <Row label="Phone"><input className={box} value={String(fieldValue(a, "phone") || "")} onChange={(e) => edit(a, "phone", e.target.value)} /></Row>
      <Row label="Email"><input className={box} value={String(fieldValue(a, "email") || "")} onChange={(e) => edit(a, "email", e.target.value)} /></Row>
      <Row label="Membership type"><select className={box} value={String(fieldValue(a, "type") || "")} onChange={(e) => edit(a, "type", e.target.value)}><option value="">—</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Row>
      <Row label="Location">
        <select className={box} value={String(fieldValue(a, "location") || "")} onChange={(e) => edit(a, "location", e.target.value)}><option value="Potsdam">Potsdam</option><option value="other">Other</option></select>
      </Row>
      {showField("locOther", a) ? <Row label="Where?"><input className={box} value={String(fieldValue(a, "locationOther") || "")} onChange={(e) => edit(a, "locationOther", e.target.value)} /></Row> : null}
      <Row label="Date received"><input type="date" className={box} value={String(fieldValue(a, "app.received") || "")} onChange={(e) => edit(a, "app.received", e.target.value)} /></Row>
      <Row label="Complete?">
        <select className={box} value={String(fieldValue(a, "app.complete") || "")} onChange={(e) => edit(a, "app.complete", e.target.value)}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select>
      </Row>
      <Row label="Heard about PVRS"><select className={box} value={String(fieldValue(a, "app.heard") || "")} onChange={(e) => edit(a, "app.heard", e.target.value)}><option value="">—</option>{HEARD.map((h) => <option key={h}>{h}</option>)}</select></Row>
      {(actor.canEdit || actor.sched) ? <Row label="Let them book"><select className={box} value={String(fieldValue(a, "portal.bookingOpen") || "")} onChange={(e) => edit(a, "portal.bookingOpen", e.target.value)}><option value="">No</option><option value="yes">Yes</option><option value="no">No</option></select></Row> : null}
    </section>
  );
}

function Checks({ a, fieldValue, edit, can, settings }: { a: Applicant; fieldValue: (a: Applicant, p: string) => unknown; edit: (a: Applicant, p: string, v: unknown) => void; can: boolean; settings: Settings }) {
  const backend = useBackend();
  const dl = get(a, "form.person.dlNumber");
  const rs = refStatus(a);
  const [answers, setAnswers] = useState<string>("");
  const me = backend.current()?.email || "";
  return (
    <section className="space-y-4">
      <h3 className="font-semibold">Driving record and license</h3>
      <Row label="MVR completed"><input type="date" className={box} value={String(fieldValue(a, "mvr.completed") || "")} onChange={(e) => edit(a, "mvr.completed", e.target.value)} /></Row>
      <Row label="License verified"><input type="date" className={box} value={String(fieldValue(a, "dl.date") || "")} onChange={(e) => edit(a, "dl.date", e.target.value)} /></Row>
      <Row label="Valid?"><select className={box} value={String(fieldValue(a, "dl.valid") || "")} onChange={(e) => edit(a, "dl.valid", e.target.value)}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select></Row>
      <Row label="Expires"><input type="date" className={box} value={String(fieldValue(a, "dl.expires") || "")} onChange={(e) => edit(a, "dl.expires", e.target.value)} /></Row>
      {dl ? <p className="text-sm">License number from the application: <b className="font-mono">{String(dl)}</b><span className="block text-xs text-muted">Admins only. Never copied into the portal, board packet, or member view.</span></p> : null}
      <div className="flex items-center justify-between"><h3 className="font-semibold">References · {rs.got} of {rs.need}</h3>{can ? <button type="button" className="text-sm font-semibold text-blue" onClick={async () => { for (const i of [1, 2, 3, 4]) { if (!okEmail(get(a, `refs.r${i}.email`)) || get(a, `refs.r${i}.returned`)) continue; const url = await refUrl(backend, a, i, me, edit); if (url) mailRef(a, i, url, settings); } }}>Email all unanswered</button> : null}</div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-2xl bg-[#f5f5f7] p-3">
          <div className="mb-2 text-sm font-semibold">Reference {i}</div>
          <input className={`${box} mb-2 bg-white`} placeholder="Name" value={String(fieldValue(a, `refs.r${i}.name`) || "")} onChange={(e) => edit(a, `refs.r${i}.name`, e.target.value)} />
          <input className={`${box} mb-2 bg-white`} placeholder="Email" value={String(fieldValue(a, `refs.r${i}.email`) || "")} onChange={(e) => edit(a, `refs.r${i}.email`, e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <input type="date" className={`${box} bg-white`} value={String(fieldValue(a, `refs.r${i}.returned`) || "")} onChange={(e) => edit(a, `refs.r${i}.returned`, e.target.value)} />
            {can ? <button type="button" className="rounded-full bg-white px-3 text-sm hairline" onClick={() => edit(a, `refs.r${i}.returned`, today())}>Mark received</button> : null}
            {can ? <button type="button" className="rounded-full bg-white px-3 text-sm hairline" onClick={async () => { const url = await refUrl(backend, a, i, me, edit); if (url) { mailRef(a, i, url, settings); if (!get(a, `refs.r${i}.contacted`)) { edit(a, `refs.r${i}.contacted`, today()); edit(a, `refs.r${i}.method`, "Email"); } } }}>Email link</button> : null}
            {can ? <button type="button" className="rounded-full bg-white px-3 text-sm hairline" onClick={async () => { const url = await refUrl(backend, a, i, me, edit); if (url) await navigator.clipboard.writeText(url); }}>Copy link</button> : null}
            {can && refNudge(a, i) ? <button type="button" className="rounded-full bg-white px-3 text-sm hairline" onClick={async () => { const url = await refUrl(backend, a, i, me, edit); if (url) { mailRef(a, i, url, settings, true); edit(a, `refs.r${i}.reminded`, today()); } }}>Nudge</button> : null}
            {can ? <button type="button" className="rounded-full bg-white px-3 text-sm hairline" onClick={() => edit(a, `refs.r${i}.replace`, today())}>Ask for a new one</button> : null}
            {get(a, `refs.r${i}.form`) ? <button type="button" className="rounded-full bg-blue px-3 text-sm font-semibold text-white" onClick={() => setAnswers(JSON.stringify(get(a, `refs.r${i}.form`), null, 2))}>View answers</button> : null}
          </div>
        </div>
      ))}
      {answers ? <pre className="max-h-48 overflow-auto rounded-2xl bg-white p-3 text-xs">{answers}<button type="button" className="mt-2 block text-sm text-blue" onClick={() => setAnswers("")}>Close</button></pre> : null}
    </section>
  );
}

function Interview({ a, fieldValue, edit, questions, onQuestions, canAi }: { a: Applicant; fieldValue: (a: Applicant, p: string) => unknown; edit: (a: Applicant, p: string, v: unknown) => void; questions: string[]; onQuestions: () => void; canAi: boolean }) {
  const score = ivScore(a);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canAi ? <button type="button" className="rounded-full bg-blue px-3 py-1.5 text-sm font-semibold text-white" onClick={onQuestions}>Tailored questions</button> : null}
        <span className="text-sm text-muted">Score {score.n ? score.avg.toFixed(1) + " / 5" : "not scored"}</span>
      </div>
      {questions.length ? <ol className="list-decimal space-y-1 rounded-2xl bg-[#f5f5f7] p-4 pl-8 text-sm">{questions.map((q) => <li key={q}>{q}</li>)}</ol> : null}
      <Row label="Completed"><input type="date" className={box} value={String(fieldValue(a, "sched.completed") || "")} onChange={(e) => edit(a, "sched.completed", e.target.value)} /></Row>
      {[["iv.why", "Why PVRS?"], ["iv.about", "About them"], ["iv.hobbies", "Hobbies"], ["iv.stress", "After a hard call"], ["iv.concerns", "Questions on a call"]].map(([k, l]) => (
        <label key={k} className="block text-sm">{l}<textarea className={`${box} mt-1`} rows={2} value={String(fieldValue(a, k) || "")} onChange={(e) => edit(a, k, e.target.value)} /></label>
      ))}
      <div className="grid grid-cols-5 gap-2">
        {(["comm", "motiv", "avail", "team", "fit"] as const).map((k) => (
          <label key={k} className="text-xs uppercase text-muted">{k}
            <select className={`${box} mt-1`} value={String(fieldValue(a, `iv.score.${k}`) || "")} onChange={(e) => edit(a, `iv.score.${k}`, e.target.value)}>
              <option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}

function BoardTab({ a, fieldValue, edit, score }: { a: Applicant; fieldValue: (a: Applicant, p: string) => unknown; edit: (a: Applicant, p: string, v: unknown) => void; score: { n: number; avg: number } }) {
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">Interview average {score.n ? score.avg.toFixed(1) + " / 5" : "not scored"}. A denial is never shown in the portal.</p>
      <Row label="Committee"><select className={box} value={String(fieldValue(a, "appr.committee") || "")} onChange={(e) => edit(a, "appr.committee", e.target.value)}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select></Row>
      <Row label="Meeting"><input type="date" className={box} value={String(fieldValue(a, "board.date") || "")} onChange={(e) => edit(a, "board.date", e.target.value)} /></Row>
      <div className="grid grid-cols-3 gap-2">
        {(["for", "against", "abstain"] as const).map((k) => (
          <label key={k} className="text-sm capitalize">{k}<input type="number" min={0} className={`${box} mt-1`} value={String(fieldValue(a, `board.${k}`) || "")} onChange={(e) => edit(a, `board.${k}`, Number(e.target.value))} /></label>
        ))}
      </div>
      <Row label="Result"><select className={box} value={String(fieldValue(a, "board.result") || "")} onChange={(e) => edit(a, "board.result", e.target.value)}><option value="">—</option><option value="approved">Approved</option><option value="tabled">Tabled</option><option value="denied">Denied</option></select></Row>
    </section>
  );
}

function Onboard({ a, settings, fieldValue, edit }: { a: Applicant; settings: Settings; fieldValue: (a: Applicant, p: string) => unknown; edit: (a: Applicant, p: string, v: unknown) => void }) {
  return (
    <section className="space-y-3">
      <Row label="Sterling requested"><input type="date" className={box} value={String(fieldValue(a, "bg.sterReq") || "")} onChange={(e) => edit(a, "bg.sterReq", e.target.value)} /></Row>
      <Row label="Sterling done"><input type="date" className={box} value={String(fieldValue(a, "bg.sterDone") || "")} onChange={(e) => edit(a, "bg.sterDone", e.target.value)} /></Row>
      <Row label="Sterling result"><select className={box} value={String(fieldValue(a, "bg.sterResult") || "")} onChange={(e) => edit(a, "bg.sterResult", e.target.value)}><option value="">—</option><option value="clear">Clear</option><option value="review">Needs review</option></select></Row>
      <h3 className="font-semibold">Paperwork and documents</h3>
      {onbItems(settings).map(([k, label]) => (
        <Row key={k} label={label}><input type="date" className={box} value={String(fieldValue(a, `onb.items.${k}`) || "")} onChange={(e) => edit(a, `onb.items.${k}`, e.target.value)} /></Row>
      ))}
      <h3 className="font-semibold">Equipment and access</h3>
      {issueItems(settings).slice(0, 4).map(([k, label]) => (
        <Row key={k} label={label}><input type="date" className={box} value={String(fieldValue(a, `onb.issue.${k}`) || "")} onChange={(e) => edit(a, `onb.issue.${k}`, e.target.value)} /></Row>
      ))}
      <p className="text-xs text-muted">{skillItems(settings).length} trainer sign-off lines live in Settings.</p>
    </section>
  );
}

function FileMessages({ id }: { id: string }) {
  const backend = useBackend();
  const [msgs, setMsgs] = useState<Snap[]>([]);
  const [text, setText] = useState("");
  const me = backend.current();
  useEffect(() => backend.watch(`portal/${id}/messages`, setMsgs), [backend, id]);
  return (
    <div data-screen="file-messages">
      <div className="space-y-2">{msgs.map((m) => <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.data.from === "staff" ? "bg-blue text-white" : "bg-[#f5f5f7]"}`}>{String(m.data.text || "")}</div>)}</div>
      <form className="mt-3 flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || !me) return;
        await backend.add(`portal/${id}/messages`, { text: text.trim(), from: "staff", by: me.email, name: me.name || "PVRS", at: Date.now() });
        setText("");
      }}>
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Reply" placeholder="Reply… nothing sends until you press Send" className={`${box} flex-1`} />
        <button className="rounded-full bg-blue px-4 text-sm font-semibold text-white">Send</button>
      </form>
    </div>
  );
}

function Messages({ channels, posts, channelId, setChannelId, actorEmail, actorName, backend, toast }: {
  channels: Snap[]; posts: Snap[]; channelId: string; setChannelId: (id: string) => void; actorEmail: string; actorName: string;
  backend: ReturnType<typeof useBackend>; toast: (m: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <section data-screen="messages" className="flex h-full min-h-[70vh] flex-col gap-3 md:grid md:grid-cols-[240px_1fr]">
      <div className="flex gap-2 overflow-x-auto md:card md:block md:p-2">
        <p className="hidden px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted md:block">Channels</p>
        {channels.map((c) => <button key={c.id} type="button" onClick={() => setChannelId(c.id)} className={`flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-2 text-left text-sm hairline md:w-full md:rounded-xl md:border-0 md:bg-transparent md:shadow-none ${c.id === channelId ? "bg-blue/10 font-semibold text-blue" : ""}`}><span className="grid h-8 w-8 place-items-center rounded-full bg-[#e8e8ed] text-xs">#</span> {String(c.data.name || c.id)}</button>)}
        {!channels.length ? <p className="p-4 text-sm text-muted">No channels yet. The owner adds them in Team.</p> : null}
      </div>
      <div className="card flex min-h-0 flex-1 flex-col bg-[#f5f5f7] p-4">
        <h1 className="text-xl font-semibold">#{String(channels.find((c) => c.id === channelId)?.data.name || "Messages")}</h1>
        <div className="mt-3 flex flex-1 flex-col justify-end gap-2">
          {!posts.length ? <div className="m-auto max-w-xs text-center text-sm text-muted">Nothing in this channel yet. Say hello. Keep medical files and Social Security numbers out of here.</div> : null}
          {posts.sort((a, b) => Number(a.data.at) - Number(b.data.at)).map((p) => (
            <div key={p.id} className={`max-w-[75%] rounded-3xl px-4 py-2 text-sm ${p.data.by === actorEmail ? "ml-auto bg-blue text-white" : "bg-white"}`}>
              <div className="text-[11px] opacity-70">{String(p.data.name || "")}</div>
              {String(p.data.text || "")}
            </div>
          ))}
        </div>
        <form className="mt-3 flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if (/medical|social security|\bssn\b|hepatitis|ppd/i.test(text)) return toast("Keep medical and Social Security paperwork out of channels.");
          if (!text.trim()) return;
          await backend.add(`channels/${channelId}/posts`, { text: text.trim(), by: actorEmail, name: actorName || "PVRS", at: Date.now() });
          setText("");
        }}>
          <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Channel message" className={`${box} flex-1`} placeholder="Message the channel" />
          <button className="rounded-full bg-blue px-4 text-sm font-semibold text-white">Post</button>
        </form>
      </div>
    </section>
  );
}

function Slots({ slots, backend, actor, toast }: { slots: Snap[]; backend: ReturnType<typeof useBackend>; actor: { canEdit: boolean; sched: boolean; email: string; name: string }; toast: (s: string) => void }) {
  const [when, setWhen] = useState("");
  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">Interview times</h1>
      <p className="text-sm text-muted">Applicants can claim a time at least 24 hours ahead.</p>
      <ul className="mt-4 space-y-2">
        {slots.sort((a, b) => Number(a.data.start) - Number(b.data.start)).map((s) => (
          <li key={s.id} className="card flex items-center justify-between px-4 py-3 text-sm">
            <span>{new Date(Number(s.data.start)).toLocaleString()} · {String(s.data.location || "")}{s.data.hostName ? ` · ${s.data.hostName}` : ""}</span>
            <span className="text-muted">{s.data.bookedBy ? "Booked" : "Open"}</span>
          </li>
        ))}
      </ul>
      {(actor.canEdit || actor.sched) ? (
        <form className="mt-4 flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const start = new Date(when).getTime();
          if (!start) return toast("Pick a date and time.");
          await backend.add("slots", { start, duration: 45, location: "PVRS station", bookedBy: null, createdAt: Date.now(), host: actor.email, hostName: actor.name });
          setWhen("");
        }}>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={box} aria-label="New interview time" />
          <button className="rounded-full bg-blue px-4 text-sm font-semibold text-white">Add time</button>
        </form>
      ) : null}
    </section>
  );
}

function BoardMeet({ apps, onOpen, settings }: { apps: Applicant[]; onOpen: (id: string) => void; settings: Settings }) {
  const [i, setI] = useState(0);
  const a = apps[i];
  const text = apps.map((x, n) => `${n + 1}. ${x.name} (${x.type || ""})`).join("\n");
  return (
    <section data-screen="board-meeting">
      <div className="flex items-center justify-between"><h1 className="text-3xl font-semibold tracking-tight">Board meeting</h1><span className="text-sm text-muted">{apps.length} ready</span></div>
      {!a ? <p className="mt-4 text-sm text-muted">Nobody is in the board queue.</p> : (
        <div className="card mt-4 p-6">
          <p className="text-xs uppercase tracking-widest text-muted">{i + 1} of {apps.length}</p>
          <h2 className="text-3xl font-semibold">{a.name}</h2>
          <p className="text-muted">{a.type} · interview {ivScore(a).n ? ivScore(a).avg.toFixed(1) + "/5" : "not scored"}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" className="rounded-full px-3 py-1.5 text-sm hairline" onClick={() => setI(Math.max(0, i - 1))}>Previous</button>
            <button type="button" className="rounded-full px-3 py-1.5 text-sm hairline" onClick={() => setI(Math.min(apps.length - 1, i + 1))}>Next</button>
            <button type="button" className="rounded-full bg-blue px-3 py-1.5 text-sm font-semibold text-white" onClick={() => onOpen(a._id)}>Open file</button>
            <button type="button" className="rounded-full px-3 py-1.5 text-sm hairline" onClick={() => navigator.clipboard.writeText(text)}>Copy agenda</button>
            <a className="rounded-full px-3 py-1.5 text-sm hairline" href={`mailto:${settings.boardEmails || ""}?subject=${encodeURIComponent("PVRS membership agenda")}&body=${encodeURIComponent(text)}`}>Email the board</a>
          </div>
        </div>
      )}
    </section>
  );
}

function Team({ staff, requests, backend, toast }: { staff: Snap[]; requests: Snap[]; backend: ReturnType<typeof useBackend>; toast: (s: string) => void }) {
  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">Team</h1>
      <h2 className="mt-4 font-semibold">Access requests</h2>
      <ul className="mt-2 space-y-2">{requests.filter((r) => r.data.status === "pending").map((r) => (
        <li key={r.id} className="card flex items-center justify-between px-4 py-3 text-sm">
          <span><b>{String(r.data.name)}</b> · {r.id}</span>
          <span className="flex gap-2">
            <button type="button" className="rounded-full bg-blue px-3 py-1 text-white" onClick={async () => { await backend.set(`staff/${r.id}`, { role: "member", name: r.data.name || "" }); await backend.set(`accessRequests/${r.id}`, { status: "approved" }, true); toast("Approved"); }}>Approve</button>
            <button type="button" className="rounded-full px-3 py-1 hairline" onClick={() => backend.set(`accessRequests/${r.id}`, { status: "denied" }, true)}>Deny</button>
          </span>
        </li>
      ))}</ul>
      <h2 className="mt-6 font-semibold">Squad members</h2>
      <ul className="mt-2 space-y-2">{staff.map((s) => (
        <li key={s.id} className="card flex items-center justify-between px-4 py-3 text-sm">
          <span>{String(s.data.name || s.id)} · {s.id}</span>
          <select aria-label={`Role for ${s.id}`} className="rounded-full bg-[#f5f5f7] px-3 py-1" value={String(s.data.role || "member")} onChange={(e) => { if (s.id === "dkota@pvrs.org") return; backend.set(`staff/${s.id}`, { role: e.target.value }, true); }}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </li>
      ))}</ul>
    </section>
  );
}

const DEFAULT_AI_TONE = "Write like the Potsdam Volunteer Rescue Squad membership coordinator: warm, plain, specific, and short. No jargon.";

function SettingsPanel({ settings, backend, toast }: { settings: Settings; backend: ReturnType<typeof useBackend>; toast: (s: string) => void }) {
  const [usage, setUsage] = useState<{ n: number; limit: number; provider: string } | null>(null);
  useEffect(() => { backend.call("medControl", { job: "usage" }).then((r) => setUsage(r as { n: number; limit: number; provider: string })).catch(() => {}); }, [backend]);
  async function save(patch: Record<string, unknown>) {
    try { await backend.set("settings/main", patch, true); toast("Saved"); } catch { toast("Couldn't save settings."); }
  }
  return (
    <section className="max-w-2xl space-y-4" data-screen="settings">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <label className="block text-sm">Signature<textarea className={`${box} mt-1`} rows={4} defaultValue={settings.signature || signatureText(settings)} onBlur={(e) => save({ signature: e.target.value })} /></label>
      <label className="block text-sm">Documents email<input className={`${box} mt-1`} defaultValue={String(settings.docsEmail || "")} onBlur={(e) => save({ docsEmail: e.target.value })} /></label>
      <label className="block text-sm">Board emails<input className={`${box} mt-1`} defaultValue={String(settings.boardEmails || "")} onBlur={(e) => save({ boardEmails: e.target.value })} /></label>
      <label className="block text-sm">Idle sign-out (minutes)<input type="number" className={`${box} mt-1`} defaultValue={Number(settings.idleMinutes || 30)} onBlur={(e) => save({ idleMinutes: Number(e.target.value) })} /></label>
      <div className="card p-4">
        <h2 className="text-lg font-semibold">PVRS AI preferences</h2>
        <p className="mt-1 text-sm text-muted">Med Control drafts only. You send. Groq’s free tier is the default; Claude is optional.</p>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.ai} onChange={(e) => save({ ai: e.target.checked })} /> Med Control on</label>
        <label className="mt-3 block text-sm">Squad tone
          <textarea className={`${box} mt-1`} rows={3} defaultValue={String(settings.aiTone || DEFAULT_AI_TONE)} onBlur={(e) => save({ aiTone: e.target.value })} />
        </label>
        <p className="mt-3 text-sm">{usage ? <><b>{usage.n} / {usage.limit}</b> today · {usage.provider === "groq" ? "Groq free tier" : usage.provider === "anthropic" ? "Claude" : "No key yet"}</> : "Usage loads when the function is deployed."}</p>
        <p className="mt-2 text-xs text-muted">Setup takes about two minutes. See docs/med-control.md: free Groq account, Zero Data Retention, then firebase functions:secrets:set GROQ_API_KEY.</p>
      </div>
    </section>
  );
}

function Reports({ apps }: { apps: Applicant[] }) {
  const year = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => apps.filter((a) => String(get(a, "app.received") || "").startsWith(`${year}-${String(i + 1).padStart(2, "0")}`)).length);
  const max = Math.max(1, ...months);
  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">Year at a glance</h1>
      <p className="text-sm text-muted">{year} · {apps.length} files on the desk</p>
      <div className="mt-4 flex h-32 items-end gap-1">{months.map((n, i) => <div key={i} className="flex-1 rounded-t-lg bg-blue/80" style={{ height: `${Math.max(4, (n / max) * 100)}%` }} title={String(n)} />)}</div>
      <Flyer />
    </section>
  );
}

function printPacket(a: Applicant) {
  const s = ivScore(a);
  const root = document.getElementById("print-root") || Object.assign(document.createElement("div"), { id: "print-root" });
  if (!root.parentElement) document.body.appendChild(root);
  root.innerHTML = `<article style="font-family:system-ui;padding:32px"><h1>${a.name}</h1><p>${a.type || ""} · ${a.email || ""}</p><p>Interview score ${s.n ? s.avg.toFixed(1) : "n/a"}${s.n && s.avg < 3 ? " · flagged under 3" : ""}</p><p>References ${refStatus(a).got} of ${refStatus(a).need}. License numbers are not printed.</p><p>Committee: ${String(get(a, "appr.committee") || "—")} · Board: ${String(get(a, "board.result") || "—")}</p></article>`;
  window.print();
}

function OrientBoard({ apps, settings, edit }: { apps: Applicant[]; settings: Settings; edit: (a: Applicant, p: string, v: unknown) => void }) {
  const people = apps.filter((a) => inOrient(a));
  const items = onbItems(settings);
  return (
    <section data-screen="orient">
      <h1 className="text-3xl font-semibold">Orientation board</h1>
      <p className="text-sm text-muted">Everyone the board approved, against the paperwork list. Click a cell to mark today, or clear it.</p>
      <div className="mt-4 overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead><tr><th className="p-2">Person</th>{items.map(([, label]) => <th key={label} className="p-2 font-medium">{label}</th>)}</tr></thead>
          <tbody>{people.map((a) => (
            <tr key={a._id} className="border-t border-black/5">{/* name */}
              <th className="p-2 font-semibold">{a.name}</th>
              {items.map(([k]) => {
                const done = !!get(a, `onb.items.${k}`);
                return <td key={k}><button type="button" className={`rounded-full px-2 py-1 text-xs ${done ? "bg-emerald-100 text-emerald-900" : "bg-[#f5f5f7]"}`} onClick={() => { edit(a, `onb.items.${k}`, done ? "" : today()); if (done) edit(a, `onb.undone.${k}`, today()); }}>{done ? "Done" : "Open"}</button></td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function Signoffs({ backend, actorEmail }: { backend: ReturnType<typeof useBackend>; actorEmail: string }) {
  const [rows, setRows] = useState<Snap[]>([]);
  useEffect(() => backend.watch("signoffs", setRows), [backend]);
  const mine = rows.filter((r) => actorEmail === "dkota@pvrs.org" || (Array.isArray(r.data.trainers) && (r.data.trainers as string[]).includes(actorEmail)));
  return (
    <section>
      <h1 className="text-3xl font-semibold">Trainer sign-offs</h1>
      {!mine.length ? <p className="mt-3 text-sm text-muted">No lists assigned to you.</p> : mine.map((r) => (
        <article key={r.id} className="card mt-3 p-4">
          <h2 className="font-semibold">{String(r.data.name || r.id)}</h2>
          <ul className="mt-2 space-y-1 text-sm">{((r.data.items as { key: string; label: string }[]) || []).map((item) => {
            const done = (r.data.done as Record<string, unknown> || {})[item.key];
            return <li key={item.key} className="flex items-center justify-between"><span>{item.label}</span><button type="button" className="rounded-full px-3 py-1 hairline" onClick={() => backend.set(`signoffs/${r.id}`, { done: { ...(r.data.done as object || {}), [item.key]: done ? null : { by: actorEmail, at: Date.now() } }, updatedAt: Date.now() }, true)}>{done ? "Signed" : "Sign off"}</button></li>;
          })}</ul>
        </article>
      ))}
    </section>
  );
}

function Library({ backend, canEdit }: { backend: ReturnType<typeof useBackend>; canEdit: boolean }) {
  const [docs, setDocs] = useState<Snap[]>([]);
  const [name, setName] = useState("");
  useEffect(() => backend.watch("library", setDocs), [backend]);
  return (
    <section>
      <h1 className="text-3xl font-semibold">Documents</h1>
      <ul className="mt-3 space-y-2">{docs.map((d) => <li key={d.id} className="card px-4 py-3 text-sm"><b>{String(d.data.name)}</b><div className="text-xs text-muted">{((d.data.roles as string[]) || []).join(", ")}{d.data.newMembers ? " · new members" : ""}</div></li>)}</ul>
      {canEdit ? <form className="mt-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await backend.add("library", { name: name.trim(), roles: ["member", "admin"], newMembers: false, at: Date.now() }); setName(""); }}><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Document name" aria-label="Document name" className={box} /><button className="rounded-full bg-blue px-4 text-sm font-semibold text-white">Add</button></form> : null}
    </section>
  );
}

async function addApplicant(backend: ReturnType<typeof useBackend>, email: string, toast: (s: string) => void, open: (id: string) => void) {
  const name = window.prompt("Full name");
  if (!name) return;
  const id = docId();
  try {
    await backend.set(`applicants/${id}`, { name, email: "", phone: "", type: "Regular", location: "Potsdam", stage: "screen", app: { received: today() }, createdAt: Date.now(), updatedAt: Date.now(), createdBy: email, updatedBy: email }, false);
    open(id);
    toast("Added " + name);
  } catch { toast("Couldn't add the applicant."); }
}
