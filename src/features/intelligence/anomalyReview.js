/**
 * Cross-module review flags from recorded FinTrack data.
 * Advisory only: never labels a person as fraudulent and never writes books, bids, or winners.
 */

import { formatInr } from "../../lib/formatMoney.js";
import { SYSTEM_CODES, isPosted, isReversed, roundMoney } from "../accounts/model/accountingModel.js";
import { addDays, collectedOn, dailyCollectionPendingOn } from "../finance/model/loanState.js";

const LABELS = {
  duplicate: "Possible duplicate",
  unusual: "Unusual pattern detected",
  mismatch: "Data mismatch found",
  review: "Requires review",
};

const money = value => formatInr(value);

function daysBetween(from, to) {
  if (!from || !to) return null;
  const start = new Date(`${String(from).slice(0, 10)}T12:00:00`);
  const end = new Date(`${String(to).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.round((end - start) / 86400000);
}

function dateOnly(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}

function voucherTypeLabel(type) {
  if (type === "receipt") return "receipts";
  if (type === "purchase") return "purchases";
  if (type === "sales") return "sales";
  return "payments";
}

function debitTotal(voucher) {
  return roundMoney((voucher?.lines || []).reduce((sum, line) => sum + Number(line.debit || 0), 0));
}

function partyName(parties, partyId) {
  return (parties || []).find(party => party.id === partyId)?.name || "";
}

function median(values) {
  const sorted = [...values].filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function expenseBooks(accounts = []) {
  return accounts.filter(account =>
    account.groupType === "expense"
    && account.code !== SYSTEM_CODES.purchase
    && !/cost of goods/i.test(account.name || ""),
  );
}

function accountForLine(accounts, line) {
  return accounts.find(account => account.id === line.coaId || account.code === line.code) || null;
}

function item(fields) {
  return {
    severity: fields.tone === "duplicate" || fields.tone === "mismatch" ? "high" : "medium",
    actionLabel: fields.actionLabel || "",
    href: fields.href || null,
    ...fields,
    label: LABELS[fields.tone] || LABELS.review,
  };
}

function duplicateVouchers(vouchers, parties) {
  const groups = new Map();
  for (const voucher of vouchers || []) {
    if (!isPosted(voucher)) continue;
    if (!["receipt", "payment", "purchase", "sales"].includes(voucher.voucherType)) continue;
    const total = debitTotal(voucher);
    if (!(total > 0)) continue;
    const key = [voucher.voucherType, voucher.date, voucher.partyId || "", total].join("|");
    const list = groups.get(key) || [];
    list.push(voucher);
    groups.set(key, list);
  }
  return [...groups.values()].filter(group => group.length > 1).slice(0, 5).map(group => {
    const ordered = [...group].sort((a, b) => String(a.voucherNumber || "").localeCompare(String(b.voucherNumber || ""), undefined, { numeric: true }));
    const original = ordered[0];
    const copies = ordered.slice(1);
    const name = partyName(parties, original.partyId);
    const numbers = copies.map(voucher => voucher.voucherNumber).filter(Boolean).join(", ");
    return item({
      id: `dup-voucher-${ordered.map(voucher => voucher.id || voucher.voucherNumber).join("-")}`,
      module: "accounts",
      tone: "duplicate",
      title: numbers || "Vouchers",
      detail: `${copies.length === 1 ? "This matches" : "These match"} ${original.voucherNumber || "the first voucher"} on ${original.date || "the same date"} for ${money(debitTotal(original))}${name ? `, ${name}` : ""}.`,
      actionLabel: "Open transactions",
      href: { panel: "accounts", section: "vouchers" },
    });
  });
}

function unusualVoucherAmounts(vouchers, parties) {
  const groups = new Map();
  for (const voucher of vouchers || []) {
    if (!isPosted(voucher) || !voucher.partyId) continue;
    const total = debitTotal(voucher);
    if (!(total > 0)) continue;
    const key = `${voucher.voucherType}|${voucher.partyId}`;
    const list = groups.get(key) || [];
    list.push({ voucher, total });
    groups.set(key, list);
  }
  const found = [];
  for (const rows of groups.values()) {
    if (rows.length < 5) continue;
    const ordered = [...rows].sort((a, b) => `${a.voucher.date}${a.voucher.voucherNumber || ""}`.localeCompare(`${b.voucher.date}${b.voucher.voucherNumber || ""}`));
    const latest = ordered[ordered.length - 1];
    const baseline = median(ordered.slice(0, -1).map(row => row.total));
    if (!(baseline > 0) || latest.total < baseline * 3 || latest.total - baseline < 1000) continue;
    const name = partyName(parties, latest.voucher.partyId);
    found.push(item({
      id: `unusual-amount-${latest.voucher.id || latest.voucher.voucherNumber}`,
      module: "accounts",
      tone: "unusual",
      title: latest.voucher.voucherNumber || "Voucher",
      detail: `${money(latest.total)} on ${latest.voucher.date || "file"} is well above the earlier amounts around ${money(baseline)}${name ? ` for ${name}` : ""}.`,
      actionLabel: "Open transactions",
      href: { panel: "accounts", section: "vouchers" },
    }));
  }
  return found.slice(0, 4);
}

function repeatedReversals(vouchers, parties) {
  const reversed = (vouchers || []).filter(isReversed);
  if (reversed.length < 3) return [];
  const byParty = new Map();
  for (const voucher of reversed) {
    if (!voucher.partyId) continue;
    byParty.set(voucher.partyId, (byParty.get(voucher.partyId) || 0) + 1);
  }
  const partyHit = [...byParty.entries()].find(([, count]) => count >= 3);
  if (partyHit) {
    const name = partyName(parties, partyHit[0]);
    return [item({
      id: `reversals-${partyHit[0]}`,
      module: "accounts",
      tone: "review",
      title: `${partyHit[1]} reversed vouchers`,
      detail: name
        ? `${partyHit[1]} reversed vouchers are for ${name}.`
        : `${partyHit[1]} reversed vouchers use the same party.`,
      actionLabel: "Open transactions",
      href: { panel: "accounts", section: "vouchers" },
    })];
  }
  return [item({
    id: "reversals-all",
    module: "accounts",
    tone: "review",
    title: `${reversed.length} reversed vouchers`,
    detail: `${reversed.length} vouchers on file are reversed.`,
    actionLabel: "Open transactions",
    href: { panel: "accounts", section: "vouchers" },
  })];
}

function backdatedEntries(vouchers) {
  const found = [];
  for (const voucher of vouchers || []) {
    if (!isPosted(voucher)) continue;
    const recorded = dateOnly(voucher.createdAt || voucher.postedAt);
    const gap = daysBetween(voucher.date, recorded);
    if (gap == null || gap <= 14) continue;
    found.push(item({
      id: `backdated-${voucher.id || voucher.voucherNumber}`,
      module: "accounts",
      tone: "review",
      title: voucher.voucherNumber || "Voucher",
      detail: `Dated ${voucher.date} and recorded on ${recorded}.`,
      actionLabel: "Open transactions",
      href: { panel: "accounts", section: "vouchers" },
    }));
  }
  return found.slice(0, 4);
}

function expenseSpikes(vouchers, accounts, today) {
  const books = expenseBooks(accounts);
  if (!books.length || !today) return [];
  const month = today.slice(0, 7);
  const previous = addDays(`${month}-01`, -1).slice(0, 7);
  const totals = new Map();
  for (const voucher of vouchers || []) {
    if (!isPosted(voucher) || !String(voucher.date || "").startsWith(month) && !String(voucher.date || "").startsWith(previous)) continue;
    const key = String(voucher.date).slice(0, 7);
    for (const line of voucher.lines || []) {
      const debit = roundMoney(line.debit);
      if (!(debit > 0)) continue;
      const account = accountForLine(books, line);
      if (!account) continue;
      const bucket = totals.get(account.code) || { name: account.name, current: 0, previous: 0 };
      if (key === month) bucket.current = roundMoney(bucket.current + debit);
      if (key === previous) bucket.previous = roundMoney(bucket.previous + debit);
      totals.set(account.code, bucket);
    }
  }
  const found = [];
  for (const [code, bucket] of totals) {
    if (!(bucket.previous > 0) || bucket.current < bucket.previous * 2 || bucket.current - bucket.previous < 5000) continue;
    found.push(item({
      id: `expense-spike-${code}`,
      module: "accounts",
      tone: "unusual",
      title: bucket.name || "Expense",
      detail: `${money(bucket.current)} so far in ${month}, after ${money(bucket.previous)} in ${previous}.`,
      actionLabel: "Open profit and loss",
      href: { panel: "accounts", section: "pnl" },
    }));
  }
  return found.slice(0, 3);
}

function missingExpectedExpenses(vouchers, accounts, today) {
  const books = expenseBooks(accounts);
  if (!books.length || !today) return [];
  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const byCode = new Map();
  for (const voucher of vouchers || []) {
    if (!isPosted(voucher) || !voucher.date) continue;
    for (const line of voucher.lines || []) {
      const debit = roundMoney(line.debit);
      if (!(debit > 0)) continue;
      const account = accountForLine(books, line);
      if (!account) continue;
      const bucket = byCode.get(account.code) || { name: account.name, months: new Map() };
      const key = voucher.date.slice(0, 7);
      const days = bucket.months.get(key) || [];
      days.push(Number(voucher.date.slice(8, 10)));
      bucket.months.set(key, days);
      byCode.set(account.code, bucket);
    }
  }
  const found = [];
  for (const [code, bucket] of byCode) {
    if (bucket.months.has(month)) continue;
    const prior = [1, 2, 3].map(step => shiftMonth(month, -step));
    if (!prior.every(key => bucket.months.has(key))) continue;
    const usualDay = median(prior.flatMap(key => bucket.months.get(key) || []));
    if (day < usualDay) continue;
    found.push(item({
      id: `missing-expense-${code}`,
      module: "accounts",
      tone: "review",
      title: bucket.name || "Expense",
      detail: `Posted in each of the previous 3 months around day ${Math.round(usualDay)}, and not posted yet in ${month}.`,
      actionLabel: "Open profit and loss",
      href: { panel: "accounts", section: "pnl" },
    }));
  }
  return found.slice(0, 3);
}

function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lockedAfterPosting(vouchers, locks) {
  const active = (locks || []).filter(lock => lock.isLocked !== false && lock.periodFrom && lock.periodTo && lock.lockedAt);
  const found = [];
  for (const voucher of vouchers || []) {
    if (!isPosted(voucher) || !voucher.date) continue;
    const recorded = dateOnly(voucher.createdAt || voucher.postedAt);
    if (!recorded) continue;
    const lock = active.find(row => voucher.date >= row.periodFrom && voucher.date <= row.periodTo && recorded > dateOnly(row.lockedAt));
    if (!lock) continue;
    found.push(item({
      id: `lock-${voucher.id || voucher.voucherNumber}`,
      module: "accounts",
      tone: "review",
      title: voucher.voucherNumber || "Voucher",
      detail: `Dated ${voucher.date}, inside a locked period, and recorded on ${recorded} after the lock.`,
      actionLabel: "Open transactions",
      href: { panel: "accounts", section: "vouchers" },
    }));
  }
  return found.slice(0, 4);
}

function signedAmount(line) {
  const direction = String(line.direction || "").toLowerCase();
  const amount = Math.abs(Number(line.amount || 0));
  if (direction === "in" || direction === "credit") return amount;
  if (direction === "out" || direction === "debit") return -amount;
  return null;
}

function bankFindings(statements) {
  const found = [];
  for (const statement of statements || []) {
    const lines = statement.lines || [];
    const signed = lines.map(signedAmount);
    if (lines.length && signed.every(value => value != null) && Number.isFinite(Number(statement.openingBalance)) && Number.isFinite(Number(statement.closingBalance))) {
      const expected = roundMoney(Number(statement.openingBalance) + signed.reduce((sum, value) => sum + value, 0));
      if (Math.abs(expected - Number(statement.closingBalance)) > 1) {
        found.push(item({
          id: `bank-mismatch-${statement.id || statement.statementDate}`,
          module: "accounts",
          tone: "mismatch",
          title: statement.accountName || "Bank statement",
          detail: `Opening balance plus the lines is ${money(expected)}. The statement closing balance is ${money(statement.closingBalance)}.`,
          actionLabel: "Open banking",
          href: { panel: "accounts", section: "bank" },
        }));
      }
    }
    const duplicates = new Map();
    for (const line of lines) {
      const key = [line.lineDate, roundMoney(Math.abs(Number(line.amount || 0))), String(line.direction || ""), String(line.description || "").trim().toLowerCase()].join("|");
      const list = duplicates.get(key) || [];
      list.push(line);
      duplicates.set(key, list);
    }
    for (const group of duplicates.values()) {
      if (group.length < 2 || !(Math.abs(Number(group[0].amount || 0)) > 0)) continue;
      found.push(item({
        id: `bank-dup-${group.map(line => line.id).join("-")}`,
        module: "accounts",
        tone: "duplicate",
        title: statement.accountName || "Bank line",
        detail: `${group.length} lines on ${group[0].lineDate || "the same date"} share ${money(Math.abs(Number(group[0].amount || 0)))}${group[0].description ? ` · ${group[0].description}` : ""}.`,
        actionLabel: "Open banking",
        href: { panel: "accounts", section: "bank" },
      }));
      break;
    }
    if (lines.length >= 6) {
      const amounts = lines.map(line => Math.abs(Number(line.amount || 0))).filter(amount => amount > 0);
      const baseline = median(amounts);
      const outlier = lines.find(line => Math.abs(Number(line.amount || 0)) >= baseline * 3 && Math.abs(Number(line.amount || 0)) - baseline >= 10000);
      if (outlier && baseline > 0) {
        found.push(item({
          id: `bank-unusual-${outlier.id || outlier.lineDate}`,
          module: "accounts",
          tone: "unusual",
          title: statement.accountName || "Bank line",
          detail: `${money(Math.abs(Number(outlier.amount || 0)))} on ${outlier.lineDate || "file"} is well above the other lines around ${money(baseline)}.`,
          actionLabel: "Open banking",
          href: { panel: "accounts", section: "bank" },
        }));
      }
    }
  }
  return found.slice(0, 6);
}

function cashbookLinks(vouchers, entries) {
  if (!Array.isArray(entries)) return [];
  const byKey = new Map();
  for (const entry of entries) {
    if (!entry.sourceId && !entry.id) continue;
    const key = `${entry.sourceType || ""}:${entry.sourceId || ""}`;
    const list = byKey.get(key) || [];
    list.push(entry);
    byKey.set(key, list);
  }
  const found = [];
  for (const voucher of vouchers || []) {
    if (!isPosted(voucher) || voucher.sourceModule !== "cashbook" || !voucher.sourceTransactionId) continue;
    if (voucher.sourceType === "transfer") continue;
    const matches = byKey.get(`${voucher.sourceType || ""}:${voucher.sourceTransactionId}`) || [];
    const voucherTotal = debitTotal(voucher);
    if (!matches.length) {
      found.push(item({
        id: `cashbook-missing-${voucher.id || voucher.voucherNumber}`,
        module: "accounts",
        tone: "mismatch",
        title: voucher.voucherNumber || "Linked voucher",
        detail: "Posted from the cashbook, and that cashbook row is not in the loaded cashbook.",
        actionLabel: "Open transactions",
        href: { panel: "accounts", section: "vouchers" },
      }));
      continue;
    }
    const amounts = matches.map(entry => roundMoney(Math.max(Number(entry.moneyIn || 0), Number(entry.moneyOut || 0))));
    if (amounts.some(amount => Math.abs(amount - voucherTotal) <= 1)) continue;
    found.push(item({
      id: `cashbook-amount-${voucher.id || voucher.voucherNumber}`,
      module: "accounts",
      tone: "mismatch",
      title: voucher.voucherNumber || "Linked voucher",
      detail: `Accounts shows ${money(voucherTotal)}. The linked cashbook row shows ${money(amounts[0])}.`,
      actionLabel: "Open transactions",
      href: { panel: "accounts", section: "vouchers" },
    }));
  }
  return found.slice(0, 4);
}

function collectionDrop(loans, today) {
  if (!today) return [];
  const currentFrom = addDays(today, -6);
  const previousFrom = addDays(today, -13);
  const previousTo = addDays(today, -7);
  let current = 0;
  let previous = 0;
  for (const loan of loans || []) {
    if (loan.kind && loan.kind !== "daily") continue;
    for (const tx of loan.transactions || []) {
      const amount = Number(tx.amount || 0);
      if (!(amount > 0) || !tx.date) continue;
      if (tx.date >= currentFrom && tx.date <= today) current += amount;
      else if (tx.date >= previousFrom && tx.date <= previousTo) previous += amount;
    }
  }
  current = roundMoney(current);
  previous = roundMoney(previous);
  if (!(previous >= 1000) || current >= previous * 0.5) return [];
  return [item({
    id: "collection-drop",
    module: "daily",
    tone: "unusual",
    title: "Daily collections",
    detail: `${money(current)} in the last 7 days, after ${money(previous)} in the 7 days before that.`,
    actionLabel: "Open collections",
    href: { panel: "daily", section: "collections" },
  })];
}

function duplicateCollections(loans) {
  const found = [];
  for (const loan of loans || []) {
    const groups = new Map();
    for (const tx of loan.transactions || []) {
      const amount = roundMoney(tx.amount);
      if (!(amount > 0) || !tx.date) continue;
      const key = `${tx.date}|${amount}`;
      const list = groups.get(key) || [];
      list.push(tx);
      groups.set(key, list);
    }
    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      const [date, amount] = key.split("|");
      found.push(item({
        id: `dup-collection-${loan.id}-${date}-${amount}`,
        module: loan.kind === "monthly" ? "monthly" : "daily",
        tone: "duplicate",
        title: loan.customerName || "Customer",
        detail: `${group.length} collections on ${date} are each ${money(Number(amount))}.`,
        actionLabel: "Open collections",
        href: { panel: loan.kind === "monthly" ? "monthly" : "daily", section: "collections" },
      }));
    }
  }
  return found.slice(0, 5);
}

function paymentBehavior(loans, today) {
  if (!today) return [];
  const found = [];
  const windowStart = addDays(today, -14);
  const windowEnd = addDays(today, -1);
  for (const loan of loans || []) {
    if (loan.kind && loan.kind !== "daily") continue;
    if (loan.status && loan.status !== "active") continue;
    if (!dailyCollectionPendingOn(loan, today)) continue;
    let paidDays = 0;
    for (let cursor = windowStart; cursor <= windowEnd; cursor = addDays(cursor, 1)) {
      if (collectedOn(loan, cursor)) paidDays += 1;
    }
    if (paidDays < 10) continue;
    found.push(item({
      id: `behavior-${loan.id}`,
      module: "daily",
      tone: "review",
      title: loan.customerName || "Customer",
      detail: `Collected on ${paidDays} of the previous 14 days, and no collection is recorded today.`,
      actionLabel: "Open collections",
      href: { panel: "daily", section: "collections" },
    }));
  }
  return found.slice(0, 5);
}

function agentAmounts(loans, today) {
  if (!today) return [];
  const start = addDays(today, -20);
  const byAgent = new Map();
  for (const loan of loans || []) {
    for (const tx of loan.transactions || []) {
      const amount = Number(tx.amount || 0);
      if (!(amount > 0) || !tx.date || tx.date < start || tx.date > today) continue;
      const name = tx.collectorName || "";
      if (!name) continue;
      const days = byAgent.get(name) || new Map();
      days.set(tx.date, roundMoney((days.get(tx.date) || 0) + amount));
      byAgent.set(name, days);
    }
  }
  const found = [];
  for (const [name, days] of byAgent) {
    if (days.size < 4) continue;
    const recent = [...days.entries()].filter(([date]) => date >= addDays(today, -6));
    for (const [date, amount] of recent) {
      const others = [...days.entries()].filter(([day]) => day !== date).map(([, value]) => value);
      const baseline = median(others);
      if (!(baseline > 0) || amount < baseline * 3 || amount - baseline < 2000) continue;
      found.push(item({
        id: `agent-${name}-${date}`,
        module: "daily",
        tone: "unusual",
        title: name,
        detail: `Collections recorded under this name on ${date} are ${money(amount)}, above the recent daily amount of about ${money(baseline)}.`,
        actionLabel: "Open collections",
        href: { panel: "daily", section: "collections" },
      }));
      break;
    }
  }
  return found.slice(0, 3);
}

function auctionScheme(scheme) {
  const type = scheme?.chit_type || scheme?.chitType || scheme?.type || "auction";
  return type === "auction";
}

function winningBidShifts(schemes, cycles) {
  const found = [];
  for (const scheme of (schemes || []).filter(auctionScheme)) {
    const rows = (cycles || [])
      .filter(cycle => cycle.scheme_id === scheme.id && Number(cycle.winning_bid_amount) > 0)
      .sort((a, b) => Number(a.cycle_number) - Number(b.cycle_number));
    if (rows.length < 4) continue;
    const latest = rows[rows.length - 1];
    const baseline = rows.slice(-4, -1).reduce((sum, cycle) => sum + Number(cycle.winning_bid_amount), 0) / 3;
    const amount = Number(latest.winning_bid_amount);
    if (!(baseline > 0) || (amount < baseline * 1.5 && amount > baseline * 0.6)) continue;
    found.push(item({
      id: `auction-trend-${scheme.id}`,
      module: "chit",
      tone: "unusual",
      title: scheme.name || "Auction",
      detail: `The latest recorded winning amount is ${money(amount)}, against about ${money(baseline)} over the previous three months. The recorded winner is unchanged.`,
      actionLabel: "Open Chit Fund",
      href: { panel: "chit" },
    }));
  }
  return found.slice(0, 3);
}

function duplicateCycles(schemes, cycles) {
  const names = new Map((schemes || []).map(scheme => [scheme.id, scheme.name]));
  const groups = new Map();
  for (const cycle of cycles || []) {
    const key = `${cycle.scheme_id}|${cycle.cycle_number}`;
    const list = groups.get(key) || [];
    list.push(cycle);
    groups.set(key, list);
  }
  return [...groups.values()].filter(group => group.length > 1).slice(0, 3).map(group => item({
    id: `dup-cycle-${group[0].scheme_id}-${group[0].cycle_number}`,
    module: "chit",
    tone: "duplicate",
    title: names.get(group[0].scheme_id) || "Auction",
    detail: `Month ${group[0].cycle_number} is recorded ${group.length} times.`,
    actionLabel: "Open Chit Fund",
    href: { panel: "chit" },
  }));
}

function millis(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function liveAuctionFindings(auctions, now) {
  const found = [];
  const notes = [];
  for (const auction of auctions || []) {
    const bids = auction.bids || [];
    if (!auction.status && !bids.length) continue;
    notes.push("The highest recorded bid remains the leading bid. This review does not select a winner or change the dividend, commission, or installment.");
    if (bids.length) {
      const members = new Set(bids.map(bid => bid.enrollment_id || bid.member_name || bid.id)).size;
      notes.push(`${members} member${members === 1 ? " has" : "s have"} bids on file. ${bids.length} bid${bids.length === 1 ? " is" : "s are"} recorded.`);
    }
    const started = millis(auction.startedAt || auction.started_at);
    const clock = millis(now) ?? Date.now();
    if ((auction.status === "open" || auction.status === "paused") && !bids.length && started != null && clock - started >= 15 * 60 * 1000) {
      found.push(item({
        id: `auction-quiet-${auction.id || auction.name}`,
        module: "chit",
        tone: "review",
        title: auction.name || "Live auction",
        detail: "Bidding has been open for at least 15 minutes and no bid is recorded.",
      }));
    }
    const byMember = new Map();
    for (const bid of bids) {
      const member = bid.enrollment_id || bid.member_name || "member";
      const list = byMember.get(member) || [];
      list.push(bid);
      byMember.set(member, list);
      if (bid.status === "rejected") {
        found.push(item({
          id: `bid-rejected-${bid.id || bid.submitted_at}`,
          module: "chit",
          tone: "review",
          title: bid.member_name || "Bid",
          detail: bid.reason || bid.rejection_reason || "The auction check rejected this bid.",
        }));
      }
      const sent = millis(bid.submitted_at || bid.submittedAt);
      const received = millis(bid.received_at || bid.receivedAt);
      if (sent != null && received != null && received - sent > 15000) {
        found.push(item({
          id: `bid-latency-${bid.id || sent}`,
          module: "chit",
          tone: "review",
          severity: "low",
          title: bid.member_name || "Bid",
          detail: `The bid update took ${Math.round((received - sent) / 1000)} seconds to record.`,
        }));
      }
    }
    for (const list of byMember.values()) {
      const ordered = [...list].sort((a, b) => String(a.submitted_at || a.submittedAt || "").localeCompare(String(b.submitted_at || b.submittedAt || "")));
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        const currentAt = millis(current.submitted_at || current.submittedAt);
        const previousAt = millis(previous.submitted_at || previous.submittedAt);
        if (currentAt == null || previousAt == null) continue;
        const gap = currentAt - previousAt;
        if (gap >= 0 && gap <= 90000 && Number(current.bid_amount ?? current.bidAmount) === Number(previous.bid_amount ?? previous.bidAmount)) {
          found.push(item({
            id: `bid-dup-${current.id || index}`,
            module: "chit",
            tone: "duplicate",
            title: current.member_name || previous.member_name || "Bid",
            detail: `The same amount ${money(Number(current.bid_amount ?? current.bidAmount))} was submitted twice within ${Math.max(1, Math.round(gap / 1000))} seconds.`,
          }));
          break;
        }
      }
      if (ordered.length >= 3) {
        for (let index = 2; index < ordered.length; index += 1) {
          const latestAt = millis(ordered[index].submitted_at || ordered[index].submittedAt);
          const earlierAt = millis(ordered[index - 2].submitted_at || ordered[index - 2].submittedAt);
          if (latestAt == null || earlierAt == null) continue;
          const span = latestAt - earlierAt;
          if (span >= 0 && span <= 120000) {
            found.push(item({
              id: `bid-rapid-${ordered[index].enrollment_id || index}`,
              module: "chit",
              tone: "unusual",
              title: ordered[index].member_name || "Member",
              detail: "Three bids from the same member were recorded within two minutes.",
            }));
            break;
          }
        }
      }
      if (bids.length >= 8 && list.length >= 5 && list.length > bids.length / 2) {
        found.push(item({
          id: `bid-share-${list[0].enrollment_id || list[0].member_name}`,
          module: "chit",
          tone: "review",
          title: list[0].member_name || "Member",
          detail: `${list.length} of ${bids.length} bids in this auction were posted under this member.`,
        }));
      }
    }
  }
  return { items: found.slice(0, 8), notes };
}

const TONE_RANK = { mismatch: 0, duplicate: 1, unusual: 2, review: 3 };

/** Read-only review. The input records are not modified. */
export function buildAnomalyReview({
  vouchers = [],
  accounts = [],
  parties = [],
  statements = [],
  locks = [],
  cashbookEntries = null,
  loans = [],
  schemes = [],
  cycles = [],
  auctions = [],
  today = "",
  now = "",
} = {}) {
  const live = liveAuctionFindings(auctions, now || (today ? `${today}T12:00:00` : ""));
  const items = [
    ...duplicateVouchers(vouchers, parties),
    ...unusualVoucherAmounts(vouchers, parties),
    ...repeatedReversals(vouchers, parties),
    ...backdatedEntries(vouchers),
    ...expenseSpikes(vouchers, accounts, today),
    ...missingExpectedExpenses(vouchers, accounts, today),
    ...lockedAfterPosting(vouchers, locks),
    ...bankFindings(statements),
    ...cashbookLinks(vouchers, cashbookEntries),
    ...collectionDrop(loans, today),
    ...duplicateCollections(loans),
    ...paymentBehavior(loans, today),
    ...agentAmounts(loans, today),
    ...winningBidShifts(schemes, cycles),
    ...duplicateCycles(schemes, cycles),
    ...live.items,
  ].sort((a, b) => (TONE_RANK[a.tone] ?? 9) - (TONE_RANK[b.tone] ?? 9)).slice(0, 12);
  return {
    items,
    notes: live.notes,
    count: items.length,
    summary: items.length
      ? `${items.length} pattern${items.length === 1 ? "" : "s"} to review`
      : "No unusual patterns in the records checked.",
    disclaimer: "These patterns come from recorded FinTrack data. They do not label a customer, employee, or agent as fraudulent, and they do not change books, collections, bids, or auction winners.",
  };
}
