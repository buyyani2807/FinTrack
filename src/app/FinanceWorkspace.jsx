import { Navigate, Route, Routes } from "react-router";
import { ACCOUNT_SEGMENT, COLLECTIONS_SEGMENT, workspacePaths } from "../features/workspace/paths.js";
import { WorkspaceLayout } from "../features/workspace/WorkspaceLayout.jsx";
import { AccountsRoute } from "../features/workspace/routes/AccountsRoute.jsx";
import { CashbookRoute } from "../features/workspace/routes/CashbookRoute.jsx";
import { ChitFundRoute } from "../features/workspace/routes/ChitFundRoute.jsx";
import { CollectionStaffRoute } from "../features/workspace/routes/CollectionStaffRoute.jsx";
import { DashboardRoute } from "../features/workspace/routes/DashboardRoute.jsx";
import { RequireModule } from "../features/workspace/routes/RequireModule.jsx";
import { SettingsRoute } from "../features/workspace/routes/SettingsRoute.jsx";

// Child routes shared by Daily and Monthly Finance: Today's collections and account detail. Their screens are views
// of the finance dashboard, which the layout draws from the URL; these routes define the valid URLs and who may open them.
function financeModuleRoutes(module) {
  const root = workspacePaths[module];
  return <Route path={root} element={<RequireModule module={module} outlet />}>
    <Route index element={null} />
    <Route path={COLLECTIONS_SEGMENT} element={null} />
    <Route path={`${ACCOUNT_SEGMENT}/:accountId`} element={null} />
    <Route path="*" element={<Navigate to={root} replace />} />
  </Route>;
}

// Routes for a signed-in financier or collection agent.
export function FinanceWorkspace({ session }) {
  return <Routes>
    <Route element={<WorkspaceLayout session={session} />}>
      <Route index element={<Navigate to={workspacePaths.dashboard} replace />} />
      <Route path={workspacePaths.dashboard} element={<DashboardRoute />} />
      {financeModuleRoutes("daily")}
      {financeModuleRoutes("monthly")}
      <Route path={`${workspacePaths.chit}/:schemeId?`} element={<RequireModule module="chit"><ChitFundRoute /></RequireModule>} />
      <Route path={workspacePaths.cashbook} element={<RequireModule module="cashbook"><CashbookRoute /></RequireModule>} />
      <Route path={workspacePaths.accounts} element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
      <Route path={workspacePaths.collectionStaff} element={<RequireModule module="isOwner"><CollectionStaffRoute /></RequireModule>} />
      <Route path={workspacePaths.settings} element={<RequireModule module="isOwner"><SettingsRoute /></RequireModule>} />
      <Route path="*" element={<Navigate to={workspacePaths.dashboard} replace />} />
    </Route>
  </Routes>;
}
