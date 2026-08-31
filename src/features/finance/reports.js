export function filterCollectionReportAccounts(loans, { kind = "all", customer = "", statusOf }) {
  const q = String(customer || "").trim().toLowerCase();
  return (loans || []).filter(loan => {
    if (kind !== "all" && loan.kind !== kind) return false;
    if (q && !String(loan.customerName || "").toLowerCase().includes(q)) return false;
    return statusOf(loan) === "active";
  });
}

export function filterProfitLossAccounts(loans, { kind = "all", status = "all", customer = "", statusOf }) {
  const q = String(customer || "").trim().toLowerCase();
  return (loans || []).filter(loan => {
    if (kind !== "all" && loan.kind !== kind) return false;
    if (status !== "all" && statusOf(loan) !== status) return false;
    if (q && !String(loan.customerName || "").toLowerCase().includes(q)) return false;
    return true;
  });
}

export function profitLossKindLabel(kind) {
  if (kind === "daily") return "Daily finance";
  if (kind === "monthly") return "Monthly finance";
  return "Daily + Monthly";
}

export function profitLossStatusLabel(status) {
  if (status === "active") return "Active";
  if (status === "closed") return "Closed";
  if (status === "bankrupt") return "Bankrupt";
  return "All statuses";
}

export function accountStatusLabel(status) {
  if (status === "active") return "Active";
  if (status === "closed") return "Closed";
  if (status === "bankrupt") return "Bankrupt";
  if (status === "completed") return "Completed";
  if (status === "overdue") return "Overdue";
  return status || "—";
}

export function buildProfitLossCsvRows(accounts, { kind = "all", status = "all", customer = "", generatedOn }) {
  const totals = (accounts || []).reduce((sum, row) => ({
    invested: sum.invested + Number(row.invested || 0),
    collected: sum.collected + Number(row.collected || 0),
    outstanding: sum.outstanding + Number(row.outstanding || 0),
    profit: sum.profit + Number(row.profit || 0),
    loss: sum.loss + Number(row.loss || 0),
  }), { invested: 0, collected: 0, outstanding: 0, profit: 0, loss: 0 });
  const net = totals.profit - totals.loss;
  return [
    ["FinTrack Profit & Loss Report"],
    ["Generated on", generatedOn],
    ["Finance type", profitLossKindLabel(kind)],
    ["Account status", profitLossStatusLabel(status)],
    ["Customer filter", String(customer || "").trim() || "All customers"],
    ["Accounts in report", (accounts || []).length],
    ["Paid to customers", totals.invested],
    ["Total collected", totals.collected],
    ["Outstanding / receivable", totals.outstanding],
    ["Realized profit", totals.profit],
    ["Loss / bankrupt", totals.loss],
    ["Net profit / loss", net],
    [],
    ["Customer", "Finance type", "Status", "Paid to customers", "Total collected", "Outstanding", "Realized profit", "Loss", "Net profit / loss"],
    ...(accounts || []).map(row => [
      row.customerName,
      row.kindLabel,
      row.statusLabel,
      row.invested,
      row.collected,
      row.outstanding,
      row.profit,
      row.loss,
      Number(row.profit || 0) - Number(row.loss || 0),
    ]),
    [],
    ["Total", "", "", totals.invested, totals.collected, totals.outstanding, totals.profit, totals.loss, net],
  ];
}
