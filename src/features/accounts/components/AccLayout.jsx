import { NAV_TREE, REPORT_TABS, navItemIsActive } from "../accountsNavigation.js";

// Accounts sections as horizontal tabs inside the page (like Daily Finance's Overview / Customers / Reports).
// A section with sub-pages (Parties, Reports) shows them as a second row once it is selected.
// Cashbook is left out: it is its own item in the workspace sidebar. "More" holds the remaining pages.
// Reports lists every report (Day Book, Trial Balance … Stock Movement), opened through `openReport`.
const TAB_ITEMS = [...NAV_TREE.filter(item => item.id !== "cashbook"), { id: "more", label: "More" }];
const STATEMENT_SECTIONS = ["trial", "pnl", "balance"];
const MORE_SECTIONS = ["more", "crm", "manufacturing"];
const tabIsActive = (item, section) => (item.id === "more" ? MORE_SECTIONS.includes(section) : navItemIsActive(item, section));

export function AccSectionTabs({ section, reportTab, onNavigate, openReport }) {
  const current = TAB_ITEMS.find(item => tabIsActive(item, section));
  const isReports = current?.id === "reports";
  const children = isReports ? REPORT_TABS : current?.children;
  const childId = isReports ? (STATEMENT_SECTIONS.includes(section) ? section : section === "reports" ? reportTab : section) : section;
  const openChild = id => (isReports ? openReport(id) : onNavigate(id));
  return <div className="acc-section-tabs">
    <nav className="module-section-nav acc-section-nav" aria-label="Accounts sections">
      {TAB_ITEMS.map(item => {
        const active = item === current;
        return <button key={item.id} type="button" className={`module-section-tab${active ? " active" : ""}`} aria-current={active ? (item.children ? "true" : "page") : undefined} onClick={() => onNavigate(item.id)}>{item.label}</button>;
      })}
    </nav>
    {children && <nav className="acc-subsection-nav" aria-label={`${current.label} pages`}>
      {children.map(child => {
        const active = child.id === childId;
        return <button key={child.id} type="button" className={`acc-subsection-tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => openChild(child.id)}>{child.label}</button>;
      })}
    </nav>}
  </div>;
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
// Title, books context and the entry actions, then the company bar and the section tabs (Daily Finance layout).
export function AccPageHeader({ title, copy, extras, companyBar, tabs }) {
  return <>
    <div className="toolbar acc-page-toolbar">
      <div>
        <h1 className="title">{title}</h1>
        {copy ? <p className="copy acc-page-copy">{copy}</p> : null}
      </div>
      {extras ? <div className="acc-page-actions">{extras}</div> : null}
    </div>
    {companyBar}
    {tabs}
  </>;
}
