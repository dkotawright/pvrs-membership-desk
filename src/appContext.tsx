import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Backend, SessionUser } from "./lib/backend";
import { createBackend } from "./lib/backend";
import { PAPERWORK_EMAIL, OWNER_EMAIL } from "./lib/config";
import { lower, resolveActor, type Actor, type StaffDoc } from "./lib/domain";
import { applyTheme, readTheme } from "./lib/theme";

const BackendCtx = createContext<Backend | null>(null);
export function useBackend() {
  const b = useContext(BackendCtx);
  if (!b) throw new Error("backend");
  return b;
}

const ToastCtx = createContext<(msg: string) => void>(() => {});
export function useToast() { return useContext(ToastCtx); }

const NavCtx = createContext<(to: string) => void>(() => {});
export function useGo() { return useContext(NavCtx); }

export interface Gate {
  user: SessionUser | null;
  actor: Actor | null;
  portalId: string | null;
  request: Record<string, unknown> | null;
  ready: boolean;
}

const GateCtx = createContext<Gate>({ user: null, actor: null, portalId: null, request: null, ready: false });
export function useGate() { return useContext(GateCtx); }

export function Providers({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [toast, setToast] = useState("");
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => { createBackend().then(setBackend); }, []);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const go = (to: string) => {
    const next = to.startsWith("/") ? to : "/" + to;
    history.pushState(null, "", next);
    setPath(next.split("?")[0].split("#")[0]);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  if (!backend) {
    return <div className="grid min-h-full place-items-center text-muted">Loading…</div>;
  }
  return (
    <BackendCtx.Provider value={backend}>
      <ToastCtx.Provider value={setToast}>
        <NavCtx.Provider value={go}>
          <Session path={path}>
            <ThemeSync />
            {children}
            {toast ? <div role="status" className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">{toast}</div> : null}
          </Session>
        </NavCtx.Provider>
      </ToastCtx.Provider>
    </BackendCtx.Provider>
  );
}

function Session({ children, path }: { children: ReactNode; path: string }) {
  const backend = useBackend();
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [actor, setActor] = useState<Actor | null>(null);
  const [portalId, setPortalId] = useState<string | null>(null);
  const [request, setRequest] = useState<Record<string, unknown> | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => backend.onAuth((u) => { setUser(u); }), [backend]);

  useEffect(() => {
    if (user === undefined) return;
    let stop = false;
    const unsubs: (() => void)[] = [];
    (async () => {
      setReady(false);
      if (!user) { setActor(null); setPortalId(null); setRequest(null); setReady(true); return; }
      if (!user.emailVerified) { setActor(null); setPortalId(null); setReady(true); return; }
      const email = lower(user.email);
      if (email === lower(PAPERWORK_EMAIL)) {
        setActor(resolveActor(email, null, user.name));
        setPortalId(null); setReady(true); return;
      }
      if (email === lower(OWNER_EMAIL)) {
        setActor(resolveActor(email, null, user.name || "Dkota Wright"));
        setPortalId(null); setReady(true); return;
      }
      const staff = await backend.get("staff/" + email);
      const staffDoc = (staff?.data || null) as StaffDoc | null;
      if (staffDoc) {
        const a = resolveActor(email, staffDoc, user.name);
        setActor(a);
        if (a.role !== "none") {
          const unsub = backend.watch("portal", (docs) => {
            if (stop) return;
            const mine = docs.find((d) => lower(d.data.email) === email && d.data.orientation);
            setPortalId(mine ? mine.id : null);
          }, [{ field: "email", op: "==", value: email }]);
          unsubs.push(unsub);
        }
        setReady(true);
        return;
      }
      const unsub = backend.watch("portal", (docs) => {
        if (stop) return;
        const mine = docs[0];
        if (mine) { setActor(null); setPortalId(mine.id); setReady(true); }
        else {
          setPortalId(null);
          backend.get("accessRequests/" + email).then((r) => { if (!stop) { setRequest(r?.data || null); setActor(null); setReady(true); } });
        }
      }, [{ field: "email", op: "==", value: email }]);
      unsubs.push(unsub);
    })();
    return () => { stop = true; unsubs.forEach((u) => u()); };
  }, [user, backend]);

  const gate = useMemo<Gate>(() => ({
    user: user || null,
    actor,
    portalId,
    request,
    ready: user !== undefined && (user === null || ready),
  }), [user, actor, portalId, request, ready]);

  return <GateCtx.Provider value={gate}><PathCtx.Provider value={path}>{children}</PathCtx.Provider></GateCtx.Provider>;
}

const PathCtx = createContext("/");
export function usePath() { return useContext(PathCtx); }

function ThemeSync() {
  const { user } = useGate();
  useEffect(() => {
    const apply = () => applyTheme(readTheme(user?.email));
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [user?.email]);
  return null;
}
