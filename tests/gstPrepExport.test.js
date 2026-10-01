import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGstr1Preparation,
  buildGstr3bPreparation,
  EINVOICE_INTEGRATION_STUB,
  gstrPrepToCsvRows,
} from "../src/features/accounts/io/gstPrepExport.js";

const sale = {
  id: "v1",
  voucherType: "sales",
  voucherNumber: "SALE-1",
  date: "2026-04-10",
  status: "posted",
  partyId: "p1",
  gstLines: [{
    hsnSac: "998314",
    taxable: 10000,
    rate: 18,
    cgst: 900,
    sgst: 900,
    igst: 0,
    itcEligible: true,
  }],
};

const purchase = {
  id: "v2",
  voucherType: "purchase",
  voucherNumber: "PUR-1",
  date: "2026-04-12",
  status: "posted",
  partyId: "p2",
  gstLines: [{
    hsnSac: "8471",
    taxable: 5000,
    rate: 18,
    cgst: 450,
    sgst: 450,
    igst: 0,
    itcEligible: true,
  }],
};

const parties = [
  { id: "p1", name: "ABC Traders", gstin: "29AAAAA0000A1Z5" },
  { id: "p2", name: "Supplier Co", gstin: "29BBBBB0000B1Z5" },
];

const range = { from: "2026-04-01", to: "2026-04-30" };

test("GSTR-1 preparation is calculated-only and splits B2B", () => {
  const prep = buildGstr1Preparation({ vouchers: [sale, purchase], parties, range });
  assert.equal(prep.kind, "GSTR-1 preparation");
  assert.equal(prep.dataClass, "calculated");
  assert.equal(prep.filingStatus, "not_filed");
  assert.equal(prep.summary.b2bCount, 1);
  assert.equal(prep.b2b[0].gstin, "29AAAAA0000A1Z5");
  assert.equal(prep.b2b[0].taxable, 10000);
  assert.match(prep.disclaimer, /not a filed GSTR-1/i);

  const csv = gstrPrepToCsvRows(prep);
  assert.ok(csv.some(row => row[0] === "B2B"));
  assert.ok(csv.some(row => row[0] === "Disclaimer"));
});

test("GSTR-3B preparation summarizes outward and eligible ITC", () => {
  const prep = buildGstr3bPreparation({ vouchers: [sale, purchase], range });
  assert.equal(prep.kind, "GSTR-3B preparation");
  assert.equal(prep.outward.taxable, 10000);
  assert.equal(prep.inwardEligibleItc.taxable, 5000);
  assert.equal(prep.filingStatus, "not_filed");
  assert.equal(EINVOICE_INTEGRATION_STUB.enabled, false);
});
