// Public website paths. Authenticated workspace paths stay in features/workspace/paths.js.
export const marketingPaths = {
  home: "/",
  features: "/features",
  solutions: "/solutions",
  how: "/how-it-works",
  security: "/security",
  pricing: "/pricing",
  about: "/about",
  founder: "/founder",
  contact: "/contact",
  login: "/login",
  signup: "/login?signup=1",
};

const MARKETING_ROOTS = [
  "/features",
  "/solutions",
  "/how-it-works",
  "/security",
  "/pricing",
  "/about",
  "/founder",
  "/contact",
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

export function featurePath(slug) {
  return `/features/${slug}`;
}
