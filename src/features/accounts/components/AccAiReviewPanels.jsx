import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { openManualWhatsAppShare } from "../../receipts/io/receiptWhatsApp.js";
import { REMINDER_LANGUAGES, draftCollectionReminder, reminderSendAllowed } from "../../finance/model/collectionCopilot.js";
import { money } from "../accountsFormat.js";
import { AccEmpty } from "./AccUi.jsx";
import { CaBriefSheet } from "./CaBriefSheet.jsx";

const pct = value => (value == null ? "—" : `${value > 0 ? "+" : ""}${value}%`);
const differenceText = alert => alert.pattern === "possible_backdated_entry" ? `${alert.difference} day(s)`
  : alert.pattern === "unusual_inventory_adjustment" ? `${alert.difference} unit(s)` : money(alert.difference);
const SeverityBadge = ({ severity }) => <span className={`ai-risk ai-risk-${severity || "low"}`}>{severity || "low"}</span>;
const Confidence = ({ row }) => <span className="air-meta">{row.confidence} confidence{row.confidencePct != null ? ` · ${row.confidencePct}%` : ""}</span>;
const barWidth = value => `${Math.max(2, Math.min(Math.abs(value || 0), 100))}%`;
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const severityRank = value => SEVERITY_RANK[value] || 1;

export function SourceLink({ link, onOpen, children }) {
  if (!link) return null;
  return <button type="button" className="ai-source-link" onClick={() => onOpen(link)}>{children || link.label}</button>;
}

function DecisionBadge({ decision }) {
  if (!decision) return null;
  const label = { approved: "Approved", rejected: "Rejected", reviewed: "Reviewed", dismissed: "Dismissed", edited: "Edited" }[decision.action] || decision.action;
  return <span className="badge">{label}</span>;
}

function ReviewButtons({ decision, canWrite, busy, onReview, onDismiss }) {
  if (decision || !canWrite) return <DecisionBadge decision={decision} />;
  return <span className="ai-review-actions">
    <button type="button" className="btn" disabled={busy} onClick={onReview}>Mark reviewed</button>
    {onDismiss ? <button type="button" className="btn" disabled={busy} onClick={onDismiss}>Dismiss</button> : null}
  </span>;
}

/** One strip of headline figures. A single surface with dividers, not a row of separate cards. */
function Stats({ items }) {
  return <dl className="air-stats">
    {items.map(item => <div key={item.label} className={`air-stat${item.tone ? ` is-${item.tone}` : ""}`}>
      <dt>{item.label}</dt>
      <dd>{item.value}</dd>
    </div>)}
  </dl>;
}

function Section({ title, count, children }) {
  return <section className="air-section">
    <h3 className="air-h">{title}{count != null ? <span className="air-count">{count}</span> : null}</h3>
    {children}
  </section>;
}

function More({ label = "Details", children }) {
  return <details className="air-more"><summary>{label}</summary><div className="air-more-body">{children}</div></details>;
}

/** Label and value pairs shown as a tidy grid. */
function Facts({ items }) {
  return <dl className="air-kv">
    {items.filter(item => item.value != null && item.value !== "").map(item => <div key={item.label} className={item.tone ? `is-${item.tone}` : undefined}>
      <dt>{item.label}</dt>
      <dd>{item.value}</dd>
    </div>)}
  </dl>;
}

/** Side panel on desktop, bottom sheet on phones. Escape or a click outside closes it. */
function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = event => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="air-sheet-bg" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="air-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header className="air-sheet-head">
        <h3 className="air-sheet-title">{title}</h3>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </header>
      {children}
    </div>
  </div>;
}

const SEVERITY_FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "urgent", label: "High and critical", test: severity => severity === "high" || severity === "critical" },
  { id: "medium", label: "Medium", test: severity => severity === "medium" },
  { id: "low", label: "Low", test: severity => !["high", "critical", "medium"].includes(severity) },
];

function SeverityChips({ items, pick, filter, setFilter }) {
  return <div className="air-chips" role="group" aria-label="Filter by severity">
    {SEVERITY_FILTERS.map(item => {
      const count = items.filter(entry => item.test(pick(entry))).length;
      if (item.id !== "all" && !count) return null;
      return <button key={item.id} type="button" className={`air-chip${filter === item.id ? " active" : ""}`} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{count}</span></button>;
    })}
  </div>;
}

/** Shared row, used by Bank and Inventory: title and reason left, key figure and badge right. */
function Row({ tone, title, sub, figure, figureSub, badge, children }) {
  return <li className={`air-row${tone ? ` is-${tone}` : ""}`}>
    <div className="air-row-main">
      <strong className="air-row-title">{title}</strong>
      {sub ? <span className="air-row-sub">{sub}</span> : null}
    </div>
    {(figure != null || badge) ? <div className="air-row-side">
      {figure != null ? <b className="air-figure">{figure}</b> : null}
      {figureSub ? <span className="air-row-sub">{figureSub}</span> : null}
      {badge}
    </div> : null}
    {children ? <div className="air-row-extra">{children}</div> : null}
  </li>;
}

/* ---------- Expenses: summary, spend chart, and a split pane ---------- */

