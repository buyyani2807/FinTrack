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
];

export function counterPayLabel(mode) {
  return COUNTER_PAY_MODES.find(item => item.id === mode)?.label || mode || "Cash";
}

export function tillNeedle(tillLabel = "") {
  return `counter sale · ${String(tillLabel || "").toLowerCase()}`;
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
      narration: voucher.narration || "",
    };
  });

  return {
    date: day,
    tillLabel: tillLabel || "",
    billCount: rows.length,
    sales,
    netSales: sales,
    tender: { cash, upi, card, total: roundMoney(cash + upi + card) },
    bills: rows,
  };
}
