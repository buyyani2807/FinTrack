import { groupByKey } from "./accountsList.js";

const mapGstLine = line => ({
  hsnSac: line.hsn_sac || "",
  description: line.description || "",
  taxable: Number(line.taxable_amount || 0),
  rate: Number(line.rate || 0),
  cgst: Number(line.cgst_amount || 0),
  sgst: Number(line.sgst_amount || 0),
  igst: Number(line.igst_amount || 0),
  supplyType: line.supply_type || "none",
  itcEligible: line.itc_eligible !== false,
});

const mapVoucherLine = line => ({
  id: line.id,
  lineNo: line.line_no,
  coaId: line.coa_id,
  partyId: line.party_id,
  debit: Number(line.debit || 0),
  credit: Number(line.credit || 0),
  description: line.description || "",
  code: line.acc_coa?.code,
  name: line.acc_coa?.name,
});

const mapVoucher = (row, lines = [], gstLines = []) => ({
  id: row.id,
  voucherType: row.voucher_type,
  voucherNumber: row.voucher_number,
  date: row.voucher_date,
  narration: row.narration || "",
  status: row.status,
  partyId: row.party_id,
  sourceModule: row.source_module,
  sourceType: row.source_type,
  sourceTransactionId: row.source_transaction_id,
  cancelReason: row.cancel_reason || "",
  dueDate: row.due_date || null,
  createdAt: row.created_at,
  postedAt: row.posted_at,
  gstLines: gstLines.map(mapGstLine),
  lines: [...lines].sort((a, b) => a.line_no - b.line_no).map(mapVoucherLine),
});

export const assembleVouchers = (vouchers = [], lines = [], gstLines = []) => {
  const linesBy = groupByKey(lines, "voucher_id");
  const gstBy = groupByKey(gstLines, "voucher_id");
  return (vouchers || []).map(row => mapVoucher(row, linesBy.get(row.id) || [], gstBy.get(row.id) || []));
};
