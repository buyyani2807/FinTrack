import test from "node:test";
import assert from "node:assert/strict";
import { realizedLoss, realizedProfit } from "../src/features/finance/pnl.js";

test("daily bankruptcy loss is unreturned capital, not remaining receivable", () => {
  const loan = {
    kind: "daily",
    status: "bankrupt",
    disbursedAmount: 8500,
    collectionAmount: 10000,
    lossAmount: 8200,
    transactions: [{ amount: 1800 }],
  };
  assert.equal(realizedLoss(loan), 6700);
  assert.equal(realizedProfit(loan), 0);
});

test("monthly bankruptcy loss is remaining principal", () => {
  const loan = {
    kind: "monthly",
    status: "bankrupt",
    principal: 100000,
    lossAmount: 100000,
    transactions: [
      { principalAmount: 20000, interestAmount: 2000, penaltyAmount: 0 },
    ],
  };
  assert.equal(realizedLoss(loan), 80000);
  assert.equal(realizedProfit(loan), 2000);
});

test("active accounts have no realized loss", () => {
  assert.equal(realizedLoss({ kind: "daily", status: "active", disbursedAmount: 8500, transactions: [] }), 0);
});
