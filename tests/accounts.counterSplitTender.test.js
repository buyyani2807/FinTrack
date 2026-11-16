import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMoneyModeSplit,
  CASH_PARTY_ID,
  moneyByMode,
  voucherTotals,
} from "../src/features/accounts/model/accountingModel.js";
import { itemizedEntryDraft } from "../src/features/accounts/model/inventoryModel.js";
import { counterSplitStatus } from "../src/features/accounts/model/counterBillMath.js";
import {
  COUNTER_PAY_MODES,
  counterDayReport,
  counterModeFromTender,
  counterPayLabel,
  counterTenderLabel,
} from "../src/features/accounts/model/counterDayReport.js";
import { emptyCounterDraft, readCounterDraft, saveCounterDraft } from "../src/features/accounts/model/counterDraft.js";

const accounts = [
  { id: "cash", code: "1000", name: "Cash in Hand", accountType: "cash", groupType: "asset" },
  { id: "upi", code: "1010", name: "UPI", accountType: "upi", groupType: "asset" },
  { id: "bank", code: "1020", name: "Bank", accountType: "bank", groupType: "asset" },
  { id: "ar", code: "1100", name: "Accounts Receivable", accountType: "receivable", groupType: "asset" },
  { id: "sales", code: "4300", name: "Sales", accountType: "income", groupType: "income" },
  { id: "ocgst", code: "2210", name: "Output CGST", accountType: "other", groupType: "liability" },
  { id: "osgst", code: "2211", name: "Output SGST", accountType: "other", groupType: "liability" },
  { id: "oigst", code: "2212", name: "Output IGST", accountType: "other", groupType: "liability" },
];

const riceLines = [{ itemId: "rice", itemName: "Rice", unit: "Bag", quantity: "1", rate: 2300, gstRate: 0, itemType: "product" }];

test("split status tracks what is left, what is over, and needs two parts", () => {
  assert.deepEqual(counterSplitStatus(2300, { cash: "1000", upi: "800", card: "500" }), {
    parts: { cash: 1000, upi: 800, bank: 500 }, paid: 2300, remaining: 0, ok: true, message: "",
  });
  const short = counterSplitStatus(2300, { cash: "1000", card: "500" });
  assert.equal(short.ok, false);
  assert.equal(short.remaining, 800);
  const over = counterSplitStatus(2300, { cash: "2000", upi: "500" });
  assert.equal(over.ok, false);
  assert.equal(over.remaining, -200);
  const single = counterSplitStatus(2300, { cash: "2300" });
  assert.equal(single.ok, false);
  assert.match(single.message, /two payment amounts/);
  assert.equal(counterSplitStatus(2300, { cash: "abc", upi: "", card: null }).paid, 0);
  assert.equal(counterSplitStatus(2300, { cash: "-100", upi: "2400" }).ok, false);
  assert.equal(counterSplitStatus(0, { cash: "10", upi: "10" }).ok, false);
  assert.equal(counterSplitStatus(100.1, { cash: "50.05", card: "50.05" }).ok, true);
});

test("split money mode accepts any two or three parts that add up, and rejects the rest", () => {
  assert.deepEqual(assertMoneyModeSplit("split", 2300, { cash: 1000, bank: 1300 }), { cash: 1000, upi: 0, bank: 1300 });
  assert.deepEqual(assertMoneyModeSplit("split", 2300, { cash: 1000, upi: 800, bank: 500 }), { cash: 1000, upi: 800, bank: 500 });
  assert.throws(() => assertMoneyModeSplit("split", 2300, { cash: 1000, bank: 1000 }), /add up to the total/);
  assert.throws(() => assertMoneyModeSplit("split", 2300, { cash: 2300 }), /at least two/);
  assert.throws(() => assertMoneyModeSplit("split", 2300, { cash: -100, bank: 2400 }), /negative/);
  assert.deepEqual(moneyByMode("split", 500, { upi: 200, bank: 300 }), { cash: 0, upi: 200, bank: 300 });
});

test("the older single modes and Cash + UPI behave as before", () => {
  assert.deepEqual(assertMoneyModeSplit("cash", 500, {}), { cash: 500, upi: 0, bank: 0 });
  assert.deepEqual(assertMoneyModeSplit("bank", 500, { cash: 100 }), { cash: 0, upi: 0, bank: 500 });
  assert.deepEqual(assertMoneyModeSplit("cash_upi", 500, { cash: 200, upi: 300 }), { cash: 200, upi: 300, bank: 0 });
  assert.throws(() => assertMoneyModeSplit("cash_upi", 500, { cash: 200, upi: 200 }), /must equal the total/);
});

