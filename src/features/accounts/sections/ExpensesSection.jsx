import { useDeferredValue, useMemo, useState } from "react";
import { CalendarDays, ChartPie, ExternalLink, Plus, ReceiptText, RotateCcw, Sparkles, Wallet } from "lucide-react";
import { ExportGroup, FilterSelect, SearchInput } from "../../../components/ui.jsx";
import { todayIso } from "../../../lib/dates.js";
import { AccMoreMenu, AccPager } from "../components/AccUi.jsx";
import { ExpenseCategoryBars, ExpenseCategoryDonut, ExpenseChange, ExpenseTrendChart } from "../components/ExpenseCharts.jsx";
import { downloadAccountsCsv, downloadAccountsExcel, downloadAccountsPdf } from "../io/accountingExport.js";
import { formatOverviewDate, money, sharePercent } from "../accountsFormat.js";
import { indianFinancialYear, roundMoney } from "../model/accountingModel.js";
import { pageSlice } from "../model/accountsList.js";
import {
  CALENDAR_MONTHS,
  EXPENSE_EXPORT_HEADER,
  EXPENSE_PRESETS,
  FY_MONTHS,
  activeExpensePreset,
  applyExpensePreset,
  defaultExpenseFilter,
  expenseExportRows,
  expenseLedgers,
  expensePeriod,
  expenseReconciliation,
  expenseStatusLabel,
  expenseSummary,
  expenseTransactions,
  expenseTrend,
  expenseTrendInsight,
  filterExpenseRows,
  fyLabel,
  possibleRepeatExpenses,
} from "../model/expenseDashboard.js";
import { buildExpenseComparisons } from "../../intelligence/ai/expenseIntelligence.js";
import "../expenses.css";

const SORTS = [
  { id: "date_desc", label: "Newest first" },
  { id: "date_asc", label: "Oldest first" },
  { id: "amount_desc", label: "Highest amount" },
  { id: "amount_asc", label: "Lowest amount" },
];
const shortDay = iso => formatOverviewDate(iso).replace(/ \d{4}$/, "");

function SummaryCard({ icon: Icon, tone, label, value, children }) {
  return <article className={`card acc-exp-stat tone-${tone}`}>
    <span className="acc-exp-stat-icon" aria-hidden="true"><Icon size={18} /></span>
    <span className="acc-exp-stat-label">{label}</span>
    <strong className="acc-exp-stat-value">{value}</strong>
    <div className="acc-exp-stat-foot">{children}</div>
  </article>;
}

/**
 * Accounts → Expenses: a view over the expense ledgers for a period. Nothing is stored here; entries are added and
 * changed through the usual vouchers, and every figure comes from posted (or reversed) vouchers.
 */
