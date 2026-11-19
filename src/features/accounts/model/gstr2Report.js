/**
 * GSTR-2 (purchases) — inward supplies from posted purchase vouchers and purchase returns.
 *
 * Same idea as GSTR-1 prep and the "GSTR-2 (Purchase)" report in other Indian billing apps:
 * an invoice-wise register of purchases split by the GSTR-2 tables, so the owner or CA can
 * check purchases and Input Tax Credit before matching with GSTR-2B on the portal.
 *
 *   B2B    (table 3, 4A)  purchases from GST-registered suppliers (valid GSTIN)
 *   B2BUR  (table 4B)     purchases from unregistered suppliers (no or invalid GSTIN)
 *   CDNR / CDNUR (6C)     debit notes (purchase returns) to registered / unregistered suppliers
 *   Nil    (table 7)      0% purchase lines (nil-rated or exempt)
 *   HSN    (table 13)     inward HSN summary
 *
 * Calculated from MyFinTracker books only. Never claims filing.
 */

import { affectsLedgers, isReversalVoucher, roundMoney } from "./accountingModel.js";
import { gstStateFromGstin, INDIA_STATES, isValidGstin, normalizeGstin } from "./accountingGst.js";
import { billNumberFromNarration } from "./billScan.js";

export const GSTR2_DISCLAIMER = "Calculated from MyFinTracker books. This is not a filed return and has not been matched with GSTR-2B on the GST portal.";

export const GSTR2_SECTIONS = [
  { id: "b2b", label: "B2B purchases", table: "3, 4A" },
  { id: "b2bur", label: "Unregistered (B2BUR)", table: "4B" },
  { id: "cdnr", label: "Debit notes — registered", table: "6C" },
  { id: "cdnur", label: "Debit notes — unregistered", table: "6C" },
  { id: "nil", label: "Nil-rated / exempt", table: "7" },
];

const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);
const num = value => Number(value || 0);
const lineTaxable = line => num(line.taxable ?? line.taxable_amount);
const lineCgst = line => num(line.cgst ?? line.cgst_amount);
const lineSgst = line => num(line.sgst ?? line.sgst_amount);
const lineIgst = line => num(line.igst ?? line.igst_amount);
const lineCess = line => num(line.cess ?? line.cess_amount);
const lineItc = line => line.itcEligible !== false && line.itc_eligible !== false;

export function stateLabel(code) {
  const state = INDIA_STATES.find(item => item.code === code);
  return state ? `${code}-${state.name}` : code || "";
}

/** Supplier bill number from the purchase narration ("Bill 1234 · …"); falls back to our voucher number. */
export function supplierInvoiceNumber(voucher) {
  return billNumberFromNarration(voucher?.narration) || "";
}

function emptyTotals() {
  return { invoices: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, tax: 0, value: 0, itc: 0 };
}

function addTo(totals, row, sign = 1) {
  totals.taxable = roundMoney(totals.taxable + sign * row.taxable);
  totals.igst = roundMoney(totals.igst + sign * row.igst);
  totals.cgst = roundMoney(totals.cgst + sign * row.cgst);
  totals.sgst = roundMoney(totals.sgst + sign * row.sgst);
  totals.cess = roundMoney(totals.cess + sign * row.cess);
  totals.tax = roundMoney(totals.igst + totals.cgst + totals.sgst + totals.cess);
  totals.itc = roundMoney(totals.itc + sign * row.itcTotal);
}

/**
 * @param {object} options
 * @param {array} options.vouchers - books vouchers with gstLines
 * @param {array} options.parties
 * @param {{from?: string, to?: string}} options.range
 * @param {string} [options.companyStateCode] - for place of supply when the supplier has no GSTIN
 */
