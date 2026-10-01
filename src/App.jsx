// FinTrack MVP. This browser-only build is for testing; add a secure backend,
// authentication, audit trails, and local compliance review before production.
import { AppRoutes } from "./app/AppRoutes.jsx";
import { AppShell, LoadingScreen } from "./app/AppShell.jsx";
import { useFinTrackSession } from "./app/useFinTrackSession.js";
import { PayPage } from "./features/accounts/PayPage.jsx";
import { isPayPagePath } from "./features/accounts/upiPay.js";
import { LegalPage } from "./features/legal/LegalPage.jsx";

function SessionApp() {
  const session = useFinTrackSession();
  if (session.legalView) return <AppShell><LegalPage view={session.legalView} /></AppShell>;
  if (session.isLoading) return <AppShell><LoadingScreen /></AppShell>;
  return <AppShell><AppRoutes session={session} /></AppShell>;
}

export default function App() {
  if (isPayPagePath()) return <AppShell><PayPage /></AppShell>;
  return <SessionApp />;
}
