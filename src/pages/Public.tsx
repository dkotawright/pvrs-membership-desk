import { useEffect, useState, type FormEvent } from "react";
import { ClipboardCheck, HeartPulse, Car, GraduationCap, HandHeart, MessageSquare, Shield, Sparkles } from "lucide-react";
import { useBackend, useGate, useGo, useToast } from "../appContext";
import { CONTACT_EMAIL } from "../lib/config";
import { lower, okEmail } from "../lib/domain";

export function PublicBar() {
  const go = useGo();
  return (
    <header className="frost sticky top-0 z-30 flex items-center justify-between border-b border-black/5 px-5 py-3">
      <button type="button" onClick={() => go("/")} className="inline-flex items-center gap-2 font-semibold tracking-tight">
        <img src="/img/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
        PVRS
      </button>
      <nav className="flex items-center gap-2 text-sm">
        <button type="button" onClick={() => go("/apply")} className="rounded-full bg-crimson px-4 py-1.5 font-medium text-white press">Apply</button>
        <button type="button" onClick={() => go("/signin")} className="rounded-full px-3 py-1.5 text-ink/80 hover:bg-black/5">Sign in</button>
      </nav>
    </header>
  );
}

export function HomePage() {
  const go = useGo();
  const steps = [
    [ClipboardCheck, "Apply", "About 15 minutes"],
    [Shield, "We review", "References and checks"],
    [MessageSquare, "Interview", "Meet the committee"],
    [HeartPulse, "Welcome", "Orientation"],
  ] as const;
  const tracks = [
    [HeartPulse, "EMT", "Run calls after orientation and a clear Sterling check."],
    [Car, "Driver", "Same commitment, focused on the rig."],
    [GraduationCap, "Associate", "Students. Half-time resident. Fifteen spots."],
    [HandHeart, "Auxiliary", "Already in EMS. Lighter meeting load."],
  ] as const;
  const why = [
    ["Your town", "Calls stay in Potsdam and the towns around it."],
    ["Your squad", "EMTs, drivers, and members train together."],
    ["Your pace", "The application takes about 15 minutes, then you follow it in your own portal."],
  ];
  return (
    <div data-screen="home" className="min-h-full bg-canvas">
      <section className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-[#07111f] text-white">
        <img src="/img/hero.svg" alt="" className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover object-right sm:block" />
        <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-[#07111f] from-40% via-[#07111f]/80 to-transparent sm:block" />
        <header className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 sm:px-8">
          <button type="button" onClick={() => go("/")} className="flex min-w-0 items-center gap-2.5 text-left text-white">
            <img src="/img/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl sm:h-12 sm:w-12" />
            <span className="min-w-0">
              <span className="block text-base font-semibold leading-none tracking-tight">PVRS</span>
              <span className="mt-1 hidden text-[11px] font-medium text-white/90 sm:block sm:text-xs">Potsdam Volunteer Rescue Squad</span>
            </span>
          </button>
          <nav className="flex items-center gap-1.5">
            <button type="button" onClick={() => go("/signin")} className="rounded-full px-3 py-2 text-sm font-medium text-white">Sign in</button>
            <button type="button" onClick={() => go("/apply")} className="rounded-full bg-crimson px-3 py-2 text-sm font-semibold text-white shadow-lg press sm:px-4">Apply</button>
          </nav>
        </header>
        <div className="relative z-10 flex flex-1 flex-col justify-end px-4 pb-8 sm:px-8 sm:pb-14">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Potsdam Volunteer Rescue Squad</p>
          <h1 className="mt-3 max-w-4xl text-6xl font-semibold leading-[0.92] text-white sm:text-8xl">Serve Potsdam.<br />Save lives.</h1>
          <p className="mt-5 max-w-xl text-lg text-white/80">Volunteer EMTs, drivers, and members. Your progress saves on this device, then follows you in your own portal.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => go("/apply")} className="rounded-full bg-crimson px-7 py-3.5 text-base font-semibold text-white shadow-lg press">Apply to join PVRS</button>
            <button type="button" onClick={() => go("/signin")} className="rounded-full bg-white/10 px-7 py-3.5 text-base font-semibold text-white ring-1 ring-white/30 press">Member and applicant sign in</button>
          </div>
          <img src="/img/hero.svg" alt="" data-hero-rig className="mt-6 h-32 w-full rounded-2xl object-cover object-[72%_58%] sm:hidden" />
          <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-white/15 pt-6 sm:mt-10 sm:grid-cols-4">
            {[["1955", "On the squad since"], ["Potsdam", "St. Lawrence County"], ["Volunteer", "EMTs, drivers, members"], ["15 min", "To start an application"]].map(([n, l]) => (
              <div key={l}><dt className="text-3xl font-semibold text-white">{n}</dt><dd className="text-sm text-white/70">{l}</dd></div>
            ))}
          </dl>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-8">
        <h2 className="text-3xl font-semibold">Why people join</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {why.map(([title, sub]) => (
            <article key={title} className="card p-5"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-2 text-sm text-muted">{sub}</p></article>
          ))}
        </div>
        <h2 className="mt-12 text-3xl font-semibold">Ways to serve</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tracks.map(([Icon, title, sub]) => (
            <article key={title} className="card overflow-hidden p-0">
              <div className="h-1.5 bg-crimson" />
              <div className="p-5"><Icon className="h-7 w-7 text-crimson" aria-hidden /><h3 className="mt-4 text-2xl font-semibold">{title}</h3><p className="mt-2 text-sm text-muted">{sub}</p></div>
            </article>
          ))}
        </div>
        <ol className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {steps.map(([Icon, title, sub], i) => (
            <li key={title} className="card p-4"><Icon className="h-5 w-5 text-blue" aria-hidden /><div className="mt-3 text-xs font-semibold text-blue">0{i + 1}</div><div className="text-lg font-semibold">{title}</div><div className="text-sm text-muted">{sub}</div></li>
          ))}
        </ol>
        <p className="mt-8 text-sm text-muted"><Sparkles className="mr-1 inline h-4 w-4" /> Questions: {CONTACT_EMAIL}</p>
      </section>
    </div>
  );
}

