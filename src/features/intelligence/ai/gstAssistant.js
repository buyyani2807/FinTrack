import { affectsLedgers, isReversalVoucher } from "../../accounts/model/accountingModel.js";
import {
  GST_RATES,
  gstDocumentTotals,
  gstLedgerTotals,
  gstStateFromGstin,
  gstinValidationMessage,
  normalizeGstin,
} from "../../accounts/model/accountingGst.js";
import { addDaysIso, advisory, bySeverity, daysBetween, formatInr, isoDate, n, roundMoney, source } from "./aiCommon.js";

const GST_DOC_TYPES = new Set(["sales", "purchase", "credit_note", "debit_note"]);
const SPECIAL_RATES = new Set([0.1, 0.25, 1.5, 3, 6, 7.5, 40]);
const KNOWN_RATES = new Set([...GST_RATES, ...SPECIAL_RATES]);

export const GST_DISCLAIMER = "FinTrack's calculated GST remains authoritative. These checks are for review only: they do not file returns, generate IRNs, or create acknowledgements.";

const lineTax = line => roundMoney(n(line.cgst) + n(line.sgst) + n(line.igst));

/**
 * GST review warnings for posted GST documents in a period. Each warning links to its source voucher or the
 * GST report and always requires human review; nothing is corrected automatically.
 */
