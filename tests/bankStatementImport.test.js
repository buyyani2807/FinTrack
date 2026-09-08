import test from "node:test";
import assert from "node:assert/strict";
import {
  guessColumnMapping,
  mapBankImportRows,
  parseDelimitedText,
  parseImportDate,
  parseIndianAmount,
} from "../src/features/accounts/bankStatementImport.js";

test("parses CSV bank export and maps debit/credit lines with reference", () => {
  const csv = [
    "Txn Date,Narration,Chq/Ref No,Withdrawal,Deposit,Balance",
    "01/04/2026,UPI-VENDOR-PAY,UTR123,1500.00,,48500.00",
    "02/04/2026,NEFT CR CUSTOMER,NEFT456,,2500.50,51000.50",
  ].join("\n");

  const { headers, rows } = parseDelimitedText(csv);
  const mapping = guessColumnMapping(headers);
  assert.equal(mapping.date, 0);
  assert.equal(mapping.description, 1);
  assert.equal(mapping.reference, 2);
  assert.equal(mapping.debit, 3);
  assert.equal(mapping.credit, 4);

  const mapped = mapBankImportRows({ headers, rows, mapping });
  assert.equal(mapped.errors.length, 0);
  assert.equal(mapped.lines.length, 2);
  assert.equal(mapped.lines[0].lineDate, "2026-04-01");
  assert.equal(mapped.lines[0].direction, "out");
  assert.equal(mapped.lines[0].amount, "1500");
  assert.equal(mapped.lines[0].reference, "UTR123");
  assert.match(mapped.lines[0].description, /UTR123/);
  assert.equal(mapped.lines[1].direction, "in");
  assert.equal(mapped.lines[1].amount, "2500.5");
  assert.equal(mapped.closingBalance, "51000.5");
});

test("parses Indian amounts and dates used by bank imports", () => {
  assert.equal(parseIndianAmount("1,250.50"), 1250.5);
  assert.equal(parseIndianAmount("(500)"), -500);
  assert.equal(parseImportDate("08/09/2026"), "2026-09-08");
  assert.equal(parseImportDate("2026-09-08"), "2026-09-08");
});
