import test from "node:test";
import assert from "node:assert/strict";
import { addDays } from "../src/features/finance/model/loanState.js";
import {
  buildCollectionCopilot,
  draftCollectionReminder,
  reminderSendAllowed,
} from "../src/features/finance/model/collectionCopilot.js";
import { reconciliationReview, suggestExpense } from "../src/features/accounts/model/bookSuggestions.js";
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  buildVoucher,
  paymentLines,
} from "../src/features/accounts/model/accountingModel.js";

const asOf = "2026-10-06";
const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code }));

const dailyLoan = ({ name, missed = 0, phone = "9876543210" } = {}) => {
  const transactions = [];
  for (let i = missed + 1; i <= 7; i += 1) {
    transactions.push({ id: `m-${name}-${i}`, date: addDays(asOf, -i), amount: 100 });
  }
  return {
    id: `D-${name}`,
    customerName: name,
    phone,
    kind: "daily",
    status: "active",
    startDate: addDays(asOf, -20),
    collectionAmount: 10000,
    dailyCollection: 100,
    transactions,
  };
};

test("collection copilot ranks a repeated miss ahead of a first miss and does not include other customers", () => {
  const mine = dailyLoan({ name: "Ravi Kumar", missed: 3 });
  const quiet = dailyLoan({ name: "Suresh", missed: 0 });
  const copilot = buildCollectionCopilot([mine, quiet], { kind: "daily", asOf, isOwner: false, businessName: "Mahaveer Paper" });
  assert.equal(copilot.ranked[0].name, "Ravi Kumar");
  assert.match(copilot.ranked[0].why.join(" "), /missed/);
  assert.equal(copilot.ranked.some(row => row.name === "Other"), false);
  assert.equal(copilot.scopedToAssigned, true);
  assert.match(copilot.summary, /Today/);
  assert.match(copilot.disclaimer, /confirm/);
});

test("a reminder is translated and stays unsent until the sender confirms a real phone", () => {
  const english = draftCollectionReminder({ name: "Ravi", due: 100, outstanding: 5000, date: asOf, businessName: "Mahaveer Paper" }, "en");
  const hindi = draftCollectionReminder({ name: "Ravi", due: 100, outstanding: 5000, date: asOf, businessName: "Mahaveer Paper" }, "hi");
  assert.match(english, /Ravi/);
  assert.match(english, /Mahaveer Paper/);
  assert.notEqual(english, hindi);
  assert.equal(reminderSendAllowed({ confirmed: false, phone: "9876543210", message: english }), false);
  assert.equal(reminderSendAllowed({ confirmed: true, phone: "9876543210", message: english }), true);
  assert.equal(reminderSendAllowed({ confirmed: true, phone: "12", message: english }), false);
});

test("expense suggestions include similar postings and a bank review shows the difference", () => {
  const april = buildVoucher({
    voucherType: "payment",
    voucherNumber: "PMT-000001",
    date: "2026-04-07",
    narration: "Rent",
    lines: paymentLines({ accounts, cash: 5000, expenseCode: "5000" }),
  });
  const september = buildVoucher({
    voucherType: "payment",
    voucherNumber: "PMT-000002",
    date: "2026-09-07",
    narration: "Rent",
    lines: paymentLines({ accounts, cash: 5000, expenseCode: "5000" }),
  });
  const suggestion = suggestExpense("Rent for October", [april, september], accounts);
  assert.equal(suggestion.confidence, "high");
  assert.equal(suggestion.similar[0].voucherNumber, "PMT-000002");
  const review = reconciliationReview({
    matchStatus: "suggested",
    amount: 1000,
    matchConfidence: 77,
    matchCandidates: [{ date: "2026-01-02", voucherNumber: "RCT-000001", partyName: "Ravi", amount: 1000, reasons: ["amount", "party"] }],
  });
  assert.equal(review.difference, 0);
  assert.match(review.reason, /party/);
  assert.equal(reconciliationReview({ matchStatus: "matched", amount: 1000 }), null);
});
