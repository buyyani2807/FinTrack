import test from "node:test";
import assert from "node:assert/strict";
import { askCounter } from "../src/features/accounts/model/counterAsk.js";
import {
  counterDayCloseBrief,
  counterDayTopItems,
  counterKhataRisk,
} from "../src/features/accounts/model/counterAi.js";

const cash = { id: "cash", code: "CASH", accountType: "cash", name: "Cash" };
const sales = { id: "sales", code: "SALES", accountType: "income", name: "Sales" };
const ar = { id: "ar", code: "AR", accountType: "receivable", name: "Debtors" };

const party = {
  id: "p1",
  name: "Kumar Kirana",
  partyType: "customer",
  creditLimit: 100000,
};

const vouchers = [
  {
    id: "v1",
    date: "2026-11-06",
    status: "posted",
    sourceType: "pos_counter",
    voucherNumber: "SALE-1",
    narration: "Counter sale · Till 1 · Cash",
    lines: [
      { coaId: "cash", debit: 500, credit: 0 },
      { coaId: "sales", debit: 0, credit: 500 },
    ],
  },
  {
    id: "v2",
    date: "2026-11-06",
    status: "posted",
    sourceType: "pos_counter",
    voucherNumber: "SALE-2",
    narration: "Counter sale · Till 1 · Khata · Kumar Kirana",
    partyId: "p1",
    lines: [
      { coaId: "ar", debit: 1200, credit: 0 },
      { coaId: "sales", debit: 0, credit: 1200 },
    ],
  },
  {
    id: "v3",
    date: "2026-10-01",
    status: "posted",
    voucherType: "sales",
    partyId: "p1",
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-08",
    lines: [
      { coaId: "ar", debit: 50000, credit: 0 },
      { coaId: "sales", debit: 0, credit: 50000 },
    ],
  },
];

const items = [
  { id: "i1", name: "Toor Dal", unit: "Kg", sellingPrice: 125, reorderLevel: 20, itemType: "product", isActive: true },
];

test("ask Counter answers cash and khata for the till", () => {
  const cashAnswer = askCounter("Cash sales today", {
    accounts: [cash, sales, ar],
    vouchers,
    tillLabel: "Till 1",
    today: "2026-11-06",
  });
  assert.match(cashAnswer.summary, /500|₹/);

  const khata = askCounter("Khata sales today", {
    accounts: [cash, sales, ar],
    vouchers,
    tillLabel: "Till 1",
    today: "2026-11-06",
  });
  assert.equal(khata.lines.length, 1);
  assert.match(khata.summary, /1 khata/i);
});

test("ask Counter reports stock for a named item", () => {
  const answer = askCounter("How much toor dal left", {
    items,
    stockByItem: { i1: 42 },
    today: "2026-11-06",
  });
  assert.equal(answer.title, "Toor Dal");
  assert.match(answer.summary, /42/);
});

test("khata risk uses overdue days and credit score inputs", () => {
  const risk = counterKhataRisk({
    accounts: [cash, sales, ar],
    vouchers,
    parties: [party],
    party,
    invoiceTotal: 2000,
    today: "2026-11-06",
    settings: { creditControl: "warn", overdueBlockDays: 7 },
  });
  assert.ok(risk);
  assert.ok(risk.overdueDays >= 7);
  assert.ok(risk.chips.some(chip => chip.id === "score"));
  assert.equal(risk.advice.level, "warn");
});

test("day-close brief includes tender split and variance", () => {
  const text = counterDayCloseBrief({
    companyName: "Shiva Traders",
    tillLabel: "Till 1",
    report: {
      date: "2026-11-06",
      billCount: 2,
      sales: 1700,
      tender: { cash: 500, upi: 0, card: 0 },
    },
    openingFloat: 1000,
    countedCash: 1400,
    expectedCash: 1500,
    variance: -100,
    topItems: [{ name: "Toor Dal", qty: 9, amount: 1125 }],
  });
  assert.match(text, /Shiva Traders/);
  assert.match(text, /Variance/);
  assert.match(text, /Toor Dal/);
  assert.match(text, /short/i);
});

test("day top items aggregate Counter bill lines", () => {
  const rows = counterDayTopItems({
    vouchers,
    voucherItemLines: [
      { voucherId: "v1", itemId: "i1", itemName: "Toor Dal", quantity: 2, taxableAmount: 250 },
      { voucherId: "v2", itemId: "i1", itemName: "Toor Dal", quantity: 4, taxableAmount: 500 },
    ],
    today: "2026-11-06",
    tillLabel: "Till 1",
  });
  assert.equal(rows[0].name, "Toor Dal");
  assert.equal(rows[0].qty, 6);
  assert.equal(rows[0].amount, 750);
});
