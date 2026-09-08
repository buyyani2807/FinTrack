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

/** Credential / architecture stub only — no government API calls. */
export const EINVOICE_INTEGRATION_STUB = {
  enabled: false,
  providers: ["GSTN e-Invoice (IRP)", "GSP / ASP partner"],
  requiredSecrets: ["GSTIN", "IRP username", "IRP password / client secret", "GSP credentials (if used)"],
  outputs: ["IRN", "Signed QR", "Ack number", "e-Way Bill (separate API)"],
  note: "FinTrack stores configuration only. Live IRN / e-Way generation requires verified government or GSP credentials and must not be faked.",
};
