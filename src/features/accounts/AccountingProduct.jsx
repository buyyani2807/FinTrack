import { useCallback, useEffect, useMemo, useState } from "react";
import { CashbookWorkspace } from "./AccountsModule.jsx";
import {
  addBankStatement,
  cancelVoucher,
  createChartAccount,
  createParty,
  deleteChartAccount,
  initializeAccounting,
  loadAccountingSettings,
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
  setAccountingIntegration,
  syncAccountingOperations,
  updateChartAccount,
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
  assertCanDeleteLedger,
  createSubmitLock,
  defaultAccountTypeForGroup,
  indianFinancialYear,
  ledgerHasPostedLines,
  previousIndianFinancialYear,
  roundMoney,
  simpleEntryDraft,
  voucherTotals,
} from "./accountingModel.js";
import { formatIstDateTime, todayIso } from "./cashbookModel.js";
import {
  accountLedger,
  balanceSheet,
  bankVoucherLines,
  cashFlow,
  dashboardMetrics,
  dayBook,
  defaultBankStatementLines,
  downloadAccountsCsv,
  invoiceRegister,
  partyBalances,
  partyLedger,
  profitAndLoss,
  trialBalance,
} from "./accountingReports.js";
import { formatInr } from "../../lib/formatMoney.js";

const money = formatInr;
const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;
const emptyLine = () => ({ coaId: "", debit: "", credit: "", description: "" });
const emptyBankLine = () => ({ lineDate: todayIso(), description: "", amount: "", direction: "in" });
const emptyCoaForm = () => ({
  id: null,
  code: "",
  name: "",
  groupType: "expense",
  accountType: "expense",
  openingBalance: "",
  openingSide: "debit",
  isSystem: false,
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
];
const SECTION_GROUPS = [...new Set(SECTIONS.map(item => item.group))];

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
  ["cashbook", "Cashbook"],
  ["bank", "Bank Reconciliation"],
  ["setup", "Setup"],
];

function Modal({ title, close, children, actions }) {
  return <div className="modal-bg"><div className="modal acc-modal"><div className="row"><h2 className="title">{title}</h2><button type="button" className="btn" onClick={close}>Close</button></div>{children}{actions}</div></div>;
}

