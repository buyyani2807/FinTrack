import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { FilterSelect } from "../../../components/ui.jsx";
import { openManualWhatsAppShare } from "../../receipts/io/receiptWhatsApp.js";
import { REMINDER_LANGUAGES, draftCollectionReminder, reminderSendAllowed } from "../../finance/model/collectionCopilot.js";
import { axisMoney, money } from "../accountsFormat.js";
import { AccEmpty } from "./AccUi.jsx";
import { Select } from "../../../components/Select.jsx";
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

/** Which row of a list is open. Opening one closes the others and scrolls it into view. */
function useAccordion() {
  const [openId, setOpenId] = useState(null);
  const toggle = (id, element) => {
    const opening = openId !== id;
    setOpenId(opening ? id : null);
    if (!opening || !element) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      const rect = element.getBoundingClientRect();
      if (rect.top < 72 || rect.bottom > window.innerHeight) element.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    }, calm ? 0 : 300);
  };
  return [openId, toggle, setOpenId];
}

const LIST_PAGE_SIZE = 6;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Rows for the current page. Changing the page is the caller's job for closing an open row. */
function usePagedList(items, size = LIST_PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState("next");
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pageCount - 1);
  const rows = items.slice(current * size, (current + 1) * size);
  const goToPage = next => { setDir(next > current ? "next" : "prev"); setPage(next); };
  const reset = () => { setPage(0); setDir("next"); };
  return { page: current, dir, rows, pageCount, size, from: items.length ? current * size + 1 : 0, to: current * size + rows.length, total: items.length, goToPage, reset };
}

function DateChip({ date }) {
  const [, month, day] = String(date || "").split("-");
  return <span className="air-datechip"><b>{day || date}</b>{MONTHS[Number(month) - 1] ? <small>{MONTHS[Number(month) - 1]}</small> : null}</span>;
}

/**
 * One accordion row. `layout="pair"` keeps the two figure columns used by Expenses.
 * Every other row shares one grid: name, figure, badge, chevron, so the columns line up.
 */
