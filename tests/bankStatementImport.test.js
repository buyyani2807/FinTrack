import test from "node:test";
import assert from "node:assert/strict";
import {
  guessColumnMapping,
  mapBankImportRows,
  parseDelimitedText,
  parseImportDate,
  parseIndianAmount,
} from "../src/features/accounts/io/bankStatementImport.js";

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
  assert.equal(mapped.lines[0].description, "UPI-VENDOR-PAY");
  assert.equal(mapped.lines[1].direction, "in");
  assert.equal(mapped.lines[1].amount, "2500.5");
  assert.equal(mapped.closingBalance, "51000.5");
});

test("a statement without a balance column does not invent opening or closing balances", () => {
  const csv = [
    "date,description,reference,debit,credit",
    "2026-10-07,E2E-TEST-BANK,E2E-REF,1,0",
  ].join("\n");
  const { headers, rows } = parseDelimitedText(csv);
  const mapping = guessColumnMapping(headers);
  assert.equal(mapping.balance, undefined);
  const mapped = mapBankImportRows({ headers, rows, mapping });
  assert.equal(mapped.lines.length, 1);
  assert.equal(mapped.lines[0].description, "E2E-TEST-BANK");
  assert.equal(mapped.lines[0].reference, "E2E-REF");
  assert.equal(mapped.lines[0].direction, "out");
  assert.equal(mapped.lines[0].amount, "1");
  assert.equal(mapped.openingBalance, "");
  assert.equal(mapped.closingBalance, "");
});

test("parses Indian amounts and dates used by bank imports", () => {
  assert.equal(parseIndianAmount("1,250.50"), 1250.5);
  assert.equal(parseIndianAmount("(500)"), -500);
  assert.equal(parseImportDate("08/09/2026"), "2026-09-08");
  assert.equal(parseImportDate("2026-09-08"), "2026-09-08");
});
