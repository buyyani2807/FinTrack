import {
  SYSTEM_CODES,
  accountingEquationHolds,
  findAccount,
  isPosted,
  ledgerBalances,
  roundMoney,
  signedBalance,
} from "./accountingModel.js";

const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

export function dayBook(vouchers = [], { from, to } = {}) {
  return (vouchers || [])
    .filter(voucher => isPosted(voucher) && inRange(voucher.date, from, to))
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
    .filter(voucher => isPosted(voucher))
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

export function cashFlow(accounts, vouchers, range = {}) {
  const moneyTypes = new Set(["cash", "bank", "upi"]);
  const money = (accounts || []).filter(account => moneyTypes.has(account.accountType));
  const ids = new Set(money.map(account => account.id || account.code));
  let inflow = 0;
  let outflow = 0;
  for (const voucher of vouchers || []) {
    if (!isPosted(voucher) || !inRange(voucher.date, range.from, range.to)) continue;
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
  const before = ledgerBalances(accounts, vouchers, { to: range.from ? undefined : undefined });
  const closing = roundMoney(
    ledgerBalances(accounts, vouchers, range)
      .filter(row => moneyTypes.has(row.accountType))
      .reduce((sum, row) => sum + row.balance, 0),
  );
  return {
    opening,
    inflow,
    outflow,
    net: roundMoney(inflow - outflow),
    closing: closing || roundMoney(opening + inflow - outflow),
    byAccount: before.filter(row => moneyTypes.has(row.accountType)),
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
    if (!isPosted(voucher) || !inRange(voucher.date, from, to)) continue;
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
