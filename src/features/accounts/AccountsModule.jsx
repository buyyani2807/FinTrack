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
  EXPENSE_CATEGORIES,
  MANUAL_IN_CATEGORIES,
  MANUAL_OUT_CATEGORIES,
  aggregateOverview,
  dateRangeForFilter,
  filterCashbookEntries,
  runningBalancesForLedger,
  sourceOriginLabel,
  todayIso,
} from "./cashbookModel.js";

const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;
const money = value => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const SECTIONS = [
  { id: "cashbook", label: "Cashbook" },
  { id: "expenses", label: "Expenses" },
  { id: "bank", label: "Bank / UPI" },
  { id: "transfers", label: "Transfers" },
  { id: "closing", label: "Day Closing" },
  { id: "reports", label: "Reports" },
];
const PERIOD_SECTIONS = new Set(["cashbook", "expenses", "reports"]);

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

export function AccountsModule({ token, close, loans = [] }) {
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
  const [showSetup, setShowSetup] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [setupForm, setSetupForm] = useState({ openingCash: "", openingUpi: "", openingBank: "" });
  const [manualForm, setManualForm] = useState({
    direction: "in", ledgerAccountId: "", date: todayIso(), category: MANUAL_IN_CATEGORIES[0],
    description: "", amount: "", reference: "", notes: "",
  });
  const [expenseForm, setExpenseForm] = useState({
    ledgerAccountId: "", date: todayIso(), category: EXPENSE_CATEGORIES[0],
    description: "", amount: "", notes: "", reference: "",
  });
  const [transferForm, setTransferForm] = useState({
    fromLedgerId: "", toLedgerId: "", date: todayIso(), amount: "", description: "", notes: "",
  });
  const [closingForm, setClosingForm] = useState({
    ledgerAccountId: "", date: todayIso(), actualBalance: "", notes: "",
  });
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
  const overview = PERIOD_SECTIONS.has(section) ? periodOverview : allTimeOverview;
  const rangedEntries = useMemo(
    () => entries.filter(entry => entry.entryDate >= range.from && entry.entryDate <= range.to),
    [entries, range],
  );
  const cashbookRows = useMemo(() => {
    const filtered = filterCashbookEntries(rangedEntries, {
      search, accountId: accountFilter, direction: directionFilter, category: "all",
    });
    const cashLedger = ledgers.find(l => l.accountType === "cash" && l.isDefault)?.id || ledgers[0]?.id;
    return runningBalancesForLedger(
      accountFilter === "all" ? filtered : filtered,
      accountFilter === "all" ? cashLedger : accountFilter,
    );
  }, [rangedEntries, search, accountFilter, directionFilter, ledgers]);

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

  const saveManual = async () => {
    try {
      await recordManualEntry(token, {
        ...manualForm,
        amount: Number(manualForm.amount),
      });
      setShowManual(false);
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

  const defaultCashId = ledgers.find(l => l.accountType === "cash")?.id || "";

  return <div className="accounts-module shell">
    <header className="top"><div><ButtonLike onClick={close}>← Back</ButtonLike><h1 className="title spacer">Accounts</h1><p className="copy">Cashbook, expenses, bank accounts, transfers and day closing.</p></div></header>
    {error && <div className="notice">{error}</div>}
    {notice && <div className="notice" style={{ borderColor: "#4fd08d55", color: "#4fd08d" }}>{notice}</div>}
    <div className="tabs accounts-section-tabs spacer">
      {SECTIONS.map(item => <button key={item.id} type="button" className={`btn tab ${section === item.id ? "active" : ""}`} onClick={() => setSection(item.id)}>{item.label}</button>)}
    </div>
    {PERIOD_SECTIONS.has(section) && <div className="accounts-period-toolbar spacer">
      <div className="tabs">
        {["today", "week", "month", "custom"].map(key => (
          <button key={key} type="button" className={`btn tab ${period === key ? "active" : ""}`} onClick={() => setPeriod(key)}>
            {key === "today" ? "Today" : key === "week" ? "This Week" : key === "month" ? "This Month" : "Custom"}
          </button>
        ))}
      </div>
      {period === "custom" && <div className="accounts-custom-range">
        <input type="date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} />
        <input type="date" value={customTo} onChange={event => setCustomTo(event.target.value)} />
      </div>}
    </div>}
    <div className="card accounts-overview-card spacer">
      <div className="grid metrics accounts-overview-metrics">
        <div><span className="metric-label">Cash balance</span><strong className="metric-value gold">{money(overview.cash)}</strong></div>
        <div><span className="metric-label">Bank balance</span><strong className="metric-value">{money(overview.bank)}</strong></div>
        <div><span className="metric-label">UPI balance</span><strong className="metric-value">{money(overview.upi)}</strong></div>
        <div><span className="metric-label">Total funds</span><strong className="metric-value gold">{money(overview.total)}</strong></div>
        {PERIOD_SECTIONS.has(section) && <>
          <div><span className="metric-label">Money in{period === "today" ? " (today)" : ""}</span><strong className="metric-value green">{money(periodOverview.moneyIn)}</strong></div>
          <div><span className="metric-label">Money out{period === "today" ? " (today)" : ""}</span><strong className="metric-value red">{money(periodOverview.moneyOut)}</strong></div>
        </>}
      </div>
    </div>
    {loading ? <p className="copy">Loading accounts…</p> : <>
      {section === "cashbook" && <>
        <p className="copy spacer">The cashbook shows money in and out. Cash and UPI are set up when you save opening balances; add extra bank accounts under <strong>Bank / UPI</strong>. Use <strong>+ Add transaction</strong> for manual entries only.</p>
        <div className="toolbar spacer">
          <div className="tabs">
            <button type="button" className="btn primary" onClick={() => setShowManual(true)}>+ Add transaction</button>
            <button type="button" className="btn" onClick={() => exportCsv(rangedEntries)}>Export CSV</button>
            <button type="button" className="btn" onClick={() => backfillCashbook(token).then(refresh)}>Sync from FinTrack</button>
          </div>
        </div>
        <div className="accounts-filters spacer">
          <input placeholder="Search customer, receipt, reference…" value={search} onChange={event => setSearch(event.target.value)} />
          <select value={accountFilter} onChange={event => setAccountFilter(event.target.value)}>
            <option value="all">All accounts</option>
            {ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
          </select>
          <select value={directionFilter} onChange={event => setDirectionFilter(event.target.value)}>
            <option value="all">All</option>
            <option value="in">Money in</option>
            <option value="out">Money out</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>
        <div className="accounts-cashbook-list">
          {cashbookRows.map(entry => <article key={entry.id} className="card accounts-cashbook-row">
            <div className="accounts-cashbook-main">
              <div><strong>{entry.description}</strong><p className="small">{entry.entryDate} · {entry.ledgerName} · {entry.category}</p></div>
              <div className="accounts-cashbook-amounts">
                {entry.moneyIn > 0 && <span className="green">{money(entry.moneyIn)} in</span>}
                {entry.moneyOut > 0 && <span className="red">{money(entry.moneyOut)} out</span>}
                <span className="small">Bal {money(entry.balance)}</span>
              </div>
            </div>
            {(entry.receiptNumber || entry.paymentMode || entry.reference) && <p className="small">
              {entry.receiptNumber && <>Receipt {entry.receiptNumber} · </>}
              {entry.paymentMode && <>{entry.paymentMode} · </>}
              {entry.reference || ""}
            </p>}
            {sourceOriginLabel(entry) && <p className="small accounts-origin-note">This transaction originated from {sourceOriginLabel(entry)}. Edit the original record to change the amount.</p>}
            {entry.isEditable && <div className="tabs"><button type="button" className="btn danger" onClick={() => removeManual(entry)}>Delete</button></div>}
          </article>)}
          {!cashbookRows.length && <div className="card">No cashbook entries for this period.</div>}
        </div>
      </>}
      {section === "expenses" && <>
        <div className="toolbar spacer"><button type="button" className="btn primary" onClick={() => setShowExpense(true)}>+ Add expense</button></div>
        <div className="accounts-cashbook-list">
          {expenseRows.map(entry => <article key={entry.id} className="card accounts-cashbook-row">
            <strong>{entry.description}</strong>
            <p className="small">{entry.entryDate} · {entry.category} · {entry.ledgerName}</p>
            <span className="red">{money(entry.moneyOut)}</span>
          </article>)}
        </div>
      </>}
      {section === "bank" && <>
        <p className="copy spacer">Cash and UPI accounts are created automatically at setup. Use the form below to add named bank accounts (e.g. HDFC · 1234).</p>
        <div className="grid metrics spacer">
          {overview.ledgers.map(ledger => <div key={ledger.id} className="card"><span className="metric-label">{ledger.name}{ledger.bankAccountLast4 ? ` · ${ledger.bankAccountLast4}` : ""}</span><strong className="metric-value">{money(ledger.balance)}</strong><span className="small">{ledger.accountType.toUpperCase()}</span></div>)}
        </div>
        <div className="card spacer"><strong>Add bank account</strong>
          <div className="form spacer">
            <Field label="Bank name"><input value={bankForm.name} onChange={event => setBankForm(current => ({ ...current, name: event.target.value }))} /></Field>
            <Field label="Account last 4 digits"><input value={bankForm.bankAccountLast4} onChange={event => setBankForm(current => ({ ...current, bankAccountLast4: event.target.value }))} maxLength={4} /></Field>
            <button type="button" className="btn primary" onClick={addBank}>Add bank account</button>
          </div>
        </div>
      </>}
      {section === "transfers" && <>
        <div className="toolbar spacer"><button type="button" className="btn primary" onClick={() => setShowTransfer(true)}>Transfer money</button></div>
        <p className="copy">Transfers move money between your own accounts. They are not counted as income or expense.</p>
      </>}
      {section === "closing" && <>
        <div className="toolbar spacer"><button type="button" className="btn primary" onClick={() => { setClosingForm(current => ({ ...current, ledgerAccountId: defaultCashId })); setShowClosing(true); }}>Day closing</button></div>
        <div className="accounts-cashbook-list">
          {closings.map(row => <article key={row.id} className="card accounts-cashbook-row">
            <strong>{row.closing_date} · {row.ledger_accounts?.name || "Account"}</strong>
            <p className="small">Expected {money(row.expected_balance)} · Actual {money(row.actual_balance)}</p>
            <span className={Number(row.difference) === 0 ? "green" : "red"}>
              {Number(row.difference) === 0 ? "✓ Reconciled" : `Difference ${money(row.difference)}`}
            </span>
          </article>)}
        </div>
      </>}
      {section === "reports" && <>
        <div className="card spacer"><strong>Accounts reports</strong>
          <div className="tabs spacer">
            <button type="button" className="btn" onClick={() => exportCsv(rangedEntries)}>Cashbook CSV</button>
            <button type="button" className="btn" onClick={() => exportCsv(expenseRows)}>Expense CSV</button>
            <button type="button" className="btn" onClick={() => exportCsv(overview.ledgers.map(l => ({ entryDate: todayIso(), description: l.name, ledgerName: l.accountType, category: "Balance", moneyIn: l.balance, moneyOut: 0, reference: "", receiptNumber: "" })))}>Account balances CSV</button>
          </div>
        </div>
      </>}
    </>}
    {showSetup && <Modal title="Set opening balances" close={() => setShowSetup(false)} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveSetup}>Save & sync</button></div>}>
      <p className="copy">Enter opening balances once. Existing FinTrack collections and disbursements will be synced automatically.</p>
      <div className="form spacer">
        <Field label="Opening cash"><input type="number" value={setupForm.openingCash} onChange={event => setSetupForm(current => ({ ...current, openingCash: event.target.value }))} /></Field>
        <Field label="Opening UPI"><input type="number" value={setupForm.openingUpi} onChange={event => setSetupForm(current => ({ ...current, openingUpi: event.target.value }))} /></Field>
        <Field label="Opening bank"><input type="number" value={setupForm.openingBank} onChange={event => setSetupForm(current => ({ ...current, openingBank: event.target.value }))} /></Field>
      </div>
    </Modal>}
    {showManual && <Modal title="Add transaction" close={() => setShowManual(false)} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveManual}>Save</button></div>}>
      <div className="form">
        <Field label="Direction"><select value={manualForm.direction} onChange={event => setManualForm(current => ({ ...current, direction: event.target.value }))}><option value="in">Money in</option><option value="out">Money out</option></select></Field>
        <Field label="Account"><select value={manualForm.ledgerAccountId} onChange={event => setManualForm(current => ({ ...current, ledgerAccountId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={manualForm.date} onChange={event => setManualForm(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Category"><select value={manualForm.category} onChange={event => setManualForm(current => ({ ...current, category: event.target.value }))}>{(manualForm.direction === "in" ? MANUAL_IN_CATEGORIES : MANUAL_OUT_CATEGORIES).map(item => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Description"><input value={manualForm.description} onChange={event => setManualForm(current => ({ ...current, description: event.target.value }))} /></Field>
        <Field label="Amount"><input type="number" value={manualForm.amount} onChange={event => setManualForm(current => ({ ...current, amount: event.target.value }))} /></Field>
      </div>
    </Modal>}
    {showExpense && <Modal title="Add expense" close={() => setShowExpense(false)} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveExpense}>Save expense</button></div>}>
      <div className="form">
        <Field label="Account"><select value={expenseForm.ledgerAccountId} onChange={event => setExpenseForm(current => ({ ...current, ledgerAccountId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={expenseForm.date} onChange={event => setExpenseForm(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Category"><select value={expenseForm.category} onChange={event => setExpenseForm(current => ({ ...current, category: event.target.value }))}>{EXPENSE_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Description"><input value={expenseForm.description} onChange={event => setExpenseForm(current => ({ ...current, description: event.target.value }))} /></Field>
        <Field label="Amount"><input type="number" value={expenseForm.amount} onChange={event => setExpenseForm(current => ({ ...current, amount: event.target.value }))} /></Field>
      </div>
    </Modal>}
    {showTransfer && <Modal title="Transfer money" close={() => setShowTransfer(false)} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveTransfer}>Transfer</button></div>}>
      <div className="form">
        <Field label="From"><select value={transferForm.fromLedgerId} onChange={event => setTransferForm(current => ({ ...current, fromLedgerId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></Field>
        <Field label="To"><select value={transferForm.toLedgerId} onChange={event => setTransferForm(current => ({ ...current, toLedgerId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={transferForm.date} onChange={event => setTransferForm(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Amount"><input type="number" value={transferForm.amount} onChange={event => setTransferForm(current => ({ ...current, amount: event.target.value }))} /></Field>
      </div>
    </Modal>}
    {showClosing && <Modal title="Day closing" close={() => setShowClosing(false)} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveClosing}>Save closing</button></div>}>
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
