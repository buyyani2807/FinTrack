import test from "node:test";
import assert from "node:assert/strict";
import {
  disbursementPayoutError,
  disbursementPayoutSplit,
  disbursementPayoutTotal,
} from "../src/features/finance/disbursementMode.js";

test("daily payout total is paid to customer; monthly is principal", () => {
  assert.equal(disbursementPayoutTotal("daily", 8500, 10000), 8500);
  assert.equal(disbursementPayoutTotal("monthly", 8500, 100000), 100000);
});

test("payout split supports cash, upi, and cash+upi", () => {
  assert.deepEqual(disbursementPayoutSplit("cash", 8500), { mode: "cash", cashAmount: 8500, upiAmount: 0 });
  assert.deepEqual(disbursementPayoutSplit("upi", 800), { mode: "upi", cashAmount: 0, upiAmount: 800 });
  assert.deepEqual(disbursementPayoutSplit("cash_upi", 9000, 5000, 4000), { mode: "cash_upi", cashAmount: 5000, upiAmount: 4000 });
});

test("cash+upi payout is rejected until both sides equal the total", () => {
  assert.equal(disbursementPayoutError("cash_upi", 9000, 5000, 4000), "");
  assert.match(disbursementPayoutError("cash_upi", 9000, 9000, 0), /Cash and UPI/);
  assert.equal(disbursementPayoutError("cash", 8500), "");
});
