import { ChitCustomerPortal } from "../features/chitFund/ChitFundModule";
import { FinancierAuth, PasswordRecovery } from "../features/auth/AuthScreens.jsx";
import { Customer } from "../features/finance/CustomerAccountView.jsx";
import { CustomerReportDownload } from "../features/finance/PortfolioReport.jsx";
import { FinanceWorkspace } from "./FinanceWorkspace.jsx";

// Picks the screen for the current visitor: password reset, sign-in, finance workspace, or a customer portal.
export function AppRoutes({ session }) {
  const { isPasswordRecovery, user, customerLoan, enterSession, enterCustomerSession, enterChitCustomerSession, logout } = session;
  if (isPasswordRecovery) return <PasswordRecovery />;
  if (!user) return <FinancierAuth onLogin={enterSession} onCustomerLogin={enterCustomerSession} onChitCustomerLogin={enterChitCustomerSession} />;
  if (user.role === "financier" || user.role === "agent") return <FinanceWorkspace session={session} />;
  if (user.role === "chitCustomer") return <ChitCustomerPortal session={user.session} logout={logout} />;
  return <><Customer loan={customerLoan} logout={logout} /><CustomerReportDownload loan={customerLoan} /></>;
}
