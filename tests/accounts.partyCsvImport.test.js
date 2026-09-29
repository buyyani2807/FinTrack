import test from "node:test";
import assert from "node:assert/strict";
import { parsePartyCsv, planPartyImport } from "../src/features/accounts/partyCsvImport.js";

test("party CSV keeps columns aligned when cells are empty", () => {
  const rows = parsePartyCsv("Name,Phone,Email,Address\nRavi Traders,,ravi@example.com,Hyderabad\n\"Sri, Co\",9876543210,,\"12 \"\"A\"\" Street\"");
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { name: rows[0].name, phone: rows[0].phone, email: rows[0].email, address: rows[0].address },
    { name: "Ravi Traders", phone: "", email: "ravi@example.com", address: "Hyderabad" },
  );
  assert.equal(rows[1].name, "Sri, Co");
  assert.equal(rows[1].phone, "9876543210");
  assert.equal(rows[1].address, "12 \"A\" Street");
});

test("party CSV maps party type and defaults unknown types to customer", () => {
  const rows = parsePartyCsv("Party Type,Party Name,Mobile\nSupplier,Steel Mart,98480 12345\nvendor,Unknown Type,\n,,\n");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].partyType, "supplier");
  assert.equal(rows[0].name, "Steel Mart");
  assert.equal(rows[0].phone, "98480 12345");
  assert.equal(rows[1].partyType, "customer");
});

test("party import skips duplicates by name or phone within the same type", () => {
  const existing = [
    { partyType: "customer", name: "Ravi Traders", phone: "" },
    { partyType: "supplier", name: "Steel Mart", phone: "+91 98480 12345" },
  ];
  const rows = parsePartyCsv([
    "Type,Name,Phone",
    "customer,  ravi   traders ,",
    "supplier,Steel Mart Pvt,9848012345",
    "customer,Steel Mart,",
    "customer,New Party,9000000001",
    "customer,New Party Again,9000000001",
  ].join("\n"));
  const { toCreate, duplicates } = planPartyImport(rows, existing);
  assert.deepEqual(toCreate.map(row => row.name), ["Steel Mart", "New Party"]);
  assert.deepEqual(duplicates.map(row => row.name), ["ravi   traders", "Steel Mart Pvt", "New Party Again"]);
});