function ExpenseDetail({ group, row, openSource }) {
  const facts = group === "categories" ? [
    { label: "Current", value: money(row.currentAmount) },
    { label: "Compared with", value: money(row.comparisonAmount) },
    { label: "Difference", value: money(row.difference) },
    { label: "Change", value: pct(row.changePct), tone: row.severity },
  ] : group === "rates" ? [
    { label: "Latest rate", value: money(row.currentAmount) },
    { label: "Earlier rate", value: money(row.comparisonAmount) },
    { label: "Change", value: pct(row.changePct), tone: row.severity },
  ] : [
    { label: "This period", value: money(row.currentAmount) },
    { label: "3-month average", value: money(row.comparisonAmount) },
    { label: "Change", value: pct(row.changePct), tone: row.severity },
    { label: "Bills", value: `${row.entries} vs about ${row.usualEntries}` },
  ];
  return <>
    <header className="air-detail-head">
      <div>
        <h3 className="air-detail-title">{row.category}</h3>
        <span className="air-row-sub">{row.status}{row.period ? ` · ${row.period}` : ""}</span>
      </div>
      {row.severity ? <SeverityBadge severity={row.severity} /> : null}
    </header>
    <Facts items={facts} />
    <div className="air-detail-cols">
      <div className="air-detail-col">
        {group === "categories" && row.comparisons?.length > 0 && <div>
          <span className="air-kicker">Compared with</span>
          <ul className="air-plain">{row.comparisons.map(item => <li key={item.label}>{item.label}: {money(item.amount)} ({pct(item.changePct)})</li>)}</ul>
        </div>}
        {group === "rates" && <div>
          <span className="air-kicker">Rate history</span>
          <ul className="air-plain">
            {row.windows.map(window => <li key={window.days}>{window.days} days: {window.averageRate == null ? "no history" : `${money(window.averageRate)} (${pct(window.changePct)})`}</li>)}
            {row.otherSuppliersRate ? <li>Other suppliers: {money(row.otherSuppliersRate)}</li> : null}
          </ul>
        </div>}
        <p className="air-text">{row.explanation}</p>
      </div>
      <div className="air-detail-col">
        {row.recommendedAction ? <p className="air-suggest"><span className="air-kicker">Suggested action</span>{row.recommendedAction}</p> : null}
        <div className="air-foot">{row.confidence ? <Confidence row={row} /> : null}<SourceLink link={row.source} onOpen={openSource} /></div>
      </div>
    </div>
  </>;
}

const CHART_PAGE_SIZE = 6;
const PICK_PAGE_SIZE = 4;

