import { roundMoney } from "../../model/accountingModel.js";
import { money, profitResult } from "../../accountsFormat.js";

/** On-screen + export row builders for statement reports (presentation only). */

export function periodCaption(from, to) {
  if (!from && !to) return "";
  if (from && to && from === to) return from;
  if (from && to) return `${from} to ${to}`;
  return from || to;
}

export function pnlStatementRows(pnl) {
  if (!pnl) return [];
  const result = profitResult(pnl.net);
  const beforeStock = roundMoney(Number(pnl.totalIncome || 0) - Number(pnl.totalExpense || 0));
  const hasStock = Boolean(pnl.openingStock || pnl.closingStock);
  const rows = [
    { id: "inc-h", kind: "section", label: "Income" },
    ...pnl.income.filter(row => row.amount).map(row => ({
      id: `inc-${row.id}`,
      kind: "line",
      label: row.name,
      amount: row.amount,
      display: money(row.amount),
    })),
    {
      id: "inc-total",
      kind: "total",
      label: "Total income",
      amount: pnl.totalIncome,
      display: money(pnl.totalIncome),
      tone: "good",
    },
    { id: "blank-1", kind: "blank" },
    { id: "exp-h", kind: "section", label: "Expenses" },
    ...pnl.expenses.filter(row => row.amount).map(row => ({
      id: `exp-${row.id}`,
      kind: "line",
      label: row.name,
      amount: row.amount,
      display: money(row.amount),
    })),
    {
      id: "exp-total",
      kind: "total",
      label: "Total expenses",
      amount: pnl.totalExpense,
      display: money(pnl.totalExpense),
      tone: "bad",
    },
  ];
  if (hasStock) {
    rows.push(
      { id: "blank-2", kind: "blank" },
      { id: "stock-h", kind: "section", label: "Stock" },
      {
        id: "before-stock",
        kind: "line",
        label: beforeStock < 0 ? "Loss before stock" : "Profit before stock",
        amount: Math.abs(beforeStock),
        display: money(Math.abs(beforeStock)),
        tone: beforeStock < 0 ? "bad" : "good",
      },
      {
        id: "open-stock",
        kind: "line",
        label: "Opening stock (charged)",
        amount: pnl.openingStock,
        display: money(pnl.openingStock),
      },
      {
        id: "close-stock",
        kind: "line",
        label: "Closing stock (added back)",
        amount: pnl.closingStock,
        display: money(pnl.closingStock),
      },
      {
        id: "stock-note",
        kind: "note",
        label: "Closing stock is still in hand and added back. Opening stock is charged for the period.",
      },
    );
  }
  rows.push(
    { id: "blank-3", kind: "blank" },
    {
      id: "result",
      kind: "result",
      label: result.label,
      amount: result.amount,
      display: money(result.amount),
      tone: result.loss ? "bad" : "good",
    },
  );
  return rows;
}

export function pnlExportRows(pnl, { companyName = "FinTrack", from = "", to = "" } = {}) {
  const result = profitResult(pnl?.net);
  const period = periodCaption(from, to);
  const out = [["Profit & Loss"], [companyName]];
  if (period) out.push([`Period: ${period}`]);
  out.push([]);
  out.push(["Particulars", "Amount (₹)"]);
  out.push(["Income"]);
  for (const row of (pnl?.income || []).filter(item => item.amount)) out.push([row.name, row.amount]);
  out.push(["Total income", pnl?.totalIncome ?? 0]);
  out.push([]);
  out.push(["Expenses"]);
  for (const row of (pnl?.expenses || []).filter(item => item.amount)) out.push([row.name, row.amount]);
  out.push(["Total expenses", pnl?.totalExpense ?? 0]);
  if (pnl?.openingStock || pnl?.closingStock) {
    const beforeStock = roundMoney(Number(pnl.totalIncome || 0) - Number(pnl.totalExpense || 0));
    out.push([]);
    out.push(["Stock"]);
    out.push([beforeStock < 0 ? "Loss before stock" : "Profit before stock", Math.abs(beforeStock)]);
    out.push(["Opening stock (charged)", pnl.openingStock || 0]);
    out.push(["Closing stock (added back)", pnl.closingStock || 0]);
  }
  out.push([]);
  out.push([result.label, result.amount]);
  return out;
}

export function balanceAssetRows(sheet) {
  if (!sheet) return [];
  return [
    { id: "a-h", kind: "section", label: "Assets" },
    ...(sheet.assets || []).map(row => ({
      id: `a-${row.id}`,
      kind: "line",
      label: `${row.code} ${row.name}`.trim(),
      amount: row.balance,
      display: money(row.balance),
    })),
    {
      id: "a-total",
      kind: "total",
      label: "Total assets",
      amount: sheet.totalAssets,
      display: money(sheet.totalAssets),
    },
  ];
}