export function buildGstr2Report({ vouchers = [], parties = [], range = {}, companyStateCode = "" } = {}) {
  const partyById = new Map((parties || []).map(party => [party.id, party]));
  const sections = { b2b: [], b2bur: [], cdnr: [], cdnur: [], nil: [] };
  const hsn = new Map();
  const checks = [];
  const { from, to } = range || {};

  const inward = (vouchers || []).filter(voucher => (
    (voucher.voucherType === "purchase" || voucher.voucherType === "debit_note")
    && affectsLedgers(voucher)
    && inRange(voucher.date, from, to)
  ));
  // A cancelled purchase is the original (status reversed) plus a reversal voucher with the same
  // GST lines. When both fall in this period they cancel out, so neither is listed. A reversal of
  // an earlier period's purchase is listed with negative values so the totals match GST books.
  const reversedHere = new Set(
    inward.filter(isReversalVoucher).map(voucher => voucher.sourceTransactionId).filter(Boolean),
  );
  const candidates = inward.filter(voucher => (
    isReversalVoucher(voucher)
      ? !inward.some(original => original.id === voucher.sourceTransactionId)
      : !reversedHere.has(voucher.id)
  ));
  const byId = new Map((vouchers || []).map(voucher => [voucher.id, voucher]));

  for (const voucher of candidates) {
    const reversal = isReversalVoucher(voucher);
    const original = reversal ? byId.get(voucher.sourceTransactionId) : null;
    const flip = reversal ? -1 : 1;
    const lines = (voucher.gstLines || []).filter(line => (
      lineTaxable(line) || lineCgst(line) || lineSgst(line) || lineIgst(line)
    ));
    if (!lines.length) continue;

    const party = partyById.get(voucher.partyId) || null;
    const rawGstin = normalizeGstin(party?.gstin || "");
    const registered = Boolean(rawGstin) && isValidGstin(rawGstin);
    const isNote = voucher.voucherType === "debit_note";
    const supplierState = registered ? gstStateFromGstin(rawGstin) : (party?.stateCode || party?.state_code || "");
    const billNumber = supplierInvoiceNumber(original || voucher);
    const anyIgst = lines.some(line => lineIgst(line) > 0);
    const placeOfSupply = companyStateCode || supplierState;

    if (rawGstin && !registered) {
      checks.push({ voucherNumber: voucher.voucherNumber, date: voucher.date, issue: `Supplier GSTIN ${rawGstin} is not valid — reported as unregistered (B2BUR). Fix the GSTIN on the party to claim ITC.` });
    }
    if (!isNote && !reversal && !billNumber) {
      checks.push({ voucherNumber: voucher.voucherNumber, date: voucher.date, issue: "No supplier bill number in the narration — GSTR-2B matching needs it. Add \"Bill <number>\" to the narration." });
    }

    // One row per voucher and tax rate (portal tables are rate-wise).
    const byRate = new Map();
    for (const line of lines) {
      const rate = num(line.rate);
      const key = String(rate);
      if (!byRate.has(key)) byRate.set(key, { rate, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, itcTax: 0 });
      const bucket = byRate.get(key);
      bucket.taxable = roundMoney(bucket.taxable + flip * lineTaxable(line));
      bucket.igst = roundMoney(bucket.igst + flip * lineIgst(line));
      bucket.cgst = roundMoney(bucket.cgst + flip * lineCgst(line));
      bucket.sgst = roundMoney(bucket.sgst + flip * lineSgst(line));
      bucket.cess = roundMoney(bucket.cess + flip * lineCess(line));
      if (lineItc(line)) bucket.itcTax = roundMoney(bucket.itcTax + flip * (lineIgst(line) + lineCgst(line) + lineSgst(line) + lineCess(line)));

      const hsnKey = String(line.hsnSac || line.hsn_sac || "").trim() || "—";
      if (!hsn.has(hsnKey)) hsn.set(hsnKey, { hsnSac: hsnKey, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, tax: 0 });
      const h = hsn.get(hsnKey);
      const sign = (isNote ? -1 : 1) * flip;
      h.taxable = roundMoney(h.taxable + sign * lineTaxable(line));
      h.igst = roundMoney(h.igst + sign * lineIgst(line));
      h.cgst = roundMoney(h.cgst + sign * lineCgst(line));
      h.sgst = roundMoney(h.sgst + sign * lineSgst(line));
      h.cess = roundMoney(h.cess + sign * lineCess(line));
      h.tax = roundMoney(h.igst + h.cgst + h.sgst + h.cess);
    }

    const invoiceValue = roundMoney([...byRate.values()].reduce((total, bucket) => (
      total + bucket.taxable + bucket.igst + bucket.cgst + bucket.sgst + bucket.cess
    ), 0));

    for (const bucket of byRate.values()) {
      const tax = roundMoney(bucket.igst + bucket.cgst + bucket.sgst + bucket.cess);
      const row = {
        voucherId: voucher.id || "",
        date: voucher.date,
        voucherNumber: voucher.voucherNumber,
        invoiceNumber: billNumber || voucher.voucherNumber,
        billNumberMissing: !billNumber,
        noteType: isNote ? "D" : "",
        reversalOf: original?.voucherNumber || (reversal ? "earlier voucher" : ""),
        supplierName: party?.name || "",
        gstin: registered ? rawGstin : "",
        supplierState: stateLabel(supplierState),
        placeOfSupply: stateLabel(placeOfSupply),
        supplyType: anyIgst ? "Inter-state" : "Intra-state",
        reverseCharge: "N",
        invoiceValue,
        rate: bucket.rate,
        taxable: bucket.taxable,
        igst: bucket.igst,
        cgst: bucket.cgst,
        sgst: bucket.sgst,
        cess: bucket.cess,
        tax,
        itcEligible: bucket.itcTax !== 0 || tax === 0,
        itcTotal: bucket.itcTax,
      };
      let section;
      if (isNote) section = registered ? "cdnr" : "cdnur";
      else if (bucket.rate === 0 && tax === 0) section = "nil";
      else section = registered ? "b2b" : "b2bur";
      sections[section].push(row);
    }
  }

  for (const list of Object.values(sections)) {
    list.sort((a, b) => (a.date === b.date ? String(a.voucherNumber).localeCompare(String(b.voucherNumber)) : a.date < b.date ? -1 : 1));
  }

  const totals = {};
  for (const id of Object.keys(sections)) {
    const t = emptyTotals();
    const seen = new Set();
    for (const row of sections[id]) {
      addTo(t, row);
      const key = `${row.voucherId || row.voucherNumber}`;
      if (!seen.has(key)) {
        seen.add(key);
        t.invoices += 1;
        t.value = roundMoney(t.value + row.invoiceValue);
      }
    }
    totals[id] = t;
  }

  // Net inward = purchases − debit notes (returns reduce ITC).
  const net = emptyTotals();
  for (const id of ["b2b", "b2bur", "nil"]) for (const row of sections[id]) addTo(net, row, 1);
  for (const id of ["cdnr", "cdnur"]) for (const row of sections[id]) addTo(net, row, -1);
  net.invoices = totals.b2b.invoices + totals.b2bur.invoices + totals.nil.invoices;
  const ineligibleTax = roundMoney(
    [...sections.b2b, ...sections.b2bur].reduce((total, row) => total + (row.tax - row.itcTotal), 0),
  );

  return {
    kind: "GSTR-2 (Purchases)",
    dataClass: "calculated",
    filingStatus: "not_filed",
    disclaimer: GSTR2_DISCLAIMER,
    range: { from: from || "", to: to || "" },
    sections,
    totals,
    summary: {
      ...net,
      itcAvailable: net.itc,
      itcIneligible: ineligibleTax,
      registeredItc: roundMoney(totals.b2b.itc - totals.cdnr.itc),
    },
    hsn: [...hsn.values()].sort((a, b) => String(a.hsnSac).localeCompare(String(b.hsnSac))),
    checks,
  };
}

