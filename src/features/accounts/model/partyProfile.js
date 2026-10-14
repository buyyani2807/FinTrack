import { roundMoney } from "./accountingModel.js";
import { invoiceAgingTotals, invoiceRegister, partyLedger } from "./accountingReports.js";

const daysBetween = (from, to) => Math.round(
  (new Date(`${String(to).slice(0, 10)}T00:00:00`) - new Date(`${String(from).slice(0, 10)}T00:00:00`)) / 86400000,
);

export const partyKind = party => (party?.partyType === "supplier" ? "payable" : "receivable");

// One side of the party: sales to them (receivable) or purchases from them (payable).
function partySide({ accounts, vouchers, parties, party, today, kind }) {
  const invoices = invoiceRegister(accounts, vouchers, parties, { kind, today, partyId: party.id });
  const open = invoices
    .filter(row => row.outstanding > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.invoiceDate.localeCompare(b.invoiceDate));
  const aging = invoiceAgingTotals(open);
  const book = partyLedger(accounts, vouchers, party, { kind });
  const creditInvoices = invoices.filter(row => row.onCredit !== false);
  const settled = creditInvoices.filter(row => row.settledOn);
  const payDays = settled.map(row => Math.max(0, daysBetween(row.invoiceDate, row.settledOn)));
  const late = settled.filter(row => row.settledOn > row.dueDate);
  const payments = book.rows
    .filter(row => row.voucherType !== "sales" && row.voucherType !== "purchase" && (kind === "payable" ? row.debit > 0 : row.credit > 0))
    .map(row => ({ ...row, amount: kind === "payable" ? row.debit : row.credit }))
    .reverse();
  return {
    kind,
    active: invoices.length > 0 || book.rows.length > 0,
    invoices,
    creditInvoices,
    open,
    aging,
    book,
    outstanding: book.advance > 0 ? 0 : roundMoney(book.outstanding || 0),
    advance: roundMoney(book.advance || 0),
    overdue: aging.overdue,
    maxDaysOverdue: open.reduce((max, row) => Math.max(max, Number(row.daysOverdue || 0)), 0),
    billed: roundMoney(invoices.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
    invoiceCount: invoices.length,
    paidCount: settled.length,
    avgDaysToPay: payDays.length ? Math.round(payDays.reduce((sum, days) => sum + days, 0) / payDays.length) : null,
    onTimeRate: settled.length ? Math.round(((settled.length - late.length) / settled.length) * 100) : null,
    lateCount: late.length,
    avgDaysLate: late.length ? Math.round(late.reduce((sum, row) => sum + daysBetween(row.dueDate, row.settledOn), 0) / late.length) : 0,
    lastPayment: payments[0] || null,
    payments: payments.slice(0, 6),
  };
}

/**
 * One customer's or supplier's position and payment habits, from every posted voucher (not the report period).
 * A party can be on both sides (you sell to them and buy from them): the side that matches the party type is always
 * shown, the other side only when it has activity, and `net` is what they owe you after what you owe them.
 * Only credit invoices count towards payment habits; a cash sale is settled the moment it is made.
 */
export function partyProfile({ accounts = [], vouchers = [], parties = [], party, today } = {}) {
  if (!party) return null;
  const kind = partyKind(party);
  const base = { accounts, vouchers, parties, party, today };
  const receivable = partySide({ ...base, kind: "receivable" });
  const payable = partySide({ ...base, kind: "payable" });
  const primary = kind === "payable" ? payable : receivable;
  const other = kind === "payable" ? receivable : payable;
  const sides = other.active ? [primary, other] : [primary];
  const owedToYou = roundMoney(receivable.outstanding - receivable.advance);
  const youOwe = roundMoney(payable.outstanding - payable.advance);
  const creditLimit = Number(party.creditLimit || 0);
  return {
    kind,
    primary,
    sides,
    receivable: sides.includes(receivable) ? receivable : null,
    payable: sides.includes(payable) ? payable : null,
    both: sides.length > 1,
    net: roundMoney(owedToYou - youOwe),
    creditLimit,
    creditDays: party.creditDays ?? null,
    limitUsed: creditLimit > 0 ? Math.round((Math.max(0, receivable.outstanding) / creditLimit) * 100) : null,
  };
}
