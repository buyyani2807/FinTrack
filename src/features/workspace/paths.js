import { isModuleEnabled } from "../commercial/entitlements.js";
import { isAppModuleOpen } from "../commercial/moduleAccess.js";

// URL paths for the financier workspace; each sidebar option is one route. The route table in src/app/AppRoutes.jsx uses
// these same paths, so change both together.
export const workspacePaths = {
  dashboard: "/dashboard",
  daily: "/daily-finance",
  monthly: "/monthly-finance",
  chit: "/chit-fund",
  cashbook: "/cashbook",
  accounts: "/accounting",
  collectionStaff: "/collection-staff",
  routeCollections: "/route-collections",
  settings: "/settings",
  subscribe: "/subscribe",
  moduleStore: "/subscribe/modules",
};

// Tabs of Daily / Monthly Finance; each is a child route, e.g. /daily-finance/customers (see src/app/AppRoutes.jsx).
export const FINANCE_SECTIONS = {
  overview: "overview",
  collections: "todays-collections",
  customers: "customers",
  users: "users",
  reports: "reports",
};

export const modulePath = kind => (kind === "daily" || kind === "monthly" ? workspacePaths[kind] : workspacePaths.dashboard);

export const financeSectionPath = (kind, section) => `${modulePath(kind)}/${FINANCE_SECTIONS[section] || FINANCE_SECTIONS.overview}`;

export const collectionsPath = kind => financeSectionPath(kind, "collections");

// One customer's account opens in its module's Users tab with that account chosen, e.g. /daily-finance/users?account=fa1.
export const accountPath = loan => `${financeSectionPath(loan.kind, "users")}?account=${encodeURIComponent(loan.id)}`;

// Chit Fund: /chit-fund/:tab, /chit-fund/schemes/:schemeId/:schemeTab and /chit-fund/schemes/:schemeId/members/:memberId.
export function chitPath({ tab = "schemes", schemeId = null, schemeTab = "overview", memberId = null } = {}) {
  if (!schemeId) return `${workspacePaths.chit}/${tab}`;
  const scheme = `${workspacePaths.chit}/schemes/${encodeURIComponent(schemeId)}`;
  if (memberId) return `${scheme}/members/${encodeURIComponent(memberId)}`;
  return `${scheme}/${schemeTab}`;
}

export const chitSchemePath = schemeId => chitPath({ schemeId });

// Is `pathname` the route `target` or one of its child routes?
export const isWithin = (pathname, target) => pathname === target || pathname.startsWith(`${target}/`);

// Which workspace modules this user may open. Owner-only modules also need the owner role.
// When moduleState is provided (commerce), locked modules stay visible for owners but open=false.
export function workspaceModuleAccess(orgSettings = {}, workspace = {}, moduleState = null) {
  const isOwner = workspace?.role === "owner";
  const isAccountsUser = workspace?.role === "accounts";
  const isFinancePartner = workspace?.role === "finance_partner";
  const canViewOwnerFinance = isOwner || isFinancePartner;
  const packOpen = moduleId => (moduleState
    ? isAppModuleOpen(moduleState, moduleId)
    : isModuleEnabled(orgSettings, moduleId));
  const dailyOpen = canViewOwnerFinance && packOpen("daily");
  const monthlyOpen = canViewOwnerFinance && packOpen("monthly");
  const chitOpen = isOwner && packOpen("chit");
  const cashbookOpen = canViewOwnerFinance && packOpen("cashbook");
  const accountsOpen = (isOwner || isAccountsUser) && packOpen("accounts");
  return {
    isOwner,
    isAccountsUser,
    isFinancePartner,
    canViewOwnerFinance,
    canWriteFinance: isOwner,
    daily: dailyOpen,
    monthly: monthlyOpen,
    chit: chitOpen,
    cashbook: cashbookOpen,
    accounts: accountsOpen,
    // Visible in nav even when locked (owners discover modules; partners only see unlocked finance).
    showDaily: canViewOwnerFinance,
    showMonthly: canViewOwnerFinance,
    showChit: isOwner,
    showCashbook: canViewOwnerFinance,
    showAccounts: isOwner || isAccountsUser,
    locked: {
      daily: isOwner && !dailyOpen,
      monthly: isOwner && !monthlyOpen,
      chit: isOwner && !chitOpen,
      cashbook: isOwner && !cashbookOpen,
      accounts: (isOwner || isAccountsUser) && !accountsOpen,
      counter: isOwner && moduleState && !isAppModuleOpen(moduleState, "counter"),
    },
  };
}
