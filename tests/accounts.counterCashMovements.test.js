import test from "node:test";
import assert from "node:assert/strict";
import {
  cashMovementPostTargets,
  cashMovementTotals,
  cashMovementVoucherDraft,
  expectedDrawerCash,
  mapCashMovementRow,
  parseCashAmount,
  suggestCashMovementTarget,
  tillCashMovements,
  validateCashMovement,
} from "../src/features/accounts/model/counterCashMovements.js";
import { voucherTotals } from "../src/features/accounts/model/accountingModel.js";

const accounts = [
  { id: "cash", code: "1000", name: "Cash in Hand", accountType: "cash", groupType: "asset" },
  { id: "upi", code: "1010", name: "UPI", accountType: "upi", groupType: "asset" },
  { id: "bank", code: "1020", name: "Bank", accountType: "bank", groupType: "asset" },
  { id: "ar", code: "1100", name: "Accounts Receivable", accountType: "receivable", groupType: "asset" },
  { id: "capital", code: "3000", name: "Capital", accountType: "capital", groupType: "equity" },
  { id: "drawings", code: "3100", name: "Drawings", accountType: "drawing", groupType: "equity" },
  { id: "other-income", code: "4100", name: "Other Income", accountType: "income", groupType: "income" },
  { id: "sales", code: "4300", name: "Sales", accountType: "income", groupType: "income" },
  { id: "rent", code: "5000", name: "Rent", accountType: "expense", groupType: "expense" },
  { id: "misc", code: "5990", name: "Other Expenses", accountType: "expense", groupType: "expense" },
  { id: "old", code: "5800", name: "Old ledger", accountType: "expense", groupType: "expense", isActive: false },
];

const move = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  date: "2026-11-15",
  tillId: "till-1",
  tillLabel: "Till 1",
  direction: "out",
  amount: 120,
  reason: "Tea / snacks",
  note: "",
  cashierName: "Priya",
  createdAt: "2026-11-15T05:00:00Z",
  cancelledAt: null,
  postedVoucherId: null,
  ...over,
});

test("cash amount accepts rupees and paise only", () => {
  assert.equal(parseCashAmount("250"), 250);
  assert.equal(parseCashAmount("₹1,250.50"), 1250.5);
  assert.equal(parseCashAmount(" 40 "), 40);
  assert.equal(parseCashAmount("-40"), 0);
  assert.equal(parseCashAmount("12.345"), 0);
  assert.equal(parseCashAmount("abc"), 0);
  assert.equal(parseCashAmount(""), 0);
});

test("a cash entry needs a direction, an amount and a reason; Other needs a note", () => {
  assert.equal(validateCashMovement({ direction: "out", amount: "120", reason: "Tea / snacks" }), "");
  assert.match(validateCashMovement({ direction: "", amount: "120", reason: "Tea / snacks" }), /cash in or cash out/);
  assert.match(validateCashMovement({ direction: "out", amount: "0", reason: "Tea / snacks" }), /greater than zero/);
  assert.match(validateCashMovement({ direction: "out", amount: "120", reason: "" }), /reason/);
  assert.match(validateCashMovement({ direction: "in", amount: "120", reason: "Other" }), /note/);
  assert.equal(validateCashMovement({ direction: "in", amount: "120", reason: "Other", note: "Coins from home" }), "");
});

test("till list keeps this till and day, drops cancelled, newest first", () => {
  const rows = tillCashMovements([
    move({ id: "a", createdAt: "2026-11-15T05:00:00Z" }),
    move({ id: "b", createdAt: "2026-11-15T07:00:00Z" }),
    move({ id: "c", cancelledAt: "2026-11-15T07:05:00Z" }),
    move({ id: "d", tillId: "till-2" }),
    move({ id: "e", date: "2026-11-14" }),
  ], { date: "2026-11-15", tillId: "till-1" });
  assert.deepEqual(rows.map(row => row.id), ["b", "a"]);
});

test("totals and expected drawer cash include cash in and cash out", () => {
  const totals = cashMovementTotals([
    move({ direction: "out", amount: 120 }),
    move({ direction: "out", amount: 30.5 }),
    move({ direction: "in", amount: 500 }),
    move({ direction: "out", amount: 999, cancelledAt: "2026-11-15T07:05:00Z" }),
  ]);
  assert.deepEqual(totals, { cashIn: 500, cashOut: 150.5, net: 349.5 });
  assert.equal(expectedDrawerCash({ openingFloat: 1000, cashSales: 4200, ...totals }), 5549.5);
  assert.equal(expectedDrawerCash({ openingFloat: 1000, cashSales: 4200 }), 5200);
});

