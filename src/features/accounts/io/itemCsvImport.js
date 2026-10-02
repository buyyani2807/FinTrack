import { parseDelimitedText } from "./bankStatementImport.js";
import { ITEM_UNITS, validateItemForm } from "../model/inventoryModel.js";

export const ITEM_CSV_TEMPLATE = [
  "Name,SKU,Type,Unit,Category,Selling price,Purchase price,GST %,HSN/SAC,Opening stock,Opening rate,Opening date,Reorder level",
  "Cement 50kg,CEM-50,product,Bag,Construction,420,350,28,2523,100,340,2026-04-01,20",
  "Delivery charge,DLV,service,Nos,,150,0,18,9965,,,,",
].join("\n");

const headerKey = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const numberText = value => String(value || "").replace(/[₹,\s]/g, "");

const unitFor = raw => {
  const text = String(raw || "").trim();
  if (!text) return "Nos";
  return ITEM_UNITS.find(unit => unit.toLowerCase() === text.toLowerCase()) || text;
};

const isoDate = raw => {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
};

export function parseItemCsv(text) {
  const { headers, rows } = parseDelimitedText(text);
  if (!headers.length) return [];
  const keys = headers.map(headerKey);
  const column = names => {
    for (const name of names) {
      const exact = keys.indexOf(name);
      if (exact >= 0) return exact;
    }
    for (const name of names) {
      const partial = keys.findIndex(key => key.includes(name));
      if (partial >= 0) return partial;
    }
    return -1;
  };
  const positions = {
    name: column(["name", "itemname", "item"]),
    sku: column(["sku", "code", "itemcode"]),
    itemType: column(["type", "itemtype"]),
    unit: column(["unit", "uom"]),
    category: column(["category", "group"]),
    sellingPrice: column(["sellingprice", "saleprice", "mrp", "selling"]),
    purchasePrice: column(["purchaseprice", "costprice", "purchase", "cost"]),
    gstRate: column(["gst", "gstrate", "tax"]),
    hsnSac: column(["hsnsac", "hsn", "sac"]),
    openingStock: column(["openingstock", "openingqty", "opening"]),
    openingRate: column(["openingrate", "openingcost"]),
    openingStockDate: column(["openingdate", "asondate"]),
    reorderLevel: column(["reorderlevel", "reorder", "minstock"]),
  };
  if (positions.openingStock === positions.openingRate || positions.openingStock === positions.openingStockDate) {
    positions.openingStock = keys.findIndex(key => key === "openingstock" || key === "openingqty");
  }
  const at = (row, field) => (positions[field] >= 0 ? String(row[positions[field]] ?? "").trim() : "");
  return rows.map((row, index) => {
    const type = at(row, "itemType").toLowerCase();
    return {
      rowNumber: index + 2,
      itemType: type.startsWith("serv") ? "service" : "product",
      name: at(row, "name"),
      sku: at(row, "sku").toUpperCase(),
      unit: unitFor(at(row, "unit")),
      categoryName: at(row, "category"),
      sellingPrice: numberText(at(row, "sellingPrice")) || "0",
      purchasePrice: numberText(at(row, "purchasePrice")) || "0",
      gstRate: numberText(at(row, "gstRate")).replace("%", "") || "0",
      hsnSac: at(row, "hsnSac"),
      openingStock: numberText(at(row, "openingStock")) || "0",
      openingRate: numberText(at(row, "openingRate")),
      openingStockDate: isoDate(at(row, "openingStockDate")),
      reorderLevel: numberText(at(row, "reorderLevel")) || "0",
      description: "",
      isActive: true,
    };
  }).filter(row => row.name || row.sku);
}

/**
 * Split parsed rows into items to create, SKUs that already exist (in the books or earlier
 * in the file) and rows that fail the same validation as the item form.
 */
export function planItemImport(rows = [], existingItems = []) {
  const seen = new Set((existingItems || []).map(item => String(item.sku || "").trim().toUpperCase()));
  const toCreate = [];
  const duplicates = [];
  const invalid = [];
  for (const row of rows) {
    const message = validateItemForm(row);
    if (message) {
      invalid.push({ ...row, error: message });
      continue;
    }
    const sku = row.sku.trim().toUpperCase();
    if (seen.has(sku)) {
      duplicates.push(row);
      continue;
    }
    seen.add(sku);
    toCreate.push(row);
  }
  return { toCreate, duplicates, invalid };
}
