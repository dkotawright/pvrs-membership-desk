import { useEffect, useState } from "react";
import { Bell, Copy, Mail, QrCode } from "lucide-react";
import { useBackend } from "../appContext";
import type { Backend } from "../lib/backend";
import { VAPID_KEY } from "../lib/config";
import { qrSVG } from "../lib/qr";
import {
  DAY, dupesOf, first, get, lower, newToken, okEmail, refNudge, signatureText, today,
  type Applicant, type Settings,
} from "../lib/domain";

export async function refUrl(backend: ReturnType<typeof useBackend>, a: Applicant, i: number, by: string, edit: (a: Applicant, p: string, v: unknown) => void) {
  const name = String(get(a, `refs.r${i}.name`) || "").trim();
  if (!name) return "";
  let tok = String(get(a, `refs.r${i}.link`) || "");
  const exp = Number(get(a, `refs.r${i}.linkExp`) || 0);
  if (!tok || exp < Date.now() + DAY) {
    tok = newToken();
    const expiresAt = Date.now() + 60 * DAY;
    await backend.set(`refLinks/${tok}`, { appId: a._id, slot: i, applicant: a.name || "", first: first(a.name) || "", refName: name, createdAt: Date.now(), expiresAt, by });
    edit(a, `refs.r${i}.link`, tok);
    edit(a, `refs.r${i}.linkAt`, today());
    edit(a, `refs.r${i}.linkExp`, expiresAt);
  }
  return `${location.origin}/ref/${tok}`;
}

