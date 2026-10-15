// FinTrack MVP. This browser-only build is for testing; add a secure backend,
// authentication, audit trails, and local compliance review before production.
import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router";
import { AppRoutes } from "./app/AppRoutes.jsx";
import { AppShell } from "./app/AppShell.jsx";

// Links with a hash (e.g. /features#accounts) scroll to their section instead.
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// The router and the app shell; every URL and its component is listed in app/AppRoutes.jsx.
export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppShell>
        <AppRoutes />
      </AppShell>
    </BrowserRouter>
  );
}
