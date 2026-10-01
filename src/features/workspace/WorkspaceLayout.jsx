import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { loadActiveChitSchemes } from "../../lib/financeRepository";
import { Financier } from "../finance/FinancierDashboard.jsx";
import { loadAccountsModule } from "./accountsModuleLoader.js";
import { FinancierNav } from "./FinancierNav.jsx";
import { financeViewForPath, workspacePaths, workspaceModuleAccess } from "./paths.js";

// Shell for every financier / collection agent route: error notice, the finance dashboard on the routes that show it,
// and (for owners) the sidebar plus the current route's page.
export function WorkspaceLayout({ session }) {
  const {
    dataError, loans, workspace, setLoans, createLoan, savePayment, updateLoan, removeLoan, saveCustomerPortal,
    getKyc, updateKyc, changeStatus, changePaymentNotes, correctPayment, removePayment, changeCollectionOrder,
    showOwnerChrome, logout, user, logReceipt, refreshWorkspace, addCollectionAgent, getManagedAgents,
    updateAgentAssignment, saveCollectionStaff,
  } = session;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const token = user.authToken;
  const orgSettings = workspace?.organizationSettings || {};
  const moduleAccess = workspaceModuleAccess(orgSettings, workspace || {});
  // Owner-only routes also require the owner layout (a staff session never gets them, whatever the workspace says).
  const access = showOwnerChrome ? moduleAccess : { ...moduleAccess, isOwner: false, chit: false, cashbook: false, accounts: false };
  const financeView = financeViewForPath(pathname);
  const [chitSchemes, setChitSchemes] = useState([]);

  useEffect(() => {
    if (!showOwnerChrome || !token) return undefined;
    let cancelled = false;
    loadActiveChitSchemes(token)
      .then(schemes => { if (!cancelled) setChitSchemes(schemes || []); })
      .catch(() => { if (!cancelled) setChitSchemes([]); });
    return () => { cancelled = true; };
  }, [showOwnerChrome, token]);

  // Signing out from inside Accounts sets this flag so the next owner sign-in lands back in Accounts.
  useEffect(() => {
    if (!showOwnerChrome) return;
    if (workspace?.role !== "owner") {
      sessionStorage.removeItem("fintrack-open-accounts");
      return;
    }
    if (sessionStorage.getItem("fintrack-open-accounts") === "1") {
      sessionStorage.removeItem("fintrack-open-accounts");
      sessionStorage.removeItem("fintrack-login-context");
      navigate(workspacePaths.accounts, { replace: true });
    }
  }, [showOwnerChrome, workspace?.role, navigate]);

  // Warm the Accounts bundle and data while the owner is idle so opening Accounts is instant.
  useEffect(() => {
    if (!showOwnerChrome || !access.accounts || !token) return undefined;
    const preload = () => { loadAccountsModule().then(module => module.prefetchAccounts?.(token)).catch(() => {}); };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preload, { timeout: 4000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(id);
  }, [showOwnerChrome, access.accounts, token]);

  const routeContext = {
    access, token, loans, workspace: workspace || {}, orgSettings, logout,
    onLogReceipt: logReceipt, onSettingsSaved: () => refreshWorkspace(),
    onLoadAgents: getManagedAgents, onCreateAgent: addCollectionAgent, onAssignAgent: updateAgentAssignment, onUpdateAgent: saveCollectionStaff,
    chitSchemes, setChitSchemes,
  };

  return <>
    {dataError && <div className="notice" style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 20 }}>{dataError}</div>}
    {financeView && <Financier
      loans={loans}
      businessName={workspace?.businessName}
      setLoans={setLoans}
      onCreateLoan={createLoan}
      onRecordPayment={savePayment}
      onUpdateLoan={updateLoan}
      onDeleteLoan={removeLoan}
      onSaveCustomerPortal={saveCustomerPortal}
      onLoadKyc={getKyc}
      onSaveKyc={updateKyc}
      onStatusChange={changeStatus}
      onPaymentNoteChange={changePaymentNotes}
      onPaymentCorrect={correctPayment}
      onPaymentDelete={removePayment}
      onCollectionOrderChange={changeCollectionOrder}
      role={showOwnerChrome ? "owner" : "staff"}
      logout={logout}
      authToken={token}
      orgSettings={orgSettings}
      workspace={workspace || {}}
      onLogReceipt={logReceipt}
      module={financeView.module}
      collections={financeView.collections}
      accountId={financeView.accountId}
    />}
    {showOwnerChrome
      ? <div className="financier-tools"><FinancierNav access={access} orgSettings={orgSettings} businessName={workspace?.businessName} logout={logout} /><Outlet context={routeContext} /></div>
      : <Outlet context={routeContext} />}
  </>;
}
