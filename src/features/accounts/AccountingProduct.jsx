import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import "./accountingProduct.css";
import {
  addBankStatement,
  cancelVoucher,
  createAccountsCompany,
  createChartAccount,
  createParty,
  deleteChartAccount,
  deleteParty,
  initializeAccounting,
  loadAccountingSettings,
  loadAccountsCompanies,
  loadAuditLog,
  loadBankStatements,
  loadChartOfAccounts,
  loadParties,
  loadPeriodLocks,
  loadVouchers,
  lockAccountingPeriod,
  matchBankLine as saveBankMatch,
  postVoucher,
  reopenAccountingPeriod,
  reverseVoucher,
  saveAccountingSettings,
  saveGstSettings,
  setAccountingIntegration,
  setActiveAccountsCompanyId,
  setPartyActive,
  syncAccountingOperations,
  updateChartAccount,
  updateParty,
} from "./accountingRepository.js";
import {
  ACCOUNT_TYPES_BY_GROUP,
  COA_GROUPS,
  MONEY_MODES,
  PARTY_TYPES,
  SIMPLE_ENTRY_KINDS,
  SIMPLE_EXPENSE_CODES,
  VOUCHER_TYPES,
  accountNormalSide,
  addDaysIso,
  assertBalancedVoucher,
  assertCanChangePartyType,
  assertCanDeleteLedger,
  assertCanDeleteParty,
  assertVoucherDateNotFuture,
  createSubmitLock,
  defaultAccountTypeForGroup,
  filterParties,
  indianFinancialYear,
  ledgerHasPostedLines,
  moneyAccounts,
  partyHasAccountingUse,
  prepareGstAmount,
  previousIndianFinancialYear,
  roundMoney,
  simpleEntryDraft,
  standaloneVisibleAccounts,
  validatePartyForm,
  voucherTotals,
} from "./accountingModel.js";
import { formatIstDateTime, todayIso } from "./cashbookModel.js";
import { GST_RATES, INDIA_STATES, gstStateFromGstin, isIntraGst } from "./accountingGst.js";
import {
  accountLedger,
  balanceSheet,
  bankVoucherLines,
  cashFlow,
  dashboardMetrics,
  dayBook,
  defaultBankStatementLines,
  gstBooksReport,
  invoiceRegister,
  partyBalances,
  partyLedger,
  profitAndLoss,
  trialBalance,
} from "./accountingReports.js";
import { LIST_PAGE_SIZE, pageSlice } from "./accountsList.js";
import { downloadAccountsCsv, downloadAccountsExcel, downloadAccountsPdf } from "./accountingExport.js";
import { formatInr } from "../../lib/formatMoney.js";

const money = formatInr;
const Field = ({ label, children, required, className }) => (
  <label className={`field${className ? ` ${className}` : ""}`}>
    <span>{label}{required ? <span className="acc-req"> *</span> : null}</span>
    {children}
  </label>
);
const AccMetric = ({ label, value, tone = "", onClick, hint = "" }) => (
  <article
    className={`card acc-metric-card tone-${tone || "plain"}${onClick ? " clickable" : ""}`}
    {...(onClick ? {
      role: "button",
      tabIndex: 0,
      onClick,
      onKeyDown: event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } },
    } : {})}
  >
    <div className="metric-label">{label}</div>
    <div className={`metric-value ${tone}`}>{value}</div>
    {hint ? <div className="metric-hint">{hint}</div> : null}
  </article>
);

const AccCompareChart = ({ receivables, payables, onReceivables, onPayables }) => {
  const ar = Number(receivables) || 0;
  const ap = Number(payables) || 0;
  const max = Math.max(ar, ap, 1);
  return (
    <section className="acc-ov-compare" aria-label="Receivables versus payables">
      <button type="button" className="card acc-ov-compare-side ar" onClick={onReceivables} aria-label={`Receivables ${money(ar)}. Open receivables`}>
        <span className="acc-ov-compare-kicker">Receivables</span>
        <strong className="acc-ov-compare-value">{money(ar)}</strong>
        <span className="acc-ov-compare-track" aria-hidden="true"><span style={{ width: `${(ar / max) * 100}%` }} /></span>
      </button>
      <button type="button" className="card acc-ov-compare-side ap" onClick={onPayables} aria-label={`Payables ${money(ap)}. Open payables`}>
        <span className="acc-ov-compare-kicker">Payables</span>
        <strong className="acc-ov-compare-value">{money(ap)}</strong>
        <span className="acc-ov-compare-track" aria-hidden="true"><span style={{ width: `${(ap / max) * 100}%` }} /></span>
      </button>
    </section>
  );
};

function AccOverviewPeriod({ fy, lastFy, from, to, onChange }) {
  const thisFy = from === fy.from && to === fy.to;
  const prevFy = from === lastFy.from && to === lastFy.to;
  const [customOpen, setCustomOpen] = useState(false);
  const mode = customOpen || (!thisFy && !prevFy) ? "custom" : thisFy ? "this" : "last";
  return (
    <div className="acc-ov-period">
      <label className="acc-ov-period-field">
        <span>Period</span>
        <select
          aria-label="Report period"
          value={mode}
          onChange={event => {
            if (event.target.value === "this") {
              setCustomOpen(false);
              onChange(fy.from, fy.to);
            } else if (event.target.value === "last") {
              setCustomOpen(false);
              onChange(lastFy.from, lastFy.to);
            } else {
              setCustomOpen(true);
            }
          }}
        >
          <option value="this">{fy.label}</option>
          <option value="last">{lastFy.label}</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      {mode === "custom" && (
        <>
          <label className="acc-ov-period-field">
            <span>From</span>
            <input type="date" value={from} onChange={event => onChange(event.target.value, to)} />
          </label>
          <label className="acc-ov-period-field">
            <span>To</span>
            <input type="date" value={to} onChange={event => onChange(from, event.target.value)} />
          </label>
        </>
      )}
    </div>
  );
}

function AccOverviewRecent({ rows, onViewAll }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section className="card acc-ov-recent-card">
      <button type="button" className="acc-ov-recent-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(current => !current)}>
        <span>Recent transactions{rows.length ? ` · ${rows.length}` : ""}</span>
        <span className="acc-ov-recent-chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      <div id={panelId} hidden={!open}>
        {rows.length ? (
          <div className="acc-ov-recent">
            {rows.map(voucher => (
              <div key={voucher.id} className="acc-ov-recent-row">
                <div>
                  <strong>{voucher.voucherNumber}</strong>
                  <p>{voucher.date} · {VOUCHER_TYPES[voucher.voucherType]?.label || voucher.voucherType}</p>
                </div>
                <span className="amt">{money(voucherTotals(voucher.lines).debit)}</span>
              </div>
            ))}
            <button type="button" className="acc-ov-link-btn acc-ov-recent-all" onClick={onViewAll}>View all</button>
          </div>
        ) : (
          <p className="acc-ov-recent-empty">No transactions yet. Use + New entry to record one.</p>
        )}
      </div>
    </section>
  );
}

const AccEmpty = ({ title, copy, actionLabel, onAction }) => (
  <div className="card acc-empty">
    <strong>{title}</strong>
    <p className="copy">{copy}</p>
    {actionLabel && onAction && <button type="button" className="btn primary" onClick={onAction}>{actionLabel}</button>}
  </div>
);

const bankMatchLabel = status => (status === "matched" ? "Matched" : status === "suggested" ? "Suggested" : "Unmatched");
const bankMatchTone = status => (status === "matched" ? "active" : status === "suggested" ? "suggested" : "inactive");

const BankMatchControls = ({ line, selected, options, saving, onSelect, onMatch, onUnmatch }) => (
  <>
    <select value={selected} onChange={event => onSelect(event.target.value)} disabled={line.matchStatus === "matched"}>
      <option value="">Choose books line</option>
      {options.map(item => <option key={item.id} value={item.id}>{item.date} · {item.voucherNumber} · {money(item.amount)}</option>)}
    </select>
    {line.matchStatus === "matched"
      ? <button type="button" className="btn" disabled={saving} onClick={onUnmatch}>Unmatch</button>
      : <button type="button" className="btn primary" disabled={saving || !selected} onClick={onMatch}>Match</button>}
  </>
);

const PARTY_TYPE_FILTERS = [
  { id: "all", label: "All", emptyTitle: "No parties found", emptyCopy: "Try a different search or clear the filter." },
  { id: "customer", label: "Customers", emptyTitle: "No customers found", emptyCopy: "No customer parties match this search." },
  { id: "supplier", label: "Suppliers", emptyTitle: "No suppliers found", emptyCopy: "No supplier parties match this search." },
  { id: "employee", label: "Employees", emptyTitle: "No employees found", emptyCopy: "No employee parties match this search." },
  { id: "agent", label: "Agents", emptyTitle: "No agents found", emptyCopy: "No agent parties match this search." },
  { id: "other", label: "Other", emptyTitle: "No other parties found", emptyCopy: "No other parties match this search." },
];

const partyTypeLabel = id => PARTY_TYPES.find(type => type.id === id)?.label || id;

const PartyTypeBadge = ({ type }) => (
  <span className={`acc-type-badge ${type || "other"}`}>{partyTypeLabel(type)}</span>
);