function greet() {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Weather() {
  const [text, setText] = useState("");
  useEffect(() => {
    const key = "pvrsWx";
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || "null");
      if (cached && Date.now() - cached.at < 15 * 60e3) { setText(cached.text); return; }
    } catch { /* ignore */ }
    const url = "https://api.open-meteo.com/v1/forecast?latitude=44.6698&longitude=-74.9813&current=temperature_2m,weather_code&daily=sunrise,sunset&timezone=America%2FNew_York&forecast_days=1";
    fetch(url).then((r) => r.json()).then((j) => {
      const t = Math.round(j?.current?.temperature_2m);
      if (!Number.isFinite(t)) return;
      const line = `${t}° in Potsdam`;
      setText(line);
      try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), text: line })); } catch { /* ignore */ }
    }).catch(() => {});
  }, []);
  if (!text) return null;
  return <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-sm text-ink shadow-sm hairline" data-screen="weather">{text}</div>;
}

export function SignInPage() {
  const backend = useBackend();
  const toast = useToast();
  const go = useGo();
  const [sent, setSent] = useState("");
  const [pane, setPane] = useState<"link" | "password">("link");
  const [mode, setMode] = useState<"in" | "new">("in");
  const [mfa, setMfa] = useState("");
  const link = backend.isEmailLink();
  const [confirm, setConfirm] = useState(link);

  async function onLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = lower(new FormData(e.currentTarget).get("email"));
    if (!okEmail(email)) return toast("Enter a valid email address.");
    try {
      await backend.sendLink(email);
      try { localStorage.setItem("pvrsEmailForSignIn", email); } catch { /* ignore */ }
      setSent(email);
    } catch { toast("Couldn't send the link. Check the address and try again."); }
  }
  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = lower(fd.get("email"));
    const password = String(fd.get("password") || "");
    if (!okEmail(email) || !password) return toast("Enter your email and password.");
    try { await backend.signInPassword(email, password); try { localStorage.setItem("pvrsStaffEmail", email); } catch { /* ignore */ } }
    catch (err) {
      const code = (err as { code?: string }).code || "";
      if (code === "auth/multi-factor-auth-required") return setMfa(backend.mfaPending() || "your authenticator app");
      toast(code === "auth/too-many-requests" ? "Too many tries. Wait a few minutes." : "Email or password is incorrect. New here? Choose Create account.");
    }
  }
  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const email = lower(fd.get("email"));
    const pw = String(fd.get("password") || "");
    const pw2 = String(fd.get("password2") || "");
    if (name.length < 2) return toast("Enter your full name.");
    if (!okEmail(email)) return toast("Enter a valid email address.");
    if (pw.length < 10) return toast("Use at least 10 characters for your password.");
    if (pw !== pw2) return toast("The two passwords don't match.");
    try { await backend.createAccount(name, email, pw); }
    catch (err) {
      const code = (err as { code?: string }).code || "";
      toast(code === "auth/email-already-in-use" ? "There's already an account with that email. Sign in instead." : "Couldn't create the account.");
    }
  }
  async function onConfirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = lower(new FormData(e.currentTarget).get("email"));
    if (!okEmail(email)) return toast("Enter a valid email address.");
    try { await backend.finishLink(email); history.replaceState(null, "", "/"); }
    catch { toast("That sign-in link expired or was already used. Request a new one."); }
  }
  async function onMfa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") || "");
    try { await backend.submitMfa(code); setMfa(""); }
    catch (err) {
      const codeE = (err as { code?: string }).code;
      toast(codeE === "auth/invalid-verification-code" ? "That code didn't match. Wait for a new one and try again." : "Sign-in didn't finish. Try again.");
    }
  }

  return (
    <div data-screen="signin" className="mesh grid min-h-full place-items-center px-4 py-10">
      <section className="card w-full max-w-md bg-white p-6 opacity-100 sm:p-8">
          <img src="/img/logo.png" alt="Potsdam Volunteer Rescue Squad" className="wordmark mx-auto h-16" />
          <p className="mt-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted">{greet()} · Potsdam</p>
          <div className="mt-2 flex justify-center"><Weather /></div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Membership portal</p>
          <h2 className="text-center text-3xl font-semibold">{confirm ? "Confirm your email" : "Sign in"}</h2>
          {!confirm ? (
            <div className="seg mt-4 w-full" role="tablist" aria-label="Sign-in method">
              <button type="button" className="flex-1" aria-pressed={pane === "link"} onClick={() => setPane("link")}>Sign-in link</button>
              <button type="button" className="flex-1" aria-pressed={pane === "password"} onClick={() => setPane("password")}>Password</button>
            </div>
          ) : null}
          {confirm ? (
            <form onSubmit={onConfirm} className="mt-4 space-y-3">
              <p className="text-sm text-muted">You opened the sign-in link on a different device. Enter the same email address to finish signing in.</p>
              <label className="block text-sm font-medium">Email<input name="email" type="email" required className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 outline-none hairline" /></label>
              <button className="w-full rounded-full bg-blue py-3 font-semibold text-white press">Sign in</button>
            </form>
          ) : (
            <>
              {pane === "link" ? <>
              <p className="mt-3 text-center text-sm text-muted">One sign-in for applicants and the squad. No password.</p>
              <form onSubmit={onLink} className="mt-4 space-y-3">
                <label className="block text-sm font-medium">Email address
                  <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 outline-none hairline" />
                </label>
                <button className="w-full rounded-full bg-blue py-3 font-semibold text-white press">Send sign-in link</button>
              </form>
              <p className="mt-2 text-xs text-muted"><b>The email often lands in spam or junk.</b> If you don’t see it in a minute, look there.</p>
              {sent ? <p className="mt-3 rounded-2xl bg-[#f5f5f7] p-3 text-sm" role="status">Check <b>{sent}</b> for a sign-in link. Open it on this device.</p> : null}
              </> : null}
              {pane === "password" ? <>
              <p className="mt-3 text-sm font-medium">Use email and password instead</p>
                <div className="mt-3 flex rounded-full bg-[#f5f5f7] p-1 text-sm">
                  <button type="button" className={`flex-1 rounded-full py-2 ${mode === "in" ? "bg-white shadow-sm" : ""}`} onClick={() => setMode("in")}>Sign in</button>
                  <button type="button" className={`flex-1 rounded-full py-2 ${mode === "new" ? "bg-white shadow-sm" : ""}`} onClick={() => setMode("new")}>Create account</button>
                </div>
                {mode === "in" ? (
                  <form onSubmit={onPassword} className="mt-3 space-y-3">
                    <label className="block text-sm">Email<input name="email" type="email" autoComplete="username" required className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 outline-none hairline" /></label>
                    <label className="block text-sm">Password<input name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 outline-none hairline" /></label>
                    <button className="w-full rounded-full bg-blue py-3 font-semibold text-white">Sign in</button>
                    <button type="button" className="text-sm text-blue" onClick={async (ev) => {
                      const email = lower((ev.currentTarget.form?.querySelector("[name=email]") as HTMLInputElement | null)?.value);
                      if (!okEmail(email)) return toast("Enter your email first, then click Forgot password.");
                      try { await backend.resetPassword(email); } catch { /* always vague */ }
                      toast(`If ${email} has a password, a reset link is on its way.`);
                    }}>Forgot your password?</button>
                  </form>
                ) : (
                  <form onSubmit={onCreate} className="mt-3 space-y-3">
                    <label className="block text-sm">Full name<input name="name" required className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 outline-none hairline" /></label>
                    <label className="block text-sm">Email<input name="email" type="email" required className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 outline-none hairline" /></label>
                    <label className="block text-sm">Password<input name="password" type="password" minLength={10} required className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 outline-none hairline" /></label>
                    <label className="block text-sm">Confirm password<input name="password2" type="password" required className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 outline-none hairline" /></label>
                    <button className="w-full rounded-full bg-blue py-3 font-semibold text-white">Create account</button>
                    <p className="text-xs text-muted">At least 10 characters. We’ll email you a link to confirm your address, then you can request access.</p>
                  </form>
                )}
              </> : null}
              <button type="button" onClick={() => backend.signInGoogle().catch((e) => { if ((e as { code?: string }).code === "auth/multi-factor-auth-required") setMfa(backend.mfaPending() || "Authenticator"); else if ((e as { code?: string }).code !== "auth/popup-closed-by-user") toast("Google sign-in didn't finish. Try again."); })} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 font-medium hairline press">Continue with Google</button>
              <div className="my-4 text-center text-xs uppercase tracking-widest text-muted">Don’t have access yet?</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="rounded-full py-2 text-sm hairline" onClick={() => backend.signInGoogle().catch(() => toast("Google sign-in didn't finish."))}>With Google</button>
                <button type="button" className="rounded-full py-2 text-sm hairline" onClick={() => { setPane("password"); setMode("new"); }}>Request team access</button>
              </div>
              <p className="mt-3 text-center text-xs text-muted">Every new account is reviewed before it can see anything. <button type="button" className="font-semibold text-blue" onClick={() => go("/apply")}>Apply to join PVRS</button></p>
            </>
          )}
          {mfa ? (
            <form onSubmit={onMfa} className="mt-4 space-y-3 border-t border-black/5 pt-4" data-screen="mfa">
              <h3 className="font-semibold">Enter your code</h3>
              <p className="text-sm text-muted">Open {mfa} and type the 6-digit code for PVRS Membership.</p>
              <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="w-full rounded-xl bg-[#f5f5f7] px-3 py-3 tracking-[0.3em] outline-none hairline" />
              <div className="flex gap-2">
                <button type="button" className="rounded-full px-4 py-2 hairline" onClick={() => { backend.cancelMfa(); setMfa(""); }}>Cancel</button>
                <button className="rounded-full bg-blue px-4 py-2 font-semibold text-white">Sign in</button>
              </div>
            </form>
          ) : null}
        </section>
    </div>
  );
}

