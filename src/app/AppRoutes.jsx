import { Navigate, Route, Routes } from "react-router";
import { SessionLayout } from "./SessionLayout.jsx";
import { PayPage } from "../features/accounts/PayPage.jsx";
import { WorkspaceLayout } from "../features/workspace/WorkspaceLayout.jsx";
import { AccountsRoute } from "../features/workspace/routes/AccountsRoute.jsx";
import { CashbookRoute } from "../features/workspace/routes/CashbookRoute.jsx";
import { ChitFundRoute } from "../features/workspace/routes/ChitFundRoute.jsx";
import { CollectionStaffRoute } from "../features/workspace/routes/CollectionStaffRoute.jsx";
import { FinanceRoute } from "../features/workspace/routes/FinanceRoute.jsx";
import { RequireModule } from "../features/workspace/routes/RequireModule.jsx";
import { RouteCollectionsRoute } from "../features/workspace/routes/RouteCollectionsRoute.jsx";
import { SettingsRoute } from "../features/workspace/routes/SettingsRoute.jsx";

// Every URL in the app and the component it shows. Paths match `workspacePaths` in features/workspace/paths.js,
// which the rest of the code uses to navigate.
//
//   SessionLayout   – until a financier or collection agent is signed in, shows sign-in, password reset, the legal
//                     pages or the customer portals instead of the routes inside it.
//   WorkspaceLayout – sidebar (owners) and the data every workspace page shares.
//   RequireModule   – sends users without that module (role or plan) back to /dashboard.
export function AppRoutes() {
  return (
    <Routes>
      {/* Public UPI payment link sent to customers; no sign-in */}
      <Route path="/pay" element={<PayPage />} />

      <Route element={<SessionLayout />}>
        <Route element={<WorkspaceLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<FinanceRoute module="all" />} />

          <Route path="/daily-finance" element={<FinanceRoute module="daily" />} />
          <Route path="/daily-finance/todays-collections" element={<FinanceRoute module="daily" view="collections" />} />
          <Route path="/daily-finance/accounts/:accountId" element={<FinanceRoute module="daily" view="account" />} />
          <Route path="/daily-finance/*" element={<Navigate to="/daily-finance" replace />} />

          <Route path="/monthly-finance" element={<FinanceRoute module="monthly" />} />
          <Route path="/monthly-finance/todays-collections" element={<FinanceRoute module="monthly" view="collections" />} />
          <Route path="/monthly-finance/accounts/:accountId" element={<FinanceRoute module="monthly" view="account" />} />
          <Route path="/monthly-finance/*" element={<Navigate to="/monthly-finance" replace />} />

          <Route path="/chit-fund/:schemeId?" element={<RequireModule module="chit"><ChitFundRoute /></RequireModule>} />
          <Route path="/cashbook" element={<RequireModule module="cashbook"><CashbookRoute /></RequireModule>} />
          <Route path="/accounting" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          <Route path="/collection-staff" element={<RequireModule module="isOwner"><CollectionStaffRoute /></RequireModule>} />
          <Route path="/route-collections" element={<RouteCollectionsRoute />} />
          <Route path="/settings" element={<RequireModule module="isOwner"><SettingsRoute /></RequireModule>} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
