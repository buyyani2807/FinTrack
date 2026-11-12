// Public website paths. Authenticated workspace paths stay in features/workspace/paths.js.
export const marketingPaths = {
  home: "/",
  solutions: "/solutions",
  how: "/how-it-works",
  security: "/security",
  pricing: "/pricing",
  about: "/about",
  founder: "/founder",
  contact: "/contact",
  privacy: "/privacy",
  terms: "/terms",
  login: "/login",
  signup: "/login?signup=1",
};

const MARKETING_ROOTS = [
  "/features",
  "/finance",
  "/auction-chit",
  "/accounts-overview",
  "/counter-pos",
  "/ai",
  "/solutions",
  "/how-it-works",
  "/security",
  "/pricing",
  "/about",
  "/founder",
  "/contact",
  "/privacy",
  "/terms",
];

export function normalizePath(pathname = "/") {
  const path = String(pathname || "/").replace(/\/+$/, "");
  return path || "/";
}

export function isMarketingPath(pathname) {
  const path = normalizePath(pathname);
  if (path === "/") return true;
  return MARKETING_ROOTS.some(root => path === root || path.startsWith(`${root}/`));
}

// Pages shown before sign-in. public/theme-init.js uses the same paths so the first paint stays light.
export function isGuestThemePath(pathname) {
  const path = normalizePath(pathname);
  return path === "/login" || path === "/pay" || isMarketingPath(path);
}

// Nav modules live at /finance, /auction-chit, and so on.
// A feature inside a module lives at /finance/features/credit-score.
import { MODULE_FEATURES, moduleForFeature } from "./catalog.js";

const MODULE_PAGE_SLUGS = new Set(["finance", "auction-chit", "accounts-overview", "counter-pos", "ai"]);

function moduleOwns(module, slug) {
  return MODULE_PAGE_SLUGS.has(module) && (MODULE_FEATURES[module] || []).includes(slug);
}

export function featurePath(slug, parent) {
  if (MODULE_PAGE_SLUGS.has(slug)) return `/${slug}`;
  const module = parent && moduleOwns(parent, slug) ? parent : moduleForFeature(slug);
  if (module && MODULE_PAGE_SLUGS.has(module)) return `/${module}/features/${slug}`;
  return `/features/${slug}`;
}