export function VerifyPage() {
  const backend = useBackend();
  const gate = useGate();
  const toast = useToast();
  const [last, setLast] = useState(0);
  useEffect(() => {
    const t = setInterval(async () => {
      const u = await backend.reload();
      if (u?.emailVerified) location.reload();
    }, 4000);
    return () => clearInterval(t);
  }, [backend]);
  return (
    <div className="grid min-h-full place-items-center px-5" data-screen="verify">
      <div className="card w-full max-w-md p-8">
        <img src="/img/icon-192.png" alt="" className="h-12 w-12 rounded-2xl" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Confirm your email</h1>
        <p className="mt-2 text-sm text-muted">We sent a link to {gate.user?.email}. Open it, then come back. It can take a minute and may land in spam.</p>
        <button type="button" className="mt-5 w-full rounded-full bg-blue py-3 font-semibold text-white" onClick={async () => { const u = await backend.reload(); if (!u?.emailVerified) toast("Not confirmed yet. Open the link in the email we sent."); else location.reload(); }}>I’ve confirmed it</button>
        <button type="button" className="mt-2 w-full rounded-full py-3 hairline" onClick={async () => {
          if (Date.now() - last < 30000) return toast("Just sent. Give it a minute and check spam.");
          setLast(Date.now());
          try { await backend.sendVerification(); toast("Sent again. Check your inbox."); } catch { toast("Couldn't send the email. Try again."); }
        }}>Resend the email</button>
        <button type="button" className="mt-2 w-full text-sm text-muted" onClick={() => backend.signOut()}>Sign out</button>
      </div>
    </div>
  );
}

