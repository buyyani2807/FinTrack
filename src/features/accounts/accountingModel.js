export const VOUCHER_TYPES = {
  receipt: { id: "receipt", code: "RCPT", label: "Receipt" },
  payment: { id: "payment", code: "PAY", label: "Payment" },
  contra: { id: "contra", code: "CON", label: "Contra" },
  journal: { id: "journal", code: "JNL", label: "Journal" },
  sales: { id: "sales", code: "SALE", label: "Sales" },
  purchase: { id: "purchase", code: "PUR", label: "Purchase" },
  credit_note: { id: "credit_note", code: "CN", label: "Credit Note" },
  debit_note: { id: "debit_note", code: "DN", label: "Debit Note" },
};

export const VOUCHER_STATUS = {
  draft: "draft",
  posted: "posted",
  cancelled: "cancelled",
  reversed: "reversed",
};

export const PARTY_TYPES = [
  { id: "customer", label: "Customer" },
  { id: "supplier", label: "Supplier" },
  { id: "employee", label: "Employee" },
  { id: "agent", label: "Agent" },
  { id: "other", label: "Other" },
];

export const MONEY_MODES = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
];

export const SIMPLE_ENTRY_KINDS = [
  { id: "sale", label: "Sale", voucherType: "sales" },
  { id: "purchase", label: "Purchase", voucherType: "purchase" },
  { id: "expense", label: "Expense", voucherType: "payment" },
  { id: "receipt", label: "Receipt", voucherType: "receipt" },
  { id: "payment", label: "Payment", voucherType: "payment" },
  { id: "credit_note", label: "Credit note", voucherType: "credit_note" },
  { id: "debit_note", label: "Debit note", voucherType: "debit_note" },
  { id: "transfer", label: "Transfer", voucherType: "contra" },
];

export const ACCOUNT_TYPES_BY_GROUP = {
  asset: [
    { id: "cash", label: "Cash" },
    { id: "upi", label: "UPI" },
    { id: "bank", label: "Bank" },
    { id: "receivable", label: "Receivable" },
    { id: "other", label: "Other asset" },
  ],
  liability: [
    { id: "payable", label: "Payable" },
    { id: "other", label: "Other liability" },
  ],
  equity: [
    { id: "capital", label: "Capital" },
    { id: "drawing", label: "Drawings" },
    { id: "retained", label: "Retained earnings" },
    { id: "other", label: "Other equity" },
  ],
  income: [{ id: "income", label: "Income" }],
  expense: [{ id: "expense", label: "Expense" }],
};

export const SIMPLE_EXPENSE_CODES = [
  ["5000", "Rent"],
  ["5010", "Salary"],
  ["5040", "Electricity"],
  ["5050", "Internet"],
  ["5030", "Fuel"],
  ["5090", "Travel"],
  ["5080", "Marketing"],
  ["5065", "Office Expenses"],
  ["5060", "Office Supplies"],
  ["5100", "Bank Charges"],
  ["5120", "Professional Fees"],
  ["5990", "Miscellaneous"],
];

export const COA_GROUPS = [
  { id: "asset", label: "Assets", side: "debit" },
  { id: "liability", label: "Liabilities", side: "credit" },
  { id: "equity", label: "Equity", side: "credit" },
  { id: "income", label: "Income", side: "credit" },
  { id: "expense", label: "Expenses", side: "debit" },
];

export const SYSTEM_CODES = {
  cash: "1000",
  upi: "1010",
  bank: "1020",
  receivable: "1100",
  dailyReceivable: "1110",
  monthlyReceivable: "1120",
  chitReceivable: "1130",
  payable: "2000",
  capital: "3000",
  drawings: "3100",
  retained: "3200",
  interestIncome: "4000",
  otherIncome: "4100",
  chitCommission: "4200",
  sales: "4300",
  serviceIncome: "4310",
  purchase: "5110",
  professionalFees: "5120",
  otherExpense: "5990",
};

