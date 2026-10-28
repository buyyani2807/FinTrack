import { parseDelimitedText } from "./bankStatementImport.js";
import { readImportFile } from "../model/importReaders.js";
import { emptyItemLine, itemizedEntryDraft } from "../model/inventoryModel.js";
import { gstStateFromGstin, isIntraGst } from "../model/accountingGst.js";
import { roundMoney, simpleEntryDraft } from "../model/accountingModel.js";
import { stableUuid } from "../model/migrationAssistant.js";

export const VOUCHER_CSV_TEMPLATE = [
  "Type,Date,Party,GSTIN,Invoice number,Amount,Item,Qty,Rate,GST %,HSN,Narration",
  "sale,2026-09-01,Acme Traders,,INV-1001,10000,,,,,,Credit sale taxable amount",
  "purchase,2026-09-02,Steel Depot,29AAAAA0000A1Z5,BILL-55,5000,,,,,,Amount-only purchase",
  "purchase,2026-09-03,Steel Depot,29AAAAA0000A1Z5,BILL-56,,Cement 50kg,10,500,18,2523,",
  "purchase,2026-09-03,Steel Depot,29AAAAA0000A1Z5,BILL-56,,Sand,5,200,5,2505,",
].join("\n");

const headerKey = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const numberText = value => String(value || "").replace(/[₹,\s]/g, "");
const normName = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const isoDate = raw => {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dmy = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const ms = Math.round((serial - 25569) * 86400000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return "";
};

const parseType = raw => {
  const text = String(raw || "").toLowerCase().trim();
  if (/^purch|bill|buy/.test(text)) return "purchase";
  if (/^sale|sales|invoice|inv\b/.test(text)) return "sale";
  return "";
};

function sheetToDelimited(rows = []) {
  if (!rows.length) return { headers: [], rows: [] };
  const headers = (rows[0] || []).map(cell => String(cell ?? "").trim());
  const body = rows.slice(1).map(row => headers.map((_, index) => String(row[index] ?? "").trim()));
  return { headers, rows: body.filter(row => row.some(Boolean)) };
}

function columnMap(headers) {
  const keys = headers.map(headerKey);
  const used = new Set();
  const column = (names, { partial = true } = {}) => {
    for (const name of names) {
      const exact = keys.findIndex((key, index) => key === name && !used.has(index));
      if (exact >= 0) {
        used.add(exact);
        return exact;
      }
    }
    if (!partial) return -1;
    for (const name of names) {
      const soft = keys.findIndex((key, index) => !used.has(index) && key.includes(name));
      if (soft >= 0) {
        used.add(soft);
        return soft;
      }
    }
    return -1;
  };
  return {
    type: column(["type", "vouchertype", "entrytype"]),
    date: column(["date", "invoicedate", "billdate", "voucherdate"]),
    party: column(["party", "partyname", "customer", "supplier", "name"]),
    gstin: column(["gstin", "gstno"]),
    invoiceNumber: column(["invoicenumber", "invoiceno", "billnumber", "billno", "reference", "ref"]),
    amount: column(["amount", "taxable", "taxableamount", "total", "value"]),
    item: column(["item", "itemname", "product"]),
    qty: column(["qty", "quantity", "qtynos"]),
    rate: column(["rate", "price", "unitprice"]),
    gstRate: column(["gstpercent", "gstrate", "taxrate", "gst"], { partial: false }),
    hsn: column(["hsn", "hsnsac", "sac"]),
    narration: column(["narration", "notes", "note", "remarks"]),
  };
}

function at(row, positions, field) {
  return positions[field] >= 0 ? String(row[positions[field]] ?? "").trim() : "";
}

export function parseVoucherCsvRows(headers, bodyRows) {
  if (!headers.length) return [];
  const positions = columnMap(headers);
  if (positions.type < 0 || positions.date < 0 || positions.party < 0) {
    throw new Error("The file needs Type, Date and Party columns (first row = headers). Download the template and try again.");
  }
  return bodyRows.map((row, index) => {
    const amountRaw = numberText(at(row, positions, "amount"));
    const qtyRaw = numberText(at(row, positions, "qty"));
    const rateRaw = numberText(at(row, positions, "rate"));
    const gstRaw = numberText(at(row, positions, "gstRate")).replace("%", "");
    return {
      rowNumber: index + 2,
      type: parseType(at(row, positions, "type")),
      date: isoDate(at(row, positions, "date")),
      partyName: at(row, positions, "party"),
      gstin: at(row, positions, "gstin").toUpperCase().replace(/[^0-9A-Z]/g, ""),
      invoiceNumber: at(row, positions, "invoiceNumber"),
      amount: amountRaw && Number.isFinite(Number(amountRaw)) ? roundMoney(Number(amountRaw)) : null,
      itemName: at(row, positions, "item"),
      quantity: qtyRaw && Number.isFinite(Number(qtyRaw)) ? Number(qtyRaw) : null,
      rate: rateRaw && Number.isFinite(Number(rateRaw)) ? roundMoney(Number(rateRaw)) : null,
      gstRate: gstRaw && Number.isFinite(Number(gstRaw)) ? String(Number(gstRaw)) : "",
      hsn: at(row, positions, "hsn"),
      narration: at(row, positions, "narration"),
    };
  }).filter(row => row.partyName || row.invoiceNumber || row.amount != null || row.itemName);
}

export async function parseVoucherImportFile(file) {
  const name = String(file?.name || "file");
  if (/\.csv$/i.test(name) || /\.tsv$/i.test(name) || /\.txt$/i.test(name)) {
    const text = await file.text();
    const { headers, rows } = parseDelimitedText(text);
    return parseVoucherCsvRows(headers, rows);
  }
  const read = await readImportFile(file);
  if (read.kind !== "sheets" || !read.sheets?.length) {
    throw new Error("Upload a CSV or Excel (.xlsx) sheet of sales and purchases.");
  }
  const { headers, rows } = sheetToDelimited(read.sheets[0].rows || []);
  return parseVoucherCsvRows(headers, rows);
}

function groupRows(rows) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const key = [
      row.type || "?",
      row.date || "",
      normName(row.partyName),
      String(row.invoiceNumber || "").toLowerCase() || `row-${row.rowNumber || index}`,
    ].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.values()];
}

