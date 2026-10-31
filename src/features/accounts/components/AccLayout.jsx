import { Building2, ChevronDown, Plus, Sparkles } from "lucide-react";
import { Select } from "../../../components/Select.jsx";
import { TabScroller } from "../../../components/TabScroller.jsx";
import { useActiveTabInView } from "./useActiveTabInView.js";
import { NAV_TREE, REPORT_TABS, navItemIsActive } from "../accountsNavigation.js";

// Accounts sections as horizontal tabs inside the page (like Daily Finance's Overview / Customers / Reports).
// A section with sub-pages (Parties, Reports) shows them as a second row once it is selected.
// Cashbook is left out: it is its own item in the workspace sidebar.
// Reports lists every report (Day Book, Trial Balance … Customer Pipeline), opened through `openReport`.
// AI Review follows Reports only when the AI plan is enabled.
// Manufacturing appears after Inventory when the company industry is manufacturing.
// Counter (POS till) appears after Overview when enabled for the company.
const BASE_TABS = NAV_TREE.filter(item => item.id !== "cashbook");
const CA_TAB = { id: "ca", label: "For the CA" };
const AI_TAB = { id: "ai", label: "AI Review", icon: Sparkles };
const MANUFACTURING_TAB = { id: "manufacturing", label: "Manufacturing" };
const COUNTER_TAB = { id: "counter", label: "Counter" };
const afterReports = (tabs, extra) => tabs.flatMap(item => (item.id === "reports" ? [item, ...extra] : [item]));
const withManufacturing = (tabs, enabled) => (enabled
  ? tabs.flatMap(item => (item.id === "inventory" ? [item, MANUFACTURING_TAB] : [item]))
  : tabs);
const withCounter = (tabs, enabled) => (enabled
  ? tabs.flatMap(item => (item.id === "overview" ? [item, COUNTER_TAB] : [item]))
  : tabs);
const STATEMENT_SECTIONS = ["trial", "pnl", "balance"];
const REPORT_OWN_SECTIONS = [...STATEMENT_SECTIONS, "crm"];

const CASHIER_TABS = [COUNTER_TAB];

export function AccSectionTabs({ section, reportTab, onNavigate, openReport, aiEnabled = false, manufacturingEnabled = false, counterEnabled = false, cashierMode = false }) {
  const afterAi = aiEnabled ? [CA_TAB, AI_TAB] : [CA_TAB];
  // Cashier chrome must not depend on counterEnabled — that flag loads after the company
  // and briefly false would flash the full Accounts tab strip.
  const tabs = cashierMode
    ? CASHIER_TABS
    : withCounter(withManufacturing(afterReports(BASE_TABS, afterAi), manufacturingEnabled), counterEnabled);
  const current = tabs.find(item => navItemIsActive(item, section));
  const isReports = current?.id === "reports";
  const children = isReports ? REPORT_TABS : current?.children;
  const childId = isReports
    ? (REPORT_OWN_SECTIONS.includes(section) ? section : section === "reports" ? reportTab : section)
    : section;
  const openChild = id => (isReports ? openReport(id) : onNavigate(id));
  const ref = useActiveTabInView([section, reportTab]);
  return <div className="acc-section-tabs" ref={ref}>
    <TabScroller><nav className="module-section-nav acc-section-nav" aria-label="Accounts sections">
      {tabs.map(item => {
        const active = item === current;
        const Icon = item.icon;
        return <button key={item.id} type="button" className={`module-section-tab${Icon ? " acc-ai-tab" : ""}${active ? " active" : ""}`} aria-current={active ? (item.children ? "true" : "page") : undefined} onClick={() => onNavigate(item.id)}>{Icon && <Icon size={14} aria-hidden="true" />}{item.label}</button>;
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
export function AccCompanyBar({ companies, activeId, onSelect, onCreate, canAdmin = true, gstLabel, fyLabel = "", booksStartedOn = "", rangeFrom = "", rangeTo = "", fallbackName = "" }) {
  const active = companies.find(company => company.id === activeId);
  const started = booksStartedOn || active?.booksStartedOn;
  const registered = gstLabel && !/unregistered/i.test(gstLabel);
  const openCompanies = companies.filter(company => company.status !== "archived");
  // CA with a single assigned company: show the name only (no switcher).
  const singleAssigned = !canAdmin && openCompanies.length === 1;
  return (
    <div className="acc-company-bar" role="group" aria-label="Company books context">
      <div className="acc-company-row">
      {singleAssigned ? (
        <div className="acc-company-picker acc-company-picker-static" aria-label="Accounts company">
          <Building2 className="acc-company-picker-icon" size={18} aria-hidden="true" />
          <span className="acc-company-picker-name">{openCompanies[0].name}</span>
        </div>
      ) : (
      <Select
        bare
        className="acc-company-picker"
        aria-label="Accounts company"
        value={activeId || ""}
        onChange={event => onSelect(event.target.value)}
        renderValue={() => <>
          <Building2 className="acc-company-picker-icon" size={18} aria-hidden="true" />
          <span className="acc-company-picker-name">{active?.name || (canAdmin ? fallbackName : "") || (canAdmin ? "No company yet" : "No company assigned")}</span>
          {active?.isPrimary && <span className="acc-company-primary">Primary</span>}
          <ChevronDown className="acc-company-picker-chevron" size={16} aria-hidden="true" />
        </>}
      >
        {!openCompanies.length && (
          <option value="">
            {canAdmin ? "No companies yet — create one from Setup" : "No company assigned — ask the owner"}
          </option>
        )}
        {openCompanies.map(company => (
          <option key={company.id} value={company.id}>
            {company.name}{company.isPrimary ? " · primary" : ""}
          </option>
        ))}
      </Select>
      )}
      {canAdmin ? <button type="button" className="acc-company-new" onClick={onCreate}><Plus size={14} aria-hidden="true" />New company</button> : null}
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