function AccPager({ page, pages, total, onPage, noun = "rows" }) {
  if (total <= LIST_PAGE_SIZE) return null;
  return (
    <div className="acc-pager">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="small">Page {page} of {pages} · {total} {noun}</span>
      <button type="button" className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

function AccSetupSection({ icon, title, copy, actions, children, collapsible = false, summary = "" }) {
  const [open, setOpen] = useState(!collapsible);
  const panelId = useId();
  const toggleId = useId();
  return (
    <section className={`card acc-setup-card${collapsible && !open ? " collapsed" : ""}`}>
      <header className="acc-setup-head">
        <span className="acc-setup-icon" aria-hidden="true">{icon}</span>
        <div className="acc-setup-copy">
          <h2>{title}</h2>
          {copy ? <p className="copy">{copy}</p> : null}
        </div>
        {actions ? <div className="acc-setup-actions">{actions}</div> : null}
      </header>
      {collapsible && (
        <button
          type="button"
          id={toggleId}
          className="acc-setup-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(current => !current)}
        >
          <span>{open ? `Hide ${summary}` : `Show ${summary}`}</span>
          <span className="acc-setup-chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
        </button>
      )}
      <div
        id={panelId}
        className="acc-setup-body"
        role={collapsible ? "region" : undefined}
        aria-labelledby={collapsible ? toggleId : undefined}
        hidden={collapsible && !open}
      >
        {children}
      </div>
    </section>
  );
}

function PartyFormFields({ form, setForm, typeLocked = false }) {
  const set = patch => setForm(current => ({ ...current, ...patch }));
  return (
    <div className="form acc-party-form">
      <Field required label="Type">
        <select value={form.partyType} disabled={typeLocked} onChange={event => set({ partyType: event.target.value })}>
          {PARTY_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select>
      </Field>
      <Field required label="Name"><input value={form.name} placeholder="e.g. Sai Traders" onChange={event => set({ name: event.target.value })} /></Field>
      <Field label="Phone"><input value={form.phone} placeholder="10-digit mobile" onChange={event => set({ phone: event.target.value })} /></Field>
      <Field label="Email"><input value={form.email} placeholder="optional" onChange={event => set({ email: event.target.value })} /></Field>
      <Field className="span" label="Address"><input value={form.address} placeholder="optional" onChange={event => set({ address: event.target.value })} /></Field>
      <Field label="GSTIN"><input value={form.gstin} placeholder="optional" onChange={event => set({ gstin: event.target.value, stateCode: event.target.value ? (gstStateFromGstin(event.target.value) || form.stateCode) : form.stateCode })} /></Field>
      <Field label="GST registration">
        <select value={form.gstRegistration || ""} onChange={event => set({ gstRegistration: event.target.value })}>
          <option value="">Not set</option>
          <option value="regular">Regular</option>
          <option value="composition">Composition</option>
          <option value="unregistered">Unregistered</option>
        </select>
      </Field>
      <Field label="State">
        <select value={form.stateCode || ""} onChange={event => set({ stateCode: event.target.value })}>
          <option value="">Select state</option>
          {INDIA_STATES.map(state => <option key={state.code} value={state.code}>{state.code} · {state.name}</option>)}
        </select>
      </Field>
      <Field label="Notes"><input value={form.notes} placeholder="optional" onChange={event => set({ notes: event.target.value })} /></Field>
      {typeLocked ? <p className="small acc-party-lock">Party type is locked because this party already has accounting transactions.</p> : null}
    </div>
  );
}
const AccSkeleton = () => (
  <div className="acc-skeleton" aria-hidden="true">
    {Array.from({ length: 8 }, (_, index) => <div key={index} className="acc-skel" />)}
  </div>
);
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

const NAV_STORAGE_KEY = "fintrack-accounts-nav";
const COMPANY_STORAGE_KEY = "fintrack-accounts-company";
const NAV_TREE = [
  { id: "overview", label: "Overview", glyph: "⌂" },
  { id: "vouchers", label: "Transactions", glyph: "▣" },
  {
    id: "parties",
    label: "Parties",
    glyph: "◉",
    children: [
      { id: "parties", label: "Party Ledger" },
      { id: "receivables", label: "Receivables" },
      { id: "payables", label: "Payables" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    glyph: "▦",
    children: [
      { id: "reports", label: "Day Book" },
      { id: "gst", label: "GST" },
      { id: "ledger", label: "Ledger" },
      { id: "trial", label: "Trial Balance" },
      { id: "pnl", label: "Profit & Loss" },
      { id: "balance", label: "Balance Sheet" },
    ],
  },
  { id: "bank", label: "Banking", glyph: "⬡" },
  { id: "cashbook", label: "Cashbook", glyph: "◇" },
  { id: "setup", label: "Setup", glyph: "⚙" },
];

const navItemIsActive = (item, section) => item.children?.some(child => child.id === section) || item.id === section;

function sectionTrail(section, reportTab) {
  if (section === "overview") return ["Overview"];
  if (section === "vouchers") return ["Transactions"];
  if (section === "parties") return ["Parties", "Party Ledger"];
  if (section === "receivables") return ["Parties", "Receivables"];
  if (section === "payables") return ["Parties", "Payables"];
  if (section === "ledger") return ["Reports", "Ledger"];
  if (section === "pnl") return ["Reports", "Profit & Loss"];
  if (section === "balance") return ["Reports", "Balance Sheet"];
  if (section === "trial") return ["Reports", "Trial Balance"];
  if (section === "reports") return ["Reports", REPORT_TABS.find(item => item.id === reportTab)?.label || "Day Book"];
  if (section === "bank") return ["Banking"];
  if (section === "cashbook") return ["Cashbook"];
  if (section === "setup") return ["Setup"];
  if (section === "more") return ["More"];
  return [SECTIONS.find(item => item.id === section)?.label || "Accounts"];
}

function AccSidebar({ section, expanded, onToggle, onNavigate }) {
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
          <strong>FinTrack Accounts</strong>
          <span className="small">Small-business books</span>
        </> : <strong className="acc-sidebar-mark" title="FinTrack Accounts">FT</strong>}
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
                <span className="acc-nav-glyph" aria-hidden="true">{item.glyph}</span>
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

const gstStatusLabel = company => {
  const reg = company?.gstRegistration || "unregistered";
  if (reg === "regular") return company.gstin ? `GST Regular · ${company.gstin}` : "GST Regular";
  if (reg === "composition") return "GST Composition";
  return "GST unregistered";
};

function AccCompanyBar({ companies, activeId, onSelect, onCreate, gstLabel }) {
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
          {companies.map(company => (
            <option key={company.id} value={company.id}>
              {company.name}{company.isPrimary ? " · primary" : ""}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn" onClick={onCreate}>+ Create company</button>
      {gstLabel ? <span className="small acc-company-bar-gst">{gstLabel}</span> : null}
    </div>
  );
}

function AccPageHeader({ backLabel, onBack, title, copy, trail, extras, companyBar, workspace, onSetup, onLogout }) {
  return <>
    <header className="acc-page-head">
      <div className="acc-page-head-start">
        <button type="button" className="btn" onClick={onBack}>{backLabel}</button>
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
const emptyLine = () => ({ coaId: "", debit: "", credit: "", description: "" });
const emptyBankLine = () => ({ lineDate: todayIso(), description: "", amount: "", direction: "in" });
const emptyPartyForm = () => ({ id: null, partyType: "customer", name: "", phone: "", email: "", address: "", gstin: "", stateCode: "", gstRegistration: "", notes: "" });
const emptyVoucherForm = () => ({ date: todayIso(), narration: "", partyId: "", dueDate: addDaysIso(todayIso(), 7) });
const emptySimpleForm = () => ({
  date: todayIso(),
  amount: "",
  partyId: "",
  moneyMode: "cash",
  settlement: "credit",
  expenseCode: "5000",
  fromType: "cash",
  toType: "bank",
  fromAccountId: "",
  toAccountId: "",
  dueDate: addDaysIso(todayIso(), 7),
  narration: "",
  gstRate: "18",
  hsnSac: "",
  taxInclusive: false,
});
const emptyCoaForm = () => ({
  id: null,
  code: "",
  name: "",
  groupType: "expense",
  accountType: "expense",
  openingBalance: "",
  openingSide: "debit",
  isSystem: false,
  parentId: "",
});

function ReportRangeBar({ fy, lastFy, from, to, onChange }) {
  const thisFy = from === fy.from && to === fy.to;
  const prevFy = from === lastFy.from && to === lastFy.to;
  return <div className="card accounts-filter-card">
    <div className="accounts-period-pills">
      <button type="button" className={`btn accounts-period-pill ${thisFy ? "active" : ""}`} onClick={() => onChange(fy.from, fy.to)}>This FY</button>
      <button type="button" className={`btn accounts-period-pill ${prevFy ? "active" : ""}`} onClick={() => onChange(lastFy.from, lastFy.to)}>Last FY</button>
    </div>
    <div className="accounts-custom-range">
      <label className="accounts-filter-field"><span className="small">From</span>
        <input type="date" value={from} onChange={event => onChange(event.target.value, to)} />
      </label>
      <label className="accounts-filter-field"><span className="small">To</span>
        <input type="date" value={to} onChange={event => onChange(from, event.target.value)} />
      </label>
    </div>
    <p className="small">Reports use this date range. Changing it does not rewrite posted vouchers.</p>
  </div>;
}

const SECTIONS = [
  { id: "overview", label: "Overview", group: "Books" },
  { id: "ledger", label: "Ledger", group: "Books" },
  { id: "vouchers", label: "Vouchers", group: "Books" },
  { id: "cashbook", label: "Cashbook", group: "Books" },
  { id: "receivables", label: "Receivables", group: "Parties" },
  { id: "payables", label: "Payables", group: "Parties" },
  { id: "parties", label: "Party Ledger", group: "Parties" },
  { id: "reports", label: "Reports", group: "Reports" },
  { id: "bank", label: "Bank Reconciliation", group: "Reports" },
  { id: "pnl", label: "Profit & Loss", group: "Reports" },
  { id: "balance", label: "Balance Sheet", group: "Reports" },
  { id: "trial", label: "Trial Balance", group: "Reports" },
  { id: "setup", label: "Setup", group: "Company" },
  { id: "more", label: "More", group: "Company" },
];

const REPORT_TABS = [
  { id: "daybook", label: "Day Book" },
  { id: "trial", label: "Trial Balance" },
  { id: "pnl", label: "Accounting P&L" },
  { id: "balance", label: "Balance Sheet" },
  { id: "cashflow", label: "Cash Flow" },
  { id: "receivables", label: "Receivables" },
  { id: "payables", label: "Payables" },
  { id: "sales", label: "Sales" },
  { id: "purchases", label: "Purchases" },
  { id: "gst", label: "GST" },
  { id: "ledger", label: "Ledger" },
];

const MOBILE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "vouchers", label: "Transactions" },
  { id: "parties", label: "Parties" },
  { id: "reports", label: "Reports" },
  { id: "more", label: "More" },
];

const MORE_LINKS = [
  ["ledger", "Ledger"],
  ["receivables", "Receivables"],
  ["payables", "Payables"],
  ["bank", "Bank Reconciliation"],
  ["trial", "Trial Balance"],
  ["pnl", "Profit & Loss"],
  ["balance", "Balance Sheet"],
  ["cashbook", "Cashbook"],
  ["gst", "GST"],
  ["setup", "Setup"],
];

function Modal({ title, close, children, actions }) {
  return <div className="modal-bg"><div className="modal acc-modal"><div className="row"><h2 className="title">{title}</h2><button type="button" className="btn" onClick={close}>Close</button></div>{children}{actions}</div></div>;
}

function ReasonModal({ title, label, value, onChange, onConfirm, onClose, saving, confirmLabel = "Continue" }) {
  return <Modal title={title} close={() => !saving && onClose()} actions={<div className="tabs spacer"><button type="button" className="btn primary" disabled={saving || !String(value || "").trim()} onClick={onConfirm}>{saving ? "Saving…" : confirmLabel}</button></div>}>
    <p className="copy">This is stored on the audit trail. Posted amounts are not edited.</p>
    <div className="form">
      <Field className="span" label={label}><input value={value} onChange={event => onChange(event.target.value)} autoFocus /></Field>
    </div>
  </Modal>;
}

function VoucherForm({ accounts, parties, voucherType, setVoucherType, form, setForm, lines, setLines, onSubmit, saving, maxDate }) {
  const totals = voucherTotals(lines.map(line => ({ ...line, debit: Number(line.debit || 0), credit: Number(line.credit || 0) })));
  const setLine = (index, patch) => setLines(current => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  const selectableParties = parties.filter(party => party.isActive !== false || party.id === form.partyId);
  return <>
    <div className="form">
      <Field label="Voucher type"><select value={voucherType} onChange={event => setVoucherType(event.target.value)}>{Object.values(VOUCHER_TYPES).map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></Field>
      <Field label="Date"><input type="date" max={maxDate} value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></Field>
      <Field label="Party (optional)"><select value={form.partyId} onChange={event => setForm(current => ({ ...current, partyId: event.target.value }))}><option value="">None</option>{selectableParties.map(party => <option key={party.id} value={party.id}>{party.name}{party.isActive === false ? " · inactive" : ""}</option>)}</select></Field>
      {(voucherType === "sales" || voucherType === "purchase") && <Field label="Due date (optional)"><input type="date" value={form.dueDate || ""} onChange={event => setForm(current => ({ ...current, dueDate: event.target.value }))} /></Field>}
      <Field className="span" label="Narration"><input value={form.narration} placeholder="e.g. Office rent for September" onChange={event => setForm(current => ({ ...current, narration: event.target.value }))} /></Field>
    </div>
    <div className="table spacer"><table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th></th></tr></thead><tbody>
      {lines.map((line, index) => <tr key={index}>
        <td><select value={line.coaId} onChange={event => setLine(index, { coaId: event.target.value })}><option value="">Select account</option>{accounts.filter(account => account.isActive !== false).map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></td>
        <td><input type="number" min="0" value={line.debit} onChange={event => setLine(index, { debit: event.target.value, credit: "" })} /></td>
        <td><input type="number" min="0" value={line.credit} onChange={event => setLine(index, { credit: event.target.value, debit: "" })} /></td>
        <td>{lines.length > 2 && <button type="button" className="btn" onClick={() => setLines(current => current.filter((_, i) => i !== index))}>Remove</button>}</td>
      </tr>)}
    </tbody></table></div>
    <div className="row spacer">
      <button type="button" className="btn" onClick={() => setLines(current => [...current, emptyLine()])}>Add line</button>
      <span className={totals.balanced ? "green small" : "red small"}>Debit {money(totals.debit)} · Credit {money(totals.credit)}{totals.balanced ? " · Balanced" : " · Not balanced"}</span>
    </div>
    <div className="tabs spacer"><button type="button" className="btn primary" disabled={!totals.balanced || saving} onClick={onSubmit}>{saving ? "Posting…" : "Post voucher"}</button></div>
  </>;
}

function SimpleEntryForm({ kind, accounts, parties, form, setForm, onSubmit, saving, maxDate, gstCompany, onGstSetup }) {
  const customers = parties.filter(party => party.partyType === "customer" && (party.isActive !== false || party.id === form.partyId));
  const suppliers = parties.filter(party => party.partyType === "supplier" && (party.isActive !== false || party.id === form.partyId));
  const expenseOptions = SIMPLE_EXPENSE_CODES.filter(([code]) => accounts.some(account => account.code === code) || code === "5990");
  const transferAccounts = moneyAccounts(accounts).filter(account => account.isActive !== false);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const needsParty = kind === "sale" || kind === "receipt" || kind === "credit_note" ? "customer"
    : kind === "purchase" || kind === "payment" || kind === "debit_note" ? "supplier"
    : null;
  const partyList = needsParty === "supplier" ? suppliers : customers;
  const gstKinds = kind === "sale" || kind === "purchase" || kind === "credit_note" || kind === "debit_note";
  const gstOn = gstCompany?.gstRegistration === "regular" && gstKinds;
  const selectedParty = parties.find(party => party.id === form.partyId);
  const partyState = selectedParty?.stateCode || gstStateFromGstin(selectedParty?.gstin);
  const intra = isIntraGst(gstCompany?.stateCode, partyState);
  const gstPreview = gstOn ? prepareGstAmount(form.amount, { enabled: Number(form.gstRate) > 0, rate: form.gstRate, intra, taxInclusive: form.taxInclusive, hsnSac: form.hsnSac }) : null;
  const noteCopy = kind === "credit_note"
    ? "Reduces the customer balance and sales. Original invoices stay in Day Book."
    : kind === "debit_note"
      ? "Reduces the supplier balance and purchases. Original invoices stay in Day Book."
      : "FinTrack posts the balanced voucher for you. Open + Voucher if you need a custom journal.";
  return <>
    <p className="copy">{noteCopy}</p>
    <div className="form">
      <Field label="Date"><input type="date" max={maxDate} value={form.date} onChange={event => set({ date: event.target.value })} /></Field>
      {(kind === "sale" || kind === "purchase") && <Field label="Payment"><select value={form.settlement} onChange={event => set({ settlement: event.target.value })}><option value="credit">Credit</option><option value="paid">Paid now</option></select></Field>}
      {(kind !== "transfer" && kind !== "credit_note" && kind !== "debit_note" && (kind === "expense" || kind === "receipt" || kind === "payment" || form.settlement === "paid")) && <Field label="Mode"><select value={form.moneyMode} onChange={event => set({ moneyMode: event.target.value })}>{MONEY_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select></Field>}
      {(kind === "sale" || kind === "purchase") && form.settlement === "credit" && <Field label="Due date"><input type="date" value={form.dueDate || addDaysIso(form.date, 7)} onChange={event => set({ dueDate: event.target.value })} /></Field>}
      {kind === "expense" && <Field label="Expense"><select value={form.expenseCode} onChange={event => set({ expenseCode: event.target.value })}>{expenseOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field>}
      {kind === "transfer" && <>
        <Field label="From"><select value={form.fromAccountId || ""} onChange={event => set({ fromAccountId: event.target.value })}><option value="">Select account</option>{transferAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field>
        <Field label="To"><select value={form.toAccountId || ""} onChange={event => set({ toAccountId: event.target.value })}><option value="">Select account</option>{transferAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field>
      </>}
      {needsParty && <Field label={needsParty === "supplier" ? "Supplier" : "Customer"}><select value={form.partyId} onChange={event => set({ partyId: event.target.value })}><option value="">Select</option>{partyList.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>}
      <Field required label="Amount"><input type="number" min="0" step="0.01" value={form.amount} placeholder="0.00" onChange={event => set({ amount: event.target.value })} /></Field>
      {gstKinds && gstOn && <>
        <Field label="GST rate"><select value={form.gstRate} onChange={event => set({ gstRate: event.target.value })}>{GST_RATES.map(rate => <option key={rate} value={String(rate)}>{rate}%</option>)}</select></Field>
        <Field label="Price"><select value={form.taxInclusive ? "incl" : "excl"} onChange={event => set({ taxInclusive: event.target.value === "incl" })}><option value="excl">Tax exclusive</option><option value="incl">Tax inclusive</option></select></Field>
        <Field label="HSN / SAC"><input value={form.hsnSac} placeholder="optional" onChange={event => set({ hsnSac: event.target.value })} /></Field>
        <Field label="Supply">{intra ? "Intra-state (CGST + SGST)" : partyState ? "Inter-state (IGST)" : "Set party state for CGST/SGST vs IGST"}</Field>
      </>}
      {gstKinds && !gstOn && (
        <div className="acc-gst-setup-hint span">
          <p className="copy">GST is off for {gstCompany?.name || "this company"} ({gstStatusLabel(gstCompany)}). This {kind.replaceAll("_", " ")} posts without tax until you choose Regular in Setup and save GSTIN + state.</p>
          {onGstSetup ? <button type="button" className="btn" onClick={onGstSetup}>Open GST setup</button> : null}
        </div>
      )}
      <Field className="span" label="Note (optional)"><input value={form.narration} onChange={event => set({ narration: event.target.value })} placeholder="Received from Ravi" /></Field>
    </div>
    {gstPreview && Number(form.amount) > 0 && Number(form.gstRate) > 0 && (
      <p className="small acc-gst-preview">
        Taxable {money(gstPreview.taxable)}
        {gstPreview.supplyType === "intra" ? ` · CGST ${money(gstPreview.cgst)} · SGST ${money(gstPreview.sgst)}` : ` · IGST ${money(gstPreview.igst)}`}
        {` · Total ${money(gstPreview.total)}`}
      </p>
    )}
    <div className="tabs spacer"><button type="button" className="btn primary" disabled={saving} onClick={onSubmit}>{saving ? "Saving…" : "Save"}</button></div>
  </>;
}

function CoaFormFields({ form, setForm, accounts = [] }) {
  const types = ACCOUNT_TYPES_BY_GROUP[form.groupType] || ACCOUNT_TYPES_BY_GROUP.expense;
  const parents = (accounts || []).filter(account => account.groupType === form.groupType && account.id !== form.id);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  return <div className="form">
    <Field label="Code"><input value={form.code} disabled={Boolean(form.isSystem)} onChange={event => set({ code: event.target.value })} /></Field>
    <Field label="Name"><input value={form.name} onChange={event => set({ name: event.target.value })} /></Field>
    <Field label="Group"><select value={form.groupType} disabled={Boolean(form.id)} onChange={event => {
      const groupType = event.target.value;
      const accountType = defaultAccountTypeForGroup(groupType);
      set({ groupType, accountType, openingSide: accountNormalSide(groupType), parentId: "" });
    }}>{COA_GROUPS.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></Field>
    <Field label="Type"><select value={form.accountType} disabled={Boolean(form.id)} onChange={event => set({ accountType: event.target.value })}>{types.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></Field>
    <Field label="Parent (optional)"><select value={form.parentId || ""} onChange={event => set({ parentId: event.target.value })}><option value="">None</option>{parents.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field>
    <Field label="Opening balance"><input type="number" min="0" step="0.01" value={form.openingBalance} onChange={event => set({ openingBalance: event.target.value })} /></Field>
    <Field label="Opening side"><select value={form.openingSide} onChange={event => set({ openingSide: event.target.value })}><option value="debit">Debit</option><option value="credit">Credit</option></select></Field>
  </div>;
}

export function AccountsModule({ token, close, logout, workspace = {} }) {
  const [section, setSection] = useState("overview");
  const [reportTab, setReportTab] = useState("daybook");
  const [navExpanded, setNavExpanded] = useState(() => {
    try { return sessionStorage.getItem(NAV_STORAGE_KEY) === "expanded"; } catch { return false; }
  });
  const [settings, setSettings] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [parties, setParties] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [locks, setLocks] = useState([]);
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [search, setSearch] = useState("");
  const [ledgerId, setLedgerId] = useState("");
  const fy = useMemo(() => indianFinancialYear(todayIso()), []);
  const lastFy = useMemo(() => previousIndianFinancialYear(todayIso()), []);
  const [rangeFrom, setRangeFrom] = useState(fy.from);
  const [rangeTo, setRangeTo] = useState(fy.to);
  const range = useMemo(() => ({ from: rangeFrom, to: rangeTo }), [rangeFrom, rangeTo]);
  const submitLock = useMemo(() => createSubmitLock(), []);
  const [saving, setSaving] = useState(false);
  const [showVoucher, setShowVoucher] = useState(false);
  const [showParty, setShowParty] = useState(false);
  const [showCoa, setShowCoa] = useState(false);
  const [voucherType, setVoucherType] = useState("receipt");
  const [voucherForm, setVoucherForm] = useState(emptyVoucherForm);
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [partyForm, setPartyForm] = useState(emptyPartyForm);
  const [coaForm, setCoaForm] = useState(emptyCoaForm);
  const [setupForm, setSetupForm] = useState({ companyName: "", booksStartedOn: todayIso() });
  const [lockForm, setLockForm] = useState({ from: fy.from, to: fy.to, reason: "" });
  const [bankForm, setBankForm] = useState({
    coaId: "",
    statementDate: todayIso(),
    openingBalance: "",
    closingBalance: "",
    lines: [emptyBankLine()],
  });
  const [matchChoice, setMatchChoice] = useState({});
  const [showSimple, setShowSimple] = useState(false);
  const [simpleKind, setSimpleKind] = useState("sale");
  const [simpleForm, setSimpleForm] = useState(emptySimpleForm);
  const [reasonDialog, setReasonDialog] = useState(null);
  const [reasonText, setReasonText] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [partyFocusId, setPartyFocusId] = useState("");
  const [partyTxnType, setPartyTxnType] = useState("");
  const [partyFrom, setPartyFrom] = useState(fy.from);
  const [partyTo, setPartyTo] = useState(fy.to);
  const [partyTypeFilter, setPartyTypeFilter] = useState("all");
  const [partySearch, setPartySearch] = useState("");
  const [partyDeleteDialog, setPartyDeleteDialog] = useState(null);
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [activeCompanyId, setActiveCompanyId] = useState("");
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [companyDraft, setCompanyDraft] = useState({ name: "", booksStartedOn: todayIso() });
  const [gstForm, setGstForm] = useState({ gstRegistration: "unregistered", gstin: "", legalName: "", stateCode: "" });
  const [listPage, setListPage] = useState(1);
  const [expandedVoucherId, setExpandedVoucherId] = useState(null);
  const deferredSearch = useDeferredValue(search);
  const deferredPartySearch = useDeferredValue(partySearch);
  const sectionRef = useRef(section);
  const refreshGen = useRef(0);
  sectionRef.current = section;

  const refresh = useCallback(async (preferredCompanyId) => {
    const gen = ++refreshGen.current;
    setLoading(true);
    setError("");
    try {
      let nextCompanies = [];
      try {
        nextCompanies = await loadAccountsCompanies(token);
      } catch (err) {
        if (err.code !== "MIGRATION_REQUIRED") throw err;
      }
      if (gen !== refreshGen.current) return;
      setCompanies(nextCompanies);
      let stored = preferredCompanyId || "";
      if (!stored) {
        try { stored = sessionStorage.getItem(COMPANY_STORAGE_KEY) || ""; } catch { stored = ""; }
      }
      const nextCompany = nextCompanies.find(item => item.id === stored)
        || nextCompanies.find(item => item.isPrimary)
        || nextCompanies[0]
        || null;
      if (nextCompany) {
        setActiveAccountsCompanyId(nextCompany.id);
        setActiveCompanyId(nextCompany.id);
        try { sessionStorage.setItem(COMPANY_STORAGE_KEY, nextCompany.id); } catch { /* ignore */ }
        setGstForm({
          gstRegistration: nextCompany.gstRegistration || "unregistered",
          gstin: nextCompany.gstin || "",
          legalName: nextCompany.legalName || "",
          stateCode: nextCompany.stateCode || "",
        });
      } else {
        setActiveAccountsCompanyId(null);
        setActiveCompanyId("");
      }
      const [nextSettings, nextAccounts, nextParties, nextVouchers] = await Promise.all([
        loadAccountingSettings(token),
        loadChartOfAccounts(token),
        loadParties(token),
        loadVouchers(token),
      ]);
      if (gen !== refreshGen.current) return;
      const mergedSettings = {
        ...(nextSettings || {}),
        companyName: nextCompany?.name || nextSettings?.companyName || "",
        booksStartedOn: nextCompany?.booksStartedOn || nextSettings?.booksStartedOn || "",
        fyStartMonth: nextCompany?.fyStartMonth || nextSettings?.fyStartMonth || 4,
      };
      setSettings(Object.keys(mergedSettings).length ? mergedSettings : nextSettings);
      setAccounts(nextAccounts);
      setParties(nextParties);
      setVouchers(nextVouchers);
      setMigrationRequired(false);
      if (mergedSettings.companyName || mergedSettings.booksStartedOn) {
        setSetupForm({ companyName: mergedSettings.companyName, booksStartedOn: mergedSettings.booksStartedOn || todayIso() });
      }
      if (sectionRef.current === "setup") {
        const [nextAudit, nextLocks] = await Promise.all([loadAuditLog(token), loadPeriodLocks(token)]);
        if (gen !== refreshGen.current) return;
        setAudit(nextAudit);
        setLocks(nextLocks);
      }
      if (sectionRef.current === "bank") {
        const nextStatements = await loadBankStatements(token);
        if (gen !== refreshGen.current) return;
        setStatements(nextStatements);
      }
    } catch (err) {
      if (gen !== refreshGen.current) return;
      if (err.code === "MIGRATION_REQUIRED") setMigrationRequired(true);
      else setError(err.message || "Could not load Accounts.");
    } finally {
      if (gen === refreshGen.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!token || migrationRequired) return undefined;
    if (section !== "setup" && section !== "bank") return undefined;
    let cancelled = false;
    const loadExtras = async () => {
      try {
        if (section === "setup") {
          const [nextAudit, nextLocks] = await Promise.all([loadAuditLog(token), loadPeriodLocks(token)]);
          if (!cancelled) {
            setAudit(nextAudit);
            setLocks(nextLocks);
          }
          return;
        }
        const nextStatements = await loadBankStatements(token);
        if (!cancelled) setStatements(nextStatements);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load this screen.");
      }
    };
    loadExtras();
    return () => { cancelled = true; };
  }, [section, token, activeCompanyId, migrationRequired]);

  useEffect(() => { setListPage(1); setExpandedVoucherId(null); }, [section, reportTab, deferredSearch, ledgerId, partyTypeFilter, deferredPartySearch]);

  const visibleAccounts = useMemo(
    () => standaloneVisibleAccounts(accounts, { integrationEnabled: settings?.integrationEnabled }),
    [accounts, settings],
  );
  const moreLinks = MORE_LINKS;
  const reportId = section === "pnl" || section === "balance" || section === "trial" ? section : (section === "reports" ? reportTab : "");
  const wantOverview = section === "overview";
  const wantTrial = reportId === "trial";
  const wantPnl = reportId === "pnl";
  const wantSheet = reportId === "balance";
  const wantFlow = reportId === "cashflow";
  const wantDayBook = reportId === "daybook" || reportId === "sales" || reportId === "purchases";
  const wantGst = reportId === "gst";
  const wantInvoices = section === "receivables" || section === "payables" || reportId === "receivables" || reportId === "payables";
  const wantArAp = wantOverview || wantInvoices || section === "setup";
  const wantLedger = section === "ledger";
  const wantPartyBook = section === "parties";

  useEffect(() => {
    if (ledgerId && !visibleAccounts.some(account => account.id === ledgerId) && visibleAccounts[0]) {
      setLedgerId(visibleAccounts[0].id);
    }
  }, [ledgerId, visibleAccounts]);

  const metrics = useMemo(
    () => (wantOverview ? dashboardMetrics(visibleAccounts, vouchers, parties, { today: todayIso(), ...range }) : null),
    [wantOverview, visibleAccounts, vouchers, parties, range],
  );
  const tb = useMemo(
    () => (wantTrial ? trialBalance(visibleAccounts, vouchers, range) : { rows: [], totalDebit: 0, totalCredit: 0, balanced: true }),
    [wantTrial, visibleAccounts, vouchers, range],
  );
  const pnl = useMemo(
    () => (wantPnl ? profitAndLoss(visibleAccounts, vouchers, range) : { income: [], expenses: [], totalIncome: 0, totalExpense: 0, net: 0 }),
    [wantPnl, visibleAccounts, vouchers, range],
  );
  const sheet = useMemo(
    () => (wantSheet ? balanceSheet(visibleAccounts, vouchers, range) : { assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilities: 0, totalEquity: 0, netProfit: 0, balanced: true }),
    [wantSheet, visibleAccounts, vouchers, range],
  );
  const flow = useMemo(
    () => (wantFlow ? cashFlow(visibleAccounts, vouchers, range) : { inflow: 0, outflow: 0, transfers: 0, net: 0 }),
    [wantFlow, visibleAccounts, vouchers, range],
  );
  const books = useMemo(() => (wantDayBook ? dayBook(vouchers, range) : []), [wantDayBook, vouchers, range]);
  const ar = useMemo(
    () => (wantArAp ? partyBalances(accounts, vouchers, parties, { kind: "receivable", ...range }) : []),
    [wantArAp, accounts, vouchers, parties, range],
  );
  const ap = useMemo(
    () => (wantArAp ? partyBalances(accounts, vouchers, parties, { kind: "payable", ...range }) : []),
    [wantArAp, accounts, vouchers, parties, range],
  );
  const arInvoices = useMemo(
    () => (wantInvoices && (section === "receivables" || reportId === "receivables")
      ? invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today: todayIso(), ...range, outstandingOnly })
      : []),
    [wantInvoices, section, reportId, accounts, vouchers, parties, range, outstandingOnly],
  );
  const apInvoices = useMemo(
    () => (wantInvoices && (section === "payables" || reportId === "payables")
      ? invoiceRegister(accounts, vouchers, parties, { kind: "payable", today: todayIso(), ...range, outstandingOnly })
      : []),
    [wantInvoices, section, reportId, accounts, vouchers, parties, range, outstandingOnly],
  );
  const salesRows = useMemo(() => books.filter(row => row.voucherType === "sales"), [books]);
  const purchaseRows = useMemo(() => books.filter(row => row.voucherType === "purchase"), [books]);
  const gstReport = useMemo(
    () => (wantGst ? gstBooksReport(vouchers, range) : { rows: [], output: [], input: [], byRate: [], byHsn: [], outputTax: 0, inputTax: 0, netPayable: 0 }),
    [wantGst, vouchers, range],
  );
  const activeCompany = useMemo(() => companies.find(item => item.id === activeCompanyId) || companies[0] || null, [companies, activeCompanyId]);
  const focusedParty = useMemo(() => parties.find(party => party.id === partyFocusId) || parties[0] || null, [parties, partyFocusId]);
  const setupParties = useMemo(
    () => filterParties(parties, { type: partyTypeFilter, search: deferredPartySearch }),
    [parties, partyTypeFilter, deferredPartySearch],
  );
  const partyCountByType = useMemo(() => {
    const counts = { all: parties.length };
    for (const type of PARTY_TYPES) counts[type.id] = parties.filter(party => party.partyType === type.id).length;
    return counts;
  }, [parties]);
  const outstandingByParty = useMemo(() => {
    const map = new Map();
    for (const row of ar) map.set(row.id, { kind: "receivable", balance: row.balance });
    for (const row of ap) {
      if (!map.has(row.id) || Math.abs(row.balance) > Math.abs(map.get(row.id).balance)) {
        map.set(row.id, { kind: "payable", balance: row.balance });
      }
    }
    return map;
  }, [ar, ap]);
  const partyBook = useMemo(() => (wantPartyBook ? partyLedger(accounts, vouchers, focusedParty, {
    from: partyFrom,
    to: partyTo,
    voucherType: partyTxnType || undefined,
  }) : { party: focusedParty, rows: [], opening: 0, closing: 0, outstanding: 0 }), [wantPartyBook, accounts, vouchers, focusedParty, partyFrom, partyTo, partyTxnType]);
  const ledger = useMemo(
    () => (wantLedger ? accountLedger(accounts, vouchers, ledgerId, range) : { account: null, rows: [] }),
    [wantLedger, accounts, vouchers, ledgerId, range],
  );
  const q = String(deferredSearch || "").trim().toLowerCase();
  const shownVouchers = useMemo(() => vouchers.filter(voucher => {
    if (!q) return true;
    return `${voucher.voucherNumber} ${voucher.narration} ${voucher.voucherType}`.toLowerCase().includes(q);
  }), [vouchers, q]);
  const pagedVouchers = useMemo(() => pageSlice(shownVouchers, listPage), [shownVouchers, listPage]);
  const pagedLedger = useMemo(() => pageSlice(ledger.rows, listPage), [ledger.rows, listPage]);
  const pagedBooks = useMemo(() => pageSlice(books, listPage), [books, listPage]);
  const pagedAudit = useMemo(() => pageSlice(audit, listPage), [audit, listPage]);
  const pagedArInvoices = useMemo(() => pageSlice(arInvoices, listPage), [arInvoices, listPage]);
  const pagedApInvoices = useMemo(() => pageSlice(apInvoices, listPage), [apInvoices, listPage]);
  const pagedSetupParties = useMemo(() => pageSlice(setupParties, listPage), [setupParties, listPage]);
  const pagedPartyBook = useMemo(() => pageSlice(partyBook.rows, listPage), [partyBook.rows, listPage]);
  const pagedGstOutput = useMemo(() => pageSlice(gstReport.output, listPage), [gstReport.output, listPage]);
  const bankAccounts = useMemo(() => accounts.filter(account => account.accountType === "bank" && account.isActive !== false), [accounts]);
  const matchedLineIds = useMemo(() => new Set(
    statements.flatMap(statement => statement.lines.map(line => line.matchedVoucherLineId).filter(Boolean)),
  ), [statements]);

  const setReportRange = (from, to) => {
    if (from) setRangeFrom(from);
    if (to) setRangeTo(to);
  };

  const openSection = id => {
    if (id === "cashbook") {
      close();
      window.dispatchEvent(new CustomEvent("fintrack-open-cashbook"));
      return;
    }
    if (id === "gst") {
      setSection("reports");
      setReportTab("gst");
      window.scrollTo(0, 0);
      return;
    }
    setSection(id);
    if (id === "trial") setReportTab("trial");
    if (id === "pnl") setReportTab("pnl");
    if (id === "balance") setReportTab("balance");
    if (id === "reports") setReportTab("daybook");
    window.scrollTo(0, 0);
  };

  const switchCompany = id => {
    setAccounts([]);
    setParties([]);
    setVouchers([]);
    setStatements([]);
    setAudit([]);
    setLocks([]);
    setLedgerId("");
    setMatchChoice({});
    refresh(id);
  };

  const toggleNav = () => {
    setNavExpanded(current => {
      const next = !current;
      try { sessionStorage.setItem(NAV_STORAGE_KEY, next ? "expanded" : "collapsed"); } catch { /* ignore */ }
      return next;
    });
  };

  const requestLogout = () => {
    if (!logout) return;
    setConfirmLogout(true);
  };

  const confirmAccountsLogout = async () => {
    if (!logout || signingOut) return;
    setSigningOut(true);
    try {
      sessionStorage.setItem("fintrack-login-context", "accounts");
      sessionStorage.setItem("fintrack-open-accounts", "1");
      await logout({ from: "accounts" });
    } finally {
      setSigningOut(false);
      setConfirmLogout(false);
    }
  };

  const recentVouchers = useMemo(
    () => [...vouchers].sort((a, b) => `${b.date}${b.voucherNumber}`.localeCompare(`${a.date}${a.voucherNumber}`)).slice(0, 5),
    [vouchers],
  );

  const run = async (work, success) => {
    const outcome = await submitLock.run(async () => {
      setSaving(true);
      setError("");
      setNotice("");
      try {
        await work();
        setNotice(success);
        await refresh();
      } catch (err) {
        setError(err.message || "Could not save.");
      } finally {
        setSaving(false);
      }
    });
    if (outcome.skipped) return;
  };

  const submitVoucher = () => run(async () => {
    assertVoucherDateNotFuture(voucherForm.date);
    const payload = {
      voucherType,
      date: voucherForm.date,
      dueDate: voucherForm.dueDate || null,
      narration: voucherForm.narration,
      partyId: voucherForm.partyId || null,
      lines: lines.map(line => ({
        coaId: line.coaId,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        description: voucherForm.narration,
        partyId: voucherForm.partyId || null,
      })),
    };
    assertBalancedVoucher(payload.lines);
    await postVoucher(token, payload);
    setShowVoucher(false);
    setVoucherForm(emptyVoucherForm());
    setLines([emptyLine(), emptyLine()]);
  }, "Voucher saved successfully");

  const openVoucher = () => {
    setVoucherForm(emptyVoucherForm());
    setLines([emptyLine(), emptyLine()]);
    setShowVoucher(true);
  };

  const closeVoucher = () => {
    if (saving) return;
    setShowVoucher(false);
    setVoucherForm(emptyVoucherForm());
    setLines([emptyLine(), emptyLine()]);
  };

  const openSimple = kind => {
    const money = moneyAccounts(visibleAccounts);
    setSimpleKind(kind);
    setSimpleForm({
      ...emptySimpleForm(),
      fromAccountId: money.find(account => account.accountType === "cash")?.id || money[0]?.id || "",
      toAccountId: money.find(account => account.accountType === "bank")?.id || money.find(account => account.id !== money[0]?.id)?.id || "",
    });
    setShowSimple(true);
  };

  const closeSimple = () => {
    if (saving) return;
    setShowSimple(false);
    setSimpleForm(emptySimpleForm());
  };

  const openParty = (party = null) => {
    if (party?.id) {
      setPartyForm({
        id: party.id,
        partyType: party.partyType || "customer",
        name: party.name || "",
        phone: party.phone || "",
        email: party.email || "",
        address: party.address || "",
        gstin: party.gstin || "",
        stateCode: party.stateCode || gstStateFromGstin(party.gstin),
        gstRegistration: party.gstRegistration || "",
        notes: party.notes || "",
      });
    } else {
      setPartyForm(emptyPartyForm());
    }
    setShowParty(true);
  };

  const closeParty = () => {
    if (saving) return;
    setShowParty(false);
    setPartyForm(emptyPartyForm());
  };

  const saveParty = () => {
    const message = validatePartyForm(partyForm);
    if (message) { setError(message); return; }
    const existing = partyForm.id ? parties.find(party => party.id === partyForm.id) : null;
    try {
      if (existing) assertCanChangePartyType(existing, partyForm.partyType, vouchers);
    } catch (err) {
      setError(err.message);
      return;
    }
    const createdLabel = partyForm.partyType === "customer" ? "Customer created successfully"
      : partyForm.partyType === "supplier" ? "Supplier created successfully"
      : "Party saved successfully";
    run(async () => {
      if (partyForm.id) await updateParty(token, partyForm);
      else await createParty(token, partyForm);
      setShowParty(false);
      setPartyForm(emptyPartyForm());
    }, partyForm.id ? "Party updated successfully" : createdLabel);
  };

  const requestDeleteParty = party => {
    if (!party?.id) return;
    if (partyHasAccountingUse(party.id, vouchers)) setPartyDeleteDialog({ mode: "blocked", party });
    else setPartyDeleteDialog({ mode: "confirm", party });
  };

  const confirmDeleteParty = () => {
    const party = partyDeleteDialog?.party;
    if (!party) return;
    try {
      assertCanDeleteParty(party, vouchers);
    } catch (err) {
      setPartyDeleteDialog({ mode: "blocked", party });
      setError(err.message);
      return;
    }
    run(async () => {
      await deleteParty(token, party.id);
      setPartyDeleteDialog(null);
    }, "Party deleted.");
  };

  const setPartyActiveState = (party, isActive) => {
    if (!party?.id) return;
    run(async () => {
      await setPartyActive(token, party.id, isActive);
      setPartyDeleteDialog(null);
    }, isActive ? "Party reactivated. Historical transactions are unchanged." : "Party deactivated. Historical transactions are unchanged.");
  };

  const clearPartyFilters = () => {
    setPartyTypeFilter("all");
    setPartySearch("");
  };

  const partyActions = party => (
    <div className="acc-party-actions">
      <button type="button" className="btn" disabled={saving} onClick={() => openParty(party)}>Edit</button>
      <button type="button" className="btn danger" disabled={saving} onClick={() => requestDeleteParty(party)}>Delete</button>
      {party.isActive === false && <button type="button" className="btn" disabled={saving} onClick={() => setPartyActiveState(party, true)}>Reactivate</button>}
    </div>
  );

  const submitSimple = () => run(async () => {
    const activeCompany = companies.find(item => item.id === activeCompanyId);
    const selectedParty = parties.find(party => party.id === simpleForm.partyId);
    const gstOn = activeCompany?.gstRegistration === "regular" && ["sale", "purchase", "credit_note", "debit_note"].includes(simpleKind);
    const partyState = selectedParty?.stateCode || gstStateFromGstin(selectedParty?.gstin);
    const draft = simpleEntryDraft({
      kind: simpleKind,
      accounts,
      date: simpleForm.date,
      amount: simpleForm.amount,
      partyId: simpleForm.partyId || null,
      moneyMode: simpleForm.moneyMode,
      settlement: simpleForm.settlement,
      expenseCode: simpleForm.expenseCode,
      fromType: simpleForm.fromType,
      toType: simpleForm.toType,
      fromAccountId: simpleForm.fromAccountId || null,
      toAccountId: simpleForm.toAccountId || null,
      dueDate: simpleForm.dueDate || null,
      narration: simpleForm.narration,
      gst: gstOn ? {
        enabled: Number(simpleForm.gstRate) > 0,
        rate: simpleForm.gstRate,
        intra: isIntraGst(activeCompany?.stateCode, partyState),
        taxInclusive: simpleForm.taxInclusive,
        hsnSac: simpleForm.hsnSac,
        itcEligible: simpleKind === "purchase" || simpleKind === "debit_note",
      } : undefined,
    });
    await postVoucher(token, draft);
    setShowSimple(false);
    setSimpleForm(emptySimpleForm());
  }, `${SIMPLE_ENTRY_KINDS.find(item => item.id === simpleKind)?.label || "Entry"} saved successfully`);

  const openCoa = account => {
    if (account) {
      setCoaForm({
        id: account.id,
        code: account.code,
        name: account.name,
        groupType: account.groupType,
        accountType: account.accountType,
        openingBalance: account.openingBalance ? String(account.openingBalance) : "",
        openingSide: account.openingSide || accountNormalSide(account.groupType),
        isSystem: Boolean(account.isSystem),
        parentId: account.parentId || "",
      });
    } else {
      setCoaForm(emptyCoaForm());
    }
    setShowCoa(true);
  };

  const closeCoa = () => {
    if (saving) return;
    setShowCoa(false);
    setCoaForm(emptyCoaForm());
  };

  const saveCoa = () => run(async () => {
    if (coaForm.id) await updateChartAccount(token, coaForm);
    else await createChartAccount(token, coaForm);
    setShowCoa(false);
    setCoaForm(emptyCoaForm());
  }, coaForm.id ? "Account updated." : "Account added.");

  const removeCoa = account => {
    try {
      assertCanDeleteLedger(account, vouchers);
    } catch (err) {
      setError(err.message);
      return;
    }
    if (!window.confirm(`Delete ${account.code} ${account.name}? This cannot be undone.`)) return;
    run(() => deleteChartAccount(token, account.id), "Account deleted.");
  };

  const patchBankLine = (index, patch) => setBankForm(current => ({
    ...current,
    lines: current.lines.map((row, i) => i === index ? { ...row, ...patch } : row),
  }));

  const submitBankStatement = () => run(async () => {
    const coaId = bankForm.coaId || bankAccounts[0]?.id;
    if (!coaId) throw new Error("Choose a bank account");
    const lines = bankForm.lines
      .filter(line => Number(line.amount) > 0)
      .map(line => ({
        line_date: line.lineDate,
        description: line.description,
        amount: Number(line.amount),
        direction: line.direction,
      }));
    if (!lines.length) throw new Error("Add at least one statement line with an amount");
    await addBankStatement(token, {
      coaId,
      statementDate: bankForm.statementDate,
      openingBalance: bankForm.openingBalance,
      closingBalance: bankForm.closingBalance,
      lines,
    });
    setBankForm(current => ({ ...current, lines: [emptyBankLine()], openingBalance: "", closingBalance: "" }));
  }, "Bank statement saved. Accounting balances were not changed.");

  const mobileTab = ["overview", "vouchers", "parties", "reports"].includes(section)
    ? section
    : section === "receivables" || section === "payables" ? "parties"
    : section === "pnl" || section === "balance" || section === "trial" ? "reports"
    : "more";

  const exportRows = () => {
    const active = ["receivables", "payables", "pnl", "balance", "trial"].includes(section) ? section : reportTab;
    const stamp = todayIso();
    if (active === "trial") {
      return { filename: `fintrack-trial-balance-${stamp}`, rows: [["Code", "Account", "Debit", "Credit"], ...tb.rows.map(row => [row.code, row.name, row.debit, row.credit]), ["", "Total", tb.totalDebit, tb.totalCredit]] };
    }
    if (active === "pnl") {
      return { filename: `fintrack-profit-loss-${stamp}`, rows: [["Section", "Account", "Amount"], ...pnl.income.map(row => ["Income", row.name, row.amount]), ["Income", "Total income", pnl.totalIncome], ...pnl.expenses.map(row => ["Expense", row.name, row.amount]), ["Expense", "Total expenses", pnl.totalExpense], ["", "Net profit", pnl.net]] };
    }
    if (active === "balance") {
      return { filename: `fintrack-balance-sheet-${stamp}`, rows: [["Section", "Code", "Account", "Amount"], ...sheet.assets.map(row => ["Asset", row.code, row.name, row.balance]), ...sheet.liabilities.map(row => ["Liability", row.code, row.name, row.balance]), ...sheet.equity.map(row => ["Equity", row.code, row.name, row.balance])] };
    }
    if (active === "daybook") {
      return { filename: `fintrack-day-book-${stamp}`, rows: [["Date", "Number", "Type", "Narration", "Amount"], ...books.map(row => [row.date, row.voucherNumber, row.voucherType, row.narration, row.debit])] };
    }
    if (active === "receivables") {
      return { filename: `fintrack-receivables-${stamp}`, rows: [["Customer", "Invoice", "Invoice date", "Due date", "Amount", "Paid", "Outstanding", "Days", "Status"], ...arInvoices.map(row => [row.partyName, row.reference, row.invoiceDate, row.dueDate, row.amount, row.paid, row.outstanding, row.daysOutstanding, row.status])] };
    }
    if (active === "payables") {
      return { filename: `fintrack-payables-${stamp}`, rows: [["Supplier", "Invoice", "Invoice date", "Due date", "Amount", "Paid", "Outstanding", "Status"], ...apInvoices.map(row => [row.partyName, row.reference, row.invoiceDate, row.dueDate, row.amount, row.paid, row.outstanding, row.status])] };
    }
    if (active === "sales") {
      return { filename: `fintrack-sales-${stamp}`, rows: [["Date", "Number", "Narration", "Amount"], ...salesRows.map(row => [row.date, row.voucherNumber, row.narration, row.debit])] };
    }
    if (active === "purchases") {
      return { filename: `fintrack-purchases-${stamp}`, rows: [["Date", "Number", "Narration", "Amount"], ...purchaseRows.map(row => [row.date, row.voucherNumber, row.narration, row.debit])] };
    }
    if (active === "ledger") {
      return { filename: `fintrack-ledger-${stamp}`, rows: [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])] };
    }
    if (active === "gst") {
      return {
        filename: `fintrack-gst-books-${stamp}`,
        rows: [
          ["Date", "Voucher", "Type", "HSN / SAC", "Taxable", "Rate", "CGST", "SGST", "IGST", "Direction"],
          ...gstReport.rows.map(row => [row.date, row.voucherNumber, row.voucherType, row.hsnSac || "", row.taxable, row.rate, row.cgst, row.sgst, row.igst, row.direction]),
          ["", "", "", "Output GST", "", "", "", "", gstReport.outputTax, ""],
          ["", "", "", "Eligible ITC", "", "", "", "", gstReport.inputTax, ""],
          ["", "", "", "Net GST payable", "", "", "", "", gstReport.netPayable, ""],
        ],
      };
    }
    return { filename: `fintrack-cash-flow-${stamp}`, rows: [["Metric", "Amount"], ["Inflow", flow.inflow], ["Outflow", flow.outflow], ["Internal transfers (excluded)", flow.transfers || 0], ["Net", flow.net]] };
  };

  const exportReport = format => {
    setNotice("Preparing download…");
    window.setTimeout(() => {
      try {
        const { filename, rows } = exportRows();
        const active = ["receivables", "payables", "pnl", "balance", "trial"].includes(section) ? section : reportTab;
        const title = REPORT_TABS.find(item => item.id === active)?.label || "Accounts report";
        const subtitle = `${settings?.companyName || "FinTrack"} · ${rangeFrom} to ${rangeTo}`;
        if (format === "xlsx") downloadAccountsExcel(`${filename}.xlsx`, rows);
        else if (format === "pdf") downloadAccountsPdf(`${filename}.pdf`, { title, subtitle, rows });
        else downloadAccountsCsv(`${filename}.csv`, rows);
        setNotice("");
      } catch (err) {
        setNotice("");
        setError(err.message || "Could not export.");
      }
    }, 0);
  };

  const askReason = (title, confirmLabel, onConfirm) => {
    setReasonText("");
    setReasonDialog({ title, confirmLabel, onConfirm });
  };

  const submitReason = () => {
    const reason = String(reasonText || "").trim();
    if (!reason || !reasonDialog) return;
    const work = reasonDialog.onConfirm;
    setReasonDialog(null);
    setReasonText("");
    work(reason);
  };

  const invoiceTable = (rows, kind) => {
    const emptyTitle = kind === "payable" ? "No outstanding payables" : "No outstanding receivables";
    const emptyCopy = kind === "payable"
      ? "Supplier invoices will appear here after you record a purchase."
      : "Customer invoices will appear here after you record a credit sale.";
    return <div className="table spacer acc-table-wrap accounts-invoice-table"><table><thead><tr><th>{kind === "payable" ? "Supplier" : "Customer"}</th><th>Invoice</th><th>Invoice date</th><th>Due date</th><th className="acc-num">Amount</th><th className="acc-num">Paid</th><th className="acc-num">Outstanding</th>{kind !== "payable" && <th className="acc-num">Days</th>}<th>Status</th></tr></thead><tbody>
    {rows.map(row => <tr key={row.id}><td>{row.partyName}</td><td>{row.reference}</td><td>{row.invoiceDate}</td><td>{row.dueDate}</td><td className="acc-num">{money(row.amount)}</td><td className="acc-num">{money(row.paid)}</td><td className="acc-num">{money(row.outstanding)}</td>{kind !== "payable" && <td className="acc-num">{row.daysOutstanding}</td>}<td>{row.status}</td></tr>)}
    {!rows.length && <tr><td colSpan={kind === "payable" ? 8 : 9}>{emptyTitle}. {emptyCopy}</td></tr>}
  </tbody></table></div>;
  };

  return <div className={`acc-shell${navExpanded ? " nav-expanded" : ""}`}>
    <AccSidebar section={section} expanded={navExpanded} onToggle={toggleNav} onNavigate={openSection} />
    <main className="acc-main acc-print-root">
      <AccPageHeader
        backLabel={section === "overview" ? "← Dashboard" : "← Accounts"}
        onBack={section === "overview" ? close : () => openSection("overview")}
        title={SECTIONS.find(item => item.id === section)?.label || "Accounts"}
        trail={sectionTrail(section, reportTab)}
        copy={`${activeCompany?.name || settings?.companyName || workspace.businessName || "Your business"} · ${fy.label} · ${range.from} to ${range.to}`}
        workspace={workspace}
        onSetup={() => openSection("setup")}
        onLogout={requestLogout}
        companyBar={<AccCompanyBar
          companies={companies}
          activeId={activeCompanyId}
          onSelect={switchCompany}
          onCreate={() => { setCompanyDraft({ name: "", booksStartedOn: todayIso() }); setShowCreateCompany(true); }}
          gstLabel={gstStatusLabel(activeCompany)}
        />}
        extras={<>
          <select className="acc-new-entry" defaultValue="" aria-label="New entry" onChange={event => {
            if (event.target.value) {
              openSimple(event.target.value);
              event.target.value = "";
            }
          }}>
            <option value="">+ New entry</option>
            {SIMPLE_ENTRY_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <button type="button" className="btn primary" onClick={openVoucher}>+ Voucher</button>
          <button type="button" className="btn" onClick={openParty}>+ Party</button>
        </>}
      />
      {error && <div className="notice acc-toast error" role="alert">{error}</div>}
      {notice && <div className="notice accounts-notice-ok acc-toast ok" role="status">{notice}</div>}
      {migrationRequired && <div className="notice">Run <strong>052</strong> through <strong>060_accounts_gst.sql</strong> in the Supabase SQL editor (including <strong>059_accounts_multi_company.sql</strong>), then refresh. Cashbook, Daily Finance, Monthly Finance, and Chit Fund keep working without them.</div>}
      <nav className="acc-bottom-nav" aria-label="Accounts">
        {MOBILE_TABS.map(item => (
          <button key={item.id} type="button" className={`acc-bottom-item ${mobileTab === item.id ? "active" : ""}`} onClick={() => openSection(item.id)}>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {loading ? <><p className="copy">Loading Accounts…</p><AccSkeleton /></> : <>
        {section === "overview" && <div className="acc-panel acc-overview">
          {!settings && <div className="card accounts-form-card">
            <strong>Open the books</strong>
            <p className="copy">Create a chart of accounts for this business. You do not need Daily Finance, Monthly Finance, or Chit Fund records.</p>
            <div className="form spacer">
              <Field label="Business name"><input value={setupForm.companyName} onChange={event => setSetupForm(current => ({ ...current, companyName: event.target.value }))} /></Field>
              <Field label="Books start date"><input type="date" value={setupForm.booksStartedOn} onChange={event => setSetupForm(current => ({ ...current, booksStartedOn: event.target.value }))} /></Field>
            </div>
            <button type="button" className="btn primary" disabled={saving} onClick={() => run(() => initializeAccounting(token, setupForm), "Accounts opened.")}>{saving ? "Saving…" : "Create chart of accounts"}</button>
          </div>}

          <AccCompareChart
            receivables={metrics?.receivables || 0}
            payables={metrics?.payables || 0}
            onReceivables={() => openSection("receivables")}
            onPayables={() => openSection("payables")}
          />

          <section className="acc-section">
            <h2 className="acc-section-title">Metrics</h2>
            <div className="acc-metric-grid acc-ov-metrics">
              <AccMetric label="Cash" value={money(metrics?.cash)} tone="gold" />
              <AccMetric label="Bank" value={money(metrics?.bank)} tone="gold" />
              <AccMetric label="UPI" value={money(metrics?.upi)} tone="gold" />
              <AccMetric label="Income" value={money(metrics?.income)} tone="green" onClick={() => openSection("pnl")} />
              <AccMetric label="Expenses" value={money(metrics?.expenses)} tone="red" onClick={() => openSection("pnl")} />
              <AccMetric label="Net profit" value={money(metrics?.netProfit)} tone={metrics?.netProfit < 0 ? "red" : "green"} onClick={() => openSection("pnl")} />
            </div>
          </section>

          <AccOverviewRecent rows={recentVouchers} onViewAll={() => openSection("vouchers")} />

          <div className="acc-ov-meta">
            <AccOverviewPeriod fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
            <div className="acc-status-row">
              <span className={`acc-chip ${metrics?.equationHolds ? "ok" : "warn"}`}>{metrics?.equationHolds ? "Books in balance" : "Books out of balance"}</span>
              <span className="acc-chip">Integration {settings?.integrationEnabled ? "ON" : "OFF"}</span>
            </div>
          </div>
        </div>}

        {section === "ledger" && <div className="acc-panel">
          <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
          <div className="card accounts-filter-card spacer">
            <label className="accounts-filter-field"><span className="small">Account</span>
              <select value={ledgerId} onChange={event => setLedgerId(event.target.value)}>{visibleAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select>
            </label>
            <button type="button" className="btn" onClick={() => downloadAccountsCsv(`fintrack-ledger-${todayIso()}.csv`, [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])])}>Export CSV</button>
            <button type="button" className="btn" onClick={() => downloadAccountsExcel(`fintrack-ledger-${todayIso()}.xlsx`, [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])])}>Export Excel</button>
            <button type="button" className="btn" onClick={() => downloadAccountsPdf(`fintrack-ledger-${todayIso()}.pdf`, { title: "Ledger", subtitle: `${ledger.account?.code || ""} ${ledger.account?.name || ""}`, rows: [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])] })}>Download PDF</button>
          </div>
          <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th><th className="acc-num">Balance</th></tr></thead><tbody>
            {pagedLedger.items.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{row.debit ? money(row.debit) : ""}</td><td className="acc-num">{row.credit ? money(row.credit) : ""}</td><td className="acc-num">{money(row.balance)}</td></tr>)}
            {!ledger.rows.length && <tr><td colSpan="6">No postings on this ledger yet. Post a voucher to see movement here.</td></tr>}
          </tbody></table></div>
          <AccPager page={pagedLedger.page} pages={pagedLedger.pages} total={pagedLedger.total} onPage={setListPage} noun="postings" />
        </div>}

        {section === "vouchers" && <div className="acc-panel">
          <div className="acc-quick-actions">
            {SIMPLE_ENTRY_KINDS.map(item => <button key={item.id} type="button" className="btn" onClick={() => openSimple(item.id)}>+ {item.label}</button>)}
          </div>
          <div className="accounts-action-row spacer">
            <input className="accounts-search" placeholder="Search voucher number or narration" value={search} onChange={event => setSearch(event.target.value)} />
            <button type="button" className="btn primary" onClick={openVoucher}>+ Advanced voucher</button>
          </div>
          <div className="accounts-entry-list spacer">
            {pagedVouchers.items.map(voucher => <article key={voucher.id} className="card accounts-entry-row">
              <div className="accounts-entry-main">
                <div>
                  <strong>{voucher.voucherNumber}</strong>
                  <p className="small">{voucher.date} · {VOUCHER_TYPES[voucher.voucherType]?.label} · {voucher.status}{voucher.sourceType ? ` · ${voucher.sourceModule}/${voucher.sourceType}` : ""}{voucher.status === "reversed" ? " · kept in ledgers with its reversal" : ""}</p>
                  <p className="small">{voucher.narration}</p>
                </div>
                <div className="accounts-entry-amounts">
                  <span>{money(voucherTotals(voucher.lines).debit)}</span>
                  <button type="button" className="btn" onClick={() => setExpandedVoucherId(current => current === voucher.id ? null : voucher.id)}>{expandedVoucherId === voucher.id ? "Hide lines" : "Lines"}</button>
                  {voucher.status === "posted" && <>
                    <button type="button" className="btn" disabled={saving} onClick={() => askReason("Reverse voucher", "Post reversal", reason => run(() => reverseVoucher(token, voucher.id, todayIso(), reason), "Reversal posted."))}>Reverse</button>
                    <button type="button" className="btn danger" disabled={saving} onClick={() => askReason("Cancel voucher", "Cancel voucher", reason => run(() => cancelVoucher(token, voucher.id, reason), "Voucher cancelled."))}>Cancel</button>
                  </>}
                </div>
              </div>
              {expandedVoucherId === voucher.id && <div className="table spacer"><table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>
                {voucher.lines.map(line => <tr key={line.id}><td>{line.code} {line.name}</td><td>{line.debit ? money(line.debit) : ""}</td><td>{line.credit ? money(line.credit) : ""}</td></tr>)}
              </tbody></table></div>}
            </article>)}
            {!shownVouchers.length && <AccEmpty title="No transactions yet" copy="Use a guided entry for everyday work, or an advanced voucher for a custom journal." actionLabel="+ Create transaction" onAction={() => openSimple("sale")} />}
          </div>
          <AccPager page={pagedVouchers.page} pages={pagedVouchers.pages} total={pagedVouchers.total} onPage={setListPage} noun="vouchers" />
        </div>}

        {(section === "receivables" || section === "payables") && <div className="acc-panel">
          <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
          <div className="accounts-action-row">
            <label className="accounts-filter-field"><span className="small">Outstanding only</span>
              <input type="checkbox" checked={outstandingOnly} onChange={event => setOutstandingOnly(event.target.checked)} />
            </label>
            <button type="button" className="btn" onClick={() => exportReport("csv")}>Export CSV</button>
            <button type="button" className="btn" onClick={() => exportReport("xlsx")}>Export Excel</button>
            <button type="button" className="btn" onClick={() => exportReport("pdf")}>Download PDF</button>
          </div>
          {invoiceTable(section === "receivables" ? pagedArInvoices.items : pagedApInvoices.items, section === "payables" ? "payable" : "receivable")}
          <AccPager
            page={(section === "receivables" ? pagedArInvoices : pagedApInvoices).page}
            pages={(section === "receivables" ? pagedArInvoices : pagedApInvoices).pages}
            total={(section === "receivables" ? pagedArInvoices : pagedApInvoices).total}
            onPage={setListPage}
            noun="invoices"
          />
          <p className="small spacer">Party totals: {(section === "receivables" ? ar : ap).map(row => `${row.name} ${money(row.balance)}`).join(" · ") || "none"}</p>
        </div>}

        {section === "parties" && <div className="acc-panel acc-party-ledger">
          <div className="acc-party-ledger-toolbar">
            <p className="copy">Accounting customers and suppliers are independent of Daily Finance customers and Chit Fund members.</p>
            <div className="acc-party-ledger-links">
              <button type="button" className="btn primary" onClick={openParty}>+ Party</button>
              <button type="button" className="btn" onClick={() => openSection("receivables")}>Receivables</button>
              <button type="button" className="btn" onClick={() => openSection("payables")}>Payables</button>
            </div>
          </div>
          <div className="card acc-party-ledger-filters">
            <label className="accounts-filter-field acc-party-ledger-party">
              <span className="small">Party</span>
              <select value={focusedParty?.id || ""} onChange={event => setPartyFocusId(event.target.value)}>
                <option value="">Select party</option>
                {parties.map(party => <option key={party.id} value={party.id}>{party.name} · {partyTypeLabel(party.partyType)}{party.isActive === false ? " · inactive" : ""}</option>)}
              </select>
            </label>
            <label className="accounts-filter-field"><span className="small">From</span>
              <input type="date" value={partyFrom} onChange={event => setPartyFrom(event.target.value)} />
            </label>
            <label className="accounts-filter-field"><span className="small">To</span>
              <input type="date" value={partyTo} onChange={event => setPartyTo(event.target.value)} />
            </label>
            <label className="accounts-filter-field"><span className="small">Type</span>
              <select value={partyTxnType} onChange={event => setPartyTxnType(event.target.value)}>
                <option value="">All</option>
                {Object.values(VOUCHER_TYPES).map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </label>
          </div>
          {focusedParty ? <>
            <div className="acc-party-ledger-identity">
              <div>
                <h2>{focusedParty.name}</h2>
                <div className="acc-party-card-meta">
                  <PartyTypeBadge type={focusedParty.partyType} />
                  <span className={`acc-status-pill ${focusedParty.isActive === false ? "inactive" : "active"}`}>{focusedParty.isActive === false ? "Inactive" : "Active"}</span>
                </div>
                {(focusedParty.phone || focusedParty.email) ? <p className="small acc-party-ledger-contact">{[focusedParty.phone, focusedParty.email].filter(Boolean).join(" · ")}</p> : null}
              </div>
              <div className="acc-party-ledger-stats">
                <article>
                  <span>Opening</span>
                  <strong>{money(partyBook.opening)}</strong>
                </article>
                <article>
                  <span>{partyBook.advance > 0 ? "Advance" : "Outstanding"}</span>
                  <strong className={partyBook.advance > 0 ? "ok" : partyBook.outstanding ? "due" : ""}>{money(partyBook.advance > 0 ? partyBook.advance : partyBook.outstanding)}</strong>
                </article>
              </div>
            </div>
            <div className="table acc-table-wrap acc-party-ledger-table"><table><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Narration</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th><th className="acc-num">Balance</th></tr></thead><tbody>
              {pagedPartyBook.items.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}>
                <td>{row.date}</td>
                <td><strong>{row.voucherNumber}</strong></td>
                <td><span className="acc-voucher-chip">{VOUCHER_TYPES[row.voucherType]?.label || row.voucherType}</span></td>
                <td className="acc-party-ledger-narration">{row.narration || "—"}</td>
                <td className="acc-num">{row.debit ? money(row.debit) : ""}</td>
                <td className="acc-num">{row.credit ? money(row.credit) : ""}</td>
                <td className="acc-num acc-party-ledger-balance">{money(row.balance)}</td>
              </tr>)}
              {!partyBook.rows.length && <tr><td colSpan="7">No transactions for this party in the selected dates.</td></tr>}
            </tbody></table></div>
            <AccPager page={pagedPartyBook.page} pages={pagedPartyBook.pages} total={pagedPartyBook.total} onPage={setListPage} noun="transactions" />
            <div className="acc-party-ledger-cards">
              {pagedPartyBook.items.map((row, index) => (
                <article key={`${row.voucherNumber}-${index}`} className="card acc-party-ledger-card">
                  <div className="acc-party-ledger-card-top">
                    <strong>{row.voucherNumber}</strong>
                    <span className="acc-voucher-chip">{VOUCHER_TYPES[row.voucherType]?.label || row.voucherType}</span>
                  </div>
                  <p className="small">{row.date}{row.narration ? ` · ${row.narration}` : ""}</p>
                  <p className="acc-party-ledger-card-amounts">
                    {row.debit ? <span>Debit <strong>{money(row.debit)}</strong></span> : null}
                    {row.credit ? <span>Credit <strong>{money(row.credit)}</strong></span> : null}
                    <span>Balance <strong>{money(row.balance)}</strong></span>
                  </p>
                </article>
              ))}
              {!partyBook.rows.length && <p className="copy">No transactions for this party in the selected dates.</p>}
            </div>
          </> : <AccEmpty title="No customers or suppliers yet" copy="Accounts parties are independent of Daily Finance customers and Chit Fund members." actionLabel="+ Add party" onAction={openParty} />}
        </div>}

        {section === "more" && <div className="acc-panel">
          <p className="copy">Ledger, banking, statements and setup. Day-to-day work stays on Home, Transactions, Parties and Reports.</p>
          <div className="acc-landing-grid spacer">
            {moreLinks.map(([id, title]) => (
              <button key={id} type="button" className="card acc-landing-card" onClick={() => openSection(id)}>
                <strong>{title}</strong>
              </button>
            ))}
          </div>
        </div>}

        {(section === "reports" || section === "pnl" || section === "balance" || section === "trial") && <div className="acc-panel">
          <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
          <div className="accounts-action-row spacer">
            <div className="accounts-section-nav">
            {REPORT_TABS.map(item => <button key={item.id} type="button" className={`accounts-section-tab ${(section === "pnl" ? "pnl" : section === "balance" ? "balance" : section === "trial" ? "trial" : reportTab) === item.id ? "active" : ""}`} onClick={() => {
              if (item.id === "pnl") openSection("pnl");
              else if (item.id === "balance") openSection("balance");
              else if (item.id === "trial") openSection("trial");
              else { setSection("reports"); setReportTab(item.id); }
            }}>{item.label}</button>)}
            </div>
            <button type="button" className="btn" onClick={() => exportReport("csv")}>Export CSV</button>
            <button type="button" className="btn" onClick={() => exportReport("xlsx")}>Export Excel</button>
            <button type="button" className="btn" onClick={() => exportReport("pdf")}>Download PDF</button>
          </div>
          {(section === "trial" || reportTab === "trial") && section !== "pnl" && section !== "balance" && <div className="table spacer acc-table-wrap"><table><thead><tr><th>Code</th><th>Account</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th></tr></thead><tbody>
            {tb.rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td className="acc-num">{row.debit ? money(row.debit) : ""}</td><td className="acc-num">{row.credit ? money(row.credit) : ""}</td></tr>)}
            <tr><td></td><td><strong>Total</strong></td><td className="acc-num"><strong>{money(tb.totalDebit)}</strong></td><td className="acc-num"><strong>{money(tb.totalCredit)}</strong></td></tr>
          </tbody></table></div>}
          {(section === "pnl" || reportTab === "pnl") && section !== "trial" && section !== "balance" && <div className="grid two spacer">
            <div className="card"><strong>Income</strong>{pnl.income.filter(row => row.amount).map(row => <p key={row.id} className="row spacer"><span>{row.name}</span><strong>{money(row.amount)}</strong></p>)}<p className="row"><span>Total income</span><strong className="green">{money(pnl.totalIncome)}</strong></p></div>
            <div className="card"><strong>Expenses</strong>{pnl.expenses.filter(row => row.amount).map(row => <p key={row.id} className="row spacer"><span>{row.name}</span><strong>{money(row.amount)}</strong></p>)}<p className="row"><span>Total expenses</span><strong className="red">{money(pnl.totalExpense)}</strong></p></div>
            <div className="card span"><strong>Net {pnl.net < 0 ? "loss" : "profit"}</strong><p className={`metric-value ${pnl.net < 0 ? "red" : "green"}`}>{money(pnl.net)}</p></div>
          </div>}
          {(section === "balance" || reportTab === "balance") && section !== "trial" && section !== "pnl" && <div className="grid two spacer">
            <div className="card"><strong>Assets {money(sheet.totalAssets)}</strong>{sheet.assets.map(row => <p key={row.id} className="row spacer"><span>{row.code} {row.name}</span><strong>{money(row.balance)}</strong></p>)}</div>
            <div className="card"><strong>Liabilities & equity {money(roundMoney(sheet.totalLiabilities + sheet.totalEquity))}</strong>
              {sheet.liabilities.map(row => <p key={row.id} className="row spacer"><span>{row.code} {row.name}</span><strong>{money(row.balance)}</strong></p>)}
              {sheet.equity.map(row => <p key={row.id} className="row spacer"><span>{row.code} {row.name}</span><strong>{money(row.balance)}</strong></p>)}
              <p className="small">{sheet.balanced ? "Assets equal liabilities plus equity." : "Balance sheet is out of equation."}</p>
            </div>
          </div>}
          {section === "reports" && reportTab === "daybook" && <>
            <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Number</th><th>Type</th><th>Narration</th><th className="acc-num">Amount</th></tr></thead><tbody>
            {pagedBooks.items.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.voucherType}</td><td>{row.narration}</td><td className="acc-num">{money(row.debit)}</td></tr>)}
            {!books.length && <tr><td colSpan="5">No posted vouchers in this period. Change the date range or record a transaction.</td></tr>}
          </tbody></table></div>
            <AccPager page={pagedBooks.page} pages={pagedBooks.pages} total={pagedBooks.total} onPage={setListPage} noun="vouchers" />
          </>}
          {section === "reports" && reportTab === "cashflow" && <>
            <div className="acc-metric-grid three"><AccMetric label="Inflow" value={money(flow.inflow)} tone="green" /><AccMetric label="Outflow" value={money(flow.outflow)} tone="red" /><AccMetric label="Net cash" value={money(flow.net)} tone="gold" /></div>
            <p className="small">Internal cash/bank/UPI transfers ({money(flow.transfers || 0)}) are excluded from inflow and outflow. Closing cash still follows the ledgers.</p>
          </>}
          {section === "reports" && reportTab === "receivables" && <>
            {invoiceTable(pagedArInvoices.items, "receivable")}
            <AccPager page={pagedArInvoices.page} pages={pagedArInvoices.pages} total={pagedArInvoices.total} onPage={setListPage} noun="invoices" />
          </>}
          {section === "reports" && reportTab === "payables" && <>
            {invoiceTable(pagedApInvoices.items, "payable")}
            <AccPager page={pagedApInvoices.page} pages={pagedApInvoices.pages} total={pagedApInvoices.total} onPage={setListPage} noun="invoices" />
          </>}
          {section === "reports" && reportTab === "sales" && <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Number</th><th>Narration</th><th className="acc-num">Amount</th></tr></thead><tbody>
            {salesRows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{money(row.debit)}</td></tr>)}
            {!salesRows.length && <tr><td colSpan="4">No sales vouchers in this period.</td></tr>}
          </tbody></table></div>}
          {section === "reports" && reportTab === "purchases" && <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Number</th><th>Narration</th><th className="acc-num">Amount</th></tr></thead><tbody>
            {purchaseRows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{money(row.debit)}</td></tr>)}
            {!purchaseRows.length && <tr><td colSpan="4">No purchase vouchers in this period.</td></tr>}
          </tbody></table></div>}
          {section === "reports" && reportTab === "gst" && <div className="acc-gst-reports">
            <p className="copy">GST figures are from this company’s books for the selected dates. They are not a filed GSTR-1 or GSTR-3B.</p>
            <div className="acc-metric-grid three">
              <AccMetric label="Output GST" value={money(gstReport.outputTax)} />
              <AccMetric label="Eligible ITC" value={money(gstReport.inputTax)} />
              <AccMetric label="Net GST payable" value={money(gstReport.netPayable)} tone={gstReport.netPayable > 0 ? "due" : ""} />
            </div>
            <h3 className="acc-section-title">Tax-rate summary</h3>
            <div className="table acc-table-wrap"><table><thead><tr><th>Rate</th><th className="acc-num">Taxable</th><th className="acc-num">CGST</th><th className="acc-num">SGST</th><th className="acc-num">IGST</th></tr></thead><tbody>
              {gstReport.byRate.map(row => <tr key={row.rate}><td>{row.rate}%</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.cgst)}</td><td className="acc-num">{money(row.sgst)}</td><td className="acc-num">{money(row.igst)}</td></tr>)}
              {!gstReport.byRate.length && <tr><td colSpan="5">No GST lines in this period.</td></tr>}
            </tbody></table></div>
            <h3 className="acc-section-title">HSN / SAC</h3>
            <div className="table acc-table-wrap"><table><thead><tr><th>HSN / SAC</th><th className="acc-num">Taxable</th><th className="acc-num">CGST</th><th className="acc-num">SGST</th><th className="acc-num">IGST</th></tr></thead><tbody>
              {gstReport.byHsn.map(row => <tr key={row.hsnSac}><td>{row.hsnSac}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.cgst)}</td><td className="acc-num">{money(row.sgst)}</td><td className="acc-num">{money(row.igst)}</td></tr>)}
              {!gstReport.byHsn.length && <tr><td colSpan="5">No HSN/SAC lines in this period.</td></tr>}
            </tbody></table></div>
            <h3 className="acc-section-title">Output GST</h3>
            <div className="table acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>HSN</th><th className="acc-num">Taxable</th><th className="acc-num">Tax</th></tr></thead><tbody>
              {pagedGstOutput.items.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.hsnSac || "—"}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.cgst + row.sgst + row.igst)}</td></tr>)}
              {!gstReport.output.length && <tr><td colSpan="5">No output GST in this period.</td></tr>}
            </tbody></table></div>
            <AccPager page={pagedGstOutput.page} pages={pagedGstOutput.pages} total={pagedGstOutput.total} onPage={setListPage} noun="output lines" />
            <h3 className="acc-section-title">Input GST / ITC</h3>
            <div className="table acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>HSN</th><th className="acc-num">Taxable</th><th className="acc-num">ITC</th></tr></thead><tbody>
              {gstReport.input.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.hsnSac || "—"}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.itcEligible ? row.cgst + row.sgst + row.igst : 0)}</td></tr>)}
              {!gstReport.input.length && <tr><td colSpan="5">No input GST in this period.</td></tr>}
            </tbody></table></div>
          </div>}
          {section === "reports" && reportTab === "ledger" && <>
            <div className="card accounts-filter-card spacer">
              <label className="accounts-filter-field"><span className="small">Account</span>
                <select value={ledgerId} onChange={event => setLedgerId(event.target.value)}>{visibleAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select>
              </label>
            </div>
            <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th><th className="acc-num">Balance</th></tr></thead><tbody>
              {ledger.rows.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{row.debit ? money(row.debit) : ""}</td><td className="acc-num">{row.credit ? money(row.credit) : ""}</td><td className="acc-num">{money(row.balance)}</td></tr>)}
              {!ledger.rows.length && <tr><td colSpan="6">No postings on this ledger in this period.</td></tr>}
            </tbody></table></div>
          </>}
        </div>}

        {section === "bank" && <div className="acc-panel acc-bank">
          <p className="acc-bank-note">Matching marks statement lines against posted voucher lines. It never changes cash, bank, P&amp;L, or the trial balance.</p>
          <AccSetupSection icon="B" title="Add bank statement" copy="Enter the statement totals first, then each line from the bank. Save before matching.">
            <h3 className="acc-section-title">Statement details</h3>
            <div className="acc-bank-meta">
              <Field label="Bank account"><select value={bankForm.coaId || bankAccounts[0]?.id || ""} onChange={event => setBankForm(current => ({ ...current, coaId: event.target.value }))}><option value="">Select bank</option>{bankAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field>
              <Field label="Statement date"><input type="date" value={bankForm.statementDate} onChange={event => setBankForm(current => ({ ...current, statementDate: event.target.value }))} /></Field>
              <Field label="Opening balance"><input className="acc-num-input" type="number" step="0.01" placeholder="0.00" value={bankForm.openingBalance} onChange={event => setBankForm(current => ({ ...current, openingBalance: event.target.value }))} /></Field>
              <Field label="Closing balance"><input className="acc-num-input" type="number" step="0.01" placeholder="0.00" value={bankForm.closingBalance} onChange={event => setBankForm(current => ({ ...current, closingBalance: event.target.value }))} /></Field>
            </div>
            <h3 className="acc-section-title">Statement lines</h3>
            <div className="table acc-table-wrap acc-bank-line-table"><table><thead><tr><th>Date</th><th>Description</th><th className="acc-num">Amount</th><th>In / Out</th><th></th></tr></thead><tbody>
              {bankForm.lines.map((line, index) => <tr key={index}>
                <td><input type="date" value={line.lineDate} onChange={event => patchBankLine(index, { lineDate: event.target.value })} /></td>
                <td className="acc-bank-desc"><input value={line.description} placeholder="e.g. UPI from customer" onChange={event => patchBankLine(index, { description: event.target.value })} /></td>
                <td><input className="acc-num-input" type="number" min="0" step="0.01" placeholder="0.00" value={line.amount} onChange={event => patchBankLine(index, { amount: event.target.value })} /></td>
                <td><select value={line.direction} onChange={event => patchBankLine(index, { direction: event.target.value })}><option value="in">In</option><option value="out">Out</option></select></td>
                <td>{bankForm.lines.length > 1 && <button type="button" className="btn danger" onClick={() => setBankForm(current => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>Remove</button>}</td>
              </tr>)}
            </tbody></table></div>
            <div className="acc-bank-line-cards">
              {bankForm.lines.map((line, index) => (
                <article key={index} className="card acc-bank-line-card">
                  <div className="acc-bank-meta">
                    <Field label="Date"><input type="date" value={line.lineDate} onChange={event => patchBankLine(index, { lineDate: event.target.value })} /></Field>
                    <Field label="In / Out"><select value={line.direction} onChange={event => patchBankLine(index, { direction: event.target.value })}><option value="in">Money in</option><option value="out">Money out</option></select></Field>
                    <Field className="span" label="Description"><input value={line.description} placeholder="e.g. UPI from customer" onChange={event => patchBankLine(index, { description: event.target.value })} /></Field>
                    <Field label="Amount"><input className="acc-num-input" type="number" min="0" step="0.01" placeholder="0.00" value={line.amount} onChange={event => patchBankLine(index, { amount: event.target.value })} /></Field>
                  </div>
                  {bankForm.lines.length > 1 && <button type="button" className="btn danger" onClick={() => setBankForm(current => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>Remove line</button>}
                </article>
              ))}
            </div>
            <div className="accounts-action-row acc-bank-actions">
              <button type="button" className="btn" onClick={() => setBankForm(current => ({ ...current, lines: [...current.lines, emptyBankLine()] }))}>+ Add line</button>
              <button type="button" className="btn primary" disabled={saving} onClick={submitBankStatement}>{saving ? "Saving…" : "Save statement"}</button>
            </div>
          </AccSetupSection>
          <h3 className="acc-section-title">Saved statements</h3>
          {statements.map(statement => {
            const voucherLines = bankVoucherLines(accounts, vouchers, statement.coaId).map(line => ({
              ...line,
              matched: matchedLineIds.has(line.id),
            }));
            const displayLines = defaultBankStatementLines(statement.lines, voucherLines);
            const unmatched = displayLines.filter(line => line.matchStatus !== "matched").length;
            return <article key={statement.id} className="card acc-bank-statement">
              <header className="acc-bank-statement-head">
                <div>
                  <h3>{statement.accountName}</h3>
                  <p className="small">{statement.statementDate}</p>
                </div>
                <div className="acc-bank-statement-stats">
                  <span>Opening <strong>{money(statement.openingBalance)}</strong></span>
                  <span>Closing <strong>{money(statement.closingBalance)}</strong></span>
                  <span className={`acc-status-pill ${unmatched ? "inactive" : "active"}`}>{unmatched ? `${unmatched} unmatched` : "All matched"}</span>
                </div>
              </header>
              <div className="table acc-table-wrap acc-bank-match-table"><table><thead><tr><th>Date</th><th>Description</th><th className="acc-num">Amount</th><th>Status</th><th>Match to books</th></tr></thead><tbody>
                {displayLines.map(line => {
                  const options = bankVoucherLines(accounts, vouchers, statement.coaId).filter(item => !matchedLineIds.has(item.id) || item.id === line.matchedVoucherLineId);
                  const selected = matchChoice[line.id] || line.matchedVoucherLineId || "";
                  return <tr key={line.id}>
                    <td>{line.lineDate}</td>
                    <td>{line.description || "—"}</td>
                    <td className="acc-num">{money(line.amount)} <span className={`acc-voucher-chip ${line.direction === "out" ? "out" : "in"}`}>{line.direction === "out" ? "Out" : "In"}</span></td>
                    <td><span className={`acc-status-pill ${bankMatchTone(line.matchStatus)}`}>{bankMatchLabel(line.matchStatus)}</span></td>
                    <td className="acc-bank-match-select">
                      <BankMatchControls
                        line={line}
                        selected={selected}
                        options={options}
                        saving={saving}
                        onSelect={value => setMatchChoice(current => ({ ...current, [line.id]: value }))}
                        onMatch={() => run(() => saveBankMatch(token, line.id, selected, "Matched"), "Line matched. Books unchanged.")}
                        onUnmatch={() => run(() => saveBankMatch(token, line.id, null, "Unmatched"), "Line unmatched. Books unchanged.")}
                      />
                    </td>
                  </tr>;
                })}
              </tbody></table></div>
              <div className="acc-bank-match-cards">
                {displayLines.map(line => {
                  const options = bankVoucherLines(accounts, vouchers, statement.coaId).filter(item => !matchedLineIds.has(item.id) || item.id === line.matchedVoucherLineId);
                  const selected = matchChoice[line.id] || line.matchedVoucherLineId || "";
                  return (
                    <article key={line.id} className="card acc-bank-match-card">
                      <div className="acc-bank-match-card-top">
                        <strong>{line.description || "Statement line"}</strong>
                        <span className={`acc-status-pill ${bankMatchTone(line.matchStatus)}`}>{bankMatchLabel(line.matchStatus)}</span>
                      </div>
                      <p className="small">{line.lineDate} · {money(line.amount)} · {line.direction === "out" ? "Out" : "In"}</p>
                      <div className="acc-bank-match-card-actions">
                        <BankMatchControls
                          line={line}
                          selected={selected}
                          options={options}
                          saving={saving}
                          onSelect={value => setMatchChoice(current => ({ ...current, [line.id]: value }))}
                          onMatch={() => run(() => saveBankMatch(token, line.id, selected, "Matched"), "Line matched. Books unchanged.")}
                          onUnmatch={() => run(() => saveBankMatch(token, line.id, null, "Unmatched"), "Line unmatched. Books unchanged.")}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </article>;
          })}
          {!statements.length && <AccEmpty title="No bank statements yet" copy="Add opening, closing, and statement lines above. Matching never changes the books." />}
        </div>}

        {section === "setup" && <div className="acc-panel acc-setup">
          <p className="copy acc-setup-lead">Books, chart, parties, GST, and locks for {activeCompany?.name || "this Accounts company"} only. Daily Finance, Monthly Finance, and Chit Fund stay on the Finance workspace.</p>
          <AccSetupSection icon="FY" title="Company / financial year" copy="Indian financial year is 1 April to 31 March. Saving the name here updates the current Accounts company, not Finance.">
            <div className="form spacer">
              <Field label="Business name"><input value={setupForm.companyName} onChange={event => setSetupForm(current => ({ ...current, companyName: event.target.value }))} /></Field>
              <Field label="Books start date"><input type="date" value={setupForm.booksStartedOn} onChange={event => setSetupForm(current => ({ ...current, booksStartedOn: event.target.value }))} /></Field>
            </div>
            <button type="button" className="btn primary" disabled={saving} onClick={() => run(() => saveAccountingSettings(token, { ...setupForm, fyStartMonth: 4 }), "Company details saved.")}>{saving ? "Saving…" : "Save company"}</button>
            <div className="acc-company-setup-list spacer">
              <p className="small">Each company has its own books. Switching never mixes vouchers.</p>
              {companies.map(company => (
                <button
                  key={company.id}
                  type="button"
                  className={`acc-company-setup-item${company.id === activeCompanyId ? " current" : ""}`}
                  onClick={() => company.id !== activeCompanyId && switchCompany(company.id)}
                >
                  <strong>{company.name}</strong>
                  <span className="small">{company.isPrimary ? "Primary" : "Company"}{company.id === activeCompanyId ? " · current" : ""} · {gstStatusLabel(company)}</span>
                </button>
              ))}
              <button type="button" className="btn" onClick={() => { setCompanyDraft({ name: "", booksStartedOn: todayIso() }); setShowCreateCompany(true); }}>+ Create company</button>
            </div>
          </AccSetupSection>
          <AccSetupSection icon="GST" title={`GST${activeCompany?.name ? ` · ${activeCompany.name}` : ""}`} copy="GST is per company. These settings never apply to another Accounts company or to Daily / Monthly Finance. Books reports only — not GST portal filing.">
            <div className="form spacer">
              <Field label="Registration">
                <select value={gstForm.gstRegistration} onChange={event => setGstForm(current => ({ ...current, gstRegistration: event.target.value }))}>
                  <option value="unregistered">Unregistered</option>
                  <option value="regular">Regular</option>
                  <option value="composition">Composition</option>
                </select>
              </Field>
              <Field label="GSTIN"><input value={gstForm.gstin} placeholder="e.g. 36AAAAA0000A1Z5" onChange={event => setGstForm(current => ({ ...current, gstin: event.target.value, stateCode: gstStateFromGstin(event.target.value) || current.stateCode }))} /></Field>
              <Field label="Legal name"><input value={gstForm.legalName} onChange={event => setGstForm(current => ({ ...current, legalName: event.target.value }))} /></Field>
              <Field label="State">
                <select value={gstForm.stateCode} onChange={event => setGstForm(current => ({ ...current, stateCode: event.target.value }))}>
                  <option value="">Select state</option>
                  {INDIA_STATES.map(state => <option key={state.code} value={state.code}>{state.code} · {state.name}</option>)}
                </select>
              </Field>
            </div>
            <button type="button" className="btn primary" disabled={saving} onClick={() => run(() => saveGstSettings(token, { ...gstForm, stateName: INDIA_STATES.find(state => state.code === gstForm.stateCode)?.name || "" }), "GST settings saved.")}>{saving ? "Saving…" : "Save GST"}</button>
          </AccSetupSection>
          <AccSetupSection
            icon="#"
            title="Chart of accounts"
            copy={`Opening debit and credit sides across the chart should balance. System accounts can be renamed and given openings, but not deleted.${settings?.integrationEnabled ? "" : " Daily Finance, Monthly Finance, and Chit Fund ledgers stay hidden while integration is off."}`}
            actions={<button type="button" className="btn" onClick={() => openCoa(null)}>+ Account</button>}
            collapsible
            summary={`${visibleAccounts.length} ${visibleAccounts.length === 1 ? "account" : "accounts"}`}
          >
            <div className="table spacer acc-table-wrap"><table><thead><tr><th>Code</th><th>Account</th><th>Group</th><th>Opening</th><th></th></tr></thead><tbody>
              {visibleAccounts.map(account => {
                const used = ledgerHasPostedLines(account, vouchers);
                return <tr key={account.id}>
                  <td>{account.code}</td>
                  <td style={account.parentId ? { paddingLeft: 22 } : undefined}>{account.parentId ? "↳ " : ""}{account.name}{account.isSystem ? " · system" : ""}</td>
                  <td>{account.groupType}</td>
                  <td>{account.openingBalance ? `${money(account.openingBalance)} ${account.openingSide}` : "—"}</td>
                  <td>
                    <button type="button" className="btn" disabled={saving} onClick={() => openCoa(account)}>Edit</button>
                    <button type="button" className="btn danger" disabled={saving || account.isSystem || used} onClick={() => removeCoa(account)}>{account.isSystem ? "System" : used ? "In use" : "Delete"}</button>
                  </td>
                </tr>;
              })}
            </tbody></table></div>
          </AccSetupSection>
          <AccSetupSection
            icon="P"
            title="Parties"
            copy="Customers, suppliers, employees, agents, and others used only by Accounts. They do not have to exist in Daily Finance, Monthly Finance, or Chit Fund."
            actions={<button type="button" className="btn primary" onClick={() => openParty()}>+ Add Party</button>}
            collapsible
            summary={`${parties.length} ${parties.length === 1 ? "party" : "parties"}`}
          >
            <div className="acc-party-toolbar">
              <label className="accounts-filter-field acc-party-search">
                <span className="small">Search parties</span>
                <input value={partySearch} placeholder="Name, phone, or email" onChange={event => setPartySearch(event.target.value)} />
              </label>
              <label className="accounts-filter-field acc-party-type-select">
                <span className="small">Party type</span>
                <select value={partyTypeFilter} onChange={event => setPartyTypeFilter(event.target.value)}>
                  {PARTY_TYPE_FILTERS.map(item => <option key={item.id} value={item.id}>{item.label} ({partyCountByType[item.id] || 0})</option>)}
                </select>
              </label>
              <div className="acc-party-chips" role="group" aria-label="Party type">
                {PARTY_TYPE_FILTERS.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className={`acc-filter-chip ${partyTypeFilter === item.id ? "active" : ""}`}
                    onClick={() => setPartyTypeFilter(item.id)}
                  >
                    {item.label} <span>{partyCountByType[item.id] || 0}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="small acc-party-count">
              {partySearch || partyTypeFilter !== "all"
                ? `${setupParties.length} of ${parties.length} ${parties.length === 1 ? "party" : "parties"}`
                : `${parties.length} ${parties.length === 1 ? "party" : "parties"}`}
            </p>
            {!parties.length ? (
              <AccEmpty title="No parties yet" copy="Add customers and suppliers to start managing your accounting relationships." actionLabel="+ Add Party" onAction={() => openParty()} />
            ) : !setupParties.length ? (
              <AccEmpty
                title={PARTY_TYPE_FILTERS.find(item => item.id === partyTypeFilter)?.emptyTitle || "No parties found"}
                copy={PARTY_TYPE_FILTERS.find(item => item.id === partyTypeFilter)?.emptyCopy || "Clear the filter to see all parties."}
                actionLabel="Clear filter"
                onAction={clearPartyFilters}
              />
            ) : <>
              <div className="table acc-table-wrap acc-party-table"><table><thead><tr><th>Party</th><th>Type</th><th>Contact</th><th className="acc-num">Outstanding</th><th>Status</th><th></th></tr></thead><tbody>
                {pagedSetupParties.items.map(party => {
                  const outstanding = outstandingByParty.get(party.id);
                  return <tr key={party.id}>
                    <td>
                      <strong>{party.name}</strong>
                      {party.gstin ? <span className="small acc-party-meta">{party.gstin}</span> : null}
                    </td>
                    <td><PartyTypeBadge type={party.partyType} /></td>
                    <td>
                      <span className="acc-party-contact">{party.phone || "—"}</span>
                      {party.email ? <span className="small acc-party-meta">{party.email}</span> : null}
                    </td>
                    <td className="acc-num">{outstanding?.balance ? money(outstanding.balance) : "—"}</td>
                    <td><span className={`acc-status-pill ${party.isActive === false ? "inactive" : "active"}`}>{party.isActive === false ? "Inactive" : "Active"}</span></td>
                    <td>{partyActions(party)}</td>
                  </tr>;
                })}
              </tbody></table></div>
              <div className="acc-party-cards">
                {pagedSetupParties.items.map(party => {
                  const outstanding = outstandingByParty.get(party.id);
                  return <article key={party.id} className="card acc-party-card">
                    <div className="acc-party-card-top">
                      <div>
                        <strong>{party.name}</strong>
                        <div className="acc-party-card-meta">
                          <PartyTypeBadge type={party.partyType} />
                          <span className={`acc-status-pill ${party.isActive === false ? "inactive" : "active"}`}>{party.isActive === false ? "Inactive" : "Active"}</span>
                        </div>
                      </div>
                    </div>
                    <p className="small">{party.phone || party.email || "No contact"}{party.phone && party.email ? ` · ${party.email}` : ""}</p>
                    <p className="acc-party-outstanding">Outstanding: <strong>{outstanding?.balance ? money(outstanding.balance) : "—"}</strong></p>
                    {partyActions(party)}
                  </article>;
                })}
              </div>
              <AccPager page={pagedSetupParties.page} pages={pagedSetupParties.pages} total={pagedSetupParties.total} onPage={setListPage} noun="parties" />
            </>}
          </AccSetupSection>
          <AccSetupSection
            icon="↔"
            title="Accounting integration"
            copy="Cashbook is always available from Finance. This switch only copies eligible Daily, Monthly, Chit, and Cashbook rows into the primary Accounts company. Keep it off if Accounts books belong to a different business. The same payment is never posted twice."
            actions={<span className={`acc-chip ${settings?.integrationEnabled ? "ok" : ""}`}>Status: {settings?.integrationEnabled ? "ON" : "OFF"}</span>}
          >
            <div className="accounts-action-row">
              <button type="button" className="btn" disabled={saving} onClick={() => run(() => setAccountingIntegration(token, !settings?.integrationEnabled), `Integration ${settings?.integrationEnabled ? "disabled" : "enabled"}.`)}>{settings?.integrationEnabled ? "Turn integration off" : "Turn integration on"}</button>
              {settings?.integrationEnabled && <button type="button" className="btn" disabled={saving} onClick={() => run(() => syncAccountingOperations(token), "Linked vouchers synced from operations.")}>Sync linked vouchers</button>}
            </div>
          </AccSetupSection>
          <AccSetupSection icon="L" title="Period locking" copy="Lock a closed period so posted vouchers in that range cannot be changed.">
            <div className="form spacer">
              <Field label="From"><input type="date" value={lockForm.from} onChange={event => setLockForm(current => ({ ...current, from: event.target.value }))} /></Field>
              <Field label="To"><input type="date" value={lockForm.to} onChange={event => setLockForm(current => ({ ...current, to: event.target.value }))} /></Field>
            </div>
            <button type="button" className="btn" disabled={saving} onClick={() => run(() => lockAccountingPeriod(token, lockForm.from, lockForm.to), "Period locked.")}>{saving ? "Saving…" : "Lock period"}</button>
            <div className="table spacer acc-table-wrap"><table><thead><tr><th>Period</th><th>Status</th><th></th></tr></thead><tbody>
              {locks.map(lock => <tr key={lock.id}><td>{lock.periodFrom} to {lock.periodTo}</td><td>{lock.isLocked ? "Locked" : "Reopened"}</td>              <td>{lock.isLocked && <button type="button" className="btn" disabled={saving} onClick={() => askReason("Reopen period", "Reopen", reason => run(() => reopenAccountingPeriod(token, lock.id, reason), "Period reopened."))}>Reopen</button>}</td></tr>)}
            </tbody></table></div>
          </AccSetupSection>
          <AccSetupSection
            icon="A"
            title="Audit trail"
            copy="Owner actions on books, parties, and settings. Posted amounts are not edited here."
            collapsible
            summary={`${audit.length} ${audit.length === 1 ? "event" : "events"}`}
          >
            <div className="table spacer acc-table-wrap"><table><thead><tr><th>When (IST)</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead><tbody>
              {pagedAudit.items.map(row => <tr key={row.id}><td>{formatIstDateTime(row.createdAt)}</td><td>{row.action}</td><td>{row.entityType}</td><td>{row.reason || "—"}</td></tr>)}
              {!audit.length && <tr><td colSpan="4">No accounting audit events yet.</td></tr>}
            </tbody></table></div>
            <AccPager page={pagedAudit.page} pages={pagedAudit.pages} total={pagedAudit.total} onPage={setListPage} noun="events" />
          </AccSetupSection>
        </div>}
      </>}

      {showVoucher && <Modal title="Post voucher" close={closeVoucher}>
        <p className="copy">Total debits must equal total credits. Unbalanced vouchers cannot be posted.</p>
        <VoucherForm accounts={visibleAccounts} parties={parties} voucherType={voucherType} setVoucherType={setVoucherType} form={voucherForm} setForm={setVoucherForm} lines={lines} setLines={setLines} onSubmit={submitVoucher} saving={saving} maxDate={todayIso()} />
      </Modal>}
      {showCreateCompany && <Modal title="Create company" close={() => !saving && setShowCreateCompany(false)} actions={<div className="tabs spacer"><button type="button" className="btn" disabled={saving} onClick={() => setShowCreateCompany(false)}>Cancel</button><button type="button" className="btn primary" disabled={saving || !String(companyDraft.name || "").trim()} onClick={() => run(async () => {
        const id = await createAccountsCompany(token, companyDraft);
        setShowCreateCompany(false);
        await refresh(id);
      }, "Company created. This company’s books start empty.")}>{saving ? "Saving…" : "Create company"}</button></div>}>
        <p className="copy">A new company has its own chart, parties, vouchers, bank, GST, and locks. It does not copy SriHitha Infra or any other company.</p>
        <div className="form">
          <Field required label="Company name"><input value={companyDraft.name} onChange={event => setCompanyDraft(current => ({ ...current, name: event.target.value }))} placeholder="e.g. ABC Traders" /></Field>
          <Field label="Books start date"><input type="date" value={companyDraft.booksStartedOn} onChange={event => setCompanyDraft(current => ({ ...current, booksStartedOn: event.target.value }))} /></Field>
        </div>
      </Modal>}
      {showSimple && <Modal title={SIMPLE_ENTRY_KINDS.find(item => item.id === simpleKind)?.label || "Entry"} close={closeSimple}>
        <SimpleEntryForm kind={simpleKind} accounts={visibleAccounts} parties={parties} form={simpleForm} setForm={setSimpleForm} onSubmit={submitSimple} saving={saving} maxDate={todayIso()} gstCompany={activeCompany} onGstSetup={() => { setShowSimple(false); openSection("setup"); }} />
      </Modal>}
      {showParty && <Modal title={partyForm.id ? "Edit party" : "Add party"} close={closeParty} actions={<div className="tabs spacer"><button type="button" className="btn" disabled={saving} onClick={closeParty}>Cancel</button><button type="button" className="btn primary" disabled={saving} onClick={saveParty}>{saving ? "Saving…" : partyForm.id ? "Save changes" : "Save party"}</button></div>}>
        <p className="copy">{partyForm.id ? "Updates this party only. Existing vouchers and ledgers stay attached to the same party." : "Accounts parties are independent of Daily Finance customers and Chit Fund members."}</p>
        <PartyFormFields form={partyForm} setForm={setPartyForm} typeLocked={Boolean(partyForm.id && partyHasAccountingUse(partyForm.id, vouchers))} />
      </Modal>}
      {partyDeleteDialog?.mode === "confirm" && <Modal title="Delete party?" close={() => !saving && setPartyDeleteDialog(null)} actions={<div className="tabs spacer"><button type="button" className="btn" disabled={saving} onClick={() => setPartyDeleteDialog(null)}>Cancel</button><button type="button" className="btn danger" disabled={saving} onClick={confirmDeleteParty}>{saving ? "Deleting…" : "Delete"}</button></div>}>
        <p className="copy">Are you sure you want to delete this party?</p>
        <p className="small"><strong>{partyDeleteDialog.party.name}</strong> · {partyTypeLabel(partyDeleteDialog.party.partyType)}</p>
      </Modal>}
      {partyDeleteDialog?.mode === "blocked" && <Modal title="This party cannot be deleted" close={() => !saving && setPartyDeleteDialog(null)} actions={<div className="tabs spacer">{partyDeleteDialog.party.isActive !== false && <button type="button" className="btn" disabled={saving} onClick={() => setPartyActiveState(partyDeleteDialog.party, false)}>{saving ? "Saving…" : "Deactivate instead"}</button>}<button type="button" className="btn primary" disabled={saving} onClick={() => setPartyDeleteDialog(null)}>Close</button></div>}>
        <p className="copy">This party cannot be deleted because accounting transactions already exist for this party.</p>
        <p className="small">Historical vouchers, ledgers, receivables, payables, and reports stay intact. Deactivate the party if it should no longer appear on new entries.</p>
      </Modal>}
      {showCoa && <Modal title={coaForm.id ? "Edit ledger account" : "Add ledger account"} close={closeCoa} actions={<div className="tabs spacer"><button type="button" className="btn primary" disabled={saving} onClick={saveCoa}>{saving ? "Saving…" : "Save account"}</button></div>}>
        <CoaFormFields form={coaForm} setForm={setCoaForm} accounts={visibleAccounts} />
      </Modal>}
      {reasonDialog && <ReasonModal
        title={reasonDialog.title}
        label="Reason"
        value={reasonText}
        onChange={setReasonText}
        confirmLabel={reasonDialog.confirmLabel}
        saving={saving}
        onClose={() => { setReasonDialog(null); setReasonText(""); }}
        onConfirm={submitReason}
      />}
      {confirmLogout && <Modal title="Log out of Accounts?" close={() => !signingOut && setConfirmLogout(false)} actions={<div className="tabs spacer"><button type="button" className="btn" disabled={signingOut} onClick={() => setConfirmLogout(false)}>Stay signed in</button><button type="button" className="btn danger" disabled={signingOut} onClick={confirmAccountsLogout}>{signingOut ? "Signing out…" : "Log out"}</button></div>}>
        <p className="copy">This ends your FinTrack session. You will need to sign in again to open Accounts or any other module.</p>
      </Modal>}
    </main>
  </div>;
}
