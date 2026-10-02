import test from "node:test";
import assert from "node:assert/strict";
import { renderPartyStatementPdf } from "../src/features/accounts/io/partyStatementPdf.js";

test("party statement PDF includes party name and period", () => {
  const pdf = renderPartyStatementPdf({
    party: { name: "ABC Traders", phone: "9876543210", gstin: "07AAAAA0000A1Z4" },
    partyBook: {
      opening: 1000,
      closing: 500,
      outstanding: 500,
      rows: [
        { date: "2026-09-01", voucherNumber: "SALE-000001", narration: "Credit sale", debit: 2000, credit: 0 },
        { date: "2026-09-05", voucherNumber: "REC-000001", narration: "Receipt", debit: 0, credit: 1500 },
      ],
    },
    periodFrom: "2026-04-01",
    periodTo: "2026-09-09",
    company: { name: "FinTrack QA Trading Pvt Ltd", gstin: "07AAAAA0000A1Z4" },
    money: value => `Rs.${Number(value).toFixed(2)}`,
  });

  assert.match(pdf, /^%PDF-1.4/);
  assert.match(pdf, /PARTY STATEMENT OF ACCOUNT/);
  assert.match(pdf, /FINTRACK QA TRADING PVT LTD/);
  assert.match(pdf, /ABC Traders/);
  assert.match(pdf, /2026-04-01/);
  assert.match(pdf, /SALE-000001/);
});
