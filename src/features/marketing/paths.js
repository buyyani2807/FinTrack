// Public website paths. Authenticated workspace paths stay in features/workspace/paths.js.
export const marketingPaths = {
  home: "/",
  features: "/features",
  solutions: "/solutions",
  how: "/how-it-works",
  security: "/security",
  pricing: "/pricing",
  about: "/about",
  founder: "/about#founder",
  contact: "/contact",
  resources: "/resources",
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
  "/resources",
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

export function featurePath(slug) {
  return `/features/${slug}`;
}