const ROW_HEADER = [
  "Section", "Supplier GSTIN", "Supplier", "Supplier bill no.", "Note type", "Date", "Our voucher",
  "Supplier state", "Place of supply", "Supply type", "Reverse charge", "Invoice value", "Rate %",
  "Taxable value", "IGST", "CGST", "SGST", "Cess", "ITC eligible", "ITC amount",
];

/** Spreadsheet rows (CSV / Excel / PDF) — summary first, then every section, HSN and checks. */
export function gstr2ExportRows(report, { companyName = "" } = {}) {
  const r = report;
  const rows = [
    ["GSTR-2 (Purchases)", companyName, `${r.range.from || "start"} to ${r.range.to || "today"}`],
    ["Data", "Calculated from books — not filed", ""],
    [],
    ["Section", "Invoices", "Taxable value", "IGST", "CGST", "SGST", "Cess", "Total tax", "ITC"],
  ];
  for (const section of GSTR2_SECTIONS) {
    const t = r.totals[section.id];
    rows.push([`${section.label} (table ${section.table})`, t.invoices, t.taxable, t.igst, t.cgst, t.sgst, t.cess, t.tax, t.itc]);
  }
  rows.push(["Net inward (purchases − debit notes)", r.summary.invoices, r.summary.taxable, r.summary.igst, r.summary.cgst, r.summary.sgst, r.summary.cess, r.summary.tax, r.summary.itcAvailable]);
  rows.push(["ITC not eligible", "", "", "", "", "", "", r.summary.itcIneligible, ""]);
  rows.push([]);
  rows.push(ROW_HEADER);
  for (const section of GSTR2_SECTIONS) {
    for (const row of r.sections[section.id]) {
      rows.push([
        section.id.toUpperCase(), row.gstin, row.supplierName, row.invoiceNumber, row.noteType, row.date, row.voucherNumber,
        row.supplierState, row.placeOfSupply, row.supplyType, row.reverseCharge, row.invoiceValue, row.rate,
        row.taxable, row.igst, row.cgst, row.sgst, row.cess, row.itcEligible ? "Yes" : "No", row.itcTotal,
      ]);
    }
  }
  rows.push([]);
  rows.push(["HSN / SAC", "Taxable value", "IGST", "CGST", "SGST", "Cess", "Total tax"]);
  for (const row of r.hsn) rows.push([row.hsnSac, row.taxable, row.igst, row.cgst, row.sgst, row.cess, row.tax]);
  if (r.checks.length) {
    rows.push([]);
    rows.push(["Check", "Voucher", "Date"]);
    for (const check of r.checks) rows.push([check.issue, check.voucherNumber, check.date]);
  }
  rows.push([]);
  rows.push(["Disclaimer", r.disclaimer]);
  return rows;
}
