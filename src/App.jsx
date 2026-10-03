// FinTrack MVP. This browser-only build is for testing; add a secure backend,
// authentication, audit trails, and local compliance review before production.
import { BrowserRouter } from "react-router";
import { AppRoutes } from "./app/AppRoutes.jsx";
import { AppShell } from "./app/AppShell.jsx";

// The router and the app shell; every URL and its component is listed in app/AppRoutes.jsx.
export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <AppRoutes />
      </AppShell>
    </BrowserRouter>
  );
}
