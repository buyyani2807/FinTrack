import { useState } from "react";
import { BookOpen, Building2, ChevronDown, ChevronLeft, ChevronRight, Ellipsis, House, PieChart, Plus, Users } from "lucide-react";
import { Select } from "../../../components/Select.jsx";
import { accountsNavChildId, accountsNavGroupId, accountsNavModel } from "../accountsNavigation.js";

const NAV_ICONS = { overview: House, books: BookOpen, parties: Users, reports: PieChart, more: Ellipsis };

function openNavChild(child, onNavigate, openReport) {
  if (child.kind === "report") openReport(child.id);
  else onNavigate(child.id);
}

function NavChildren({ children, activeId, onNavigate, openReport }) {
  if (!children?.length) return null;
  return <div className="acc-nav-children" role="group">
    {children.map(child => {
      const active = child.id === activeId;
      return <button key={child.id} type="button" className={`acc-nav-child${active ? " active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => openNavChild(child, onNavigate, openReport)}>{child.label}</button>;
    })}
  </div>;
}

function useAccountsNav(section, reportTab, aiEnabled, manufacturingEnabled) {
  const groups = accountsNavModel({ aiEnabled, manufacturingEnabled });
  const groupId = accountsNavGroupId(section);
  const childId = accountsNavChildId(section, reportTab);
  const current = groups.find(item => item.id === groupId) || groups[0];
  return { groups, groupId, childId, current };
}

function NavGroups({ groups, groupId, childId, onNavigate, openReport, showChildren }) {
  return groups.map(item => {
    const Icon = NAV_ICONS[item.id];
    const active = item.id === groupId;
    return <div key={item.id} className={`acc-nav-group${active ? " active" : ""}`}>
      <button type="button" className={`acc-nav-item${active ? " active" : ""}`} aria-current={active && !item.children ? "page" : undefined} title={item.label} onClick={() => onNavigate(item.section)}>
        <Icon size={18} aria-hidden="true" />
        <span>{item.label}</span>
      </button>
      {active && showChildren && <NavChildren children={item.children} activeId={childId} onNavigate={onNavigate} openReport={openReport} />}
    </div>;
  });
}

// Same five destinations everywhere. Desktop is a labeled sidebar. Tablet is an icon rail that widens to show labels
// and the open section. Phone is a bottom bar; the open section's pages sit under the title.
export function AccAccountsNav({ section, reportTab, onNavigate, openReport, aiEnabled = false, manufacturingEnabled = false }) {
  const { groups, groupId, childId } = useAccountsNav(section, reportTab, aiEnabled, manufacturingEnabled);
  const [railOpen, setRailOpen] = useState(false);
  return <>
    <nav className="acc-nav acc-nav-desktop" aria-label="Accounts">
      <NavGroups groups={groups} groupId={groupId} childId={childId} onNavigate={onNavigate} openReport={openReport} showChildren />
    </nav>
    <nav className={`acc-nav acc-nav-tablet${railOpen ? " is-expanded" : ""}`} aria-label="Accounts">
      <button type="button" className="acc-nav-expand" aria-expanded={railOpen} aria-label={railOpen ? "Hide labels" : "Show labels"} onClick={() => setRailOpen(open => !open)}>{railOpen ? <ChevronLeft size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}<span>{railOpen ? "Hide labels" : "Show labels"}</span></button>
      <NavGroups groups={groups} groupId={groupId} childId={childId} onNavigate={onNavigate} openReport={openReport} showChildren={railOpen} />
    </nav>
  </>;
}

export function AccSectionMenu({ section, reportTab, onNavigate, openReport, aiEnabled = false, manufacturingEnabled = false }) {
  const { childId, current } = useAccountsNav(section, reportTab, aiEnabled, manufacturingEnabled);
  if (!current.children?.length) return null;
  return <div className="acc-nav-section-menu">
    <p className="acc-nav-section-label">{current.label}</p>
    <NavChildren children={current.children} activeId={childId} onNavigate={onNavigate} openReport={openReport} />
  </div>;
}

export function AccBottomNav({ section, reportTab, onNavigate, aiEnabled = false, manufacturingEnabled = false }) {
  const { groups, groupId } = useAccountsNav(section, reportTab, aiEnabled, manufacturingEnabled);
  return <nav className="acc-bottom-nav" aria-label="Accounts">
    {groups.map(item => {
      const Icon = NAV_ICONS[item.id];
      const active = item.id === groupId;
      return <button key={item.id} type="button" className={`acc-bottom-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => onNavigate(item.section)}>
        <Icon className="acc-nav-icon" size={22} aria-hidden="true" />
        <span>{item.label}</span>
      </button>;
    })}
  </nav>;
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
