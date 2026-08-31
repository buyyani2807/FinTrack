export const EXPENSE_CATEGORIES = [
  "Rent", "Salary", "Agent Commission", "Fuel", "Electricity", "Internet",
  "Office Supplies", "Maintenance", "Marketing", "Travel", "Bank Charges", "Other",
];

export const MANUAL_IN_CATEGORIES = ["Other Income", "Capital Added", "Loan Received", "Other"];
export const MANUAL_OUT_CATEGORIES = ["Expense", "Miscellaneous", "Other"];

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const dateRangeForFilter = (filter, customFrom, customTo) => {
  const now = new Date();
  const iso = d => d.toISOString().slice(0, 10);
  if (filter === "today") return { from: iso(now), to: iso(now) };
  if (filter === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: iso(y), to: iso(y) };
  }
  if (filter === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    return { from: iso(start), to: iso(now) };
  }
  if (filter === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: iso(start), to: iso(now) };
  }
  return { from: customFrom || iso(now), to: customTo || iso(now) };
};

export const ledgerBalance = (entries, ledgerId) =>
  entries
    .filter(entry => entry.ledgerAccountId === ledgerId)
    .reduce((sum, entry) => sum + Number(entry.moneyIn || 0) - Number(entry.moneyOut || 0), 0);

export const balancesByLedger = (ledgers, entries) =>
  ledgers.map(ledger => ({
    ...ledger,
    balance: ledgerBalance(entries, ledger.id),
  }));

export const isInternalTransfer = entry => ["transfer_in", "transfer_out"].includes(entry.transactionType);

export const aggregateOverview = (ledgers, entries, range) => {
  const inRange = entries.filter(entry => entry.entryDate >= range.from && entry.entryDate <= range.to);
  const operating = inRange.filter(entry => !isInternalTransfer(entry));
  const moneyIn = operating.reduce((sum, entry) => sum + Number(entry.moneyIn || 0), 0);
  const moneyOut = operating.reduce((sum, entry) => sum + Number(entry.moneyOut || 0), 0);
  const withBalances = balancesByLedger(ledgers, entries);
  const cash = withBalances.filter(l => l.accountType === "cash").reduce((s, l) => s + l.balance, 0);
  const upi = withBalances.filter(l => l.accountType === "upi").reduce((s, l) => s + l.balance, 0);
  const bank = withBalances.filter(l => l.accountType === "bank").reduce((s, l) => s + l.balance, 0);
  return {
    cash, upi, bank, total: cash + upi + bank, moneyIn, moneyOut, ledgers: withBalances,
  };
};

export const runningBalancesForLedger = (entries, ledgerId) => {
  const sorted = [...entries]
    .filter(entry => entry.ledgerAccountId === ledgerId)
    .sort((a, b) => `${a.entryDate}${a.entryTime}`.localeCompare(`${b.entryDate}${b.entryTime}`));
  let balance = 0;
  return sorted.map(entry => {
    balance += Number(entry.moneyIn || 0) - Number(entry.moneyOut || 0);
    return { ...entry, balance };
  }).reverse();
};

export const filterCashbookEntries = (entries, {
  search = "",
  accountId = "all",
  direction = "all",
  category = "all",
}) => {
  const q = search.trim().toLowerCase();
  return entries.filter(entry => {
    if (accountId !== "all" && entry.ledgerAccountId !== accountId) return false;
    if (direction === "in" && Number(entry.moneyIn || 0) <= 0) return false;
    if (direction === "out" && Number(entry.moneyOut || 0) <= 0) return false;
    if (direction === "transfer" && !["transfer_in", "transfer_out"].includes(entry.transactionType)) return false;
    if (category !== "all" && entry.category !== category) return false;
    if (!q) return true;
    const hay = [
      entry.description, entry.category, entry.reference, entry.receiptNumber,
      entry.customerName, entry.notes, entry.ledgerName,
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });
};

export const sourceOriginLabel = entry => {
  if (!entry.sourceType || entry.isEditable) return null;
  const map = {
    finance_payment: "Daily/Monthly Finance payment",
    finance_disbursement: "Finance disbursement",
    chit_auction: "Chit Fund (Auction)",
    chit_fixed: "Chit Fund (Fixed)",
    chit_predefined: "Chit Fund (Predefined Bid)",
    expense: "Manual expense",
    transfer: "Transfer",
    opening_balance: "Opening balance",
  };
  return map[entry.sourceType] || "Linked transaction";
};

export const formatCompactMoney = value => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
};
