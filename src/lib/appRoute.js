// Address bar <-> screen for the Financier workspace (Vercel rewrites every path to index.html).
// Pages keep their own React state and mirror it here, so refresh and Back/Forward land on the same screen.
//
//   /                                 dashboard
//   /customers                        customer directory
//   /daily | /monthly [/customers|/collections|/reports]
//   .../account/<id>                  finance account detail (on any finance path)
//   /cashbook[/<section>]  /chit[/<tab> | /scheme/<id>]  /accounts[/<section>[/<reportTab>]]
//   /staff  /settings

const PANEL_SEGMENTS = { cashbook: "cashbook", chit: "chit", accounts: "accounts", agents: "staff", settings: "settings" };
export const ROUTED_PANELS = Object.keys(PANEL_SEGMENTS);
const FINANCE_MODULES = ["daily", "monthly"];
const FINANCE_SECTIONS = ["overview", "customers", "collections", "reports"];

const EMPTY_ROUTE = Object.freeze({ panel: null, module: "all", section: "overview", detailId: null, sub: [] });

const segmentsOf = pathname => String(pathname || "/")
  .split("/")
  .filter(Boolean)
  .map(part => {
    try { return decodeURIComponent(part); } catch { return part; }
  });

export function parseAppPath(pathname) {
  const segments = segmentsOf(pathname);
  const [first, ...rest] = segments;
  if (!first) return { ...EMPTY_ROUTE, known: true };
  const panel = ROUTED_PANELS.find(key => PANEL_SEGMENTS[key] === first);
  if (panel) return { ...EMPTY_ROUTE, panel, sub: rest.slice(0, 3), known: true };

  let module = "all";
  let section = "overview";
  let tail = segments;
  if (FINANCE_MODULES.includes(first)) {
    module = first;
    tail = rest;
    if (FINANCE_SECTIONS.includes(tail[0])) {
      section = tail[0];
      tail = tail.slice(1);
    }
  } else if (first === "customers") {
    section = "customers";
    tail = rest;
  }
  let detailId = null;
  if (tail[0] === "account" && tail[1]) {
    detailId = tail[1];
    tail = tail.slice(2);
  }
  const known = tail.length === 0 && (module !== "all" || section === "customers" || Boolean(detailId));
  return { ...EMPTY_ROUTE, module, section, detailId, known };
}

export function buildAppPath(route = {}) {
  const { panel = null, module = "all", section = "overview", detailId = null, sub = [] } = route;
  if (panel && PANEL_SEGMENTS[panel]) {
    return `/${[PANEL_SEGMENTS[panel], ...(sub || []).filter(Boolean)].map(encodeURIComponent).join("/")}`;
  }
  const parts = [];
  if (FINANCE_MODULES.includes(module)) {
    parts.push(module);
    if (section && section !== "overview" && FINANCE_SECTIONS.includes(section)) parts.push(section);
  } else if (section === "customers") {
    parts.push("customers");
  }
  if (detailId) parts.push("account", detailId);
  return `/${parts.map(encodeURIComponent).join("/")}`;
}

const hasWindow = typeof window !== "undefined" && typeof window.history !== "undefined";
let current = hasWindow ? parseAppPath(window.location.pathname) : { ...EMPTY_ROUTE };
const listeners = new Set();

if (hasWindow) {
  window.addEventListener("popstate", () => {
    current = parseAppPath(window.location.pathname);
    listeners.forEach(listener => listener(current));
  });
}

export const getAppRoute = () => current;

/** Called with the new route after Back/Forward. */
export function subscribeAppRoute(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Merge a partial route and write it to the address bar (push by default so Back works).
 * Switching panel without passing `sub` clears the previous panel's sub-path.
 */
export function updateAppRoute(patch = {}, { replace = false } = {}) {
  const next = { ...current, ...patch };
  if ("panel" in patch && patch.panel !== current.panel && !("sub" in patch)) next.sub = [];
  if (!next.panel || !PANEL_SEGMENTS[next.panel]) next.panel = null;
  current = { ...next, known: true };
  if (!hasWindow) return;
  const path = buildAppPath(current);
  if (path === window.location.pathname) return;
  const url = path + window.location.search;
  if (replace || !parseAppPath(window.location.pathname).known) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

/** Back to the dashboard path, e.g. on logout. */
export function resetAppRoute() {
  current = { ...EMPTY_ROUTE, known: true };
  if (hasWindow && window.location.pathname !== "/") {
    window.history.replaceState(null, "", `/${window.location.search}`);
  }
}
