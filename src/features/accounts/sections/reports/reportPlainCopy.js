import { money, profitResult } from "../../accountsFormat.js";
import { invoiceAgingTotals } from "../../model/accountingReports.js";

/** Static “what this is” copy for Accounts → Reports tabs. */
export const REPORT_BLURB = {
  daybook: "Every sale, purchase, receipt and payment in the period.",
  trial: "Check that debits still equal credits.",
  pnl: "Income and expenses for the selected dates.",
  balance: "Assets, liabilities and equity snapshot.",
  cashflow: "Money in and out of cash and bank (simplified).",
  receivables: "Who still owes you — overdue first.",
  payables: "What you owe suppliers.",
  sales: "Sales vouchers posted in this period.",
  purchases: "Purchase vouchers posted in this period.",
  gst: "Calculated GST for review — not portal filing.",
  ledger: "Debits, credits, and running balance for one account.",
  item_sales: "What you sold, by item, when line items were recorded.",
  item_purchases: "What you bought, by item, when line items were recorded.",
  item_profit: "Revenue, cost, and profit by item when item lines are recorded.",
  stock_moves: "Where inventory came from and where it went.",
  purchase_match: "Compare purchase orders with what was billed or received.",
};

export const REPORT_HELP = {
  trial: "Total debits should equal total credits. If they do not match, a voucher may be incomplete or mistyped.",
  cashflow: "Transfers between your own cash, bank, and UPI accounts are not counted as inflow or outflow. Closing cash still follows the ledgers.",
  gst: "These figures come from your books for review. They are not a filed GSTR return on the GST portal.",
  balance: "Assets are what the business owns. Liabilities are what it owes. Equity is the owners’ stake that makes the equation balance.",
  receivables: "Outstanding is still unpaid. Ageing shows how long each amount has remained unpaid past the due date.",
  payables: "Outstanding is what you still owe. Ageing shows how long each bill has been unpaid.",
  pnl: "Net profit is what remains after expenses (and stock adjustments when inventory is used). A net loss means expenses were higher than income.",
};

export function pnlInsight(pnl) {
  if (!pnl) return "";
  const result = profitResult(pnl.net);
  const income = money(pnl.totalIncome);
  const expense = money(pnl.totalExpense);
  if (result.loss) {
    return `Expenses (${expense}) exceeded income (${income}) by ${money(result.amount)}.`;
  }
  return `Income (${income}) covered expenses (${expense}) with ${money(result.amount)} left as profit.`;
}

export function trialInsight(tb) {
  if (!tb) return "";
  const debit = Number(tb.totalDebit || 0);
  const credit = Number(tb.totalCredit || 0);
  const diff = Math.abs(debit - credit);
  if (diff < 0.01) return "Debits equal credits — the trial balance is balanced.";
  return `Debits and credits differ by ${money(diff)}. Check incomplete or mistyped vouchers.`;
}

export function balanceInsight(sheet) {
  if (!sheet) return "";
  return sheet.balanced
    ? "Assets equal liabilities plus equity."
    : "Assets do not equal liabilities plus equity — review opening balances or equity postings.";
}

export function cashflowInsight(flow) {
  if (!flow) return "";
  const net = Number(flow.net || 0);
  if (net < 0) {
    return `Outflow exceeded inflow by ${money(Math.abs(net))} (internal transfers excluded).`;
  }
  if (net > 0) {
    return `Net cash increased by ${money(net)} after excluding internal transfers.`;
  }
  return "Inflow and outflow were even after excluding internal transfers.";
}

export function agingInsight(rows, { partyWord = "customer" } = {}) {
  const aging = invoiceAgingTotals(rows || []);
  if (aging.total <= 0) return `No open ${partyWord} balances in this view.`;
  const overdueShare = Math.round((aging.overdue / aging.total) * 100);
  if (overdueShare > 0) {
    return `${money(aging.overdue)} overdue (${overdueShare}% of ${money(aging.total)} outstanding) — follow up the oldest buckets first.`;
  }
  return `All ${money(aging.total)} outstanding is still within due dates.`;
}

export function countInsight(rows, pluralNoun, singularNoun = "") {
  const n = Array.isArray(rows) ? rows.length : 0;
  if (n === 0) return `No ${pluralNoun} in this period.`;
  if (n === 1) return `1 ${singularNoun || pluralNoun.replace(/s$/, "")} in this period.`;
  return `${n} ${pluralNoun} in this period.`;
}

export function gstInsight(gstReport) {
  if (!gstReport) return "GST totals will appear once books are loaded for this period.";
  const net = Number(gstReport.netPayable || 0);
  if (net > 0) return `Books show about ${money(net)} net GST payable for this period (for review only).`;
  if (net < 0) return `Books show about ${money(Math.abs(net))} net input credit for this period (for review only).`;
  return "Output tax and input credit roughly offset for this period (for review only).";
}

export function insightToneFromText(insight = "") {
  const text = String(insight).toLowerCase();
  if (!text) return "info";
  if (
    text.includes("differ")
    || text.includes("do not equal")
    || text.includes("exceeded")
    || text.includes("overdue")
    || text.includes("loss")
  ) {
    return "warn";
  }
  if (
    text.includes("balanced")
    || text.includes("equal")
    || text.includes("profit")
    || text.includes("within due")
    || text.includes("increased")
  ) {
    return "ok";
  }
  return "info";
}
