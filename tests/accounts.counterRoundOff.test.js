import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRoundOffToLines,
  CASH_PARTY_ID,
  SYSTEM_CODES,
  voucherTotals,
} from "../src/features/accounts/model/accountingModel.js";
import { itemizedEntryDraft } from "../src/features/accounts/model/inventoryModel.js";

const accounts = [
  { id: "cash", code: "1000", name: "Cash in Hand", accountType: "cash", groupType: "asset" },
  { id: "upi", code: "1010", name: "UPI", accountType: "upi", groupType: "asset" },
  { id: "bank", code: "1020", name: "Bank", accountType: "bank", groupType: "asset" },
  { id: "ar", code: "1100", name: "Accounts Receivable", accountType: "receivable", groupType: "asset" },
  { id: "sales", code: "4300", name: "Sales", accountType: "income", groupType: "income" },
  { id: "roundoff", code: "4150", name: "Round off", accountType: "income", groupType: "income" },
  { id: "ocgst", code: "2210", name: "Output CGST", accountType: "other", groupType: "liability" },
  { id: "osgst", code: "2211", name: "Output SGST", accountType: "other", groupType: "liability" },
  { id: "oigst", code: "2212", name: "Output IGST", accountType: "other", groupType: "liability" },
];

const withoutRoundOff = accounts.filter(account => account.code !== SYSTEM_CODES.roundOff);
const otherIncome = [...withoutRoundOff, { id: "other-income", code: "4100", name: "Other Income", accountType: "income", groupType: "income" }];
const otherExpense = [...withoutRoundOff, { id: "other-expense", code: "5990", name: "Other Expenses", accountType: "expense", groupType: "expense" }];

const sampleLines = () => [
  { coaId: "cash", code: "1000", debit: 137.8, credit: 0 },
  { coaId: "sales", code: "4300", debit: 0, credit: 137.8 },
];

test("round off credits the paisa gain to Round off and keeps the voucher balanced", () => {
  const lines = applyRoundOffToLines(sampleLines(), { accounts, adjustment: 0.2, description: "Counter sale" });
  const totals = voucherTotals(lines);
  assert.equal(totals.debit, 138);
  assert.equal(totals.credit, 138);
  const cash = lines.find(line => line.coaId === "cash");
  assert.equal(cash.debit, 138);
  const roundoff = lines.find(line => line.coaId === "roundoff");
  assert.deepEqual([roundoff.debit, roundoff.credit], [0, 0.2]);
});

test("round down debits Round off for the paisa the shop did not collect", () => {
  const lines = applyRoundOffToLines([
    { coaId: "cash", code: "1000", debit: 138.4, credit: 0 },
    { coaId: "sales", code: "4300", debit: 0, credit: 138.4 },
  ], { accounts, adjustment: -0.4 });
  const totals = voucherTotals(lines);
  assert.equal(totals.debit, totals.credit);
  const cash = lines.find(line => line.coaId === "cash");
  assert.equal(cash.debit, 138);
  const roundoff = lines.find(line => line.coaId === "roundoff");
  assert.deepEqual([roundoff.debit, roundoff.credit], [0.4, 0]);
});

test("round off adjusts the cash line first; a split bill rounds on cash, UPI left alone", () => {
  const lines = applyRoundOffToLines([
    { coaId: "cash", code: "1000", debit: 100, credit: 0 },
    { coaId: "upi", code: "1010", debit: 37.8, credit: 0 },
    { coaId: "sales", code: "4300", debit: 0, credit: 137.8 },
  ], { accounts, adjustment: 0.2 });
  const cash = lines.find(line => line.coaId === "cash");
  const upi = lines.find(line => line.coaId === "upi");
  assert.equal(cash.debit, 100.2);
  assert.equal(upi.debit, 37.8);
});

test("round off adjusts the receivable line on a khata sale", () => {
  const lines = applyRoundOffToLines([
    { coaId: "ar", code: "1100", debit: 137.8, credit: 0 },
    { coaId: "sales", code: "4300", debit: 0, credit: 137.8 },
  ], { accounts, adjustment: 0.2 });
  const ar = lines.find(line => line.coaId === "ar");
  assert.equal(ar.debit, 138);
  const totals = voucherTotals(lines);
  assert.equal(totals.debit, totals.credit);
});

test("a zero or sub-paisa adjustment is a no-op; a missing money line is left alone", () => {
  assert.deepEqual(applyRoundOffToLines(sampleLines(), { accounts, adjustment: 0 }), sampleLines());
  assert.deepEqual(applyRoundOffToLines(sampleLines(), { accounts, adjustment: 0.004 }), sampleLines());
  const credit = [{ coaId: "sales", code: "4300", debit: 0, credit: 100 }];
  assert.deepEqual(applyRoundOffToLines(credit, { accounts, adjustment: 0.2 }), credit);
});

test("without a Round off account the gain goes to Other income and the loss to Other expense", () => {
  const gained = applyRoundOffToLines(sampleLines(), { accounts: otherIncome, adjustment: 0.2 });
  const income = gained.find(line => line.coaId === "other-income");
  assert.equal(income.credit, 0.2);
  const lost = applyRoundOffToLines([
    { coaId: "cash", code: "1000", debit: 138.4, credit: 0 },
    { coaId: "sales", code: "4300", debit: 0, credit: 138.4 },
  ], { accounts: otherExpense, adjustment: -0.4 });
  const expense = lost.find(line => line.coaId === "other-expense");
  assert.equal(expense.debit, 0.4);
});

