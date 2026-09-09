import test from "node:test";
import assert from "node:assert/strict";
import {
  assertChartOpeningsBalanced,
  chartOpeningTotals,
  financialYearContaining,
  newClientRequestId,
} from "../src/features/accounts/accountingModel.js";
import { itemPurchasesReport, itemSalesReport } from "../src/features/accounts/inventoryModel.js";
import {
  buildEinvoiceOutboundPayload,
  EINVOICE_INTEGRATION_STUB,
  gstrPrepToJson,
  buildGstr1Preparation,
} from "../src/features/accounts/gstPrepExport.js";
import { invoiceRegister, suggestBillWiseAllocations } from "../src/features/accounts/accountingReports.js";

test("non-April financial year ends on the day before next FY start", () => {
  const fy = financialYearContaining("2026-07-15", 7);
  assert.equal(fy.from, "2026-07-01");
  assert.equal(fy.to, "2027-06-30");
});

test("chart openings must balance debit and credit", () => {
  const unbalanced = [
    { id: "1", openingBalance: 1000, openingSide: "debit" },
    { id: "2", openingBalance: 400, openingSide: "credit" },
  ];
  assert.equal(chartOpeningTotals(unbalanced).balanced, false);
  assert.throws(() => assertChartOpeningsBalanced(unbalanced), /unbalanced/i);
  assert.doesNotThrow(() => assertChartOpeningsBalanced([
    { id: "1", openingBalance: 1000, openingSide: "debit" },
    { id: "2", openingBalance: 1000, openingSide: "credit" },
  ]));
});

test("client request ids are UUID-shaped", () => {
  assert.match(newClientRequestId(), /^[0-9a-f-]{36}$/i);
});

test("item sales and purchase reports ignore reversed and cancelled vouchers", () => {
  const vouchers = [
    { id: "v1", voucherType: "sales", status: "posted", date: "2026-09-01" },
    { id: "v2", voucherType: "sales", status: "reversed", date: "2026-09-02" },
    { id: "v3", voucherType: "sales", status: "cancelled", date: "2026-09-03" },
    { id: "v4", voucherType: "purchase", status: "posted", date: "2026-09-01" },
    { id: "v5", voucherType: "purchase", status: "reversed", date: "2026-09-02" },
  ];
  const lines = [
    { voucherId: "v1", itemId: "i1", itemName: "Laptop", quantity: 2, taxableAmount: 100 },
    { voucherId: "v2", itemId: "i1", itemName: "Laptop", quantity: 9, taxableAmount: 900 },
    { voucherId: "v3", itemId: "i1", itemName: "Laptop", quantity: 5, taxableAmount: 500 },
    { voucherId: "v4", itemId: "i1", itemName: "Laptop", quantity: 3, taxableAmount: 300 },
    { voucherId: "v5", itemId: "i1", itemName: "Laptop", quantity: 7, taxableAmount: 700 },
  ];
  const sales = itemSalesReport(lines, vouchers);
  assert.equal(sales.length, 1);
  assert.equal(sales[0].quantity, 2);
  const purchases = itemPurchasesReport(lines, vouchers);
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].quantity, 3);
});

test("e-invoice stub documents prep-only marketing claim", () => {
  assert.equal(EINVOICE_INTEGRATION_STUB.enabled, false);
  assert.match(EINVOICE_INTEGRATION_STUB.note, /not implemented|payload/i);
  assert.match(EINVOICE_INTEGRATION_STUB.marketingClaim, /preparation|payload/i);
});

test("GSTR prep JSON keeps not_filed filing status", () => {
  const prep = buildGstr1Preparation({ vouchers: [], parties: [], range: { from: "2026-04-01", to: "2026-04-30" } });
  const json = gstrPrepToJson(prep);
  assert.equal(json.filingStatus, "not_filed");
  assert.equal(json.dataClass, "calculated");
  assert.ok(json.exportedAt);
});

test("e-invoice outbound payload never invents IRN", () => {
  const payload = buildEinvoiceOutboundPayload({
    voucher: {
      voucherNumber: "SALE-1",
      date: "2026-09-09",
      lines: [{ credit: 1000, debit: 0 }],
      gstLines: [{ hsnSac: "8471", taxable: 1000, rate: 18, cgst: 90, sgst: 90, igst: 0 }],
    },
    party: { name: "Buyer", gstin: "36AAAAA0000A1Z5", stateCode: "36" },
    company: { name: "Seller", gstin: "36BBBBB0000B1Z5", stateCode: "36", gstRegistration: "regular" },
  });
  assert.equal(payload.status, "not_submitted");
  assert.equal(payload.irn, null);
  assert.equal(payload.ackNumber, null);
  assert.match(payload.disclaimer, /not submitted/i);
});

test("bill-wise settlements pay specific invoices before FIFO leftover", () => {
  const accounts = [
    { id: "ar", code: "1100", accountType: "receivable", name: "AR" },
    { id: "cash", code: "1000", accountType: "cash", name: "Cash" },
    { id: "sales", code: "4300", accountType: "income", name: "Sales" },
  ];
  const parties = [{ id: "c1", name: "Customer", partyType: "customer" }];
  const saleA = {
    id: "inv-a",
    voucherType: "sales",
    voucherNumber: "SALE-A",
    date: "2026-04-01",
    dueDate: "2026-04-10",
    status: "posted",
    partyId: "c1",
    lines: [
      { coaId: "ar", debit: 1000, credit: 0, partyId: "c1" },
      { coaId: "sales", debit: 0, credit: 1000 },
    ],
  };
  const saleB = {
    id: "inv-b",
    voucherType: "sales",
    voucherNumber: "SALE-B",
    date: "2026-04-02",
    dueDate: "2026-04-12",
    status: "posted",
    partyId: "c1",
    lines: [
      { coaId: "ar", debit: 1000, credit: 0, partyId: "c1" },
      { coaId: "sales", debit: 0, credit: 1000 },
    ],
  };
  const receipt = {
    id: "rcpt-1",
    voucherType: "receipt",
    voucherNumber: "RCPT-1",
    date: "2026-04-05",
    status: "posted",
    partyId: "c1",
    settlements: [{ invoiceVoucherId: "inv-b", amount: 400 }],
    lines: [
      { coaId: "cash", debit: 400, credit: 0 },
      { coaId: "ar", debit: 0, credit: 400, partyId: "c1" },
    ],
  };
  const rows = invoiceRegister(accounts, [saleA, saleB, receipt], parties, {
    kind: "receivable",
    today: "2026-04-06",
  });
  const a = rows.find(row => row.id === "inv-a");
  const b = rows.find(row => row.id === "inv-b");
  assert.equal(a.outstanding, 1000);
  assert.equal(b.outstanding, 600);
  assert.equal(b.allocation, "bill_wise");
});

test("suggestBillWiseAllocations fills oldest invoices first", () => {
  const links = suggestBillWiseAllocations([
    { id: "b", reference: "S2", invoiceDate: "2026-04-02", outstanding: 300 },
    { id: "a", reference: "S1", invoiceDate: "2026-04-01", outstanding: 500 },
  ], 600);
  assert.deepEqual(links.map(row => [row.invoiceVoucherId, row.amount]), [["a", 500], ["b", 100]]);
});