export const DEFAULT_CHART_OF_ACCOUNTS = [
  { code: "1000", name: "Cash in Hand", groupType: "asset", accountType: "cash", isSystem: true },
  { code: "1010", name: "UPI", groupType: "asset", accountType: "upi", isSystem: true },
  { code: "1020", name: "Bank", groupType: "asset", accountType: "bank", isSystem: true },
  { code: "1100", name: "Accounts Receivable", groupType: "asset", accountType: "receivable", isSystem: true },
  { code: "1110", name: "Daily Finance Receivable", groupType: "asset", accountType: "receivable", isSystem: true },
  { code: "1120", name: "Monthly Finance Receivable", groupType: "asset", accountType: "receivable", isSystem: true },
  { code: "1130", name: "Chit Fund Receivable", groupType: "asset", accountType: "receivable", isSystem: true },
  { code: "1200", name: "Loans & Advances", groupType: "asset", accountType: "other", isSystem: false },
  { code: "1300", name: "Fixed Assets", groupType: "asset", accountType: "other", isSystem: false },
  { code: "2000", name: "Accounts Payable", groupType: "liability", accountType: "payable", isSystem: true },
  { code: "2100", name: "Loans Payable", groupType: "liability", accountType: "payable", isSystem: false },
  { code: "3000", name: "Capital", groupType: "equity", accountType: "capital", isSystem: true },
  { code: "3100", name: "Drawings", groupType: "equity", accountType: "drawing", isSystem: true },
  { code: "3200", name: "Retained Earnings", groupType: "equity", accountType: "retained", isSystem: true },
  { code: "4000", name: "Interest Income", groupType: "income", accountType: "income", isSystem: true },
  { code: "4100", name: "Other Income", groupType: "income", accountType: "income", isSystem: true },
  { code: "4200", name: "Chit Commission", groupType: "income", accountType: "income", isSystem: true },
  { code: "4300", name: "Sales", groupType: "income", accountType: "income", isSystem: true },
  { code: "4310", name: "Service Income", groupType: "income", accountType: "income", isSystem: false },
  { code: "5000", name: "Rent", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5010", name: "Salary", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5020", name: "Agent Commission", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5030", name: "Fuel", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5040", name: "Electricity", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5050", name: "Internet", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5060", name: "Office Supplies", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5065", name: "Office Expenses", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5070", name: "Maintenance", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5080", name: "Marketing", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5090", name: "Travel", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5100", name: "Bank Charges", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5110", name: "Purchase", groupType: "expense", accountType: "expense", isSystem: true },
  { code: "5120", name: "Professional Fees", groupType: "expense", accountType: "expense", isSystem: false },
  { code: "5990", name: "Other Expenses", groupType: "expense", accountType: "expense", isSystem: true },
];

export const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100;

export const FINANCE_ONLY_CODES = new Set(["1110", "1120", "1130", "4200", "5020"]);

export const isFinanceOnlyAccount = account => FINANCE_ONLY_CODES.has(account?.code);

export const standaloneVisibleAccounts = (accounts = [], { integrationEnabled = false } = {}) =>
  integrationEnabled ? accounts : (accounts || []).filter(account => !isFinanceOnlyAccount(account));

