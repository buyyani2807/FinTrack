import { Outlet } from "react-router";
import { ChitCustomerPortal } from "../features/chitFund/ChitCustomerPortal.jsx";
import { FinancierAuth, PasswordRecovery } from "../features/auth/AuthScreens.jsx";
import { Customer } from "../features/finance/CustomerAccountView.jsx";
import { CustomerReportDownload } from "../features/finance/PortfolioReport.jsx";
import { LegalPage } from "../features/legal/LegalPage.jsx";
import { LoadingScreen } from "./AppShell.jsx";
import { useFinTrackSession } from "./useFinTrackSession.js";

// Loads the session. Signed-in financiers and collection agents get the workspace routes (with the session as outlet
// context); everyone else sees the legal page, password reset, sign-in or their customer portal, whatever the URL.
export function SessionLayout() {
  const session = useFinTrackSession();
  const { legalView, isLoading, isPasswordRecovery, user, customerLoan, enterSession, enterCustomerSession, enterChitCustomerSession, logout } = session;
  if (legalView) return <LegalPage view={legalView} />;
  if (isLoading) return <LoadingScreen />;
  if (isPasswordRecovery) return <PasswordRecovery />;
  if (!user) return <FinancierAuth onLogin={enterSession} onCustomerLogin={enterCustomerSession} onChitCustomerLogin={enterChitCustomerSession} />;
  if (user.role === "financier" || user.role === "agent") return <Outlet context={session} />;
  if (user.role === "chitCustomer") return <ChitCustomerPortal session={user.session} logout={logout} />;
  return <><Customer loan={customerLoan} logout={logout} /><CustomerReportDownload loan={customerLoan} /></>;
}
