import { affectsLedgers, isReversalVoucher } from "../../accounts/model/accountingModel.js";
import { invoiceRegister } from "../../accounts/model/accountingReports.js";
import {
  addDaysIso,
  advisory,
  average,
  bySeverity,
  daysBetween,
  formatInr,
  isoDate,
  median,
  n,
  roundMoney,
  source,
  stdDev,
} from "./aiCommon.js";

const voucherAmount = voucher => roundMoney((voucher.lines || []).reduce((sum, line) => sum + n(line.debit), 0));
const istHour = timestamp => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(date)) % 24;
};

/** Values far above a baseline built from *other* rows, so one outlier cannot hide itself. */
function outlier(value, others, { minSamples = 4, z = 3, ratio = 2 } = {}) {
  if (others.length < minSamples) return null;
  const mean = average(others);
  const sd = stdDev(others);
  const mid = median(others);
  if (!(mid > 0)) return null;
  const aboveZ = sd > 0 ? (value - mean) / sd >= z : value > mean * ratio;
  if (!aboveZ || value < mid * ratio) return null;
  return { expected: roundMoney(mean), median: roundMoney(mid) };
}

/**
 * Continuous anomaly review across vouchers, invoices, payments, stock, bank lines, and cashbook. Every alert
 * cites the record and the pattern it differs from; nothing is reversed, deleted, blocked, or edited.
 */
