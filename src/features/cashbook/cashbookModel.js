import { formatIstDateTime, todayIso } from "../../lib/dates.js";

export const EXPENSE_CATEGORIES = [
  "Rent", "Salary", "Agent Commission", "Fuel", "Electricity", "Internet",
  "Office Supplies", "Maintenance", "Marketing", "Travel", "Bank Charges", "Other",
];

export const MANUAL_IN_CATEGORIES = ["Other Income", "Capital Added", "Loan Received", "Other"];
export const MANUAL_OUT_CATEGORIES = ["Expense", "Miscellaneous", "Other"];

const addCalendarDays = (iso, days) => {
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

export { todayIso, formatIstDateTime };

export const dateRangeForFilter = (filter, customFrom, customTo, now = new Date()) => {
  const today = todayIso(now);
  if (filter === "today") return { from: today, to: today };
  if (filter === "yesterday") {
    const yesterday = addCalendarDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (filter === "week") {
    const weekday = new Date(`${today}T12:00:00+05:30`).getUTCDay();
    return { from: addCalendarDays(today, -weekday), to: today };
  }
  if (filter === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  if (filter === "all") return { from: "1970-01-01", to: "2099-12-31" };
  return { from: customFrom || today, to: customTo || today };
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

/**
 * Pair transfer_out / transfer_in legs into one history row (by sourceId).
 * Sorted newest first for the Transfers tab.
 */
export function buildTransferHistory(entries = [], range = null) {
  const legs = (entries || []).filter(entry =>
    entry.sourceType === "transfer" || isInternalTransfer(entry));
  const inRange = range
    ? legs.filter(entry => entry.entryDate >= range.from && entry.entryDate <= range.to)
    : legs;
  const bySource = new Map();
  for (const entry of inRange) {
    const key = entry.sourceId || `solo:${entry.id}`;
    const bucket = bySource.get(key) || { out: null, in: null, extras: [] };
    if (entry.transactionType === "transfer_out" || Number(entry.moneyOut || 0) > 0) bucket.out = entry;
    else if (entry.transactionType === "transfer_in" || Number(entry.moneyIn || 0) > 0) bucket.in = entry;
    else bucket.extras.push(entry);
    bySource.set(key, bucket);
  }
  const rows = [];
  for (const [sourceId, bucket] of bySource) {
    const out = bucket.out;
    const inn = bucket.in;
    const amount = Number(out?.moneyOut || inn?.moneyIn || 0);
    const entryDate = out?.entryDate || inn?.entryDate || "";
    const createdAt = out?.createdAt || inn?.createdAt || "";
    const description = [out?.description, inn?.description]
      .map(value => String(value || "").trim())
      .find(value => value && value !== "Transfer out" && value !== "Transfer in") || "";
    rows.push({
      id: sourceId,
      entryDate,
      createdAt,
      fromLedgerId: out?.ledgerAccountId || "",
      fromName: out?.ledgerName || "—",
      toLedgerId: inn?.ledgerAccountId || "",
      toName: inn?.ledgerName || "—",
      amount,
      description,
      notes: out?.notes || inn?.notes || "",
      complete: Boolean(out && inn),
    });
  }
  return rows.sort((a, b) =>
    `${b.entryDate}${b.createdAt}${b.id}`.localeCompare(`${a.entryDate}${a.createdAt}${a.id}`));
}

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

const isOpeningEntry = entry =>
  entry.sourceType === "opening_balance" || entry.transactionType === "opening_balance";

const roundPaise = value => Math.round(Number(value || 0) * 100) / 100;

/**
 * For every cash, bank or UPI account whose running balance is below zero,
 * split the balance into the parts that produced it so the owner can see why:
 * opening + money in - money out + transfers in - transfers out = balance.
 * Read-only: it never changes or invents an entry.
 */
export function explainNegativeBalances(ledgers = [], entries = [], { topOut = 3 } = {}) {
  const positiveNames = [];
  const negatives = [];
  for (const ledger of ledgers || []) {
    const own = (entries || []).filter(entry => entry.ledgerAccountId === ledger.id);
    const parts = { opening: 0, moneyIn: 0, moneyOut: 0, transfersIn: 0, transfersOut: 0 };
    let hasOpening = false;
    for (const entry of own) {
      const moneyIn = Number(entry.moneyIn || 0);
      const moneyOut = Number(entry.moneyOut || 0);
      if (isOpeningEntry(entry)) {
        hasOpening = true;
        parts.opening += moneyIn - moneyOut;
      } else if (isInternalTransfer(entry) || entry.sourceType === "transfer") {
        parts.transfersIn += moneyIn;
        parts.transfersOut += moneyOut;
      } else {
        parts.moneyIn += moneyIn;
        parts.moneyOut += moneyOut;
      }
    }
    const balance = roundPaise(parts.opening + parts.moneyIn - parts.moneyOut + parts.transfersIn - parts.transfersOut);
    if (balance > 0) positiveNames.push(ledger.name);
    if (balance >= 0) continue;
    const largestOut = own
      .filter(entry => Number(entry.moneyOut || 0) > 0 && !isOpeningEntry(entry))
      .sort((a, b) => Number(b.moneyOut || 0) - Number(a.moneyOut || 0)
        || `${b.entryDate}${b.id || ""}`.localeCompare(`${a.entryDate}${a.id || ""}`))
      .slice(0, topOut)
      .map(entry => ({
        id: entry.id,
        entryDate: entry.entryDate,
        description: entry.description || entry.category || "Money out",
        category: entry.category || "",
        amount: Number(entry.moneyOut || 0),
      }));
    negatives.push({
      id: ledger.id,
      name: ledger.name,
      accountType: ledger.accountType,
      balance,
      hasOpening,
      opening: roundPaise(parts.opening),
      moneyIn: roundPaise(parts.moneyIn),
      moneyOut: roundPaise(parts.moneyOut),
      transfersIn: roundPaise(parts.transfersIn),
      transfersOut: roundPaise(parts.transfersOut),
      largestOut,
    });
  }
  return negatives.map(item => ({
    ...item,
    reasons: negativeBalanceReasons(item, positiveNames.filter(name => name !== item.name)),
  }));
}

function negativeBalanceReasons(item, otherPositive) {
  const reasons = [];
  if (!item.hasOpening || item.opening === 0) {
    reasons.push(`No opening balance is recorded for ${item.name}. Money that was already there before you started using the cashbook is not counted.`);
  }
  if (otherPositive.length) {
    reasons.push(`Payouts may have been recorded on ${item.name} while the matching collections arrived in ${otherPositive.join(", ")}. If you moved money between them, record a transfer.`);
  }
  if (item.transfersOut > item.transfersIn && item.transfersOut > 0) {
    reasons.push(`More was transferred out of ${item.name} than into it.`);
  }
  reasons.push(`Otherwise an amount may be entered on the wrong account or missing. Check the largest money-out entries below.`);
  return reasons;
}

export const runningBalancesForLedger = (entries, ledgerId) =>
  withRunningBalances(entries.filter(entry => entry.ledgerAccountId === ledgerId));

export const entryNet = entry => Number(entry.moneyIn || 0) - Number(entry.moneyOut || 0);

export const netMovement = entries => (entries || []).reduce((sum, entry) => sum + entryNet(entry), 0);

export const withRunningBalances = (entries, opening = 0) => {
  const sorted = [...entries].sort((a, b) =>
    `${a.entryDate}${a.entryTime}${a.createdAt || ""}${a.id || ""}`.localeCompare(
      `${b.entryDate}${b.entryTime}${b.createdAt || ""}${b.id || ""}`,
    ));
  let balance = Number(opening) || 0;
  return sorted.map(entry => {
    balance += entryNet(entry);
    return { ...entry, balance };
  }).reverse();
};

/** Rows inside the period, with a running balance that starts from everything earlier. */
export function cashbookPeriodRows(entries, range, filters = {}) {
  const matched = filterCashbookEntries(entries, filters);
  const prior = matched.filter(entry => entry.entryDate < range.from);
  const current = matched.filter(entry => entry.entryDate >= range.from && entry.entryDate <= range.to);
  const broughtForward = netMovement(prior);
  return {
    broughtForward,
    priorCount: prior.length,
    rows: withRunningBalances(current, broughtForward),
  };
};

export const CASHBOOK_SOURCE_FILTERS = [
  { id: "all", label: "All sources" },
  { id: "daily", label: "Daily Finance" },
  { id: "monthly", label: "Monthly Finance" },
  { id: "chit", label: "Chit Fund" },
];

const inferFinanceKind = (entry, loanById = {}) => {
  const loan = loanById[entry.financeAccountId];
  if (loan?.kind === "daily" || loan?.kind === "monthly") return loan.kind;
  const category = String(entry.category || "").toLowerCase();
  const description = String(entry.description || "").toLowerCase();
  if (category.includes("monthly") || description.includes("monthly collection") || description.includes("principal financed")) {
    return "monthly";
  }
  if (category.includes("daily") || description.includes("daily collection") || description.includes("paid to customer")) {
    return "daily";
  }
  return null;
};

export const cashbookSourceKind = (entry, loanById = {}) => {
  if (String(entry.sourceType || "").startsWith("chit_")) return "chit";
  return inferFinanceKind(entry, loanById);
};

export const filterCashbookEntries = (entries, {
  search = "",
  accountId = "all",
  direction = "all",
  category = "all",
  source = "all",
  loanById = {},
} = {}) => {
  const q = search.trim().toLowerCase();
  return entries.filter(entry => {
    if (accountId !== "all" && entry.ledgerAccountId !== accountId) return false;
    if (direction === "in" && Number(entry.moneyIn || 0) <= 0) return false;
    if (direction === "out" && Number(entry.moneyOut || 0) <= 0) return false;
    if (direction === "transfer" && !["transfer_in", "transfer_out"].includes(entry.transactionType)) return false;
    if (category !== "all" && entry.category !== category) return false;
    if (source !== "all" && cashbookSourceKind(entry, loanById) !== source) return false;
    if (!q) return true;
    const hay = [
      entry.description, entry.category, entry.reference, entry.receiptNumber,
      entry.customerName, entry.notes, entry.ledgerName,
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });
};

export const sourceOriginLabel = (entry, loanById = {}) => {
  if (!entry.sourceType || entry.isEditable) return null;
  const kind = cashbookSourceKind(entry, loanById);
  if (entry.sourceType === "finance_payment") {
    if (kind === "monthly") return "Monthly Finance collection";
    if (kind === "daily") return "Daily Finance collection";
    return "Finance collection";
  }
  if (entry.sourceType === "finance_disbursement") {
    if (kind === "monthly") return "Monthly Finance disbursement";
    if (kind === "daily") return "Daily Finance disbursement";
    return "Finance disbursement";
  }
  const map = {
    chit_auction: "Chit Fund (Auction)",
    chit_fixed: "Chit Fund (Fixed)",
    chit_predefined: "Chit Fund (Predefined Bid)",
    chit_fixed_lift: "Chit Fund payout (Fixed)",
    chit_predefined_payout: "Chit Fund payout (Predefined Bid)",
    chit_auction_payout: "Chit Fund payout (Auction)",
    expense: "Manual expense",
    transfer: "Transfer",
    opening_balance: "Opening balance",
  };
  return map[entry.sourceType] || (kind === "chit" ? "Chit Fund" : "Linked transaction");
};

export const formatCompactMoney = value => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
};