function matchParty(rows, parties, kind) {
  const wantedType = kind === "purchase" ? "supplier" : "customer";
  const list = (parties || []).filter(party => party.partyType === wantedType && party.isActive !== false);
  const gstin = rows.map(row => row.gstin).find(Boolean) || "";
  if (gstin) {
    const byGstin = list.filter(party => String(party.gstin || "").toUpperCase().replace(/[^0-9A-Z]/g, "") === gstin);
    if (byGstin.length === 1) return byGstin[0];
  }
  const name = normName(rows[0]?.partyName);
  if (!name) return null;
  const exact = list.filter(party => normName(party.name) === name);
  if (exact.length === 1) return exact[0];
  if (name.length < 3) return null;
  const soft = list.filter(party => {
    const partyName = normName(party.name);
    return partyName.includes(name) || name.includes(partyName);
  });
  return soft.length === 1 ? soft[0] : null;
}

function matchItem(name, items) {
  const wanted = normName(name);
  if (wanted.length < 2) return null;
  const active = (items || []).filter(item => item.isActive !== false);
  const exact = active.filter(item => normName(item.name) === wanted || normName(item.sku) === wanted);
  if (exact.length === 1) return exact[0];
  if (wanted.length < 4) return null;
  const soft = active.filter(item => {
    const itemName = normName(item.name);
    return itemName.length >= 4 && (itemName.includes(wanted) || wanted.includes(itemName));
  });
  return soft.length === 1 ? soft[0] : null;
}

function findDuplicateVoucher({ kind, partyId, date, invoiceNumber, amount, vouchers }) {
  const type = kind === "purchase" ? "purchase" : "sales";
  const needle = String(invoiceNumber || "").trim().toLowerCase();
  const candidates = (vouchers || []).filter(voucher => {
    if (voucher.status && voucher.status !== "posted") return false;
    if (voucher.voucherType !== type) return false;
    if (partyId && voucher.partyId && voucher.partyId !== partyId) return false;
    if (date && voucher.date && voucher.date !== date) return false;
    return true;
  });
  if (needle) {
    const hit = candidates.find(voucher => String(voucher.narration || "").toLowerCase().includes(needle));
    if (hit) return hit;
  }
  if (amount != null && partyId && date) {
    return candidates.find(voucher => {
      const debit = roundMoney(Number(voucher.totalDebit ?? voucher.amount ?? 0));
      return Math.abs(debit - roundMoney(amount)) < 0.05;
    }) || null;
  }
  return null;
}