export function ExpensesSection({
  accounts,
  vouchers,
  parties,
  booksStartedOn = "",
  companyName = "",
  canWrite = false,
  aiEnabled = false,
  onAddExpense,
  onOpenVoucher,
  onOpenPnl,
  onOpenAiReview,
}) {
  const today = todayIso();
  const [filter, setFilterState] = useState(() => defaultExpenseFilter(today));
  const [categoryId, setCategoryState] = useState("");
  const [ledgerId, setLedgerState] = useState("");
  const [paidFrom, setPaidFromState] = useState("");
  const [search, setSearchState] = useState("");
  const [sort, setSortState] = useState("date_desc");
  const [page, setPage] = useState(1);
  const [aggregation, setAggregation] = useState("month");
  const [compare, setCompare] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const paged = setter => value => { setter(value); setPage(1); };
  const setFilter = paged(setFilterState);
  const setPaidFrom = paged(setPaidFromState);
  const setSearch = paged(setSearchState);
  const setSort = paged(setSortState);
  const setCategory = id => { setCategoryState(id); setLedgerState(""); setPage(1); };

  const rows = useMemo(() => expenseTransactions({ accounts, vouchers, parties }), [accounts, vouchers, parties]);
  const period = useMemo(() => expensePeriod(filter, today), [filter, today]);
  const summary = useMemo(
    () => expenseSummary({ rows, period, today, categoryId, ledgerId, booksStartedOn }),
    [rows, period, today, categoryId, ledgerId, booksStartedOn],
  );
  const trend = useMemo(
    () => expenseTrend({ rows, period, aggregation, today, categoryId, ledgerId }),
    [rows, period, aggregation, today, categoryId, ledgerId],
  );
  const insight = useMemo(() => expenseTrendInsight(trend, aggregation), [trend, aggregation]);
  const check = useMemo(() => expenseReconciliation({ accounts, vouchers, period }), [accounts, vouchers, period]);
  const tableRows = useMemo(
    () => filterExpenseRows(summary.current, { search: deferredSearch, paidFrom, sort }),
    [summary.current, deferredSearch, paidFrom, sort], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const pageRows = pageSlice(tableRows, page);
  const tableTotal = roundMoney(tableRows.reduce((sum, row) => sum + row.amount, 0));
  const periodTotal = roundMoney(summary.categories.reduce((sum, row) => sum + row.amount, 0));
  const onCredit = roundMoney(summary.current.filter(row => row.paidKind === "credit").reduce((sum, row) => sum + row.amount, 0));
  const repeats = useMemo(() => possibleRepeatExpenses(summary.current), [summary.current]); // eslint-disable-line react-hooks/exhaustive-deps

  const ledgerOptions = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      if (period.error || row.date < period.from || row.date > period.to) continue;
      if (categoryId && row.categoryId !== categoryId) continue;
      if (!map.has(row.ledgerId)) map.set(row.ledgerId, { id: row.ledgerId, name: row.ledgerName, categoryId: row.categoryId });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, period, categoryId]);
  const paidFromOptions = useMemo(() => [...new Set(summary.current.map(row => row.paidFrom))].sort(), [summary.current]); // eslint-disable-line react-hooks/exhaustive-deps

  const thisFy = indianFinancialYear(today).startYear;
  const firstYear = useMemo(() => {
    const dates = [booksStartedOn, ...rows.map(row => row.date)].filter(Boolean).sort();
    return dates[0] ? indianFinancialYear(dates[0]).startYear : thisFy - 1;
  }, [rows, booksStartedOn, thisFy]);
  const fyOptions = [];
  for (let year = thisFy; year >= Math.min(firstYear, thisFy - 1, filter.fyStart); year -= 1) fyOptions.push(year);
  const calendarYears = [];
  for (let year = Number(today.slice(0, 4)); year >= Math.min(firstYear, Number(today.slice(0, 4)) - 1, filter.year); year -= 1) calendarYears.push(year);

  const aiInsights = useMemo(() => {
    if (!aiEnabled) return [];
    const { ledgers } = expenseLedgers(accounts);
    return buildExpenseComparisons({ accounts, vouchers, asOf: today }).insights
      .filter(item => item.source?.ledgerId && !ledgers.get(item.source.ledgerId)?.stockPurchase)
      .slice(0, 3);
  }, [aiEnabled, accounts, vouchers, today]);
  const rise = useMemo(() => {
    if (!summary.canCompare || categoryId) return null;
    const grown = summary.categories.filter(row => row.previous > 0 && row.amount - row.previous >= 1000 && row.change >= 10);
    return grown.sort((a, b) => (b.amount - b.previous) - (a.amount - a.previous))[0] || null;
  }, [summary, categoryId]);

  const preset = activeExpensePreset(filter, today);
  const selectedCategory = summary.categories.find(row => row.id === categoryId);
  const defaults = defaultExpenseFilter(today);
  const filtered = categoryId || ledgerId || paidFrom || search || filter.mode !== defaults.mode || filter.fyStart !== defaults.fyStart || Boolean(filter.month);
  const reset = () => {
    setFilterState(defaults);
    setCategoryState("");
    setLedgerState("");
    setPaidFromState("");
    setSearchState("");
    setSortState("date_desc");
    setPage(1);
  };
  const pickMonth = period.chart?.kind === "custom" ? null : row => {
    const month = Number(row.from.slice(5, 7));
    const same = period.single && period.from === row.from;
    if (period.chart.kind === "calendar") setFilter({ ...filter, mode: "calendar", year: period.chart.year, month: same ? 0 : month });
    else setFilter({ ...filter, mode: "fy", fyStart: period.chart.startYear, month: same ? 0 : month });
  };
  const chartScope = period.error ? "" : period.chart.kind === "fy"
    ? fyLabel(period.chart.startYear)
    : period.chart.kind === "calendar" ? `calendar year ${period.chart.year}` : "the selected dates";
  const scopeName = selectedCategory ? ` · ${selectedCategory.name}` : "";
  const previousName = period.previous?.label || "the period before";

  const exportName = ext => `fintrack-expenses-${period.from || today}-to-${period.to || today}.${ext}`;
  const exportRows = () => [EXPENSE_EXPORT_HEADER, ...expenseExportRows(tableRows), ["", "", "", "", "", "", "", "Total", tableTotal]];
  const exports = [
    { id: "csv", label: "CSV", disabled: !tableRows.length, onClick: () => downloadAccountsCsv(exportName("csv"), exportRows()) },
    { id: "xlsx", label: "Excel", disabled: !tableRows.length, onClick: () => downloadAccountsExcel(exportName("xlsx"), exportRows()) },
    { id: "pdf", label: "PDF", disabled: !tableRows.length, onClick: () => downloadAccountsPdf(exportName("pdf"), { title: "Expenses", subtitle: `${companyName ? `${companyName} · ` : ""}${period.label}${scopeName}`, rows: exportRows() }) },
  ];

  const hasInsights = Boolean(rise || repeats.length || aiInsights.length);

  return <div className="acc-panel acc-exp">
    <section className="card acc-exp-hero" aria-label="Expenses">
      <div className="acc-exp-hero-top">
        <div>
          <h1 className="acc-exp-title">Expenses</h1>
          <p className="acc-exp-subtitle">Track, analyze, and manage your business spending.</p>
        </div>
        <div className="acc-exp-hero-actions">
          <ExportGroup className="acc-hide-mobile" formats={exports} />
          <AccMoreMenu className="acc-show-mobile" label="Export" items={exports.map(item => ({ ...item, label: `Export ${item.label}` }))} />
          {canWrite && onAddExpense && <button type="button" className="btn primary" onClick={onAddExpense}><Plus size={16} aria-hidden="true" /> Add expense</button>}
        </div>
      </div>

      <div className="acc-exp-presets" role="group" aria-label="Period">
        {EXPENSE_PRESETS.map(item => <button
          key={item.id}
          type="button"
          className={`acc-exp-preset${preset === item.id ? " is-active" : ""}`}
          aria-pressed={preset === item.id}
          onClick={() => setFilter(applyExpensePreset(filter, item.id, today))}
        >{item.label}</button>)}
      </div>

      <div className="acc-exp-period-row">
        {filter.mode === "fy" && <>
          <FilterSelect label="Year" value={String(filter.fyStart)} allValue="" onChange={value => setFilter({ ...filter, fyStart: Number(value) })}>
            {fyOptions.map(year => <option key={year} value={String(year)}>{fyLabel(year)}</option>)}
          </FilterSelect>
          <FilterSelect label="Month" value={String(filter.month || 0)} allValue="0" onChange={value => setFilter({ ...filter, month: Number(value) })}>
            <option value="0">All months</option>
            {FY_MONTHS.map(month => <option key={month.id} value={String(month.id)}>{month.label}</option>)}
          </FilterSelect>
        </>}
        {filter.mode === "calendar" && <>
          <FilterSelect label="Year" value={String(filter.year)} allValue="" onChange={value => setFilter({ ...filter, year: Number(value) })}>
            {calendarYears.map(year => <option key={year} value={String(year)}>{year}</option>)}
          </FilterSelect>
          <FilterSelect label="Month" value={String(filter.month || 0)} allValue="0" onChange={value => setFilter({ ...filter, month: Number(value) })}>
            <option value="0">All months</option>
            {CALENDAR_MONTHS.map(month => <option key={month.id} value={String(month.id)}>{month.label}</option>)}
          </FilterSelect>
        </>}
        {filter.mode === "custom" && <div className="acc-exp-custom">
          <label><span>From</span><input type="date" value={filter.from} max={filter.to || undefined} onChange={event => setFilter({ ...filter, from: event.target.value })} /></label>
          <label><span>To</span><input type="date" value={filter.to} min={filter.from || undefined} onChange={event => setFilter({ ...filter, to: event.target.value })} /></label>
        </div>}
        <FilterSelect label="Category" value={categoryId} allValue="" onChange={setCategory}>
          <option value="">All categories</option>
          {summary.categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          {categoryId && !selectedCategory && <option value={categoryId}>Selected category</option>}
        </FilterSelect>
        {filtered && <button type="button" className="acc-exp-reset" onClick={reset}><RotateCcw size={14} aria-hidden="true" /> Reset filters</button>}
      </div>

      {period.error
        ? <p className="acc-exp-error" role="alert">{period.error}</p>
        : <p className="acc-exp-range" aria-live="polite">
          <CalendarDays size={15} aria-hidden="true" />
          <strong>{period.label}</strong>
          <span>{formatOverviewDate(period.from)} – {formatOverviewDate(period.to)}</span>
          {selectedCategory && <button type="button" className="acc-exp-chip" onClick={() => setCategory("")} aria-label={`Clear ${selectedCategory.name}`}>{selectedCategory.name} <span aria-hidden="true">×</span></button>}
        </p>}
    </section>

    {!period.error && <>
      <section className="acc-exp-stats" aria-label="Expense summary">
        <SummaryCard icon={Wallet} tone="blue" label={selectedCategory ? `${selectedCategory.name} expenses` : "Total expenses"} value={money(summary.total)}>
          {summary.change != null ? <ExpenseChange change={summary.change} against={previousName} /> : <span className="small">No earlier period to compare</span>}
          {onCredit > 0 && <span className="small">{money(onCredit)} booked on credit, not yet paid</span>}
        </SummaryCard>
        <SummaryCard icon={CalendarDays} tone="violet" label={summary.average.unit === "day" ? "Average per day" : "Average per month"} value={money(summary.average.value)}>
          <span className="small">{summary.average.count
            ? `Over ${summary.average.count} ${summary.average.unit === "day" ? (summary.average.count === 1 ? "day" : "days") : (summary.average.count === 1 ? "month" : "months")}${period.to > today ? " so far" : ""}`
            : "This period has not started"}</span>
          {summary.average.change != null && <ExpenseChange change={summary.average.change} against={previousName} />}
        </SummaryCard>
        <SummaryCard icon={ChartPie} tone="amber" label={selectedCategory ? `Top ledger in ${selectedCategory.name}` : "Top category"} value={summary.top ? summary.top.name : "—"}>
          <span className="small">{summary.top ? `${money(summary.top.amount)} · ${sharePercent(summary.top.share)} of expenses` : "No expenses in this period"}</span>
        </SummaryCard>
        <SummaryCard icon={ReceiptText} tone="teal" label="Transactions" value={String(summary.count)}>
          <span className="small">Vouchers with an expense</span>
          {summary.countChange != null && <ExpenseChange change={summary.countChange} against={previousName} />}
        </SummaryCard>
      </section>

      {check && <p className={`acc-exp-check${Math.abs(check.operating - periodTotal) > 0.01 ? " is-off" : ""}`}>
        {Math.abs(check.operating - periodTotal) > 0.01
          ? <>These totals differ from Profit &amp; Loss for {period.label}. Open the P&amp;L to review the expense ledgers.</>
          : check.purchases > 0
            ? <>Matches Profit &amp; Loss: expense ledgers {money(check.ledgerTotal)} less stock purchases {money(check.purchases)} (counted in cost of goods sold) = {money(check.operating)}.</>
            : <>Matches the expense ledgers in Profit &amp; Loss for {period.label}: {money(check.operating)}.</>}
        {onOpenPnl && <button type="button" className="acc-exp-link" onClick={onOpenPnl}>Open P&amp;L</button>}
      </p>}

      <div className="acc-exp-grid">
        <ExpenseTrendChart
          rows={trend}
          aggregation={aggregation}
          onAggregation={setAggregation}
          compare={compare}
          onCompare={setCompare}
          scopeLabel={`${chartScope}${scopeName}`}
          insight={insight}
          onPick={pickMonth}
        />
        <ExpenseCategoryDonut categories={summary.categories} total={periodTotal} selectedId={categoryId} onSelect={setCategory} />
        <ExpenseCategoryBars categories={summary.categories} canCompare={summary.canCompare} previousLabel={previousName} selectedId={categoryId} onSelect={setCategory} />
        {hasInsights && <section className="card acc-exp-card acc-exp-insights" aria-label="Expense insights">
          <header className="acc-exp-card-head"><div><h2>Expense Insights</h2><p className="small">From this company’s posted vouchers. Nothing here changes an entry.</p></div></header>
          <ul className="acc-exp-insight-list">
            {rise && <li>
              <span className="acc-exp-tag is-fact">Observed</span>
              <p><strong>{rise.name}</strong> rose by {money(rise.amount - rise.previous)} ({Math.round(rise.change)}%) against {previousName}: {money(rise.amount)} from {money(rise.previous)}.</p>
              <button type="button" className="acc-exp-link" onClick={() => setCategory(rise.id)}>Show {rise.name}</button>
            </li>}
            {repeats.map(item => <li key={item.rows.map(row => row.id).join("|")}>
              <span className="acc-exp-tag is-review">Check</span>
              <p>Two {item.ledgerName} entries of {money(item.amount)}{item.partyName ? ` to ${item.partyName}` : ""} on {shortDay(item.rows[0].date)} and {shortDay(item.rows[1].date)}. They may be separate bills; open them to make sure one was not entered twice.</p>
              <span className="acc-exp-insight-actions">{item.rows.map(row => <button key={row.id} type="button" className="acc-exp-link" onClick={() => onOpenVoucher(row.voucherNumber)}>{row.voucherNumber}</button>)}</span>
            </li>)}
            {aiInsights.map(item => <li key={item.id}>
              <span className="acc-exp-tag is-ai"><Sparkles size={12} aria-hidden="true" /> AI suggestion</span>
              <p><strong>{item.title}</strong> {item.explanation}</p>
              <span className="acc-exp-insight-actions">
                <button type="button" className="acc-exp-link" onClick={() => {
                  const ledger = rows.find(row => row.ledgerId === item.source.ledgerId);
                  setFilterState({ ...filter, mode: "this_month" });
                  setCategoryState(ledger?.categoryId || "");
                  setLedgerState(ledger && ledger.categoryId !== ledger.ledgerId ? ledger.ledgerId : "");
                  setPage(1);
                }}>Show this month</button>
                {onOpenAiReview && <button type="button" className="acc-exp-link" onClick={onOpenAiReview}>AI Review <ExternalLink size={12} aria-hidden="true" /></button>}
              </span>
            </li>)}
          </ul>
        </section>}
      </div>

      <section className="card acc-exp-card acc-exp-table-card" aria-label="Expense transactions">
        <header className="acc-exp-card-head">
          <div>
            <h2>Expense Transactions</h2>
            <p className="small">{tableRows.length} {tableRows.length === 1 ? "entry" : "entries"} · {money(tableTotal)}{tableRows.length !== summary.current.length ? ` of ${money(summary.total)}` : ""} · open an entry to see or change its voucher</p>
          </div>
        </header>
        <div className="acc-exp-toolbar">
          <SearchInput label="Search expenses" className="acc-exp-search" placeholder="Search expenses, parties, or vouchers…" value={search} onChange={event => setSearch(event.target.value)} />
          {ledgerOptions.length > 1 && <FilterSelect label="Ledger" value={ledgerId} allValue="" onChange={value => {
            const ledger = ledgerOptions.find(row => row.id === value);
            setLedgerState(value);
            if (ledger && !categoryId) setCategoryState(ledger.categoryId);
            setPage(1);
          }}>
            <option value="">All ledgers</option>
            {ledgerOptions.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </FilterSelect>}
          <FilterSelect label="Paid from" value={paidFrom} allValue="" onChange={setPaidFrom}>
            <option value="">Any account</option>
            {paidFromOptions.map(name => <option key={name} value={name}>{name}</option>)}
          </FilterSelect>
          <FilterSelect label="Sort" value={sort} allValue="date_desc" onChange={setSort}>
            {SORTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </FilterSelect>
        </div>

        {tableRows.length ? <>
          <div className="table acc-table-wrap acc-exp-table"><table>
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Paid to</th><th>Voucher</th><th>Paid from</th><th>Status</th><th className="acc-num">Amount</th></tr></thead>
            <tbody>
              {pageRows.items.map(row => <tr key={row.id}>
                <td>{formatOverviewDate(row.date)}</td>
                <td><span className="acc-exp-cat">{row.categoryName}</span>{row.ledgerName !== row.categoryName && <span className="small acc-exp-ledger">{row.ledgerName}</span>}</td>
                <td className="acc-exp-desc">{row.description || "—"}</td>
                <td>{row.partyName || "—"}</td>
                <td><button type="button" className="acc-exp-voucher" onClick={() => onOpenVoucher(row.voucherNumber)}>{row.voucherNumber}</button></td>
                <td><span className={`acc-exp-paid is-${row.paidKind}`}>{row.paidFrom}</span></td>
                <td>{row.status === "posted" ? <span className="small">Posted</span> : <span className="acc-exp-status">{expenseStatusLabel(row.status)}</span>}</td>
                <td className={`acc-num${row.amount < 0 ? " acc-exp-negative" : ""}`}>{money(row.amount)}</td>
              </tr>)}
            </tbody>
            <tfoot><tr><td colSpan="7">Total of {tableRows.length} {tableRows.length === 1 ? "entry" : "entries"}</td><td className="acc-num">{money(tableTotal)}</td></tr></tfoot>
          </table></div>
          <ul className="acc-exp-cards">
            {pageRows.items.map(row => <li key={row.id}>
              <button type="button" className="acc-exp-row-card" onClick={() => onOpenVoucher(row.voucherNumber)}>
                <span className="acc-exp-row-top">
                  <strong>{row.description || row.ledgerName}</strong>
                  <span className={`amount${row.amount < 0 ? " acc-exp-negative" : ""}`}>{money(row.amount)}</span>
                </span>
                <span className="acc-exp-row-meta">
                  <span className="acc-exp-cat">{row.categoryName}</span>
                  {row.partyName && <span>{row.partyName}</span>}
                </span>
                <span className="acc-exp-row-meta small">
                  <span>{formatOverviewDate(row.date)}</span>
                  <span>{row.voucherNumber}</span>
                  <span className={`acc-exp-paid is-${row.paidKind}`}>{row.paidFrom}</span>
                  {row.status !== "posted" && <span className="acc-exp-status">{expenseStatusLabel(row.status)}</span>}
                </span>
              </button>
            </li>)}
            <li className="acc-exp-cards-total"><span>Total of {tableRows.length} {tableRows.length === 1 ? "entry" : "entries"}</span><strong>{money(tableTotal)}</strong></li>
          </ul>
          <AccPager page={pageRows.page} pages={pageRows.pages} total={pageRows.total} onPage={setPage} noun="entries" />
        </> : <div className="acc-exp-empty-block">
          <strong>{rows.length ? "No expenses match these filters" : "No expenses recorded yet"}</strong>
          <p className="small">{rows.length
            ? "Try another period or category, or clear the search."
            : "Expenses appear here once a voucher posts to an expense ledger, such as Rent or Salary."}</p>
          {rows.length ? filtered && <button type="button" className="btn" onClick={reset}>Reset filters</button>
            : canWrite && onAddExpense && <button type="button" className="btn primary" onClick={onAddExpense}><Plus size={16} aria-hidden="true" /> Add expense</button>}
        </div>}
      </section>
    </>}
  </div>;
}
