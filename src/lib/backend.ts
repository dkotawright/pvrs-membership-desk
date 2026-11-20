export interface Snap {
  id: string;
  path: string;
  data: Record<string, unknown>;
}
export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  emailVerified: boolean;
}
export interface WriteOp {
  op: "set" | "delete";
  path: string;
  data?: Record<string, unknown>;
  merge?: boolean;
}
export interface WhereClause {
  field: string;
  op: "==" | "array-contains";
  value: unknown;
}
export interface Tx {
  get(path: string): Promise<Snap | null>;
  set(path: string, data: Record<string, unknown>, merge?: boolean): void;
  del(path: string): void;
}
export interface Backend {
  kind: "mock" | "firebase";
  onAuth(cb: (u: SessionUser | null) => void): () => void;
  current(): SessionUser | null;
  signInGoogle(): Promise<void>;
  signInPassword(email: string, password: string): Promise<void>;
  sendLink(email: string): Promise<void>;
  isEmailLink(href?: string): boolean;
  finishLink(email: string): Promise<void>;
  createAccount(name: string, email: string, password: string): Promise<void>;
  sendVerification(): Promise<void>;
  reload(): Promise<SessionUser | null>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  mfaPending(): string | null;
  submitMfa(code: string): Promise<void>;
  cancelMfa(): void;
  watch(col: string, cb: (docs: Snap[]) => void, where?: WhereClause[]): () => void;
  watchGroup(group: string, cb: (docs: Snap[]) => void): () => void;
  get(path: string): Promise<Snap | null>;
  set(path: string, data: Record<string, unknown>, merge?: boolean): Promise<void>;
  add(col: string, data: Record<string, unknown>): Promise<string>;
  del(path: string): Promise<void>;
  commit(ops: WriteOp[]): Promise<void>;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  upload(path: string, file: Blob, contentType: string): Promise<void>;
  url(path: string): Promise<string>;
  removeFile(path: string): Promise<void>;
  call(name: string, data: unknown): Promise<unknown>;
}

export function docId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else out[k] = v;
  }
  return out;
}

export async function createBackend(): Promise<Backend> {
  if (typeof window !== "undefined" && window.__PVRS_MOCK) {
    const { createMock } = await import("./mockBackend");
    return createMock(window.__PVRS_SEED || { user: null, docs: {} });
  }
  const { createFirebase } = await import("./firebaseBackend");
  return createFirebase();
}