function invoiceNarration(rows, invoiceNumber) {
  const base = rows.map(row => row.narration).find(Boolean) || "";
  const inv = invoiceNumber ? `Invoice ${invoiceNumber}` : "";
  return [inv, base].filter(Boolean).join(" · ").slice(0, 500);
}

function taxableAmount(rows) {
  const hasItems = rows.some(row => row.itemName);
  const headerAmount = rows.map(row => row.amount).find(value => value != null && value > 0);
  if (headerAmount != null && !hasItems) return headerAmount;
  const lineSum = roundMoney(rows.reduce((sum, row) => {
    if (!row.itemName) return sum;
    if (row.quantity != null && row.rate != null) return sum + roundMoney(row.quantity * row.rate);
    if (row.amount != null) return sum + row.amount;
    return sum;
  }, 0));
  if (lineSum > 0) return lineSum;
  return headerAmount;
}

/** Build a voucher draft from a planned entry once partyId is known. */
export function buildVoucherDraftFromEntry(entry, { accounts, company, today = "" } = {}) {
  const gstOn = company?.gstRegistration === "regular";
  const partyState = entry.partyState || "";
  const intra = isIntraGst(company?.stateCode, partyState);
  const narration = entry.narration || "";
  if (entry.mode === "items") {
    return itemizedEntryDraft({
      kind: entry.kind,
      accounts,
      date: entry.date,
      partyId: entry.partyId || null,
      settlement: "credit",
      narration,
      itemLines: entry.itemLines,
      intra,
      taxInclusive: false,
      gstEnabled: gstOn,
      today,
    });
  }
  const gstRate = Number(entry.gstRate || 0);
  return simpleEntryDraft({
    kind: entry.kind,
    accounts,
    date: entry.date,
    amount: entry.amount,
    partyId: entry.partyId || null,
    settlement: "credit",
    narration,
    today,
    gst: gstOn && gstRate > 0 ? {
      enabled: true,
      rate: gstRate,
      intra,
      taxInclusive: false,
      hsnSac: entry.hsn || "",
      itcEligible: entry.kind === "purchase",
    } : gstOn ? { enabled: false, rate: 0, intra, taxInclusive: false } : undefined,
  });
}

/**
 * Build a reviewable import plan for sales and purchases.
 * createMissingParties queues new party refs; the runner creates them when posting.
 */
