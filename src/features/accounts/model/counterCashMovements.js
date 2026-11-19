/**
 * Counter cash in / out — money put into or taken from the till drawer that is not a sale.
 * A cashier records the movement (migration 148). It is a till record, not a voucher:
 * the owner or accountant posts it to a ledger later. Pure helpers only; no network here.
 */
import { findAccount, isMoneyAccount, roundMoney, SYSTEM_CODES } from "./accountingModel.js";

export const CASH_OUT_REASONS = [
  "Tea / snacks",
  "Courier / transport",
  "Shop supplies",
  "Cleaning / maintenance",
  "Paid to supplier",
  "Given to owner",
  "Deposited in bank",
  "Other",
];

export const CASH_IN_REASONS = [
  "Change brought in",
  "Float top-up",
  "Owner added cash",
  "Withdrawn from bank",
  "Other",
];

export const cashMovementReasons = direction => (direction === "in" ? CASH_IN_REASONS : CASH_OUT_REASONS);

/** Rupee amount typed at the till: digits with an optional decimal part. Anything else is 0. */
export function parseCashAmount(value) {
  const text = String(value ?? "").replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return 0;
  return roundMoney(Number(text));
}

/** Returns the message to show, or "" when the entry can be saved. */
export function validateCashMovement({ direction, amount, reason, note = "" } = {}) {
  if (direction !== "in" && direction !== "out") return "Choose cash in or cash out.";
  if (!(parseCashAmount(amount) > 0)) return "Enter an amount greater than zero.";
  const picked = String(reason || "").trim();
  if (!picked) return "Choose a reason.";
  if (picked === "Other" && !String(note || "").trim()) return "Write a short note for “Other”.";
  return "";
}

export const isLiveCashMovement = movement => Boolean(movement) && !movement.cancelledAt;

