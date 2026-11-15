import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEwayBillOutboundPayload,
  EWAYBILL_INTEGRATION_STUB,
} from "../src/features/accounts/io/gstPrepExport.js";

test("e-way bill stub documents prep-only marketing claim", () => {
  assert.equal(EWAYBILL_INTEGRATION_STUB.enabled, false);
  assert.match(EWAYBILL_INTEGRATION_STUB.note, /not implemented|prepares/i);
  assert.match(EWAYBILL_INTEGRATION_STUB.marketingClaim, /preparation|payload/i);
});

test("e-way bill outbound payload never invents an EBN", () => {
  const payload = buildEwayBillOutboundPayload({
    voucher: {
      voucherNumber: "SALE-1",
      date: "2026-09-09",
      lines: [{ credit: 60000, debit: 0 }],
      gstLines: [{ hsnSac: "8471", taxable: 60000, rate: 18, cgst: 0, sgst: 0, igst: 10800 }],
    },
    party: { name: "Buyer", gstin: "36AAAAA0000A1Z5", stateCode: "36" },
    company: { name: "Seller", gstin: "27BBBBB0000B1Z5", stateCode: "27", gstRegistration: "regular" },
  });
  assert.equal(payload.status, "not_submitted");
  assert.equal(payload.ebn, null);
  assert.match(payload.disclaimer, /not submitted/i);
});

test("e-way bill payload flags inter-state movement and the ₹50,000 threshold", () => {
  const payload = buildEwayBillOutboundPayload({
    voucher: {
      voucherNumber: "SALE-2",
      date: "2026-09-09",
      lines: [{ credit: 60000, debit: 0 }],
      gstLines: [{ hsnSac: "8471", taxable: 60000, rate: 18, cgst: 0, sgst: 0, igst: 10800 }],
    },
    party: { name: "Buyer", gstin: "36AAAAA0000A1Z5", stateCode: "36" },
    company: { name: "Seller", gstin: "27BBBBB0000B1Z5", stateCode: "27" },
  });
  assert.equal(payload.transactionType, 2);
  assert.equal(payload.thresholdMet, true);
  assert.equal(payload.values.totInvValue, 70800);
});

test("e-way bill payload flags intra-state movement and a below-threshold invoice", () => {
  const payload = buildEwayBillOutboundPayload({
    voucher: {
      voucherNumber: "SALE-3",
      date: "2026-09-09",
      lines: [{ credit: 1000, debit: 0 }],
      gstLines: [{ hsnSac: "8471", taxable: 1000, rate: 18, cgst: 90, sgst: 90, igst: 0 }],
    },
    party: { name: "Buyer", gstin: "27AAAAA0000A1Z5", stateCode: "27" },
    company: { name: "Seller", gstin: "27BBBBB0000B1Z5", stateCode: "27" },
  });
  assert.equal(payload.transactionType, 1);
  assert.equal(payload.thresholdMet, false);
  assert.match(payload.thresholdNote, /below/i);
});

test("e-way bill payload falls back to a single aggregate line without GST lines", () => {
  const payload = buildEwayBillOutboundPayload({
    voucher: {
      voucherNumber: "SALE-4",
      date: "2026-09-09",
      lines: [{ credit: 500, debit: 0 }],
    },
    party: { name: "Buyer" },
    company: { name: "Seller" },
  });
  assert.equal(payload.itemList.length, 1);
  assert.equal(payload.itemList[0].taxableAmount, 500);
});

test("e-way bill payload includes Part B when a vehicle number is given", () => {
  const payload = buildEwayBillOutboundPayload({
    voucher: {
      voucherNumber: "SALE-5",
      date: "2026-09-09",
      lines: [{ credit: 60000, debit: 0 }],
      gstLines: [{ hsnSac: "8471", taxable: 60000, rate: 18, cgst: 0, sgst: 0, igst: 10800 }],
    },
    party: { name: "Buyer", gstin: "36AAAAA0000A1Z5", stateCode: "36" },
    company: { name: "Seller", gstin: "27BBBBB0000B1Z5", stateCode: "27" },
    transport: { vehicleNumber: "ka01ab1234", transporterName: "Fast Carriers", transMode: "1", transDistance: "350" },
  });
  assert.equal(payload.transport.vehicleNumber, "KA01AB1234");
  assert.equal(payload.transport.transDistance, 350);
  assert.match(payload.disclaimer, /Part B \(vehicle\/transporter\) included/);
});

test("e-way bill payload has no Part B when no vehicle number is given", () => {
  const payload = buildEwayBillOutboundPayload({
    voucher: { voucherNumber: "SALE-6", date: "2026-09-09", lines: [{ credit: 1000, debit: 0 }] },
    party: { name: "Buyer" },
    company: { name: "Seller" },
    transport: { transporterName: "Fast Carriers" },
  });
  assert.equal(payload.transport, null);
  assert.match(payload.disclaimer, /Part A only/);
});
