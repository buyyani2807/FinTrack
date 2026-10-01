import { useEffect, useRef, useState } from "react";
import { NAV_TREE, navItemIsActive } from "../accountsNavigation.js";
import { ArrowLeftRight, ChartColumn, Ellipsis, FileText, Landmark, LayoutGrid, Package, Settings, Users, Wallet } from "lucide-react";
import { ThemeToggle } from "../../../components/ThemeToggle.jsx";

// Line icons for the Accounts sections (falls back to the text glyph for any new section).
const NAV_ICONS = { overview: LayoutGrid, vouchers: ArrowLeftRight, documents: FileText, inventory: Package, parties: Users, reports: ChartColumn, bank: Landmark, cashbook: Wallet, setup: Settings, more: Ellipsis };
export function NavIcon({ item }) {
  const Icon = NAV_ICONS[item.id];
  return Icon
    ? <Icon className="acc-nav-glyph acc-nav-icon" size={22} strokeWidth={1.8} aria-hidden="true" />
    : <span className="acc-nav-glyph" aria-hidden="true">{item.glyph}</span>;
}

function AccUserMenu({ workspace = {}, onSetup, onLogout, placement = "sidebar" }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const name = workspace.fullName || workspace.businessName || "Owner";
  const email = workspace.organizationSettings?.companyEmail || workspace.businessName || "FinTrack Accounts";
  const initials = name.split(" ").filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "FT";
  const isHeader = placement === "header";
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const onKey = event => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return <div className={isHeader ? "acc-header-user" : "acc-user"} ref={root}>
    <button type="button" className="acc-user-btn" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <span className="acc-avatar" aria-hidden="true">{initials}</span>
      <span className="acc-user-copy"><strong>{name}</strong>{isHeader ? null : <span>Account</span>}</span>
    </button>
    {open && <div className={`acc-user-menu${isHeader ? " header" : ""}`} role="menu">
      <p className="acc-user-menu-meta">{email}</p>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onSetup?.(); }}>Account settings</button>
      <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onLogout?.(); }}>Log out</button>
    </div>}
  </div>;
}
export function AccSidebar({ section, expanded, onToggle, onNavigate }) {
  const [openGroup, setOpenGroup] = useState(null);
  const root = useRef(null);
  const items = NAV_TREE;

  useEffect(() => {
    if (expanded) setOpenGroup(null);
  }, [expanded]);

  useEffect(() => {
    if (!openGroup) return undefined;
    const onDoc = event => { if (!root.current?.contains(event.target)) setOpenGroup(null); };
    const onKey = event => { if (event.key === "Escape") setOpenGroup(null); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openGroup]);

  const go = id => {
    setOpenGroup(null);
    onNavigate(id);
  };

  return (
    <aside className={`acc-sidebar${expanded ? " expanded" : " collapsed"}`} ref={root} aria-label="Accounts sections">
      <div className="acc-sidebar-brand">
        {expanded ? <>
          <strong className="ft-brand"><span className="ft-brand-strong">FIN</span>Track</strong>
          <span className="small">Small-business books</span>
        </> : <strong className="acc-sidebar-mark ft-brand" title="FinTrack Accounts"><span className="ft-brand-strong">F</span>T</strong>}
      </div>
      <div className="acc-sidebar-nav" id="acc-sidebar-nav">
        {items.map(item => {
          const active = navItemIsActive(item, section);
          const kidsOpen = Boolean(item.children?.length) && (expanded ? active : openGroup === item.id);
          return (
            <div key={item.id} className={`acc-nav-block${active ? " active" : ""}`}>
              <button
                type="button"
                className={`acc-nav-item${active ? " active" : ""}`}
                aria-current={item.id === section ? "page" : undefined}
                aria-expanded={item.children?.length ? kidsOpen : undefined}
                aria-haspopup={item.children?.length && !expanded ? "true" : undefined}
                title={item.label}
                onClick={() => {
                  if (!expanded && item.children?.length) {
                    setOpenGroup(current => current === item.id ? null : item.id);
                    return;
                  }
                  go(item.id);
                }}
              >
                <NavIcon item={item} />
                {expanded ? <span className="acc-nav-label">{item.label}</span> : <span className="acc-sr-only">{item.label}</span>}
              </button>
              {kidsOpen && item.children && (
                <div className={expanded ? "acc-nav-children" : "acc-nav-flyout"} role={expanded ? undefined : "menu"}>
                  {item.children.map(child => (
                    <button
                      key={`${item.id}-${child.id}-${child.label}`}
                      type="button"
                      role={expanded ? undefined : "menuitem"}
                      className={`acc-nav-sub${section === child.id ? " active" : ""}`}
                      aria-current={section === child.id ? "page" : undefined}
                      onClick={() => go(child.id)}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="acc-sidebar-footer">
        <ThemeToggle compact={!expanded} className="acc-theme" />
        <button
          type="button"
          className="acc-nav-toggle"
          aria-controls="acc-sidebar-nav"
          aria-expanded={expanded}
          title={expanded ? "Collapse navigation" : "Expand navigation"}
          onClick={onToggle}
        >
          <span aria-hidden="true">{expanded ? "‹" : "›"}</span>
          {expanded ? <span>Collapse</span> : <span className="acc-sr-only">Expand navigation</span>}
        </button>
      </div>
    </aside>
  );
}
export function AccCompanyBar({ companies, activeId, onSelect, onCreate, gstLabel, fyLabel = "", booksStartedOn = "" }) {
  const active = companies.find(company => company.id === activeId);
  return (
    <div className="acc-company-bar">
      <label className="acc-company-bar-field">
        <span>Company</span>
        <select
          className="acc-company-switch"
          value={activeId || ""}
          aria-label="Accounts company"
          onChange={event => onSelect(event.target.value)}
        >
          {!companies.length && <option value="">No companies yet — run 059 or create one</option>}
          {companies.filter(company => company.status !== "archived").map(company => (
            <option key={company.id} value={company.id}>
              {company.name}{company.isPrimary ? " · primary" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="acc-company-bar-meta" aria-label="Company books context">
        {fyLabel ? <span className="acc-company-chip"><em>FY</em> {fyLabel}</span> : null}
        {(booksStartedOn || active?.booksStartedOn) ? (
          <span className="acc-company-chip"><em>Books from</em> {booksStartedOn || active.booksStartedOn}</span>
        ) : null}
      </div>
      <button type="button" className="btn" onClick={onCreate}>+ Create company</button>
      {gstLabel ? <span className="small acc-company-bar-gst">{gstLabel}</span> : null}
    </div>
  );
}
export function AccPageHeader({ backLabel, onBack, title, copy, trail, extras, companyBar, workspace, onSetup, onLogout }) {
  return <>
    <header className="acc-page-head">
      <div className="acc-page-head-start">
        {backLabel && <button type="button" className="btn ghost" onClick={onBack}>{backLabel}</button>}
      </div>
      <p className="acc-kicker acc-page-head-brand">FinTrack Accounts</p>
      <div className="acc-page-head-end">
        {extras}
        <AccUserMenu placement="header" workspace={workspace} onSetup={onSetup} onLogout={onLogout} />
      </div>
    </header>
    <div className="acc-page-title">
      {trail?.length ? (
        <nav className="acc-breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>Accounts</li>
            {trail.map(item => <li key={item}>{item}</li>)}
          </ol>
        </nav>
      ) : null}
      <h1 className="title">{title}</h1>
      {copy ? <p className="copy acc-page-copy">{copy}</p> : null}
      {companyBar}
    </div>
  </>;
}