/** Live movements of one till on one day, newest first. */
export function tillCashMovements(movements = [], { date, tillId = "till-1" } = {}) {
  const day = String(date || "").slice(0, 10);
  return (movements || [])
    .filter(movement => isLiveCashMovement(movement)
      && String(movement.date || "").slice(0, 10) === day
      && (movement.tillId || "till-1") === tillId)
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function cashMovementTotals(movements = []) {
  let cashIn = 0;
  let cashOut = 0;
  for (const movement of movements || []) {
    if (!isLiveCashMovement(movement)) continue;
    const amount = roundMoney(Number(movement.amount || 0));
    if (!(amount > 0)) continue;
    if (movement.direction === "in") cashIn = roundMoney(cashIn + amount);
    else if (movement.direction === "out") cashOut = roundMoney(cashOut + amount);
  }
  return { cashIn, cashOut, net: roundMoney(cashIn - cashOut) };
}

/** Cash that should be in the drawer: float + cash sales + cash in − cash out. */
export function expectedDrawerCash({ openingFloat = 0, cashSales = 0, cashIn = 0, cashOut = 0 } = {}) {
  return roundMoney(
    Number(openingFloat || 0) + Number(cashSales || 0) + Number(cashIn || 0) - Number(cashOut || 0),
  );
}

const isCashAccount = account => account?.accountType === "cash";

/**
 * Ledgers the owner can post a movement to.
 * Cash out: expenses, drawings, a bank or UPI account (deposit), a supplier payable.
 * Cash in: capital, other income, a bank or UPI account (withdrawal).
 */
export function cashMovementPostTargets(accounts = [], direction = "out") {
  const active = (accounts || []).filter(account => account && account.isActive !== false && !isCashAccount(account));
  const pick = test => active.filter(test);
  const row = (account, group) => ({ id: account.id, code: account.code, name: account.name, group });
  if (direction === "in") {
    return [
      ...pick(account => account.accountType === "capital").map(account => row(account, "Owner")),
      ...pick(account => isMoneyAccount(account)).map(account => row(account, "Bank / UPI")),
      ...pick(account => account.groupType === "income" && account.code !== SYSTEM_CODES.sales).map(account => row(account, "Income")),
    ];
  }
  return [
    ...pick(account => account.groupType === "expense").map(account => row(account, "Expense")),
    ...pick(account => account.accountType === "drawing").map(account => row(account, "Owner")),
    ...pick(account => isMoneyAccount(account)).map(account => row(account, "Bank / UPI")),
  ];
}

/** Best first guess for the ledger, from the reason the cashier picked. */
export function suggestCashMovementTarget(accounts = [], movement = {}) {
  const targets = cashMovementPostTargets(accounts, movement.direction);
  const reason = String(movement.reason || "").toLowerCase();
  const byType = type => targets.find(target => findAccount(accounts, { id: target.id })?.accountType === type);
  if (/owner/.test(reason)) return (movement.direction === "in" ? byType("capital") : byType("drawing"))?.id || "";
  if (/bank/.test(reason)) return byType("bank")?.id || "";
  if (movement.direction === "out") {
    return targets.find(target => target.code === SYSTEM_CODES.otherExpense)?.id || "";
  }
  return "";
}

/**
 * Voucher for one movement: cash out debits the chosen ledger and credits Cash in Hand;
 * cash in is the reverse. Bank / UPI targets are a contra; everything else is a payment
 * (out) or a journal (in).
 */
export function cashMovementVoucherDraft({ accounts = [], movement, targetAccountId } = {}) {
  if (!movement?.id) throw new Error("Cash entry is missing");
  if (!isLiveCashMovement(movement)) throw new Error("This cash entry was cancelled");
  if (movement.postedVoucherId) throw new Error("This cash entry is already posted");
  const amount = roundMoney(Number(movement.amount || 0));
  if (!(amount > 0)) throw new Error("Enter an amount greater than zero");
  const cash = findAccount(accounts, { code: SYSTEM_CODES.cash }) || findAccount(accounts, { accountType: "cash" });
  if (!cash) throw new Error("Missing Cash in Hand account");
  const target = cashMovementPostTargets(accounts, movement.direction).find(row => row.id === targetAccountId);
  if (!target) throw new Error("Choose the ledger to post this to");
  const targetAccount = findAccount(accounts, { id: target.id });
  const narration = [
    movement.direction === "in" ? "Counter cash in" : "Counter cash out",
    movement.tillLabel || "",
    movement.reason || "",
    String(movement.note || "").trim(),
    movement.cashierName ? `Cashier ${movement.cashierName}` : "",
  ].filter(Boolean).join(" · ");
  const cashLine = { coaId: cash.id, code: cash.code, description: narration };
  const targetLine = { coaId: target.id, code: target.code, description: narration };
  const lines = movement.direction === "in"
    ? [{ ...cashLine, debit: amount, credit: 0 }, { ...targetLine, debit: 0, credit: amount }]
    : [{ ...targetLine, debit: amount, credit: 0 }, { ...cashLine, debit: 0, credit: amount }];
  return {
    voucherType: isMoneyAccount(targetAccount) ? "contra" : movement.direction === "in" ? "journal" : "payment",
    date: String(movement.date || "").slice(0, 10),
    partyId: null,
    narration,
    lines,
    // acc_post_voucher takes input_client_request_id as a uuid; the movement's own
    // id is already unique per movement and gives identical idempotency.
    clientRequestId: movement.id,
    sourceModule: "accounts",
    sourceType: "counter_cash",
    sourceTransactionId: movement.id,
  };
}

/** Server row (snake_case) → client shape. */
export function mapCashMovementRow(row = {}) {
  return {
    id: row.id,
    date: String(row.movement_date || "").slice(0, 10),
    tillId: row.till_id || "till-1",
    tillLabel: row.till_label || "",
    direction: row.direction,
    amount: roundMoney(Number(row.amount || 0)),
    reason: row.reason || "",
    note: row.note || "",
    cashierName: row.cashier_name || "",
    createdBy: row.created_by || null,
    createdAt: row.created_at || "",
    cancelledAt: row.cancelled_at || null,
    postedVoucherId: row.posted_voucher_id || null,
    postedAt: row.posted_at || null,
  };
}