test("itemizedEntryDraft threads round-off into a Counter sale and keeps it balanced", () => {
  const draft = itemizedEntryDraft({
    kind: "sale",
    accounts,
    date: "2026-11-16",
    partyId: CASH_PARTY_ID,
    moneyMode: "cash",
    settlement: "paid",
    narration: "Counter sale · Till 1 · Cash",
    itemLines: [{ itemId: "oil", itemName: "Oil", unit: "Nos", quantity: "1", rate: 137.8, gstRate: 0, itemType: "product" }],
    intra: true,
    gstEnabled: false,
    roundOffAdjustment: 0.2,
  });
  const totals = voucherTotals(draft.lines);
  assert.equal(totals.debit, 138);
  assert.equal(totals.credit, 138);
  const cash = draft.lines.find(line => line.coaId === "cash");
  assert.equal(cash.debit, 138);
  const sales = draft.lines.find(line => line.coaId === "sales");
  assert.equal(sales.credit, 137.8);
  const roundoff = draft.lines.find(line => line.coaId === "roundoff");
  assert.equal(roundoff.credit, 0.2);
});

test("round off never shifts GST or sales — only the money side moves", () => {
  const draft = itemizedEntryDraft({
    kind: "sale",
    accounts,
    date: "2026-11-16",
    partyId: CASH_PARTY_ID,
    moneyMode: "cash",
    settlement: "paid",
    itemLines: [{ itemId: "oil", itemName: "Oil", unit: "Nos", quantity: "1", rate: 100, gstRate: 18, itemType: "product" }],
    intra: true,
    gstEnabled: true,
    roundOffAdjustment: 0.4,
  });
  // GST at 18% of 100 = 18, split 9/9 intra, total = 118. Round to 118.4? No — the test rounds explicitly.
  const sales = draft.lines.find(line => line.coaId === "sales");
  assert.equal(sales.credit, 100);
  const cgst = draft.lines.find(line => line.coaId === "ocgst");
  assert.equal(cgst.credit, 9);
  const totals = voucherTotals(draft.lines);
  assert.equal(totals.debit, totals.credit);
});

test("a return (credit note) ignores round-off", () => {
  const draft = itemizedEntryDraft({
    kind: "credit_note",
    accounts,
    date: "2026-11-16",
    settlement: "paid",
    itemLines: [{ itemId: "oil", itemName: "Oil", unit: "Nos", quantity: "1", rate: 100, gstRate: 0, itemType: "product" }],
    gstEnabled: false,
    roundOffAdjustment: 0.4,
  });
  assert.equal(draft.lines.some(line => line.coaId === "roundoff"), false);
});

test("a refund rounds the money leg it actually has: the credit side", () => {
  // Credit note for the rounded ₹931 sale: Dr Sales/GST 931.02, Cr Cash 931.02.
  // Rounding the refund to ₹931 must move the CASH CREDIT, not look for a debit.
  const lines = [
    { coaId: "sales", code: "4300", debit: 789, credit: 0 },
    { coaId: "ocgst", code: "2210", debit: 71.01, credit: 0 },
    { coaId: "osgst", code: "2211", debit: 71.01, credit: 0 },
    { coaId: "cash", code: "1000", debit: 0, credit: 931.02 },
  ];
  const patched = applyRoundOffToLines(lines, { accounts, adjustment: -0.02 });
  assert.equal(patched.length, 5);
  const cash = patched.find(line => line.coaId === "cash");
  assert.equal(cash.credit, 931);
  assert.equal(cash.debit, 0);
  // Paying out 2p less is money the shop keeps, so the round-off leg is a credit.
  const round = patched.find(line => line.coaId === "roundoff");
  assert.equal(round.credit, 0.02);
  assert.equal(round.debit, 0);
  const totals = voucherTotals(patched);
  assert.equal(totals.debit, totals.credit);
});

test("sale and refund of the same rounded bill net to zero round-off", () => {
  const sale = applyRoundOffToLines([
    { coaId: "cash", code: "1000", debit: 931.02, credit: 0 },
    { coaId: "sales", code: "4300", debit: 0, credit: 931.02 },
  ], { accounts, adjustment: -0.02 });
  const refund = applyRoundOffToLines([
    { coaId: "sales", code: "4300", debit: 931.02, credit: 0 },
    { coaId: "cash", code: "1000", debit: 0, credit: 931.02 },
  ], { accounts, adjustment: -0.02 });
  const cashIn = sale.find(line => line.coaId === "cash").debit;
  const cashOut = refund.find(line => line.coaId === "cash").credit;
  // Before the fix the refund paid 931.02 against 931.00 collected: a 2p loss per return.
  assert.equal(cashIn, 931);
  assert.equal(cashOut, 931);
  const saleRound = sale.find(line => line.coaId === "roundoff");
  const refundRound = refund.find(line => line.coaId === "roundoff");
  assert.equal(saleRound.debit, 0.02);
  assert.equal(refundRound.credit, 0.02);
  assert.equal(saleRound.debit - refundRound.credit, 0);
});

test("a refund with no round-off ledger falls back on the correct side", () => {
  const lines = [
    { coaId: "sales", code: "4300", debit: 500.4, credit: 0 },
    { coaId: "cash", code: "1000", debit: 0, credit: 500.4 },
  ];
  // Refund rounded DOWN: the shop gains, so it must land in Other Income, not Other Expenses.
  const down = applyRoundOffToLines(lines, { accounts: otherIncome, adjustment: -0.4 });
  assert.equal(down.at(-1).code, "4100");
  assert.equal(down.at(-1).credit, 0.4);
  // Refund rounded UP: the shop pays more, so it is an expense.
  const up = applyRoundOffToLines([
    { coaId: "sales", code: "4300", debit: 500.6, credit: 0 },
    { coaId: "cash", code: "1000", debit: 0, credit: 500.6 },
  ], { accounts: otherExpense, adjustment: 0.4 });
  assert.equal(up.at(-1).code, "5990");
  assert.equal(up.at(-1).debit, 0.4);
});
