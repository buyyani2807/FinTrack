import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STARTER_CATALOGS,
  starterCatalogForIndustry,
  starterCatalogImportRows,
  starterCatalogView,
  starterItemSku,
} from "../src/features/accounts/model/starterItemCatalog.js";
import { ITEM_CSV_TEMPLATE, planItemImport } from "../src/features/accounts/io/itemCsvImport.js";
import { ITEM_UNITS, validateItemForm } from "../src/features/accounts/model/inventoryModel.js";
import { GST_RATES } from "../src/features/accounts/model/accountingGst.js";

const allSkus = catalog => catalog.items.map(row => starterItemSku(catalog, row));

test("every catalogue item is a valid item the import accepts", () => {
  for (const catalog of STARTER_CATALOGS) {
    const rows = starterCatalogImportRows(catalog.id, allSkus(catalog));
    assert.equal(rows.length, catalog.items.length, catalog.id);
    for (const row of rows) {
      assert.equal(validateItemForm(row), "", `${catalog.id}: ${row.name}`);
      assert.ok(ITEM_UNITS.includes(row.unit), `${row.name}: unit ${row.unit}`);
    }
    const plan = planItemImport(rows, []);
    assert.equal(plan.toCreate.length, rows.length, `${catalog.id} imports every row`);
    assert.equal(plan.invalid.length, 0);
  }
});

test("HSN codes are 4 digits and GST rates are current slabs", () => {
  for (const catalog of STARTER_CATALOGS) {
    for (const row of catalog.items) {
      assert.match(row.hsnSac, /^\d{4}$/, `${row.name}`);
      assert.ok(GST_RATES.includes(row.gstRate), `${row.name}: ${row.gstRate}%`);
      assert.ok(![12, 28].includes(row.gstRate), `${row.name}: 12% and 28% slabs were removed on 22 Sept 2025`);
    }
  }
});

test("SKUs and names are unique within each catalogue", () => {
  for (const catalog of STARTER_CATALOGS) {
    const skus = allSkus(catalog);
    assert.equal(new Set(skus).size, skus.length, `${catalog.id} SKUs`);
    const names = catalog.items.map(row => row.name.toLowerCase());
    assert.equal(new Set(names).size, names.length, `${catalog.id} names`);
    for (const sku of skus) assert.ok(sku.startsWith(`${catalog.skuPrefix}-`), sku);
  }
});

test("GST 2.0 spot checks", () => {
  const rate = (catalogId, name) => STARTER_CATALOGS.find(c => c.id === catalogId).items.find(row => row.name === name).gstRate;
  assert.equal(rate("kirana", "Ghee 500 ml"), 5);
  assert.equal(rate("kirana", "Toilet soap bar"), 5);
  assert.equal(rate("kirana", "Toothpaste 150 g"), 5);
  assert.equal(rate("kirana", "Biscuits"), 5);
  assert.equal(rate("kirana", "Paneer 200 g"), 0);
  assert.equal(rate("kirana", "UHT milk 1 L"), 0);
  assert.equal(rate("kirana", "Aerated soft drink 750 ml"), 40);
  assert.equal(rate("hardware", "Cement 50 kg"), 18);
  assert.equal(rate("medical", "Paracetamol tablets (strip)"), 5);
  assert.equal(rate("medical", "Digital thermometer"), 5);
  assert.equal(rate("general", "Exercise notebook"), 0);
  assert.equal(rate("general", "Air conditioner"), 18);
});

test("the business type picks the first catalogue", () => {
  assert.equal(starterCatalogForIndustry("kirana").id, "kirana");
  assert.equal(starterCatalogForIndustry("wholesale").id, "kirana");
  assert.equal(starterCatalogForIndustry("medical").id, "medical");
  assert.equal(starterCatalogForIndustry("Hardware").id, "hardware");
  assert.equal(starterCatalogForIndustry("retail").id, "general");
  assert.equal(starterCatalogForIndustry("services").id, "kirana");
  assert.equal(starterCatalogForIndustry("").id, "kirana");
});

test("items the shop already has are marked and skipped", () => {
  const kirana = STARTER_CATALOGS.find(c => c.id === "kirana");
  const sugarSku = starterItemSku(kirana, kirana.items.find(row => row.name === "Sugar"));
  const existing = [
    { name: "  biscuits ", sku: "MY-BISC" }, // same name, different SKU
    { name: "Sugar 1kg", sku: sugarSku }, // same SKU
  ];
  const view = starterCatalogView("kirana", existing);
  assert.equal(view.find(row => row.name === "Biscuits").owned, true);
  assert.equal(view.find(row => row.name === "Sugar").owned, true);
  assert.equal(view.find(row => row.name === "Eggs").owned, false);
  const plan = planItemImport(starterCatalogImportRows("kirana", [sugarSku]), existing);
  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.duplicates.length, 1, "same SKU is skipped by the normal import rule");
});

test("only the chosen items are imported, with zero prices and stock", () => {
  const kirana = STARTER_CATALOGS.find(c => c.id === "kirana");
  const picks = kirana.items.slice(0, 3).map(row => starterItemSku(kirana, row));
  const rows = starterCatalogImportRows("kirana", picks.map(sku => sku.toLowerCase()));
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.sellingPrice, "0");
    assert.equal(row.purchasePrice, "0");
    assert.equal(row.openingStock, "0");
    assert.equal(row.openingRate, "");
    assert.equal(row.itemType, "product");
    assert.ok(row.categoryName);
  }
  assert.deepEqual(starterCatalogImportRows("nope", picks), []);
});

test("the CSV template sample uses the current cement rate", () => {
  assert.match(ITEM_CSV_TEMPLATE, /Cement 50kg,[^\n]*,350,18,2523,/);
});

test("Import tab shows the picker and sends picks to the normal import preview", () => {
  const tab = readFileSync(new URL("../src/features/accounts/components/inventory/ItemImportTab.jsx", import.meta.url), "utf8");
  assert.match(tab, /<StarterCatalogPicker/);
  assert.match(tab, /onPrepare=\{rows => setImportPlan\(planItemImport\(rows, items\)\)\}/);
  const workspace = readFileSync(new URL("../src/features/accounts/components/AccInventoryWorkspace.jsx", import.meta.url), "utf8");
  assert.match(workspace, /items=\{items\}\s+industry=\{industry\}/);
  const section = readFileSync(new URL("../src/features/accounts/sections/InventorySection.jsx", import.meta.url), "utf8");
  assert.match(section, /onOpenItemProfit=\{onOpenItemProfit\}\s+industry=\{industry\}/);
});
