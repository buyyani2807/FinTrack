/**
 * Starter item catalogue — a ready list of common items per business type, with unit,
 * 4-digit HSN and GST rate filled in, so a new shop picks what it sells instead of typing
 * every item. Like the pre-loaded product library in other Indian billing apps.
 *
 * Items are generic (no brands, no prices): the shop adds its own prices and stock after
 * import. GST rates follow the GST 2.0 rates in force from 22 September 2025 (main slabs
 * 5% and 18%, 40% for aerated drinks). Rates can depend on packing, price band or exact
 * product, so the screen asks the owner to confirm with their CA.
 *
 * Imported rows use the same shape and flow as the CSV item import.
 */

import { skuFromName } from "../io/itemCsvImport.js";

export const STARTER_CATALOG_RATES_AS_OF = "2025-09-22";

const item = (name, unit, hsnSac, gstRate, category) => ({ name, unit, hsnSac, gstRate, category });

export const STARTER_CATALOGS = [
  {
    id: "kirana",
    label: "Kirana / grocery",
    skuPrefix: "KR",
    industries: ["kirana", "wholesale"],
    items: [
      item("Rice (loose)", "Kg", "1006", 0, "Staples"),
      item("Rice (pre-packed) 25 kg bag", "Bag", "1006", 5, "Staples"),
      item("Wheat atta (pre-packed) 10 kg", "Pack", "1101", 5, "Staples"),
      item("Toor dal (pre-packed) 1 kg", "Pack", "0713", 5, "Staples"),
      item("Moong dal (pre-packed) 1 kg", "Pack", "0713", 5, "Staples"),
      item("Chana dal (pre-packed) 1 kg", "Pack", "0713", 5, "Staples"),
      item("Poha (pre-packed) 500 g", "Pack", "1904", 5, "Staples"),
      item("Sugar", "Kg", "1701", 5, "Staples"),
      item("Iodised salt 1 kg", "Pack", "2501", 0, "Staples"),
      item("Sunflower oil 1 L", "Bottle", "1512", 5, "Edible oil"),
      item("Groundnut oil 1 L", "Bottle", "1508", 5, "Edible oil"),
      item("Ghee 500 ml", "Pack", "0405", 5, "Dairy"),
      item("Butter 100 g", "Pack", "0405", 5, "Dairy"),
      item("Milk (fresh) 500 ml", "Pack", "0401", 0, "Dairy"),
      item("UHT milk 1 L", "Pack", "0401", 0, "Dairy"),
      item("Paneer 200 g", "Pack", "0406", 0, "Dairy"),
      item("Eggs", "Dozen", "0407", 0, "Dairy"),
      item("Bread", "Pack", "1905", 0, "Bakery"),
      item("Tea powder 250 g", "Pack", "0902", 5, "Beverages"),
      item("Instant coffee 50 g", "Pack", "2101", 5, "Beverages"),
      item("Packaged drinking water 1 L", "Bottle", "2201", 5, "Beverages"),
      item("Aerated soft drink 750 ml", "Bottle", "2202", 40, "Beverages"),
      item("Fruit juice 1 L", "Pack", "2009", 5, "Beverages"),
      item("Biscuits", "Pack", "1905", 5, "Snacks"),
      item("Namkeen / bhujia 200 g", "Pack", "2106", 5, "Snacks"),
      item("Instant noodles", "Pack", "1902", 5, "Snacks"),
      item("Chocolate bar", "Piece", "1806", 5, "Snacks"),
      item("Tomato ketchup 500 g", "Bottle", "2103", 5, "Snacks"),
      item("Fruit jam 200 g", "Bottle", "2007", 5, "Snacks"),
      item("Cashew nuts 250 g", "Pack", "0801", 5, "Dry fruits"),
      item("Red chilli powder 200 g", "Pack", "0904", 5, "Spices"),
      item("Turmeric powder 200 g", "Pack", "0910", 5, "Spices"),
      item("Toilet soap bar", "Piece", "3401", 5, "Personal care"),
      item("Shampoo 180 ml", "Bottle", "3305", 5, "Personal care"),
      item("Hair oil 200 ml", "Bottle", "3305", 5, "Personal care"),
      item("Toothpaste 150 g", "Tube", "3306", 5, "Personal care"),
      item("Toothbrush", "Piece", "9603", 5, "Personal care"),
      item("Talcum powder 100 g", "Pack", "3304", 5, "Personal care"),
      item("Detergent powder 1 kg", "Pack", "3402", 18, "Household"),
      item("Agarbatti", "Pack", "3307", 5, "Household"),
      item("Safety matches", "Box", "3605", 5, "Household"),
      item("Candles", "Pack", "3406", 5, "Household"),
    ],
  },
  {
    id: "medical",
    label: "Medical / pharmacy",
    skuPrefix: "MD",
    industries: ["medical"],
    items: [
      item("Paracetamol tablets (strip)", "Pack", "3004", 5, "Medicines"),
      item("Cough syrup 100 ml", "Bottle", "3004", 5, "Medicines"),
      item("Antacid tablets (strip)", "Pack", "3004", 5, "Medicines"),
      item("ORS sachet", "Pack", "3004", 5, "Medicines"),
      item("Vitamin tablets (strip)", "Pack", "3004", 5, "Medicines"),
      item("Antiseptic liquid 100 ml", "Bottle", "3004", 5, "Medicines"),
      item("Ayurvedic tonic 200 ml", "Bottle", "3004", 5, "Medicines"),
      item("Crepe bandage", "Roll", "3005", 5, "First aid"),
      item("Gauze bandage", "Roll", "3005", 5, "First aid"),
      item("Absorbent cotton 100 g", "Pack", "3005", 5, "First aid"),
      item("Adhesive plaster strips", "Box", "3005", 5, "First aid"),
      item("Surgical gloves", "Pair", "4015", 5, "Surgical"),
      item("Disposable syringe 5 ml", "Piece", "9018", 5, "Surgical"),
      item("Face mask", "Piece", "6307", 5, "Surgical"),
      item("Digital thermometer", "Piece", "9025", 5, "Devices"),
      item("Glucometer", "Piece", "9027", 5, "Devices"),
      item("Glucose test strips", "Box", "3822", 5, "Devices"),
      item("Baby diapers", "Pack", "9619", 5, "Baby care"),
      item("Sanitary napkins", "Pack", "9619", 0, "Personal care"),
      item("Hand sanitizer 100 ml", "Bottle", "3808", 18, "Personal care"),
      item("Toothpaste 150 g", "Tube", "3306", 5, "Personal care"),
    ],
  },
  {
    id: "hardware",
    label: "Hardware / building material",
    skuPrefix: "HW",
    industries: ["hardware"],
    items: [
      item("Cement 50 kg", "Bag", "2523", 18, "Building material"),
      item("TMT steel bar", "Kg", "7214", 18, "Building material"),
      item("River sand", "Metric ton", "2505", 5, "Building material"),
      item("Plywood sheet 8x4", "Piece", "4412", 18, "Building material"),
      item("Ceramic floor tiles", "Box", "6907", 18, "Building material"),
      item("Wall putty 20 kg", "Bag", "3214", 18, "Paint"),
      item("Emulsion paint 4 L", "Can", "3209", 18, "Paint"),
      item("Enamel paint 1 L", "Can", "3208", 18, "Paint"),
      item("Paint brush", "Piece", "9603", 18, "Paint"),
      item("PVC pipe 1 inch", "Piece", "3917", 18, "Plumbing"),
      item("GI pipe 1 inch", "Piece", "7306", 18, "Plumbing"),
      item("Water tap", "Piece", "8481", 18, "Plumbing"),
      item("Washbasin", "Piece", "6910", 18, "Sanitary"),
      item("Electrical wire 1.5 sq mm (90 m)", "Roll", "8544", 18, "Electrical"),
      item("Modular switch", "Piece", "8536", 18, "Electrical"),
      item("Wire nails", "Kg", "7317", 18, "Fasteners"),
      item("Wood screws", "Box", "7318", 18, "Fasteners"),
      item("Padlock", "Piece", "8301", 18, "Fasteners"),
      item("Synthetic adhesive 1 kg", "Pack", "3506", 18, "Adhesives"),
    ],
  },
  {
    id: "general",
    label: "General store / stationery",
    skuPrefix: "GS",
    industries: ["retail"],
    items: [
      item("Exercise notebook", "Piece", "4820", 0, "Stationery"),
      item("Pencil", "Piece", "9609", 0, "Stationery"),
      item("Eraser", "Piece", "4016", 0, "Stationery"),
      item("Pencil sharpener", "Piece", "8214", 0, "Stationery"),
      item("Crayons", "Box", "9609", 0, "Stationery"),
      item("Geometry box", "Box", "9017", 5, "Stationery"),
      item("Umbrella", "Piece", "6601", 5, "Household"),
      item("Steel kitchen utensil", "Piece", "7323", 5, "Household"),
      item("Comb", "Piece", "9615", 5, "Household"),
      item("Toilet soap bar", "Piece", "3401", 5, "Personal care"),
      item("Toothpaste 150 g", "Tube", "3306", 5, "Personal care"),
      item("Footwear (up to ₹2,500)", "Pair", "6402", 5, "Footwear & apparel"),
      item("T-shirt (up to ₹2,500)", "Piece", "6109", 5, "Footwear & apparel"),
      item("Bicycle", "Piece", "8712", 5, "Other"),
      item("Mobile phone", "Piece", "8517", 18, "Electronics"),
      item("Mobile charger", "Piece", "8504", 18, "Electronics"),
      item("LED television", "Piece", "8528", 18, "Electronics"),
      item("Air conditioner", "Piece", "8415", 18, "Electronics"),
    ],
  },
];

