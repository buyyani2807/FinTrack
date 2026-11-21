/** Counter (POS) day report — totals and tender split for pos_counter sales only. */
import {
  isCancelled,
  isReversed,
  roundMoney,
  voucherTotals,
} from "./accountingModel.js";

/** Counter payment labels. Bank ledger posts are shown as Card at the till. */
export const COUNTER_PAY_MODES = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "cash_upi", label: "Cash + UPI" },
  { id: "bank", label: "Card" },
  { id: "split", label: "Split (cash / UPI / card)" },
];

/** "Cash + Card", "UPI + Card", "Cash + UPI + Card" — the parts that were actually paid. */
export function counterTenderLabel(parts = {}) {
  return [
    roundMoney(parts.cash || 0) > 0 ? "Cash" : "",
    roundMoney(parts.upi || 0) > 0 ? "UPI" : "",
    roundMoney(parts.card ?? parts.bank ?? 0) > 0 ? "Card" : "",
  ].filter(Boolean).join(" + ");
}

export function counterPayLabel(mode) {
  return COUNTER_PAY_MODES.find(item => item.id === mode)?.label || mode || "Cash";
}

export function tillNeedle(tillLabel = "") {
  return `counter sale · ${String(tillLabel || "").toLowerCase()}`;
}

/** Pull till name from Counter narration (`Counter sale · Till 1 · Cash`). */
export function tillLabelFromNarration(narration = "") {
  const match = String(narration || "").match(/counter sale\s*·\s*([^·]+)/i);
  return match ? String(match[1] || "").trim() : "";
}

export function isCounterTillVoucher(voucher, { date, tillLabel = "" } = {}) {
  if (!voucher || voucher.sourceType !== "pos_counter") return false;
  if (isReversed(voucher) || isCancelled(voucher)) return false;
  if (date && String(voucher.date || "").slice(0, 10) !== date) return false;
  if (tillLabel) {
    const needle = tillNeedle(tillLabel);
    if (!String(voucher.narration || "").toLowerCase().includes(needle)) return false;
  }
  return true;
}

export function tillReturnNeedle(tillLabel = "") {
  return `counter return · ${String(tillLabel || "").toLowerCase()}`;
}

/** A Counter return (credit note) posted from this till on this date. */
export function isCounterTillReturn(voucher, { date, tillLabel = "" } = {}) {
  if (!voucher || voucher.sourceType !== "pos_counter") return false;
  if (isReversed(voucher) || isCancelled(voucher)) return false;
  if (date && String(voucher.date || "").slice(0, 10) !== date) return false;
  const narration = String(voucher.narration || "").toLowerCase();
  const isReturn = voucher.voucherType === "credit_note" || narration.startsWith("counter return");
  if (!isReturn) return false;
  if (tillLabel && !narration.includes(tillReturnNeedle(tillLabel))) return false;
  return true;
}

/** Credits out of money accounts on a Counter return — what left the drawer, UPI or card. */
export function counterRefundFromVoucher(accounts = [], voucher = {}) {
  const byId = Object.fromEntries((accounts || []).map(account => [account.id, account]));
  let cash = 0;
  let upi = 0;
  let card = 0;
  for (const line of voucher.lines || []) {
    const credit = roundMoney(Number(line.credit || 0));
    if (!(credit > 0)) continue;
    const type = byId[line.coaId]?.accountType || byId[line.code]?.accountType || "";
    if (type === "cash") cash = roundMoney(cash + credit);
    else if (type === "upi") upi = roundMoney(upi + credit);
    else if (type === "bank") card = roundMoney(card + credit);
  }
  return { cash, upi, card, total: roundMoney(cash + upi + card) };
}

/** Debits into money accounts on a paid Counter sale. Bank = Card for POS. */
export function counterTenderFromVoucher(accounts = [], voucher = {}) {
  const byId = Object.fromEntries((accounts || []).map(account => [account.id, account]));
  let cash = 0;
  let upi = 0;
  let card = 0;
  for (const line of voucher.lines || []) {
    const debit = roundMoney(Number(line.debit || 0));
    if (!(debit > 0)) continue;
    const type = byId[line.coaId]?.accountType || byId[line.code]?.accountType || "";
    if (type === "cash") cash = roundMoney(cash + debit);
    else if (type === "upi") upi = roundMoney(upi + debit);
    else if (type === "bank") card = roundMoney(card + debit);
  }
  return { cash, upi, card, total: roundMoney(cash + upi + card) };
}

export function counterModeFromTender(tender = {}, narration = "") {
  const cash = roundMoney(tender.cash || 0);
  const upi = roundMoney(tender.upi || 0);
  const card = roundMoney(tender.card || 0);
  if (card > 0 && (cash > 0 || upi > 0)) return { id: "split", label: counterTenderLabel({ cash, upi, card }) };
  if (cash > 0 && upi > 0) return { id: "cash_upi", label: "Cash + UPI" };
  if (card > 0 && cash <= 0 && upi <= 0) return { id: "bank", label: "Card" };
  if (upi > 0 && cash <= 0 && card <= 0) return { id: "upi", label: "UPI" };
  if (cash > 0 && upi <= 0 && card <= 0) return { id: "cash", label: "Cash" };
  const text = String(narration || "").toLowerCase();
  if (text.includes("cash + upi") || text.includes("cash_upi")) return { id: "cash_upi", label: "Cash + UPI" };
  if (text.includes("upi")) return { id: "upi", label: "UPI" };
  if (text.includes("card") || text.includes("bank")) return { id: "bank", label: "Card" };
  if (text.includes("cash")) return { id: "cash", label: "Cash" };
  return { id: "cash", label: "Cash" };
}