export function buildAnomalyAlerts({
  accounts = [],
  vouchers = [],
  parties = [],
  stockMovements = [],
  items = [],
  statements = [],
  cashbookEntries = [],
  asOf,
  lookbackDays = 90,
} = {}) {
  const today = isoDate(asOf);
  const since = addDaysIso(today, -lookbackDays);
  const partyName = new Map((parties || []).map(party => [party.id, party.name]));
  const itemName = new Map((items || []).map(item => [item.id, item.name]));
  const posted = (vouchers || []).filter(voucher => affectsLedgers(voucher) && !isReversalVoucher(voucher) && voucher.status !== "reversed");
  const recent = posted.filter(voucher => isoDate(voucher.date) >= since);
  const alerts = [];
  const voucherLink = voucher => source("vouchers", `Open ${voucher.voucherNumber || "voucher"}`, { voucherId: voucher.id });

  const bySupplier = new Map();
  for (const voucher of posted.filter(row => row.voucherType === "purchase" && row.partyId)) {
    if (!bySupplier.has(voucher.partyId)) bySupplier.set(voucher.partyId, []);
    bySupplier.get(voucher.partyId).push(voucher);
  }
  for (const [supplierId, bills] of bySupplier) {
    for (const bill of bills.filter(row => isoDate(row.date) >= since)) {
      const amount = voucherAmount(bill);
      const others = bills.filter(row => row.id !== bill.id).map(voucherAmount);
      const found = outlier(amount, others);
      if (!found) continue;
      alerts.push(advisory({
        id: `anomaly-supplier-bill-${bill.id}`,
        pattern: "supplier_invoice_above_average",
        title: `Unusual supplier bill: ${partyName.get(supplierId) || "Supplier"}`,
        severity: amount >= found.expected * 4 ? "high" : "medium",
        module: "Purchases",
        record: `${bill.voucherNumber} · ${isoDate(bill.date)}`,
        expected: `About ${formatInr(found.expected)} (median ${formatInr(found.median)}) over ${others.length} bills`,
        actual: formatInr(amount),
        difference: roundMoney(amount - found.expected),
        explanation: "This bill is far above the supplier's usual bill size.",
        recommendedAction: "Requires review: confirm quantities and rates against the supplier invoice.",
        confidence: others.length >= 8 ? "high" : "medium",
        confidencePct: others.length >= 8 ? 80 : 60,
        source: voucherLink(bill),
      }));
    }
  }

  const byLedger = new Map();
  for (const voucher of posted.filter(row => row.voucherType === "expense")) {
    for (const line of voucher.lines || []) {
      if (!(n(line.debit) > 0)) continue;
      const key = line.coaId || line.code;
      if (!byLedger.has(key)) byLedger.set(key, []);
      byLedger.get(key).push({ voucher, amount: n(line.debit), name: line.name || line.code });
    }
  }
  for (const rows of byLedger.values()) {
    for (const row of rows.filter(item => isoDate(item.voucher.date) >= since)) {
      const others = rows.filter(item => item.voucher.id !== row.voucher.id).map(item => item.amount);
      const found = outlier(row.amount, others, { minSamples: 5 });
      if (!found) continue;
      alerts.push(advisory({
        id: `anomaly-expense-${row.voucher.id}-${row.name}`,
        pattern: "unusual_expense",
        title: `Unusual expense: ${row.name || "Expense"}`,
        severity: "medium",
        module: "Expenses",
        record: `${row.voucher.voucherNumber} · ${isoDate(row.voucher.date)}`,
        expected: `About ${formatInr(found.expected)} per entry`,
        actual: formatInr(row.amount),
        difference: roundMoney(row.amount - found.expected),
        explanation: `This entry is far above the usual amount booked to ${row.name || "this ledger"}.`,
        recommendedAction: "Requires review: check the bill or approval for this expense.",
        confidence: others.length >= 10 ? "high" : "medium",
        confidencePct: others.length >= 10 ? 80 : 60,
        source: voucherLink(row.voucher),
      }));
    }
  }

  const seen = new Set();
  const dupTypes = new Set(["sales", "purchase", "receipt", "payment", "expense"]);
  const candidates = recent.filter(voucher => dupTypes.has(voucher.voucherType));
  for (const voucher of candidates) {
    for (const other of candidates) {
      if (other.id <= voucher.id || other.voucherType !== voucher.voucherType) continue;
      if ((other.partyId || "") !== (voucher.partyId || "")) continue;
      const amount = voucherAmount(voucher);
      if (!(amount > 0) || amount !== voucherAmount(other)) continue;
      const gap = Math.abs(daysBetween(voucher.date, other.date) ?? 99);
      if (gap > 3) continue;
      const key = [voucher.id, other.id].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      const isBill = voucher.voucherType === "purchase" || voucher.voucherType === "sales";
      alerts.push(advisory({
        id: `anomaly-duplicate-${key}`,
        pattern: isBill ? "possible_duplicate_invoice" : "possible_duplicate_transaction",
        title: `Possible duplicate ${isBill ? "invoice" : "transaction"}`,
        severity: voucher.voucherType === "purchase" || voucher.voucherType === "payment" ? "high" : "medium",
        module: "Transactions",
        record: `${voucher.voucherNumber} and ${other.voucherNumber}`,
        expected: "One entry per bill or payment",
        actual: `Two ${voucher.voucherType} entries of ${formatInr(amount)}${voucher.partyId ? ` for ${partyName.get(voucher.partyId) || "the same party"}` : ""} ${gap === 0 ? "on the same day" : `${gap} day(s) apart`}`,
        difference: amount,
        explanation: "Same type, party, and amount within three days.",
        recommendedAction: "Requires review: if one is a duplicate, cancel or reverse it through the normal voucher flow.",
        confidence: gap === 0 ? "high" : "medium",
        confidencePct: gap === 0 ? 80 : 60,
        source: voucherLink(voucher),
        relatedSource: voucherLink(other),
        duplicateIds: [voucher.id, other.id],
      }));
    }
  }

  const partial = invoiceRegister(accounts, vouchers, parties, { kind: "receivable", today, outstandingOnly: true })
    .filter(row => n(row.paid) > 0 && n(row.outstanding) > 0 && isoDate(row.invoiceDate) >= since);
  for (const row of partial) {
    alerts.push(advisory({
      id: `anomaly-partial-${row.id}`,
      pattern: "customer_partial_payment",
      title: `Customer partial payment: ${row.partyName}`,
      severity: n(row.daysOverdue) > 0 ? "medium" : "low",
      module: "Receivables",
      record: `${row.reference} · ${isoDate(row.invoiceDate)}`,
      expected: `Full payment of ${formatInr(row.amount)}`,
      actual: `${formatInr(row.paid)} received`,
      difference: roundMoney(row.outstanding),
      explanation: `${formatInr(row.outstanding)} remains open on this invoice.`,
      recommendedAction: "Confirm whether the balance is disputed or still to come.",
      confidence: "high",
      confidencePct: 90,
      source: source("receivables", "Open receivables", { partyId: row.partyId }),
    }));
  }

  for (const voucher of recent) {
    const created = isoDate(voucher.createdAt);
    const lag = created ? daysBetween(voucher.date, created) : null;
    if (lag != null && lag > 30) {
      alerts.push(advisory({
        id: `anomaly-backdated-${voucher.id}`,
        pattern: "possible_backdated_entry",
        title: "Possible backdated entry",
        severity: lag > 90 ? "medium" : "low",
        module: "Transactions",
        record: `${voucher.voucherNumber} · dated ${isoDate(voucher.date)}`,
        expected: "Entries recorded within 30 days of their date",
        actual: `Recorded on ${created}, ${lag} days later`,
        difference: lag,
        explanation: "The voucher date is well before the day it was entered.",
        recommendedAction: "Requires review: confirm the date and supporting document.",
        confidence: "high",
        confidencePct: 90,
        source: voucherLink(voucher),
      }));
    }
    const hour = voucher.createdAt ? istHour(voucher.createdAt) : null;
    if (hour != null && hour >= 0 && hour < 5 && voucherAmount(voucher) >= 50000) {
      alerts.push(advisory({
        id: `anomaly-timing-${voucher.id}`,
        pattern: "unusual_timing",
        title: "Unusual entry time",
        severity: "low",
        module: "Transactions",
        record: `${voucher.voucherNumber} · ${formatInr(voucherAmount(voucher))}`,
        expected: "Entries during business hours",
        actual: `Entered at about ${String(hour).padStart(2, "0")}:00 IST`,
        difference: null,
        explanation: "A large entry was recorded between midnight and 5 AM.",
        recommendedAction: "Requires review if this time is unexpected for your team.",
        confidence: "medium",
        confidencePct: 60,
        source: voucherLink(voucher),
      }));
    }
  }
  for (const voucher of (vouchers || []).filter(row => row.status === "reversed" && isoDate(row.date) >= since)) {
    alerts.push(advisory({
      id: `anomaly-corrected-${voucher.id}`,
      pattern: "corrected_entry",
      title: "Corrected entry",
      severity: "low",
      module: "Transactions",
      record: `${voucher.voucherNumber} · ${isoDate(voucher.date)}`,
      expected: "Entries posted once",
      actual: `Reversed${voucher.cancelReason ? `: ${voucher.cancelReason}` : ""}`,
      difference: voucherAmount(voucher),
      explanation: "This voucher was reversed after posting. The audit trail keeps both entries.",
      recommendedAction: "Review that the replacement entry, if any, is correct.",
      confidence: "high",
      confidencePct: 95,
      source: voucherLink(voucher),
    }));
  }

  const adjustmentsByItem = new Map();
  for (const movement of stockMovements || []) {
    if (!movement.itemId) continue;
    if (!adjustmentsByItem.has(movement.itemId)) adjustmentsByItem.set(movement.itemId, []);
    adjustmentsByItem.get(movement.itemId).push(movement);
  }
  for (const [itemId, movements] of adjustmentsByItem) {
    const sizes = movements.filter(row => row.reason !== "adjustment" && row.reason !== "opening").map(row => Math.abs(n(row.quantityDelta)));
    for (const movement of movements.filter(row => row.reason === "adjustment" && isoDate(row.movementDate) >= since)) {
      const size = Math.abs(n(movement.quantityDelta));
      const typical = median(sizes);
      if (sizes.length < 3 || !(typical > 0) || size < typical * 3) continue;
      alerts.push(advisory({
        id: `anomaly-stock-${movement.id}`,
        pattern: "unusual_inventory_adjustment",
        title: `Unusual inventory adjustment: ${itemName.get(itemId) || "Item"}`,
        severity: movement.quantityDelta < 0 ? "medium" : "low",
        module: "Inventory",
        record: `${isoDate(movement.movementDate)}${movement.note ? ` · ${movement.note}` : ""}`,
        expected: `Typical movement about ${roundMoney(typical)} units`,
        actual: `${movement.quantityDelta > 0 ? "+" : ""}${roundMoney(movement.quantityDelta)} units`,
        difference: roundMoney(size - typical),
        explanation: "This manual adjustment is much larger than the item's usual stock movements.",
        recommendedAction: "Requires review: confirm with a physical count.",
        confidence: sizes.length >= 8 ? "high" : "medium",
        confidencePct: sizes.length >= 8 ? 80 : 60,
        source: source("inventory", "Open inventory", { itemId }),
      }));
    }
  }

  const bankLines = (statements || []).flatMap(statement => (statement.lines || []).map(line => ({ ...line, statementName: statement.accountName })));
  for (const direction of ["in", "out"]) {
    const lines = bankLines.filter(line => line.direction === direction);
    for (const line of lines.filter(row => isoDate(row.lineDate) >= since)) {
      const others = lines.filter(row => row.id !== line.id).map(row => n(row.amount));
      const found = outlier(n(line.amount), others, { minSamples: 10, z: 3, ratio: 3 });
      if (!found) continue;
      alerts.push(advisory({
        id: `anomaly-bank-${line.id}`,
        pattern: "unusual_bank_activity",
        title: `Unusual bank ${direction === "in" ? "credit" : "debit"}`,
        severity: "medium",
        module: "Bank",
        record: `${line.statementName || "Bank"} · ${isoDate(line.lineDate)} · ${line.description || ""}`.trim(),
        expected: `About ${formatInr(found.expected)} per line`,
        actual: formatInr(line.amount),
        difference: roundMoney(n(line.amount) - found.expected),
        explanation: "This statement line is far larger than the account's usual activity.",
        recommendedAction: "Requires review: match it to a voucher or confirm with the bank.",
        confidence: "medium",
        confidencePct: 65,
        source: source("bank", "Open bank reconciliation", { lineId: line.id }),
      }));
    }
  }

  const cashOut = (cashbookEntries || []).filter(entry => n(entry.moneyOut) > 0);
  for (const entry of cashOut.filter(row => isoDate(row.entryDate) >= since)) {
    const peers = cashOut.filter(row => row.id !== entry.id && (row.category || "") === (entry.category || "")).map(row => n(row.moneyOut));
    const found = outlier(n(entry.moneyOut), peers, { minSamples: 6 });
    const created = isoDate(entry.createdAt);
    const lag = created ? daysBetween(entry.entryDate, created) : null;
    if (found) {
      alerts.push(advisory({
        id: `anomaly-cashbook-${entry.id}`,
        pattern: "unusual_cashbook_payment",
        title: `Unusual cash payment: ${entry.category || "Cashbook"}`,
        severity: "medium",
        module: "Cashbook",
        record: `${isoDate(entry.entryDate)} · ${entry.description || entry.category || ""}`.trim(),
        expected: `About ${formatInr(found.expected)} per entry`,
        actual: formatInr(entry.moneyOut),
        difference: roundMoney(n(entry.moneyOut) - found.expected),
        explanation: "This cash payment is far above the usual amount for its category.",
        recommendedAction: "Requires review: check the voucher or bill.",
        confidence: "medium",
        confidencePct: 60,
        source: source("cashbook", "Open cashbook", { entryId: entry.id }),
      }));
    }
    if (lag != null && lag > 30 && entry.isEditable !== false) {
      alerts.push(advisory({
        id: `anomaly-cashbook-backdated-${entry.id}`,
        pattern: "possible_backdated_entry",
        title: "Possible backdated cashbook entry",
        severity: "low",
        module: "Cashbook",
        record: `${isoDate(entry.entryDate)} · ${entry.description || entry.category || ""}`.trim(),
        expected: "Entries recorded within 30 days",
        actual: `Recorded ${lag} days later`,
        difference: lag,
        explanation: "The entry date is well before the day it was recorded.",
        recommendedAction: "Requires review: confirm the date.",
        confidence: "high",
        confidencePct: 90,
        source: source("cashbook", "Open cashbook", { entryId: entry.id }),
      }));
    }
  }

  return alerts.sort(bySeverity);
}
