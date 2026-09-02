import {
  SYSTEM_CODES,
  accountingEquationHolds,
  addDaysIso,
  affectsLedgers,
  findAccount,
  isMoneyAccount,
  isReversalVoucher,
  ledgerBalances,
  partyPosition,
  roundMoney,
  signedBalance,
  voucherTotals,
} from "./accountingModel.js";

const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

export function dayBook(vouchers = [], { from, to } = {}) {
  return (vouchers || [])
    .filter(voucher => affectsLedgers(voucher) && inRange(voucher.date, from, to))
    .sort((a, b) => `${a.date}${a.voucherNumber}`.localeCompare(`${b.date}${b.voucherNumber}`))
    .map(voucher => ({
      ...voucher,
      debit: roundMoney(voucher.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0)),
      credit: roundMoney(voucher.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0)),
    }));
}

export function accountLedger(accounts, vouchers, coaId, { from, to } = {}) {
  const account = (accounts || []).find(item => item.id === coaId || item.code === coaId);
  if (!account) return { account: null, rows: [] };
  const rows = [];
  let running = signedBalance(
    account.groupType,
    account.openingDebit || (account.openingSide === "debit" ? account.openingBalance : 0) || 0,
    account.openingCredit || (account.openingSide === "credit" ? account.openingBalance : 0) || 0,
  );
  const posted = (vouchers || [])
    .filter(voucher => affectsLedgers(voucher))
    .sort((a, b) => `${a.date}${a.voucherNumber}`.localeCompare(`${b.date}${b.voucherNumber}`));
  for (const voucher of posted) {
    for (const line of voucher.lines || []) {
      if ((line.coaId || line.code) !== (account.id || account.code) && line.coaId !== account.id && line.code !== account.code) continue;
      const debit = roundMoney(line.debit);
      const credit = roundMoney(line.credit);
      running = signedBalance(account.groupType, debit, credit) + running;
      running = roundMoney(running);
      if (!inRange(voucher.date, from, to)) continue;
      rows.push({
        date: voucher.date,
        voucherNumber: voucher.voucherNumber,
        voucherType: voucher.voucherType,
        narration: line.description || voucher.narration,
        debit,
        credit,
        balance: running,
        partyId: line.partyId,
        sourceModule: voucher.sourceModule,
        sourceType: voucher.sourceType,
        sourceTransactionId: voucher.sourceTransactionId,
      });
    }
  }
  return { account, rows, closing: running };
}

export function trialBalance(accounts, vouchers, range = {}) {
  const rows = ledgerBalances(accounts, vouchers, range)
    .filter(row => row.debit || row.credit)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const totalDebit = roundMoney(rows.reduce((sum, row) => sum + row.debit, 0));
  const totalCredit = roundMoney(rows.reduce((sum, row) => sum + row.credit, 0));
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export function profitAndLoss(accounts, vouchers, range = {}) {
  const rows = ledgerBalances(accounts, vouchers, { ...range, includeOpening: false });
  const income = rows.filter(row => row.groupType === "income").map(row => ({ ...row, amount: row.balance }));
  const expenses = rows.filter(row => row.groupType === "expense").map(row => ({ ...row, amount: row.balance }));
  const totalIncome = roundMoney(income.reduce((sum, row) => sum + row.amount, 0));
  const totalExpense = roundMoney(expenses.reduce((sum, row) => sum + row.amount, 0));
  return {
    income,
    expenses,
    totalIncome,
    totalExpense,
    net: roundMoney(totalIncome - totalExpense),
  };
}

export function balanceSheet(accounts, vouchers, range = {}) {
  const pnl = profitAndLoss(accounts, vouchers, range);
  const rows = ledgerBalances(accounts, vouchers, range);
  const assets = rows.filter(row => row.groupType === "asset");
  const liabilities = rows.filter(row => row.groupType === "liability");
  const equity = rows.filter(row => row.groupType === "equity").map(row => (
    row.code === SYSTEM_CODES.retained
      ? { ...row, balance: roundMoney(row.balance + pnl.net) }
      : row
  ));
  const totalAssets = roundMoney(assets.reduce((sum, row) => sum + row.balance, 0));
  const totalLiabilities = roundMoney(liabilities.reduce((sum, row) => sum + row.balance, 0));
  const totalEquity = roundMoney(equity.reduce((sum, row) => sum + row.balance, 0));
  const equation = accountingEquationHolds(accounts, vouchers, range);
  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netProfit: pnl.net,
    balanced: totalAssets === roundMoney(totalLiabilities + totalEquity),
    equation,
  };
}

