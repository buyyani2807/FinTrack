import test from "node:test";
import assert from "node:assert/strict";
import { askCounter } from "../src/features/accounts/model/counterAsk.js";

const accounts = [
  { id: "cash", code: "1000", name: "Cash", accountType: "cash", groupType: "asset" },
  { id: "upi", code: "1010", name: "UPI", accountType: "upi", groupType: "asset" },
  { id: "bank", code: "1020", name: "Bank", accountType: "bank", groupType: "asset" },
  { id: "ar", code: "1100", name: "Accounts Receivable", accountType: "receivable", groupType: "asset" },
  { id: "sales", code: "4300", name: "Sales", accountType: "income", groupType: "income" },
];

const toor = { id: "toor", name: "Toor Dal", unit: "Kg", itemType: "product", isActive: true, reorderLevel: 10 };
const soap = { id: "soap", name: "Soap", unit: "Nos", itemType: "product", isActive: true, reorderLevel: 20 };
const salt = { id: "salt", name: "Salt", unit: "Kg", itemType: "product", isActive: true, reorderLevel: 5 };
const items = [toor, soap, salt];

const sale = (date, qty, itemId) => ({
  itemId,
  movementDate: date,
  reason: "sale",
  quantityDelta: -qty,
});

test("reorder lists low items with a sales-based suggestion, biggest shortfall first", () => {
  const answer = askCounter("what should I reorder", {
    items,
    stockByItem: { toor: 2, soap: 50, salt: 4 },
    stockMovements: [
      sale("2026-11-10", 3, "toor"),
      sale("2026-11-12", 2, "toor"),
      sale("2026-11-15", 2, "toor"),
      sale("2026-11-15", 1, "salt"),
    ],
    today: "2026-11-16",
  });
  assert.equal(answer.title, "Reorder list");
  // Both toor and salt are below their reorder levels; soap is not.
  assert.equal(answer.lines.length, 2);
  // Toor is further below and sells ~0.5/day, so it should come first.
  assert.equal(answer.lines[0].label, "Toor Dal");
  assert.equal(answer.lines[1].label, "Salt");
  // A reorder suggestion is a QUANTITY, and the answer renderer money-formats `amount`.
  // It must therefore stay out of `amount` and be spelled out in `detail` with its unit.
  assert.equal(answer.lines[0].amount, null);
  assert.match(answer.lines[0].detail, /^Order ~[\d.]+ Kg · have 2 Kg · reorder at 10/);
  assert.match(answer.lines[0].detail, /sells ~/);
});

test("an out-of-stock item with no reorder level still gets a usable order quantity", () => {
  const answer = askCounter("what should I reorder", {
    items: [{ id: "coat", name: "China Coat", unit: "Litre", itemType: "product", isActive: true, reorderLevel: 0 }],
    stockByItem: { coat: 0 },
    stockMovements: [sale("2026-11-15", 1, "coat")],
    today: "2026-11-16",
  });
  assert.equal(answer.lines.length, 1);
  // reorderLevel 0 collapses the formula to max(0, 0.07*14) = 0.98 — a floor keeps the
  // advice whole-unit sensible for something that is already out of stock.
  assert.match(answer.lines[0].detail, /^Order ~1 Litre · have 0 Litre · reorder at 0 \(not set\)/);
  assert.equal(answer.lines[0].amount, null);
});

test("reorder with no items at low stock returns an empty list", () => {
  const answer = askCounter("reorder list", {
    items: [{ id: "x", name: "Rice", unit: "Bag", itemType: "product", isActive: true, reorderLevel: 1 }],
    stockByItem: { x: 20 },
    stockMovements: [],
    today: "2026-11-16",
  });
  assert.match(answer.summary, /Nothing to reorder/);
  assert.equal(answer.lines.length, 0);
});

