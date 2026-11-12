// MyFinTracker MVP. This browser-only build is for testing; add a secure backend,
// authentication, audit trails, and local compliance review before production.
import { useLayoutEffect } from "react";
import { BrowserRouter, useLocation } from "react-router";
import { AppRoutes } from "./app/AppRoutes.jsx";
import { AppShell } from "./app/AppShell.jsx";
import { isMarketingPath, normalizePath } from "./features/marketing/paths.js";
import { applyDocumentTheme } from "./lib/theme.js";

// Links with a hash (e.g. /features#accounts) scroll to their section instead.
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Home and the public payment link stay light even when a signed-in choice of dark is saved.
function GuestTheme() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    const path = normalizePath(pathname);
    if (isMarketingPath(path) || path === "/pay") applyDocumentTheme("light");
  }, [pathname]);
  return null;
}

// The router and the app shell; every URL and its component is listed in app/AppRoutes.jsx.
export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <GuestTheme />
      <AppShell>
        <AppRoutes />
      </AppShell>
    </BrowserRouter>
  );
}
