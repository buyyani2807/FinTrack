// Public website paths. Authenticated workspace paths stay in features/workspace/paths.js.
// Kept free of the marketing catalog: the app shell imports this on every page, and the
// catalog (about 100 KB) is only needed once a marketing page renders.
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
  "/accounts",
  "/counter-pos",
  "/pos",
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
  if (path === "/" || path === "/chit-fund") return true;
  // Signed-in chit pages live at /chit-fund/schemes and below. Only the exact public page is marketing.
  return MARKETING_ROOTS.some(root => path === root || path.startsWith(`${root}/`));
}

// Pages shown before sign-in. public/theme-init.js uses the same paths so the first paint stays light.
export function isGuestThemePath(pathname) {
  const path = normalizePath(pathname);
  return path === "/login" || path === "/pay" || isMarketingPath(path);
}