export function buildGstWarnings({ vouchers = [], parties = [], company = {}, voucherItemLines = [], from, to, asOf } = {}) {
  const end = isoDate(to || asOf);
  const start = isoDate(from || addDaysIso(end, -90));
  const partyById = new Map((parties || []).map(party => [party.id, party]));
  const companyGstin = normalizeGstin(company.gstin);
  const companyState = String(company.stateCode || gstStateFromGstin(companyGstin) || "");
  const docs = (vouchers || []).filter(voucher =>
    affectsLedgers(voucher)
    && voucher.status !== "reversed"
    && !isReversalVoucher(voucher)
    && GST_DOC_TYPES.has(voucher.voucherType)
    && isoDate(voucher.date) >= start
    && isoDate(voucher.date) <= end);
  const itemLinesByVoucher = new Map();
  for (const line of voucherItemLines || []) {
    if (!itemLinesByVoucher.has(line.voucherId)) itemLinesByVoucher.set(line.voucherId, []);
    itemLinesByVoucher.get(line.voucherId).push(line);
  }
  const warnings = [];
  const add = (voucher, check, fields) => warnings.push(advisory({
    id: `gst-${check}-${voucher?.id || fields.key}`,
    check,
    module: "GST",
    record: voucher ? `${voucher.voucherNumber} · ${isoDate(voucher.date)}` : fields.record,
    requiresReview: true,
    source: voucher ? source("vouchers", `Open ${voucher.voucherNumber}`, { voucherId: voucher.id }) : source("reports", "Open GST report", { reportTab: "gst" }),
    ...fields,
  }));

  if (company.gstRegistration && company.gstRegistration !== "unregistered") {
    const message = companyGstin ? gstinValidationMessage(companyGstin) : "GSTIN is missing.";
    if (message) {
      add(null, "company_gstin", {
        key: "company",
        record: "Company GST settings",
        title: "Company GSTIN requires review",
        severity: "critical",
        explanation: message,
        recommendedAction: "Correct the GSTIN in Setup → Company.",
        confidence: "high",
        confidencePct: 95,
        source: source("setup", "Open company setup"),
      });
    }
  }

  const reportedParties = new Set();
  const hsnRates = new Map();
  for (const voucher of docs) {
    const party = partyById.get(voucher.partyId) || null;
    const gstLines = voucher.gstLines || [];
    const isSale = voucher.voucherType === "sales" || voucher.voucherType === "credit_note";
    const partyGstin = normalizeGstin(party?.gstin);
    const partyState = String(party?.stateCode || gstStateFromGstin(partyGstin) || "");

    if (party && !reportedParties.has(party.id)) {
      const message = partyGstin ? gstinValidationMessage(partyGstin) : "";
      if (message) {
        reportedParties.add(party.id);
        add(voucher, "party_gstin", {
          title: `GSTIN mismatch: ${party.name}`,
          severity: "high",
          explanation: `${party.name}'s GSTIN ${partyGstin} is not valid (${message}).`,
          recommendedAction: "Confirm the GSTIN with the party and update the party record.",
          confidence: "high",
          confidencePct: 95,
        });
      } else if (partyGstin && party.stateCode && gstStateFromGstin(partyGstin) !== String(party.stateCode)) {
        reportedParties.add(party.id);
        add(voucher, "party_state", {
          title: `Party GST mismatch: ${party.name}`,
          severity: "medium",
          explanation: `GSTIN state code ${gstStateFromGstin(partyGstin)} differs from the party's saved state ${party.stateCode}.`,
          recommendedAction: "Check the party's billing state.",
          confidence: "high",
          confidencePct: 90,
        });
      } else if (!partyGstin && party.gstRegistration && party.gstRegistration !== "unregistered") {
        reportedParties.add(party.id);
        add(voucher, "party_missing_gstin", {
          title: `Missing GSTIN: ${party.name}`,
          severity: "medium",
          explanation: `${party.name} is marked GST-registered but has no GSTIN saved.`,
          recommendedAction: "Add the party's GSTIN.",
          confidence: "high",
          confidencePct: 90,
        });
      }
    }

    if (!gstLines.length) continue;

    const document = gstDocumentTotals(gstLines);
    const ledgers = gstLedgerTotals(voucher.lines || []);
    if (document.cgst !== ledgers.cgst || document.sgst !== ledgers.sgst || document.igst !== ledgers.igst) {
      add(voucher, "line_total_mismatch", {
        title: "GST lines do not match tax ledgers",
        severity: "high",
        explanation: `GST lines total CGST ${document.cgst} / SGST ${document.sgst} / IGST ${document.igst}; tax ledgers show ${ledgers.cgst} / ${ledgers.sgst} / ${ledgers.igst}.`,
        recommendedAction: "Requires review: reverse and re-enter the voucher if the tax is wrong.",
        confidence: "high",
        confidencePct: 95,
      });
    }

    if (companyState && partyState) {
      const intraExpected = companyState === partyState;
      const hasIgst = gstLines.some(line => n(line.igst) > 0);
      const hasCgst = gstLines.some(line => n(line.cgst) > 0 || n(line.sgst) > 0);
      if ((intraExpected && hasIgst) || (!intraExpected && hasCgst)) {
        add(voucher, "supply_type", {
          title: "GST supply type requires review",
          severity: "high",
          explanation: `Company state ${companyState} and party state ${partyState} suggest ${intraExpected ? "CGST + SGST" : "IGST"}, but the document uses ${hasIgst ? "IGST" : "CGST + SGST"}.`,
          recommendedAction: "Check the place of supply.",
          confidence: "medium",
          confidencePct: 70,
        });
      }
    }

    gstLines.forEach((line, index) => {
      const rate = n(line.rate);
      const taxable = n(line.taxable);
      if (rate > 0 && !KNOWN_RATES.has(rate)) {
        add(voucher, `rate-${index}`, {
          check: "unusual_rate",
          title: `Unusual GST rate ${rate}%`,
          severity: "medium",
          explanation: `Line ${index + 1} uses ${rate}%, which is not a standard GST rate.`,
          recommendedAction: "Confirm the rate for this HSN/SAC.",
          confidence: "high",
          confidencePct: 85,
        });
      }
      const expectedTax = roundMoney(taxable * rate / 100);
      if (taxable > 0 && Math.abs(expectedTax - lineTax(line)) > 1) {
        add(voucher, `tax-${index}`, {
          check: "rate_inconsistency",
          title: "GST amount does not match rate",
          severity: "medium",
          explanation: `Line ${index + 1}: ${rate}% of ${formatInr(taxable)} is ${formatInr(expectedTax)}, but ${formatInr(lineTax(line))} was recorded.`,
          recommendedAction: "Requires review of the line amounts.",
          confidence: "high",
          confidencePct: 90,
        });
      }
      if (isSale && !String(line.hsnSac || "").trim()) {
        add(voucher, `hsn-${index}`, {
          check: "missing_hsn",
          title: "Sales line missing HSN/SAC",
          severity: "low",
          explanation: `Line ${index + 1} has no HSN/SAC code.`,
          recommendedAction: "Add the HSN/SAC on the item for future invoices.",
          confidence: "high",
          confidencePct: 95,
        });
      }
      const hsn = String(line.hsnSac || "").trim();
      if (hsn && rate > 0) {
        if (!hsnRates.has(hsn)) hsnRates.set(hsn, new Map());
        const rates = hsnRates.get(hsn);
        if (!rates.has(rate)) rates.set(rate, voucher);
      }
    });

    for (const itemLine of itemLinesByVoucher.get(voucher.id) || []) {
      const hsn = String(itemLine.hsnSac || "").trim();
      if (!hsn) continue;
      const looksService = hsn.startsWith("99");
      if (itemLine.itemType === "service" && !looksService) {
        add(voucher, `class-${itemLine.id || itemLine.itemId}`, {
          check: "unusual_classification",
          title: `Unusual classification: ${itemLine.itemName}`,
          severity: "low",
          explanation: `Service item uses ${hsn}; service codes (SAC) usually start with 99.`,
          recommendedAction: "Confirm the SAC code.",
          confidence: "medium",
          confidencePct: 65,
        });
      } else if (itemLine.itemType !== "service" && looksService) {
        add(voucher, `class-${itemLine.id || itemLine.itemId}`, {
          check: "unusual_classification",
          title: `Unusual classification: ${itemLine.itemName}`,
          severity: "low",
          explanation: `Goods item uses ${hsn}, which looks like a service (SAC) code.`,
          recommendedAction: "Confirm the HSN code.",
          confidence: "medium",
          confidencePct: 65,
        });
      }
    }

    if (isSale && party && !partyGstin && document.cgst + document.sgst + document.igst > 0 && party.gstRegistration && party.gstRegistration !== "unregistered") {
      add(voucher, "sale_missing_gstin", {
        title: "Sales invoice missing customer GSTIN",
        severity: "medium",
        explanation: `${party.name} is GST-registered but the invoice has no customer GSTIN to report.`,
        recommendedAction: "Add the customer's GSTIN before preparing returns.",
        confidence: "high",
        confidencePct: 90,
      });
    }

    if (voucher.voucherType === "purchase") {
      const itc = gstLines.filter(line => line.itcEligible !== false).reduce((sum, line) => sum + lineTax(line), 0);
      if (itc > 0 && (!party || !partyGstin || party.gstRegistration === "unregistered" || party.gstRegistration === "composition")) {
        add(voucher, "itc_review", {
          title: "Potential ITC requiring review",
          severity: "high",
          explanation: `${formatInr(itc)} input tax is marked eligible, but the supplier ${party ? (partyGstin ? `is ${party.gstRegistration}` : "has no GSTIN") : "is not set"}.`,
          recommendedAction: "Confirm ITC eligibility with your accountant before claiming.",
          confidence: "medium",
          confidencePct: 75,
        });
      }
    }
  }

  for (const [hsn, rates] of hsnRates) {
    if (rates.size < 2) continue;
    const examples = [...rates.entries()];
    add(examples[0][1], `hsn-rates-${hsn}`, {
      check: "hsn_rate_inconsistency",
      title: `HSN ${hsn} used with different rates`,
      severity: "medium",
      explanation: `HSN/SAC ${hsn} appears at ${examples.map(([rate, voucher]) => `${rate}% (${voucher.voucherNumber})`).join(", ")}.`,
      recommendedAction: "Confirm the correct rate for this HSN/SAC.",
      confidence: "medium",
      confidencePct: 70,
    });
  }

  const purchases = docs.filter(voucher => voucher.voucherType === "purchase" && (voucher.gstLines || []).length);
  const seen = new Set();
  for (const voucher of purchases) {
    for (const other of purchases) {
      if (other.id <= voucher.id || other.partyId !== voucher.partyId) continue;
      const a = gstDocumentTotals(voucher.gstLines);
      const b = gstDocumentTotals(other.gstLines);
      const taxableA = roundMoney(voucher.gstLines.reduce((sum, line) => sum + n(line.taxable), 0));
      const taxableB = roundMoney(other.gstLines.reduce((sum, line) => sum + n(line.taxable), 0));
      if (taxableA !== taxableB || a.cgst !== b.cgst || a.sgst !== b.sgst || a.igst !== b.igst) continue;
      if (Math.abs(daysBetween(voucher.date, other.date) ?? 99) > 3) continue;
      const key = `${voucher.id}:${other.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      add(voucher, `dup-${other.id}`, {
        check: "duplicate_gst_invoice",
        title: "Possible duplicate GST invoice",
        severity: "high",
        explanation: `${voucher.voucherNumber} and ${other.voucherNumber} from the same supplier have identical taxable value and tax within three days. Claiming both would double the ITC.`,
        recommendedAction: "Requires review: confirm these are two separate supplier invoices.",
        confidence: "medium",
        confidencePct: 75,
        relatedSource: source("vouchers", `Open ${other.voucherNumber}`, { voucherId: other.id }),
      });
    }
  }

  return {
    period: { from: start, to: end },
    documentsChecked: docs.length,
    warnings: warnings.sort(bySeverity),
    disclaimer: GST_DISCLAIMER,
  };
}
