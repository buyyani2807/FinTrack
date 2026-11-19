import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGstr2Report, gstr2ExportRows, supplierInvoiceNumber } from "../src/features/accounts/model/gstr2Report.js";
import { gstBooksReport } from "../src/features/accounts/model/accountingReports.js";
import { accountsViewFromPath, accountsPath, REPORT_TABS } from "../src/features/accounts/accountsNavigation.js";

const REG_INTRA = "36AAAAA0000A1Z3"; // Telangana, valid checksum
const REG_INTER = "27AAPFU0939F1ZV"; // Maharashtra, valid checksum
const BAD = "36AAAAA0000A1Z5"; // bad checksum

const parties = [
  { id: "p-intra", name: "Hyd Traders", gstin: REG_INTRA },
  { id: "p-inter", name: "Mumbai Mills", gstin: REG_INTER },
  { id: "p-ur", name: "Local Kirana Supplier", gstin: "", stateCode: "36" },
  { id: "p-bad", name: "Typo Supplier", gstin: BAD },
];

const gst = (taxable, rate, { inter = false, hsn = "1006", itc = true } = {}) => {
  const tax = Math.round(taxable * rate) / 100;
  return inter
    ? { hsnSac: hsn, taxable, rate, cgst: 0, sgst: 0, igst: tax, itcEligible: itc }
    : { hsnSac: hsn, taxable, rate, cgst: tax / 2, sgst: tax / 2, igst: 0, itcEligible: itc };
};

const v = (over) => ({ status: "posted", voucherType: "purchase", narration: "", ...over });

const vouchers = [
  // B2B intra, two rates on one bill
  v({ id: "v1", voucherNumber: "PUR-1", date: "2026-11-02", partyId: "p-intra", narration: "Bill INV-778 · rice and soap", gstLines: [gst(1000, 5), gst(200, 18, { hsn: "3401" })] }),
  // B2B inter-state
  v({ id: "v2", voucherNumber: "PUR-2", date: "2026-11-05", partyId: "p-inter", narration: "Bill MM/26/55", gstLines: [gst(5000, 18, { inter: true, hsn: "5208" })] }),
  // Unregistered supplier, no bill number
  v({ id: "v3", voucherNumber: "PUR-3", date: "2026-11-06", partyId: "p-ur", gstLines: [gst(400, 5)] }),
  // Invalid GSTIN → B2BUR + check
  v({ id: "v4", voucherNumber: "PUR-4", date: "2026-11-07", partyId: "p-bad", narration: "Bill T-1", gstLines: [gst(100, 18, { hsn: "3401" })] }),
  // Nil-rated purchase (fresh vegetables)
  v({ id: "v5", voucherNumber: "PUR-5", date: "2026-11-08", partyId: "p-intra", narration: "Bill INV-790", gstLines: [{ hsnSac: "0702", taxable: 300, rate: 0, cgst: 0, sgst: 0, igst: 0 }] }),
  // ITC not eligible (blocked credit)
  v({ id: "v6", voucherNumber: "PUR-6", date: "2026-11-09", partyId: "p-intra", narration: "Bill INV-801", gstLines: [gst(1000, 18, { hsn: "9963", itc: false })] }),
  // Purchase return (debit note) to the registered intra supplier
  v({ id: "v7", voucherNumber: "DN-1", voucherType: "debit_note", date: "2026-11-10", partyId: "p-intra", narration: "Return against INV-778", gstLines: [gst(100, 5)] }),
  // Cancelled in the same month: original (reversed) + reversal → neither listed
  v({ id: "v8", voucherNumber: "PUR-8", status: "reversed", date: "2026-11-11", partyId: "p-intra", narration: "Bill DUP-1", gstLines: [gst(999, 18)] }),
  v({ id: "v9", voucherNumber: "PUR-9", sourceType: "reversal", sourceTransactionId: "v8", date: "2026-11-12", partyId: "p-intra", narration: "Reversal of PUR-8", gstLines: [gst(999, 18)] }),
  // Reversal in November of an October purchase → negative row
  v({ id: "v10", voucherNumber: "PUR-10", status: "reversed", date: "2026-10-20", partyId: "p-inter", narration: "Bill OCT-9", gstLines: [gst(2000, 18, { inter: true, hsn: "5208" })] }),
  v({ id: "v11", voucherNumber: "PUR-11", sourceType: "reversal", sourceTransactionId: "v10", date: "2026-11-13", partyId: "p-inter", narration: "Reversal of PUR-10", gstLines: [gst(2000, 18, { inter: true, hsn: "5208" })] }),
  // Out of range, a draft, and a sale — all ignored
  v({ id: "v12", voucherNumber: "PUR-12", date: "2026-12-01", partyId: "p-intra", gstLines: [gst(50, 5)] }),
  v({ id: "v13", voucherNumber: "PUR-13", status: "draft", date: "2026-11-14", partyId: "p-intra", gstLines: [gst(50, 5)] }),
  v({ id: "v14", voucherNumber: "SAL-1", voucherType: "sales", date: "2026-11-14", partyId: "p-intra", gstLines: [gst(70, 5)] }),
];