/** Catalogue to open first for a company's business type (falls back to Kirana). */
export function starterCatalogForIndustry(industry = "") {
  const key = String(industry || "").toLowerCase();
  return STARTER_CATALOGS.find(catalog => catalog.industries.includes(key)) || STARTER_CATALOGS[0];
}

export function getStarterCatalog(id) {
  return STARTER_CATALOGS.find(catalog => catalog.id === id) || null;
}

/** Stable SKU for a catalogue item, e.g. KR-RICE-LOOSE. */
export function starterItemSku(catalog, catalogItem) {
  return `${catalog.skuPrefix}-${skuFromName(catalogItem.name)}`.slice(0, 32);
}

const normName = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Catalogue items with whether the shop already has them (same name or same SKU).
 * @returns {Array<{...item, sku, owned}>}
 */
export function starterCatalogView(catalogId, existingItems = []) {
  const catalog = getStarterCatalog(catalogId);
  if (!catalog) return [];
  const names = new Set((existingItems || []).map(row => normName(row.name)));
  const skus = new Set((existingItems || []).map(row => String(row.sku || "").trim().toUpperCase()));
  return catalog.items.map(row => {
    const sku = starterItemSku(catalog, row);
    return { ...row, sku, owned: names.has(normName(row.name)) || skus.has(sku) };
  });
}

/**
 * Import rows (same shape as parseItemCsv) for the chosen catalogue items.
 * Prices and stock start at zero; the owner fills them in after import.
 */
export function starterCatalogImportRows(catalogId, skus = []) {
  const catalog = getStarterCatalog(catalogId);
  if (!catalog) return [];
  const wanted = new Set((skus || []).map(sku => String(sku).toUpperCase()));
  return catalog.items
    .map(row => ({ row, sku: starterItemSku(catalog, row) }))
    .filter(({ sku }) => wanted.has(sku))
    .map(({ row, sku }, index) => ({
      rowNumber: index + 1,
      itemType: "product",
      name: row.name,
      sku,
      barcode: "",
      brand: "",
      batchNo: "",
      expiryDate: "",
      unit: row.unit,
      categoryName: row.category,
      sellingPrice: "0",
      purchasePrice: "0",
      gstRate: String(row.gstRate),
      hsnSac: row.hsnSac,
      openingStock: "0",
      openingRate: "",
      openingStockDate: "",
      reorderLevel: "0",
      description: "",
      isActive: true,
    }));
}
