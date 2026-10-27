import { BookOpen, Building2, ChevronDown, Ellipsis, House, PieChart, Plus, Users } from "lucide-react";
import { Select } from "../../../components/Select.jsx";
import { TabScroller } from "../../../components/TabScroller.jsx";
import { accountsPlaceChildId, accountsPlaceId, accountsPlaces } from "../accountsNavigation.js";

const PLACE_ICONS = { overview: House, books: BookOpen, parties: Users, reports: PieChart, more: Ellipsis };

function usePlaces(section, reportTab, aiEnabled, manufacturingEnabled) {
  const places = accountsPlaces({ aiEnabled, manufacturingEnabled });
  const placeId = accountsPlaceId(section);
  const childId = accountsPlaceChildId(section, reportTab);
  const current = places.find(item => item.id === placeId) || places[0];
  return { places, placeId, childId, current };
}

function openPlaceChild(child, onNavigate, openReport) {
  if (child.kind === "report") openReport(child.id);
  else onNavigate(child.id);
}

// Same five destinations everywhere. Desktop and tablet use the page tabs (like Daily Finance).
// Phone uses a bottom bar; the open section's pages stay as a second row under the title.
export function AccPlacesNav({ section, reportTab, onNavigate, openReport, aiEnabled = false, manufacturingEnabled = false }) {
  const { places, placeId, childId, current } = usePlaces(section, reportTab, aiEnabled, manufacturingEnabled);
  return <div className="acc-places-tabs">
    <TabScroller className="acc-places-primary">
      <nav className="module-section-nav acc-places-nav" aria-label="Accounts">
        {places.map(item => {
          const Icon = PLACE_ICONS[item.id];
          const active = item.id === placeId;
          return <button key={item.id} type="button" className={`module-section-tab${active ? " active" : ""}`} aria-current={active ? (item.children ? "true" : "page") : undefined} onClick={() => onNavigate(item.section)}>
            <Icon size={14} aria-hidden="true" />{item.label}
          </button>;
        })}
      </nav>
    </TabScroller>
    {current.children?.length ? <TabScroller className="is-sub">
      <nav className="acc-subsection-nav" aria-label={`${current.label} pages`}>
        {current.children.map(child => {
          const active = child.id === childId;
          return <button key={child.id} type="button" className={`acc-subsection-tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => openPlaceChild(child, onNavigate, openReport)}>{child.label}</button>;
        })}
      </nav>
    </TabScroller> : null}
  </div>;
}

export function AccPlacesBar({ section, reportTab, onNavigate, aiEnabled = false, manufacturingEnabled = false }) {
  const { places, placeId } = usePlaces(section, reportTab, aiEnabled, manufacturingEnabled);
  return <nav className="acc-places-bar" aria-label="Accounts">
    {places.map(item => {
      const Icon = PLACE_ICONS[item.id];
      const active = item.id === placeId;
      return <button key={item.id} type="button" className={`acc-place-link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => onNavigate(item.section)}>
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