test("post targets differ for cash out and cash in and never include cash, sales or inactive ledgers", () => {
  const out = cashMovementPostTargets(accounts, "out").map(row => row.id);
  assert.deepEqual(out, ["rent", "misc", "drawings", "upi", "bank"]);
  const cashIn = cashMovementPostTargets(accounts, "in").map(row => row.id);
  assert.deepEqual(cashIn, ["capital", "upi", "bank", "other-income"]);
});

test("the suggested ledger follows the cashier's reason", () => {
  assert.equal(suggestCashMovementTarget(accounts, move({ reason: "Given to owner" })), "drawings");
  assert.equal(suggestCashMovementTarget(accounts, move({ reason: "Deposited in bank" })), "bank");
  assert.equal(suggestCashMovementTarget(accounts, move({ reason: "Tea / snacks" })), "misc");
  assert.equal(suggestCashMovementTarget(accounts, move({ direction: "in", reason: "Owner added cash" })), "capital");
  assert.equal(suggestCashMovementTarget(accounts, move({ direction: "in", reason: "Change brought in" })), "");
});

test("cash out posts a balanced payment: debit the ledger, credit cash", () => {
  const draft = cashMovementVoucherDraft({ accounts, movement: move(), targetAccountId: "misc" });
  assert.equal(draft.voucherType, "payment");
  assert.equal(draft.date, "2026-11-15");
  assert.deepEqual(draft.lines.map(line => [line.coaId, line.debit, line.credit]), [["misc", 120, 0], ["cash", 0, 120]]);
  const totals = voucherTotals(draft.lines);
  assert.equal(totals.debit, totals.credit);
  assert.equal(draft.sourceType, "counter_cash");
  assert.equal(draft.sourceTransactionId, move().id);
  assert.equal(draft.clientRequestId, `counter-cash-${move().id}`);
  assert.match(draft.narration, /Counter cash out · Till 1 · Tea \/ snacks · Cashier Priya/);
});

test("cash in posts debit cash; bank moves are a contra", () => {
  const capital = cashMovementVoucherDraft({
    accounts,
    movement: move({ direction: "in", amount: 500, reason: "Owner added cash" }),
    targetAccountId: "capital",
  });
  assert.equal(capital.voucherType, "journal");
  assert.deepEqual(capital.lines.map(line => [line.coaId, line.debit, line.credit]), [["cash", 500, 0], ["capital", 0, 500]]);
  const deposit = cashMovementVoucherDraft({
    accounts,
    movement: move({ amount: 3000, reason: "Deposited in bank" }),
    targetAccountId: "bank",
  });
  assert.equal(deposit.voucherType, "contra");
  assert.deepEqual(deposit.lines.map(line => [line.coaId, line.debit, line.credit]), [["bank", 3000, 0], ["cash", 0, 3000]]);
});

test("a movement cannot be posted twice, after cancel, or to a ledger that is not offered", () => {
  assert.throws(() => cashMovementVoucherDraft({ accounts, movement: move({ postedVoucherId: "v1" }), targetAccountId: "misc" }), /already posted/);
  assert.throws(() => cashMovementVoucherDraft({ accounts, movement: move({ cancelledAt: "2026-11-15T07:05:00Z" }), targetAccountId: "misc" }), /cancelled/);
  assert.throws(() => cashMovementVoucherDraft({ accounts, movement: move(), targetAccountId: "sales" }), /Choose the ledger/);
  assert.throws(() => cashMovementVoucherDraft({ accounts, movement: move(), targetAccountId: "cash" }), /Choose the ledger/);
  assert.throws(() => cashMovementVoucherDraft({ accounts, movement: move({ direction: "in" }), targetAccountId: "rent" }), /Choose the ledger/);
  assert.throws(() => cashMovementVoucherDraft({ accounts: accounts.filter(row => row.id !== "cash"), movement: move(), targetAccountId: "misc" }), /Cash in Hand/);
});

test("server rows map to the client shape", () => {
  const row = mapCashMovementRow({
    id: "x", movement_date: "2026-11-15", till_id: "till-2", till_label: "Till 2", direction: "in",
    amount: "500.00", reason: "Float top-up", note: null, cashier_name: "Ravi", created_by: "u1",
    created_at: "2026-11-15T05:00:00Z", cancelled_at: null, posted_voucher_id: null, posted_at: null,
  });
  assert.deepEqual(row, {
    id: "x", date: "2026-11-15", tillId: "till-2", tillLabel: "Till 2", direction: "in", amount: 500,
    reason: "Float top-up", note: "", cashierName: "Ravi", createdBy: "u1",
    createdAt: "2026-11-15T05:00:00Z", cancelledAt: null, postedVoucherId: null, postedAt: null,
  });
});
