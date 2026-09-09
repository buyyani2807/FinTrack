/** GSTR preparation helpers — CALCULATED books data only. Never claims filing. */

import { gstBooksReport } from "./accountingReports.js";

export function buildGstr1Preparation({ vouchers = [], parties = [], range }) {
  const books = gstBooksReport(vouchers, range);
  const partyById = new Map((parties || []).map(party => [party.id, party]));
  const b2b = [];
  const b2c = [];
  const creditNotes = [];
  const debitNotes = [];

  for (const row of books.output || []) {
    const voucher = (vouchers || []).find(item => item.voucherNumber === row.voucherNumber && item.date === row.date)
      || (vouchers || []).find(item => item.voucherNumber === row.voucherNumber);
    const party = partyById.get(voucher?.partyId);
    const entry = {
      date: row.date,
      voucherNumber: row.voucherNumber,
      voucherType: row.voucherType,
      partyName: party?.name || "",
      gstin: party?.gstin || "",
      hsnSac: row.hsnSac || "",
      taxable: row.taxable,
      rate: row.rate,
      cgst: row.cgst,
      sgst: row.sgst,
      igst: row.igst,
      status: "calculated",
      filingStatus: "not_filed",
    };
    if (row.voucherType === "credit_note") creditNotes.push(entry);
    else if (row.voucherType === "debit_note") debitNotes.push(entry);
    else if (party?.gstin) b2b.push(entry);
    else b2c.push(entry);
  }

  return {
    kind: "GSTR-1 preparation",
    dataClass: "calculated",
    filingStatus: "not_filed",
    disclaimer: "Calculated from FinTrack books. This is not a filed GSTR-1 and has not been submitted to the GST portal.",
    range,
    summary: {
      outputTax: books.outputTax,
      b2bCount: b2b.length,
      b2cCount: b2c.length,
      creditNoteCount: creditNotes.length,
      debitNoteCount: debitNotes.length,
    },
    b2b,
    b2c,
    creditNotes,
    debitNotes,
    byHsn: books.byHsn,
    byRate: books.byRate,
  };
}

export function buildGstr3bPreparation({ vouchers = [], range }) {
  const books = gstBooksReport(vouchers, range);
  return {
    kind: "GSTR-3B preparation",
    dataClass: "calculated",
    filingStatus: "not_filed",
    disclaimer: "Calculated from FinTrack books. This is not a filed GSTR-3B and has not been verified with the GST portal.",
    range,
    outward: {
      taxable: sum(books.output, "taxable"),
      cgst: sum(books.output, "cgst"),
      sgst: sum(books.output, "sgst"),
      igst: sum(books.output, "igst"),
    },
    inwardEligibleItc: {
      taxable: sum(books.input.filter(row => row.itcEligible), "taxable"),
      cgst: sum(books.input.filter(row => row.itcEligible), "cgst"),
      sgst: sum(books.input.filter(row => row.itcEligible), "sgst"),
      igst: sum(books.input.filter(row => row.itcEligible), "igst"),
    },
    netPayable: books.netPayable,
    byRate: books.byRate,
  };
}

function sum(rows, key) {
  return Number((rows || []).reduce((total, row) => total + Number(row[key] || 0), 0).toFixed(2));
}

export function gstrPrepToCsvRows(prep) {
  if (prep.kind?.includes("GSTR-3B")) {
    return [
      ["Section", "Taxable", "CGST", "SGST", "IGST"],
      ["Outward supplies (calculated)", prep.outward.taxable, prep.outward.cgst, prep.outward.sgst, prep.outward.igst],
      ["Eligible ITC (calculated)", prep.inwardEligibleItc.taxable, prep.inwardEligibleItc.cgst, prep.inwardEligibleItc.sgst, prep.inwardEligibleItc.igst],
      ["Net GST payable (calculated)", "", "", "", prep.netPayable],
      ["Filing status", prep.filingStatus, "", "", ""],
      ["Disclaimer", prep.disclaimer, "", "", ""],
    ];
  }
  const rows = [["Type", "Date", "Voucher", "Party", "GSTIN", "HSN/SAC", "Taxable", "Rate", "CGST", "SGST", "IGST", "Data class", "Filing status"]];
  for (const [type, list] of [["B2B", prep.b2b], ["B2C", prep.b2c], ["Credit note", prep.creditNotes], ["Debit note", prep.debitNotes]]) {
    for (const row of list || []) {
      rows.push([type, row.date, row.voucherNumber, row.partyName, row.gstin, row.hsnSac, row.taxable, row.rate, row.cgst, row.sgst, row.igst, row.status, row.filingStatus]);
    }
  }
  rows.push(["", "", "", "", "", "", "", "", "", "", "", "", ""]);
  rows.push(["Disclaimer", prep.disclaimer, "", "", "", "", "", "", "", "", "", "", ""]);
  return rows;
}

