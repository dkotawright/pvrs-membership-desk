import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, createUserWithEmailAndPassword,
  sendEmailVerification, updateProfile, sendPasswordResetEmail, signOut as fbSignOut,
  getMultiFactorResolver, TotpMultiFactorGenerator, type User, type MultiFactorResolver,
} from "firebase/auth";
import {
  getFirestore, collection, collectionGroup, doc, getDoc, setDoc, addDoc, deleteDoc, onSnapshot,
  query, where, writeBatch, runTransaction,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseConfig, FN_REGION } from "./config";
import type { Backend, SessionUser, Snap, Tx, WhereClause, WriteOp } from "./backend";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, FN_REGION);

function toUser(u: User | null): SessionUser | null {
  if (!u?.email) return null;
  return { uid: u.uid, email: u.email.toLowerCase(), name: u.displayName || "", emailVerified: u.emailVerified };
}
function dref(path: string) {
  return doc(db, path);
}
function cref(path: string) {
  return collection(db, path);
}

let resolver: MultiFactorResolver | null = null;

export function createFirebase(): Backend {
  const linkSettings = () => ({ url: location.origin + "/", handleCodeInApp: true });
  return {
    kind: "firebase",
    onAuth(cb) { return onAuthStateChanged(auth, (u) => cb(toUser(u))); },
    current: () => toUser(auth.currentUser),
    async signInGoogle() {
      try { await signInWithPopup(auth, new GoogleAuthProvider()); }
      catch (e) {
        const err = e as { code?: string };
        if (err.code === "auth/multi-factor-auth-required") resolver = getMultiFactorResolver(auth, e as never);
        throw e;
      }
    },
    async signInPassword(email, password) {
      try { await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password); }
      catch (e) {
        const err = e as { code?: string };
        if (err.code === "auth/multi-factor-auth-required") resolver = getMultiFactorResolver(auth, e as never);
        throw e;
      }
    },
    async sendLink(email) { await sendSignInLinkToEmail(auth, email.trim().toLowerCase(), linkSettings()); },
    isEmailLink(href) { return isSignInWithEmailLink(auth, href || location.href); },
    async finishLink(email) { await signInWithEmailLink(auth, email.trim().toLowerCase(), location.href); },
    async createAccount(name, email, password) {
      const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      await updateProfile(cred.user, { displayName: name.slice(0, 100) }).catch(() => {});
      await sendEmailVerification(cred.user, { url: location.origin + "/signin" });
    },
    async sendVerification() {
      if (auth.currentUser) await sendEmailVerification(auth.currentUser, { url: location.origin + "/signin" });
    },
    async reload() {
      if (auth.currentUser) { await auth.currentUser.reload(); await auth.currentUser.getIdToken(true); }
      return toUser(auth.currentUser);
    },
    async resetPassword(email) { await sendPasswordResetEmail(auth, email.trim().toLowerCase()); },
    async signOut() { await fbSignOut(auth); },
    mfaPending: () => (resolver ? resolver.hints[0]?.displayName || "Authenticator" : null),
    async submitMfa(code) {
      if (!resolver) throw new Error("no mfa");
      const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
      if (!hint) throw new Error("unsupported");
      await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.replace(/\D/g, "")));
      resolver = null;
    },
    cancelMfa() { resolver = null; },
    watch(col, cb, clauses) {
      let q = query(cref(col));
      for (const w of clauses || []) q = query(q, where(w.field, w.op, w.value));
      return onSnapshot(q, (s) => {
        cb(s.docs.map((d) => ({ id: d.id, path: d.ref.path, data: d.data() as Record<string, unknown> })));
      }, () => cb([]));
    },
    watchGroup(group, cb) {
      return onSnapshot(collectionGroup(db, group), (s) => {
        cb(s.docs.map((d) => ({ id: d.id, path: d.ref.path, data: d.data() as Record<string, unknown> })));
      }, () => cb([]));
    },
    async get(path) {
      const s = await getDoc(dref(path));
      return s.exists() ? { id: s.id, path, data: s.data() as Record<string, unknown> } : null;
    },
    async set(path, data, merge = true) { await setDoc(dref(path), data, { merge }); },
    async add(col, data) {
      const r = await addDoc(cref(col), data);
      return r.id;
    },
    async del(path) { await deleteDoc(dref(path)); },
    async commit(ops: WriteOp[]) {
      const b = writeBatch(db);
      for (const op of ops) {
        if (op.op === "delete") b.delete(dref(op.path));
        else b.set(dref(op.path), op.data || {}, { merge: op.merge !== false });
      }
      await b.commit();
    },
    async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      return runTransaction(db, async (t) => {
        const tx: Tx = {
          async get(path) {
            const s = await t.get(dref(path));
            return s.exists() ? { id: s.id, path, data: s.data() as Record<string, unknown> } : null;
          },
          set(path, data, merge = true) { t.set(dref(path), data, { merge }); },
          del(path) { t.delete(dref(path)); },
        };
        return fn(tx);
      });
    },
    async upload(path, file, contentType) { await uploadBytes(ref(storage, path), file, { contentType }); },
    async url(path) { return getDownloadURL(ref(storage, path)); },
    async removeFile(path) { await deleteObject(ref(storage, path)); },
    async call(name, data) {
      const fn = httpsCallable(functions, name === "medControl" ? "ai-medControl" : name);
      const res = await fn(data);
      return res.data;
    },
  };
}

export type { Snap };
