// FinTrack MVP. This browser-only build is for testing; add a secure backend,
// authentication, audit trails, and local compliance review before production.
import { AppRoutes } from "./app/AppRoutes.jsx";
import { AppShell, LoadingScreen } from "./app/AppShell.jsx";
import { useFinTrackSession } from "./app/useFinTrackSession.js";
import { LegalPage } from "./features/legal/LegalPage.jsx";

export default function App() {
  const session = useFinTrackSession();
  if (session.legalView) return <AppShell><LegalPage view={session.legalView} /></AppShell>;
  if (session.isLoading) return <AppShell><LoadingScreen /></AppShell>;
  return <AppShell><AppRoutes session={session} /></AppShell>;
}
