import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { LoadingScreen } from "./AppShell.jsx";
import { SessionLayout } from "./SessionLayout.jsx";
import { Spinner } from "../components/ui.jsx";
import { PayPage } from "../features/accounts/PayPage.jsx";
import { MarketingLayout } from "../features/marketing/MarketingLayout.jsx";
import { AccountsRoute } from "../features/workspace/routes/AccountsRoute.jsx";
import { RequireModule } from "../features/workspace/routes/RequireModule.jsx";

const named = (importer, exportName) => lazy(() => importer().then(mod => ({ default: mod[exportName] })));

function withLazy(importer, exportName, fallback) {
  const Comp = named(importer, exportName);
  return function LazyRoute(props) {
    return <Suspense fallback={fallback}><Comp {...props} /></Suspense>;
  };
}

const marketingFallback = null;
const workspaceFallback = <LoadingScreen />;
const pageFallback = <div className="shell"><Spinner label="Loading" /></div>;

const HomePage = withLazy(() => import("../features/marketing/HomePage.jsx"), "HomePage", marketingFallback);
const FeaturesPage = withLazy(() => import("../features/marketing/FeaturesPage.jsx"), "FeaturesPage", marketingFallback);
const FeatureDetailPage = withLazy(() => import("../features/marketing/FeatureDetailPage.jsx"), "FeatureDetailPage", marketingFallback);
const SolutionsPage = withLazy(() => import("../features/marketing/SitePages.jsx"), "SolutionsPage", marketingFallback);
const HowItWorksPage = withLazy(() => import("../features/marketing/SitePages.jsx"), "HowItWorksPage", marketingFallback);
const SecurityPage = withLazy(() => import("../features/marketing/SecurityPage.jsx"), "SecurityPage", marketingFallback);
const PricingPage = withLazy(() => import("../features/marketing/SitePages.jsx"), "PricingPage", marketingFallback);
const AboutPage = withLazy(() => import("../features/marketing/SitePages.jsx"), "AboutPage", marketingFallback);
const FounderPage = withLazy(() => import("../features/marketing/SitePages.jsx"), "FounderPage", marketingFallback);
const ContactPage = withLazy(() => import("../features/marketing/SitePages.jsx"), "ContactPage", marketingFallback);
const PrivacyPage = withLazy(() => import("../features/marketing/SitePages.jsx"), "PrivacyPage", marketingFallback);
const TermsPage = withLazy(() => import("../features/marketing/SitePages.jsx"), "TermsPage", marketingFallback);

const WorkspaceLayout = withLazy(() => import("../features/workspace/WorkspaceLayout.jsx"), "WorkspaceLayout", workspaceFallback);
const FinanceRoute = withLazy(() => import("../features/workspace/routes/FinanceRoute.jsx"), "FinanceRoute", pageFallback);
const CashbookRoute = withLazy(() => import("../features/workspace/routes/CashbookRoute.jsx"), "CashbookRoute", pageFallback);
const ChitFundRoute = withLazy(() => import("../features/workspace/routes/ChitFundRoute.jsx"), "ChitFundRoute", pageFallback);
const CollectionStaffRoute = withLazy(() => import("../features/workspace/routes/CollectionStaffRoute.jsx"), "CollectionStaffRoute", pageFallback);
const RouteCollectionsRoute = withLazy(() => import("../features/workspace/routes/RouteCollectionsRoute.jsx"), "RouteCollectionsRoute", pageFallback);
const SettingsRoute = withLazy(() => import("../features/workspace/routes/SettingsRoute.jsx"), "SettingsRoute", pageFallback);
const ModuleStorePage = withLazy(() => import("../features/commercial/ModuleStorePage.jsx"), "ModuleStorePage", pageFallback);
const SubscribePage = withLazy(() => import("../features/commercial/SubscribePage.jsx"), "SubscribePage", pageFallback);

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
          <Route path="/finance/features/:slug" element={<FeatureDetailPage />} />
          <Route path="/auction-chit/features/:slug" element={<FeatureDetailPage />} />
          <Route path="/accounts-overview/features/:slug" element={<FeatureDetailPage />} />
          <Route path="/counter-pos/features/:slug" element={<FeatureDetailPage />} />
          <Route path="/ai/features/:slug" element={<FeatureDetailPage />} />
          <Route path="/finance" element={<FeatureDetailPage />} />
          <Route path="/auction-chit" element={<FeatureDetailPage />} />
          <Route path="/accounts-overview" element={<FeatureDetailPage />} />
          <Route path="/counter-pos" element={<FeatureDetailPage />} />
          <Route path="/ai" element={<FeatureDetailPage />} />
          <Route path="/solutions" element={<SolutionsPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/founder" element={<FounderPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
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
          <Route path="/chit-fund/members" element={<Navigate to="/chit-fund/schemes" replace />} />
          <Route path="/chit-fund/bids" element={<Navigate to="/chit-fund/schemes" replace />} />
          <Route path="/chit-fund/payments" element={<Navigate to="/chit-fund/schemes" replace />} />
          {/* :tab = schemes | reports */}
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
          {/* :section = overview | counter | transactions | documents | inventory | parties | reports | banking | setup | ledger | pipeline | manufacturing */}
          <Route path="/accounting/:section" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          <Route path="/accounting/documents/:docType" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          <Route path="/accounting/inventory/:inventoryTab" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          {/* :partyView = ledger | receivables | payables | routes */}
          <Route path="/accounting/parties/:partyView" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          <Route path="/accounting/parties/routes/:routesTab" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          <Route path="/accounting/parties/profile/:partyId" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          {/* :report = daybook | trial | pnl | balance | cashflow | receivables | payables | sales | purchases | gst | ledger | item_sales | … */}
          <Route path="/accounting/reports/:report" element={<RequireModule module="accounts"><AccountsRoute /></RequireModule>} />
          <Route path="/accounting/*" element={<Navigate to="/accounting/overview" replace />} />

          <Route path="/collection-staff" element={<RequireModule module="isOwner"><CollectionStaffRoute /></RequireModule>} />
          <Route path="/collection-staff/:staffId" element={<RequireModule module="isOwner"><CollectionStaffRoute /></RequireModule>} />
          <Route path="/route-collections" element={<RouteCollectionsRoute />} />
          <Route path="/route-collections/:routeId" element={<RouteCollectionsRoute />} />
          <Route path="/subscribe" element={<SubscribePage />} />
          <Route path="/subscribe/modules" element={<RequireModule module="isOwner"><ModuleStorePage /></RequireModule>} />
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
