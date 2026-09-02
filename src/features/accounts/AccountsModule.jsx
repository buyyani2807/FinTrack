import { useCallback, useEffect, useMemo, useState } from "react";
import {
  backfillCashbook,
  createBankAccount,
  deleteManualEntry,
  initializeAccounts,
  loadCashbookEntries,
  loadDayClosings,
  loadLedgerAccounts,
  recordDayClosing,
  recordExpense,
  recordManualEntry,
  recordTransfer,
} from "./accountsRepository.js";
import {
  CASHBOOK_SOURCE_FILTERS,
  EXPENSE_CATEGORIES,
  MANUAL_IN_CATEGORIES,
  MANUAL_OUT_CATEGORIES,
  aggregateOverview,
  dateRangeForFilter,
  filterCashbookEntries,
  runningBalancesForLedger,
  sourceOriginLabel,
  todayIso,
  withRunningBalances,
} from "./cashbookModel.js";
import { formatInr } from "../../lib/formatMoney.js";

const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;
const money = formatInr;

const SECTIONS = [
  { id: "cashbook", label: "Cashbook" },
  { id: "expenses", label: "Expenses" },
  { id: "bank", label: "Bank / UPI" },
  { id: "transfers", label: "Transfers" },
  { id: "closing", label: "Day Closing" },
  { id: "reports", label: "Reports" },
];
const PERIOD_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];