export function mailRef(a: Applicant, i: number, url: string, settings: Settings, remind = false) {
  const to = lower(get(a, `refs.r${i}.email`));
  const name = String(get(a, `refs.r${i}.name`) || "");
  const body = remind
    ? `Hi ${first(name)},\n\nA reminder: ${a.name} listed you as a reference for the Potsdam Volunteer Rescue Squad. It takes about 5 minutes:\n\n${url}\n\nThank you,\n${signatureText(settings)}`
    : `Hi ${first(name)},\n\n${a.name} applied to volunteer with the Potsdam Volunteer Rescue Squad and listed you as a reference. It takes about 5 minutes:\n\n${url}\n\nThe link is just for you. Your answers go only to the membership committee.\n\nThank you,\n${signatureText(settings)}`;
  const subject = remind ? `Reminder: reference for ${a.name}` : `Reference for ${a.name}: Potsdam Volunteer Rescue Squad`;
  window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function DupeBanner({ a, apps, edit, onMerge }: { a: Applicant; apps: Applicant[]; edit: (a: Applicant, p: string, v: unknown) => void; onMerge: (drop: Applicant) => void }) {
  const dupes = dupesOf(a, apps);
  if (!dupes.length) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm" data-screen="dupes">
      <b>Possible duplicate.</b> {dupes.map((d) => d.name).join(", ")} matches this file.
      <div className="mt-2 flex flex-wrap gap-2">
        {dupes.map((d) => (
          <span key={d._id} className="flex gap-2">
            <button type="button" className="rounded-full bg-white px-3 py-1 hairline" onClick={() => onMerge(d)}>Merge</button>
            <button type="button" className="rounded-full px-3 py-1 text-muted" onClick={() => edit(a, `notDupes.${d._id}`, today())}>Not a duplicate</button>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Flyer() {
  const url = `${location.origin}/apply?src=flyer`;
  return (
    <section className="card mt-4 p-5" data-screen="flyer">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><QrCode className="h-5 w-5 text-blue" /> Recruiting flyer</h2>
      <p className="mt-1 text-sm text-muted">The code opens the application with “Flyer or poster” already chosen.</p>
      <div className="mt-3 w-fit rounded-2xl bg-white p-3 hairline" dangerouslySetInnerHTML={{ __html: qrSVG(url, { size: 180 }) }} />
      <button type="button" className="mt-3 rounded-full bg-blue px-4 py-2 text-sm font-semibold text-white" onClick={() => window.print()}>Print flyer</button>
    </section>
  );
}

async function enableAlerts(backend: Backend) {
  if (typeof Notification === "undefined") return "This browser doesn't offer alerts.";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "Alerts stay off until the browser allows them.";
  if (backend.kind !== "firebase") return "";
  const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
  const { getApp } = await import("firebase/app");
  if (!(await isSupported())) return "This browser can't receive alerts.";
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const token = await getToken(getMessaging(getApp()), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) return "The browser didn't issue a token.";
  const me = backend.current();
  await backend.set(`pushTokens/${token}`, { email: me?.email || "", device: navigator.userAgent.slice(0, 80), at: Date.now() });
  try { localStorage.setItem("pvrsPushToken", token); } catch { /* ignore */ }
  return "";
}

export function NotifySheet({ onClose }: { onClose: () => void }) {
  const backend = useBackend();
  const [on, setOn] = useState(() => { try { return localStorage.getItem("pvrsPush") === "on"; } catch { return false; } });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/30 p-4 sm:place-items-center" role="dialog" aria-label="Notifications" data-screen="notifications">
      <div className="card w-full max-w-md p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><Bell className="h-5 w-5 text-blue" /> Notifications</h2>
        <p className="mt-2 text-sm text-muted">Alerts when an application arrives, a reference answers, or someone books. On an iPhone, add PVRS to your Home Screen first, then turn alerts on from there.</p>
        <button type="button" disabled={busy} className="mt-4 w-full rounded-full bg-blue py-3 font-semibold text-white" onClick={() => {
          if (on) {
            const token = localStorage.getItem("pvrsPushToken");
            try { localStorage.setItem("pvrsPush", "off"); localStorage.removeItem("pvrsPushToken"); } catch { /* ignore */ }
            if (token) void backend.del(`pushTokens/${token}`).catch(() => {});
            setOn(false);
            setNote("");
            return;
          }
          setBusy(true);
          void enableAlerts(backend).then((err) => {
            if (err) setNote(err);
            else { try { localStorage.setItem("pvrsPush", "on"); } catch { /* ignore */ } setOn(true); setNote(""); }
          }).catch((e) => setNote((e as Error).message || "Alerts couldn't be turned on.")).finally(() => setBusy(false));
        }}>{busy ? "Asking the browser…" : on ? "Alerts are on for this device" : "Turn on alerts"}</button>
        {note ? <p className="mt-2 text-sm text-crimson">{note}</p> : null}
        <button type="button" className="mt-2 w-full text-sm text-muted" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export function BulkBar({ ids, apps, onClear }: { ids: string[]; apps: Applicant[]; onClear: () => void }) {
  const backend = useBackend();
  const chosen = apps.filter((a) => ids.includes(a._id));
  if (!ids.length) return null;
  return (
    <div className="card mt-3 flex flex-wrap items-center gap-2 p-3 text-sm" data-screen="bulk">
      <b>{ids.length} selected</b>
      <button type="button" className="rounded-full bg-blue px-3 py-1.5 font-semibold text-white" onClick={async () => {
        const email = window.prompt("Interviewer email");
        if (!email || !okEmail(email)) return;
        for (const a of chosen) {
          const list = Array.from(new Set([...(a.interviewers || []), email.trim().toLowerCase()]));
          await backend.set(`applicants/${a._id}`, { interviewers: list }, true);
        }
        onClear();
      }}>Assign interviewer</button>
      <button type="button" className="rounded-full px-3 py-1.5 hairline" onClick={async () => {
        const text = window.prompt("Message ({first} becomes their first name)");
        if (!text) return;
        for (const a of chosen) {
          if (!get(a, "portal.invited")) continue;
          await backend.add(`portal/${a._id}/messages`, { text: text.replaceAll("{first}", first(a.name) || "there"), from: "staff", by: backend.current()?.email || "", name: "PVRS", at: Date.now() });
        }
        onClear();
      }}>Message</button>
      <button type="button" className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 hairline" onClick={() => {
        const emails = chosen.flatMap((a) => [1, 2, 3, 4].flatMap((i) => {
          const e = lower(get(a, `refs.r${i}.email`));
          return okEmail(e) && !get(a, `refs.r${i}.returned`) ? [e] : [];
        }));
        if (emails.length) window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent("Reference for a PVRS applicant")}`;
      }}><Mail className="h-3.5 w-3.5" /> Email references</button>
      <button type="button" className="text-muted" onClick={onClear}>Clear</button>
    </div>
  );
}

export function usePushRefresh() {
  const backend = useBackend();
  useEffect(() => {
    const tick = () => {
      try {
        if (localStorage.getItem("pvrsPush") !== "on") return;
        localStorage.setItem("pvrsPushAt", String(Date.now()));
        const token = localStorage.getItem("pvrsPushToken");
        const me = backend.current();
        if (token && me && backend.kind === "firebase") void backend.set(`pushTokens/${token}`, { email: me.email, device: navigator.userAgent.slice(0, 80), at: Date.now() });
      } catch { /* ignore */ }
    };
    tick();
    const id = window.setInterval(tick, 6 * 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [backend]);
}

export function CopyLink({ url }: { url: string }) {
  return <button type="button" className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs hairline" onClick={() => navigator.clipboard.writeText(url)}><Copy className="h-3 w-3" /> Copy link</button>;
}