/**
 * Day sales for one till (or all Counter sales when tillLabel is empty).
 * Does not include Accounts credit sales — only sourceType pos_counter.
 */
export function counterDayReport(accounts = [], vouchers = [], { date, tillLabel = "" } = {}) {
  const day = String(date || "").slice(0, 10);
  const bills = (vouchers || [])
    .filter(voucher => isCounterTillVoucher(voucher, { date: day, tillLabel }))
    .slice()
    .sort((a, b) => String(b.postedAt || b.createdAt || b.date || "").localeCompare(String(a.postedAt || a.createdAt || a.date || "")));

  let sales = 0;
  let cash = 0;
  let upi = 0;
  let card = 0;
  const rows = bills.map(voucher => {
    const amount = roundMoney(voucherTotals(voucher.lines || []).debit);
    const tender = counterTenderFromVoucher(accounts, voucher);
    const mode = counterModeFromTender(tender, voucher.narration);
    sales = roundMoney(sales + amount);
    cash = roundMoney(cash + tender.cash);
    upi = roundMoney(upi + tender.upi);
    card = roundMoney(card + tender.card);
    return {
      id: voucher.id,
      reference: voucher.voucherNumber || "",
      invoiceDate: voucher.date || day,
      soldAt: voucher.postedAt || voucher.createdAt || "",
      amount,
      modeId: mode.id,
      modeLabel: mode.label,
      cash: tender.cash,
      upi: tender.upi,
      card: tender.card,
      tillLabel: tillLabel || tillLabelFromNarration(voucher.narration) || "",
      narration: voucher.narration || "",
    };
  });

  // Returns paid out of the till the same day. Without them the drawer expectation is overstated
  // by every cash refund (RC3 P2-1).
  const refunds = { cash: 0, upi: 0, card: 0, total: 0 };
  const returnRows = (vouchers || [])
    .filter(voucher => isCounterTillReturn(voucher, { date: day, tillLabel }))
    .map(voucher => {
      const refund = counterRefundFromVoucher(accounts, voucher);
      const amount = roundMoney(voucherTotals(voucher.lines || []).credit);
      refunds.cash = roundMoney(refunds.cash + refund.cash);
      refunds.upi = roundMoney(refunds.upi + refund.upi);
      refunds.card = roundMoney(refunds.card + refund.card);
      refunds.total = roundMoney(refunds.total + refund.total);
      const mode = counterModeFromTender(refund, voucher.narration);
      return {
        id: voucher.id,
        reference: voucher.voucherNumber || "",
        invoiceDate: voucher.date || day,
        soldAt: voucher.postedAt || voucher.createdAt || "",
        amount: -amount,
        modeId: mode.id,
        modeLabel: `Refund · ${mode.label}`,
        cash: -refund.cash,
        upi: -refund.upi,
        card: -refund.card,
        isReturn: true,
        tillLabel: tillLabel || String(voucher.narration || "").match(/counter return\s*·\s*([^·]+)/i)?.[1]?.trim() || "",
        narration: voucher.narration || "",
      };
    });
  const allRows = [...rows, ...returnRows]
    .sort((a, b) => String(b.soldAt || b.invoiceDate || "").localeCompare(String(a.soldAt || a.invoiceDate || "")));

  return {
    date: day,
    tillLabel: tillLabel || "",
    scope: tillLabel ? "till" : "all",
    billCount: rows.length,
    returnCount: returnRows.length,
    sales,
    refunds,
    netSales: roundMoney(sales - refunds.total),
    tender: { cash, upi, card, total: roundMoney(cash + upi + card) },
    netTender: {
      cash: roundMoney(cash - refunds.cash),
      upi: roundMoney(upi - refunds.upi),
      card: roundMoney(card - refunds.card),
      total: roundMoney(cash + upi + card - refunds.total),
    },
    bills: allRows,
    byTill: [],
  };
}

/**
 * Combined Counter day report: all tills total + per-till breakdown.
 * `tills` is optional [{ id, label }]; unknown till labels from narration are included.
 */
export function counterDayReportAll(accounts = [], vouchers = [], { date, tills = [] } = {}) {
  const overall = counterDayReport(accounts, vouchers, { date, tillLabel: "" });
  const known = (tills || []).map(till => ({ id: till.id, label: till.label || till.id }));
  const seen = new Set(known.map(till => String(till.label || "").toLowerCase()));
  for (const bill of overall.bills) {
    const label = bill.tillLabel || tillLabelFromNarration(bill.narration);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    known.push({ id: `till-${key}`, label });
  }
  const byTill = known
    .map(till => ({
      tillId: till.id,
      ...counterDayReport(accounts, vouchers, { date, tillLabel: till.label }),
    }))
    .filter(row => row.billCount > 0 || (tills || []).some(till => till.id === row.tillId));
  return {
    ...overall,
    scope: "all",
    byTill,
  };
}
