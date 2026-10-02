import { useCallback, useEffect, useMemo, useState } from "react";
import { Toasts } from "../../components/Toasts.jsx";
import { TabScroller } from "../../components/TabScroller.jsx";
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
} from "./cashbookRepository.js";
import {
  EXPENSE_CATEGORIES,
  aggregateOverview,
  dateRangeForFilter,
  filterCashbookEntries,
  runningBalancesForLedger,
  todayIso,
  withRunningBalances,
} from "./cashbookModel.js";
import { SECTIONS, emptyManualForm, emptyExpenseForm, emptyTransferForm, emptyClosingForm } from "./cashbookConfig.js";
import { CashbookLedgerSection } from "./sections/CashbookLedgerSection.jsx";
import { ExpensesSection } from "./sections/ExpensesSection.jsx";
import { BankAccountsSection } from "./sections/BankAccountsSection.jsx";
import { TransfersSection } from "./sections/TransfersSection.jsx";
import { DayClosingSection } from "./sections/DayClosingSection.jsx";
import { CashbookReportsSection } from "./sections/CashbookReportsSection.jsx";
import { OpeningBalancesModal } from "./dialogs/OpeningBalancesModal.jsx";
import { ManualEntryModal } from "./dialogs/ManualEntryModal.jsx";
import { ExpenseModal } from "./dialogs/ExpenseModal.jsx";
import { TransferModal } from "./dialogs/TransferModal.jsx";
import { DayClosingModal } from "./dialogs/DayClosingModal.jsx";
import { Spinner } from "../../components/ui.jsx";

// The open section is the URL (/cashbook/:section, see app/AppRoutes.jsx).
export function CashbookWorkspace({ token, loans = [], section: routeSection = "cashbook", onSectionChange }) {
  const section = SECTIONS.some(item => item.id === routeSection) ? routeSection : "cashbook";
  const setSection = next => onSectionChange?.(next);
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
    <header className="top"><div><h1 className="title">Cashbook</h1><p className="copy">Cash, bank and UPI for this Finance workspace. Independent of Accounts companies and their double-entry books.</p></div></header>
    <Toasts items={[{ id: "error", tone: "error", message: error, onClose: () => setError("") }, { id: "notice", message: notice, onClose: () => setNotice("") }]} />
    <TabScroller><nav className="accounts-section-nav spacer" aria-label="Cashbook sections">
      {SECTIONS.map(item => <button key={item.id} type="button" className={`accounts-section-tab ${section === item.id ? "active" : ""}`} onClick={() => setSection(item.id)}>{item.label}</button>)}
    </nav></TabScroller>
    {loading ? <Spinner label="Loading cashbook" /> : <>
      {section === "cashbook" && <CashbookLedgerSection
        allTimeOverview={allTimeOverview}
        periodOverview={periodOverview}
        period={period}
        periodProps={periodProps}
        search={search}
        setSearch={setSearch}
        accountFilter={accountFilter}
        setAccountFilter={setAccountFilter}
        ledgers={ledgers}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        directionFilter={directionFilter}
        setDirectionFilter={setDirectionFilter}
        openManual={openManual}
        exportCsv={exportCsv}
        cashbookRows={cashbookRows}
        token={token}
        refresh={refresh}
        loanById={loanById}
        removeManual={removeManual}
      />}
      {section === "expenses" && <ExpensesSection openExpense={openExpense} periodProps={periodProps} expenseRows={expenseRows} />}
      {section === "bank" && <BankAccountsSection
        allTimeOverview={allTimeOverview}
        bankForm={bankForm}
        setBankForm={setBankForm}
        addBank={addBank}
      />}
      {section === "transfers" && <TransfersSection openTransfer={openTransfer} />}
      {section === "closing" && <DayClosingSection openClosing={openClosing} closings={closings} />}
      {section === "reports" && <CashbookReportsSection
        periodProps={periodProps}
        exportCsv={exportCsv}
        rangedEntries={rangedEntries}
        expenseRows={expenseRows}
        allTimeOverview={allTimeOverview}
      />}
    </>}
    {showSetup && <OpeningBalancesModal
      setShowSetup={setShowSetup}
      saveSetup={saveSetup}
      setupForm={setupForm}
      setSetupForm={setSetupForm}
    />}
    {showManual && <ManualEntryModal
      closeManual={closeManual}
      saveManual={saveManual}
      manualForm={manualForm}
      setManualForm={setManualForm}
      ledgers={ledgers}
    />}
    {showExpense && <ExpenseModal
      closeExpense={closeExpense}
      saveExpense={saveExpense}
      expenseForm={expenseForm}
      setExpenseForm={setExpenseForm}
      ledgers={ledgers}
    />}
    {showTransfer && <TransferModal
      closeTransfer={closeTransfer}
      saveTransfer={saveTransfer}
      transferForm={transferForm}
      setTransferForm={setTransferForm}
      ledgers={ledgers}
    />}
    {showClosing && <DayClosingModal
      closeClosing={closeClosing}
      saveClosing={saveClosing}
      closingForm={closingForm}
      setClosingForm={setClosingForm}
      ledgers={ledgers}
    />}
  </div>;
}