const isInternalMoneyTransfer = (voucher, moneyIds) => {
  const lines = (voucher.lines || []).filter(line => Number(line.debit || 0) || Number(line.credit || 0));
  if (lines.length < 2) return false;
  if (voucher.voucherType === "contra") return true;
  return lines.every(line => moneyIds.has(line.coaId) || moneyIds.has(line.code));
};

export function cashFlow(accounts, vouchers, range = {}) {
  const money = (accounts || []).filter(isMoneyAccount);
  const ids = new Set(money.map(account => account.id || account.code));
  let inflow = 0;
  let outflow = 0;
  let transfers = 0;
  for (const voucher of vouchers || []) {
    if (!affectsLedgers(voucher) || !inRange(voucher.date, range.from, range.to)) continue;
    if (isInternalMoneyTransfer(voucher, ids)) {
      const moved = roundMoney((voucher.lines || []).reduce((sum, line) => sum + Number(line.debit || 0), 0));
      transfers = roundMoney(transfers + moved);
      continue;
    }
    for (const line of voucher.lines || []) {
      if (!ids.has(line.coaId) && !ids.has(line.code)) continue;
      inflow = roundMoney(inflow + Number(line.debit || 0));
      outflow = roundMoney(outflow + Number(line.credit || 0));
    }
  }
  const opening = roundMoney(money.reduce((sum, account) => {
    const openDebit = account.openingDebit || (account.openingSide === "debit" ? account.openingBalance : 0) || 0;
    const openCredit = account.openingCredit || (account.openingSide === "credit" ? account.openingBalance : 0) || 0;
    return sum + signedBalance("asset", openDebit, openCredit);
  }, 0));
  const closingRows = ledgerBalances(accounts, vouchers, range).filter(row => isMoneyAccount(row));
  const closing = roundMoney(closingRows.reduce((sum, row) => sum + row.balance, 0));
  return {
    opening,
    inflow,
    outflow,
    transfers,
    net: roundMoney(inflow - outflow),
    closing: closing || roundMoney(opening + inflow - outflow),
    byAccount: closingRows,
  };
}

