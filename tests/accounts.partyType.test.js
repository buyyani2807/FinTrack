import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PARTY_TYPES,
  applyPartyTypeChange,
  assertCanChangePartyType,
  canEditPartyType,
  createSubmitLock,
  filterParties,
  partyHasAccountingUse,
  partyInCompany,
  partyTypeAfterFailedSave,
  partyTypeChangeAudit,
  partyTypeChangeNeedsConfirm,
  PARTY_TYPE_CHANGE_WARNING,
} from "../src/features/accounts/model/accountingModel.js";
import { partyBalances } from "../src/features/accounts/model/accountingReports.js";

const sql = fs.readFileSync(new URL("../supabase/093_party_type_edit.sql", import.meta.url), "utf8");
const form = fs.readFileSync(new URL("../src/features/accounts/components/PartyFields.jsx", import.meta.url), "utf8");

const accounts = [
  { id: "1200", code: "1200", accountType: "receivable" },
  { id: "2100", code: "2100", accountType: "payable" },
];

function voucherFor(partyId) {
  return {
    id: "v1",
    partyId,
    date: "2026-04-01",
    status: "posted",
    voucherType: "sales",
    lines: [
      { coaId: "1200", code: "1200", debit: 1000, credit: 0, partyId },
      { coaId: "4000", code: "4000", debit: 0, credit: 1000 },
    ],
  };
}

test("a party with no transactions can change type without a warning", () => {
  const party = { id: "p1", partyType: "customer", name: "Fresh" };
  assert.equal(partyHasAccountingUse(party.id, []), false);
  assert.equal(partyTypeChangeNeedsConfirm(party, "supplier", []), false);
  const next = applyPartyTypeChange(party, "supplier");
  assert.equal(next.id, "p1");
  assert.equal(next.partyType, "supplier");
});

test("a party with transactions keeps its id and vouchers, and asks for confirmation", () => {
  const party = { id: "p1", companyId: "co-1", partyType: "customer", name: "Ravi" };
  const vouchers = [voucherFor("p1")];
  const snapshot = JSON.parse(JSON.stringify(vouchers));
  assert.equal(partyTypeChangeNeedsConfirm(party, "supplier", vouchers), true);
  assert.match(PARTY_TYPE_CHANGE_WARNING, /historical vouchers, balances, and ledger entries will remain unchanged/);
  const next = applyPartyTypeChange(party, "supplier");
  assert.equal(next.id, party.id);
  assert.deepEqual(vouchers, snapshot);
  const before = partyBalances(accounts, vouchers, [party], { kind: "receivable" });
  const after = partyBalances(accounts, vouchers, [next], { kind: "receivable" });
  assert.equal(after[0].balance, before[0].balance);
  assert.equal(after[0].id, "p1");
});

test("customer, supplier, employee, agent, and other are the supported types", () => {
  const party = { id: "p1", partyType: "supplier", name: "Sri" };
  assert.deepEqual(PARTY_TYPES.map(type => type.id), ["customer", "supplier", "employee", "agent", "other"]);
  assert.equal(applyPartyTypeChange({ ...party, partyType: "customer" }, "supplier").partyType, "supplier");
  assert.equal(applyPartyTypeChange(party, "customer").partyType, "customer");
  for (const type of ["employee", "agent", "other"]) {
    assert.equal(applyPartyTypeChange(party, type).partyType, type);
  }
});

test("empty and invalid party types are rejected and a failed save keeps the original type", () => {
  const party = { id: "p1", partyType: "customer", name: "Ravi" };
  assert.throws(() => assertCanChangePartyType(party, ""), /Choose a party type/);
  assert.throws(() => assertCanChangePartyType(party, "   "), /Choose a party type/);
  assert.throws(() => assertCanChangePartyType(party, "landlord"), /Choose a valid party type/);
  assert.equal(partyTypeAfterFailedSave(party), "customer");
  assert.equal(party.partyType, "customer");
});

test("a second submit is skipped while the first save is still running", async () => {
  const lock = createSubmitLock();
  let runs = 0;
  const first = lock.run(async () => {
    runs += 1;
    const second = await lock.run(async () => { runs += 1; });
    assert.equal(second.skipped, true);
  });
  await first;
  assert.equal(runs, 1);
});

test("only an owner, admin, or accountant can change a party type, and only in their company", () => {
  assert.equal(canEditPartyType("owner"), true);
  assert.equal(canEditPartyType("admin"), true);
  assert.equal(canEditPartyType("accountant"), true);
  assert.equal(canEditPartyType("viewer"), false);
  assert.equal(canEditPartyType("agent"), false);
  assert.equal(canEditPartyType("staff"), false);
  const party = { id: "p1", companyId: "co-1", partyType: "customer" };
  assert.equal(partyInCompany(party, "co-1"), true);
  assert.equal(partyInCompany(party, "co-2"), false);
});

test("the type change is audited and filters follow the new classification", () => {
  const party = { id: "p1", companyId: "co-1", partyType: "customer", name: "Ravi" };
  const audit = partyTypeChangeAudit(party, "supplier", {
    companyId: "co-1",
    userId: "user-1",
    userName: "Owner",
    userEmail: "owner@example.com",
    at: "2026-10-08T12:00:00Z",
  });
  assert.equal(audit.entityId, "p1");
  assert.equal(audit.previousType, "customer");
  assert.equal(audit.nextType, "supplier");
  assert.equal(audit.actorId, "user-1");
  assert.equal(audit.actorName, "Owner");
  assert.equal(audit.source, "accounts_party_edit");
  const next = applyPartyTypeChange(party, "supplier");
  assert.deepEqual(filterParties([next], { type: "supplier", search: "Ravi" }).map(row => row.id), ["p1"]);
  assert.equal(filterParties([next], { type: "customer", search: "Ravi" }).length, 0);
});

test("the database update changes classification only and keeps company isolation", () => {
  assert.match(sql, /acc_require_owner\(\)/);
  assert.match(sql, /p\.company_id = active_company_id/);
  assert.match(sql, /p\.organization_id = org_id/);
  assert.match(sql, /Choose a party type/);
  assert.match(sql, /Choose a valid party type/);
  assert.match(sql, /'party_type'/);
  assert.match(sql, /accounts_party_edit/);
  assert.match(sql, /actor_name/);
  assert.match(sql, /actor_email/);
  assert.doesNotMatch(sql, /update public\.acc_vouchers/i);
  assert.doesNotMatch(sql, /update public\.acc_voucher_lines/i);
  assert.doesNotMatch(sql, /acc_assert_period_open/);
  assert.doesNotMatch(sql, /cannot be changed because accounting transactions/);
  assert.match(form, /Current type:/);
  assert.match(form, /PARTY_TYPE_CHANGE_WARNING/);
  assert.doesNotMatch(form, /Party type is locked/);
});
