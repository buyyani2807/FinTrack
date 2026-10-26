import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHART_OF_ACCOUNTS, saleLines } from "../src/features/accounts/model/accountingModel.js";
import { CA_BRIEF_DISCLAIMER } from "../src/features/intelligence/ai/caBrief.js";
import { buildCaPack } from "../src/features/accounts/model/caPack.js";
import { accountsPath, accountsViewFromPath, sectionTrail } from "../src/features/accounts/accountsNavigation.js";

const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code, isSystem: true, isActive: true }));

test("CA pack lists the month's books, rejected invoices, unmatched bank lines, and stock to review", () => {
  const company = { name: "Mahaveer Paper", gstin: "29AABCU9603R1ZM" };
  const party = { id: "ravi", name: "Ravi Traders", partyType: "customer", gstin: "NOTGSTIN" };
  const sale = {
    id: "sale-1",
    voucherType: "sales",
    voucherNumber: "SALE-0001",
    date: "2026-09-05",
    partyId: "ravi",
    status: "posted",
    narration: "",
    lines: saleLines({ accounts, amount: 1000, settlement: "credit", partyId: "ravi" }).map((line, index) => ({ ...line, id: `sale-1-l${index}` })),
    gstLines: [],
  };
  const statements = [{ id: "st", accountName: "HDFC Bank", lines: [
    { id: "matched", lineDate: "2026-09-10", description: "NEFT", amount: 1000, direction: "in", matchStatus: "matched" },
    { id: "open-line", lineDate: "2026-09-12", description: "RENT SEPT", amount: 3000, direction: "out", matchStatus: "unmatched" },
  ] }];
  const items = [{ id: "it", name: "Widget", itemType: "product", unit: "Nos" }];
  const stockMovements = [{ id: "m1", itemId: "it", movementDate: "2026-09-02", quantityDelta: -3, reason: "adjustment" }];
  const input = { month: "2026-09", asOf: "2026-10-09", company, accounts, vouchers: [sale], parties: [party], items, stockMovements, statements, locks: [] };
  const before = JSON.stringify(input);
  const pack = buildCaPack(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(pack.writeAction, "none");
  assert.equal(pack.disclaimer, CA_BRIEF_DISCLAIMER);
  assert.equal(pack.companyName, "Mahaveer Paper");
  assert.equal(pack.monthTitle, "September 2026");
  assert.equal(pack.books.balanced, true);
  assert.equal(pack.books.income, 1000);
  assert.equal(pack.books.resultLabel, "Net profit");
  assert.match(pack.text, /Opening stock/);
  assert.match(pack.text, /Closing stock/);
  assert.match(pack.text, /Nothing has been filed/);
  assert.ok(pack.gst.some(row => /Ravi Traders/.test(row.title)));
  assert.equal(pack.bank.length, 1);
  assert.equal(pack.bank[0].title, "RENT SEPT");
  assert.equal(pack.bank[0].amount, 3000);
  assert.equal(pack.bank[0].reviewed, false);
  assert.ok(pack.stock.some(row => row.title === "Widget" && row.detail));

  const reviewed = buildCaPack({ ...input, reviewedKeys: new Set([pack.bank[0].key]) });
  assert.equal(reviewed.bank.length, 1);
  assert.equal(reviewed.bank[0].reviewed, true);
  assert.equal(reviewed.gst[0].reviewed, false);
  assert.match(reviewed.text, /RENT SEPT[\s\S]*Reviewed/);
  assert.equal(accountsPath({ section: "ca" }), "/accounting/for-the-ca");
  assert.equal(accountsViewFromPath("for-the-ca").section, "ca");
  assert.deepEqual(sectionTrail("ca"), ["For the CA"]);
});

test("CA pack says when the bank statement and the stock review are clear", () => {
  const pack = buildCaPack({
    month: "2026-09",
    asOf: "2026-09-30",
    company: { name: "E2E Traders" },
    accounts,
    vouchers: [],
    statements: [{ id: "st", lines: [{ id: "ok", lineDate: "2026-09-02", description: "UPI", amount: 500, direction: "in", matchStatus: "matched" }] }],
  });
  assert.equal(pack.bankNote, "Every statement line in this month is matched.");
  assert.equal(pack.stockNote, "No stock row needs review.");
  assert.equal(pack.gstNote, "No invoice in this month failed a GST check.");
  const emptyBank = buildCaPack({ month: "2026-09", asOf: "2026-09-30", accounts, statements: [] });
  assert.equal(emptyBank.bankNote, "No bank statement lines in this month.");
});
