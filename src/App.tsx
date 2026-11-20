import { useGate, usePath } from "./appContext";
import { HomePage, SignInPage, VerifyPage, NoAccessPage } from "./pages/Public";
import { ApplyPage } from "./pages/ApplyPage";
import { ReferencePage } from "./pages/ReferencePage";
import { PortalPage } from "./pages/PortalPage";
import { VaultPage } from "./pages/VaultPage";
import { DeskApp } from "./desk/DeskApp";

export function App() {
  const path = usePath();
  const gate = useGate();
  const clean = path.replace(/\/+$/, "") || "/";

  if (clean === "/apply") return <ApplyPage />;
  if (clean.startsWith("/ref/")) return <ReferencePage token={decodeURIComponent(clean.slice(5))} />;

  if (!gate.ready) return <div className="grid min-h-full place-items-center text-muted" data-screen="loading">Loading…</div>;

  const user = gate.user;
  if (user && !user.emailVerified && clean !== "/signin") return <VerifyPage />;

  if (clean === "/signin" || (typeof location !== "undefined" && /[?&]oobCode=/.test(location.href) && !user)) return <SignInPage />;

  if (!user) return clean === "/" ? <HomePage /> : <SignInPage />;

  if (gate.actor?.role === "paperwork") return <VaultPage />;
  if (gate.actor && (gate.actor.role === "owner" || gate.actor.role === "full" || gate.actor.role === "admin" || gate.actor.role === "coordinator" || gate.actor.role === "interviewer" || gate.actor.role === "member")) {
    const paperwork = new URLSearchParams(location.search).has("paperwork") && !!gate.portalId;
    if (paperwork && gate.portalId) return <PortalPage id={gate.portalId} backToDesk />;
    return <DeskApp />;
  }
  if (gate.portalId) return <PortalPage id={gate.portalId} />;
  return <NoAccessPage />;
}