export function ExpensesPanel({ data, openSource }) {
  const { comparisons, supplierPrices, supplierSpend } = data;
  const [groupId, setGroupId] = useState("categories");
  const [selectedId, setSelectedId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [chartPage, setChartPage] = useState(0);
  const [chartDir, setChartDir] = useState("next");
  const goToChartPage = page => { setChartDir(page > chartPage ? "next" : "prev"); setChartPage(page); };
  const [pickPage, setPickPage] = useState(0);
  const [pickDir, setPickDir] = useState("next");
  const groups = [
    { id: "categories", label: "Categories", items: comparisons.insights },
    { id: "rates", label: "Supplier rates", items: supplierPrices.insights },
    { id: "spend", label: "Supplier spend", items: supplierSpend },
  ].filter(group => group.items.length);
  const nothing = !groups.length;
  const group = groups.find(item => item.id === groupId) || groups[0];
  const selected = group?.items.find(item => item.id === selectedId) || group?.items[0];
  const flagged = comparisons.insights.length + supplierPrices.insights.length + supplierSpend.length;
  const top = comparisons.insights.reduce((best, row) => (row.changePct != null && (!best || row.changePct > best.changePct) ? row : best), null);
  const sortedByAmount = [...comparisons.insights].sort((a, b) => b.currentAmount - a.currentAmount);
  const pageCount = Math.max(1, Math.ceil(sortedByAmount.length / CHART_PAGE_SIZE));
  const currentPage = Math.min(chartPage, pageCount - 1);
  const chartRows = sortedByAmount.slice(currentPage * CHART_PAGE_SIZE, (currentPage + 1) * CHART_PAGE_SIZE);
  // One scale for every page, so bars on different pages can be compared.
  const chartMax = Math.max(1, ...sortedByAmount.map(row => Math.max(row.currentAmount, row.comparisonAmount || 0)));
  const pickPageCount = Math.max(1, Math.ceil((group?.items.length || 0) / PICK_PAGE_SIZE));
  const currentPickPage = Math.min(pickPage, pickPageCount - 1);
  const pickRows = group ? group.items.slice(currentPickPage * PICK_PAGE_SIZE, (currentPickPage + 1) * PICK_PAGE_SIZE) : [];
  const goToPickPage = page => {
    setPickDir(page > currentPickPage ? "next" : "prev");
    setPickPage(page);
    const first = group.items[page * PICK_PAGE_SIZE];
    if (first) setSelectedId(first.id);
  };
  return <div className="air-stack">
    <p className="air-note">Period {comparisons.period.from} to {comparisons.period.to}, compared with the same days of earlier periods. Amounts come from posted vouchers.</p>
    {comparisons.insufficientHistory && <AccEmpty title="Insufficient history" copy="At least a month of posted expenses is needed before trends are shown. No trend is reported yet." />}
    {!comparisons.insufficientHistory && nothing && <AccEmpty title="No unusual expense changes" copy="Spending is in line with comparable periods." />}
    {!comparisons.insufficientHistory && !nothing && <>
      <Stats items={[
        { label: "Items to review", value: String(flagged) },
        { label: "Biggest rise", value: top ? `${top.category} ${pct(top.changePct)}` : "—" },
        { label: "Categories compared", value: String(comparisons.insights.length) },
      ]} />

      {chartRows.length > 0 && <section className="air-panel" aria-label="Spend by category">
        <header className="air-panel-head">
          <div className="air-panel-title">
            <h3 className="air-h">Spend by category{pageCount > 1 ? <span className="air-count">{currentPage * CHART_PAGE_SIZE + 1} to {currentPage * CHART_PAGE_SIZE + chartRows.length} of {sortedByAmount.length}</span> : null}</h3>
            <span className="air-legend"><i className="is-now" />This period<i className="is-before" />Compared with</span>
          </div>
          {pageCount > 1 && <div className="air-pager-buttons" role="group" aria-label="Spend by category pages">
            <button type="button" className="air-arrow" disabled={currentPage === 0} onClick={() => goToChartPage(currentPage - 1)} aria-label="Previous categories"><ChevronLeft size={18} aria-hidden="true" /></button>
            <button type="button" className="air-arrow" disabled={currentPage >= pageCount - 1} onClick={() => goToChartPage(currentPage + 1)} aria-label="Next categories"><ChevronRight size={18} aria-hidden="true" /></button>
          </div>}
        </header>
        <ul key={currentPage} className={`air-bars is-${chartDir}`}>
          {chartRows.map(row => <li key={row.id}>
            <span className="air-bars-label">{row.category}</span>
            <span className="air-bars-track" aria-hidden="true">
              <span className="air-bars-now" style={{ width: `${Math.max(2, (row.currentAmount / chartMax) * 100)}%` }} />
              <span className="air-bars-before" style={{ width: `${Math.max(2, ((row.comparisonAmount || 0) / chartMax) * 100)}%` }} />
            </span>
            <span className="air-bars-value">{money(row.currentAmount)}<span className={`air-delta is-${row.severity || "low"}`}>{pct(row.changePct)}</span></span>
          </li>)}
          {pageCount > 1 && Array.from({ length: CHART_PAGE_SIZE - chartRows.length }, (_, index) => <li key={`fill-${index}`} className="air-bars-fill" aria-hidden="true" />)}
        </ul>
        <p className="air-meta">{pageCount > 1 ? "Largest spend first. Use the arrows to see more categories." : "Largest spend first."}</p>
      </section>}

      <div className="air-chips" role="tablist" aria-label="Expense views">
        {groups.map(item => <button key={item.id} type="button" role="tab" aria-selected={group.id === item.id} className={`air-chip${group.id === item.id ? " active" : ""}`} onClick={() => { setGroupId(item.id); setSelectedId(null); setPickPage(0); setPickDir("next"); }}>{item.label}<span>{item.items.length}</span></button>)}
      </div>
      <section className="air-board" aria-label="Expense details">
        {selected && <aside className={`air-detail${detailOpen ? " is-open" : ""}`} aria-live="polite">
          <button type="button" className="btn air-detail-back" onClick={() => setDetailOpen(false)}>Back to list</button>
          <ExpenseDetail group={group.id} row={selected} openSource={openSource} />
        </aside>}
        <div className="air-board-list">
          <div key={`${group.id}-${currentPickPage}`} className={`air-picks is-${pickDir}`}>
            {pickRows.map(row => <button key={row.id} type="button" className={`air-pick${selected?.id === row.id ? " is-active" : ""}`} aria-pressed={selected?.id === row.id} onClick={() => { setSelectedId(row.id); setDetailOpen(true); }}>
              <span className="air-pick-main"><strong>{row.category}</strong><span className="air-row-sub">{row.status}</span></span>
              <span className="air-pick-side"><b className="air-figure">{money(row.currentAmount)}</b><span className={`air-delta is-${row.severity || "low"}`}>{pct(row.changePct)}</span></span>
            </button>)}
            {pickPageCount > 1 && Array.from({ length: PICK_PAGE_SIZE - pickRows.length }, (_, index) => <span key={`fill-${index}`} className="air-pick-fill" aria-hidden="true" />)}
          </div>
          {pickPageCount > 1 && <div className="air-pick-head">
            <span className="air-count">{currentPickPage * PICK_PAGE_SIZE + 1} to {currentPickPage * PICK_PAGE_SIZE + pickRows.length} of {group.items.length}</span>
            <div className="air-pager-buttons" role="group" aria-label={`${group.label} pages`}>
              <button type="button" className="air-arrow" disabled={currentPickPage === 0} onClick={() => goToPickPage(currentPickPage - 1)} aria-label={`Previous ${group.label.toLowerCase()}`}><ChevronLeft size={18} aria-hidden="true" /></button>
              <button type="button" className="air-arrow" disabled={currentPickPage >= pickPageCount - 1} onClick={() => goToPickPage(currentPickPage + 1)} aria-label={`Next ${group.label.toLowerCase()}`}><ChevronRight size={18} aria-hidden="true" /></button>
            </div>
          </div>}
        </div>
      </section>
      {group.id === "categories" && comparisons.insufficient.length > 0 && <p className="air-note">No trend yet (not enough history): {comparisons.insufficient.map(row => row.accountName).join(", ")}.</p>}
      {group.id === "rates" && supplierPrices.insufficient.length > 0 && <p className="air-note">Without enough history for a rate trend: {supplierPrices.insufficient.slice(0, 8).map(row => `${row.supplierName} · ${row.itemName}`).join(", ")}.</p>}
    </>}
  </div>;
}

/* ---------- Cash flow: today beside the forecast ---------- */

const ACCOUNT_TONES = ["is-c0", "is-c1", "is-c2", "is-c3"];

function CashAccounts({ balances }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...balances].sort((a, b) => b.balance - a.balance);
  const many = sorted.length > 5;
  const shown = many ? sorted.slice(0, 4) : sorted;
  const rest = many ? sorted.slice(4) : [];
  const positive = Math.max(1, sorted.reduce((sum, row) => sum + Math.max(0, row.balance), 0));
  const share = value => Math.max(0, value) / positive;
  const restTotal = rest.reduce((sum, row) => sum + row.balance, 0);
  return <div className="air-accounts">
    <span className="air-kicker">Cash and bank accounts · {sorted.length}</span>
    <div className="air-share" role="img" aria-label="Share of cash by account">
      {shown.map((row, index) => share(row.balance) > 0 ? <span key={row.id} className={ACCOUNT_TONES[index % ACCOUNT_TONES.length]} style={{ width: `${share(row.balance) * 100}%` }} /> : null)}
      {rest.length > 0 && share(restTotal) > 0 ? <span className="is-rest" style={{ width: `${share(restTotal) * 100}%` }} /> : null}
    </div>
    <ul className="air-legend-list">
      {shown.map((row, index) => <li key={row.id}>
        <i className={ACCOUNT_TONES[index % ACCOUNT_TONES.length]} />
        <span className="air-legend-name">{row.name}</span>
        <b>{money(row.balance)}</b>
        <span className="air-meta">{Math.round(share(row.balance) * 100)}%</span>
      </li>)}
      {rest.length > 0 && <li>
        <i className="is-rest" />
        <span className="air-legend-name">{rest.length} other accounts</span>
        <b>{money(restTotal)}</b>
        <span className="air-meta">{Math.round(share(restTotal) * 100)}%</span>
      </li>}
    </ul>
    {many && <button type="button" className="btn air-view-all" onClick={() => setShowAll(true)}>View all {sorted.length} accounts</button>}
    {showAll && <Sheet title="Cash and bank accounts" onClose={() => setShowAll(false)}>
      <ul className="air-plain is-split is-roomy">{sorted.map(row => <li key={row.id}><span>{row.name}</span><b>{money(row.balance)}</b></li>)}</ul>
    </Sheet>}
  </div>;
}

