import { lazy, Suspense } from "react";
import { Navigate, useNavigate, useOutletContext, useParams } from "react-router";
import { accountsPath, accountsViewFromPath } from "../../accounts/accountsNavigation.js";
import { loadAccountsModule } from "../accountsModuleLoader.js";
import { workspacePaths } from "../paths.js";
import { Spinner } from "../../../components/ui.jsx";

const AccountsModule = lazy(() => loadAccountsModule().then(module => ({ default: module.AccountsModule })));

// Every /accounting/… route (the Accounts product is code-split and loaded on first visit or idle preload). The URL
// parts become the open section, report and sub-tab; see accountsViewFromPath.
export function AccountsRoute() {
  const { token, logout, workspace, orgSettings } = useOutletContext();
  const { section, docType, inventoryTab, partyView, routesTab, report } = useParams();
  const navigate = useNavigate();
  const area = section || (docType && "documents") || (inventoryTab && "inventory") || ((partyView || routesTab) && "parties") || (report && "reports") || "overview";
  const view = accountsViewFromPath(area, docType || inventoryTab || partyView || (routesTab && "routes") || report, routesTab);
  // An unknown section goes to Overview.
  if (view.section === "overview" && area !== "overview") return <Navigate to={accountsPath(view)} replace />;
  return <div className="accounts-dashboard">
    <Suspense fallback={<div className="shell"><Spinner label="Loading Accounts" /></div>}>
      <AccountsModule
        token={token}
        close={() => navigate(workspacePaths.dashboard)}
        onOpenCashbook={() => navigate(workspacePaths.cashbook)}
        logout={logout}
        workspace={workspace}
        orgSettings={orgSettings}
        view={view}
        onNavigate={next => navigate(accountsPath(next))}
      />
    </Suspense>
  </div>;
}
