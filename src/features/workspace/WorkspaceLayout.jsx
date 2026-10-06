import { useEffect, useState } from "react";
import { Outlet, useNavigate, useOutletContext } from "react-router";
import { loadActiveChitSchemes } from "../../lib/financeRepository";
import { todayIso } from "../../lib/dates.js";
import { isModuleEnabled } from "../commercial/entitlements.js";
import { FintrackAssistant } from "../intelligence/assistant/FintrackAssistant.jsx";
import { visibleFinanceLoans } from "../intelligence/assistant/askFintrack.js";
import { loadAccountsModule } from "./accountsModuleLoader.js";
import { FinancierNav } from "./FinancierNav.jsx";
import { workspacePaths, workspaceModuleAccess } from "./paths.js";

// Shell for every financier / collection agent route: error notice and (for owners) the sidebar, then the current
// route's page. Pages read the shared data below with useOutletContext().
export function WorkspaceLayout() {
  const session = useOutletContext();
  const {
    dataError, loans, workspace, showOwnerChrome, logout, user, logReceipt, refreshWorkspace, addCollectionAgent,
    getManagedAgents, updateAgentAssignment, saveCollectionStaff,
  } = session;
  const navigate = useNavigate();
  const token = user.authToken;
  const orgSettings = workspace?.organizationSettings || {};
  const moduleAccess = workspaceModuleAccess(orgSettings, workspace || {});
  // Owner-only routes also require the owner layout (a staff session never gets them, whatever the workspace says).
  const access = showOwnerChrome ? moduleAccess : { ...moduleAccess, isOwner: false, chit: false, cashbook: false, accounts: false };
  const [chitSchemes, setChitSchemes] = useState([]);
  const [askOpen, setAskOpen] = useState(false);
  const askEnabled = isModuleEnabled(orgSettings, "ai");

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
    chitSchemes, setChitSchemes, session,
  };

  return <>
    {dataError && <div className="notice" style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 20 }}>{dataError}</div>}
    {showOwnerChrome
      ? <div className="financier-tools"><FinancierNav access={access} orgSettings={orgSettings} businessName={workspace?.businessName} logout={logout} askEnabled={askEnabled} onAsk={() => setAskOpen(true)} /><Outlet context={routeContext} /></div>
      : <>
        {askEnabled ? <div className="ft-ask-staff-bar"><button type="button" className="btn" onClick={() => setAskOpen(true)}>Ask FinTrack</button></div> : null}
        <Outlet context={routeContext} />
      </>}
    <FintrackAssistant
      open={askOpen}
      onClose={() => setAskOpen(false)}
      onNavigate={path => navigate(path)}
      loadBooks={access.accounts && token ? () => loadAssistantBooks(token) : null}
      context={{
        today: todayIso(),
        orgSettings,
        isOwner: Boolean(access.isOwner),
        agentId: workspace?.id || "",
        agentName: workspace?.fullName || "",
        collectionScope: workspace?.collectionScope || "",
        allowAccounts: Boolean(access.accounts),
        allowChit: Boolean(access.chit),
        loans: visibleFinanceLoans(loans, {
          isOwner: Boolean(access.isOwner),
          agentId: workspace?.id || "",
          collectionScope: workspace?.collectionScope || "",
        }),
        chitSchemes,
      }}
    />
  </>;
}

async function loadAssistantBooks(token) {
  const { fetchAccountsBundle } = await import("../accounts/data/accountsCache.js");
  const bundle = await fetchAccountsBundle(token);
  const today = todayIso();
  const [year, month] = today.split("-").map(Number);
  const startYear = month >= 4 ? year : year - 1;
  const fyTo = `${startYear + 1}-03-31`;
  return {
    accounts: bundle.accounts || [],
    vouchers: bundle.vouchers || [],
    parties: bundle.parties || [],
    items: bundle.items || [],
    stockMovements: bundle.stockMovements || [],
    voucherItemLines: bundle.voucherItemLines || [],
    companyName: bundle.settings?.companyName || "",
    range: { from: `${startYear}-04-01`, to: today < fyTo ? today : fyTo },
  };
}