const range = { from: "2026-11-01", to: "2026-11-30" };
const report = buildGstr2Report({ vouchers, parties, range, companyStateCode: "36" });

test("registered suppliers go to B2B, one row per bill and rate", () => {
  const b2b = report.sections.b2b;
  const v1 = b2b.filter(row => row.voucherId === "v1");
  assert.equal(v1.length, 2);
  assert.deepEqual(v1.map(row => row.rate).sort((a, b) => a - b), [5, 18]);
  assert.equal(v1[0].invoiceNumber, "INV-778");
  assert.equal(v1[0].gstin, REG_INTRA);
  assert.equal(v1[0].invoiceValue, 1000 + 50 + 200 + 36);
  assert.equal(v1[0].supplyType, "Intra-state");
  assert.equal(v1[0].supplierState, "36-Telangana");

  const v2 = b2b.find(row => row.voucherId === "v2");
  assert.equal(v2.supplyType, "Inter-state");
  assert.equal(v2.igst, 900);
  assert.equal(v2.supplierState, "27-Maharashtra");
  assert.equal(v2.placeOfSupply, "36-Telangana");
  assert.equal(v2.invoiceNumber, "MM/26/55");
});

test("unregistered and invalid-GSTIN suppliers go to B2BUR with a check", () => {
  const ids = report.sections.b2bur.map(row => row.voucherId).sort();
  assert.deepEqual(ids, ["v3", "v4"]);
  assert.equal(report.sections.b2bur.find(row => row.voucherId === "v4").gstin, "");
  assert.ok(report.checks.some(check => check.voucherNumber === "PUR-4" && /not valid/.test(check.issue)));
  assert.ok(report.checks.some(check => check.voucherNumber === "PUR-3" && /bill number/.test(check.issue)));
  const v3 = report.sections.b2bur.find(row => row.voucherId === "v3");
  assert.equal(v3.invoiceNumber, "PUR-3", "falls back to our voucher number");
  assert.equal(v3.billNumberMissing, true);
});

test("0% purchases go to Nil, debit notes to CDNR", () => {
  assert.deepEqual(report.sections.nil.map(row => row.voucherId), ["v5"]);
  assert.deepEqual(report.sections.cdnr.map(row => row.voucherId), ["v7"]);
  assert.equal(report.sections.cdnr[0].noteType, "D");
  assert.equal(report.sections.cdnur.length, 0);
  assert.ok(!report.checks.some(check => check.voucherNumber === "DN-1"), "debit notes need no supplier bill number");
});

test("a purchase cancelled in the same period is not listed at all", () => {
  const all = Object.values(report.sections).flat();
  assert.ok(!all.some(row => row.voucherId === "v8" || row.voucherId === "v9"));
});

test("reversal of an earlier period's purchase is a negative B2B row", () => {
  const row = report.sections.b2b.find(item => item.voucherId === "v11");
  assert.ok(row);
  assert.equal(row.taxable, -2000);
  assert.equal(row.igst, -360);
  assert.equal(row.itcTotal, -360);
  assert.equal(row.invoiceNumber, "OCT-9", "uses the original bill number");
  assert.equal(row.reversalOf, "PUR-10");
});

test("drafts, sales and other periods are ignored", () => {
  const all = Object.values(report.sections).flat().map(row => row.voucherId);
  for (const id of ["v12", "v13", "v14", "v10"]) assert.ok(!all.includes(id), id);
});

