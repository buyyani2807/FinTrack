import { isModuleEnabled } from "../commercial/entitlements.js";

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

export const chitSchemePath = schemeId => `${workspacePaths.chit}/${encodeURIComponent(schemeId)}`;

// Is `pathname` the route `target` or one of its child routes?
export const isWithin = (pathname, target) => pathname === target || pathname.startsWith(`${target}/`);

// Which workspace modules this user may open. Owner-only modules also need the owner role.
export function workspaceModuleAccess(orgSettings = {}, workspace = {}) {
  const isOwner = workspace?.role === "owner";
  return {
    isOwner,
    daily: isModuleEnabled(orgSettings, "daily"),
    monthly: isModuleEnabled(orgSettings, "monthly"),
    chit: isOwner && isModuleEnabled(orgSettings, "chit"),
    cashbook: isOwner && isModuleEnabled(orgSettings, "cashbook"),
    accounts: isOwner && isModuleEnabled(orgSettings, "accounts"),
  };
}