function PickRow({ open, onToggle, title, sub, layout = "simple", className = "", figure, figureLabel, figureTone = "", compared, comparedLabel, delta, badge, children }) {
  const pair = layout === "pair";
  return <div className={`air-pick-item${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}>
    <button type="button" className={`air-pick${pair ? " is-pair" : ""}`} aria-expanded={open} onClick={event => onToggle(event.currentTarget.parentElement)}>
      <span className="air-pick-main"><strong>{title}</strong>{sub ? <span className="air-row-sub">{sub}</span> : null}</span>
      {pair ? <>
        <span className="air-pick-figure"><span className="air-pick-label">{figureLabel}</span><b className="air-figure">{figure}</b></span>
        <span className="air-pick-figure is-compared"><span className="air-pick-label">{comparedLabel}</span><b className="air-figure">{compared}</b></span>
        {delta}
      </> : <>
        <span className="air-pick-figure">{figureLabel ? <span className="air-pick-label">{figureLabel}</span> : null}{figure != null ? <b className={`air-figure${figureTone ? ` ${figureTone}` : ""}`}>{figure}</b> : null}</span>
        <span className="air-pick-badge">{badge}</span>
      </>}
      <ChevronDown className="air-pick-chevron" size={18} aria-hidden="true" />
    </button>
    <div className={`air-collapse${open ? " is-open" : ""}`}>
      <div className="air-collapse-inner"><div className="air-detail">{children}</div></div>
    </div>
  </div>;
}

function Pager({ label, page, pageCount, from, to, total, onPage }) {
  if (pageCount <= 1) return null;
  return <div className="air-pick-head">
    <span className="air-count">{from} to {to} of {total}</span>
    <div className="air-pager-buttons" role="group" aria-label={`${label} pages`}>
      <button type="button" className="air-arrow" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label={`Previous ${label}`}><ChevronLeft size={18} aria-hidden="true" /></button>
      <button type="button" className="air-arrow" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)} aria-label={`Next ${label}`}><ChevronRight size={18} aria-hidden="true" /></button>
    </div>
  </div>;
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

const PICK_PAGE_SIZE = 4;
const PICK_LABELS = { categories: ["This period", "Compared with"], rates: ["Latest rate", "Earlier rate"], spend: ["This period", "3-month average"] };
const DONUT_R = 58;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;
const shareLabel = share => (share > 0 && share < 0.005 ? "<1%" : `${Math.round(share * 100)}%`);

/** Largest flagged categories, with the tail folded into Other. Shares use this period's amount. */
function spendRing(rows) {
  const positive = rows.filter(row => Number(row.currentAmount) > 0);
  const total = positive.reduce((sum, row) => sum + Number(row.currentAmount), 0);
  const slices = positive.slice(0, 5).map(row => ({
    id: row.id,
    name: row.category,
    amount: Number(row.currentAmount),
    changePct: row.changePct,
    severity: row.severity,
  }));
  const rest = positive.slice(5);
  if (rest.length) {
    slices.push({
      id: "other",
      name: "Other",
      amount: rest.reduce((sum, row) => sum + Number(row.currentAmount), 0),
      changePct: null,
      severity: "",
    });
  }
  return { total, slices: slices.map(slice => ({ ...slice, share: total ? slice.amount / total : 0 })) };
}

export function ExpensesPanel({ data, openSource }) {
  const { comparisons, supplierPrices, supplierSpend } = data;
  const [groupId, setGroupId] = useState("categories");
  const [pickPage, setPickPage] = useState(0);
  const [pickDir, setPickDir] = useState("next");
  const [openId, toggle, setOpenId] = useAccordion();
  const groups = [
    { id: "categories", label: "Categories", items: comparisons.insights },
    { id: "rates", label: "Supplier rates", items: supplierPrices.insights },
    { id: "spend", label: "Supplier spend", items: supplierSpend },
  ].filter(group => group.items.length);
  const nothing = !groups.length;
  const group = groups.find(item => item.id === groupId) || groups[0];
  const flagged = comparisons.insights.length + supplierPrices.insights.length + supplierSpend.length;
  const top = comparisons.insights.reduce((best, row) => (row.changePct != null && (!best || row.changePct > best.changePct) ? row : best), null);
  const spend = spendRing([...comparisons.insights].sort((a, b) => b.currentAmount - a.currentAmount));
  const ringStarts = spend.slices.map((_, index) => spend.slices.slice(0, index).reduce((sum, slice) => sum + slice.share * DONUT_CIRC, 0));
  const pickPageCount = Math.max(1, Math.ceil((group?.items.length || 0) / PICK_PAGE_SIZE));
  const currentPickPage = Math.min(pickPage, pickPageCount - 1);
  const pickRows = group ? group.items.slice(currentPickPage * PICK_PAGE_SIZE, (currentPickPage + 1) * PICK_PAGE_SIZE) : [];
  const goToPickPage = page => {
    setPickDir(page > currentPickPage ? "next" : "prev");
    setPickPage(page);
    setOpenId(null);
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

      {spend.slices.length > 0 && <section className="air-panel acc-ov-spend air-spend" aria-label="Spend by category">
        <header className="air-panel-head">
          <div className="air-panel-title">
            <h3 className="air-h">Spend by category</h3>
            <span className="air-row-sub">Share of this period in the categories flagged for review</span>
          </div>
        </header>
        <div className="acc-ov-spend-body">
          <svg className="acc-ov-donut" viewBox="0 0 160 160" role="img" aria-label={`Spend by category ${axisMoney(spend.total)}: ${spend.slices.map(slice => `${slice.name} ${money(slice.amount)}`).join(", ")}`}>
            <circle cx="80" cy="80" r={DONUT_R} className="acc-ov-donut-track" />
            {spend.slices.map((slice, index) => <circle
              key={slice.id}
              cx="80"
              cy="80"
              r={DONUT_R}
              className={`acc-ov-donut-slice slice-${index}`}
              strokeDasharray={`${Math.max(0, slice.share * DONUT_CIRC - (spend.slices.length > 1 ? 1.5 : 0))} ${DONUT_CIRC}`}
              strokeDashoffset={-ringStarts[index]}
              transform="rotate(-90 80 80)"
            ><title>{`${slice.name} · ${money(slice.amount)} · ${shareLabel(slice.share)}`}</title></circle>)}
            <text x="80" y="76" textAnchor="middle" className="acc-ov-donut-total">{axisMoney(spend.total)}</text>
            <text x="80" y="94" textAnchor="middle" className="acc-ov-donut-caption">this period</text>
          </svg>
          <ul className="acc-ov-spend-legend">
            {spend.slices.map((slice, index) => <li key={slice.id}>
              <i className={`slice-${index}`} aria-hidden="true" />
              <span className="name">{slice.name}</span>
              <span className="amount">{money(slice.amount)}</span>
              {slice.changePct == null ? <span /> : <span className={`air-delta is-${slice.severity || "low"}`}>{pct(slice.changePct)}</span>}
              <span className="share">{shareLabel(slice.share)}</span>
            </li>)}
          </ul>
        </div>
      </section>}

      <div className="air-chips" role="tablist" aria-label="Expense views">
        {groups.map(item => <button key={item.id} type="button" role="tab" aria-selected={group.id === item.id} className={`air-chip${group.id === item.id ? " active" : ""}`} onClick={() => { setGroupId(item.id); setOpenId(null); setPickPage(0); setPickDir("next"); }}>{item.label}<span>{item.items.length}</span></button>)}
      </div>
      <section className="air-board" aria-label="Expense details">
        <div key={`${group.id}-${currentPickPage}`} className={`air-picks is-${pickDir}`}>
          {pickRows.map(row => {
            const labels = PICK_LABELS[group.id];
            return <PickRow key={row.id} layout="pair" open={openId === row.id} onToggle={element => toggle(row.id, element)} title={row.category} sub={row.status}
              figureLabel={labels[0]} figure={money(row.currentAmount)}
              comparedLabel={labels[1]} compared={row.comparisonAmount == null ? "—" : money(row.comparisonAmount)}
              delta={<span className={`air-delta is-${row.severity || "low"}`}>{pct(row.changePct)}</span>}>
              <ExpenseDetail group={group.id} row={row} openSource={openSource} />
            </PickRow>;
          })}
          {pickPageCount > 1 && Array.from({ length: PICK_PAGE_SIZE - pickRows.length }, (_, index) => <span key={`fill-${index}`} className="air-pick-fill" aria-hidden="true" />)}
        </div>
        {pickPageCount > 1 && <div className="air-pick-head">
          <span className="air-count">{currentPickPage * PICK_PAGE_SIZE + 1} to {currentPickPage * PICK_PAGE_SIZE + pickRows.length} of {group.items.length}</span>
          <div className="air-pager-buttons" role="group" aria-label={`${group.label} pages`}>
            <button type="button" className="air-arrow" disabled={currentPickPage === 0} onClick={() => goToPickPage(currentPickPage - 1)} aria-label={`Previous ${group.label.toLowerCase()}`}><ChevronLeft size={18} aria-hidden="true" /></button>
            <button type="button" className="air-arrow" disabled={currentPickPage >= pickPageCount - 1} onClick={() => goToPickPage(currentPickPage + 1)} aria-label={`Next ${group.label.toLowerCase()}`}><ChevronRight size={18} aria-hidden="true" /></button>
          </div>
        </div>}
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
  const [flow, setFlow] = useState("all");
  const last30 = forecast.actualLast30Days;
  const flowMax = Math.max(1, last30.inflows, last30.outflows);
  const horizon = forecast.horizons[horizonIndex] || forecast.horizons[0];
  const horizonMax = horizon ? Math.max(1, horizon.inflows, horizon.outflows) : 1;
  const drivers = [...forecast.drivers].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const shownDrivers = flow === "all" ? drivers : drivers.filter(row => row.direction === flow);
  const factors = usePagedList(shownDrivers);
  const inCount = drivers.filter(row => row.direction === "in").length;
  const outCount = drivers.filter(row => row.direction === "out").length;
  const moneyIn = drivers.reduce((sum, row) => sum + (row.direction === "in" ? Number(row.amount) || 0 : 0), 0);
  const moneyOut = drivers.reduce((sum, row) => sum + (row.direction === "out" ? Number(row.amount) || 0 : 0), 0);
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

    {drivers.length > 0 && <section className="air-panel" aria-label="Major factors">
      <h3 className="air-h">Major factors<span className="air-count">{drivers.length}</span></h3>
      <dl className="air-factor-sum">
        <div><dt>Money in</dt><dd className="is-in">{money(moneyIn)}</dd></div>
        <div><dt>Money out</dt><dd>{money(moneyOut)}</dd></div>
        <div><dt>Net</dt><dd className={moneyIn - moneyOut < 0 ? "is-out" : ""}>{money(moneyIn - moneyOut)}</dd></div>
      </dl>
      <div className="air-chips" role="group" aria-label="Filter factors">
        <button type="button" className={`air-chip${flow === "all" ? " active" : ""}`} aria-pressed={flow === "all"} onClick={() => { setFlow("all"); factors.reset(); }}>All<span>{drivers.length}</span></button>
        {inCount > 0 && <button type="button" className={`air-chip${flow === "in" ? " active" : ""}`} aria-pressed={flow === "in"} onClick={() => { setFlow("in"); factors.reset(); }}>Money in<span>{inCount}</span></button>}
        {outCount > 0 && <button type="button" className={`air-chip${flow === "out" ? " active" : ""}`} aria-pressed={flow === "out"} onClick={() => { setFlow("out"); factors.reset(); }}>Money out<span>{outCount}</span></button>}
      </div>
      <ol key={`${flow}-${factors.page}`} className={`air-factor-list is-${factors.dir}`}>
        {factors.rows.map(row => <li key={row.id} className={row.direction === "in" ? "is-in" : "is-out"}>
          <DateChip date={row.date} />
          <span className="air-factor-main"><strong>{row.label}</strong><span className="air-row-sub">{row.basis}</span><SourceLink link={row.source} onOpen={openSource} /></span>
          <b className="air-factor-amount">{row.direction === "in" ? "+" : "−"}{money(row.amount)}</b>
        </li>)}
        {factors.pageCount > 1 && Array.from({ length: factors.size - factors.rows.length }, (_, index) => <li key={`fill-${index}`} className="air-factor-fill" aria-hidden="true">
          <span className="air-datechip" />
          <span className="air-factor-main"><strong>&nbsp;</strong><span className="air-row-sub">&nbsp;</span><span className="ai-source-link">&nbsp;</span></span>
          <b className="air-factor-amount">&nbsp;</b>
        </li>)}
      </ol>
      <Pager label="factors" page={factors.page} pageCount={factors.pageCount} from={factors.from} to={factors.to} total={factors.total} onPage={factors.goToPage} />
    </section>}
    <section className="air-panel" aria-label="Assumptions">
      <h3 className="air-h">Assumptions</h3>
      <ul className="air-plain is-bulleted is-cols">{forecast.assumptions.map(item => <li key={item}>{item}</li>)}</ul>
      <div className="air-foot"><SourceLink link={forecast.source} onOpen={openSource} /></div>
    </section>
  </div>;
}

/* ---------- Collections: accordion rows, paged ---------- */

const COLLECTION_SORTS = {
  customer: (a, b) => String(a.customer).localeCompare(String(b.customer)),
  outstanding: (a, b) => (a.outstanding || 0) - (b.outstanding || 0),
  daysOverdue: (a, b) => (a.daysOverdue || 0) - (b.daysOverdue || 0),
  risk: (a, b) => severityRank(a.risk) - severityRank(b.risk),
};

export function CollectionsPanel({ rows, openSource, businessName, asOf, canWrite, onReminderOpened }) {
  const [draft, setDraft] = useState(null);
  const [language, setLanguage] = useState("en");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState({ key: null, dir: "desc" });
  const [openId, toggle, setOpenId] = useAccordion();
  const activeFilter = SEVERITY_FILTERS.find(item => item.id === filter) || SEVERITY_FILTERS[0];
  let shown = rows.filter(row => activeFilter.test(row.risk));
  if (sort.key) shown = [...shown].sort((a, b) => COLLECTION_SORTS[sort.key](a, b) * (sort.dir === "asc" ? 1 : -1));
  const paging = usePagedList(shown);
  const compose = (row, lang) => draftCollectionReminder({ name: row.customer, due: row.overdueAmount || row.outstanding, outstanding: row.outstanding, date: row.nextDue || asOf, businessName }, lang);
  const open = row => { setDraft(row); setLanguage("en"); setMessage(compose(row, "en")); setConfirmed(false); setNote(""); };
  const send = () => {
    if (!draft || !reminderSendAllowed({ confirmed, phone: draft.phone, message })) return;
    const result = openManualWhatsAppShare({ phone: draft.phone, message });
    setNote(result.opened ? "WhatsApp opened. Nothing in the books changed." : "WhatsApp did not open. Copy the message and send it yourself.");
    if (result.opened) onReminderOpened?.(draft);
  };
  const resetList = () => { paging.reset(); setOpenId(null); };
  if (!rows.length) return <AccEmpty title="No open receivables" copy="Customers with outstanding invoices appear here, ranked by risk." />;
  const total = rows.reduce((sum, row) => sum + (Number(row.outstanding) || 0), 0);
  const risky = rows.filter(row => row.risk === "high" || row.risk === "critical").length;
  const goToPage = next => { paging.goToPage(next); setOpenId(null); };
  return <div className="air-stack">
    <Stats items={[
      { label: "Customers owing", value: String(rows.length) },
      { label: "Total outstanding", value: money(total) },
      { label: "High risk", value: String(risky), tone: risky ? "danger" : "" },
    ]} />
    <section className="air-board" aria-label="Who to collect from first">
      <div className="air-bar-head">
        <h3 className="air-h">Who to collect from first<span className="air-count">{shown.length}</span></h3>
        <div className="air-tools">
          <SeverityChips items={rows} pick={row => row.risk} filter={filter} setFilter={value => { setFilter(value); resetList(); }} />
          <FilterSelect label="Sort" value={sort.key || "suggested"} allValue="suggested" onChange={value => { setSort(value === "suggested" ? { key: null, dir: "desc" } : { key: value, dir: value === "customer" ? "asc" : "desc" }); resetList(); }}>
            <option value="suggested">Suggested</option>
            <option value="risk">Risk</option>
            <option value="outstanding">Outstanding</option>
            <option value="daysOverdue">Days overdue</option>
            <option value="customer">Customer</option>
          </FilterSelect>
        </div>
      </div>
      {paging.rows.length > 0 ? <div key={paging.page} className={`air-picks is-${paging.dir}`}>
        {paging.rows.map(row => <PickRow key={row.id} open={openId === row.id} onToggle={element => toggle(row.id, element)} title={row.customer} sub={row.reason}
          figureLabel={row.daysOverdue ? `${row.daysOverdue} day(s) overdue` : "Not overdue"} figure={money(row.outstanding)}
          badge={<SeverityBadge severity={row.risk} />}>
          <Facts items={[
            { label: "Days overdue", value: row.daysOverdue ? String(row.daysOverdue) : "Not overdue" },
            { label: "Next due", value: row.nextDue || "—" },
            { label: "Channel", value: row.channel },
            { label: "Assigned to", value: row.assignedAgent },
          ]} />
          <p className="air-suggest"><span className="air-kicker">Suggested action</span>{row.recommendedAction}{row.paymentPattern ? ` ${row.paymentPattern}` : ""}</p>
          {row.sourceRecords?.length > 0 && <div>
            <span className="air-kicker">Source records</span>
            <ul className="air-plain">{row.sourceRecords.slice(0, 6).map(item => <li key={item.reference}>{item.reference}</li>)}</ul>
          </div>}
          <div className="air-actions">
            {canWrite && row.phone ? <button type="button" className="btn primary" onClick={() => open(row)}>Draft message</button> : null}
            <SourceLink link={row.source} onOpen={openSource} />
          </div>
        </PickRow>)}
        {paging.pageCount > 1 && Array.from({ length: paging.size - paging.rows.length }, (_, index) => <span key={`fill-${index}`} className="air-pick-fill" aria-hidden="true" />)}
      </div> : <p className="air-note">No customers with this risk level.</p>}
      <Pager label="customers" page={paging.page} pageCount={paging.pageCount} from={paging.from} to={paging.to} total={paging.total} onPage={goToPage} />
    </section>

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

/* ---------- Anomalies and GST health: accordion rows, no card borders ---------- */

export function AlertsPanel({ alerts, decisions, feature, canWrite, busy, onDecide, openSource, emptyTitle, emptyCopy, header = null }) {
  const [filter, setFilter] = useState("all");
  const [openId, toggle, setOpenId] = useAccordion();
  const active = SEVERITY_FILTERS.find(item => item.id === filter) || SEVERITY_FILTERS[0];
  const shown = alerts.filter(alert => active.test(alert.severity)).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const paging = usePagedList(shown);
  const pending = alerts.filter(alert => !decisions.get(`${feature}:${alert.id}`)).length;
  return <div className="air-stack">
    {header ? <div className="air-note">{header}</div> : null}
    {!alerts.length && <AccEmpty title={emptyTitle} copy={emptyCopy} />}
    {alerts.length > 0 && <>
      <div className="air-bar-head">
        <p className="air-summary"><b>{pending}</b> of {alerts.length} still need review</p>
        <SeverityChips items={alerts} pick={alert => alert.severity} filter={filter} setFilter={value => { setFilter(value); setOpenId(null); paging.reset(); }} />
      </div>
      {paging.rows.length > 0 ? <div key={paging.page} className={`air-picks${feature === "anomalies" ? " is-alerts" : ""} is-${paging.dir}`}>
        {paging.rows.map(alert => {
          const decision = decisions.get(`${feature}:${alert.id}`);
          const hasCompare = alert.expected || alert.actual || typeof alert.difference === "number";
          return <PickRow key={alert.id} className={`is-plain${decision ? " is-done" : ""}`} open={openId === alert.id} onToggle={element => toggle(alert.id, element)} title={alert.title} sub={alert.record}
            figureLabel={typeof alert.difference === "number" ? "Difference" : ""} figure={typeof alert.difference === "number" ? differenceText(alert) : null}
            badge={<><SeverityBadge severity={alert.severity} />{alert.module ? <span className="badge">{alert.module}</span> : null}</>}>
            {hasCompare ? <div className="air-detail-cols">
              <div className="air-detail-col">
                <dl className="air-compare">
                  <div><dt>Expected</dt><dd>{alert.expected || "—"}</dd></div>
                  <div><dt>Actual</dt><dd>{alert.actual || "—"}</dd></div>
                  <div className="is-diff"><dt>Difference</dt><dd>{typeof alert.difference === "number" ? differenceText(alert) : "—"}</dd></div>
                </dl>
                <p className="air-text">{alert.explanation}</p>
              </div>
              <div className="air-detail-col">
                {alert.requiresReview ? <span className="badge warning">Requires review</span> : null}
                <p className="air-suggest"><span className="air-kicker">Do this</span>{alert.recommendedAction}</p>
                <div className="air-foot air-detail-foot">
                  <ReviewButtons decision={decision} canWrite={canWrite} busy={busy} onReview={() => onDecide(feature, alert, "reviewed")} onDismiss={() => onDecide(feature, alert, "dismissed")} />
                  <span className="air-detail-meta">
                    <Confidence row={alert} />
                    <SourceLink link={alert.source} onOpen={openSource} />
                    {alert.relatedSource ? <SourceLink link={alert.relatedSource} onOpen={openSource} /> : null}
                  </span>
                </div>
              </div>
            </div> : <div className="air-detail-stack">
              {alert.requiresReview ? <span className="badge warning">Requires review</span> : null}
              <p className="air-text">{alert.explanation}</p>
              <p className="air-suggest"><span className="air-kicker">Do this</span>{alert.recommendedAction}</p>
              <div className="air-foot air-detail-foot">
                <ReviewButtons decision={decision} canWrite={canWrite} busy={busy} onReview={() => onDecide(feature, alert, "reviewed")} onDismiss={() => onDecide(feature, alert, "dismissed")} />
                <span className="air-detail-meta">
                  <Confidence row={alert} />
                  <SourceLink link={alert.source} onOpen={openSource} />
                  {alert.relatedSource ? <SourceLink link={alert.relatedSource} onOpen={openSource} /> : null}
                </span>
              </div>
            </div>}
          </PickRow>;
        })}
        {paging.pageCount > 1 && Array.from({ length: paging.size - paging.rows.length }, (_, index) => <span key={`fill-${index}`} className="air-pick-fill" aria-hidden="true" />)}
      </div> : <p className="air-note">No alerts with this severity.</p>}
      <Pager label="alerts" page={paging.page} pageCount={paging.pageCount} from={paging.from} to={paging.to} total={paging.total} onPage={next => { paging.goToPage(next); setOpenId(null); }} />
    </>}
  </div>;
}

/* ---------- Month-end: executive summary ---------- */

export function MonthEndPanel({ readiness, months, month, setMonth, canWrite, busy, onResolve, openSource, brief }) {
  const [briefOpen, setBriefOpen] = useState(false);
  const [checkFilter, setCheckFilter] = useState("all");
  const tone = readiness.readinessPct >= 90 ? "success" : readiness.readinessPct >= 60 ? "warning" : "danger";
  const percent = Math.max(0, Math.min(readiness.readinessPct, 100));
  const checklist = [...readiness.checks].sort((a, b) => ((b.count > 0) - (a.count > 0)) || (severityRank(b.severity) - severityRank(a.severity)));
  const shownChecks = checkFilter === "open" ? checklist.filter(check => check.count > 0) : checkFilter === "clear" ? checklist.filter(check => !(check.count > 0)) : checklist;
  const paging = usePagedList(shownChecks);
  const openCount = readiness.checks.filter(check => check.count > 0).length;
  return <div className="air-stack">
    <section className={`air-exec is-${tone}`} aria-label="Month-end summary">
      <div className="air-ring" style={{ "--air-pct": `${percent}%` }} role="img" aria-label={`${percent}% ready`}>
        <span><b>{percent}%</b><small>ready</small></span>
      </div>
      <div className="air-exec-main">
        <span className="air-kicker">Month-end readiness</span>
        <h3 className="air-exec-title">{readiness.remaining ? `${readiness.remaining} of ${readiness.totalIssues} issue(s) left to resolve` : "Every issue is resolved"}</h3>
        <p className="air-row-sub">{readiness.locked ? "This period is locked." : "This period is open."} {readiness.note}</p>
        <div className="air-exec-actions">
          <FilterSelect label="Month" value={month} allValue={month} onChange={setMonth}>
            {months.map(key => <option key={key} value={key}>{key}</option>)}
          </FilterSelect>
          {brief ? <button type="button" className="btn primary air-brief-btn" onClick={() => setBriefOpen(true)}><FileText size={16} aria-hidden="true" />Brief for the CA</button> : null}
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

    {checklist.length > 0 && <section className="air-section">
      <div className="air-bar-head">
        <h3 className="air-h">Month-end checklist<span className="air-count">{openCount} open of {readiness.checks.length}</span></h3>
        <div className="air-tools">
          <div className="air-chips" role="group" aria-label="Filter checklist">
            <button type="button" className={`air-chip${checkFilter === "all" ? " active" : ""}`} aria-pressed={checkFilter === "all"} onClick={() => { setCheckFilter("all"); paging.reset(); }}>All<span>{readiness.checks.length}</span></button>
            <button type="button" className={`air-chip${checkFilter === "open" ? " active" : ""}`} aria-pressed={checkFilter === "open"} onClick={() => { setCheckFilter("open"); paging.reset(); }}>Action required<span>{openCount}</span></button>
            <button type="button" className={`air-chip${checkFilter === "clear" ? " active" : ""}`} aria-pressed={checkFilter === "clear"} onClick={() => { setCheckFilter("clear"); paging.reset(); }}>Clear<span>{readiness.checks.length - openCount}</span></button>
          </div>
        </div>
      </div>
      {paging.rows.length > 0 ? <ul key={paging.page} className={`air-check-list is-${paging.dir}`}>
        {paging.rows.map(check => {
          const open = check.count > 0;
          return <li key={check.key}>
            {open ? <span className={`air-dot is-${check.severity || "low"}`} aria-hidden="true" /> : <span className="air-tick" aria-hidden="true">✓</span>}
            <span className="air-clear-main"><strong>{check.label}</strong><span className="air-row-sub">{check.detail}</span></span>
            <b className="air-check-value">{check.value}</b>
            {open ? <span className="air-actions">
              <SourceLink link={check.link} onOpen={openSource}>Resolve issues</SourceLink>
              {check.resolved ? <span className="badge">Reviewed</span> : canWrite ? <button type="button" className="btn" disabled={busy} onClick={() => onResolve(check)}>Mark reviewed</button> : null}
            </span> : null}
          </li>;
        })}
      </ul> : <p className="air-note">Nothing in this filter.</p>}
      <Pager label="checks" page={paging.page} pageCount={paging.pageCount} from={paging.from} to={paging.to} total={paging.total} onPage={paging.goToPage} />
    </section>}
  </div>;
}

/* ---------- Bank reconciliation ---------- */

export function BankPanel({ result, decisions, canWrite, busy, isLocked, onApprove, onReject, openSource }) {
  const [choice, setChoice] = useState({});
  const [openId, toggle, setOpenId] = useAccordion();
  const paging = usePagedList(result.suggestions || []);
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
      <div key={paging.page} className={`air-picks is-${paging.dir}`}>
        {paging.rows.map(row => {
          const decision = decisions.get(`bank_reconciliation:${row.id}`);
          const final = decision && (decision.action === "approved" || decision.action === "rejected");
          const locked = isLocked(row);
          const selected = choice[row.id] || row.voucherLineId || "";
          const guess = [row.likelyParty, row.relatedDocument, row.likelyLedger].filter(Boolean).join(" · ");
          const canMatch = row.actionKind === "match" || row.actionKind === "choose";
          return <PickRow key={row.id} open={openId === row.id} onToggle={element => toggle(row.id, element)}
            title={row.description}
            sub={`${row.date} · ${row.bankAccount}${row.reference ? ` · ${row.reference}` : ""}`}
            figureLabel={row.transactionType} figure={`${row.direction === "out" ? "−" : "+"}${money(row.amount)}`} figureTone={row.direction === "in" ? "is-in" : ""}
            badge={<span className="badge">{row.confidencePct}% match</span>}>
            <p className="air-suggest"><span className="air-kicker">Suggestion</span>{guess || "No likely match found"}</p>
            <p className="air-text">{row.explanation} {row.suggestedAction}{row.learnedFromHistory ? " Learned from this company's approved matches." : ""}</p>
            {final ? <div className="air-foot"><DecisionBadge decision={decision} /></div>
              : locked ? <div className="air-foot"><span className="air-meta">Period locked</span><SourceLink link={row.source} onOpen={openSource}>Review</SourceLink></div>
              : canWrite ? <div className="air-actions">
                {decision ? <DecisionBadge decision={decision} /> : null}
                {row.candidates.length > 0 && canMatch && <Select aria-label="Edit suggestion" value={selected} onChange={event => setChoice(current => ({ ...current, [row.id]: event.target.value }))}>
                  <option value="">Choose voucher…</option>
                  {row.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label} · {candidate.confidence}%</option>)}
                </Select>}
                {canMatch && <button type="button" className="btn primary" disabled={busy || !selected} onClick={() => onApprove(row, selected, selected !== row.voucherLineId)}>Approve</button>}
                {row.actionKind === "create_entry" && <button type="button" className="btn primary" disabled={busy} onClick={() => onApprove(row, null, false)}>Approve</button>}
                {row.actionKind === "create_entry" && <button type="button" className="btn" disabled={busy} onClick={() => onApprove(row, null, true)}>Edit suggestion</button>}
                <button type="button" className="btn" disabled={busy} onClick={() => onReject(row)}>Reject</button>
                <SourceLink link={row.source} onOpen={openSource}>Review</SourceLink>
              </div> : <div className="air-foot"><SourceLink link={row.source} onOpen={openSource}>Review</SourceLink></div>}
          </PickRow>;
        })}
        {paging.pageCount > 1 && Array.from({ length: paging.size - paging.rows.length }, (_, index) => <span key={`fill-${index}`} className="air-pick-fill" aria-hidden="true" />)}
      </div>
      <Pager label="lines" page={paging.page} pageCount={paging.pageCount} from={paging.from} to={paging.to} total={paging.total} onPage={next => { paging.goToPage(next); setOpenId(null); }} />
    </Section>}
  </div>;
}

/* ---------- Inventory ---------- */

export function InventoryPanel({ rows, openSource }) {
  const [openId, toggle, setOpenId] = useAccordion();
  const sorted = [...rows].sort((a, b) => (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity));
  const paging = usePagedList(sorted);
  if (!rows.length) return <AccEmpty title="No stock items" copy="Products with stock tracking appear here." />;
  const atRisk = rows.filter(row => row.status === "Likely stockout").length;
  return <div className="air-stack">
    <Stats items={[
      { label: "Items tracked", value: String(rows.length) },
      { label: "Likely stockout", value: String(atRisk), tone: atRisk ? "warning" : "" },
      { label: "Need reorder", value: String(rows.filter(row => row.suggestedReorderQty).length) },
    ]} />
    <Section title="Stock cover" count={rows.length}>
      <p className="air-note">Items that run out soonest are listed first.</p>
      <div key={paging.page} className={`air-picks is-${paging.dir}`}>
        {paging.rows.map(row => {
          const stockout = row.status === "Likely stockout";
          return <PickRow key={row.id} open={openId === row.id} onToggle={element => toggle(row.id, element)} title={row.itemName}
            sub={row.daysOfCover != null ? `${row.daysOfCover} day(s) of cover${row.stockoutDate ? ` · out around ${row.stockoutDate}` : ""}` : "Not enough sales history for cover"}
            figure={`${row.currentStock} ${row.unit || ""}`.trim()} figureTone={stockout ? "is-danger" : ""}
            badge={<><span className="badge">{row.suggestedReorderQty ? `Reorder ${row.suggestedReorderQty}` : "No reorder needed"}</span><span className={`badge${stockout ? " warning" : ""}`}>{row.status}</span></>}>
            {row.daysOfCover != null ? <div className={`air-bar${stockout ? " is-medium" : " is-low"}`} aria-hidden="true"><span style={{ width: barWidth((row.daysOfCover / 60) * 100) }} /></div> : null}
            <ul className="air-plain">
              <li>Average weekly sales: {row.insufficientHistory ? "—" : row.averageWeeklySales}</li>
              <li>Forecast for 30 days: {row.forecastDemand30Days ?? "—"}</li>
              <li>Lead time: {row.leadTimeDays != null ? `${row.leadTimeDays} days` : "Unknown (7 assumed)"}</li>
            </ul>
            <p className="air-text">{row.explanation} {row.recommendedAction}</p>
            <div className="air-foot"><Confidence row={row} /><SourceLink link={row.source} onOpen={openSource} /></div>
          </PickRow>;
        })}
        {paging.pageCount > 1 && Array.from({ length: paging.size - paging.rows.length }, (_, index) => <span key={`fill-${index}`} className="air-pick-fill" aria-hidden="true" />)}
      </div>
      <Pager label="items" page={paging.page} pageCount={paging.pageCount} from={paging.from} to={paging.to} total={paging.total} onPage={next => { paging.goToPage(next); setOpenId(null); }} />
    </Section>
  </div>;
}