test("a split Counter sale posts one balanced voucher with a debit per payment", () => {
  const draft = itemizedEntryDraft({
    kind: "sale",
    accounts,
    date: "2026-11-15",
    partyId: CASH_PARTY_ID,
    moneyMode: "split",
    moneyParts: { cash: 1000, upi: 800, bank: 500 },
    settlement: "paid",
    narration: "Counter sale · Till 1 · Cash + UPI + Card",
    itemLines: riceLines,
    gstEnabled: false,
  });
  const debits = draft.lines.filter(line => Number(line.debit) > 0).map(line => [line.coaId, line.debit]);
  assert.deepEqual(debits, [["cash", 1000], ["upi", 800], ["bank", 500]]);
  const totals = voucherTotals(draft.lines);
  assert.equal(totals.debit, 2300);
  assert.equal(totals.debit, totals.credit);
  assert.equal(draft.partyId, null);
  assert.equal(draft.lines.some(line => line.coaId === "ar"), false);
});

test("a split sale with GST still balances", () => {
  const draft = itemizedEntryDraft({
    kind: "sale",
    accounts,
    date: "2026-11-15",
    partyId: CASH_PARTY_ID,
    moneyMode: "split",
    moneyParts: { cash: 590, bank: 590 },
    settlement: "paid",
    itemLines: [{ itemId: "oil", itemName: "Oil", unit: "Nos", quantity: "1", rate: 1000, gstRate: 18, itemType: "product" }],
    intra: true,
    gstEnabled: true,
  });
  const totals = voucherTotals(draft.lines);
  assert.equal(totals.debit, 1180);
  assert.equal(totals.debit, totals.credit);
});

test("a split that does not add up to the bill is refused before posting", () => {
  assert.throws(() => itemizedEntryDraft({
    kind: "sale",
    accounts,
    date: "2026-11-15",
    partyId: CASH_PARTY_ID,
    moneyMode: "split",
    moneyParts: { cash: 1000, bank: 1000 },
    settlement: "paid",
    itemLines: riceLines,
    gstEnabled: false,
  }), /add up to the total/);
});

test("day report counts each part of a split bill under its own mode", () => {
  const voucher = {
    id: "v1",
    voucherNumber: "SALE-000001",
    date: "2026-11-15",
    sourceType: "pos_counter",
    status: "posted",
    narration: "Counter sale · Till 1 · Cash + Card",
    lines: [
      { coaId: "cash", debit: 1000, credit: 0 },
      { coaId: "bank", debit: 1300, credit: 0 },
      { coaId: "sales", debit: 0, credit: 2300 },
    ],
  };
  const report = counterDayReport(accounts, [voucher], { date: "2026-11-15", tillLabel: "Till 1" });
  assert.deepEqual(report.tender, { cash: 1000, upi: 0, card: 1300, total: 2300 });
  assert.equal(report.sales, 2300);
  assert.equal(report.bills[0].modeLabel, "Cash + Card");
  assert.equal(report.bills[0].modeId, "split");
});

test("tender labels name the parts paid; older labels are unchanged", () => {
  assert.equal(counterTenderLabel({ cash: 10, upi: 0, bank: 5 }), "Cash + Card");
  assert.equal(counterTenderLabel({ cash: 10, upi: 5, card: 5 }), "Cash + UPI + Card");
  assert.equal(counterTenderLabel({}), "");
  assert.deepEqual(counterModeFromTender({ cash: 0, upi: 5, card: 5 }), { id: "split", label: "UPI + Card" });
  assert.deepEqual(counterModeFromTender({ cash: 5, upi: 5, card: 0 }), { id: "cash_upi", label: "Cash + UPI" });
  assert.deepEqual(counterModeFromTender({ cash: 5, upi: 0, card: 0 }), { id: "cash", label: "Cash" });
  assert.deepEqual(counterModeFromTender({ cash: 0, upi: 0, card: 5 }), { id: "bank", label: "Card" });
  assert.equal(counterPayLabel("cash_upi"), "Cash + UPI");
  assert.deepEqual(COUNTER_PAY_MODES.map(mode => mode.id), ["cash", "upi", "cash_upi", "bank", "split"]);
});

test("the saved Counter draft keeps the card part of a split", () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: key => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: key => { memory.delete(key); },
  };
  assert.equal(emptyCounterDraft().receivedCard, "");
  saveCounterDraft("co-1", "till-1", {
    ...emptyCounterDraft(),
    lines: [{ itemId: "rice", itemName: "Rice", quantity: 1, rate: 2300, unit: "Bag" }],
    moneyMode: "split",
    receivedCash: "1000",
    receivedCard: "1300",
  });
  const restored = readCounterDraft("co-1", "till-1");
  assert.equal(restored.moneyMode, "split");
  assert.equal(restored.receivedCash, "1000");
  assert.equal(restored.receivedCard, "1300");
});