export function planVoucherImport(rawRows = [], {
  parties = [],
  items = [],
  vouchers = [],
  company = null,
  today = "",
  createMissingParties = true,
  companyId = "",
} = {}) {
  const groups = groupRows(rawRows);
  const newParties = [];
  const partyRefByKey = new Map();
  const entries = [];

  groups.forEach((rows, index) => {
    const errors = [];
    const warnings = [];
    const kind = rows[0]?.type || "";
    if (kind !== "sale" && kind !== "purchase") errors.push("Type must be sale or purchase.");
    const date = rows.map(row => row.date).find(Boolean) || "";
    if (!date) errors.push("Date is required (YYYY-MM-DD).");
    if (today && date && date > today) errors.push("Date cannot be after today.");
    const partyName = rows[0]?.partyName || "";
    if (!partyName) errors.push("Party name is required.");
    const invoiceNumber = rows.map(row => row.invoiceNumber).find(Boolean) || "";
    const gstin = rows.map(row => row.gstin).find(Boolean) || "";
    const amount = taxableAmount(rows);
    if (!(amount > 0)) errors.push("Enter an Amount, or Item with Qty and Rate.");

    let party = kind ? matchParty(rows, parties, kind) : null;
    let partyRef = "";
    if (!party && partyName && createMissingParties && (kind === "sale" || kind === "purchase")) {
      const key = `${kind === "purchase" ? "supplier" : "customer"}|${normName(partyName)}|${gstin}`;
      if (partyRefByKey.has(key)) partyRef = partyRefByKey.get(key);
      else {
        partyRef = `BP${newParties.length + 1}`;
        partyRefByKey.set(key, partyRef);
        newParties.push({
          ref: partyRef,
          partyType: kind === "purchase" ? "supplier" : "customer",
          name: partyName.slice(0, 120),
          gstin: gstin || "",
          stateCode: gstStateFromGstin(gstin) || "",
          gstRegistration: gstin ? "regular" : "",
        });
      }
      warnings.push(`Will create ${kind === "purchase" ? "supplier" : "customer"} “${partyName}”.`);
    } else if (!party && partyName) {
      errors.push(`No ${kind === "purchase" ? "supplier" : "customer"} matches “${partyName}”.`);
    }

    const itemRows = rows.filter(row => row.itemName);
    const mappedLines = itemRows.map(row => {
      const item = matchItem(row.itemName, items);
      const qty = row.quantity != null ? row.quantity : 1;
      const rate = row.rate != null ? row.rate : (row.amount != null && qty ? roundMoney(row.amount / qty) : 0);
      return {
        ...emptyItemLine(),
        itemId: item?.id || "",
        itemName: item?.name || row.itemName,
        itemSku: item?.sku || "",
        itemType: item?.itemType || "product",
        unit: item?.unit || "Nos",
        quantity: Math.max(1, Math.round(Number(qty) || 1)),
        rate: String(rate || 0),
        gstRate: row.gstRate || (item?.gstRate != null ? String(item.gstRate) : "0"),
        hsnSac: row.hsn || item?.hsnSac || "",
        rateTouched: true,
        matched: Boolean(item),
      };
    });
    const allMatched = mappedLines.length > 0 && mappedLines.every(line => line.matched);
    const mode = allMatched ? "items" : "amount";
    if (mappedLines.length && !allMatched) {
      warnings.push("Some items are not in the catalogue — posting as amount-only.");
    }

    const gstRate = mappedLines.map(line => Number(line.gstRate)).find(rate => rate > 0)
      || Number(rows.map(row => row.gstRate).find(Boolean) || 0)
      || 0;
    const hsn = rows.map(row => row.hsn).find(Boolean) || "";
    const partyState = party?.stateCode || gstStateFromGstin(party?.gstin || gstin) || "";

    const duplicate = findDuplicateVoucher({
      kind,
      partyId: party?.id || "",
      date,
      invoiceNumber,
      amount,
      vouchers,
    });
    if (duplicate) {
      warnings.push(`Possible duplicate of ${duplicate.voucherNumber || "a posted voucher"} on ${duplicate.date || date}.`);
    }

    const status = errors.length ? "error" : (warnings.length ? "warning" : "ready");
    const label = `${kind === "purchase" ? "Purchase" : kind === "sale" ? "Sale" : "Entry"} ${invoiceNumber || date || `#${index + 1}`}`.trim();
    const prefix = `${companyId}|bulk|${kind}|${date}|${normName(partyName)}|${invoiceNumber}|${amount}`;
    entries.push({
      id: `e${index + 1}`,
      status,
      selected: status !== "error",
      errors,
      warnings,
      label,
      kind,
      date,
      partyName,
      partyId: party?.id || "",
      partyRef,
      partyState,
      invoiceNumber,
      amount: amount || 0,
      gstRate,
      hsn,
      mode,
      itemLines: mappedLines,
      narration: invoiceNarration(rows, invoiceNumber),
      clientRequestId: stableUuid(prefix),
      rowNumbers: rows.map(row => row.rowNumber),
    });
  });

  return {
    entries,
    newParties,
    counts: {
      total: entries.length,
      ready: entries.filter(entry => entry.status !== "error").length,
      errors: entries.filter(entry => entry.status === "error").length,
      warnings: entries.filter(entry => entry.status === "warning").length,
      sales: entries.filter(entry => entry.kind === "sale").length,
      purchases: entries.filter(entry => entry.kind === "purchase").length,
    },
  };
}