test("ITC: eligible vs blocked, and debit notes reduce it", () => {
  const v6 = report.sections.b2b.find(row => row.voucherId === "v6");
  assert.equal(v6.itcEligible, false);
  assert.equal(v6.itcTotal, 0);
  assert.equal(report.summary.itcIneligible, 180);
  // b2b ITC: v1 (50+36) + v2 900 + v11 (−360) = 626; b2bur: v3 20 + v4 18 = 38; cdnr: −5
  assert.equal(report.totals.b2b.itc, 626);
  assert.equal(report.totals.b2bur.itc, 38);
  assert.equal(report.totals.cdnr.itc, 5);
  assert.equal(report.summary.itcAvailable, 626 + 38 - 5);
});

test("net ITC equals eligible input tax in GST books for the same period", () => {
  const books = gstBooksReport(vouchers, range);
  assert.equal(report.summary.itcAvailable, books.inputTax);
});

test("totals count each bill once and HSN summary nets debit notes", () => {
  assert.equal(report.totals.b2b.invoices, 4); // v1, v2, v6, v11
  assert.equal(report.totals.b2bur.invoices, 2);
  const rice = report.hsn.find(row => row.hsnSac === "1006");
  // v1 1000 + v3 400 − v7 100 (+ v9/v8 cancelled, not counted)
  assert.equal(rice.taxable, 1300);
  // v2 5000 − reversal of the October bill 2000
  assert.equal(report.hsn.find(row => row.hsnSac === "5208").taxable, 3000);
});

test("supplier bill number comes from the narration", () => {
  assert.equal(supplierInvoiceNumber({ narration: "Bill A/12 · goods" }), "A/12");
  assert.equal(supplierInvoiceNumber({ narration: "Rice purchase" }), "");
});

test("export rows: summary, a row per bill line, HSN, checks and disclaimer", () => {
  const rows = gstr2ExportRows(report, { companyName: "Buyyani's Enterprises" });
  assert.equal(rows[0][0], "GSTR-2 (Purchases)");
  assert.ok(rows.some(row => row[0] === "Section" && row[1] === "Invoices"));
  const header = rows.findIndex(row => row[0] === "Section" && row[1] === "Supplier GSTIN");
  assert.ok(header > 0);
  const lines = rows.filter(row => ["B2B", "B2BUR", "CDNR", "CDNUR", "NIL"].includes(row[0]));
  assert.equal(lines.length, Object.values(report.sections).flat().length);
  assert.ok(rows.some(row => row[0] === "HSN / SAC"));
  assert.ok(rows.some(row => row[0] === "Check"));
  assert.match(rows.at(-1)[1], /not a filed return/);
});

test("empty books give an empty, well-formed report", () => {
  const empty = buildGstr2Report({ vouchers: [], parties: [], range });
  assert.equal(empty.summary.itcAvailable, 0);
  assert.deepEqual(empty.hsn, []);
  assert.ok(gstr2ExportRows(empty).length > 5);
});

test("GSTR-2 has its own report URL with common spellings", () => {
  assert.ok(REPORT_TABS.some(tab => tab.id === "gstr2"));
  assert.equal(accountsPath({ section: "reports", reportTab: "gstr2" }), "/accounting/reports/gstr2");
  assert.equal(accountsViewFromPath("reports", "gstr2").reportTab, "gstr2");
  for (const slug of ["gstr-2", "GSTR-2", "gstr2-purchases"]) {
    const view = accountsViewFromPath("reports", slug);
    assert.equal(view.reportTab, "gstr2", slug);
  }
});

test("Reports page renders GSTR-2 and exports it", () => {
  const section = readFileSync(new URL("../src/features/accounts/sections/ReportsSection.jsx", import.meta.url), "utf8");
  const product = readFileSync(new URL("../src/features/accounts/AccountingProduct.jsx", import.meta.url), "utf8");
  assert.match(section, /reportTab === "gstr2" && \(/);
  assert.match(section, /<Gstr2Report/);
  assert.match(product, /if \(active === "gstr2"\)/);
  assert.match(product, /gstr2ExportRows\(report/);
});
