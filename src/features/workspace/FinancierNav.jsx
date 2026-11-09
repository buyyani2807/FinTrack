import { useLocation, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { BookOpenText, CalendarDays, CalendarRange, Coins, LayoutGrid, Lock, LogOut, Menu, MessageCircle, Settings, Users, Wallet, X } from "lucide-react";
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
    if (access.locked?.[moduleId]) {
      go(`${workspacePaths.moduleStore}?product=${encodeURIComponent(
        moduleId === "chit" ? "chit_fund"
          : moduleId === "daily" || moduleId === "monthly" ? "finance_daily_monthly"
            : moduleId === "accounts" || moduleId === "cashbook" ? "accounts"
              : "",
      )}`);
      return;
    }
    try {
      assertModuleEntitled(orgSettings, moduleId);
      go(target);
    } catch (err) {
      window.alert(err.message || "This module is not enabled for your plan.");
    }
  };
  const itemClass = (active, locked) => `${active ? "tab active" : "tab"}${locked ? " is-locked" : ""}`;
  const LockedHint = () => <Lock className="nav-lock" size={14} strokeWidth={2} aria-label="Locked" />;

  return <>
  <header className="ft-mobile-header">
    <button type="button" className="ft-icon-btn ft-mobile-menu-btn" aria-label="Open menu" aria-expanded={drawerOpen} aria-controls="workspace-nav" onClick={() => setDrawerKey(location.key)}><Menu size={22} aria-hidden="true" /></button>
    <span className="ft-brand ft-mobile-brand"><span className="ft-brand-strong">FIN</span>Track</span>
  </header>
  {drawerOpen && <div className="ft-nav-backdrop" aria-hidden="true" onClick={closeDrawer} />}
  <aside className={`financier-nav${drawerOpen ? " is-open" : ""}`} id="workspace-nav" aria-label="Workspace">
    <div className="nav-title ft-brand"><span className="ft-brand-strong">FIN</span>Track</div>
    <button type="button" className="ft-icon-btn ft-nav-close" aria-label="Close menu" onClick={closeDrawer}><X size={20} aria-hidden="true" /></button>
    {!access.isAccountsUser && <Button className={itemClass(isActive(workspacePaths.dashboard))} onClick={() => go(workspacePaths.dashboard)}><NavLabel icon={LayoutGrid} long="Dashboard" short="Dash" /></Button>}
    {access.showDaily && <Button className={itemClass(isActive(workspacePaths.daily), access.locked?.daily)} onClick={() => (access.locked?.daily ? openEntitled("daily", workspacePaths.daily) : go(financeSectionPath("daily", "collections")))}><NavLabel icon={CalendarDays} long={<>Daily Finance{access.locked?.daily ? <LockedHint /> : null}</>} short="Daily" /></Button>}
    {access.showMonthly && <Button className={itemClass(isActive(workspacePaths.monthly), access.locked?.monthly)} onClick={() => (access.locked?.monthly ? openEntitled("monthly", workspacePaths.monthly) : go(financeSectionPath("monthly", "collections")))}><NavLabel icon={CalendarRange} long={<>Monthly Finance{access.locked?.monthly ? <LockedHint /> : null}</>} short="Monthly" /></Button>}
    {access.showChit && <Button className={itemClass(isActive(workspacePaths.chit), access.locked?.chit)} onClick={() => openEntitled("chit", workspacePaths.chit)}><NavLabel icon={Coins} long={<>Chit Fund{access.locked?.chit ? <LockedHint /> : null}</>} short="Chit" /></Button>}
    {access.showCashbook && <Button className={itemClass(isActive(workspacePaths.cashbook), access.locked?.cashbook)} onClick={() => openEntitled("cashbook", workspacePaths.cashbook)}><NavLabel icon={Wallet} long={<>Cashbook{access.locked?.cashbook ? <LockedHint /> : null}</>} short="Cash" /></Button>}
    {access.showAccounts && <Button className={itemClass(isActive(workspacePaths.accounts), access.locked?.accounts)} onClick={() => openEntitled("accounts", workspacePaths.accounts)}><NavLabel icon={BookOpenText} long={<>Accounts{access.locked?.accounts ? <LockedHint /> : null}</>} short="Accounts" /></Button>}
    {access.isOwner && <Button className={itemClass(isActive(workspacePaths.collectionStaff))} onClick={() => go(workspacePaths.collectionStaff)}><NavLabel icon={Users} long="Collection Staff" short="Staff" /></Button>}
    {access.isOwner && <Button className={itemClass(isActive(workspacePaths.settings))} onClick={() => go(workspacePaths.settings)}><NavLabel icon={Settings} long="Settings" short="Settings" /></Button>}
    {access.isOwner && <Button className={itemClass(isActive(workspacePaths.subscribe) || isActive(workspacePaths.moduleStore))} onClick={() => go(workspacePaths.moduleStore)}><NavLabel icon={Lock} long="Modules" short="Unlock" /></Button>}
    {askEnabled && onAsk ? <Button onClick={() => { closeDrawer(); onAsk(); }}><NavLabel icon={MessageCircle} long="Ask FinTrack" short="Ask" /></Button> : null}
    <div className="nav-footer">
      <ThemeToggle className="nav-theme" />
      {logout && <Button className="nav-logout" onClick={logout}><NavLabel icon={LogOut} long="Logout" short="Logout" /></Button>}
      <div className="nav-profile">
        <span className="nav-avatar" aria-hidden="true">{initialsOf(businessName)}</span>
        <span className="nav-profile-text"><strong>{businessName || "My Finance Business"}</strong><span>{access.isAccountsUser ? "Accounts access" : "Financier workspace"}</span></span>
      </div>
    </div>
  </aside>
  </>;
}
