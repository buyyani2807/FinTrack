import { useMemo, useState } from "react";
import { ChevronsRight } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle.jsx";
import { BreadcrumbTrail } from "./ui.jsx";
import { HeaderSlotContext } from "./headerSlot.js";

const todayLabel = () => new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });

// The one app-wide header (as in Finebank): the date, or on sub-pages the page's breadcrumb, and the theme toggle.
// The wordmark shows where no sidebar carries it (phones, customer portals).
// Rendered once by AppShell; CSS positions it beside whichever sidebar is showing.
export function AppHeader({ crumbs = null }) {
  return (
    <header className="ft-app-header">
      <div className={`ft-app-header-context${crumbs ? " has-breadcrumb" : ""}`}>
        <span className="ft-app-header-brand ft-brand"><span className="ft-brand-strong">FIN</span>Track</span>
        {crumbs
          ? <BreadcrumbTrail items={crumbs.labels.map((item, index) => ({ label: item.label, onClick: item.clickable ? () => crumbs.ref.current[index]?.onClick?.() : undefined }))} />
          : <span className="ft-app-header-date"><ChevronsRight size={18} aria-hidden="true" />{todayLabel()}</span>}
      </div>
      <div className="ft-app-header-actions">
        <ThemeToggle />
      </div>
    </header>
  );
}

// Header plus the slot pages use to show their breadcrumb in it (see Breadcrumb in ui.jsx).
export function AppHeaderFrame({ children }) {
  const [crumbs, setCrumbs] = useState(null);
  const slot = useMemo(() => ({
    show: next => setCrumbs(next),
    hide: ref => setCrumbs(current => (current?.ref === ref ? null : current)),
  }), []);
  return <HeaderSlotContext.Provider value={slot}>
    <AppHeader crumbs={crumbs} />
    {children}
  </HeaderSlotContext.Provider>;
}
