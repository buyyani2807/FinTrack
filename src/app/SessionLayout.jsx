import { lazy, Suspense, useLayoutEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { PageReveal } from "../components/ui/PageReveal.jsx";
import { RevealProvider } from "../components/ui/Reveal.jsx";
import { isMarketingPath, normalizePath } from "../features/marketing/paths.js";
import { applyDocumentTheme, storedTheme } from "../lib/theme.js";
import { LoadingScreen } from "./AppShell.jsx";
import { useFinTrackSession } from "./useFinTrackSession.js";

const ChitCustomerPortal = lazy(() => import("../features/chitFund/ChitCustomerPortal.jsx").then(m => ({ default: m.ChitCustomerPortal })));
const FinancierAuth = lazy(() => import("../features/auth/AuthScreens.jsx").then(m => ({ default: m.FinancierAuth })));
const PasswordRecovery = lazy(() => import("../features/auth/AuthScreens.jsx").then(m => ({ default: m.PasswordRecovery })));
const Customer = lazy(() => import("../features/finance/CustomerAccountView.jsx").then(m => ({ default: m.Customer })));
const CustomerReportDownload = lazy(() => import("../features/finance/PortfolioReport.jsx").then(m => ({ default: m.CustomerReportDownload })));
const LegalPage = lazy(() => import("../features/legal/LegalPage.jsx").then(m => ({ default: m.LegalPage })));

// Loads the session. Public marketing pages render without a login. A signed-in financier or collection agent
// goes to the workspace, including from the public pages. Everyone else sees the legal page, password reset, sign-in, or their portal.
export function SessionLayout() {
  const location = useLocation();
  const session = useFinTrackSession();
  const { legalView, isLoading, isPasswordRecovery, user, customerLoan, enterSession, enterCustomerSession, enterChitCustomerSession, logout } = session;
  const path = normalizePath(location.pathname);
  const queryView = new URLSearchParams(location.search).get("view");
  const queryLegal = queryView === "privacy" || queryView === "terms" ? queryView : null;
  const workspaceUser = user?.role === "financier" || user?.role === "agent";
  useLayoutEffect(() => {
    const guestUrl = isMarketingPath(path) || path === "/login";
    if (!user && isLoading && !guestUrl && !isPasswordRecovery) return;
    const guestScreen = isPasswordRecovery || !user || (workspaceUser && guestUrl);
    applyDocumentTheme(guestScreen ? "light" : (storedTheme() || "light"));
  }, [user, isLoading, isPasswordRecovery, path, workspaceUser]);
  const screen = node => <RevealProvider intent="functional"><PageReveal routeKey={`${path}${location.search}`}>{node}</PageReveal></RevealProvider>;
  const boot = node => <Suspense fallback={<LoadingScreen />}>{node}</Suspense>;
  const signIn = boot(screen(<FinancierAuth onLogin={enterSession} onCustomerLogin={enterCustomerSession} onChitCustomerLogin={enterChitCustomerSession} />));
  if (queryLegal && isMarketingPath(path)) return <Navigate to={`/${queryLegal}`} replace />;
  if ((legalView || queryLegal) && path === "/login") return boot(screen(<LegalPage view={legalView || queryLegal} backLabel="Back to sign in" />));
  if (isPasswordRecovery) return boot(screen(<PasswordRecovery />));
  if (user?.role === "chitCustomer") return boot(screen(<ChitCustomerPortal session={user.session} logout={logout} />));
  if (user && user.role !== "financier" && user.role !== "agent") {
    return boot(screen(<><Customer loan={customerLoan} logout={logout} /><CustomerReportDownload loan={customerLoan} /></>));
  }
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
