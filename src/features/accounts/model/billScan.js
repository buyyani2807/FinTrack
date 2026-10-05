import { addDaysIso, roundMoney } from "./accountingModel.js";
import { emptyItemLine } from "./inventoryModel.js";

const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40];

const clip = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

const normName = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const gstinOf = value => {
  const text = String(value || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(text) ? text : "";
};

function parseDate(value) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  const parts = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : dmy
      ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])]
      : null;
  if (!parts) return "";
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function snapGst(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return "0";
  const nearest = GST_RATES.reduce((best, item) => (Math.abs(item - rate) < Math.abs(best - rate) ? item : best));
  return String(Math.abs(nearest - rate) <= 0.5 ? nearest : roundMoney(rate));
}

function positive(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeLine(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const name = clip(source.name || source.itemName || source.description, 160);
  const quantity = positive(source.quantity ?? source.qty, 1);
  let rate = Number(source.rate ?? source.price);
  const amount = Number(source.amount ?? source.taxable);
  if (!(Number.isFinite(rate) && rate >= 0) && Number.isFinite(amount) && amount >= 0 && quantity > 0) {
    rate = roundMoney(amount / quantity);
  }
  if (!Number.isFinite(rate) || rate < 0) rate = 0;
  return {
    name,
    quantity,
    rate: roundMoney(rate),
    gstRate: snapGst(source.gstRate ?? source.gst_rate ?? source.gst),
    hsn: clip(source.hsn || source.hsnSac, 12),
  };
}

export function normalizeBillScan(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const lines = (Array.isArray(source.lines) ? source.lines : [])
    .map(normalizeLine)
    .filter(line => line.name)
    .slice(0, 40);
  return {
    supplierName: clip(source.supplierName || source.supplier_name || source.supplier, 120),
    supplierGstin: gstinOf(source.supplierGstin || source.supplier_gstin || source.gstin),
    billNumber: clip(source.billNumber || source.bill_number || source.invoiceNumber, 40),
    billDate: parseDate(source.billDate || source.bill_date || source.date),
    paid: source.paid === true || String(source.paymentStatus || source.payment_status || "").toLowerCase() === "paid",
    lines,
  };
}

function oneMatch(rows) {
  return rows.length === 1 ? rows[0] : null;
}

function matchSupplier(bill, parties) {
  const suppliers = (parties || []).filter(party => party.partyType === "supplier" && party.isActive !== false);
  if (bill.supplierGstin) {
    const byGstin = suppliers.filter(party => gstinOf(party.gstin) === bill.supplierGstin);
    if (byGstin.length === 1) return byGstin[0];
  }
  const name = normName(bill.supplierName);
  if (name.length < 3) return null;
  const exact = suppliers.filter(party => normName(party.name) === name);
  if (exact.length === 1) return exact[0];
  if (name.length < 4) return null;
  return oneMatch(suppliers.filter(party => {
    const partyName = normName(party.name);
    return partyName.includes(name) || name.includes(partyName);
  }));
}

function matchItem(name, items) {
  const wanted = normName(name);
  if (wanted.length < 2) return null;
  const active = (items || []).filter(item => item.isActive !== false);
  const exact = active.filter(item => normName(item.name) === wanted || normName(item.sku) === wanted);
  if (exact.length === 1) return exact[0];
  if (wanted.length < 4) return null;
  return oneMatch(active.filter(item => {
    const itemName = normName(item.name);
    return itemName.length >= 4 && (itemName.includes(wanted) || wanted.includes(itemName));
  }));
}

function itemLineFromBill(line, items) {
  const item = matchItem(line.name, items);
  return {
    ...emptyItemLine(),
    itemId: item?.id || "",
    itemName: item?.name || line.name,
    itemSku: item?.sku || "",
    itemType: item?.itemType || "product",
    unit: item?.unit || "Nos",
    quantity: String(line.quantity),
    rate: line.rate ? String(line.rate) : "",
    gstRate: item?.gstRate != null && item.gstRate !== "" ? String(item.gstRate) : line.gstRate,
    hsnSac: item?.hsnSac || line.hsn,
    rateTouched: true,
  };
}

/** Map a read bill onto the purchase form. The caller still has to save. */
export function purchaseFormFromBill(scan, { parties = [], items = [], form = {}, today = "" } = {}) {
  const bill = normalizeBillScan(scan);
  const warnings = [];
  const party = matchSupplier(bill, parties);
  if (bill.supplierName && !party) warnings.push(`No supplier matches ${bill.supplierName}. Select the supplier before saving.`);
  let date = bill.billDate || form.date || today;
  if (bill.billDate && today && bill.billDate > today) {
    date = today;
    warnings.push("The bill date is after today, so the draft uses today.");
  }
  const itemLines = bill.lines.map(line => itemLineFromBill(line, items));
  const unmatched = itemLines.filter(line => !line.itemId).map(line => line.itemName);
  if (!itemLines.length) warnings.push("No item lines could be read. Add them before saving.");
  else if (unmatched.length) warnings.push(`Select a catalogue item for ${unmatched.join(", ")}.`);
  const narration = [
    bill.billNumber ? `Bill ${bill.billNumber}` : "",
    !party && bill.supplierName ? bill.supplierName : "",
  ].filter(Boolean).join(" · ");
  return {
    form: {
      date,
      partyId: party?.id || "",
      settlement: bill.paid ? "paid" : "credit",
      entryMode: "items",
      dueDate: addDaysIso(date, party?.creditDays ?? 7),
      narration,
      ...(itemLines.length ? { itemLines } : {}),
    },
    warnings,
  };
}