export function CashFlowPanel({ forecast, openSource }) {
  const [horizonIndex, setHorizonIndex] = useState(0);
  const last30 = forecast.actualLast30Days;
  const flowMax = Math.max(1, last30.inflows, last30.outflows);
  const horizon = forecast.horizons[horizonIndex] || forecast.horizons[0];
  const horizonMax = horizon ? Math.max(1, horizon.inflows, horizon.outflows) : 1;
  const drivers = [...forecast.drivers].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return <div className="air-stack">
    <div className="air-cashgrid">
      <section className="air-panel air-today" aria-label="Cash today">
        <span className="air-kicker">Verified · as of {forecast.asOf}</span>
        <b className="air-cash-figure">{money(forecast.currentBalance)}</b>
        <span className="air-row-sub">Cash and bank today</span>
        <div className="air-flow">
          <span className="air-kicker">Last 30 days</span>
          <div className="air-flow-row"><span>In</span><span className="air-flow-track"><span className="is-in" style={{ width: `${(last30.inflows / flowMax) * 100}%` }} /></span><b>{money(last30.inflows)}</b></div>
          <div className="air-flow-row"><span>Out</span><span className="air-flow-track"><span className="is-out" style={{ width: `${(last30.outflows / flowMax) * 100}%` }} /></span><b>{money(last30.outflows)}</b></div>
        </div>
        <CashAccounts balances={forecast.balances} />
      </section>

      {horizon && <section className="air-panel air-forecast" aria-label="Cash forecast">
        <span className="air-kicker is-predicted">Predicted · not guaranteed</span>
        <div className="air-tabs" role="tablist" aria-label="Forecast period">
          {forecast.horizons.map((row, index) => <button key={row.days} type="button" role="tab" aria-selected={index === horizonIndex} className={`air-tab${index === horizonIndex ? " active" : ""}`} onClick={() => setHorizonIndex(index)}>{row.label}</button>)}
        </div>
        <div className="air-forecast-body">
          <span className="air-row-sub">Projected balance by {horizon.until}</span>
          <b className={`air-cash-figure${horizon.projectedBalance < 0 ? " is-danger" : ""}`}>{money(horizon.projectedBalance)}</b>
          {horizon.projectedBalance < 0 && <p className="air-warn" role="status">Cash is projected to go below zero in this period.</p>}
          <div className="air-flow">
            <div className="air-flow-row"><span>In</span><span className="air-flow-track"><span className="is-in" style={{ width: `${(horizon.inflows / horizonMax) * 100}%` }} /></span><b>{money(horizon.inflows)}</b></div>
            <div className="air-flow-row"><span>Out</span><span className="air-flow-track"><span className="is-out" style={{ width: `${(horizon.outflows / horizonMax) * 100}%` }} /></span><b>{money(horizon.outflows)}</b></div>
          </div>
          {(horizon.recurringInflows || horizon.recurringOutflows) ? <p className="air-meta">Includes {[horizon.recurringInflows ? `${money(horizon.recurringInflows)} recurring in` : null, horizon.recurringOutflows ? `${money(horizon.recurringOutflows)} recurring out` : null].filter(Boolean).join(" and ")}.</p> : null}
        </div>
        <p className="air-text">{forecast.explanation}</p>
        <Confidence row={forecast} />
      </section>}
    </div>

    <div className="air-cashgrid is-even">
      {drivers.length > 0 && <section className="air-panel" aria-label="Major factors">
        <h3 className="air-h">Major factors<span className="air-count">{drivers.length}</span></h3>
        <ol className="air-timeline">
          {drivers.map(row => <li key={row.id}>
            <span className="air-timeline-date">{row.date}</span>
            <span className="air-timeline-main"><strong>{row.label}</strong><span className="air-row-sub">{row.basis}</span><SourceLink link={row.source} onOpen={openSource} /></span>
            <b className={`air-timeline-amount${row.direction === "in" ? " is-in" : ""}`}>{row.direction === "in" ? "+" : "−"}{money(row.amount)}</b>
          </li>)}
        </ol>
      </section>}
      <section className="air-panel" aria-label="Assumptions">
        <h3 className="air-h">Assumptions</h3>
        <ul className="air-plain is-bulleted">{forecast.assumptions.map(item => <li key={item}>{item}</li>)}</ul>
        <div className="air-foot"><SourceLink link={forecast.source} onOpen={openSource} /></div>
      </section>
    </div>
  </div>;
}

