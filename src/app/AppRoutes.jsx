import { Navigate, Route, Routes } from "react-router";
import { SessionLayout } from "./SessionLayout.jsx";
import { PayPage } from "../features/accounts/PayPage.jsx";
import { FeatureDetailPage } from "../features/marketing/FeatureDetailPage.jsx";
import { FeaturesPage } from "../features/marketing/FeaturesPage.jsx";
import { HomePage } from "../features/marketing/HomePage.jsx";
import { MarketingLayout } from "../features/marketing/MarketingLayout.jsx";
import { AboutPage, ContactPage, FounderPage, HowItWorksPage, PricingPage, ResourcesPage, SecurityPage, SolutionsPage } from "../features/marketing/SitePages.jsx";
import { WorkspaceLayout } from "../features/workspace/WorkspaceLayout.jsx";
import { AccountsRoute } from "../features/workspace/routes/AccountsRoute.jsx";
import { CashbookRoute } from "../features/workspace/routes/CashbookRoute.jsx";
import { ChitFundRoute } from "../features/workspace/routes/ChitFundRoute.jsx";
import { CollectionStaffRoute } from "../features/workspace/routes/CollectionStaffRoute.jsx";
import { FinanceRoute } from "../features/workspace/routes/FinanceRoute.jsx";
import { RequireModule } from "../features/workspace/routes/RequireModule.jsx";
import { RouteCollectionsRoute } from "../features/workspace/routes/RouteCollectionsRoute.jsx";
import { SettingsRoute } from "../features/workspace/routes/SettingsRoute.jsx";
import { SubscribePage } from "../features/commercial/SubscribePage.jsx";

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
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/features/:slug" element={<FeatureDetailPage />} />
          <Route path="/solutions" element={<SolutionsPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/founder" element={<FounderPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
        </Route>
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />

        <Route element={<WorkspaceLayout />}>
          <Route path="/dashboard" element={<FinanceRoute module="all" />} />

          <Route path="/daily-finance" element={<Navigate to="/daily-finance/todays-collections" replace />} />
          <Route path="/daily-finance/todays-collections" element={<FinanceRoute module="daily" section="collections" />} />
          <Route path="/daily-finance/overview" element={<FinanceRoute module="daily" section="overview" />} />
          <Route path="/daily-finance/customers" element={<FinanceRoute module="daily" section="customers" />} />
          <Route path="/daily-finance/users" element={<FinanceRoute module="daily" section="users" />} />
          <Route path="/daily-finance/reports" element={<FinanceRoute module="daily" section="reports" />} />
          <Route path="/daily-finance/*" element={<Navigate to="/daily-finance/todays-collections" replace />} />

          <Route path="/monthly-finance" element={<Navigate to="/monthly-finance/todays-collections" replace />} />
          <Route path="/monthly-finance/todays-collections" element={<FinanceRoute module="monthly" section="collections" />} />
          <Route path="/monthly-finance/overview" element={<FinanceRoute module="monthly" section="overview" />} />
          <Route path="/monthly-finance/customers" element={<FinanceRoute module="monthly" section="customers" />} />
          <Route path="/monthly-finance/users" element={<FinanceRoute module="monthly" section="users" />} />
          <Route path="/monthly-finance/reports" element={<FinanceRoute module="monthly" section="reports" />} />
          <Route path="/monthly-finance/*" element={<Navigate to="/monthly-finance/todays-collections" replace />} />

          <Route path="/chit-fund" element={<Navigate to="/chit-fund/schemes" replace />} />
          {/* :tab = schemes | members | bids | payments | reports */}
          <Route path="/chit-fund/:tab" element={<RequireModule module="chit"><ChitFundRoute /></RequireModule>} />
          {/* :schemeTab = overview | members | payments, plus bids | dividends | live (auction) or schedule (fixed) */}
          <Route path="/chit-fund/schemes/:schemeId/:schemeTab?" element={<RequireModule module="chit"><ChitFundRoute /></RequireModule>} />
          <Route path="/chit-fund/schemes/:schemeId/members/:memberId" element={<RequireModule module="chit"><ChitFundRoute /></RequireModule>} />
          <Route path="/chit-fund/*" element={<Navigate to="/chit-fund/schemes" replace />} />

          <Route path="/cashbook" element={<Navigate to="/cashbook/cashbook" replace />} />
          {/* :section = cashbook | expenses | bank | transfers | closing | reports */}
          <Route path="/cashbook/:section" element={<RequireModule module="cashbook"><CashbookRoute /></RequireModule>} />
          <Route path="/cashbook/*" element={<Navigate to="/cashbook/cashbook" replace />} />

          <Route path="/accounting" element={<Navigate to="/accounting/overview" replace />} />
          {/* :section = overview | transactions | documents | inventory | parties | reports | banking | setup | ledger | more | pipeline | manufacturing */}
          <Route path="/accounting/:section" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          <Route path="/accounting/documents/:docType" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          <Route path="/accounting/inventory/:inventoryTab" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          {/* :partyView = ledger | receivables | payables | routes */}
          <Route path="/accounting/parties/:partyView" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          <Route path="/accounting/parties/routes/:routesTab" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          {/* :report = daybook | trial | pnl | balance | cashflow | receivables | payables | sales | purchases | gst | ledger | item_sales | … */}
          <Route path="/accounting/reports/:report" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          <Route path="/accounting/*" element={<Navigate to="/accounting/overview" replace />} />

          <Route path="/collection-staff" element={<RequireModule module="isOwner"><CollectionStaffRoute /></RequireModule>} />
          <Route path="/collection-staff/:staffId" element={<RequireModule module="isOwner"><CollectionStaffRoute /></RequireModule>} />
          <Route path="/route-collections" element={<RouteCollectionsRoute />} />
          <Route path="/route-collections/:routeId" element={<RouteCollectionsRoute />} />
          <Route path="/subscribe" element={<SubscribePage />} />
          <Route path="/settings" element={<Navigate to="/settings/company" replace />} />
          {/* :tab = company | whatsapp | reminders */}
          <Route path="/settings/:tab" element={<RequireModule module="isOwner"><SettingsRoute /></RequireModule>} />
          <Route path="/settings/*" element={<Navigate to="/settings/company" replace />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
