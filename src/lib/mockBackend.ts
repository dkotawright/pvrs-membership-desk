import type { Backend, SessionUser, Snap, Tx, WhereClause, WriteOp } from "./backend";
import { deepMerge, docId } from "./backend";

interface Account { email: string; password: string; name: string; verified: boolean; mfa?: boolean }

function kids(docs: Map<string, Record<string, unknown>>, col: string): Snap[] {
  const prefix = col.replace(/\/$/, "");
  const depth = prefix.split("/").filter(Boolean).length + 1;
  const out: Snap[] = [];
  for (const [path, data] of docs) {
    if (!path.startsWith(prefix + "/")) continue;
    if (path.split("/").length !== depth) continue;
    out.push({ id: path.split("/").pop()!, path, data: { ...data } });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
function groupKids(docs: Map<string, Record<string, unknown>>, group: string): Snap[] {
  const out: Snap[] = [];
  for (const [path, data] of docs) {
    const parts = path.split("/");
    if (parts.length >= 2 && parts[parts.length - 2] === group) out.push({ id: parts[parts.length - 1], path, data: { ...data } });
  }
  return out;
}

export function createMock(seed: PvrsSeed): Backend {
  const docs = new Map<string, Record<string, unknown>>();
  for (const [path, data] of Object.entries(seed.docs || {})) docs.set(path, { ...data });
  const files = new Map<string, { type: string; url: string }>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());
  const accounts: Account[] = ((seed as PvrsSeed & { accounts?: Account[] }).accounts) || [];
  let user: SessionUser | null = seed.user
    ? { uid: seed.user.uid || "u_" + seed.user.email, email: seed.user.email.toLowerCase(), name: seed.user.name, emailVerified: seed.user.emailVerified }
    : null;
  const authListeners = new Set<(u: SessionUser | null) => void>();
  const emitAuth = () => authListeners.forEach((fn) => fn(user));
  let mfa: { email: string; name: string } | null = null;
  let linkFor = "";

  const put = (path: string, data: Record<string, unknown>, merge = true) => {
    if (merge && docs.has(path)) docs.set(path, deepMerge(docs.get(path)!, data));
    else docs.set(path, { ...data });
    notify();
  };

  const api: Backend = {
    kind: "mock",
    onAuth(cb) { authListeners.add(cb); cb(user); return () => authListeners.delete(cb); },
    current: () => user,
    async signInGoogle() {
      const g = (seed as PvrsSeed & { google?: SessionUser }).google;
      user = g || { uid: "google", email: "dkota@pvrs.org", name: "Dkota Wright", emailVerified: true };
      emitAuth();
    },
    async signInPassword(email, password) {
      const em = email.trim().toLowerCase();
      const acc = accounts.find((a) => a.email === em && a.password === password);
      if (!acc) { const err = new Error("Email or password is incorrect."); (err as Error & { code: string }).code = "auth/wrong-password"; throw err; }
      if (acc.mfa || seed.mfa) { mfa = { email: em, name: acc.name }; const err = new Error("mfa"); (err as Error & { code: string }).code = "auth/multi-factor-auth-required"; throw err; }
      user = { uid: "u_" + em, email: em, name: acc.name, emailVerified: acc.verified };
      emitAuth();
    },
    async sendLink(email) { linkFor = email.trim().toLowerCase(); },
    isEmailLink(href) { return /[?&]oobCode=/.test(href || "") || /#confirm/.test(href || (typeof location !== "undefined" ? location.href : "")); },
    async finishLink(email) {
      const em = email.trim().toLowerCase();
      if (linkFor && linkFor !== em) { const err = new Error("mismatch"); (err as Error & { code: string }).code = "auth/invalid-email"; throw err; }
      user = { uid: "u_" + em, email: em, name: em.split("@")[0], emailVerified: true };
      emitAuth();
    },
    async createAccount(name, email, password) {
      const em = email.trim().toLowerCase();
      if (accounts.some((a) => a.email === em)) { const err = new Error("exists"); (err as Error & { code: string }).code = "auth/email-already-in-use"; throw err; }
      accounts.push({ email: em, password, name, verified: false });
      user = { uid: "u_" + em, email: em, name, emailVerified: false };
      emitAuth();
    },
    async sendVerification() {},
    async reload() {
      if (user) {
        const acc = accounts.find((a) => a.email === user!.email);
        if (acc && (seed as PvrsSeed & { verifyOnReload?: boolean }).verifyOnReload) acc.verified = true;
        user = { ...user, emailVerified: acc ? acc.verified : user.emailVerified };
        emitAuth();
      }
      return user;
    },
    async resetPassword() {},
    async signOut() { user = null; emitAuth(); },
    mfaPending: () => (mfa ? "Authenticator" : null),
    async submitMfa(code) {
      if (!mfa) throw new Error("no mfa");
      if (code.replace(/\D/g, "") !== "123456") { const err = new Error("bad"); (err as Error & { code: string }).code = "auth/invalid-verification-code"; throw err; }
      user = { uid: "u_" + mfa.email, email: mfa.email, name: mfa.name, emailVerified: true };
      mfa = null;
      emitAuth();
    },
    cancelMfa() { mfa = null; },
    watch(col, cb, where?: WhereClause[]) {
      const run = () => {
        let list = kids(docs, col);
        for (const w of where || []) {
          list = list.filter((d) => {
            const v = d.data[w.field];
            if (w.op === "array-contains") return Array.isArray(v) && v.includes(w.value);
            return v === w.value;
          });
        }
        cb(list);
      };
      listeners.add(run); run();
      return () => listeners.delete(run);
    },
    watchGroup(group, cb) {
      const run = () => cb(groupKids(docs, group));
      listeners.add(run); run();
      return () => listeners.delete(run);
    },
    async get(path) { const data = docs.get(path); return data ? { id: path.split("/").pop()!, path, data: { ...data } } : null; },
    async set(path, data, merge = true) { put(path, data, merge); },
    async add(col, data) { const id = docId(); put(`${col}/${id}`, data, false); return id; },
    async del(path) { docs.delete(path); notify(); },
    async commit(ops: WriteOp[]) { for (const op of ops) { if (op.op === "delete") docs.delete(op.path); else put(op.path, op.data || {}, op.merge !== false); } },
    async transaction(fn) {
      const staged = new Map<string, Record<string, unknown> | null>();
      const read = (path: string): Snap | null => {
        if (staged.has(path)) { const d = staged.get(path); return d ? { id: path.split("/").pop()!, path, data: { ...d } } : null; }
        const data = docs.get(path);
        return data ? { id: path.split("/").pop()!, path, data: { ...data } } : null;
      };
      const tx: Tx = {
        async get(path) { return read(path); },
        set(path, data, merge = true) {
          const cur = read(path)?.data || {};
          staged.set(path, merge ? deepMerge(cur, data) : { ...data });
        },
        del(path) { staged.set(path, null); },
      };
      const result = await fn(tx);
      for (const [path, data] of staged) { if (data == null) docs.delete(path); else docs.set(path, data); }
      notify();
      return result;
    },
    async upload(path, file, contentType) {
      const url = URL.createObjectURL(file);
      files.set(path, { type: contentType, url });
    },
    async url(path) {
      const f = files.get(path);
      if (!f) throw new Error("missing");
      return f.url;
    },
    async removeFile(path) { files.delete(path); },
    async call(name, data) {
      const job = (data as { job?: string; kind?: string; id?: string })?.job;
      const calls = { n: 4, limit: 150, provider: "anthropic", chatModel: "claude-haiku-5-5", briefModel: "claude-sonnet-5-5", fastModel: "openai/gpt-oss-20b", deepModel: "openai/gpt-oss-120b" };
      if (name !== "medControl") return {};
      if (job === "usage") return calls;
      if (job === "briefing") return { text: "Jordan Hale still needs an interview time. Riley Brooks is ready for the board. Morgan Ellis is partway through orientation.", items: [
        { id: "jordan", title: "Jordan Hale has no interview time", sub: "References are in" },
        { id: "riley", title: "Riley Brooks is ready for the board", sub: "Committee has approved" },
        { id: "morgan", title: "Morgan Ellis: orientation in progress", sub: "Checklist still open" },
      ], calls };
      if (job === "questions") return { questions: [
        "What does a 24-hour month look like around your class schedule?",
        "Tell us about a time you stayed with something hard.",
        "How would you handle a call that stayed with you afterwards?",
      ], calls };
      if (job === "reply") return { text: "Hi — thanks for the note. We'll reply with the next step here, usually within a few days.", calls };
      if (job === "draft_email") return { subject: "PVRS Membership", text: "Hi,\n\nThanks for applying to the Potsdam Volunteer Rescue Squad. Your applicant page is ready when you sign in.\n\nDkota Wright\nPotsdam Volunteer Rescue Squad", calls };
      if (job === "brief") return { brief: { summary: "A committed applicant with references in and a clear interview.", interviewSummary: "They want to serve Potsdam and can meet the monthly shifts.", referencesSummary: "References describe them as reliable.", recommendation: "proceed", recommendationReasons: ["References are in.", "Interview is complete."], strengths: ["Reliability"], followUps: [], questions: [], references: [], at: Date.now(), model: "openai/gpt-oss-120b" }, calls };
      return { text: "Jordan Hale is the person waiting on an interview time. Riley Brooks is ready for the next board meeting.", calls };
    },
  };
  return api;
}
