/**
 * AI Attention Center — aggregates actionable items from existing FinTrack data.
 * Advisory only: never invents balances or writes accounting data.
 */

export function buildAttentionCenter({
  dailyLoans = [],
  monthlyLoans = [],
  chitAttention = [],
  accountsAttention = [],
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  const items = [];

  for (const loan of dailyLoans) {
    if (loan.status && loan.status !== "active") continue;
    const collectedToday = (loan.transactions || []).some(row => row.date === today);
    if (!collectedToday) {
      items.push({
        id: `daily-unpaid-${loan.id}`,
        module: "daily",
        severity: "high",
        title: `${loan.customerName || "Customer"} has not paid today`,
        detail: "Daily Finance collection pending for today.",
        actionLabel: "Open Daily Finance",
        href: { panel: "daily", detailId: loan.id },
      });
    }
  }

  let monthlyDue = 0;
  let monthlyCount = 0;
  for (const loan of monthlyLoans) {
    if (loan.status && loan.status !== "active") continue;
    const due = Number(loan.attentionDueAmount || loan.interestDue || 0);
    if (due > 0) {
      monthlyDue += due;
      monthlyCount += 1;
    }
  }
  if (monthlyCount) {
    items.push({
      id: "monthly-due-week",
      module: "monthly",
      severity: monthlyDue > 50000 ? "high" : "medium",
      title: `${monthlyCount} monthly account${monthlyCount === 1 ? "" : "s"} need collection attention`,
      detail: `About ₹${Math.round(monthlyDue).toLocaleString("en-IN")} flagged from Monthly Finance dues.`,
      actionLabel: "Open Monthly Finance",
      href: { panel: "monthly" },
    });
  }

  for (const row of chitAttention || []) items.push(row);
  for (const row of accountsAttention || []) items.push(row);

  const byModule = items.reduce((acc, item) => {
    acc[item.module] = (acc[item.module] || 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    count: items.length,
    summary: items.length ? `${items.length} item${items.length === 1 ? "" : "s"} need your attention` : "No urgent attention items right now",
    byModule,
    items: items.slice(0, 40),
    disclaimer: "Attention items are built from verified FinTrack records. They do not invent balances and never change books automatically.",
  };
}

/** Build chit attention items from upcoming payment rows (same shape as UpcomingPayments). */
export function buildChitAttentionItems(upcomingRows = []) {
  const rows = upcomingRows || [];
  const overdue = rows.filter(row => String(row.status || "").toLowerCase() === "overdue" || Number(row.daysOverdue || 0) > 0);
  const pending = rows.filter(row => {
    const status = String(row.status || "").toLowerCase();
    return status === "pending" || status === "due" || status === "partial" || status === "approaching";
  });
  const items = [];
  if (overdue.length) {
    const amount = overdue.reduce((sum, row) => sum + Number(row.amount || row.dueAmount || row.balance || 0), 0);
    items.push({
      id: "chit-overdue",
      module: "chit",
      severity: "high",
      title: `${overdue.length} Chit Fund installment${overdue.length === 1 ? "" : "s"} overdue`,
      detail: amount > 0 ? `About ₹${Math.round(amount).toLocaleString("en-IN")} past due.` : "Overdue chit collections need follow-up.",
      actionLabel: "Open Chit Fund",
      href: { panel: "chit" },
    });
  }
  if (pending.length) {
    items.push({
      id: "chit-pending",
      module: "chit",
      severity: "medium",
      title: `${pending.length} Chit Fund installment${pending.length === 1 ? "" : "s"} pending`,
      detail: "Upcoming or due chit collections.",
      actionLabel: "Open Chit Fund",
      href: { panel: "chit" },
    });
  }
  return items;
}

export function buildAccountsAttentionItems({
  overdueReceivables = 0,
  overdueInvoiceCount = 0,
  lowStockCount = 0,
  unmatchedBankLines = 0,
  gstNeedsReview = false,
} = {}) {
  const items = [];
  if (overdueReceivables > 0 || overdueInvoiceCount > 0) {
    items.push({
      id: "accounts-ar-overdue",
      module: "accounts",
      severity: "high",
      title: `₹${Math.round(overdueReceivables).toLocaleString("en-IN")} overdue receivables`,
      detail: overdueInvoiceCount ? `${overdueInvoiceCount} invoice(s) past due.` : "Receivables aging needs follow-up.",
      actionLabel: "Open Receivables",
      href: { panel: "accounts", section: "receivables" },
    });
  }
  if (lowStockCount > 0) {
    items.push({
      id: "accounts-low-stock",
      module: "accounts",
      severity: "medium",
      title: `${lowStockCount} item${lowStockCount === 1 ? "" : "s"} below reorder level`,
      detail: "Inventory reorder attention.",
      actionLabel: "Open Items",
      href: { panel: "accounts", section: "items" },
    });
  }
  if (unmatchedBankLines > 0) {
    items.push({
      id: "accounts-bank-unmatched",
      module: "accounts",
      severity: "medium",
      title: `${unmatchedBankLines} bank statement line${unmatchedBankLines === 1 ? "" : "s"} unmatched`,
      detail: "Bank reconciliation needs review.",
      actionLabel: "Open Banking",
      href: { panel: "accounts", section: "bank" },
    });
  }
  if (gstNeedsReview) {
    items.push({
      id: "accounts-gst-review",
      module: "gst",
      severity: "medium",
      title: "GST books data requires review",
      detail: "Review calculated GST before any portal filing.",
      actionLabel: "Open GST report",
      href: { panel: "accounts", section: "reports", reportTab: "gst" },
    });
  }
  return items;
}
