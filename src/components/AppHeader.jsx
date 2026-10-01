import { ChevronsRight } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle.jsx";

const todayLabel = () => new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });

// The one app-wide header (as in Finebank): today's date and the theme toggle; pages keep their own titles.
// The wordmark shows where no sidebar carries it (phones, sign-in, customer portals).
// Rendered once by AppShell; CSS positions it beside whichever sidebar is showing.
export function AppHeader() {
  return (
    <header className="ft-app-header">
      <div className="ft-app-header-context">
        <span className="ft-app-header-brand ft-brand"><span className="ft-brand-strong">FIN</span>Track</span>
        <span className="ft-app-header-date"><ChevronsRight size={18} aria-hidden="true" />{todayLabel()}</span>
      </div>
      <div className="ft-app-header-actions">
        <ThemeToggle />
      </div>
    </header>
  );
}