function PeriodPills({ period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo }) {
  return <div className="accounts-period-bar">
    <div className="accounts-period-pills">
      {PERIOD_OPTIONS.map(item => (
        <button
          key={item.id}
          type="button"
          className={`btn tab accounts-period-pill ${period === item.id ? "active" : ""}`}
          onClick={() => setPeriod(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
    {period === "custom" && <div className="accounts-custom-range">
      <input type="date" aria-label="From date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} />
      <span className="small">to</span>
      <input type="date" aria-label="To date" value={customTo} onChange={event => setCustomTo(event.target.value)} />
    </div>}
  </div>;
}

const PERIOD_IN_OUT_LABEL = {
  today: "Today",
  week: "This week",
  month: "This month",
  custom: "Selected dates",
};

function CashbookOverview({ balances, movement, period }) {
  const when = PERIOD_IN_OUT_LABEL[period] || "Period";
  return <>
    <div className="accounts-balance-strip">
      <div className="accounts-balance-item"><span>Cash on hand</span><strong className="gold">{money(balances.cash)}</strong></div>
      <div className="accounts-balance-item"><span>Bank balance</span><strong>{money(balances.bank)}</strong></div>
      <div className="accounts-balance-item"><span>UPI balance</span><strong>{money(balances.upi)}</strong></div>
      <div className="accounts-balance-item"><span>All money</span><strong className="gold">{money(balances.total)}</strong></div>
      <div className="accounts-balance-item accounts-balance-move"><span>{when} in</span><strong className="green">{money(movement.moneyIn)}</strong></div>
      <div className="accounts-balance-item accounts-balance-move"><span>{when} out</span><strong className="red">{money(movement.moneyOut)}</strong></div>
    </div>
    <p className="small accounts-balance-hint">Cash, Bank and UPI are running balances of every recorded transaction, not only today. Collection received by UPI increases UPI, not Cash. Money paid to customers is recorded as money out on the payout method you chose.</p>
  </>;
}

function PanelHead({ title, children }) {
  return <div className="accounts-panel-head spacer"><div><h2 className="accounts-panel-title">{title}</h2></div>{children}</div>;
}

function EmptyState({ children }) {
  return <div className="card accounts-empty">{children}</div>;
}

const emptyManualForm = () => ({
  direction: "in", ledgerAccountId: "", date: todayIso(), category: MANUAL_IN_CATEGORIES[0],
  description: "", amount: "", reference: "", notes: "",
});
const emptyExpenseForm = () => ({
  ledgerAccountId: "", date: todayIso(), category: EXPENSE_CATEGORIES[0],
  description: "", amount: "", notes: "", reference: "",
});
const emptyTransferForm = () => ({
  fromLedgerId: "", toLedgerId: "", date: todayIso(), amount: "", description: "", notes: "",
});
const emptyClosingForm = (ledgerAccountId = "") => ({
  ledgerAccountId, date: todayIso(), actualBalance: "", notes: "",
});

function Modal({ title, close, children, actions }) {
  return <div className="modal-bg"><div className="modal"><div className="row"><h2 className="title">{title}</h2><button type="button" className="btn" onClick={close}>Close</button></div>{children}{actions}</div></div>;
}

export function AccountsSummaryCard({ token, moneyFmt = money }) {
  const [overview, setOverview] = useState(null);
  useEffect(() => {
    if (!token) return;
    Promise.all([loadLedgerAccounts(token), loadCashbookEntries(token)])
      .then(([ledgers, entries]) => {
        const range = dateRangeForFilter("today");
        setOverview(aggregateOverview(ledgers, entries, range));
      })
      .catch(() => setOverview(null));
  }, [token]);
  if (!overview) return null;
  return <div className="card accounts-summary-card spacer">
    <div className="toolbar accounts-summary-heading"><strong>Accounts</strong><span className="small">Today&apos;s movement</span></div>
    <div className="accounts-summary-grid">
      <div><span className="small">Cash</span><strong className="gold">{moneyFmt(overview.cash)}</strong></div>
      <div><span className="small">Bank</span><strong>{moneyFmt(overview.bank)}</strong></div>
      <div><span className="small">UPI</span><strong>{moneyFmt(overview.upi)}</strong></div>
      <div><span className="small">Total</span><strong className="gold">{moneyFmt(overview.total)}</strong></div>
      <div><span className="small">Today&apos;s in</span><strong className="green">{moneyFmt(overview.moneyIn)}</strong></div>
      <div><span className="small">Today&apos;s out</span><strong className="red">{moneyFmt(overview.moneyOut)}</strong></div>
    </div>
  </div>;
}

export function CashbookWorkspace({ token, close, loans = [], embedded = false }) {
  const [section, setSection] = useState("cashbook");
  const [ledgers, setLedgers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [closings, setClosings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [period, setPeriod] = useState("today");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showSetup, setShowSetup] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [setupForm, setSetupForm] = useState({ openingCash: "", openingUpi: "", openingBank: "" });
  const [manualForm, setManualForm] = useState(emptyManualForm);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [transferForm, setTransferForm] = useState(emptyTransferForm);
  const [closingForm, setClosingForm] = useState(emptyClosingForm);
  const [bankForm, setBankForm] = useState({ name: "", bankAccountLast4: "" });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ledgerRows, entryRows, closingRows] = await Promise.all([
        loadLedgerAccounts(token),
        loadCashbookEntries(token),
        loadDayClosings(token),
      ]);
      setLedgers(ledgerRows);
      setEntries(entryRows);
      setClosings(closingRows);
      const initialized = entryRows.some(entry => entry.sourceType === "opening_balance");
      if (!initialized) setShowSetup(true);
    } catch (err) {
      setError(err.message || "Could not load accounts.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  const range = useMemo(() => dateRangeForFilter(period, customFrom, customTo), [period, customFrom, customTo]);
  const allTimeOverview = useMemo(
    () => aggregateOverview(ledgers, entries, { from: "1970-01-01", to: "2099-12-31" }),
    [ledgers, entries],
  );
  const periodOverview = useMemo(() => aggregateOverview(ledgers, entries, range), [ledgers, entries, range]);
  const rangedEntries = useMemo(
    () => entries.filter(entry => entry.entryDate >= range.from && entry.entryDate <= range.to),
    [entries, range],
  );
  const loanById = useMemo(
    () => Object.fromEntries(loans.map(loan => [loan.id, loan])),
    [loans],
  );
  const cashbookRows = useMemo(() => {
    const filtered = filterCashbookEntries(rangedEntries, {
      search,
      accountId: accountFilter,
      direction: directionFilter,
      category: "all",
      source: sourceFilter,
      loanById,
    });
    if (accountFilter === "all") return withRunningBalances(filtered);
    return runningBalancesForLedger(filtered, accountFilter);
  }, [rangedEntries, search, accountFilter, directionFilter, sourceFilter, loanById]);

  const expenseRows = useMemo(
    () => rangedEntries.filter(entry => entry.sourceType === "expense" || entry.category === "Expense" || EXPENSE_CATEGORIES.includes(entry.category)),
    [rangedEntries],
  );

  const saveSetup = async () => {
    setError("");
    try {
      await initializeAccounts(token, {
        openingCash: Number(setupForm.openingCash || 0),
        openingUpi: Number(setupForm.openingUpi || 0),
        openingBank: Number(setupForm.openingBank || 0),
      });
    } catch (err) {
      setError(err.message || "Could not save opening balances.");
      return;
    }
    try {
      await backfillCashbook(token);
      setShowSetup(false);
      setNotice("Accounts initialized and existing FinTrack transactions synced.");
      refresh();
    } catch (err) {
      setShowSetup(false);
      setError(`${err.message || "Sync failed."} Opening balances were saved — tap Sync from FinTrack on the Cashbook tab.`);
      refresh();
    }
  };

  const openManual = () => {
    setManualForm(emptyManualForm());
    setShowManual(true);
  };
  const closeManual = () => {
    setShowManual(false);
    setManualForm(emptyManualForm());
  };
  const openExpense = () => {
    setExpenseForm(emptyExpenseForm());
    setShowExpense(true);
  };
  const closeExpense = () => {
    setShowExpense(false);
    setExpenseForm(emptyExpenseForm());
  };
  const openTransfer = () => {
    setTransferForm(emptyTransferForm());
    setShowTransfer(true);
  };
  const closeTransfer = () => {
    setShowTransfer(false);
    setTransferForm(emptyTransferForm());
  };
  const openClosing = () => {
    const cashId = ledgers.find(l => l.accountType === "cash")?.id || "";
    setClosingForm(emptyClosingForm(cashId));
    setShowClosing(true);
  };
  const closeClosing = () => {
    setShowClosing(false);
    setClosingForm(emptyClosingForm());
  };

  const saveManual = async () => {
    try {
      await recordManualEntry(token, {
        ...manualForm,
        amount: Number(manualForm.amount),
      });
      setShowManual(false);
      setManualForm(emptyManualForm());
      refresh();
    } catch (err) {
      setError(err.message || "Could not save transaction.");
    }
  };

  const saveExpense = async () => {
    try {
      await recordExpense(token, {
        ...expenseForm,
        amount: Number(expenseForm.amount),
      });
      setShowExpense(false);
      setExpenseForm(emptyExpenseForm());
      refresh();
    } catch (err) {
      setError(err.message || "Could not save expense.");
    }
  };

  const saveTransfer = async () => {
    try {
      await recordTransfer(token, {
        ...transferForm,
        amount: Number(transferForm.amount),
      });
      setShowTransfer(false);
      setTransferForm(emptyTransferForm());
      refresh();
    } catch (err) {
      setError(err.message || "Could not save transfer.");
    }
  };

  const saveClosing = async () => {
    try {
      await recordDayClosing(token, {
        ...closingForm,
        actualBalance: Number(closingForm.actualBalance),
      });
      setShowClosing(false);
      setClosingForm(emptyClosingForm());
      refresh();
    } catch (err) {
      setError(err.message || "Could not save day closing.");
    }
  };

  const addBank = async () => {
    try {
      await createBankAccount(token, bankForm);
      setBankForm({ name: "", bankAccountLast4: "" });
      refresh();
    } catch (err) {
      setError(err.message || "Could not add bank account.");
    }
  };

  const removeManual = async entry => {
    if (!entry.isEditable) return;
    if (!window.confirm("Delete this manual transaction?")) return;
    try {
      await deleteManualEntry(token, entry.id);
      refresh();
    } catch (err) {
      setError(err.message || "Could not delete transaction.");
    }
  };

  const exportCsv = rows => {
    const header = ["Date", "Description", "Account", "Category", "In", "Out", "Reference", "Receipt"];
    const lines = rows.map(row => [
      row.entryDate, row.description, row.ledgerName, row.category,
      row.moneyIn || "", row.moneyOut || "", row.reference || "", row.receiptNumber || "",
    ]);
    const csv = [header, ...lines].map(line => line.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fintrack-cashbook-${todayIso()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const periodProps = { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo };

  return <div className="accounts-module shell">
    <header className="top"><div><ButtonLike onClick={close}>{embedded ? "← Accounts" : "← Back"}</ButtonLike><h1 className="title spacer">{embedded ? "Cashbook" : "Accounts"}</h1><p className="copy">{embedded ? "Operational cash, bank and UPI movement. This is not the double-entry ledger." : "Cashbook, expenses, bank accounts, transfers and day closing."}</p></div></header>
    {error && <div className="notice">{error}</div>}
    {notice && <div className="notice accounts-notice-ok">{notice}</div>}
    <nav className="accounts-section-nav spacer" aria-label="Accounts sections">
      {SECTIONS.map(item => <button key={item.id} type="button" className={`accounts-section-tab ${section === item.id ? "active" : ""}`} onClick={() => setSection(item.id)}>{item.label}</button>)}
    </nav>
    {loading ? <p className="copy">Loading accounts…</p> : <>
      {section === "cashbook" && <div className="accounts-panel">
        <CashbookOverview balances={allTimeOverview} movement={periodOverview} period={period} />
        <div className="card accounts-filter-card spacer">
          <PeriodPills {...periodProps} />
          <div className="accounts-filter-row">
            <input className="accounts-search" placeholder="Search customer, receipt, reference…" value={search} onChange={event => setSearch(event.target.value)} />
            <label className="accounts-filter-field">
              <span className="small">Account</span>
              <select value={accountFilter} onChange={event => setAccountFilter(event.target.value)}>
                <option value="all">All accounts</option>
                {ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
              </select>
            </label>
            <label className="accounts-filter-field">
              <span className="small">Source</span>
              <select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}>
                {CASHBOOK_SOURCE_FILTERS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="accounts-filter-field">
              <span className="small">In / out</span>
              <select value={directionFilter} onChange={event => setDirectionFilter(event.target.value)}>
                <option value="all">All</option>
                <option value="in">Money in</option>
                <option value="out">Money out</option>
                <option value="transfer">Transfer</option>
              </select>
            </label>
          </div>
        </div>
        <div className="accounts-action-row spacer">
          <button type="button" className="btn primary" onClick={openManual}>+ Add transaction</button>
          <button type="button" className="btn" onClick={() => exportCsv(cashbookRows)}>Export CSV</button>
          <button type="button" className="btn" onClick={() => backfillCashbook(token).then(refresh)}>Sync from FinTrack</button>
        </div>
        <div className="accounts-entry-list">
          {cashbookRows.map(entry => <article key={entry.id} className="card accounts-entry-row">
            <div className="accounts-entry-main">
              <div className="accounts-entry-copy">
                <strong>{entry.description}</strong>
                <p className="small">{entry.entryDate} · {entry.ledgerName} · {entry.category}</p>
              </div>
              <div className="accounts-entry-amounts">
                {entry.moneyIn > 0 && <span className="green">{money(entry.moneyIn)}</span>}
                {entry.moneyOut > 0 && <span className="red">{money(entry.moneyOut)}</span>}
                <span className="small accounts-entry-balance">Bal {money(entry.balance)}</span>
              </div>
            </div>
            {(entry.receiptNumber || entry.paymentMode || entry.reference) && <p className="small accounts-entry-meta">
              {entry.receiptNumber && <>Receipt {entry.receiptNumber} · </>}
              {entry.paymentMode && <>{entry.paymentMode} · </>}
              {entry.reference || ""}
            </p>}
            {sourceOriginLabel(entry, loanById) && <p className="small accounts-origin-note">Synced from {sourceOriginLabel(entry, loanById)} — edit the original record to change the amount.</p>}
            {entry.isEditable && <button type="button" className="btn danger accounts-entry-delete" onClick={() => removeManual(entry)}>Delete</button>}
          </article>)}
          {!cashbookRows.length && <EmptyState>No cashbook entries match these filters.</EmptyState>}
        </div>
      </div>}
      {section === "expenses" && <div className="accounts-panel">
        <PanelHead title="Expenses"><button type="button" className="btn primary" onClick={openExpense}>+ Add expense</button></PanelHead>
        <div className="card accounts-filter-card spacer"><PeriodPills {...periodProps} /></div>
        <div className="accounts-entry-list">
          {expenseRows.map(entry => <article key={entry.id} className="card accounts-entry-row accounts-expense-row">
            <div className="accounts-entry-main">
              <div><strong>{entry.description}</strong><p className="small">{entry.entryDate} · {entry.category} · {entry.ledgerName}</p></div>
              <span className="red accounts-expense-amount">{money(entry.moneyOut)}</span>
            </div>
          </article>)}
          {!expenseRows.length && <EmptyState>No expenses for this period.</EmptyState>}
        </div>
      </div>}
      {section === "bank" && <div className="accounts-panel">
        <PanelHead title="Bank & UPI accounts"><span className="small">Cash and UPI are created at setup. Add named bank accounts below.</span></PanelHead>
        <div className="accounts-ledger-grid spacer">
          {allTimeOverview.ledgers.map(ledger => <article key={ledger.id} className="card accounts-ledger-card">
            <span className="accounts-ledger-type">{ledger.accountType}</span>
            <strong className="accounts-ledger-name">{ledger.name}{ledger.bankAccountLast4 ? ` · ${ledger.bankAccountLast4}` : ""}</strong>
            <span className="accounts-ledger-balance">{money(ledger.balance)}</span>
          </article>)}
        </div>
        <div className="card accounts-form-card spacer">
          <strong>Add bank account</strong>
          <div className="form spacer">
            <Field label="Bank name"><input value={bankForm.name} onChange={event => setBankForm(current => ({ ...current, name: event.target.value }))} placeholder="e.g. HDFC" /></Field>
            <Field label="Account last 4 digits"><input value={bankForm.bankAccountLast4} onChange={event => setBankForm(current => ({ ...current, bankAccountLast4: event.target.value }))} maxLength={4} placeholder="1234" /></Field>
            <button type="button" className="btn primary" onClick={addBank}>Add bank account</button>
          </div>
        </div>
      </div>}
      {section === "transfers" && <div className="accounts-panel">
        <PanelHead title="Transfers"><button type="button" className="btn primary" onClick={openTransfer}>Transfer money</button></PanelHead>
        <div className="card accounts-info-card">
          <p className="copy">Move money between your own accounts. Transfers are not income or expense.</p>
        </div>
      </div>}
      {section === "closing" && <div className="accounts-panel">
        <PanelHead title="Day closing"><button type="button" className="btn primary" onClick={openClosing}>Record closing</button></PanelHead>
        <div className="accounts-entry-list">
          {closings.map(row => {
            const reconciled = Number(row.difference) === 0;
            return <article key={row.id} className="card accounts-closing-row">
              <div className="accounts-closing-head">
                <strong>{row.closing_date}</strong>
                <span className="small">{row.ledger_accounts?.name || "Account"}</span>
              </div>
              <div className="accounts-closing-stats">
                <div><span className="small">Expected</span><strong>{money(row.expected_balance)}</strong></div>
                <div><span className="small">Actual</span><strong>{money(row.actual_balance)}</strong></div>
                <div className={reconciled ? "accounts-closing-ok" : "accounts-closing-bad"}>
                  <span className="small">{reconciled ? "Status" : "Difference"}</span>
                  <strong>{reconciled ? "Reconciled" : money(row.difference)}</strong>
                </div>
              </div>
            </article>;
          })}
          {!closings.length && <EmptyState>No day closings recorded yet.</EmptyState>}
        </div>
      </div>}
      {section === "reports" && <div className="accounts-panel">
        <PanelHead title="Reports" />
        <div className="card accounts-filter-card spacer"><PeriodPills {...periodProps} /></div>
        <div className="card accounts-report-card spacer">
          <p className="copy">Export data for the selected period.</p>
          <div className="accounts-report-actions">
            <button type="button" className="btn" onClick={() => exportCsv(rangedEntries)}>Cashbook CSV</button>
            <button type="button" className="btn" onClick={() => exportCsv(expenseRows)}>Expense CSV</button>
            <button type="button" className="btn" onClick={() => exportCsv(allTimeOverview.ledgers.map(l => ({ entryDate: todayIso(), description: l.name, ledgerName: l.accountType, category: "Balance", moneyIn: l.balance, moneyOut: 0, reference: "", receiptNumber: "" })))}>Account balances CSV</button>
          </div>
        </div>
      </div>}
    </>}
    {showSetup && <Modal title="Set opening balances" close={() => setShowSetup(false)} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveSetup}>Save & sync</button></div>}>
      <p className="copy">Enter opening balances once. Existing FinTrack collections and disbursements will be synced automatically.</p>
      <div className="form spacer">
        <Field label="Opening cash"><input type="number" value={setupForm.openingCash} onChange={event => setSetupForm(current => ({ ...current, openingCash: event.target.value }))} /></Field>
        <Field label="Opening UPI"><input type="number" value={setupForm.openingUpi} onChange={event => setSetupForm(current => ({ ...current, openingUpi: event.target.value }))} /></Field>
        <Field label="Opening bank"><input type="number" value={setupForm.openingBank} onChange={event => setSetupForm(current => ({ ...current, openingBank: event.target.value }))} /></Field>
      </div>
    </Modal>}
    {showManual && <Modal title="Add transaction" close={closeManual} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveManual}>Save</button></div>}>
      <div className="form">
        <Field label="Direction"><select value={manualForm.direction} onChange={event => setManualForm(current => ({ ...current, direction: event.target.value }))}><option value="in">Money in</option><option value="out">Money out</option></select></Field>
        <Field label="Account"><select value={manualForm.ledgerAccountId} onChange={event => setManualForm(current => ({ ...current, ledgerAccountId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={manualForm.date} onChange={event => setManualForm(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Category"><select value={manualForm.category} onChange={event => setManualForm(current => ({ ...current, category: event.target.value }))}>{(manualForm.direction === "in" ? MANUAL_IN_CATEGORIES : MANUAL_OUT_CATEGORIES).map(item => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Description"><input value={manualForm.description} onChange={event => setManualForm(current => ({ ...current, description: event.target.value }))} /></Field>
        <Field label="Amount"><input type="number" value={manualForm.amount} onChange={event => setManualForm(current => ({ ...current, amount: event.target.value }))} /></Field>
      </div>
    </Modal>}
    {showExpense && <Modal title="Add expense" close={closeExpense} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveExpense}>Save expense</button></div>}>
      <div className="form">
        <Field label="Account"><select value={expenseForm.ledgerAccountId} onChange={event => setExpenseForm(current => ({ ...current, ledgerAccountId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={expenseForm.date} onChange={event => setExpenseForm(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Category"><select value={expenseForm.category} onChange={event => setExpenseForm(current => ({ ...current, category: event.target.value }))}>{EXPENSE_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Description"><input value={expenseForm.description} onChange={event => setExpenseForm(current => ({ ...current, description: event.target.value }))} /></Field>
        <Field label="Amount"><input type="number" value={expenseForm.amount} onChange={event => setExpenseForm(current => ({ ...current, amount: event.target.value }))} /></Field>
      </div>
    </Modal>}
    {showTransfer && <Modal title="Transfer money" close={closeTransfer} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveTransfer}>Transfer</button></div>}>
      <div className="form">
        <Field label="From"><select value={transferForm.fromLedgerId} onChange={event => setTransferForm(current => ({ ...current, fromLedgerId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></Field>
        <Field label="To"><select value={transferForm.toLedgerId} onChange={event => setTransferForm(current => ({ ...current, toLedgerId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={transferForm.date} onChange={event => setTransferForm(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Amount"><input type="number" value={transferForm.amount} onChange={event => setTransferForm(current => ({ ...current, amount: event.target.value }))} /></Field>
      </div>
    </Modal>}
    {showClosing && <Modal title="Day closing" close={closeClosing} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveClosing}>Save closing</button></div>}>
      <div className="form">
        <Field label="Account"><select value={closingForm.ledgerAccountId} onChange={event => setClosingForm(current => ({ ...current, ledgerAccountId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={closingForm.date} onChange={event => setClosingForm(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Actual balance counted"><input type="number" value={closingForm.actualBalance} onChange={event => setClosingForm(current => ({ ...current, actualBalance: event.target.value }))} /></Field>
      </div>
    </Modal>}
  </div>;
}

function ButtonLike({ onClick, children }) {
  return <button type="button" className="btn" onClick={onClick}>{children}</button>;
}
