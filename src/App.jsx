// FinTrack MVP. This browser-only build is for testing; add a secure backend,
// authentication, audit trails, and local compliance review before production.
import { AppRoutes } from "./app/AppRoutes.jsx";
import { AppShell, LoadingScreen } from "./app/AppShell.jsx";
import { useFinTrackSession } from "./app/useFinTrackSession.js";
import { PayPage } from "./features/accounts/PayPage.jsx";
import { isPayPagePath } from "./features/accounts/model/upiPay.js";
import { LegalPage } from "./features/legal/LegalPage.jsx";

function SessionApp() {
  const session = useFinTrackSession();
  const signedIn = Boolean(session.user) && !session.isPasswordRecovery;
  if (session.legalView) return <AppShell header={signedIn}><LegalPage view={session.legalView} /></AppShell>;
  if (session.isLoading) return <AppShell header={false}><LoadingScreen /></AppShell>;
  return <AppShell header={signedIn}><AppRoutes session={session} /></AppShell>;
}

export default function App() {
  if (isPayPagePath()) return <AppShell header={false}><PayPage /></AppShell>;
  return <SessionApp />;
}
