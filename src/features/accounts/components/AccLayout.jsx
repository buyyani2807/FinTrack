import { Building2, ChevronDown, Plus } from "lucide-react";
import { Select } from "../../../components/Select.jsx";
import { TabScroller } from "../../../components/TabScroller.jsx";
import { useActiveTabInView } from "./useActiveTabInView.js";
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
  const ref = useActiveTabInView([section, reportTab]);
  return <div className="acc-section-tabs" ref={ref}>
    <TabScroller><nav className="module-section-nav acc-section-nav" aria-label="Accounts sections">
      {TAB_ITEMS.map(item => {
        const active = item === current;
        return <button key={item.id} type="button" className={`module-section-tab${active ? " active" : ""}`} aria-current={active ? (item.children ? "true" : "page") : undefined} onClick={() => onNavigate(item.id)}>{item.label}</button>;
      })}
    </nav></TabScroller>
    {children && <TabScroller className="is-sub"><nav className="acc-subsection-nav" aria-label={`${current.label} pages`}>
      {children.map(child => {
        const active = child.id === childId;
        return <button key={child.id} type="button" className={`acc-subsection-tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => openChild(child.id)}>{child.label}</button>;
      })}
    </nav></TabScroller>}
  </div>;
}
const niceDate = iso => {
  const date = iso ? new Date(`${iso}T00:00:00`) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : iso;
};

// The books context under the page title: the company switcher with a link to add a company, then one quiet line
// of FY · report period · books start · GST status. The native select covers the switcher, so the
// system list and keyboard support are kept.
export function AccCompanyBar({ companies, activeId, onSelect, onCreate, gstLabel, fyLabel = "", booksStartedOn = "", rangeFrom = "", rangeTo = "", fallbackName = "" }) {
  const active = companies.find(company => company.id === activeId);
  const started = booksStartedOn || active?.booksStartedOn;
  const registered = gstLabel && !/unregistered/i.test(gstLabel);
  return (
    <div className="acc-company-bar" role="group" aria-label="Company books context">
      <div className="acc-company-row">
      <Select
        bare
        className="acc-company-picker"
        aria-label="Accounts company"
        value={activeId || ""}
        onChange={event => onSelect(event.target.value)}
        renderValue={() => <>
          <Building2 className="acc-company-picker-icon" size={18} aria-hidden="true" />
          <span className="acc-company-picker-name">{active?.name || fallbackName || "No company yet"}</span>
          {active?.isPrimary && <span className="acc-company-primary">Primary</span>}
          <ChevronDown className="acc-company-picker-chevron" size={16} aria-hidden="true" />
        </>}
      >
        {!companies.length && <option value="">No companies yet — run 059 or create one</option>}
        {companies.filter(company => company.status !== "archived").map(company => (
          <option key={company.id} value={company.id}>
            {company.name}{company.isPrimary ? " · primary" : ""}
          </option>
        ))}
      </Select>
      <button type="button" className="acc-company-new" onClick={onCreate}><Plus size={14} aria-hidden="true" />New company</button>
      </div>
      <div className="acc-company-meta-wrap"><ul className="acc-company-meta">
        {fyLabel ? <li>{fyLabel}</li> : null}
        {rangeFrom && rangeTo ? <li><span className="acc-company-meta-key">Period</span> {niceDate(rangeFrom)} – {niceDate(rangeTo)}</li> : null}
        {started ? <li><span className="acc-company-meta-key">Books from</span> {niceDate(started)}</li> : null}
        {gstLabel ? <li><span className={`acc-company-gst${registered ? " is-registered" : ""}`}>{gstLabel}</span></li> : null}
      </ul></div>
    </div>
  );
}
// Title with the books context line and the entry actions, then the section tabs (Daily Finance layout).
export function AccPageHeader({ title, copy, extras, companyBar, tabs }) {
  return <>
    <div className="toolbar acc-page-toolbar">
      <h1 className="title">{title}</h1>
      {extras ? <div className="acc-page-actions">{extras}</div> : null}
      <div className="acc-page-context">{companyBar || (copy ? <p className="copy acc-page-copy">{copy}</p> : null)}</div>
    </div>
    {tabs}
  </>;
}