function VoucherForm({ accounts, parties, voucherType, setVoucherType, form, setForm, lines, setLines, onSubmit, saving }) {
  const totals = voucherTotals(lines.map(line => ({ ...line, debit: Number(line.debit || 0), credit: Number(line.credit || 0) })));
  const setLine = (index, patch) => setLines(current => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  return <>
    <div className="form">
      <Field label="Voucher type"><select value={voucherType} onChange={event => setVoucherType(event.target.value)}>{Object.values(VOUCHER_TYPES).map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></Field>
      <Field label="Date"><input type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></Field>
      <Field label="Party (optional)"><select value={form.partyId} onChange={event => setForm(current => ({ ...current, partyId: event.target.value }))}><option value="">None</option>{parties.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>
      <Field className="span" label="Narration"><input value={form.narration} onChange={event => setForm(current => ({ ...current, narration: event.target.value }))} /></Field>
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

function SimpleEntryForm({ kind, accounts, parties, form, setForm, onSubmit, saving }) {
  const customers = parties.filter(party => party.partyType === "customer");
  const suppliers = parties.filter(party => party.partyType === "supplier");
  const expenseOptions = SIMPLE_EXPENSE_CODES.filter(([code]) => accounts.some(account => account.code === code) || code === "5990");
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const needsParty = kind === "sale" || kind === "receipt" || kind === "credit_note" ? "customer"
    : kind === "purchase" || kind === "payment" || kind === "debit_note" ? "supplier"
    : null;
  const partyList = needsParty === "supplier" ? suppliers : customers;
  const noteCopy = kind === "credit_note"
    ? "Reduces the customer balance and sales. Original invoices stay in Day Book."
    : kind === "debit_note"
      ? "Reduces the supplier balance and purchases. Original invoices stay in Day Book."
      : "FinTrack posts the balanced voucher for you. Open + Voucher if you need a custom journal.";
  return <>
    <p className="copy">{noteCopy}</p>
    <div className="form">
      <Field label="Date"><input type="date" value={form.date} onChange={event => set({ date: event.target.value })} /></Field>
      {(kind === "sale" || kind === "purchase") && <Field label="Payment"><select value={form.settlement} onChange={event => set({ settlement: event.target.value })}><option value="credit">Credit</option><option value="paid">Paid now</option></select></Field>}
      {(kind !== "transfer" && kind !== "credit_note" && kind !== "debit_note" && (kind === "expense" || kind === "receipt" || kind === "payment" || form.settlement === "paid")) && <Field label="Mode"><select value={form.moneyMode} onChange={event => set({ moneyMode: event.target.value })}>{MONEY_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select></Field>}
      {kind === "expense" && <Field label="Expense"><select value={form.expenseCode} onChange={event => set({ expenseCode: event.target.value })}>{expenseOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field>}
      {kind === "transfer" && <>
        <Field label="From"><select value={form.fromType} onChange={event => set({ fromType: event.target.value })}>{MONEY_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select></Field>
        <Field label="To"><select value={form.toType} onChange={event => set({ toType: event.target.value })}>{MONEY_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select></Field>
      </>}
      {needsParty && <Field label={needsParty === "supplier" ? "Supplier" : "Customer"}><select value={form.partyId} onChange={event => set({ partyId: event.target.value })}><option value="">Select</option>{partyList.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>}
      <Field label="Amount"><input type="number" min="0" step="0.01" value={form.amount} onChange={event => set({ amount: event.target.value })} /></Field>
      <Field className="span" label="Note (optional)"><input value={form.narration} onChange={event => set({ narration: event.target.value })} placeholder="Received from Ravi" /></Field>
    </div>
    <div className="tabs spacer"><button type="button" className="btn primary" disabled={saving} onClick={onSubmit}>{saving ? "Saving…" : "Save"}</button></div>
  </>;
}

function CoaFormFields({ form, setForm }) {
  const types = ACCOUNT_TYPES_BY_GROUP[form.groupType] || ACCOUNT_TYPES_BY_GROUP.expense;
  const set = patch => setForm(current => ({ ...current, ...patch }));
  return <div className="form">
    <Field label="Code"><input value={form.code} disabled={Boolean(form.isSystem)} onChange={event => set({ code: event.target.value })} /></Field>
    <Field label="Name"><input value={form.name} onChange={event => set({ name: event.target.value })} /></Field>
    <Field label="Group"><select value={form.groupType} disabled={Boolean(form.id)} onChange={event => {
      const groupType = event.target.value;
      const accountType = defaultAccountTypeForGroup(groupType);
      set({ groupType, accountType, openingSide: accountNormalSide(groupType) });
    }}>{COA_GROUPS.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></Field>
    <Field label="Type"><select value={form.accountType} disabled={Boolean(form.id)} onChange={event => set({ accountType: event.target.value })}>{types.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></Field>
    <Field label="Opening balance"><input type="number" min="0" step="0.01" value={form.openingBalance} onChange={event => set({ openingBalance: event.target.value })} /></Field>
    <Field label="Opening side"><select value={form.openingSide} onChange={event => set({ openingSide: event.target.value })}><option value="debit">Debit</option><option value="credit">Credit</option></select></Field>
  </div>;
}

export function AccountsModule({ token, close, loans = [] }) {
  const [section, setSection] = useState("overview");
  const [reportTab, setReportTab] = useState("daybook");
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
  const [voucherForm, setVoucherForm] = useState({ date: todayIso(), narration: "", partyId: "" });
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [partyForm, setPartyForm] = useState({ partyType: "customer", name: "", phone: "", email: "", address: "" });
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
  const [simpleForm, setSimpleForm] = useState({
    date: todayIso(),
    amount: "",
    partyId: "",
    moneyMode: "cash",
    settlement: "credit",
    expenseCode: "5000",
    fromType: "cash",
    toType: "bank",
    narration: "",
  });
  const [partyFocusId, setPartyFocusId] = useState("");
  const [partyTxnType, setPartyTxnType] = useState("");
  const [partyFrom, setPartyFrom] = useState(fy.from);
  const [partyTo, setPartyTo] = useState(fy.to);
  const [outstandingOnly, setOutstandingOnly] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextSettings, nextAccounts, nextParties, nextVouchers, nextAudit, nextLocks, nextStatements] = await Promise.all([
        loadAccountingSettings(token),
        loadChartOfAccounts(token),
        loadParties(token),
        loadVouchers(token),
        loadAuditLog(token),
        loadPeriodLocks(token),
        loadBankStatements(token),
      ]);
      setSettings(nextSettings);
      setAccounts(nextAccounts);
      setParties(nextParties);
      setVouchers(nextVouchers);
      setAudit(nextAudit);
      setLocks(nextLocks);
      setStatements(nextStatements);
      setMigrationRequired(false);
      if (nextSettings) setSetupForm({ companyName: nextSettings.companyName, booksStartedOn: nextSettings.booksStartedOn || todayIso() });
      if (!ledgerId && nextAccounts[0]) setLedgerId(nextAccounts[0].id);
    } catch (err) {
      if (err.code === "MIGRATION_REQUIRED") setMigrationRequired(true);
      else setError(err.message || "Could not load Accounts.");
    } finally {
      setLoading(false);
    }
  }, [token, ledgerId]);

  useEffect(() => { refresh(); }, [refresh]);

  const metrics = useMemo(() => dashboardMetrics(accounts, vouchers, parties, { today: todayIso(), ...range }), [accounts, vouchers, parties, range]);
  const tb = useMemo(() => trialBalance(accounts, vouchers, range), [accounts, vouchers, range]);
  const pnl = useMemo(() => profitAndLoss(accounts, vouchers, range), [accounts, vouchers, range]);
  const sheet = useMemo(() => balanceSheet(accounts, vouchers, range), [accounts, vouchers, range]);
  const flow = useMemo(() => cashFlow(accounts, vouchers, range), [accounts, vouchers, range]);
  const books = useMemo(() => dayBook(vouchers, range), [vouchers, range]);
  const ar = useMemo(() => partyBalances(accounts, vouchers, parties, { kind: "receivable", ...range }), [accounts, vouchers, parties, range]);
  const ap = useMemo(() => partyBalances(accounts, vouchers, parties, { kind: "payable", ...range }), [accounts, vouchers, parties, range]);
  const arInvoices = useMemo(() => invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today: todayIso(), ...range, outstandingOnly }), [accounts, vouchers, parties, range, outstandingOnly]);
  const apInvoices = useMemo(() => invoiceRegister(accounts, vouchers, parties, { kind: "payable", today: todayIso(), ...range, outstandingOnly }), [accounts, vouchers, parties, range, outstandingOnly]);
  const salesRows = useMemo(() => books.filter(row => row.voucherType === "sales"), [books]);
  const purchaseRows = useMemo(() => books.filter(row => row.voucherType === "purchase"), [books]);
  const focusedParty = useMemo(() => parties.find(party => party.id === partyFocusId) || parties[0] || null, [parties, partyFocusId]);
  const partyBook = useMemo(() => partyLedger(accounts, vouchers, focusedParty, {
    from: partyFrom,
    to: partyTo,
    voucherType: partyTxnType || undefined,
  }), [accounts, vouchers, focusedParty, partyFrom, partyTo, partyTxnType]);
  const ledger = useMemo(() => accountLedger(accounts, vouchers, ledgerId, range), [accounts, vouchers, ledgerId, range]);
  const q = search.trim().toLowerCase();
  const shownVouchers = useMemo(() => vouchers.filter(voucher => {
    if (!q) return true;
    return `${voucher.voucherNumber} ${voucher.narration} ${voucher.voucherType}`.toLowerCase().includes(q);
  }), [vouchers, q]);
  const bankAccounts = useMemo(() => accounts.filter(account => account.accountType === "bank" && account.isActive !== false), [accounts]);
  const matchedLineIds = useMemo(() => new Set(
    statements.flatMap(statement => statement.lines.map(line => line.matchedVoucherLineId).filter(Boolean)),
  ), [statements]);

  const setReportRange = (from, to) => {
    if (from) setRangeFrom(from);
    if (to) setRangeTo(to);
  };

  const openSection = id => {
    setSection(id);
    if (id === "trial") setReportTab("trial");
    if (id === "pnl") setReportTab("pnl");
    if (id === "balance") setReportTab("balance");
    window.scrollTo(0, 0);
  };

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
    await postVoucher(token, {
      voucherType,
      date: voucherForm.date,
      narration: voucherForm.narration,
      partyId: voucherForm.partyId || null,
      lines: lines.map(line => ({
        coaId: line.coaId,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        description: voucherForm.narration,
        partyId: voucherForm.partyId || null,
      })),
    });
    setShowVoucher(false);
    setLines([emptyLine(), emptyLine()]);
  }, "Voucher posted.");

  const openSimple = kind => {
    setSimpleKind(kind);
    setSimpleForm(current => ({
      ...current,
      date: todayIso(),
      amount: "",
      narration: "",
      settlement: kind === "sale" || kind === "purchase" ? "credit" : current.settlement,
      moneyMode: "cash",
      fromType: "cash",
      toType: "bank",
    }));
    setShowSimple(true);
  };

  const submitSimple = () => run(async () => {
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
      narration: simpleForm.narration,
    });
    await postVoucher(token, draft);
    setShowSimple(false);
  }, `${SIMPLE_ENTRY_KINDS.find(item => item.id === simpleKind)?.label || "Entry"} saved.`);

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
      });
    } else {
      setCoaForm(emptyCoaForm());
    }
    setShowCoa(true);
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

  const exportReport = () => {
    const active = ["receivables", "payables", "pnl", "balance", "trial"].includes(section) ? section : reportTab;
    const stamp = todayIso();
    if (active === "trial") {
      downloadAccountsCsv(`fintrack-trial-balance-${stamp}.csv`, [["Code", "Account", "Debit", "Credit"], ...tb.rows.map(row => [row.code, row.name, row.debit, row.credit]), ["", "Total", tb.totalDebit, tb.totalCredit]]);
    } else if (active === "pnl") {
      downloadAccountsCsv(`fintrack-profit-loss-${stamp}.csv`, [["Section", "Account", "Amount"], ...pnl.income.map(row => ["Income", row.name, row.amount]), ["Income", "Total income", pnl.totalIncome], ...pnl.expenses.map(row => ["Expense", row.name, row.amount]), ["Expense", "Total expenses", pnl.totalExpense], ["", "Net profit", pnl.net]]);
    } else if (active === "balance") {
      downloadAccountsCsv(`fintrack-balance-sheet-${stamp}.csv`, [["Section", "Code", "Account", "Amount"], ...sheet.assets.map(row => ["Asset", row.code, row.name, row.balance]), ...sheet.liabilities.map(row => ["Liability", row.code, row.name, row.balance]), ...sheet.equity.map(row => ["Equity", row.code, row.name, row.balance])]);
    } else if (active === "daybook") {
      downloadAccountsCsv(`fintrack-day-book-${stamp}.csv`, [["Date", "Number", "Type", "Narration", "Amount"], ...books.map(row => [row.date, row.voucherNumber, row.voucherType, row.narration, row.debit])]);
    } else if (active === "receivables") {
      downloadAccountsCsv(`fintrack-receivables-${stamp}.csv`, [["Customer", "Invoice", "Invoice date", "Due date", "Amount", "Paid", "Outstanding", "Days", "Status"], ...arInvoices.map(row => [row.partyName, row.reference, row.invoiceDate, row.dueDate, row.amount, row.paid, row.outstanding, row.daysOutstanding, row.status])]);
    } else if (active === "payables") {
      downloadAccountsCsv(`fintrack-payables-${stamp}.csv`, [["Supplier", "Invoice", "Invoice date", "Due date", "Amount", "Paid", "Outstanding", "Status"], ...apInvoices.map(row => [row.partyName, row.reference, row.invoiceDate, row.dueDate, row.amount, row.paid, row.outstanding, row.status])]);
    } else if (active === "sales") {
      downloadAccountsCsv(`fintrack-sales-${stamp}.csv`, [["Date", "Number", "Narration", "Amount"], ...salesRows.map(row => [row.date, row.voucherNumber, row.narration, row.debit])]);
    } else if (active === "purchases") {
      downloadAccountsCsv(`fintrack-purchases-${stamp}.csv`, [["Date", "Number", "Narration", "Amount"], ...purchaseRows.map(row => [row.date, row.voucherNumber, row.narration, row.debit])]);
    } else if (active === "ledger") {
      downloadAccountsCsv(`fintrack-ledger-${stamp}.csv`, [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])]);
    } else {
      downloadAccountsCsv(`fintrack-cash-flow-${stamp}.csv`, [["Metric", "Amount"], ["Inflow", flow.inflow], ["Outflow", flow.outflow], ["Net", flow.net]]);
    }
  };

  const invoiceTable = (rows, kind) => <div className="table spacer"><table><thead><tr><th>{kind === "payable" ? "Supplier" : "Customer"}</th><th>Invoice</th><th>Invoice date</th><th>Due date</th><th>Amount</th><th>Paid</th><th>Outstanding</th>{kind !== "payable" && <th>Days</th>}<th>Status</th></tr></thead><tbody>
    {rows.map(row => <tr key={row.id}><td>{row.partyName}</td><td>{row.reference}</td><td>{row.invoiceDate}</td><td>{row.dueDate}</td><td>{money(row.amount)}</td><td>{money(row.paid)}</td><td>{money(row.outstanding)}</td>{kind !== "payable" && <td>{row.daysOutstanding}</td>}<td>{row.status}</td></tr>)}
    {!rows.length && <tr><td colSpan={kind === "payable" ? 8 : 9}>No {kind === "payable" ? "payables" : "receivables"} yet.</td></tr>}
  </tbody></table></div>;

  if (section === "cashbook") {
    return <CashbookWorkspace token={token} close={() => openSection("overview")} loans={loans} embedded />;
  }

  return <div className="acc-shell">
    <aside className="acc-sidebar" aria-label="Accounts sections">
      <div className="acc-sidebar-brand">
        <strong>Accounts</strong>
        <span className="small">Ledgers and reports</span>
      </div>
      {SECTION_GROUPS.map(group => (
        <div key={group}>
          <div className="acc-nav-group">{group}</div>
          {SECTIONS.filter(item => item.group === group).map(item => (
            <button key={item.id} type="button" className={`acc-nav-item ${section === item.id ? "active" : ""}`} onClick={() => openSection(item.id)}>{item.label}</button>
          ))}
        </div>
      ))}
    </aside>
    <main className="acc-main">
      <header className="top">
        <div>
          <button type="button" className="btn" onClick={section === "overview" ? close : () => openSection("overview")}>{section === "overview" ? "← Dashboard" : "← Accounts"}</button>
          <h1 className="title spacer">{SECTIONS.find(item => item.id === section)?.label || "Accounts"}</h1>
          <p className="copy">{fy.label} · {range.from} to {range.to} · Standalone books for any small business. Daily Finance and Chit Fund are optional.</p>
        </div>
        <div className="tabs acc-top-actions">
          {SIMPLE_ENTRY_KINDS.map(item => <button key={item.id} type="button" className="btn" onClick={() => openSimple(item.id)}>+ {item.label}</button>)}
          <button type="button" className="btn primary" onClick={() => setShowVoucher(true)}>+ Voucher</button>
          <button type="button" className="btn" onClick={() => setShowParty(true)}>+ Party</button>
        </div>
      </header>
      {error && <div className="notice">{error}</div>}
      {notice && <div className="notice accounts-notice-ok">{notice}</div>}
      {migrationRequired && <div className="notice">Run <strong>052_fintrack_accounts_double_entry.sql</strong>, then <strong>053_accounts_small_business_coa.sql</strong> and <strong>054_accounts_p1_ledger_opening.sql</strong> in the Supabase SQL editor, then refresh. Cashbook, Daily Finance, Monthly Finance, and Chit Fund keep working without them.</div>}
      <nav className="acc-mobile-cards" aria-label="Accounts">
        {MOBILE_TABS.map(item => (
          <button key={item.id} type="button" className={`acc-mobile-card ${mobileTab === item.id ? "active" : ""}`} onClick={() => openSection(item.id)}>{item.label}</button>
        ))}
      </nav>
      {loading ? <p className="copy">Loading Accounts…</p> : <>
        {section === "overview" && <div className="acc-panel">
          <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
          {!settings && <div className="card accounts-form-card">
            <strong>Open the books</strong>
            <p className="copy">Create a chart of accounts for this business. You do not need Daily Finance, Monthly Finance, or Chit Fund records.</p>
            <div className="form spacer">
              <Field label="Business name"><input value={setupForm.companyName} onChange={event => setSetupForm(current => ({ ...current, companyName: event.target.value }))} /></Field>
              <Field label="Books start date"><input type="date" value={setupForm.booksStartedOn} onChange={event => setSetupForm(current => ({ ...current, booksStartedOn: event.target.value }))} /></Field>
            </div>
            <button type="button" className="btn primary" disabled={saving} onClick={() => run(() => initializeAccounting(token, setupForm), "Accounts opened.")}>{saving ? "Saving…" : "Create chart of accounts"}</button>
          </div>}
          <div className="grid metrics">
            <div className="card"><div className="metric-label">Cash</div><div className="metric-value gold">{money(metrics.cash)}</div></div>
            <div className="card"><div className="metric-label">Bank</div><div className="metric-value gold">{money(metrics.bank)}</div></div>
            <div className="card"><div className="metric-label">UPI</div><div className="metric-value gold">{money(metrics.upi)}</div></div>
            <div className="card"><div className="metric-label">Receivables</div><div className="metric-value blue">{money(metrics.receivables)}</div></div>
            <div className="card"><div className="metric-label">Payables</div><div className="metric-value">{money(metrics.payables)}</div></div>
            <div className="card"><div className="metric-label">Today&apos;s sales</div><div className="metric-value">{money(metrics.todaySales)}</div></div>
            <div className="card"><div className="metric-label">Today&apos;s purchases</div><div className="metric-value">{money(metrics.todayPurchases)}</div></div>
            <div className="card"><div className="metric-label">Today&apos;s receipts</div><div className="metric-value green">{money(metrics.todayReceipts)}</div></div>
            <div className="card"><div className="metric-label">Today&apos;s payments</div><div className="metric-value red">{money(metrics.todayPayments)}</div></div>
            <div className="card"><div className="metric-label">Income</div><div className="metric-value green">{money(metrics.income)}</div></div>
            <div className="card"><div className="metric-label">Expenses</div><div className="metric-value red">{money(metrics.expenses)}</div></div>
            <div className="card"><div className="metric-label">Net profit</div><div className={`metric-value ${metrics.netProfit < 0 ? "red" : "green"}`}>{money(metrics.netProfit)}</div></div>
            <div className="card"><div className="metric-label">Equation</div><div className={`metric-value ${metrics.equationHolds ? "green" : "red"}`}>{metrics.equationHolds ? "In balance" : "Out of balance"}</div></div>
          </div>
          <div className="acc-quick-actions spacer">
            {SIMPLE_ENTRY_KINDS.map(item => <button key={item.id} type="button" className="btn" onClick={() => openSimple(item.id)}>+ {item.label}</button>)}
          </div>
          <div className="acc-landing-grid">
            {[
              ["vouchers", "Transactions", "Guided sale, purchase, expense, receipt and payment. Advanced vouchers stay available."],
              ["parties", "Customers & suppliers", "Accounts parties are independent of Daily Finance customers and Chit Fund members."],
              ["receivables", "Receivables", "Invoice outstanding, due dates and status. Finance receivables link only when integration is on."],
              ["payables", "Payables", "Supplier invoices and balances from purchase vouchers."],
              ["cashbook", "Cashbook", "Operational cash, bank and UPI movement. Unchanged from FinTrack collections."],
              ["reports", "Reports", "Day Book, Ledger, Trial Balance, P&L, Balance Sheet, Cash Flow, Sales and Purchases."],
              ["setup", "Company setup", `Accounting integration is ${settings?.integrationEnabled ? "ON" : "OFF"}. Off by default.`],
            ].map(([id, title, copy]) => (
              <button key={id} type="button" className="card acc-landing-card" onClick={() => openSection(id)}>
                <strong>{title}</strong>
                <p className="small">{copy}</p>
              </button>
            ))}
          </div>
        </div>}

        {section === "ledger" && <div className="acc-panel">
          <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
          <div className="card accounts-filter-card spacer">
            <label className="accounts-filter-field"><span className="small">Account</span>
              <select value={ledgerId} onChange={event => setLedgerId(event.target.value)}>{accounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select>
            </label>
            <button type="button" className="btn" onClick={() => downloadAccountsCsv(`fintrack-ledger-${todayIso()}.csv`, [["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"], ...ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance])])}>Export CSV</button>
          </div>
          <div className="table spacer"><table><thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
            {ledger.rows.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td>{row.debit ? money(row.debit) : ""}</td><td>{row.credit ? money(row.credit) : ""}</td><td>{money(row.balance)}</td></tr>)}
            {!ledger.rows.length && <tr><td colSpan="6">No postings on this ledger yet.</td></tr>}
          </tbody></table></div>
        </div>}

        {section === "vouchers" && <div className="acc-panel">
          <div className="acc-quick-actions">
            {SIMPLE_ENTRY_KINDS.map(item => <button key={item.id} type="button" className="btn" onClick={() => openSimple(item.id)}>+ {item.label}</button>)}
          </div>
          <div className="accounts-action-row spacer">
            <input className="accounts-search" placeholder="Search voucher number or narration" value={search} onChange={event => setSearch(event.target.value)} />
            <button type="button" className="btn primary" onClick={() => setShowVoucher(true)}>+ Advanced voucher</button>
          </div>
          <div className="accounts-entry-list spacer">
            {shownVouchers.map(voucher => <article key={voucher.id} className="card accounts-entry-row">
              <div className="accounts-entry-main">
                <div>
                  <strong>{voucher.voucherNumber}</strong>
                  <p className="small">{voucher.date} · {VOUCHER_TYPES[voucher.voucherType]?.label} · {voucher.status}{voucher.sourceType ? ` · ${voucher.sourceModule}/${voucher.sourceType}` : ""}</p>
                  <p className="small">{voucher.narration}</p>
                </div>
                <div className="accounts-entry-amounts">
                  <span>{money(voucherTotals(voucher.lines).debit)}</span>
                  {voucher.status === "posted" && <>
                    <button type="button" className="btn" disabled={saving} onClick={() => {
                      const reason = window.prompt("Reason for reversal");
                      if (reason) run(() => reverseVoucher(token, voucher.id, todayIso(), reason), "Reversal posted.");
                    }}>Reverse</button>
                    <button type="button" className="btn danger" disabled={saving} onClick={() => {
                      const reason = window.prompt("Reason to cancel");
                      if (reason) run(() => cancelVoucher(token, voucher.id, reason), "Voucher cancelled.");
                    }}>Cancel</button>
                  </>}
                </div>
              </div>
              <div className="table spacer"><table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>
                {voucher.lines.map(line => <tr key={line.id}><td>{line.code} {line.name}</td><td>{line.debit ? money(line.debit) : ""}</td><td>{line.credit ? money(line.credit) : ""}</td></tr>)}
              </tbody></table></div>
            </article>)}
            {!shownVouchers.length && <div className="card accounts-empty">No vouchers posted yet.</div>}
          </div>
        </div>}

        {(section === "receivables" || section === "payables") && <div className="acc-panel">
          <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
          <div className="accounts-action-row">
            <label className="accounts-filter-field"><span className="small">Outstanding only</span>
              <input type="checkbox" checked={outstandingOnly} onChange={event => setOutstandingOnly(event.target.checked)} />
            </label>
            <button type="button" className="btn" onClick={exportReport}>Export CSV</button>
          </div>
          {invoiceTable(section === "receivables" ? arInvoices : apInvoices, section === "payables" ? "payable" : "receivable")}
          <p className="small spacer">Party totals: {(section === "receivables" ? ar : ap).map(row => `${row.name} ${money(row.balance)}`).join(" · ") || "none"}</p>
        </div>}

        {section === "parties" && <div className="acc-panel">
          <div className="accounts-action-row">
            <button type="button" className="btn primary" onClick={() => setShowParty(true)}>+ Party</button>
            <button type="button" className="btn" onClick={() => openSection("receivables")}>Receivables</button>
            <button type="button" className="btn" onClick={() => openSection("payables")}>Payables</button>
          </div>
          <p className="copy">Accounting customers and suppliers are independent of Daily Finance customers and Chit Fund members.</p>
          <div className="card accounts-filter-card spacer">
            <label className="accounts-filter-field"><span className="small">Party</span>
              <select value={focusedParty?.id || ""} onChange={event => setPartyFocusId(event.target.value)}><option value="">Select party</option>{parties.map(party => <option key={party.id} value={party.id}>{party.name} · {party.partyType}</option>)}</select>
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
            <p className="small">Opening {money(partyBook.opening)} · Outstanding {money(partyBook.outstanding)}</p>
            <div className="table spacer"><table><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Narration</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
              {partyBook.rows.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.voucherType}</td><td>{row.narration}</td><td>{row.debit ? money(row.debit) : ""}</td><td>{row.credit ? money(row.credit) : ""}</td><td>{money(row.balance)}</td></tr>)}
              {!partyBook.rows.length && <tr><td colSpan="7">No transactions for this party in the selected dates.</td></tr>}
            </tbody></table></div>
          </> : <div className="card accounts-empty">Add a customer or supplier to open their ledger.</div>}
        </div>}

        {section === "more" && <div className="acc-panel">
          <div className="acc-landing-grid">
            {MORE_LINKS.map(([id, title]) => (
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
            <button type="button" className="btn" onClick={exportReport}>Export CSV</button>
            <button type="button" className="btn" onClick={() => window.print()}>Print / PDF</button>
          </div>
          {(section === "trial" || reportTab === "trial") && section !== "pnl" && section !== "balance" && <div className="table spacer"><table><thead><tr><th>Code</th><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>
            {tb.rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.debit ? money(row.debit) : ""}</td><td>{row.credit ? money(row.credit) : ""}</td></tr>)}
            <tr><td></td><td><strong>Total</strong></td><td><strong>{money(tb.totalDebit)}</strong></td><td><strong>{money(tb.totalCredit)}</strong></td></tr>
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
          {section === "reports" && reportTab === "daybook" && <div className="table spacer"><table><thead><tr><th>Date</th><th>Number</th><th>Type</th><th>Narration</th><th>Amount</th></tr></thead><tbody>
            {books.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.voucherType}</td><td>{row.narration}</td><td>{money(row.debit)}</td></tr>)}
            {!books.length && <tr><td colSpan="5">No posted vouchers in this period.</td></tr>}
          </tbody></table></div>}
          {section === "reports" && reportTab === "cashflow" && <div className="grid metrics"><div className="card"><div className="metric-label">Inflow</div><div className="metric-value green">{money(flow.inflow)}</div></div><div className="card"><div className="metric-label">Outflow</div><div className="metric-value red">{money(flow.outflow)}</div></div><div className="card"><div className="metric-label">Net cash</div><div className="metric-value gold">{money(flow.net)}</div></div></div>}
          {section === "reports" && reportTab === "receivables" && invoiceTable(arInvoices, "receivable")}
          {section === "reports" && reportTab === "payables" && invoiceTable(apInvoices, "payable")}
          {section === "reports" && reportTab === "sales" && <div className="table spacer"><table><thead><tr><th>Date</th><th>Number</th><th>Narration</th><th>Amount</th></tr></thead><tbody>
            {salesRows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td>{money(row.debit)}</td></tr>)}
            {!salesRows.length && <tr><td colSpan="4">No sales vouchers in this period.</td></tr>}
          </tbody></table></div>}
          {section === "reports" && reportTab === "purchases" && <div className="table spacer"><table><thead><tr><th>Date</th><th>Number</th><th>Narration</th><th>Amount</th></tr></thead><tbody>
            {purchaseRows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td>{money(row.debit)}</td></tr>)}
            {!purchaseRows.length && <tr><td colSpan="4">No purchase vouchers in this period.</td></tr>}
          </tbody></table></div>}
          {section === "reports" && reportTab === "ledger" && <>
            <div className="card accounts-filter-card spacer">
              <label className="accounts-filter-field"><span className="small">Account</span>
                <select value={ledgerId} onChange={event => setLedgerId(event.target.value)}>{accounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select>
              </label>
            </div>
            <div className="table spacer"><table><thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
              {ledger.rows.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td>{row.debit ? money(row.debit) : ""}</td><td>{row.credit ? money(row.credit) : ""}</td><td>{money(row.balance)}</td></tr>)}
              {!ledger.rows.length && <tr><td colSpan="6">No postings on this ledger in this period.</td></tr>}
            </tbody></table></div>
          </>}
        </div>}

        {section === "bank" && <div className="acc-panel">
          <p className="copy">Reconciliation marks statement lines against posted voucher lines. Matching does not change cash, bank, P&amp;L, or the trial balance.</p>
          <div className="card accounts-form-card">
            <strong>Add bank statement</strong>
            <div className="form spacer">
              <Field label="Bank account"><select value={bankForm.coaId || bankAccounts[0]?.id || ""} onChange={event => setBankForm(current => ({ ...current, coaId: event.target.value }))}><option value="">Select bank</option>{bankAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field>
              <Field label="Statement date"><input type="date" value={bankForm.statementDate} onChange={event => setBankForm(current => ({ ...current, statementDate: event.target.value }))} /></Field>
              <Field label="Statement opening"><input type="number" step="0.01" value={bankForm.openingBalance} onChange={event => setBankForm(current => ({ ...current, openingBalance: event.target.value }))} /></Field>
              <Field label="Statement closing"><input type="number" step="0.01" value={bankForm.closingBalance} onChange={event => setBankForm(current => ({ ...current, closingBalance: event.target.value }))} /></Field>
            </div>
            <div className="table spacer"><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>In / Out</th><th></th></tr></thead><tbody>
              {bankForm.lines.map((line, index) => <tr key={index}>
                <td><input type="date" value={line.lineDate} onChange={event => setBankForm(current => ({ ...current, lines: current.lines.map((row, i) => i === index ? { ...row, lineDate: event.target.value } : row) }))} /></td>
                <td><input value={line.description} onChange={event => setBankForm(current => ({ ...current, lines: current.lines.map((row, i) => i === index ? { ...row, description: event.target.value } : row) }))} /></td>
                <td><input type="number" min="0" step="0.01" value={line.amount} onChange={event => setBankForm(current => ({ ...current, lines: current.lines.map((row, i) => i === index ? { ...row, amount: event.target.value } : row) }))} /></td>
                <td><select value={line.direction} onChange={event => setBankForm(current => ({ ...current, lines: current.lines.map((row, i) => i === index ? { ...row, direction: event.target.value } : row) }))}><option value="in">In</option><option value="out">Out</option></select></td>
                <td>{bankForm.lines.length > 1 && <button type="button" className="btn" onClick={() => setBankForm(current => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>Remove</button>}</td>
              </tr>)}
            </tbody></table></div>
            <div className="accounts-action-row">
              <button type="button" className="btn" onClick={() => setBankForm(current => ({ ...current, lines: [...current.lines, emptyBankLine()] }))}>Add line</button>
              <button type="button" className="btn primary" disabled={saving} onClick={submitBankStatement}>{saving ? "Saving…" : "Save statement"}</button>
            </div>
          </div>
          {statements.map(statement => {
            const voucherLines = bankVoucherLines(accounts, vouchers, statement.coaId).map(line => ({
              ...line,
              matched: matchedLineIds.has(line.id),
            }));
            const displayLines = defaultBankStatementLines(statement.lines, voucherLines);
            return <article key={statement.id} className="card spacer">
              <strong>{statement.accountName} · {statement.statementDate}</strong>
              <p className="small">Opening {money(statement.openingBalance)} · Closing {money(statement.closingBalance)}</p>
              <div className="table spacer"><table><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th>Books line</th><th></th></tr></thead><tbody>
                {displayLines.map(line => {
                  const options = bankVoucherLines(accounts, vouchers, statement.coaId).filter(item => !matchedLineIds.has(item.id) || item.id === line.matchedVoucherLineId);
                  const selected = matchChoice[line.id] || line.matchedVoucherLineId || "";
                  return <tr key={line.id}>
                    <td>{line.lineDate}</td>
                    <td>{line.description}</td>
                    <td>{money(line.amount)} {line.direction}</td>
                    <td>{line.matchStatus}</td>
                    <td>
                      <select value={selected} onChange={event => setMatchChoice(current => ({ ...current, [line.id]: event.target.value }))} disabled={line.matchStatus === "matched"}>
                        <option value="">Unmatched</option>
                        {options.map(item => <option key={item.id} value={item.id}>{item.date} · {item.voucherNumber} · {money(item.amount)}</option>)}
                      </select>
                    </td>
                    <td>
                      {line.matchStatus === "matched"
                        ? <button type="button" className="btn" disabled={saving} onClick={() => run(() => saveBankMatch(token, line.id, null, "Unmatched"), "Line unmatched. Books unchanged.")}>Unmatch</button>
                        : <button type="button" className="btn" disabled={saving || !(matchChoice[line.id] || line.matchedVoucherLineId)} onClick={() => run(() => saveBankMatch(token, line.id, matchChoice[line.id] || line.matchedVoucherLineId, "Matched"), "Line matched. Books unchanged.")}>Match</button>}
                    </td>
                  </tr>;
                })}
              </tbody></table></div>
            </article>;
          })}
          {!statements.length && <div className="card accounts-empty">No bank statements yet. Add opening, closing, and statement lines above.</div>}
        </div>}

        {section === "setup" && <div className="acc-panel">
          <div className="card accounts-form-card">
            <strong>Company / financial year</strong>
            <p className="copy">Indian financial year is 1 April to 31 March.</p>
            <div className="form spacer">
              <Field label="Business name"><input value={setupForm.companyName} onChange={event => setSetupForm(current => ({ ...current, companyName: event.target.value }))} /></Field>
              <Field label="Books start date"><input type="date" value={setupForm.booksStartedOn} onChange={event => setSetupForm(current => ({ ...current, booksStartedOn: event.target.value }))} /></Field>
            </div>
            <button type="button" className="btn primary" disabled={saving} onClick={() => run(() => saveAccountingSettings(token, { ...setupForm, fyStartMonth: 4 }), "Company details saved.")}>{saving ? "Saving…" : "Save company"}</button>
          </div>
          <div className="card accounts-form-card spacer">
            <strong>Accounting integration</strong>
            <p className="copy">Off by default. When on, eligible Daily Finance, Monthly Finance, Chit Fund, and Cashbook transactions create linked accounting vouchers. The same payment is never entered twice. Cashbook stays the operational money view.</p>
            <p className="small">Status: <strong>{settings?.integrationEnabled ? "ON" : "OFF"}</strong></p>
            <div className="accounts-action-row">
              <button type="button" className="btn" disabled={saving} onClick={() => run(() => setAccountingIntegration(token, !settings?.integrationEnabled), `Integration ${settings?.integrationEnabled ? "disabled" : "enabled"}.`)}>{settings?.integrationEnabled ? "Turn integration off" : "Turn integration on"}</button>
              {settings?.integrationEnabled && <button type="button" className="btn" disabled={saving} onClick={() => run(() => syncAccountingOperations(token), "Linked vouchers synced from operations.")}>Sync linked vouchers</button>}
            </div>
          </div>
          <div className="card accounts-form-card spacer">
            <strong>Chart of accounts</strong>
            <p className="copy">Opening debit and credit sides across the chart should balance. System accounts can be renamed and given openings, but not deleted.</p>
            <div className="table spacer"><table><thead><tr><th>Code</th><th>Account</th><th>Group</th><th>Opening</th><th></th></tr></thead><tbody>
              {accounts.map(account => {
                const used = ledgerHasPostedLines(account, vouchers);
                return <tr key={account.id}>
                  <td>{account.code}</td>
                  <td>{account.name}{account.isSystem ? " · system" : ""}</td>
                  <td>{account.groupType}</td>
                  <td>{account.openingBalance ? `${money(account.openingBalance)} ${account.openingSide}` : "—"}</td>
                  <td>
                    <button type="button" className="btn" disabled={saving} onClick={() => openCoa(account)}>Edit</button>
                    <button type="button" className="btn danger" disabled={saving || account.isSystem || used} onClick={() => removeCoa(account)}>{account.isSystem ? "System" : used ? "In use" : "Delete"}</button>
                  </td>
                </tr>;
              })}
            </tbody></table></div>
            <button type="button" className="btn" onClick={() => openCoa(null)}>+ Account</button>
          </div>
          <div className="card accounts-form-card spacer">
            <strong>Parties</strong>
            <p className="copy">Customers, suppliers, employees, agents, and others used only by Accounts. They do not have to exist in Daily Finance, Monthly Finance, or Chit Fund.</p>
            <div className="table spacer"><table><thead><tr><th>Name</th><th>Type</th><th>Phone</th></tr></thead><tbody>
              {parties.map(party => <tr key={party.id}><td>{party.name}</td><td>{party.partyType}</td><td>{party.phone || "—"}</td></tr>)}
              {!parties.length && <tr><td colSpan="3">No parties yet.</td></tr>}
            </tbody></table></div>
          </div>
          <div className="card accounts-form-card spacer">
            <strong>Period locking</strong>
            <div className="form spacer">
              <Field label="From"><input type="date" value={lockForm.from} onChange={event => setLockForm(current => ({ ...current, from: event.target.value }))} /></Field>
              <Field label="To"><input type="date" value={lockForm.to} onChange={event => setLockForm(current => ({ ...current, to: event.target.value }))} /></Field>
            </div>
            <button type="button" className="btn" disabled={saving} onClick={() => run(() => lockAccountingPeriod(token, lockForm.from, lockForm.to), "Period locked.")}>{saving ? "Saving…" : "Lock period"}</button>
            <div className="table spacer"><table><thead><tr><th>Period</th><th>Status</th><th></th></tr></thead><tbody>
              {locks.map(lock => <tr key={lock.id}><td>{lock.periodFrom} to {lock.periodTo}</td><td>{lock.isLocked ? "Locked" : "Reopened"}</td>              <td>{lock.isLocked && <button type="button" className="btn" disabled={saving} onClick={() => {
                const reason = window.prompt("Reason to reopen");
                if (reason) run(() => reopenAccountingPeriod(token, lock.id, reason), "Period reopened.");
              }}>Reopen</button>}</td></tr>)}
            </tbody></table></div>
          </div>
          <div className="card accounts-form-card spacer">
            <strong>Audit trail</strong>
            <div className="table spacer"><table><thead><tr><th>When (IST)</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead><tbody>
              {audit.map(row => <tr key={row.id}><td>{formatIstDateTime(row.createdAt)}</td><td>{row.action}</td><td>{row.entityType}</td><td>{row.reason || "—"}</td></tr>)}
              {!audit.length && <tr><td colSpan="4">No accounting audit events yet.</td></tr>}
            </tbody></table></div>
          </div>
        </div>}
      </>}

      {showVoucher && <Modal title="Post voucher" close={() => !saving && setShowVoucher(false)}>
        <p className="copy">Total debits must equal total credits. Unbalanced vouchers cannot be posted.</p>
        <VoucherForm accounts={accounts} parties={parties} voucherType={voucherType} setVoucherType={setVoucherType} form={voucherForm} setForm={setVoucherForm} lines={lines} setLines={setLines} onSubmit={submitVoucher} saving={saving} />
      </Modal>}
      {showSimple && <Modal title={SIMPLE_ENTRY_KINDS.find(item => item.id === simpleKind)?.label || "Entry"} close={() => !saving && setShowSimple(false)}>
        <SimpleEntryForm kind={simpleKind} accounts={accounts} parties={parties} form={simpleForm} setForm={setSimpleForm} onSubmit={submitSimple} saving={saving} />
      </Modal>}
      {showParty && <Modal title="Add party" close={() => !saving && setShowParty(false)} actions={<div className="tabs spacer"><button type="button" className="btn primary" disabled={saving} onClick={() => run(async () => { await createParty(token, partyForm); setShowParty(false); }, "Party saved.")}>{saving ? "Saving…" : "Save party"}</button></div>}>
        <div className="form">
          <Field label="Type"><select value={partyForm.partyType} onChange={event => setPartyForm(current => ({ ...current, partyType: event.target.value }))}>{PARTY_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></Field>
          <Field label="Name"><input value={partyForm.name} onChange={event => setPartyForm(current => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Phone"><input value={partyForm.phone} onChange={event => setPartyForm(current => ({ ...current, phone: event.target.value }))} /></Field>
          <Field label="Email"><input value={partyForm.email} onChange={event => setPartyForm(current => ({ ...current, email: event.target.value }))} /></Field>
        </div>
      </Modal>}
      {showCoa && <Modal title={coaForm.id ? "Edit ledger account" : "Add ledger account"} close={() => !saving && setShowCoa(false)} actions={<div className="tabs spacer"><button type="button" className="btn primary" disabled={saving} onClick={saveCoa}>{saving ? "Saving…" : "Save account"}</button></div>}>
        <CoaFormFields form={coaForm} setForm={setCoaForm} />
      </Modal>}
    </main>
  </div>;
}
