import test from "node:test";
import assert from "node:assert/strict";
import { suggestHsn } from "../src/features/intelligence/ai/hsnSuggest.js";
import { ITC_DISCLAIMER, buildItcCheck, parseGstr2b } from "../src/features/intelligence/ai/gstr2bCheck.js";

const supplier = { id: "sup", name: "Kaveri Supplies", partyType: "supplier", gstin: "29ABCDE1234F1Z5" };
const purchase = {
  id: "p1",
  status: "posted",
  voucherType: "purchase",
  voucherNumber: "PUR-0001",
  date: "2026-09-15",
  partyId: "sup",
  narration: "Bill SWT/2431",
  gstLines: [{ taxable: 10000, cgst: 900, sgst: 900, igst: 0 }],
};
const extra = {
  id: "p2",
  status: "posted",
  voucherType: "purchase",
  voucherNumber: "PUR-0002",
  date: "2026-09-20",
  partyId: "sup",
  narration: "Bill SWT/2500",
  gstLines: [{ taxable: 5000, cgst: 450, sgst: 450, igst: 0 }],
};

const portal = {
  data: {
    docdata: {
      b2b: [{
        ctin: "29ABCDE1234F1Z5",
        trdnm: "Kaveri Supplies",
        inv: [{
          inum: "SWT/2431",
          dt: "15-09-2026",
          val: 11800,
          items: [{ itm_det: { txval: 10000, cgst: 900, sgst: 900, igst: 0 } }],
        }],
      }, {
        ctin: "27AAAAA0000A1Z5",
        trdnm: "Unknown Traders",
        inv: [{ inum: "UNK/1", dt: "16-09-2026", val: 500, items: [{ itm_det: { txval: 500, igst: 90, cgst: 0, sgst: 0 } }] }],
      }],
      b2ba: [{ ctin: "29ABCDE1234F1Z5", inv: [] }],
    },
  },
};

test("HSN suggestion names the code and rate, and waits to be confirmed", () => {
  assert.equal(suggestHsn("Copper wire 2.5 sq mm").hsn, "7408");
  assert.equal(suggestHsn("Copper wire 2.5 sq mm").rate, 18);
  assert.equal(suggestHsn("Cold drink 750ml").rate, 40);
  assert.equal(suggestHsn("Cold drink 750ml").hsn, "2202");
  assert.equal(suggestHsn("teacher"), null);
  assert.equal(suggestHsn("ab"), null);
  assert.match(suggestHsn("rice").note, /not a tax classification/);
});

test("GSTR-2B suggests accept, pending and reject, and files nothing", () => {
  const parsed = parseGstr2b(JSON.stringify(portal));
  assert.equal(parsed.invoices.length, 2);
  assert.match(parsed.notes[0], /Amended invoices/);
  const before = JSON.stringify(portal);
  const check = buildItcCheck({ invoices: parsed.invoices, vouchers: [purchase, extra], parties: [supplier] });
  assert.equal(JSON.stringify(portal), before);
  assert.equal(check.writeAction, "none");
  assert.equal(check.disclaimer, ITC_DISCLAIMER);
  assert.equal(check.rows.find(row => row.invoice === "SWT2431").action, "accept");
  assert.equal(check.rows.find(row => row.invoice === "UNK1").action, "reject");
  assert.equal(check.rows.find(row => row.invoice === "SWT2500").action, "pending");
  assert.match(check.rows.find(row => row.invoice === "SWT2500").reason, /not in the uploaded GSTR-2B/);

  const mismatch = buildItcCheck({
    invoices: [{ ...parsed.invoices[0], taxable: 9000 }],
    vouchers: [purchase],
    parties: [supplier],
  });
  assert.equal(mismatch.rows[0].action, "pending");
  assert.match(mismatch.rows[0].reason, /differs/);

  const csv = parseGstr2b("GSTIN,Invoice number,Invoice date,Taxable value,CGST,SGST,IGST\n29ABCDE1234F1Z5,SWT/2431,15-09-2026,10000,900,900,0\n");
  assert.equal(csv.invoices[0].invoice, "SWT2431");
  assert.equal(csv.invoices[0].tax, 1800);
  assert.match(parseGstr2b("hello").error, /CSV needs/);
  assert.match(parseGstr2b("{").error, /JSON could not be read/);
});
