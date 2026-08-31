import test from "node:test";
import assert from "node:assert/strict";
import { mergeAccountTransaction } from "../src/features/finance/paymentState.js";

test("mergeAccountTransaction appends a payment to one account only", () => {
  const loans = [
    { id: "a", transactions: [{ id: "p1", amount: 1000 }] },
    { id: "b", transactions: [] },
  ];
  const next = mergeAccountTransaction(loans, "a", { id: "p2", amount: 500 });
  assert.equal(next[0].transactions.length, 2);
  assert.equal(next[1].transactions.length, 0);
  assert.equal(loans[0].transactions.length, 1);
});

test("mergeAccountTransaction replaces an existing payment id", () => {
  const loans = [{ id: "a", transactions: [{ id: "p1", amount: 1000 }] }];
  const next = mergeAccountTransaction(loans, "a", { id: "p1", amount: 1200 });
  assert.equal(next[0].transactions.length, 1);
  assert.equal(next[0].transactions[0].amount, 1200);
});
