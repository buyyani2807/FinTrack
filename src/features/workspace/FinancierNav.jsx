import { useLocation, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { BookOpenText, CalendarDays, CalendarRange, Coins, LayoutGrid, LogOut, Menu, MessageCircle, Settings, Users, Wallet, X } from "lucide-react";
import { Button } from "../../components/ui.jsx";
import { ThemeToggle } from "../../components/ThemeToggle.jsx";
import { assertModuleEntitled } from "../commercial/entitlements.js";
import { financeSectionPath, isWithin, workspacePaths } from "./paths.js";

const initialsOf = name => String(name || "").trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() || "").join("") || "FT";

function NavLabel({ icon: Icon, long, short }) {
  return <span className="nav-label">
    <Icon className="nav-icon" size={22} strokeWidth={1.8} aria-hidden="true" />
    <span className="nav-long">{long}</span><span className="nav-short">{short}</span>
  </span>;
}

// Owner sidebar. Every option navigates to its route. On phones it is a drawer opened from the top bar's menu button
// that covers the whole screen; on tablets an icon rail; on desktop the full sidebar.
export function FinancierNav({ access, orgSettings = {}, businessName = "", logout, onAsk, askEnabled = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname.replace(/\/+$/, "");
  // A sidebar option stays highlighted on its child routes (e.g. /daily-finance/customers).
  const isActive = target => isWithin(path, target);
  // The phone drawer belongs to the current history entry, so navigating anywhere closes it.
  const [drawerKey, setDrawerKey] = useState(null);
  const drawerOpen = drawerKey === location.key;
  const closeDrawer = () => setDrawerKey(null);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = event => { if (event.key === "Escape") setDrawerKey(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

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
  const itemClass = active => (active ? "tab active" : "");

  return <>
  <header className="ft-mobile-header">
    <button type="button" className="ft-icon-btn ft-mobile-menu-btn" aria-label="Open menu" aria-expanded={drawerOpen} aria-controls="workspace-nav" onClick={() => setDrawerKey(location.key)}><Menu size={22} aria-hidden="true" /></button>
    <span className="ft-brand ft-mobile-brand"><span className="ft-brand-strong">FIN</span>Track</span>
    {askEnabled && onAsk ? <button type="button" className="ft-icon-btn ft-mobile-ask" aria-label="Ask FinTrack" onClick={onAsk}><MessageCircle size={22} aria-hidden="true" /></button> : null}
  </header>
  {drawerOpen && <div className="ft-nav-backdrop" aria-hidden="true" onClick={closeDrawer} />}
  <aside className={`financier-nav${drawerOpen ? " is-open" : ""}`} id="workspace-nav" aria-label="Workspace">
    <div className="nav-title ft-brand"><span className="ft-brand-strong">FIN</span>Track</div>
    <button type="button" className="ft-icon-btn ft-nav-close" aria-label="Close menu" onClick={closeDrawer}><X size={20} aria-hidden="true" /></button>
    <Button className={itemClass(isActive(workspacePaths.dashboard))} onClick={() => go(workspacePaths.dashboard)}><NavLabel icon={LayoutGrid} long="Dashboard" short="Dash" /></Button>
    {askEnabled && onAsk ? <Button onClick={() => { closeDrawer(); onAsk(); }}><NavLabel icon={MessageCircle} long="Ask FinTrack" short="Ask" /></Button> : null}
    {access.daily && <Button className={itemClass(isActive(workspacePaths.daily))} onClick={() => go(financeSectionPath("daily", "collections"))}><NavLabel icon={CalendarDays} long="Daily Finance" short="Daily" /></Button>}
    {access.monthly && <Button className={itemClass(isActive(workspacePaths.monthly))} onClick={() => go(financeSectionPath("monthly", "collections"))}><NavLabel icon={CalendarRange} long="Monthly Finance" short="Monthly" /></Button>}
    {access.chit && <Button className={itemClass(isActive(workspacePaths.chit))} onClick={() => openEntitled("chit", workspacePaths.chit)}><NavLabel icon={Coins} long="Chit Fund" short="Chit" /></Button>}
    {access.cashbook && <Button className={itemClass(isActive(workspacePaths.cashbook))} onClick={() => openEntitled("cashbook", workspacePaths.cashbook)}><NavLabel icon={Wallet} long="Cashbook" short="Cash" /></Button>}
    {access.accounts && <Button className={itemClass(isActive(workspacePaths.accounts))} onClick={() => openEntitled("accounts", workspacePaths.accounts)}><NavLabel icon={BookOpenText} long="Accounts" short="Accounts" /></Button>}
    {access.isOwner && <Button className={itemClass(isActive(workspacePaths.collectionStaff))} onClick={() => go(workspacePaths.collectionStaff)}><NavLabel icon={Users} long="Collection Staff" short="Staff" /></Button>}
    {access.isOwner && <Button className={itemClass(isActive(workspacePaths.settings))} onClick={() => go(workspacePaths.settings)}><NavLabel icon={Settings} long="Settings" short="Settings" /></Button>}
    <div className="nav-footer">
      <ThemeToggle className="nav-theme" />
      {logout && <Button className="nav-logout" onClick={logout}><NavLabel icon={LogOut} long="Logout" short="Logout" /></Button>}
      <div className="nav-profile">
        <span className="nav-avatar" aria-hidden="true">{initialsOf(businessName)}</span>
        <span className="nav-profile-text"><strong>{businessName || "My Finance Business"}</strong><span>Financier workspace</span></span>
      </div>
    </div>
  </aside>
  </>;
}
