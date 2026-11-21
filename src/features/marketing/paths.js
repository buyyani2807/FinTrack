// Public website paths and module feature URLs. The plain path helpers live in routePaths.js so
// the signed-in app can use them without loading the marketing catalog.
export { isGuestThemePath, isMarketingPath, marketingPaths, normalizePath } from "./routePaths.js";
import { normalizePath } from "./routePaths.js";

// Nav modules live at /finance, /chit-fund, /accounts, /pos, and so on.
// A feature inside a module lives at /finance/features/credit-score.
import { MODULE_FEATURES, moduleForFeature } from "./catalog.js";

const MODULE_PAGE_SLUGS = new Set(["finance", "auction-chit", "accounts-overview", "counter-pos", "ai"]);

// Public addresses for the two module pages whose catalog slugs differ from the URL.
const MODULE_PUBLIC_PATHS = {
  "auction-chit": "chit-fund",
  "accounts-overview": "accounts",
  "counter-pos": "pos",
};

const PUBLIC_PATH_SLUGS = Object.fromEntries(
  Object.entries(MODULE_PUBLIC_PATHS).map(([slug, path]) => [path, slug]),
);

function moduleOwns(module, slug) {
  return MODULE_PAGE_SLUGS.has(module) && (MODULE_FEATURES[module] || []).includes(slug);
}

export function modulePagePath(slug) {
  return `/${MODULE_PUBLIC_PATHS[slug] || slug}`;
}

// Catalog slug for a public module URL such as /chit-fund, or null when the path is not one.
export function moduleSlugFromPath(pathname) {
  const segment = normalizePath(pathname).slice(1);
  return PUBLIC_PATH_SLUGS[segment] || null;
}

export function featurePath(slug, parent) {
  if (MODULE_PAGE_SLUGS.has(slug)) return modulePagePath(slug);
  const module = parent && moduleOwns(parent, slug) ? parent : moduleForFeature(slug);
  if (module && MODULE_PAGE_SLUGS.has(module)) return `/${module}/features/${slug}`;
  return `/features/${slug}`;
}
