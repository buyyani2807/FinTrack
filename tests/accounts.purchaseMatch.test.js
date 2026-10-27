import test from "node:test";
import assert from "node:assert/strict";
import { filterPurchaseMatch, purchaseMatchReport } from "../src/features/accounts/model/purchaseMatch.js";

const poLine = (id, quantity, rate, extra = {}) => ({
  id,
  itemId: `item-${id}`,
  itemName: `Item ${id}`,
  unit: "Nos",
  quantity,
  rate,
  ...extra,
});

test("purchaseMatchReport matches ordered, received, and billed quantities", () => {
  const documents = [
    {
      id: "po1",
      docType: "purchase_order",
      docNumber: "PO-1",
      docDate: "2026-09-01",
      partyId: "s1",
      status: "open",
      lines: [poLine("pol1", 10, 100), poLine("pol2", 5, 50)],
    },
    {
      id: "grn1",
      docType: "goods_receipt",
      docNumber: "GRN-1",
      docDate: "2026-09-03",
      partyId: "s1",
      status: "open",
      sourceDocumentId: "po1",
      lines: [poLine("grn1a", 10, 100, { sourceLineId: "pol1" }), poLine("grn1b", 5, 50, { sourceLineId: "pol2" })],
    },
  ];
  const vouchers = [{ id: "v1", voucherType: "purchase", status: "posted", voucherNumber: "PUR-1" }];
  const voucherItemLines = [
    { voucherId: "v1", quantity: 10, rate: 100, taxableAmount: 1000, sourceDocumentLineId: "grn1a" },
    { voucherId: "v1", quantity: 5, rate: 50, taxableAmount: 250, sourceDocumentLineId: "grn1b" },
  ];
  const report = purchaseMatchReport({
    documents,
    vouchers,
    voucherItemLines,
    parties: [{ id: "s1", name: "Steel Co" }],
  });
  assert.equal(report.totals.orders, 1);
  assert.equal(report.totals.matched, 1);
  assert.equal(report.orders[0].partyName, "Steel Co");
  assert.equal(report.orders[0].status, "matched");
  assert.equal(report.orders[0].received, 15);
  assert.equal(report.orders[0].billed, 15);
});

test("purchaseMatchReport flags over-receive, over-bill, and rate variance", () => {
  const documents = [
    {
      id: "po2",
      docType: "purchase_order",
      docNumber: "PO-2",
      docDate: "2026-09-05",
      partyId: "s1",
      status: "open",
      lines: [poLine("pol9", 10, 100)],
    },
    {
      id: "grn2",
      docType: "goods_receipt",
      docNumber: "GRN-2",
      docDate: "2026-09-06",
      partyId: "s1",
      status: "open",
      lines: [poLine("grn9", 12, 100, { sourceLineId: "pol9" })],
    },
  ];
  const vouchers = [{ id: "v2", voucherType: "purchase", status: "posted", voucherNumber: "PUR-2" }];
  const voucherItemLines = [
    { voucherId: "v2", quantity: 12, rate: 120, taxableAmount: 1440, sourceDocumentLineId: "grn9" },
  ];
  const report = purchaseMatchReport({ documents, vouchers, voucherItemLines, parties: [{ id: "s1", name: "Steel Co" }] });
  assert.equal(report.totals.review, 1);
  const line = report.orders[0].lines[0];
  assert.ok(line.warnings.some(row => row.code === "over_received"));
  assert.ok(line.warnings.some(row => row.code === "billed_over_ordered"));
  assert.ok(line.warnings.some(row => row.code === "rate_over_order"));
});

test("purchaseMatchReport flags unbilled receipts and leaves untouched orders open", () => {
  const documents = [
    {
      id: "po3",
      docType: "purchase_order",
      docNumber: "PO-3",
      docDate: "2026-09-07",
      partyId: "s1",
      status: "open",
      lines: [poLine("pol3", 8, 40)],
    },
    {
      id: "grn3",
      docType: "goods_receipt",
      docNumber: "GRN-3",
      docDate: "2026-09-08",
      partyId: "s1",
      status: "open",
      lines: [poLine("grn3a", 8, 40, { sourceLineId: "pol3" })],
    },
    {
      id: "po4",
      docType: "purchase_order",
      docNumber: "PO-4",
      docDate: "2026-09-09",
      partyId: "s1",
      status: "open",
      lines: [poLine("pol4", 3, 10)],
    },
  ];
  const report = purchaseMatchReport({ documents, vouchers: [], voucherItemLines: [], parties: [{ id: "s1", name: "Steel Co" }] });
  const unbilled = report.orders.find(row => row.docNumber === "PO-3");
  const open = report.orders.find(row => row.docNumber === "PO-4");
  assert.equal(unbilled.status, "review");
  assert.ok(unbilled.lines[0].warnings.some(row => row.code === "unbilled_receipt"));
  assert.equal(open.status, "open");
  assert.equal(filterPurchaseMatch(report.orders, { status: "open" }).length, 1);
  assert.equal(filterPurchaseMatch(report.orders, { search: "PO-3" })[0].docNumber, "PO-3");
});
