import test from "node:test";
import assert from "node:assert/strict";
import { receivedByMode } from "../src/features/finance/model/paymentSplit.js";

test("splits received amounts into cash and UPI", () => {
  const rows = receivedByMode([
    { mode: "cash", amount: 600 },
    { mode: "upi", amount: 400 },
  ]);
  assert.deepEqual(rows.map(r => [r.label, r.amount]), [["Cash", 600], ["UPI", 400]]);
});

test("a Cash + UPI payment counts in both by its split", () => {
  const rows = receivedByMode([
    { mode: "cash_upi", amount: 1000, cashAmount: 300, upiAmount: 700 },
    { mode: "cash", amount: 200 },
  ]);
  assert.deepEqual(rows.map(r => [r.mode, r.amount]), [["cash", 500], ["upi", 700]]);
});

test("bank and payments without a mode are shown so the split adds up to the total", () => {
  const rows = receivedByMode([
    { mode: "bank", amount: 5000 },
    { mode: "", amount: 100 },
    { mode: "cash", amount: 0 },
  ]);
  assert.deepEqual(rows.map(r => [r.label, r.amount]), [["Bank", 5000], ["Not recorded", 100]]);
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), 5100);
});

test("nothing received gives an empty breakdown", () => {
  assert.deepEqual(receivedByMode([]), []);
});
