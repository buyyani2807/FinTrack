import { lazy, Suspense } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { loadAccountsModule } from "../accountsModuleLoader.js";
import { workspacePaths } from "../paths.js";

const AccountsModule = lazy(() => loadAccountsModule().then(module => ({ default: module.AccountsModule })));

// /accounts (the Accounts product is code-split and loaded on first visit or idle preload).
export function AccountsRoute() {
  const { token, logout, workspace, orgSettings } = useOutletContext();
  const navigate = useNavigate();
  return <div className="accounts-dashboard">
    <Suspense fallback={<div className="shell"><p className="copy">Loading Accounts…</p></div>}>
      <AccountsModule
        token={token}
        close={() => navigate(workspacePaths.dashboard)}
        onOpenCashbook={() => navigate(workspacePaths.cashbook)}
        logout={logout}
        workspace={workspace}
        orgSettings={orgSettings}
      />
    </Suspense>
  </div>;
}
