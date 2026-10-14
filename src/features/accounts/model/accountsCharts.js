import { SYSTEM_CODES, roundMoney } from "./accountingModel.js";
import { profitAndLoss } from "./accountingReports.js";
import { periodStockValues } from "./inventoryValuation.js";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = value => String(value).padStart(2, "0");

/**
 * Income and expenses for each of the `months` calendar months ending with `endDate`'s month.
 * Expenses are net of the month's stock change, so income − expenses equals that month's P&L net,
 * and a month spent restocking does not show as a loss.
 */
export function monthlyIncomeExpense({ accounts, vouchers, items = [], movements = [], voucherItemLines = [], endDate, months = 6 } = {}) {
  if (!endDate) return [];
  const [endYear, endMonth] = String(endDate).slice(0, 7).split("-").map(Number);
  if (!endYear || !endMonth) return [];
  const products = (items || []).filter(item => item.itemType !== "service");
  const rows = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    const index = endYear * 12 + (endMonth - 1) - back;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const from = `${year}-${pad(month)}-01`;
    const monthEnd = `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
    const to = monthEnd < endDate ? monthEnd : endDate;
    const stock = products.length ? periodStockValues({ items: products, movements, voucherItemLines, from, to }) : null;
    const pnl = profitAndLoss(accounts, vouchers, { from, to }, { stock });
    rows.push({
      month: `${year}-${pad(month)}`,
      label: `${MONTH_NAMES[month - 1]} ${String(year).slice(2)}`,
      income: pnl.totalIncome,
      expenses: roundMoney(pnl.totalExpense - pnl.stockAdjustment),
      net: pnl.net,
    });
  }
  return rows;
}

/** Expense ledgers other than stock purchases, largest first, with the tail folded into "Other". */
export function expenseBreakdown(expenseRows = [], { top = 5 } = {}) {
  const isPurchase = row => row.code === SYSTEM_CODES.purchase;
  const purchases = roundMoney((expenseRows || []).filter(isPurchase).reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const rows = (expenseRows || [])
    .filter(row => !isPurchase(row) && Number(row.amount) > 0)
    .sort((a, b) => Number(b.amount) - Number(a.amount));
  const total = roundMoney(rows.reduce((sum, row) => sum + Number(row.amount), 0));
  const slices = rows.slice(0, top).map(row => ({ id: row.id || row.code, name: row.name, amount: roundMoney(row.amount) }));
  const rest = rows.slice(top);
  if (rest.length) slices.push({ id: "other", name: "Other", amount: roundMoney(rest.reduce((sum, row) => sum + Number(row.amount), 0)) });
  return {
    slices: slices.map(slice => ({ ...slice, share: total ? slice.amount / total : 0 })),
    total,
    purchases,
  };
}
