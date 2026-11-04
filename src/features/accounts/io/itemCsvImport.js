import { parseDelimitedText } from "./bankStatementImport.js";
import { readImportFile } from "../model/importReaders.js";
import { ITEM_UNITS, validateItemForm } from "../model/inventoryModel.js";

export const ITEM_CSV_TEMPLATE = [
  "Name,SKU,Barcode,Brand,Batch,Expiry,Type,Unit,Category,Selling price,Purchase price,GST %,HSN/SAC,Opening stock,Opening rate,Opening date,Reorder level",
  "Cement 50kg,CEM-50,8901234567890,UltraTech,B1,,product,Bag,Construction,420,350,28,2523,100,340,2026-04-01,20",
  "Delivery charge,DLV,,,,,service,Nos,,150,0,18,9965,,,,",
].join("\n");

const headerKey = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const numberText = value => String(value || "").replace(/[₹,\s]/g, "");

const unitFor = raw => {
  const text = String(raw || "").trim();
  if (!text) return "Nos";
  const aliases = {
    kg: "Kg",
    kgs: "Kg",
    kilogram: "Kg",
    kilograms: "Kg",
    g: "Gram",
    gm: "Gram",
    gms: "Gram",
    gram: "Gram",
    grams: "Gram",
    l: "Litre",
    lt: "Litre",
    ltr: "Litre",
    litre: "Litre",
    liter: "Litre",
    ml: "Millilitre",
    nos: "Nos",
    pcs: "Piece",
    pc: "Piece",
    piece: "Piece",
    pkt: "Pack",
    pack: "Pack",
    packet: "Pack",
  };
  const key = text.toLowerCase();
  if (aliases[key]) return aliases[key];
  return ITEM_UNITS.find(unit => unit.toLowerCase() === key) || text;
};

const isoDate = raw => {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
};

/** Build a short SKU when the export has a name but no code (common in some POS dumps). */
export function skuFromName(name = "") {
  const slug = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "ITEM";
}

function sheetToDelimited(rows = []) {
  if (!rows.length) return { headers: [], rows: [] };
  const headers = (rows[0] || []).map(cell => String(cell ?? "").trim());
  const body = rows.slice(1).map(row => headers.map((_, index) => String(row[index] ?? "").trim()));
  return { headers, rows: body.filter(row => row.some(Boolean)) };
}

function parseItemCsvRows(headers, rows) {
  if (!headers?.length) return [];
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
    name: column([
      "name", "itemname", "menuname", "productname", "item", "product",
      "checkname", "displayname", "description",
    ]),
    sku: column([
      "sku", "code", "itemcode", "itemid", "productcode", "productid",
      "id", "plu", "article", "articleno", "articlenumber",
    ]),
    barcode: column(["barcode", "ean", "upc", "barcodeid", "barcodeno", "barcodes"]),
    brand: column(["brand", "make", "manufacturer", "company"]),
    batchNo: column(["batch", "batchno", "lot", "lotno"]),
    expiryDate: column(["expiry", "expirydate", "exp", "expdate"]),
    itemType: column(["type", "itemtype", "producttype"]),
    unit: column(["unit", "uom", "uomname", "measure", "qtyunit"]),
    category: column([
      "category", "group", "itemgroup", "reportgroup", "subgroup",
      "inventorysubgroup", "department", "section",
    ]),
    sellingPrice: column([
      "sellingprice", "saleprice", "salesprice", "mrp", "selling", "price",
      "rate", "salerate", "retailprice", "rsp",
    ]),
    purchasePrice: column([
      "purchaseprice", "costprice", "purchase", "cost", "buyprice",
      "purchaserate", "landingcost", "companyprice",
    ]),
    gstRate: column(["gst", "gstrate", "tax", "taxrate", "taxpercent", "vat"]),
    hsnSac: column(["hsnsac", "hsn", "sac", "hsncode", "hsnno"]),
    openingStock: column([
      "openingstock", "openingqty", "opening", "stock", "qty", "quantity",
      "availablequantity", "closingstock", "onhand", "stockqty", "currentstock",
    ]),
    openingRate: column(["openingrate", "openingcost", "avgcost", "averagecost"]),
    openingStockDate: column(["openingdate", "asondate", "stockdate"]),
    reorderLevel: column(["reorderlevel", "reorder", "minstock", "parlevel", "par"]),
  };
  if (positions.openingStock === positions.openingRate || positions.openingStock === positions.openingStockDate) {
    positions.openingStock = keys.findIndex(key => (
      key === "openingstock" || key === "openingqty" || key === "stock" || key === "closingstock"
      || key === "availablequantity" || key === "currentstock"
    ));
  }
  // Prefer a dedicated name column over a generic "description" hit when both exist.
  if (positions.name >= 0 && headerKey(headers[positions.name]).includes("description")) {
    const better = column(["name", "itemname", "menuname", "productname", "item", "product", "checkname"]);
    if (better >= 0) positions.name = better;
  }
  const at = (row, field) => (positions[field] >= 0 ? String(row[positions[field]] ?? "").trim() : "");
  return rows.map((row, index) => {
    const type = at(row, "itemType").toLowerCase();
    const name = at(row, "name");
    const barcode = at(row, "barcode");
    const skuRaw = at(row, "sku") || barcode || (name ? skuFromName(name) : "");
    return {
      rowNumber: index + 2,
      itemType: type.startsWith("serv") ? "service" : "product",
      name,
      sku: String(skuRaw || "").toUpperCase(),
      barcode,
      brand: at(row, "brand"),
      batchNo: at(row, "batchNo"),
      expiryDate: isoDate(at(row, "expiryDate")),
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
 * Parse an items CSV/TSV from FinTrack template or another POS export (Focus, Vyapar, etc.).
 * Headers are matched loosely — e.g. "Item Name", "Menu Name", "Item Code", "Sale Rate".
 */
export function parseItemCsv(text) {
  const { headers, rows } = parseDelimitedText(text);
  return parseItemCsvRows(headers, rows);
}

/** CSV, TSV, TXT, or Excel (.xlsx) item master from FinTrack or another POS. */
export async function parseItemImportFile(file) {
  const name = String(file?.name || "file");
  if (/\.csv$/i.test(name) || /\.tsv$/i.test(name) || /\.txt$/i.test(name)) {
    return parseItemCsv(await file.text());
  }
  const read = await readImportFile(file);
  if (read.kind !== "sheets" || !read.sheets?.length) {
    throw new Error("Upload a CSV or Excel (.xlsx) list of items from your POS.");
  }
  const { headers, rows } = sheetToDelimited(read.sheets[0].rows || []);
  return parseItemCsvRows(headers, rows);
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
