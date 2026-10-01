import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { BookOpenText, CalendarDays, CalendarRange, Coins, Ellipsis, LayoutGrid, LogOut, Settings, Users, Wallet } from "lucide-react";
import { Button } from "../../components/ui.jsx";
import { ThemeToggle } from "../../components/ThemeToggle.jsx";
import { assertModuleEntitled } from "../commercial/entitlements.js";
import { financeViewForPath, isWithin, workspacePaths } from "./paths.js";

const initialsOf = name => String(name || "").trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() || "").join("") || "FT";

function NavLabel({ icon: Icon, long, short }) {
  return <span className="nav-label">
    <Icon className="nav-icon" size={22} strokeWidth={1.8} aria-hidden="true" />
    <span className="nav-long">{long}</span><span className="nav-short">{short}</span>
  </span>;
}

// Owner sidebar. Every option navigates to its route; "More" only expands the Collection Staff / Settings menu.
export function FinancierNav({ access, orgSettings = {}, businessName = "", logout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname.replace(/\/+$/, "");
  // The More menu belongs to the current history entry; closing Collection Staff or Settings reopens it via route state.
  const [menu, setMenu] = useState({ key: null, open: false });
  const menuOpen = menu.key === location.key ? menu.open : Boolean(location.state?.moreOpen);
  const onFinanceView = financeViewForPath(path) !== null && path !== workspacePaths.collectionStaff;
  // A sidebar option stays highlighted on its child routes (e.g. /daily-finance/customers).
  const isActive = target => !menuOpen && isWithin(path, target);
  const moreActive = menuOpen || path === workspacePaths.collectionStaff || path === workspacePaths.settings;

  // Sidebar clicks start the module afresh (clear search / filters), as they always have.
  const go = target => navigate(target, { state: { resetView: true } });
  const openEntitled = (moduleId, target) => {
    try {
      assertModuleEntitled(orgSettings, moduleId);
      go(target);
    } catch (err) {
      window.alert(err.message || "This module is not enabled for your plan.");
    }
  };
  // Cashbook and Accounts act as toggles: clicking the open one returns to the dashboard.
  const toggleEntitled = (moduleId, target) => (path === target ? go(workspacePaths.dashboard) : openEntitled(moduleId, target));
  const toggleMore = () => {
    if (menuOpen) setMenu({ key: location.key, open: false });
    else if (onFinanceView) setMenu({ key: location.key, open: true });
    else navigate(workspacePaths.dashboard, { state: { moreOpen: true, resetView: true } });
  };
  const itemClass = active => (active ? "tab active" : "");

  return <aside className="financier-nav" aria-label="Workspace">
    <div className="nav-title ft-brand"><span className="ft-brand-strong">FIN</span>Track</div>
    <Button className={itemClass(isActive(workspacePaths.dashboard))} onClick={() => go(workspacePaths.dashboard)}><NavLabel icon={LayoutGrid} long="Dashboard" short="Dash" /></Button>
    {access.daily && <Button className={itemClass(isActive(workspacePaths.daily))} onClick={() => go(workspacePaths.daily)}><NavLabel icon={CalendarDays} long="Daily Finance" short="Daily" /></Button>}
    {access.monthly && <Button className={itemClass(isActive(workspacePaths.monthly))} onClick={() => go(workspacePaths.monthly)}><NavLabel icon={CalendarRange} long="Monthly Finance" short="Monthly" /></Button>}
    {access.chit && <Button className={itemClass(isActive(workspacePaths.chit))} onClick={() => openEntitled("chit", workspacePaths.chit)}><NavLabel icon={Coins} long="Chit Fund" short="Chit" /></Button>}
    {access.cashbook && <Button className={itemClass(isActive(workspacePaths.cashbook))} onClick={() => toggleEntitled("cashbook", workspacePaths.cashbook)}><NavLabel icon={Wallet} long="Cashbook" short="Cash" /></Button>}
    {access.accounts && <Button className={itemClass(isActive(workspacePaths.accounts))} onClick={() => toggleEntitled("accounts", workspacePaths.accounts)}><NavLabel icon={BookOpenText} long="Accounts" short="Accounts" /></Button>}
    {access.isOwner && <Button className={itemClass(moreActive)} aria-expanded={menuOpen} onClick={toggleMore}><NavLabel icon={Ellipsis} long="More" short="More" /></Button>}
    {access.isOwner && menuOpen && <div className="financier-nav-more">
      <Button onClick={() => go(workspacePaths.collectionStaff)}><NavLabel icon={Users} long="Collection Staff" short="Staff" /></Button>
      <Button onClick={() => go(workspacePaths.settings)}><NavLabel icon={Settings} long="Settings" short="Settings" /></Button>
      <ThemeToggle className="nav-theme nav-theme-more" />
    </div>}
    <div className="nav-footer">
      <ThemeToggle className="nav-theme" />
      {logout && <Button className="nav-logout" onClick={logout}><NavLabel icon={LogOut} long="Logout" short="Logout" /></Button>}
      <div className="nav-profile">
        <span className="nav-avatar" aria-hidden="true">{initialsOf(businessName)}</span>
        <span className="nav-profile-text"><strong>{businessName || "My Finance Business"}</strong><span>Financier workspace</span></span>
      </div>
    </div>
  </aside>;
}