/* ---------- Collections: sortable table with a detail drawer ---------- */

const COLLECTION_SORTS = {
  customer: (a, b) => String(a.customer).localeCompare(String(b.customer)),
  outstanding: (a, b) => (a.outstanding || 0) - (b.outstanding || 0),
  daysOverdue: (a, b) => (a.daysOverdue || 0) - (b.daysOverdue || 0),
  risk: (a, b) => severityRank(a.risk) - severityRank(b.risk),
};

function SortHead({ label, field, sort, onSort, num }) {
  const active = sort.key === field;
  return <th className={num ? "acc-num" : undefined} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
    <button type="button" className={`air-sort${active ? " is-active" : ""}`} onClick={() => onSort(field)}>{label}<span aria-hidden="true">{active ? (sort.dir === "asc" ? "↑" : "↓") : ""}</span></button>
  </th>;
}

export function CollectionsPanel({ rows, openSource, businessName, asOf, canWrite, onReminderOpened }) {
  const [draft, setDraft] = useState(null);
  const [language, setLanguage] = useState("en");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState({ key: null, dir: "desc" });
  const compose = (row, lang) => draftCollectionReminder({ name: row.customer, due: row.overdueAmount || row.outstanding, outstanding: row.outstanding, date: row.nextDue || asOf, businessName }, lang);
  const open = row => { setSelected(null); setDraft(row); setLanguage("en"); setMessage(compose(row, "en")); setConfirmed(false); setNote(""); };
  const send = () => {
    if (!draft || !reminderSendAllowed({ confirmed, phone: draft.phone, message })) return;
    const result = openManualWhatsAppShare({ phone: draft.phone, message });
    setNote(result.opened ? "WhatsApp opened. Nothing in the books changed." : "WhatsApp did not open. Copy the message and send it yourself.");
    if (result.opened) onReminderOpened?.(draft);
  };
  const onSort = key => setSort(current => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "customer" ? "asc" : "desc" });
  if (!rows.length) return <AccEmpty title="No open receivables" copy="Customers with outstanding invoices appear here, ranked by risk." />;
  const total = rows.reduce((sum, row) => sum + (Number(row.outstanding) || 0), 0);
  const risky = rows.filter(row => row.risk === "high" || row.risk === "critical").length;
  const maxOutstanding = Math.max(1, ...rows.map(row => Number(row.outstanding) || 0));
  const active = SEVERITY_FILTERS.find(item => item.id === filter) || SEVERITY_FILTERS[0];
  let shown = rows.filter(row => active.test(row.risk));
  if (sort.key) shown = [...shown].sort((a, b) => COLLECTION_SORTS[sort.key](a, b) * (sort.dir === "asc" ? 1 : -1));
  return <div className="air-stack">
    <Stats items={[
      { label: "Customers owing", value: String(rows.length) },
      { label: "Total outstanding", value: money(total) },
      { label: "High risk", value: String(risky), tone: risky ? "danger" : "" },
    ]} />
    <section className="air-section">
      <div className="air-bar-head">
        <h3 className="air-h">Who to collect from first<span className="air-count">{shown.length}</span></h3>
        <SeverityChips items={rows} pick={row => row.risk} filter={filter} setFilter={setFilter} />
      </div>
      <div className="air-table-wrap">
        <table className="air-table">
          <thead><tr>
            <SortHead label="Customer" field="customer" sort={sort} onSort={onSort} />
            <SortHead label="Outstanding" field="outstanding" sort={sort} onSort={onSort} num />
            <SortHead label="Days overdue" field="daysOverdue" sort={sort} onSort={onSort} num />
            <SortHead label="Risk" field="risk" sort={sort} onSort={onSort} />
            <th>Next due</th>
            <th><span className="ft-sr-only">Action</span></th>
          </tr></thead>
          <tbody>
            {shown.map(row => <tr key={row.id} onClick={() => setSelected(row)}>
              <td className="air-t-customer"><button type="button" className="air-link-btn" onClick={event => { event.stopPropagation(); setSelected(row); }}>{row.customer}</button><span className="air-row-sub">{row.reason}</span></td>
              <td className="acc-num air-t-amount"><b>{money(row.outstanding)}</b><span className="air-mini" aria-hidden="true"><span style={{ width: `${((Number(row.outstanding) || 0) / maxOutstanding) * 100}%` }} /></span></td>
              <td className="acc-num air-t-days">{row.daysOverdue ? `${row.daysOverdue} day(s)` : "Not overdue"}</td>
              <td className="air-t-risk"><SeverityBadge severity={row.risk} /></td>
              <td className="air-t-due">{row.nextDue || "—"}</td>
              <td className="air-t-action">{canWrite && row.phone ? <button type="button" className="btn primary" onClick={event => { event.stopPropagation(); open(row); }}>Draft message</button> : null}</td>
            </tr>)}
            {!shown.length && <tr><td colSpan={6} className="air-t-empty">No customers with this risk level.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    {selected && <Sheet title={selected.customer} onClose={() => setSelected(null)}>
      <div className="air-drawer-top">
        <b className="air-cash-figure">{money(selected.outstanding)}</b>
        <SeverityBadge severity={selected.risk} />
      </div>
      <p className="air-row-sub">{selected.reason}</p>
      <Facts items={[
        { label: "Days overdue", value: selected.daysOverdue ? String(selected.daysOverdue) : "Not overdue" },
        { label: "Next due", value: selected.nextDue || "—" },
        { label: "Channel", value: selected.channel },
        { label: "Assigned to", value: selected.assignedAgent },
      ]} />
      <p className="air-suggest"><span className="air-kicker">Suggested action</span>{selected.recommendedAction}{selected.paymentPattern ? ` ${selected.paymentPattern}` : ""}</p>
      {selected.sourceRecords?.length > 0 && <div>
        <span className="air-kicker">Source records</span>
        <ul className="air-plain">{selected.sourceRecords.slice(0, 6).map(item => <li key={item.reference}>{item.reference}</li>)}</ul>
      </div>}
      <div className="air-actions">
        {canWrite && selected.phone ? <button type="button" className="btn primary" onClick={() => open(selected)}>Draft message</button> : null}
        <SourceLink link={selected.source} onOpen={openSource} />
      </div>
    </Sheet>}

    {draft && <Sheet title={`Message for ${draft.customer}`} onClose={() => setDraft(null)}>
      <form className="air-sheet-form collection-copilot-draft" onSubmit={event => { event.preventDefault(); send(); }}>
        <label>Language
          <select value={language} onChange={event => { setLanguage(event.target.value); setMessage(compose(draft, event.target.value)); setConfirmed(false); }}>
            {REMINDER_LANGUAGES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Message<textarea rows={6} value={message} onChange={event => { setMessage(event.target.value); setConfirmed(false); }} /></label>
        <label className="collection-copilot-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I confirm this message. It is not sent until I open WhatsApp.</label>
        <div className="collection-copilot-draft-actions air-actions">
          <button type="submit" className="btn primary" disabled={!reminderSendAllowed({ confirmed, phone: draft.phone, message })}>Open WhatsApp</button>
          <button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button>
        </div>
        {note && <p className="air-note" role="status">{note}</p>}
      </form>
    </Sheet>}
  </div>;
}

/* ---------- Anomalies and GST health: alert cards ---------- */

export function AlertsPanel({ alerts, decisions, feature, canWrite, busy, onDecide, openSource, emptyTitle, emptyCopy, header = null }) {
  const [filter, setFilter] = useState("all");
  const active = SEVERITY_FILTERS.find(item => item.id === filter) || SEVERITY_FILTERS[0];
  const shown = alerts.filter(alert => active.test(alert.severity)).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const pending = alerts.filter(alert => !decisions.get(`${feature}:${alert.id}`)).length;
  return <div className="air-stack">
    {header ? <div className="air-note">{header}</div> : null}
    {!alerts.length && <AccEmpty title={emptyTitle} copy={emptyCopy} />}
    {alerts.length > 0 && <>
      <div className="air-bar-head">
        <p className="air-summary"><b>{pending}</b> of {alerts.length} still need review</p>
        <SeverityChips items={alerts} pick={alert => alert.severity} filter={filter} setFilter={setFilter} />
      </div>
      <div className="air-alerts">
        {shown.map(alert => {
          const decision = decisions.get(`${feature}:${alert.id}`);
          const facts = [
            alert.expected ? { label: "Expected", value: alert.expected } : null,
            alert.actual ? { label: "Actual", value: alert.actual } : null,
            typeof alert.difference === "number" ? { label: "Difference", value: differenceText(alert) } : null,
          ].filter(Boolean);
          return <article key={alert.id} className={`air-alert is-${alert.severity || "low"}${decision ? " is-done" : ""}`}>
            <header className="air-alert-top">
              <SeverityBadge severity={alert.severity} />
              {alert.module ? <span className="badge">{alert.module}</span> : null}
              {alert.requiresReview ? <span className="badge warning">Requires review</span> : null}
            </header>
            <div>
              <h3 className="air-alert-title">{alert.title}</h3>
              {alert.record ? <span className="air-row-sub">{alert.record}</span> : null}
            </div>
            {facts.length > 0 && <dl className="air-triple">{facts.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
            <p className="air-text">{alert.explanation}</p>
            <p className="air-suggest"><span className="air-kicker">Do this</span>{alert.recommendedAction}</p>
            <footer className="air-alert-foot">
              <ReviewButtons decision={decision} canWrite={canWrite} busy={busy} onReview={() => onDecide(feature, alert, "reviewed")} onDismiss={() => onDecide(feature, alert, "dismissed")} />
              <SourceLink link={alert.source} onOpen={openSource} />
              {alert.relatedSource ? <SourceLink link={alert.relatedSource} onOpen={openSource} /> : null}
              <Confidence row={alert} />
            </footer>
          </article>;
        })}
      </div>
      {!shown.length && <p className="air-note">No alerts with this severity.</p>}
    </>}
  </div>;
}

/* ---------- Month-end: executive summary ---------- */

export function MonthEndPanel({ readiness, months, month, setMonth, canWrite, busy, onResolve, openSource, brief }) {
  const [briefOpen, setBriefOpen] = useState(false);
  const tone = readiness.readinessPct >= 90 ? "success" : readiness.readinessPct >= 60 ? "warning" : "danger";
  const percent = Math.max(0, Math.min(readiness.readinessPct, 100));
  const needsAction = readiness.checks.filter(check => check.count > 0);
  const clear = readiness.checks.filter(check => !(check.count > 0));
  return <div className="air-stack">
    <section className={`air-exec is-${tone}`} aria-label="Month-end summary">
      <div className="air-ring" style={{ "--air-pct": `${percent}%` }} role="img" aria-label={`${percent}% ready`}>
        <span><b>{percent}%</b><small>ready</small></span>
      </div>
      <div className="air-exec-main">
        <span className="air-kicker">Month-end readiness</span>
        <h3 className="air-exec-title">{readiness.remaining ? `${readiness.remaining} of ${readiness.totalIssues} issue(s) left to resolve` : "Every issue is resolved"}</h3>
        <p className="air-row-sub">{readiness.locked ? "This period is locked." : "This period is open."} {readiness.note}</p>
        <div className="air-actions">
          <label className="air-field">Month <select value={month} onChange={event => setMonth(event.target.value)}>{months.map(key => <option key={key} value={key}>{key}</option>)}</select></label>
          {brief ? <button type="button" className="btn" onClick={() => setBriefOpen(true)}>Brief for the CA</button> : null}
        </div>
      </div>
    </section>
    {briefOpen && brief ? <CaBriefSheet brief={brief} onClose={() => setBriefOpen(false)} /> : null}

    <div className="air-kpis">
      <div className={`air-kpi${readiness.critical ? " is-danger" : ""}`}><span>Critical</span><b>{readiness.critical}</b></div>
      <div className="air-kpi"><span>High</span><b>{readiness.high}</b></div>
      <div className="air-kpi is-success"><span>Resolved</span><b>{readiness.resolved}</b></div>
      <div className="air-kpi"><span>Remaining</span><b>{readiness.remaining}</b></div>
    </div>

    {needsAction.length > 0 && <Section title="Needs action" count={needsAction.length}>
      <div className="air-checks">
        {needsAction.map(check => <article key={check.key} className={`air-check is-${check.severity || "low"}`}>
          <header className="air-check-top"><strong>{check.label}</strong><SeverityBadge severity={check.severity} /></header>
          <b className="air-check-value">{check.value}</b>
          <p className="air-row-sub">{check.detail}</p>
          <div className="air-actions">
            <SourceLink link={check.link} onOpen={openSource}>Resolve issues</SourceLink>
            {check.resolved ? <span className="badge">Reviewed</span> : canWrite ? <button type="button" className="btn" disabled={busy} onClick={() => onResolve(check)}>Mark reviewed</button> : null}
          </div>
        </article>)}
      </div>
    </Section>}
    {clear.length > 0 && <Section title="Clear" count={clear.length}>
      <ul className="air-clear">
        {clear.map(check => <li key={check.key}><span className="air-tick" aria-hidden="true">✓</span><span className="air-clear-main"><strong>{check.label}</strong><span className="air-row-sub">{check.detail}</span></span><b>{check.value}</b></li>)}
      </ul>
    </Section>}
  </div>;
}

/* ---------- Bank reconciliation ---------- */

export function BankPanel({ result, decisions, canWrite, busy, isLocked, onApprove, onReject, openSource }) {
  const [choice, setChoice] = useState({});
  if (!result.totalLines) return <AccEmpty title="No bank statements" copy="Import a bank statement in Banking to get reconciliation suggestions." />;
  return <div className="air-stack">
    <Stats items={[
      { label: "Lines reconciled", value: result.reconciledPct == null ? "—" : `${result.reconciledPct}%`, tone: "success" },
      { label: "Open lines", value: String(result.suggestions.length) },
      { label: "With a suggestion", value: String(result.suggestions.filter(row => row.actionKind === "match" || row.actionKind === "create_entry").length) },
    ]} />
    <p className="air-note">Approve only after checking the suggestion. A match uses the normal reconciliation; an entry opens a prefilled form and posts nothing until you save it. Locked periods are respected.</p>
    {!result.suggestions.length && <AccEmpty title="All lines reconciled" copy="Every statement line is matched or ignored." />}
    {result.suggestions.length > 0 && <Section title="Lines to reconcile" count={result.suggestions.length}>
      <ul className="air-list">
        {result.suggestions.map(row => {
          const decision = decisions.get(`bank_reconciliation:${row.id}`);
          const final = decision && (decision.action === "approved" || decision.action === "rejected");
          const locked = isLocked(row);
          const selected = choice[row.id] || row.voucherLineId || "";
          const guess = [row.likelyParty, row.relatedDocument, row.likelyLedger].filter(Boolean).join(" · ");
          const canMatch = row.actionKind === "match" || row.actionKind === "choose";
          return <Row key={row.id} tone={row.direction === "out" ? "out" : "in"}
            title={row.description}
            sub={`${row.date} · ${row.bankAccount}${row.reference ? ` · ${row.reference}` : ""}`}
            figure={`${row.direction === "out" ? "−" : "+"}${money(row.amount)}`} figureSub={row.transactionType}
            badge={<span className="air-badges"><span className="badge">{row.confidencePct}% match</span></span>}>
            <p className="air-suggest"><span className="air-kicker">Suggestion</span>{guess || "No likely match found"}</p>
            <p className="air-text">{row.explanation} {row.suggestedAction}{row.learnedFromHistory ? " Learned from this company's approved matches." : ""}</p>
            {final ? <div className="air-foot"><DecisionBadge decision={decision} /></div>
              : locked ? <div className="air-foot"><span className="air-meta">Period locked</span><SourceLink link={row.source} onOpen={openSource}>Review</SourceLink></div>
              : canWrite ? <div className="air-actions">
                {decision ? <DecisionBadge decision={decision} /> : null}
                {row.candidates.length > 0 && canMatch && <select aria-label="Edit suggestion" value={selected} onChange={event => setChoice(current => ({ ...current, [row.id]: event.target.value }))}>
                  <option value="">Choose voucher…</option>
                  {row.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label} · {candidate.confidence}%</option>)}
                </select>}
                {canMatch && <button type="button" className="btn primary" disabled={busy || !selected} onClick={() => onApprove(row, selected, selected !== row.voucherLineId)}>Approve</button>}
                {row.actionKind === "create_entry" && <button type="button" className="btn primary" disabled={busy} onClick={() => onApprove(row, null, false)}>Approve</button>}
                {row.actionKind === "create_entry" && <button type="button" className="btn" disabled={busy} onClick={() => onApprove(row, null, true)}>Edit suggestion</button>}
                <button type="button" className="btn" disabled={busy} onClick={() => onReject(row)}>Reject</button>
                <SourceLink link={row.source} onOpen={openSource}>Review</SourceLink>
              </div> : <div className="air-foot"><SourceLink link={row.source} onOpen={openSource}>Review</SourceLink></div>}
          </Row>;
        })}
      </ul>
    </Section>}
  </div>;
}

/* ---------- Inventory ---------- */

export function InventoryPanel({ rows, openSource }) {
  if (!rows.length) return <AccEmpty title="No stock items" copy="Products with stock tracking appear here." />;
  const sorted = [...rows].sort((a, b) => (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity));
  const atRisk = rows.filter(row => row.status === "Likely stockout").length;
  return <div className="air-stack">
    <Stats items={[
      { label: "Items tracked", value: String(rows.length) },
      { label: "Likely stockout", value: String(atRisk), tone: atRisk ? "warning" : "" },
      { label: "Need reorder", value: String(rows.filter(row => row.suggestedReorderQty).length) },
    ]} />
    <Section title="Stock cover" count={rows.length}>
      <p className="air-note">Items that run out soonest are listed first.</p>
      <ul className="air-list">
        {sorted.map(row => {
          const stockout = row.status === "Likely stockout";
          return <Row key={row.id} tone={stockout ? "medium" : ""} title={row.itemName}
            sub={row.daysOfCover != null ? `${row.daysOfCover} day(s) of cover${row.stockoutDate ? ` · out around ${row.stockoutDate}` : ""}` : "Not enough sales history for cover"}
            figure={`${row.currentStock} ${row.unit || ""}`.trim()} figureSub={row.suggestedReorderQty ? `Reorder ${row.suggestedReorderQty}` : "No reorder needed"}
            badge={<span className={`badge${stockout ? " warning" : ""}`}>{row.status}</span>}>
            {row.daysOfCover != null ? <div className={`air-bar${stockout ? " is-medium" : " is-low"}`} aria-hidden="true"><span style={{ width: barWidth((row.daysOfCover / 60) * 100) }} /></div> : null}
            <More label="Forecast and explanation">
              <ul className="air-plain">
                <li>Average weekly sales: {row.insufficientHistory ? "—" : row.averageWeeklySales}</li>
                <li>Forecast for 30 days: {row.forecastDemand30Days ?? "—"}</li>
                <li>Lead time: {row.leadTimeDays != null ? `${row.leadTimeDays} days` : "Unknown (7 assumed)"}</li>
              </ul>
              <p className="air-text">{row.explanation} {row.recommendedAction}</p>
              <div className="air-foot"><Confidence row={row} /><SourceLink link={row.source} onOpen={openSource} /></div>
            </More>
          </Row>;
        })}
      </ul>
    </Section>
  </div>;
}