export function balanceLiabilityRows(sheet) {
  if (!sheet) return [];
  const rightTotal = roundMoney(Number(sheet.totalLiabilities || 0) + Number(sheet.totalEquity || 0));
  return [
    { id: "l-h", kind: "section", label: "Liabilities" },
    ...(sheet.liabilities || []).map(row => ({
      id: `l-${row.id}`,
      kind: "line",
      label: `${row.code} ${row.name}`.trim(),
      amount: row.balance,
      display: money(row.balance),
    })),
    { id: "e-h", kind: "section", label: "Equity" },
    ...(sheet.equity || []).map(row => ({
      id: `e-${row.id}`,
      kind: "line",
      label: `${row.code} ${row.name}`.trim(),
      amount: row.balance,
      display: money(row.balance),
    })),
    {
      id: "le-total",
      kind: "total",
      label: "Total liabilities & equity",
      amount: rightTotal,
      display: money(rightTotal),
    },
    {
      id: "eq-note",
      kind: "note",
      label: sheet.balanced ? "Assets equal liabilities plus equity." : "Balance sheet is out of equation.",
    },
  ];
}

export function balanceExportRows(sheet, { companyName = "FinTrack", from = "", to = "" } = {}) {
  const period = periodCaption(from, to);
  const out = [["Balance Sheet"], [companyName]];
  if (period) out.push([`As of ${to || period}`]);
  out.push([]);
  out.push(["Section", "Code", "Account", "Amount (₹)"]);
  for (const row of sheet?.assets || []) out.push(["Asset", row.code, row.name, row.balance]);
  out.push(["Asset", "", "Total assets", sheet?.totalAssets ?? 0]);
  out.push([]);
  for (const row of sheet?.liabilities || []) out.push(["Liability", row.code, row.name, row.balance]);
  for (const row of sheet?.equity || []) out.push(["Equity", row.code, row.name, row.balance]);
  out.push(["", "", "Total liabilities & equity", roundMoney(Number(sheet?.totalLiabilities || 0) + Number(sheet?.totalEquity || 0))]);
  out.push([]);
  out.push(["", "", sheet?.balanced ? "Balanced" : "Out of equation", ""]);
  return out;
}

export function trialExportRows(tb, { companyName = "FinTrack", from = "", to = "" } = {}) {
  const period = periodCaption(from, to);
  const diff = Math.abs(Number(tb?.totalDebit || 0) - Number(tb?.totalCredit || 0));
  const out = [["Trial Balance"], [companyName]];
  if (period) out.push([`Period: ${period}`]);
  out.push([]);
  out.push(["Code", "Account", "Debit (₹)", "Credit (₹)"]);
  for (const row of tb?.rows || []) out.push([row.code, row.name, row.debit || 0, row.credit || 0]);
  out.push(["", "Total", tb?.totalDebit ?? 0, tb?.totalCredit ?? 0]);
  out.push([]);
  out.push(["", diff < 0.01 ? "Balanced" : "Difference", "", diff < 0.01 ? "" : diff]);
  return out;
}

export function cashflowExportRows(flow, { companyName = "FinTrack", from = "", to = "" } = {}) {
  const period = periodCaption(from, to);
  const out = [["Cash Flow"], [companyName]];
  if (period) out.push([`Period: ${period}`]);
  out.push([]);
  out.push(["Particulars", "Amount (₹)"]);
  out.push(["Inflow", flow?.inflow ?? 0]);
  out.push(["Outflow", flow?.outflow ?? 0]);
  out.push(["Net cash", flow?.net ?? 0]);
  out.push([]);
  out.push(["Internal transfers (excluded from inflow/outflow)", flow?.transfers || 0]);
  return out;
}

export function cashflowStatementRows(flow) {
  const net = Number(flow?.net || 0);
  return [
    { id: "in", kind: "line", label: "Inflow", amount: flow?.inflow, display: money(flow?.inflow), tone: "good" },
    { id: "out", kind: "line", label: "Outflow", amount: flow?.outflow, display: money(flow?.outflow), tone: "bad" },
    {
      id: "net",
      kind: "result",
      label: "Net cash",
      amount: flow?.net,
      display: money(flow?.net),
      tone: net < 0 ? "bad" : "good",
    },
    {
      id: "xfer",
      kind: "note",
      label: `Internal cash/bank/UPI transfers (${money(flow?.transfers || 0)}) are excluded from inflow and outflow.`,
    },
  ];
}
