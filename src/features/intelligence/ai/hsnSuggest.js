/**
 * A suggestion for HSN/SAC and GST rate from an item name. The owner confirms it before it is saved.
 * This is not a classification ruling and it does not change a record by itself.
 * Rates follow the common slabs, including 5%, 18% and 40%.
 */
const CATALOG = [
  { phrases: ["copper wire", "copper cable"], hsn: "7408", rate: 18, label: "Copper wire" },
  { phrases: ["electrical wire", "house wire", "insulated wire", "cable"], hsn: "8544", rate: 18, label: "Insulated wire and cable" },
  { phrases: ["switch", "socket", "mcb"], hsn: "8536", rate: 18, label: "Switches and sockets" },
  { phrases: ["led bulb", "led light", "bulb"], hsn: "8539", rate: 18, label: "Lamps and bulbs" },
  { phrases: ["cement"], hsn: "2523", rate: 18, label: "Cement" },
  { phrases: ["tmt", "steel bar", "iron rod"], hsn: "7214", rate: 18, label: "Iron or steel bars" },
  { phrases: ["paint", "primer", "emulsion"], hsn: "3208", rate: 18, label: "Paint" },
  { phrases: ["plywood", "ply wood"], hsn: "4412", rate: 18, label: "Plywood" },
  { phrases: ["ceramic tile", "vitrified", "floor tile", "wall tile"], hsn: "6907", rate: 18, label: "Ceramic tiles" },
  { phrases: ["writing paper", "copier paper", "a4 paper", "paper"], hsn: "4802", rate: 18, label: "Uncoated paper" },
  { phrases: ["notebook", "register book"], hsn: "4820", rate: 5, label: "Notebooks" },
  { phrases: ["rice"], hsn: "1006", rate: 5, label: "Rice" },
  { phrases: ["wheat flour", "atta", "maida"], hsn: "1101", rate: 5, label: "Wheat flour" },
  { phrases: ["sugar"], hsn: "1701", rate: 5, label: "Sugar" },
  { phrases: ["edible oil", "sunflower oil", "groundnut oil", "palm oil"], hsn: "1512", rate: 5, label: "Edible oil" },
  { phrases: ["tea"], hsn: "0902", rate: 5, label: "Tea" },
  { phrases: ["medicine", "tablet", "capsule"], hsn: "3004", rate: 5, label: "Medicines" },
  { phrases: ["soap"], hsn: "3401", rate: 18, label: "Soap" },
  { phrases: ["detergent", "washing powder"], hsn: "3402", rate: 18, label: "Detergent" },
  { phrases: ["laptop", "computer"], hsn: "8471", rate: 18, label: "Computers" },
  { phrases: ["mobile phone", "smartphone", "phone"], hsn: "8517", rate: 18, label: "Phones" },
  { phrases: ["furniture", "chair", "table", "almirah"], hsn: "9403", rate: 18, label: "Furniture" },
  { phrases: ["shirt", "garment", "t-shirt", "tshirt"], hsn: "6109", rate: 5, label: "Garments" },
  { phrases: ["gold jewellery", "gold jewelry", "gold chain", "gold ring"], hsn: "7113", rate: 3, label: "Gold jewellery" },
  { phrases: ["cold drink", "soft drink", "aerated water", "carbonated"], hsn: "2202", rate: 40, label: "Aerated water" },
  { phrases: ["shop rent", "office rent", "rent"], hsn: "997212", rate: 18, label: "Rent of property" },
  { phrases: ["consulting", "professional fee", "professional fees"], hsn: "9983", rate: 18, label: "Professional services" },
  { phrases: ["restaurant", "food service"], hsn: "996331", rate: 5, label: "Restaurant service" },
];

export const HSN_SUGGESTION_NOTE = "Suggested from the item name. It is saved only when you use it and then save. This is not a tax classification.";

const words = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function suggestHsn(name) {
  const text = words(name);
  if (text.length < 3) return null;
  const padded = ` ${text} `;
  const hit = CATALOG.find(row => row.phrases.some(phrase => padded.includes(` ${phrase} `)));
  if (!hit) return null;
  return { hsn: hit.hsn, rate: hit.rate, label: hit.label, note: HSN_SUGGESTION_NOTE };
}
