import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "../../components/ui.jsx";
import { assertModuleEntitled } from "../commercial/entitlements.js";
import { financeViewForPath, isWithin, workspacePaths } from "./paths.js";

// Owner sidebar. Every option navigates to its route; "More" only expands the Collection Staff / Settings menu.
export function FinancierNav({ access, orgSettings = {} }) {
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

  return <aside className="financier-nav">
    <div className="nav-title">FinTrack</div>
    <Button className={isActive(workspacePaths.dashboard) ? "tab active" : ""} onClick={() => go(workspacePaths.dashboard)}><span className="nav-label"><span className="nav-glyph">▦</span><span className="nav-long">Dashboard</span><span className="nav-short">Dash</span></span></Button>
    {access.daily && <Button className={isActive(workspacePaths.daily) ? "tab active" : ""} onClick={() => go(workspacePaths.daily)}><span className="nav-label"><span className="nav-glyph">▣</span><span className="nav-long">Daily Finance</span><span className="nav-short">Daily</span></span></Button>}
    {access.monthly && <Button className={isActive(workspacePaths.monthly) ? "tab active" : ""} onClick={() => go(workspacePaths.monthly)}><span className="nav-label"><span className="nav-glyph">◫</span><span className="nav-long">Monthly Finance</span><span className="nav-short">Monthly</span></span></Button>}
    {access.chit && <Button className={isActive(workspacePaths.chit) ? "tab active" : ""} onClick={() => openEntitled("chit", workspacePaths.chit)}><span className="nav-label"><span className="nav-glyph">◎</span><span className="nav-long">Chit Fund</span><span className="nav-short">Chit</span></span></Button>}
    {access.cashbook && <Button className={isActive(workspacePaths.cashbook) ? "tab active" : ""} onClick={() => toggleEntitled("cashbook", workspacePaths.cashbook)}><span className="nav-label"><span className="nav-glyph">◇</span><span className="nav-long">Cashbook</span><span className="nav-short">Cash</span></span></Button>}
    {access.accounts && <Button className={isActive(workspacePaths.accounts) ? "tab active" : ""} onClick={() => toggleEntitled("accounts", workspacePaths.accounts)}><span className="nav-label"><span className="nav-glyph">☰</span><span className="nav-long">Accounts</span><span className="nav-short">Accounts</span></span></Button>}
    {access.isOwner && <Button className={moreActive ? "tab active" : ""} onClick={toggleMore}><span className="nav-label"><span className="nav-glyph">⋯</span><span className="nav-long">More</span><span className="nav-short">More</span></span></Button>}
    {access.isOwner && menuOpen && <div className="financier-nav-more">
      <Button onClick={() => go(workspacePaths.collectionStaff)}>Collection Staff</Button>
      <Button onClick={() => go(workspacePaths.settings)}>Settings</Button>
    </div>}
    <div className="nav-footer">Financier workspace</div>
  </aside>;
}
