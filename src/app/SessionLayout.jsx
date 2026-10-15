import { Navigate, Outlet, useLocation } from "react-router";
import { PageReveal } from "../components/ui/PageReveal.jsx";
import { RevealProvider } from "../components/ui/Reveal.jsx";
import { ChitCustomerPortal } from "../features/chitFund/ChitCustomerPortal.jsx";
import { FinancierAuth, PasswordRecovery } from "../features/auth/AuthScreens.jsx";
import { Customer } from "../features/finance/CustomerAccountView.jsx";
import { CustomerReportDownload } from "../features/finance/PortfolioReport.jsx";
import { isMarketingPath, normalizePath } from "../features/marketing/paths.js";
import { LegalPage } from "../features/legal/LegalPage.jsx";
import { LoadingScreen } from "./AppShell.jsx";
import { useFinTrackSession } from "./useFinTrackSession.js";

// Loads the session. Public marketing pages render without a login. A signed-in financier or collection agent
// goes to the workspace, including from the public pages. Everyone else sees the legal page, password reset, sign-in, or their portal.
export function SessionLayout() {
  const location = useLocation();
  const session = useFinTrackSession();
  const { legalView, isLoading, isPasswordRecovery, user, customerLoan, enterSession, enterCustomerSession, enterChitCustomerSession, logout } = session;
  const path = normalizePath(location.pathname);
  const workspaceUser = user?.role === "financier" || user?.role === "agent";
  const screen = node => <RevealProvider intent="functional"><PageReveal routeKey={`${path}${location.search}`}>{node}</PageReveal></RevealProvider>;
  const signIn = screen(<FinancierAuth onLogin={enterSession} onCustomerLogin={enterCustomerSession} onChitCustomerLogin={enterChitCustomerSession} />);
  if (legalView) return screen(<LegalPage view={legalView} backLabel={path === "/" ? "Back to FinTrack" : "Back to sign in"} />);
  if (isPasswordRecovery) return screen(<PasswordRecovery />);
  if (user?.role === "chitCustomer") return screen(<ChitCustomerPortal session={user.session} logout={logout} />);
  if (user && user.role !== "financier" && user.role !== "agent") return screen(<><Customer loan={customerLoan} logout={logout} /><CustomerReportDownload loan={customerLoan} /></>);
  if (isMarketingPath(path)) {
    if (isLoading && !workspaceUser) return <LoadingScreen />;
    if (workspaceUser) return <Navigate to="/dashboard" replace />;
    return <Outlet context={{ signedIn: false }} />;
  }
  if (isLoading) return <LoadingScreen />;
  if (!user) return signIn;
  if (workspaceUser && path === "/login") return <Navigate to="/dashboard" replace />;
  if (workspaceUser) return <Outlet context={session} />;
  return signIn;
}
