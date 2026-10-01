import { ChevronsRight } from "lucide-react";
import { useLocation } from "react-router";
import { ThemeToggle } from "./ThemeToggle.jsx";

const SECTION_LABELS = [
  ["/dashboard", "Dashboard"],
  ["/daily-finance", "Daily Finance"],
  ["/monthly-finance", "Monthly Finance"],
  ["/chit-fund", "Chit Fund"],
  ["/cashbook", "Cashbook"],
  ["/accounting", "Accounts"],
  ["/collection-staff", "Collection Staff"],
  ["/settings", "Settings"],
];

const sectionFor = pathname => SECTION_LABELS.find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1] || "FinTrack";

const todayLabel = () => new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });

// The one app-wide header: current section, today's date and the theme toggle.
// Rendered once by AppShell; CSS positions it beside whichever sidebar is showing.
export function AppHeader() {
  const { pathname } = useLocation();
  return (
    <header className="ft-app-header">
      <div className="ft-app-header-context">
        <span className="ft-app-header-section">{sectionFor(pathname)}</span>
        <span className="ft-app-header-date"><ChevronsRight size={18} aria-hidden="true" />{todayLabel()}</span>
      </div>
      <div className="ft-app-header-actions">
        <ThemeToggle />
      </div>
    </header>
  );
}