test("who owes me the most ranks parties by outstanding balance", () => {
  const vouchers = [
    { id: "s1", voucherType: "sales", voucherNumber: "S-1", status: "posted", date: "2026-11-01", partyId: "p1", dueDate: "2026-11-08",
      lines: [{ coaId: "ar", partyId: "p1", debit: 5000, credit: 0 }, { coaId: "sales", debit: 0, credit: 5000 }] },
    { id: "s2", voucherType: "sales", voucherNumber: "S-2", status: "posted", date: "2026-11-05", partyId: "p1", dueDate: "2026-11-12",
      lines: [{ coaId: "ar", partyId: "p1", debit: 2000, credit: 0 }, { coaId: "sales", debit: 0, credit: 2000 }] },
    { id: "s3", voucherType: "sales", voucherNumber: "S-3", status: "posted", date: "2026-11-10", partyId: "p2", dueDate: "2026-11-17",
      lines: [{ coaId: "ar", partyId: "p2", debit: 3000, credit: 0 }, { coaId: "sales", debit: 0, credit: 3000 }] },
    { id: "r1", voucherType: "receipt", voucherNumber: "R-1", status: "posted", date: "2026-11-11",
      lines: [{ coaId: "cash", debit: 1000, credit: 0 }, { coaId: "ar", partyId: "p1", debit: 0, credit: 1000 }] },
  ];
  const parties = [
    { id: "p1", name: "Ravi Traders", partyType: "customer" },
    { id: "p2", name: "Shiva Stores", partyType: "customer" },
    { id: "p3", name: "Old Debtor", partyType: "customer" },
  ];
  const answer = askCounter("who owes me the most", {
    accounts,
    vouchers,
    parties,
    today: "2026-11-16",
  });
  assert.equal(answer.title, "Khata balances");
  assert.equal(answer.lines.length, 2);
  assert.equal(answer.lines[0].label, "Ravi Traders");
  assert.equal(answer.lines[0].amount, 6000); // 5000 + 2000 − 1000
  assert.equal(answer.lines[1].label, "Shiva Stores");
  assert.equal(answer.lines[1].amount, 3000);
  assert.match(answer.summary, /customers? owe/);
});

test("who owes me the most says no one when the register is clean", () => {
  const answer = askCounter("who owes the most", { accounts, vouchers: [], parties: [], today: "2026-11-16" });
  assert.match(answer.summary, /No one owes/);
  assert.equal(answer.lines.length, 0);
});

test("cash in drawer = opening float + cash bills today + cash in - cash out", () => {
  const vouchers = [
    { id: "b1", voucherType: "sales", voucherNumber: "SALE-1", status: "posted", date: "2026-11-16",
      sourceType: "pos_counter",
      narration: "Counter sale · Till 1 · Cash",
      lines: [{ coaId: "cash", debit: 500, credit: 0 }, { coaId: "sales", debit: 0, credit: 500 }] },
    { id: "b2", voucherType: "sales", voucherNumber: "SALE-2", status: "posted", date: "2026-11-16",
      sourceType: "pos_counter",
      narration: "Counter sale · Till 1 · Cash",
      lines: [{ coaId: "cash", debit: 200, credit: 0 }, { coaId: "sales", debit: 0, credit: 200 }] },
  ];
  const answer = askCounter("cash in drawer", {
    accounts,
    vouchers,
    tillLabel: "Till 1",
    today: "2026-11-16",
    openingFloat: 1000,
    cashIn: 150,
    cashOut: 50,
  });
  // 1000 + 700 + 150 - 50 = 1800
  const expectedLine = answer.lines.find(line => line.label === "Expected");
  assert.equal(expectedLine.amount, 1800);
  assert.match(answer.summary, /1,800/);
  // The row label already says "Cash out"; a negative amount rendered it as "₹-50".
  const outLine = answer.lines.find(line => line.label === "Cash out");
  assert.equal(outLine.amount, 50);
  assert.match(outLine.detail, /Taken out of the drawer/);
});

test("the three new prompts are recognised by their exact wording", () => {
  // Each prompt button should route to its handler and not fall into "help".
  for (const [question, expectedTitle] of [
    ["What should I reorder", "Reorder list"],
    ["Who owes me the most", "Khata balances"],
    ["Cash in drawer", "Cash in drawer"],
  ]) {
    const answer = askCounter(question, {
      accounts,
      vouchers: [],
      items: [],
      parties: [],
      stockByItem: {},
      stockMovements: [],
      today: "2026-11-16",
      openingFloat: 0,
      cashIn: 0,
      cashOut: 0,
    });
    assert.equal(answer.title, expectedTitle, `'${question}' should land on ${expectedTitle}, got ${answer.title}`);
  }
});
