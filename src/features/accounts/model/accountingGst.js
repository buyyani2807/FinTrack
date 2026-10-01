export const GST_RATES = [0, 5, 12, 18, 28];

export const INDIA_STATES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "19", name: "West Bengal" },
];

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(gstin) {
  return String(gstin || "").trim().toUpperCase();
}

export function gstinChecksum(body14) {
  const body = normalizeGstin(body14);
  let factor = 1;
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const codePoint = GSTIN_CHARS.indexOf(body[index] || "");
    if (codePoint < 0) return "";
    const product = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

export function gstinValidationMessage(gstin) {
  const raw = normalizeGstin(gstin);
  if (!raw) return "";
  if (raw.length !== 15 || !GSTIN_PATTERN.test(raw)) return "Enter a valid 15-character GSTIN.";
  if (gstinChecksum(raw.slice(0, 14)) !== raw.slice(14)) return "GSTIN checksum is not valid.";
  return "";
}

export function isValidGstin(gstin) {
  return !gstinValidationMessage(gstin);
}

export function assertValidGstin(gstin, { required = false } = {}) {
  const raw = normalizeGstin(gstin);
  if (!raw) {
    if (required) throw new Error("GSTIN is required for a registered company.");
    return "";
  }
  const message = gstinValidationMessage(raw);
  if (message) throw new Error(message);
  return raw;
}

export function validateGstSettings(form) {
  const reg = String(form?.gstRegistration || "unregistered").trim() || "unregistered";
  if (reg !== "unregistered") {
    if (!normalizeGstin(form?.gstin)) return "GSTIN is required for a registered company.";
    const gstinMessage = gstinValidationMessage(form?.gstin);
    if (gstinMessage) return gstinMessage;
    if (!String(form?.stateCode || "").trim()) return "State is required for GST.";
  } else if (normalizeGstin(form?.gstin)) {
    return gstinValidationMessage(form.gstin);
  }
  return "";
}

export function gstStateFromGstin(gstin) {
  const raw = normalizeGstin(gstin);
  return /^\d{2}/.test(raw) ? raw.slice(0, 2) : "";
}

export function isIntraGst(companyState, partyState) {
  return Boolean(companyState && partyState && companyState === partyState);
}

export const GST_CGST_CODES = new Set(["1140", "2210"]);
export const GST_SGST_CODES = new Set(["1141", "2211"]);
export const GST_IGST_CODES = new Set(["1142", "2212"]);

const lineAmount = line => Math.round((Math.abs(Number(line?.debit || 0)) + Math.abs(Number(line?.credit || 0))) * 100) / 100;
const money = value => Math.round((Number(value) || 0) * 100) / 100;

export function gstDocumentTotals(gstLines = []) {
  return (gstLines || []).reduce((sum, line) => ({
    cgst: money(sum.cgst + Number(line.cgst ?? line.cgst_amount ?? 0)),
    sgst: money(sum.sgst + Number(line.sgst ?? line.sgst_amount ?? 0)),
    igst: money(sum.igst + Number(line.igst ?? line.igst_amount ?? 0)),
  }), { cgst: 0, sgst: 0, igst: 0 });
}

export function gstLedgerTotals(lines = []) {
  return (lines || []).reduce((sum, line) => {
    const code = String(line.code || "");
    const amount = lineAmount(line);
    if (GST_CGST_CODES.has(code)) sum.cgst = money(sum.cgst + amount);
    if (GST_SGST_CODES.has(code)) sum.sgst = money(sum.sgst + amount);
    if (GST_IGST_CODES.has(code)) sum.igst = money(sum.igst + amount);
    return sum;
  }, { cgst: 0, sgst: 0, igst: 0 });
}

export function assertGstDocumentMatchesLines(lines = [], gstLines = []) {
  if (!gstLines?.length) return;
  const document = gstDocumentTotals(gstLines);
  const ledgers = gstLedgerTotals(lines);
  if (document.cgst !== ledgers.cgst || document.sgst !== ledgers.sgst || document.igst !== ledgers.igst) {
    throw new Error(
      `GST document does not match tax ledgers. CGST ${document.cgst} / ${ledgers.cgst} · SGST ${document.sgst} / ${ledgers.sgst} · IGST ${document.igst} / ${ledgers.igst}`,
    );
  }
}
