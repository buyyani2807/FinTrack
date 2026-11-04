import test from "node:test";
import assert from "node:assert/strict";
import { parseItemCsv, planItemImport, skuFromName } from "../src/features/accounts/io/itemCsvImport.js";

test("skuFromName builds a stable uppercase code", () => {
  assert.equal(skuFromName("Toor Dal 1kg"), "TOOR-DAL-1KG");
});

test("FinTrack template columns still parse", () => {
  const rows = parseItemCsv([
    "Name,SKU,Unit,Selling price,Purchase price,GST %,Opening stock",
    "Rice,RICE-1,Kg,60,50,5,10",
  ].join("\n"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Rice");
  assert.equal(rows[0].sku, "RICE-1");
  assert.equal(rows[0].unit, "Kg");
  assert.equal(rows[0].sellingPrice, "60");
  assert.equal(rows[0].openingStock, "10");
});

test("Focus / generic POS headers map without renaming the file", () => {
  const rows = parseItemCsv([
    "Menu Name,Item ID,Report Group,Price,Unit,Barcode,Tax",
    "Toor Dal,TD01,Staples,125,Kg,8901001,5%",
  ].join("\n"));
  assert.equal(rows[0].name, "Toor Dal");
  assert.equal(rows[0].sku, "TD01");
  assert.equal(rows[0].categoryName, "Staples");
  assert.equal(rows[0].sellingPrice, "125");
  assert.equal(rows[0].unit, "Kg");
  assert.equal(rows[0].barcode, "8901001");
  assert.equal(rows[0].gstRate, "5");
});

test("missing SKU falls back to barcode then name", () => {
  const withBarcode = parseItemCsv("Item Name,Barcode\nSugar,8902002\n");
  assert.equal(withBarcode[0].sku, "8902002");
  const withNameOnly = parseItemCsv("Product Name,Sale Rate\nBesan,80\n");
  assert.equal(withNameOnly[0].sku, "BESAN");
  assert.equal(withNameOnly[0].sellingPrice, "80");
});

test("planItemImport skips existing SKUs", () => {
  const rows = parseItemCsv("Name,SKU\nA,A1\nB,B1\n");
  const plan = planItemImport(rows, [{ sku: "A1" }]);
  assert.deepEqual(plan.toCreate.map(row => row.sku), ["B1"]);
  assert.equal(plan.duplicates.length, 1);
});