export function NoAccessPage() {
  const backend = useBackend();
  const gate = useGate();
  const toast = useToast();
  const email = gate.user?.email || "";
  const req = gate.request;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    if (!name) return toast("Enter your name.");
    try {
      if (req) await backend.del("accessRequests/" + email).catch(() => {});
      await backend.set("accessRequests/" + email, { email, name: name.slice(0, 100), note: String(fd.get("note") || "").slice(0, 300), requestedAt: Date.now(), status: "pending" }, false);
      toast("Request sent. You’ll be let in once it’s approved.");
      location.reload();
    } catch { toast("Couldn't send the request. Try again."); }
  }
  const pending = req?.status === "pending";
  const denied = req?.status === "denied";
  return (
    <div className="grid min-h-full place-items-center px-5" data-screen="noaccess">
      <div className="card w-full max-w-md p-8">
        <img src="/img/icon-192.png" alt="" className="h-12 w-12 rounded-2xl" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{pending ? "Access requested" : denied ? "Access not approved" : "No application or team access found"}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {pending ? `The membership coordinator will review your request for ${email}. This page opens the desk once you’re approved.`
            : denied ? `Your request for ${email} wasn’t approved. If you think that’s a mistake, contact ${CONTACT_EMAIL}.`
              : `Applicants: sign in with the email on your application, or contact ${CONTACT_EMAIL}. PVRS team members: request access below.`}
        </p>
        {pending ? <button type="button" className="mt-4 text-sm text-blue" onClick={async () => { await backend.del("accessRequests/" + email); location.reload(); }}>Withdraw request</button> : null}
        {!pending && !denied ? (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block text-sm">Your name<input name="name" defaultValue={gate.user?.name || ""} required className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 outline-none hairline" /></label>
            <label className="block text-sm">Your role at PVRS <span className="text-muted">(optional)</span><input name="note" className="mt-1 w-full rounded-xl bg-[#f5f5f7] px-3 py-3 outline-none hairline" placeholder="e.g. Membership committee" /></label>
            <button className="w-full rounded-full bg-blue py-3 font-semibold text-white">Request team access</button>
          </form>
        ) : null}
        <button type="button" className="mt-4 w-full text-sm text-muted" onClick={() => backend.signOut().then(() => location.replace("/signin"))}>Sign out</button>
      </div>
    </div>
  );
}
