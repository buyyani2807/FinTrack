import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from "react-router";
import { loadActiveChitSchemes } from "../../lib/financeRepository";
import { todayIso } from "../../lib/dates.js";
import { isModuleEnabled } from "../commercial/entitlements.js";
import { TrialBanner } from "../commercial/TrialBanner.jsx";
import { subscriptionPathAllowed, workspaceAccessAllowed } from "../commercial/trial.js";
import { TopActions } from "../../components/TopActions.jsx";
import { PageReveal } from "../../components/ui/PageReveal.jsx";
import { RevealProvider } from "../../components/ui/Reveal.jsx";
import { FintrackAssistant } from "../intelligence/assistant/FintrackAssistant.jsx";
import { visibleFinanceLoans } from "../intelligence/assistant/askFintrack.js";
import { COMPANY_STORAGE_KEY } from "../accounts/data/accountsCache.js";
import { loadAccountsCompanies } from "../accounts/data/accountingRepository.js";
import { loadAccountsModule } from "./accountsModuleLoader.js";
import { FinancierNav } from "./FinancierNav.jsx";
import { workspacePaths, workspaceModuleAccess } from "./paths.js";

// Shell for every financier / collection agent route: error notice and (for owners) the sidebar, then the current
// route's page. Pages read the shared data below with useOutletContext().
export function WorkspaceLayout() {
  const session = useOutletContext();
  const {
    dataError, loans, workspace, showOwnerChrome, showWorkspaceChrome, logout, user, logReceipt, refreshWorkspace, addCollectionAgent,
    getManagedAgents, updateAgentAssignment, saveCollectionStaff,
  } = session;
  const navigate = useNavigate();
  const token = user.authToken;
  const orgSettings = workspace?.organizationSettings || {};
  const moduleAccess = workspaceModuleAccess(orgSettings, workspace || {});
  // Owner gets full chrome. Accounts-team (CA) gets Accounts only. Staff agents get neither owner module.
  const access = showOwnerChrome
    ? moduleAccess
    : moduleAccess.isAccountsUser
      ? { ...moduleAccess, isOwner: false, daily: false, monthly: false, chit: false, cashbook: false }
      : { ...moduleAccess, isOwner: false, chit: false, cashbook: false, accounts: false };
  const [chitSchemes, setChitSchemes] = useState([]);
  const [askOpen, setAskOpen] = useState(false);
  const [accountsCompanyName, setAccountsCompanyName] = useState("");
  const askEnabled = isModuleEnabled(orgSettings, "ai");
  const location = useLocation();
  const subscription = workspace?.subscription;
  const subscriptionLocked = !workspaceAccessAllowed(subscription);

  useEffect(() => {
    if (subscriptionLocked || !showOwnerChrome || !token) return undefined;
    let cancelled = false;
    loadActiveChitSchemes(token)
      .then(schemes => { if (!cancelled) setChitSchemes(schemes || []); })
      .catch(() => { if (!cancelled) setChitSchemes([]); });
    return () => { cancelled = true; };
  }, [subscriptionLocked, showOwnerChrome, token]);

  // CA top bar: show the Acc company they can open (e.g. Buyyani's), not the FinTrack org name.
  useEffect(() => {
    if (!access.isAccountsUser || !token) {
      setAccountsCompanyName("");
      return undefined;
    }
    const onCompany = event => {
      const name = String(event?.detail?.name || "").trim();
      if (name) setAccountsCompanyName(name);
    };
    window.addEventListener("ft-accounts-company", onCompany);
    let cancelled = false;
    loadAccountsCompanies(token)
      .then(companies => {
        if (cancelled) return;
        const list = Array.isArray(companies) ? companies.filter(row => row.status !== "archived") : [];
        let stored = "";
        try { stored = sessionStorage.getItem(COMPANY_STORAGE_KEY) || ""; } catch { stored = ""; }
        const active = list.find(row => row.id === stored) || list.find(row => row.isPrimary) || list[0];
        if (active?.name) setAccountsCompanyName(active.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      window.removeEventListener("ft-accounts-company", onCompany);
    };
  }, [access.isAccountsUser, token]);

  // Signing out from inside Accounts sets this flag so the next owner sign-in lands back in Accounts.
  // Accounts-team (CA) users always land in Accounts after sign-in.
  useEffect(() => {
    if (!showWorkspaceChrome) return;
    if (workspace?.role === "accounts") {
      const onAccounts = location.pathname === workspacePaths.accounts
        || location.pathname.startsWith(`${workspacePaths.accounts}/`);
      if (!onAccounts) navigate(workspacePaths.accounts, { replace: true });
      return;
    }
    if (workspace?.role !== "owner") {
      sessionStorage.removeItem("fintrack-open-accounts");
      return;
    }
    if (sessionStorage.getItem("fintrack-open-accounts") === "1") {
      sessionStorage.removeItem("fintrack-open-accounts");
      sessionStorage.removeItem("fintrack-login-context");
      navigate(workspacePaths.accounts, { replace: true });
    }
  }, [showWorkspaceChrome, workspace?.role, location.pathname, navigate]);

  // Warm the Accounts bundle and data while the owner is idle so opening Accounts is instant.
  useEffect(() => {
    if (subscriptionLocked || !access.accounts || !token) return undefined;
    const preload = () => { loadAccountsModule().then(module => module.prefetchAccounts?.(token)).catch(() => {}); };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preload, { timeout: 4000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(id);
  }, [subscriptionLocked, access.accounts, token]);

  const routeContext = {
    access, token, loans, workspace: workspace || {}, orgSettings, logout,
    onLogReceipt: logReceipt, onSettingsSaved: () => refreshWorkspace(),
    onLoadAgents: getManagedAgents, onCreateAgent: addCollectionAgent, onAssignAgent: updateAgentAssignment, onUpdateAgent: saveCollectionStaff,
    chitSchemes, setChitSchemes, session,
  };

  if (subscriptionLocked && !subscriptionPathAllowed(location.pathname, subscription)) {
    return <Navigate to="/subscribe" replace />;
  }

  return <RevealProvider intent="functional">
    {dataError && <div className="notice" style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 20 }}>{dataError}</div>}
    {subscriptionLocked ? <div className="ft-trial-lockbar">
      <strong>Plan required</strong>
      <div>
        {showOwnerChrome ? <Link className="btn" to="/settings/company">Company settings</Link> : null}
        <button type="button" className="btn" onClick={logout}>Log out</button>
      </div>
    </div> : <TrialBanner subscription={subscription} isOwner={showOwnerChrome} />}
    {showOwnerChrome && !subscriptionLocked
      ? <div className="financier-tools"><FinancierNav access={access} orgSettings={orgSettings} businessName={workspace?.businessName} logout={logout} askEnabled={askEnabled} onAsk={() => setAskOpen(true)} /><PageReveal routeKey={location.pathname}><Outlet context={routeContext} /></PageReveal></div>
      : <>
        {/* CA / Accounts-team: full-viewport Accounts (no Financier sidebar). Theme + logout stay in the slim bar. */}
        {access.isAccountsUser && !subscriptionLocked ? (
          <header className="ft-accounts-team-bar">
            <span className="ft-brand"><span className="ft-brand-strong">FIN</span>Track <span className="ft-wordmark-suffix">Accounts</span></span>
            <span className="ft-accounts-team-biz">{accountsCompanyName || (access.isAccountsUser ? "No company assigned" : workspace?.businessName) || "Accounts"}</span>
            <TopActions logout={logout} />
          </header>
        ) : null}
        {!subscriptionLocked && askEnabled && !access.isAccountsUser ? <div className="ft-ask-staff-bar"><button type="button" className="btn" onClick={() => setAskOpen(true)}>Ask FinTrack</button></div> : null}
        <PageReveal routeKey={location.pathname}><Outlet context={routeContext} /></PageReveal>
      </>}
    {!subscriptionLocked && <FintrackAssistant
      open={askOpen}
      onClose={() => setAskOpen(false)}
      onNavigate={path => navigate(path)}
      loadBooks={access.accounts && token ? () => loadAssistantBooks(token) : null}
      loadCashbook={access.cashbook && token ? () => loadAssistantCashbook(token) : null}
      context={{
        today: todayIso(),
        orgSettings,
        isOwner: Boolean(access.isOwner),
        agentId: workspace?.id || "",
        agentName: workspace?.fullName || "",
        collectionScope: workspace?.collectionScope || "",
        allowAccounts: Boolean(access.accounts),
        allowCashbook: Boolean(access.cashbook),
        allowChit: Boolean(access.chit),
        loans: visibleFinanceLoans(loans, {
          isOwner: Boolean(access.isOwner),
          agentId: workspace?.id || "",
          collectionScope: workspace?.collectionScope || "",
        }),
        chitSchemes,
      }}
    />}
  </RevealProvider>;
}

async function loadAssistantCashbook(token) {
  const { loadCashbookEntries, loadLedgerAccounts } = await import("../cashbook/cashbookRepository.js");
  const [ledgers, entries] = await Promise.all([loadLedgerAccounts(token), loadCashbookEntries(token)]);
  return { ledgers: ledgers || [], entries: entries || [] };
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