export function partyBalances(accounts, vouchers, parties = [], { kind = "receivable", from, to } = {}) {
  const type = kind === "payable" ? "payable" : "receivable";
  const ledgers = (accounts || []).filter(account => account.accountType === type);
  const ledgerIds = new Set(ledgers.map(account => account.id || account.code));
  const byParty = new Map();
  for (const party of parties) {
    byParty.set(party.id, { ...party, debit: 0, credit: 0, balance: 0 });
  }
  for (const voucher of vouchers || []) {
    if (!affectsLedgers(voucher) || !inRange(voucher.date, from, to)) continue;
    for (const line of voucher.lines || []) {
      if (!ledgerIds.has(line.coaId) && !ledgerIds.has(line.code)) continue;
      const partyId = line.partyId || voucher.partyId || "unassigned";
      if (!byParty.has(partyId)) {
        byParty.set(partyId, { id: partyId, name: partyId === "unassigned" ? "Unassigned" : partyId, partyType: "other", debit: 0, credit: 0 });
      }
      const row = byParty.get(partyId);
      row.debit = roundMoney(row.debit + Number(line.debit || 0));
      row.credit = roundMoney(row.credit + Number(line.credit || 0));
    }
  }
  return [...byParty.values()]
    .map(row => ({
      ...row,
      balance: type === "receivable"
        ? roundMoney(row.debit - row.credit)
        : roundMoney(row.credit - row.debit),
    }))
    .filter(row => row.balance !== 0)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

export function matchBankLine(statementLine, voucherLines = []) {
  if (statementLine.matchedVoucherLineId) {
    return { ...statementLine, matchStatus: "matched" };
  }
  const amount = roundMoney(statementLine.amount);
  const candidates = voucherLines.filter(line => {
    if (line.matched) return false;
    const lineAmount = roundMoney(Number(line.debit || 0) + Number(line.credit || 0));
    return lineAmount === amount && (!statementLine.lineDate || line.date === statementLine.lineDate);
  });
  if (candidates.length === 1) {
    return {
      ...statementLine,
      matchedVoucherLineId: candidates[0].id,
      matchStatus: "suggested",
    };
  }
  return { ...statementLine, matchStatus: statementLine.matchStatus || "unmatched" };
}

export const defaultBankStatementLines = (lines = [], voucherLines = []) =>
  lines.map(line => matchBankLine(line, voucherLines));

export function bankVoucherLines(accounts, vouchers, coaId) {
  const account = (accounts || []).find(item => item.id === coaId || item.code === coaId);
  if (!account) return [];
  const rows = [];
  for (const voucher of vouchers || []) {
    if (!affectsLedgers(voucher)) continue;
    for (const line of voucher.lines || []) {
      if (line.coaId !== account.id && line.code !== account.code) continue;
      rows.push({
        id: line.id,
        date: voucher.date,
        voucherNumber: voucher.voucherNumber,
        narration: line.description || voucher.narration,
        debit: roundMoney(line.debit),
        credit: roundMoney(line.credit),
        amount: roundMoney(Number(line.debit || 0) + Number(line.credit || 0)),
      });
    }
  }
  return rows.sort((a, b) => `${a.date}${a.voucherNumber}`.localeCompare(`${b.date}${b.voucherNumber}`));
}

export function overviewMetrics(accounts, vouchers, parties, range) {
  const tb = trialBalance(accounts, vouchers, range);
  const pnl = profitAndLoss(accounts, vouchers, range);
  const sheet = balanceSheet(accounts, vouchers, range);
  const cash = cashFlow(accounts, vouchers, range);
  const receivables = partyBalances(accounts, vouchers, parties, { kind: "receivable", ...range });
  const payables = partyBalances(accounts, vouchers, parties, { kind: "payable", ...range });
  const cashAccount = findAccount(accounts, { accountType: "cash" });
  return {
    fy: range,
    trialBalanced: tb.balanced,
    netProfit: pnl.net,
    cashOnHand: cashAccount ? ledgerBalances(accounts, vouchers, range).find(row => row.id === cashAccount.id || row.code === cashAccount.code)?.balance || 0 : cash.closing,
    cashClosing: cash.closing,
    receivables: roundMoney(receivables.reduce((sum, row) => sum + row.balance, 0)),
    payables: roundMoney(payables.reduce((sum, row) => sum + row.balance, 0)),
    assets: sheet.totalAssets,
    liabilities: sheet.totalLiabilities,
    equity: sheet.totalEquity,
    equationHolds: sheet.balanced,
  };
}

const daysBetween = (from, to) => {
  const start = new Date(`${String(from).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(to).slice(0, 10)}T00:00:00`);
  return Math.round((end - start) / 86400000);
};

export function invoiceStatus({ outstanding, dueDate, invoiceDate, today }) {
  if (roundMoney(outstanding) <= 0) return "Paid";
  const due = dueDate || invoiceDate;
  if (today < due) return "Current";
  if (today === due) return "Due";
  return "Overdue";
}

export function dashboardMetrics(accounts, vouchers, parties, { today, from, to } = {}) {
  const range = { from, to };
  const overview = overviewMetrics(accounts, vouchers, parties, range);
  const balances = ledgerBalances(accounts, vouchers, range);
  const byType = type => roundMoney(
    balances.filter(row => row.accountType === type).reduce((sum, row) => sum + row.balance, 0),
  );
  const todayRows = (vouchers || []).filter(voucher => affectsLedgers(voucher) && voucher.date === today);
  const sumType = type => roundMoney(
    todayRows.filter(voucher => voucher.voucherType === type).reduce((sum, voucher) => {
      const amount = voucherTotals(voucher.lines).debit;
      return isReversalVoucher(voucher) ? sum - amount : sum + amount;
    }, 0),
  );
  const pnl = profitAndLoss(accounts, vouchers, range);
  return {
    ...overview,
    cash: byType("cash"),
    bank: byType("bank"),
    upi: byType("upi"),
    todaySales: sumType("sales"),
    todayPurchases: sumType("purchase"),
    todayReceipts: sumType("receipt"),
    todayPayments: sumType("payment"),
    income: pnl.totalIncome,
    expenses: pnl.totalExpense,
  };
}

function lineHitsType(accounts, line, accountType) {
  const account = (accounts || []).find(item => item.id === line.coaId || item.code === line.code);
  return account?.accountType === accountType;
}

export function partyLedger(accounts, vouchers, party, { from, to, voucherType } = {}) {
  if (!party) return { party: null, rows: [], opening: 0, closing: 0, outstanding: 0 };
  const ledgerType = party.partyType === "supplier" ? "payable" : "receivable";
  const rows = [];
  let running = 0;
  const posted = (vouchers || [])
    .filter(affectsLedgers)
    .sort((a, b) => `${a.date}${a.voucherNumber}`.localeCompare(`${b.date}${b.voucherNumber}`));
  for (const voucher of posted) {
    if (voucherType && voucher.voucherType !== voucherType) continue;
    const lines = (voucher.lines || []).filter(line =>
      (line.partyId === party.id || (!line.partyId && voucher.partyId === party.id))
      && lineHitsType(accounts, line, ledgerType),
    );
    if (!lines.length) continue;
    const debit = roundMoney(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
    const credit = roundMoney(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
    if (!debit && !credit) continue;
    running = roundMoney(running + debit - credit);
    if (!inRange(voucher.date, from, to)) continue;
    rows.push({
      date: voucher.date,
      voucherNumber: voucher.voucherNumber,
      voucherType: voucher.voucherType,
      narration: voucher.narration,
      debit,
      credit,
      balance: running,
    });
  }
  const position = partyPosition(party.partyType, running);
  return {
    party,
    opening: 0,
    closing: position.closing,
    outstanding: position.outstanding,
    due: position.due,
    advance: position.advance,
    rows,
  };
}

export function invoiceRegister(accounts, vouchers, parties = [], { kind = "receivable", today, from, to, partyId, outstandingOnly = false } = {}) {
  const isAr = kind !== "payable";
  const invoiceType = isAr ? "sales" : "purchase";
  const settleType = isAr ? "receipt" : "payment";
  const noteType = isAr ? "credit_note" : "debit_note";
  const ledgerType = isAr ? "receivable" : "payable";
  const partyById = Object.fromEntries((parties || []).map(party => [party.id, party]));
  const invoices = [];
  const pool = new Map();
  const posted = (vouchers || [])
    .filter(affectsLedgers)
    .sort((a, b) => `${a.date}${a.voucherNumber}`.localeCompare(`${b.date}${b.voucherNumber}`));

  const enqueue = (id, amount) => {
    if (!id || roundMoney(amount) <= 0) return;
    if (!pool.has(id)) pool.set(id, []);
    pool.get(id).push({ amount: roundMoney(amount) });
  };

  for (const voucher of posted) {
    const amount = voucherTotals(voucher.lines).debit;
    const voucherPartyId = voucher.partyId || (voucher.lines || []).find(line => line.partyId)?.partyId || null;
    const hitsLedger = (voucher.lines || []).some(line => lineHitsType(accounts, line, ledgerType));

    if (voucher.voucherType === invoiceType && !isReversalVoucher(voucher)) {
      invoices.push({
        id: voucher.id,
        partyId: voucherPartyId,
        partyName: partyById[voucherPartyId]?.name || (voucherPartyId ? voucherPartyId : isAr ? "Cash sale" : "Cash purchase"),
        partyType: partyById[voucherPartyId]?.partyType || (isAr ? "customer" : "supplier"),
        reference: voucher.voucherNumber,
        invoiceDate: voucher.date,
        dueDate: voucher.dueDate || addDaysIso(voucher.date, 7),
        amount,
        paid: hitsLedger ? 0 : amount,
        voucherType: voucher.voucherType,
      });
      continue;
    }
    if ((voucher.voucherType === settleType || voucher.voucherType === noteType || isReversalVoucher(voucher)) && hitsLedger) {
      enqueue(voucherPartyId, amount);
    }
  }

  for (const invoice of invoices) {
    if (invoice.paid >= invoice.amount) {
      invoice.outstanding = 0;
    } else {
      let remaining = roundMoney(invoice.amount - invoice.paid);
      const queue = pool.get(invoice.partyId) || [];
      for (const item of queue) {
        if (remaining <= 0) break;
        const apply = Math.min(remaining, item.amount);
        remaining = roundMoney(remaining - apply);
        item.amount = roundMoney(item.amount - apply);
        invoice.paid = roundMoney(invoice.paid + apply);
      }
      invoice.outstanding = remaining;
    }
    invoice.daysOutstanding = invoice.outstanding > 0 ? Math.max(0, daysBetween(invoice.invoiceDate, today || invoice.invoiceDate)) : 0;
    invoice.status = invoiceStatus({
      outstanding: invoice.outstanding,
      dueDate: invoice.dueDate,
      invoiceDate: invoice.invoiceDate,
      today: today || invoice.invoiceDate,
    });
  }

  return invoices.filter(row => {
    if (partyId && row.partyId !== partyId) return false;
    if (!inRange(row.invoiceDate, from, to)) return false;
    if (outstandingOnly && row.outstanding <= 0) return false;
    return true;
  });
}

export const csvCell = value => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function downloadAccountsCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const excelCell = value => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

export function downloadAccountsExcel(filename, rows) {
  const table = `<table>${(rows || []).map(row => `<tr>${row.map(cell => `<td>${excelCell(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
  const html = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${table}</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = String(filename || "fintrack-report.xls").replace(/\.csv$/i, ".xls");
  if (!link.download.endsWith(".xls")) link.download = `${link.download}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}
