import test from "node:test";
import assert from "node:assert/strict";
import {
  assertBackupRestorable,
  buildAccountsCompanyBackup,
} from "../src/features/accounts/accountsBackup.js";
import { buildChitAttentionItems } from "../src/features/intelligence/attentionCenter.js";
import {
  buildOutstandingSummaryMessage,
  buildPartyStatementMessage,
  buildPurchaseDocumentMessage,
} from "../src/features/accounts/salesInvoiceModel.js";

test("restore requires matching empty company", () => {
  const company = { id: "co-1", name: "A" };
  const backup = buildAccountsCompanyBackup({ company, vouchers: [] });
  assert.doesNotThrow(() => assertBackupRestorable(backup, { activeCompany: company, vouchers: [] }));
  assert.throws(
    () => assertBackupRestorable(backup, { activeCompany: company, vouchers: [{ id: "v1" }] }),
    /no vouchers/i,
  );
  assert.throws(
    () => assertBackupRestorable(backup, { activeCompany: { id: "co-2", name: "B" }, vouchers: [] }),
    /cannot overwrite/i,
  );
});

test("chit attention flags overdue and pending installments", () => {
  const items = buildChitAttentionItems([
    { status: "overdue", amount: 1000 },
    { status: "overdue", amount: 500 },
    { status: "pending", amount: 200 },
  ]);
  assert.equal(items.length, 2);
  assert.ok(items.some(item => item.id === "chit-overdue"));
  assert.ok(items.some(item => item.id === "chit-pending"));
  assert.equal(items.find(item => item.id === "chit-overdue").href.panel, "chit");
});

test("Accounts WhatsApp builders produce non-empty messages", () => {
  const purchase = buildPurchaseDocumentMessage(
    { voucherType: "purchase", voucherNumber: "PUR-1", date: "2026-09-01", narration: "Cement", lines: [{ debit: 5000 }] },
    { name: "Supplier", phone: "9876543210" },
    {},
    { name: "Co", phone: "999" },
  );
  assert.match(purchase, /PUR-1/);
  assert.match(purchase, /Supplier/);

  const statement = buildPartyStatementMessage({
    party: { name: "Customer" },
    partyBook: { opening: 100, outstanding: 250 },
    periodFrom: "2026-04-01",
    periodTo: "2026-09-01",
    company: { name: "Co" },
  });
  assert.match(statement, /Customer/);
  assert.match(statement, /250/);

  const outstanding = buildOutstandingSummaryMessage({
    party: { name: "Customer" },
    outstanding: 900,
    kind: "receivable",
    company: { name: "Co" },
  });
  assert.match(outstanding, /900|₹900/);
});
