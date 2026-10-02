import { isModuleEnabled } from "../commercial/entitlements.js";

// URL paths for the financier workspace; each sidebar option is one route. The route table in src/App.jsx uses
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

// Child routes of Daily / Monthly Finance (see src/App.jsx). Overview / Customers / Reports are tabs kept in component state.
export const COLLECTIONS_SEGMENT = "todays-collections";
export const ACCOUNT_SEGMENT = "accounts";

export const modulePath = kind => (kind === "daily" || kind === "monthly" ? workspacePaths[kind] : workspacePaths.dashboard);

export const collectionsPath = kind => `${modulePath(kind)}/${COLLECTIONS_SEGMENT}`;

// An account's detail page lives under its own module, e.g. /daily-finance/accounts/:accountId.
export const accountPath = loan => `${modulePath(loan.kind)}/${ACCOUNT_SEGMENT}/${encodeURIComponent(loan.id)}`;

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