export const addDaysIso = (iso, days) => {
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const MONEY_ACCOUNT_TYPES = new Set(["cash", "bank", "upi"]);

export const isMoneyAccount = account => MONEY_ACCOUNT_TYPES.has(account?.accountType);

export function partyPosition(partyType, running) {
  const value = roundMoney(running);
  const supplier = partyType === "supplier";
  const due = roundMoney(supplier ? Math.max(0, -value) : Math.max(0, value));
  const advance = roundMoney(supplier ? Math.max(0, value) : Math.max(0, -value));
  return { due, advance, outstanding: due, closing: value };
}

export const indianFinancialYear = (isoDate) => {
  const [year, month] = String(isoDate).slice(0, 10).split("-").map(Number);
  const startYear = month >= 4 ? year : year - 1;
  return {
    startYear,
    label: `FY ${startYear}–${String(startYear + 1).slice(-2)}`,
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
};

export const previousIndianFinancialYear = isoDate => {
  const current = indianFinancialYear(isoDate);
  return indianFinancialYear(`${current.startYear - 1}-06-01`);
};

export const defaultAccountTypeForGroup = groupType => (ACCOUNT_TYPES_BY_GROUP[groupType] || [{ id: "other" }])[0].id;

export const ledgerHasPostedLines = (account, vouchers = []) => {
  if (!account) return false;
  return (vouchers || []).some(voucher => (voucher.lines || []).some(line =>
    line.coaId === account.id || line.code === account.code,
  ));
};

export const assertCanDeleteLedger = (account, vouchers = []) => {
  if (!account) throw new Error("Choose an account");
  if (account.isSystem) throw new Error("System accounts cannot be deleted");
  if (ledgerHasPostedLines(account, vouchers)) throw new Error("Cannot delete an account that has transactions");
};

export function partyHasAccountingUse(partyId, vouchers = []) {
  if (!partyId) return false;
  return (vouchers || []).some(voucher =>
    voucher.partyId === partyId
    || (voucher.lines || []).some(line => line.partyId === partyId)
  );
}

export function assertCanDeleteParty(party, vouchers = []) {
  if (!party?.id) throw new Error("Choose a party");
  if (partyHasAccountingUse(party.id, vouchers)) {
    throw new Error("This party cannot be deleted because accounting transactions already exist for this party.");
  }
}

export function assertCanChangePartyType(party, nextType, vouchers = []) {
  if (!party?.id || party.partyType === nextType) return;
  if (partyHasAccountingUse(party.id, vouchers)) {
    throw new Error("Party type cannot be changed because accounting transactions already exist for this party.");
  }
}

export function validatePartyForm(form) {
  if (!String(form?.name || "").trim()) return "Enter the party name.";
  if (!PARTY_TYPES.some(type => type.id === form?.partyType)) return "Choose a party type.";
  const email = String(form?.email || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address, or leave it blank.";
  const phone = String(form?.phone || "").trim();
  if (phone && !/^[\d+\-\s()]{6,20}$/.test(phone)) return "Enter a valid phone number, or leave it blank.";
  return "";
}

export function filterParties(parties = [], { type = "all", search = "" } = {}) {
  const query = String(search || "").trim().toLowerCase();
  return (parties || []).filter(party => {
    if (type && type !== "all" && party.partyType !== type) return false;
    if (!query) return true;
    return [party.name, party.phone, party.email, party.gstin, party.address]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export function createSubmitLock() {
  let locked = false;
  return {
    get busy() { return locked; },
    async run(work) {
      if (locked) return { skipped: true };
      locked = true;
      try {
        return { skipped: false, result: await work() };
      } finally {
        locked = false;
      }
    },
  };
}

export const financialYearContaining = (isoDate, fyStartMonth = 4) => {
  if (fyStartMonth === 4) return indianFinancialYear(isoDate);
  const [year, month] = String(isoDate).slice(0, 10).split("-").map(Number);
  const startYear = month >= fyStartMonth ? year : year - 1;
  const endYear = startYear + 1;
  const pad = n => String(n).padStart(2, "0");
  return {
    startYear,
    label: `FY ${startYear}–${String(endYear).slice(-2)}`,
    from: `${startYear}-${pad(fyStartMonth)}-01`,
    to: `${endYear}-${pad(fyStartMonth)}-01`,
  };
};

export const accountNormalSide = groupType =>
  groupType === "asset" || groupType === "expense" ? "debit" : "credit";

export const signedBalance = (groupType, debit, credit) => {
  const d = roundMoney(debit);
  const c = roundMoney(credit);
  return accountNormalSide(groupType) === "debit" ? roundMoney(d - c) : roundMoney(c - d);
};

export const formatVoucherNumber = (type, sequence) => {
  const prefix = VOUCHER_TYPES[type]?.code || "VCH";
  return `${prefix}-${String(sequence).padStart(6, "0")}`;
};

export const nextVoucherSequence = (vouchers, type) => {
  const prefix = `${VOUCHER_TYPES[type]?.code || "VCH"}-`;
  const max = (vouchers || [])
    .filter(voucher => voucher.voucherType === type || String(voucher.voucherNumber || "").startsWith(prefix))
    .reduce((highest, voucher) => {
      const match = String(voucher.voucherNumber || "").match(/(\d+)$/);
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0);
  return max + 1;
};

export const voucherTotals = (lines = []) => {
  const debit = roundMoney(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const credit = roundMoney(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
  return { debit, credit, balanced: debit === credit && debit > 0 };
};

export const assertBalancedVoucher = (lines = []) => {
  const { debit, credit, balanced } = voucherTotals(lines);
  if (!balanced) {
    throw new Error(`Unbalanced voucher cannot be posted. Debits ${debit.toFixed(2)} · Credits ${credit.toFixed(2)}`);
  }
  for (const line of lines) {
    const d = roundMoney(line.debit);
    const c = roundMoney(line.credit);
    if (d < 0 || c < 0) throw new Error("Voucher lines cannot be negative");
    if (d > 0 && c > 0) throw new Error("A voucher line cannot be both debit and credit");
    if (d === 0 && c === 0) throw new Error("Every voucher line needs a debit or a credit");
    if (!line.coaId && !line.code) throw new Error("Every voucher line needs an account");
  }
};

export const isPosted = voucher => voucher?.status === VOUCHER_STATUS.posted;
export const isCancelled = voucher => voucher?.status === VOUCHER_STATUS.cancelled;
export const isReversed = voucher => voucher?.status === VOUCHER_STATUS.reversed;
export const isReversalVoucher = voucher => voucher?.sourceType === "reversal";
export const affectsLedgers = voucher => isPosted(voucher) || isReversed(voucher);

export const dateIsLocked = (isoDate, locks = []) =>
  (locks || []).some(lock => lock.isLocked !== false && isoDate >= lock.periodFrom && isoDate <= lock.periodTo);

export const assertPeriodOpen = (isoDate, locks = []) => {
  if (dateIsLocked(isoDate, locks)) {
    throw new Error("This accounting period is locked. Reopen it before posting.");
  }
};

export const accountingTodayIso = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export const assertVoucherDateNotFuture = (isoDate, today = accountingTodayIso()) => {
  const date = String(isoDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Voucher date is required");
  if (date > String(today).slice(0, 10)) throw new Error("Voucher date cannot be in the future");
};

export const assertCanMutatePosted = () => {
  throw new Error("Posted vouchers cannot be overwritten. Reverse or cancel them instead.");
};

export function buildVoucher({
  id,
  voucherType,
  voucherNumber,
  date,
  narration = "",
  lines,
  status = VOUCHER_STATUS.posted,
  partyId = null,
  dueDate = null,
  sourceModule = null,
  sourceType = null,
  sourceTransactionId = null,
  createdBy = null,
  createdAt = null,
  today,
} = {}) {
  if (!VOUCHER_TYPES[voucherType]) throw new Error("Unknown voucher type");
  assertVoucherDateNotFuture(date, today);
  assertBalancedVoucher(lines);
  return {
    id,
    voucherType,
    voucherNumber,
    date,
    dueDate: dueDate || null,
    narration,
    lines: lines.map((line, index) => ({
      lineNo: index + 1,
      coaId: line.coaId,
      code: line.code,
      partyId: line.partyId || partyId || null,
      debit: roundMoney(line.debit),
      credit: roundMoney(line.credit),
      description: line.description || narration,
    })),
    status,
    partyId,
    sourceModule,
    sourceType,
    sourceTransactionId,
    createdBy,
    createdAt,
  };
}

export function postVoucher(existing, draft, { locks = [], actorId = null, today } = {}) {
  assertPeriodOpen(draft.date, locks);
  assertVoucherDateNotFuture(draft.date, today);
  if (existing?.status === VOUCHER_STATUS.posted) assertCanMutatePosted();
  const numbered = {
    ...draft,
    voucherNumber: draft.voucherNumber || formatVoucherNumber(draft.voucherType, nextVoucherSequence([], draft.voucherType)),
    status: VOUCHER_STATUS.posted,
    postedAt: new Date().toISOString(),
    postedBy: actorId,
    today,
  };
  return buildVoucher(numbered);
}

export function reverseVoucher(voucher, { date, reason = "", locks = [], sequence, actorId = null, today } = {}) {
  if (!isPosted(voucher)) throw new Error("Only posted vouchers can be reversed");
  assertPeriodOpen(date || voucher.date, locks);
  assertVoucherDateNotFuture(date || voucher.date, today);
  const reversalLines = voucher.lines.map(line => ({
    coaId: line.coaId,
    code: line.code,
    partyId: line.partyId,
    debit: line.credit,
    credit: line.debit,
    description: `Reversal of ${voucher.voucherNumber}`,
  }));
  return buildVoucher({
    voucherType: voucher.voucherType,
    voucherNumber: formatVoucherNumber(voucher.voucherType, sequence || 1),
    date: date || voucher.date,
    narration: reason || `Reversal of ${voucher.voucherNumber}`,
    lines: reversalLines,
    status: VOUCHER_STATUS.posted,
    partyId: voucher.partyId,
    sourceModule: "accounts",
    sourceType: "reversal",
    sourceTransactionId: voucher.id,
    createdBy: actorId,
    today,
  });
}

export function cancelVoucher(voucher, { reason = "", locks = [] } = {}) {
  if (isCancelled(voucher)) throw new Error("Voucher is already cancelled");
  if (isReversed(voucher)) throw new Error("Reversed vouchers cannot be cancelled. Cancel the reversal instead.");
  if (isPosted(voucher)) assertPeriodOpen(voucher.date, locks);
  return {
    ...voucher,
    status: VOUCHER_STATUS.cancelled,
    cancelReason: reason,
    cancelledAt: new Date().toISOString(),
  };
}

export const moneyAccounts = accounts =>
  (accounts || []).filter(account => ["cash", "bank", "upi"].includes(account.accountType));

export function ledgerBalances(accounts = [], vouchers = [], { from, to, includeOpening = true } = {}) {
  const byId = Object.fromEntries((accounts || []).map(account => [account.id || account.code, {
    ...account,
    debit: includeOpening ? roundMoney(account.openingDebit || (account.openingSide === "debit" ? account.openingBalance : 0) || 0) : 0,
    credit: includeOpening ? roundMoney(account.openingCredit || (account.openingSide === "credit" ? account.openingBalance : 0) || 0) : 0,
  }]));
  for (const voucher of vouchers || []) {
    if (!affectsLedgers(voucher)) continue;
    if (from && voucher.date < from) continue;
    if (to && voucher.date > to) continue;
    for (const line of voucher.lines || []) {
      const key = line.coaId || line.code;
      const account = byId[key];
      if (!account) continue;
      account.debit = roundMoney(account.debit + Number(line.debit || 0));
      account.credit = roundMoney(account.credit + Number(line.credit || 0));
    }
  }
  return Object.values(byId).map(account => ({
    ...account,
    balance: signedBalance(account.groupType, account.debit, account.credit),
    debitBalance: roundMoney(Math.max(0, account.debit - account.credit)),
    creditBalance: roundMoney(Math.max(0, account.credit - account.debit)),
  }));
}

export function accountingEquationHolds(accounts, vouchers, range) {
  const rows = ledgerBalances(accounts, vouchers, range);
  const assets = roundMoney(rows.filter(row => row.groupType === "asset").reduce((sum, row) => sum + row.balance, 0));
  const liabilities = roundMoney(rows.filter(row => row.groupType === "liability").reduce((sum, row) => sum + row.balance, 0));
  const equity = roundMoney(rows.filter(row => row.groupType === "equity").reduce((sum, row) => sum + row.balance, 0));
  const income = roundMoney(rows.filter(row => row.groupType === "income").reduce((sum, row) => sum + row.balance, 0));
  const expense = roundMoney(rows.filter(row => row.groupType === "expense").reduce((sum, row) => sum + row.balance, 0));
  const net = roundMoney(income - expense);
  return {
    assets,
    liabilities,
    equity,
    net,
    balanced: assets === roundMoney(liabilities + equity + net),
  };
}

export function findAccount(accounts, { id, code, accountType } = {}) {
  return (accounts || []).find(account =>
    (id && account.id === id)
    || (code && account.code === code)
    || (accountType && account.accountType === accountType && account.isSystem !== false),
  ) || (accounts || []).find(account => accountType && account.accountType === accountType);
}

const moneyLine = (accounts, accountType, amount, side) => {
  const value = roundMoney(amount);
  if (value <= 0) return null;
  const account = findAccount(accounts, { accountType }) || findAccount(accounts, { code: SYSTEM_CODES[accountType] });
  if (!account) throw new Error(`Missing ${accountType} account in the chart of accounts`);
  return {
    coaId: account.id,
    code: account.code,
    debit: side === "debit" ? value : 0,
    credit: side === "credit" ? value : 0,
  };
};

export function receiptLines({ accounts, cash = 0, upi = 0, bank = 0, receivableCode = SYSTEM_CODES.receivable, partyId = null, description = "" }) {
  const lines = [
    moneyLine(accounts, "cash", cash, "debit"),
    moneyLine(accounts, "upi", upi, "debit"),
    moneyLine(accounts, "bank", bank, "debit"),
  ].filter(Boolean);
  const total = roundMoney(cash + upi + bank);
  const receivable = findAccount(accounts, { code: receivableCode }) || findAccount(accounts, { accountType: "receivable" });
  if (!receivable) throw new Error("Missing receivable account");
  lines.push({
    coaId: receivable.id,
    code: receivable.code,
    partyId,
    debit: 0,
    credit: total,
    description,
  });
  return lines;
}

export function paymentLines({ accounts, cash = 0, upi = 0, bank = 0, expenseCode = SYSTEM_CODES.otherExpense, payableCode, partyId = null, description = "" }) {
  const total = roundMoney(cash + upi + bank);
  const debitAccount = findAccount(accounts, { code: payableCode || expenseCode });
  if (!debitAccount) throw new Error("Missing expense or payable account");
  const lines = [{
    coaId: debitAccount.id,
    code: debitAccount.code,
    partyId,
    debit: total,
    credit: 0,
    description,
  }];
  const credits = [
    moneyLine(accounts, "cash", cash, "credit"),
    moneyLine(accounts, "upi", upi, "credit"),
    moneyLine(accounts, "bank", bank, "credit"),
  ].filter(Boolean);
  return [...lines, ...credits];
}

export function contraLines({ accounts, fromType, toType, fromAccountId, toAccountId, amount, description = "" }) {
  const value = roundMoney(amount);
  const fromAccount = fromAccountId
    ? (accounts || []).find(account => account.id === fromAccountId || account.code === fromAccountId)
    : findAccount(accounts, { accountType: fromType });
  const toAccount = toAccountId
    ? (accounts || []).find(account => account.id === toAccountId || account.code === toAccountId)
    : findAccount(accounts, { accountType: toType });
  if (!fromAccount || !toAccount) throw new Error("Missing cash, bank or UPI account");
  if (!isMoneyAccount(fromAccount) || !isMoneyAccount(toAccount)) {
    throw new Error("Transfer must use cash, bank or UPI accounts");
  }
  if ((fromAccount.id || fromAccount.code) === (toAccount.id || toAccount.code)) {
    throw new Error("Choose two different accounts to transfer");
  }
  return [
    { coaId: toAccount.id, code: toAccount.code, debit: value, credit: 0, description },
    { coaId: fromAccount.id, code: fromAccount.code, debit: 0, credit: value, description },
  ];
}

export function moneyByMode(mode, amount) {
  const value = roundMoney(amount);
  return {
    cash: mode === "cash" ? value : 0,
    upi: mode === "upi" ? value : 0,
    bank: mode === "bank" ? value : 0,
  };
}

export function resolveAccountCode(accounts, code, fallbackCode) {
  return findAccount(accounts, { code })?.code || findAccount(accounts, { code: fallbackCode })?.code || fallbackCode;
}

export function saleLines({ accounts, amount, settlement = "credit", moneyMode = "cash", partyId = null, description = "" }) {
  const value = roundMoney(amount);
  const sales = findAccount(accounts, { code: SYSTEM_CODES.sales });
  if (!sales) throw new Error("Missing Sales account");
  const credit = { coaId: sales.id, code: sales.code, debit: 0, credit: value, description };
  if (settlement === "credit") {
    const receivable = findAccount(accounts, { code: SYSTEM_CODES.receivable }) || findAccount(accounts, { accountType: "receivable" });
    if (!receivable) throw new Error("Missing Accounts Receivable");
    return [
      { coaId: receivable.id, code: receivable.code, partyId, debit: value, credit: 0, description },
      credit,
    ];
  }
  const split = moneyByMode(moneyMode, value);
  return [
    moneyLine(accounts, "cash", split.cash, "debit"),
    moneyLine(accounts, "upi", split.upi, "debit"),
    moneyLine(accounts, "bank", split.bank, "debit"),
  ].filter(Boolean).map(line => ({ ...line, description })).concat(credit);
}

export function creditNoteLines({ accounts, amount, partyId, description = "" }) {
  const value = roundMoney(amount);
  const sales = findAccount(accounts, { code: SYSTEM_CODES.sales });
  const receivable = findAccount(accounts, { code: SYSTEM_CODES.receivable }) || findAccount(accounts, { accountType: "receivable" });
  if (!sales) throw new Error("Missing Sales account");
  if (!receivable) throw new Error("Missing Accounts Receivable");
  if (!partyId) throw new Error("Choose the customer");
  return [
    { coaId: sales.id, code: sales.code, debit: value, credit: 0, description },
    { coaId: receivable.id, code: receivable.code, partyId, debit: 0, credit: value, description },
  ];
}

export function debitNoteLines({ accounts, amount, partyId, description = "" }) {
  const value = roundMoney(amount);
  const purchase = findAccount(accounts, { code: SYSTEM_CODES.purchase });
  const payable = findAccount(accounts, { code: SYSTEM_CODES.payable }) || findAccount(accounts, { accountType: "payable" });
  if (!purchase) throw new Error("Missing Purchase account");
  if (!payable) throw new Error("Missing Accounts Payable");
  if (!partyId) throw new Error("Choose the supplier");
  return [
    { coaId: payable.id, code: payable.code, partyId, debit: value, credit: 0, description },
    { coaId: purchase.id, code: purchase.code, debit: 0, credit: value, description },
  ];
}

export function purchaseLines({ accounts, amount, settlement = "credit", moneyMode = "cash", partyId = null, description = "" }) {
  const value = roundMoney(amount);
  const purchase = findAccount(accounts, { code: SYSTEM_CODES.purchase });
  if (!purchase) throw new Error("Missing Purchase account");
  const debit = { coaId: purchase.id, code: purchase.code, debit: value, credit: 0, description };
  if (settlement === "credit") {
    const payable = findAccount(accounts, { code: SYSTEM_CODES.payable }) || findAccount(accounts, { accountType: "payable" });
    if (!payable) throw new Error("Missing Accounts Payable");
    return [
      debit,
      { coaId: payable.id, code: payable.code, partyId, debit: 0, credit: value, description },
    ];
  }
  const split = moneyByMode(moneyMode, value);
  return [
    debit,
    ...[
      moneyLine(accounts, "cash", split.cash, "credit"),
      moneyLine(accounts, "upi", split.upi, "credit"),
      moneyLine(accounts, "bank", split.bank, "credit"),
    ].filter(Boolean).map(line => ({ ...line, description })),
  ];
}

export function simpleEntryDraft({
  kind,
  accounts,
  date,
  amount,
  partyId = null,
  moneyMode = "cash",
  settlement = "credit",
  expenseCode = SYSTEM_CODES.otherExpense,
  fromType = "cash",
  toType = "bank",
  fromAccountId = null,
  toAccountId = null,
  dueDate = null,
  narration = "",
  today,
} = {}) {
  assertVoucherDateNotFuture(date, today);
  const value = roundMoney(amount);
  if (value <= 0) throw new Error("Enter an amount greater than zero");
  const split = moneyByMode(moneyMode, value);
  const description = String(narration || "").trim();
  const invoiceDue = settlement === "credit" ? (dueDate || addDaysIso(date, 7)) : null;

  if (kind === "sale") {
    if (settlement === "credit" && !partyId) throw new Error("Choose the customer");
    return {
      voucherType: "sales",
      date,
      dueDate: invoiceDue,
      partyId: partyId || null,
      narration: description || (settlement === "credit" ? "Credit sale" : `${MONEY_MODES.find(mode => mode.id === moneyMode)?.label || "Cash"} sale`),
      lines: saleLines({ accounts, amount: value, settlement, moneyMode, partyId, description }),
    };
  }
  if (kind === "purchase") {
    if (settlement === "credit" && !partyId) throw new Error("Choose the supplier");
    return {
      voucherType: "purchase",
      date,
      dueDate: invoiceDue,
      partyId: partyId || null,
      narration: description || (settlement === "credit" ? "Credit purchase" : `${MONEY_MODES.find(mode => mode.id === moneyMode)?.label || "Cash"} purchase`),
      lines: purchaseLines({ accounts, amount: value, settlement, moneyMode, partyId, description }),
    };
  }
  if (kind === "expense") {
    const code = resolveAccountCode(accounts, expenseCode, SYSTEM_CODES.otherExpense);
    const name = findAccount(accounts, { code })?.name || "Expense";
    return {
      voucherType: "payment",
      date,
      partyId: null,
      narration: description || name,
      lines: paymentLines({ accounts, ...split, expenseCode: code, description: description || name }),
    };
  }
  if (kind === "receipt") {
    if (!partyId) throw new Error("Choose the customer");
    return {
      voucherType: "receipt",
      date,
      partyId,
      narration: description || "Customer receipt",
      lines: receiptLines({ accounts, ...split, receivableCode: SYSTEM_CODES.receivable, partyId, description }),
    };
  }
  if (kind === "payment") {
    if (!partyId) throw new Error("Choose the supplier");
    return {
      voucherType: "payment",
      date,
      partyId,
      narration: description || "Supplier payment",
      lines: paymentLines({ accounts, ...split, payableCode: SYSTEM_CODES.payable, partyId, description }),
    };
  }
  if (kind === "credit_note") {
    if (!partyId) throw new Error("Choose the customer");
    return {
      voucherType: "credit_note",
      date,
      partyId,
      narration: description || "Credit note",
      lines: creditNoteLines({ accounts, amount: value, partyId, description }),
    };
  }
  if (kind === "debit_note") {
    if (!partyId) throw new Error("Choose the supplier");
    return {
      voucherType: "debit_note",
      date,
      partyId,
      narration: description || "Debit note",
      lines: debitNoteLines({ accounts, amount: value, partyId, description }),
    };
  }
  if (kind === "transfer") {
    if (fromAccountId && toAccountId && fromAccountId === toAccountId) {
      throw new Error("Choose two different accounts to transfer");
    }
    if (!fromAccountId && !toAccountId && fromType === toType) {
      throw new Error("Choose two different accounts to transfer");
    }
    const fromAccount = fromAccountId
      ? (accounts || []).find(account => account.id === fromAccountId || account.code === fromAccountId)
      : findAccount(accounts, { accountType: fromType });
    const toAccount = toAccountId
      ? (accounts || []).find(account => account.id === toAccountId || account.code === toAccountId)
      : findAccount(accounts, { accountType: toType });
    return {
      voucherType: "contra",
      date,
      partyId: null,
      narration: description || `Transfer ${fromAccount?.name || fromType} to ${toAccount?.name || toType}`,
      lines: contraLines({
        accounts,
        fromType,
        toType,
        fromAccountId: fromAccount?.id || fromAccountId,
        toAccountId: toAccount?.id || toAccountId,
        amount: value,
        description,
      }),
    };
  }
  throw new Error("Unknown entry type");
}

export function disbursementLines({ accounts, cash = 0, upi = 0, bank = 0, receivableCode = SYSTEM_CODES.dailyReceivable, partyId = null, description = "" }) {
  const total = roundMoney(cash + upi + bank);
  const receivable = findAccount(accounts, { code: receivableCode });
  if (!receivable) throw new Error("Missing finance receivable account");
  return [
    {
      coaId: receivable.id,
      code: receivable.code,
      partyId,
      debit: total,
      credit: 0,
      description,
    },
    ...[
      moneyLine(accounts, "cash", cash, "credit"),
      moneyLine(accounts, "upi", upi, "credit"),
      moneyLine(accounts, "bank", bank, "credit"),
    ].filter(Boolean),
  ];
}

export function receivableCodeForSource(sourceType, financeKind) {
  if (String(sourceType || "").startsWith("chit_")) return SYSTEM_CODES.chitReceivable;
  if (financeKind === "monthly" || String(sourceType || "").includes("monthly")) return SYSTEM_CODES.monthlyReceivable;
  if (financeKind === "daily" || String(sourceType || "").includes("daily")) return SYSTEM_CODES.dailyReceivable;
  return SYSTEM_CODES.receivable;
}

export function groupCashbookBySource(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    if (!entry.sourceType || !entry.sourceId) continue;
    const key = `${entry.sourceType}:${entry.sourceId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.values()];
}

const modeAmount = (entries, type) => roundMoney(
  entries
    .filter(entry => entry.ledgerType === type || entry.paymentMode === type)
    .reduce((sum, entry) => sum + Number(entry.moneyIn || 0) + Number(entry.moneyOut || 0), 0),
);

export function integrationVoucherFromCashbookGroup(accounts, entries, { financeKind } = {}) {
  if (!entries?.length) return null;
  const sample = entries[0];
  const cash = modeAmount(entries, "cash");
  const upi = modeAmount(entries, "upi");
  const bank = modeAmount(entries, "bank");
  const receivableCode = receivableCodeForSource(sample.sourceType, financeKind);
  const moneyIn = entries.reduce((sum, entry) => sum + Number(entry.moneyIn || 0), 0);
  const moneyOut = entries.reduce((sum, entry) => sum + Number(entry.moneyOut || 0), 0);

  if (sample.sourceType === "finance_payment" || String(sample.sourceType || "").startsWith("chit_") && moneyIn > 0 && !String(sample.sourceType).includes("payout") && !String(sample.sourceType).includes("lift")) {
    return {
      voucherType: "receipt",
      date: sample.entryDate,
      narration: sample.description,
      sourceModule: String(sample.sourceType).startsWith("chit_") ? "chit" : "finance",
      sourceType: sample.sourceType,
      sourceTransactionId: sample.sourceId,
      lines: receiptLines({ accounts, cash, upi, bank, receivableCode, description: sample.description }),
    };
  }
  if (sample.sourceType === "finance_disbursement") {
    return {
      voucherType: "payment",
      date: sample.entryDate,
      narration: sample.description,
      sourceModule: "finance",
      sourceType: sample.sourceType,
      sourceTransactionId: sample.sourceId,
      lines: disbursementLines({
        accounts,
        cash,
        upi,
        bank,
        receivableCode,
        description: sample.description,
      }),
    };
  }
  if (["chit_fixed_lift", "chit_predefined_payout", "chit_auction_payout"].includes(sample.sourceType) || String(sample.sourceType).includes("payout")) {
    return {
      voucherType: "payment",
      date: sample.entryDate,
      narration: sample.description,
      sourceModule: "chit",
      sourceType: sample.sourceType,
      sourceTransactionId: sample.sourceId,
      lines: paymentLines({
        accounts,
        cash,
        upi,
        bank,
        expenseCode: receivableCode,
        description: sample.description,
      }),
    };
  }
  if (sample.sourceType === "transfer") {
    const out = entries.find(entry => Number(entry.moneyOut || 0) > 0);
    const incoming = entries.find(entry => Number(entry.moneyIn || 0) > 0);
    if (!out || !incoming) return null;
    return {
      voucherType: "contra",
      date: sample.entryDate,
      narration: sample.description,
      sourceModule: "cashbook",
      sourceType: sample.sourceType,
      sourceTransactionId: sample.sourceId,
      lines: contraLines({
        accounts,
        fromType: out.ledgerType || out.paymentMode,
        toType: incoming.ledgerType || incoming.paymentMode,
        amount: moneyOut || moneyIn,
        description: sample.description,
      }),
    };
  }
  if (sample.sourceType === "expense" || (moneyOut > 0 && moneyIn === 0 && sample.sourceType === "manual")) {
    return {
      voucherType: "payment",
      date: sample.entryDate,
      narration: sample.description,
      sourceModule: "cashbook",
      sourceType: sample.sourceType,
      sourceTransactionId: sample.sourceId,
      lines: paymentLines({ accounts, cash, upi, bank, description: sample.description }),
    };
  }
  if (moneyIn > 0 && moneyOut === 0) {
    return {
      voucherType: "receipt",
      date: sample.entryDate,
      narration: sample.description,
      sourceModule: "cashbook",
      sourceType: sample.sourceType,
      sourceTransactionId: sample.sourceId,
      lines: receiptLines({ accounts, cash, upi, bank, receivableCode: SYSTEM_CODES.otherIncome, description: sample.description }),
    };
  }
  return null;
}

export function buildIntegrationVouchers(accounts, cashbookEntries, { enabled = false, existing = [], financeKindBySource = {} } = {}) {
  if (!enabled) return [];
  const postedKeys = new Set(
    (existing || [])
      .filter(voucher => affectsLedgers(voucher) && voucher.sourceTransactionId)
      .map(voucher => `${voucher.sourceType}:${voucher.sourceTransactionId}`),
  );
  const created = [];
  for (const group of groupCashbookBySource(cashbookEntries)) {
    const sample = group[0];
    const key = `${sample.sourceType}:${sample.sourceId}`;
    if (postedKeys.has(key)) continue;
    const draft = integrationVoucherFromCashbookGroup(accounts, group, {
      financeKind: financeKindBySource[sample.sourceId],
    });
    if (!draft) continue;
    created.push(buildVoucher({
      ...draft,
      voucherNumber: formatVoucherNumber(draft.voucherType, nextVoucherSequence([...existing, ...created], draft.voucherType)),
    }));
  }
  return created;
}

export const auditEvent = ({ entityType, entityId, action, actorId, oldValue, newValue, reason }) => ({
  entityType,
  entityId,
  action,
  actorId,
  oldValue: oldValue ?? null,
  newValue: newValue ?? null,
  reason: reason || "",
  createdAt: new Date().toISOString(),
});