/** Same preparation object as CSV — JSON for CA/GSP tools. Never marks filed. */
export function gstrPrepToJson(prep) {
  return {
    ...prep,
    exportedAt: new Date().toISOString(),
    filingStatus: "not_filed",
    dataClass: "calculated",
  };
}

/**
 * Build an IRP-shaped outbound payload for a posted sales voucher.
 * Status is always not_submitted — FinTrack does not call IRP/GSP.
 */
export function buildEinvoiceOutboundPayload({ voucher, party, company, workspace } = {}) {
  const lines = (voucher?.gstLines?.length
    ? voucher.gstLines.map((line, index) => ({
      slNo: String(index + 1),
      hsnSac: line.hsnSac || "",
      taxableAmount: Number(line.taxable || 0),
      rate: Number(line.rate || 0),
      cgst: Number(line.cgst || 0),
      sgst: Number(line.sgst || 0),
      igst: Number(line.igst || 0),
    }))
    : [{
      slNo: "1",
      hsnSac: "",
      taxableAmount: Number((voucher?.lines || []).reduce((sum, line) => sum + Number(line.credit || 0), 0).toFixed(2)),
      rate: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    }]);
  const taxable = Number(lines.reduce((sum, line) => sum + Number(line.taxableAmount || 0), 0).toFixed(2));
  const cgst = Number(lines.reduce((sum, line) => sum + Number(line.cgst || 0), 0).toFixed(2));
  const sgst = Number(lines.reduce((sum, line) => sum + Number(line.sgst || 0), 0).toFixed(2));
  const igst = Number(lines.reduce((sum, line) => sum + Number(line.igst || 0), 0).toFixed(2));
  return {
    schemaVersion: "fintrack-einvoice-outbound-1",
    status: "not_submitted",
    filingStatus: "not_submitted",
    disclaimer: "Outbound payload for a future IRP/GSP integration. Not submitted. No IRN, QR, or ack is generated by FinTrack.",
    document: {
      type: "INV",
      number: voucher?.voucherNumber || "",
      date: voucher?.date || "",
      supplyType: igst > 0 ? "INTER" : "INTRA",
    },
    seller: {
      gstin: company?.gstin || "",
      legalName: company?.legalName || company?.name || workspace?.organizationName || "",
      stateCode: company?.stateCode || "",
    },
    buyer: {
      gstin: party?.gstin || "",
      name: party?.name || "",
      stateCode: party?.stateCode || "",
    },
    values: { taxable, cgst, sgst, igst, total: Number((taxable + cgst + sgst + igst).toFixed(2)) },
    lines,
    provider: null,
    irn: null,
    ackNumber: null,
  };
}

/** Credential / architecture stub only — no government API calls. */
export const EINVOICE_INTEGRATION_STUB = {
  enabled: false,
  providers: ["GSTN e-Invoice (IRP)", "GSP / ASP partner"],
  requiredSecrets: ["GSTIN", "IRP username", "IRP password / client secret", "GSP credentials (if used)"],
  outputs: ["IRN", "Signed QR", "Ack number", "e-Way Bill (separate API)"],
  note: "FinTrack Accounts supports books + GSTR-1/3B preparation (CSV/JSON) and queued outbound e-invoice payloads. Live IRN / e-Way / portal filing is not implemented and must not be marketed as available.",
  marketingClaim: "GSTR preparation + e-invoice payload queue — not filing, not live IRN.",
};
