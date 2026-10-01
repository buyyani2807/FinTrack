import { financeKindLabel } from "../model/collectionStaff";
import { annualRate, loanBalance, loanPaid, loanStatus, monthlyBalance } from "../model/loanState.js";
import { paymentModeLabel, paymentValue } from "../model/paymentFormat.js";
import { investedAmount, realizedLoss, realizedProfit } from "../model/pnl.js";
import { accountStatusLabel, buildProfitLossCsvRows } from "../model/reports.js";

export const csvCell = value => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export const downloadCsv = (filename, rows) => {
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
export const expectedCollectionOnDate = (loan, reportDate) => loan.kind === "daily"
  ? Number(loan.dailyCollection || 0)
  : Math.round(monthlyBalance(loan, reportDate) * annualRate(loan, reportDate) / 100);
export const downloadDailyReport = (loans, reportDate) => {
  if (!loans.length) throw new Error("No active customers match these filters.");
  const rows = loans.map(loan => {
    const transactions = loan.transactions.filter(t => t.date === reportDate);
    const actual = transactions.reduce((sum, t) => sum + paymentValue(loan, t), 0);
    const expected = expectedCollectionOnDate(loan, reportDate);
    return [loan.customerName, expected, actual, loanBalance(loan), actual ? "Collected" : "Not collected", transactions.map(paymentModeLabel).join("; ") || "—", transactions.reduce((sum, t) => sum + Number(t.cashAmount || 0), 0), transactions.reduce((sum, t) => sum + Number(t.upiAmount || 0), 0), transactions.map(t => t.collectorName || "Financier/Admin").join("; ") || "—", transactions.map(t => t.notes).filter(Boolean).join("; ") || "—"];
  });
  const totalExpected = rows.reduce((sum, row) => sum + Number(row[1] || 0), 0);
  const total = rows.reduce((sum, row) => sum + Number(row[2] || 0), 0);
  downloadCsv(`fintrack-collection-report-${reportDate}.csv`, [["FinTrack Collection Report"], ["Report date", reportDate], ["Account status", "Active only"], ["Accounts in report", loans.length], ["Expected collection", totalExpected], ["Total collected", total], [], ["Customer", "Expected collection", "Actual collected", "Outstanding", "Collection status", "Payment mode", "Cash amount", "UPI amount", "Collected by", "Notes/comments"], ...rows, [], ["Total", totalExpected, total]]);
};
export const downloadProfitLossReport = (loans, { kind, status, customer, generatedOn }) => {
  if (!loans.length) throw new Error("No accounts match these filters.");
  const rows = loans.map(loan => ({
    customerName: loan.customerName,
    kindLabel: financeKindLabel(loan.kind),
    statusLabel: accountStatusLabel(loanStatus(loan)),
    invested: investedAmount(loan),
    collected: loanPaid(loan),
    outstanding: loanBalance(loan),
    profit: realizedProfit(loan),
    loss: realizedLoss(loan),
  }));
  downloadCsv(`fintrack-profit-loss-${generatedOn}.csv`, buildProfitLossCsvRows(rows, { kind, status, customer, generatedOn }));
};
export const downloadCustomerReport = loan => {
  const monthly = loan.kind === "monthly";
  const rows = [...loan.transactions].sort((a, b) => a.date.localeCompare(b.date)).map(transaction => [transaction.date, monthly ? transaction.interestAmount || 0 : "", monthly ? transaction.principalAmount || 0 : "", monthly ? transaction.penaltyAmount || 0 : "", paymentValue(loan, transaction), paymentModeLabel(transaction), transaction.cashAmount || "", transaction.upiAmount || "", transaction.ref || "", transaction.notes || ""]);
  downloadCsv(`fintrack-payment-history-${loan.id}.csv`, [["FinTrack Customer Payment Report"], ["Customer", loan.customerName], ["Finance ID", loan.id], ["Finance type", loan.kind], [monthly ? "Principal taken" : "Amount paid to customer", monthly ? loan.principal : loan.disbursedAmount], [monthly ? "Principal remaining" : "Collection balance", loanBalance(loan)], ["Total paid", loanPaid(loan)], [], ["Date", "Interest paid", "Principal repaid", "Penalty paid", "Total paid", "Mode", "Cash amount", "UPI amount", "Reference", "Notes"], ...rows]);
};
