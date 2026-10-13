import { bankVoucherLines, defaultBankStatementLines, invoiceRegister } from "../../accounts/model/accountingReports.js";
import { advisory, formatInr, isoDate, n, source } from "./aiCommon.js";

const BANK_CHARGE_TEXT = /\b(bank\s*charges?|chgs?|charges?|sms\s*(alert|chg)|annual\s*fee|amc|service\s*charge|commission|gst\s*on\s*(chg|charges?))\b/i;
const TOKEN = /[a-z0-9]{3,}/g;
const STOP = new Set(["neft", "imps", "rtgs", "upi", "ach", "nach", "txn", "ref", "the", "and", "for", "from", "transfer", "payment", "credit", "debit"]);

const tokensOf = text => [...new Set((String(text || "").toLowerCase().match(TOKEN) || []).filter(token => !STOP.has(token) && !/^\d+$/.test(token)))];

function findBankChargesAccount(accounts = []) {
  return (accounts || []).find(account => account.groupType === "expense" && /bank\s*charge/i.test(account.name || ""))
    || (accounts || []).find(account => account.groupType === "expense" && /bank/i.test(account.name || ""))
    || null;
}

/**
 * What earlier approved (matched) bank lines in this company were matched to: the party or expense ledger
 * behind the voucher, keyed by description tokens. Only this company's saved matches are used; nothing is
 * sent anywhere or used to train a model.
 */
export function learnFromApprovedMatches({ statements = [], accounts = [], vouchers = [], parties = [] } = {}) {
  const lineIndex = new Map();
  for (const voucher of vouchers || []) {
    for (const line of voucher.lines || []) lineIndex.set(line.id, { voucher, line });
  }
  const accountByKey = new Map((accounts || []).flatMap(account => [[account.id, account], [account.code, account]]));
  const partyName = new Map((parties || []).map(party => [party.id, party.name]));
  const memory = new Map();
  for (const statement of statements || []) {
    for (const line of statement.lines || []) {
      if (line.matchStatus !== "matched" || !line.matchedVoucherLineId) continue;
      const hit = lineIndex.get(line.matchedVoucherLineId);
      if (!hit) continue;
      const other = (hit.voucher.lines || []).find(item => item.id !== hit.line.id);
      const account = other ? accountByKey.get(other.coaId) || accountByKey.get(other.code) : null;
      const target = hit.voucher.partyId
        ? { kind: hit.voucher.voucherType, partyId: hit.voucher.partyId, label: partyName.get(hit.voucher.partyId) || "Party" }
        : account ? { kind: hit.voucher.voucherType, expenseCode: account.code, label: account.name } : null;
      if (!target) continue;
      const key = `${line.direction}:${target.partyId || target.expenseCode}`;
      for (const token of tokensOf(line.description)) {
        if (!memory.has(token)) memory.set(token, new Map());
        const bucket = memory.get(token);
        const entry = bucket.get(key) || { ...target, direction: line.direction, count: 0 };
        entry.count += 1;
        bucket.set(key, entry);
      }
    }
  }
  return memory;
}

function recall(memory, line) {
  const scores = new Map();
  for (const token of tokensOf(line.description)) {
    for (const [key, entry] of memory.get(token) || []) {
      if (entry.direction !== line.direction) continue;
      const current = scores.get(key) || { ...entry, hits: 0 };
      current.hits += entry.count;
      scores.set(key, current);
    }
  }
  const ranked = [...scores.values()].sort((a, b) => b.hits - a.hits);
  if (!ranked.length || ranked[0].hits < 2) return null;
  if (ranked[1] && ranked[1].hits >= ranked[0].hits) return null;
  return ranked[0];
}

const typeLabel = kind => ({ receipt: "Customer receipt", payment: "Supplier payment", expense: "Expense", sales: "Customer receipt", purchase: "Supplier payment" }[kind] || "Bank transaction");

/**
 * One suggestion per open statement line. Suggestions never post, match, settle, or mark paid by themselves;
 * the caller must get explicit approval and then use the existing match/entry flows.
 */
export function buildBankReconciliationSuggestions({ statements = [], accounts = [], vouchers = [], parties = [], matchedLineIds = new Set() } = {}) {
  const openInvoices = [
    ...invoiceRegister(accounts, vouchers, parties, { kind: "receivable", outstandingOnly: true }),
    ...invoiceRegister(accounts, vouchers, parties, { kind: "payable", outstandingOnly: true }),
  ];
  const memory = learnFromApprovedMatches({ statements, accounts, vouchers, parties });
  const bankCharges = findBankChargesAccount(accounts);
  const rows = [];
  let total = 0;
  let matched = 0;
  for (const statement of statements || []) {
    const voucherLines = bankVoucherLines(accounts, vouchers, statement.coaId, parties).map(line => ({ ...line, matched: matchedLineIds.has(line.id) }));
    const display = defaultBankStatementLines(statement.lines || [], voucherLines, { parties, openInvoices, accounts });
    for (const line of display) {
      total += 1;
      if (line.matchStatus === "matched" || line.matchStatus === "ignored") {
        matched += 1;
        continue;
      }
      const base = {
        lineId: line.id,
        statementId: statement.id,
        bankAccount: statement.accountName || "Bank",
        date: isoDate(line.lineDate),
        description: line.description || "",
        reference: line.reference || "",
        amount: n(line.amount),
        direction: line.direction,
        candidates: (line.matchCandidates || []).map(candidate => ({ id: candidate.id, label: `${candidate.voucherNumber} · ${candidate.date} · ${formatInr(candidate.amount)}`, confidence: candidate.confidence, reasons: candidate.reasons })),
        rawLine: line,
        statement,
      };
      const best = line.matchCandidates?.[0];
      if (line.matchStatus === "suggested" && best) {
        rows.push(advisory({
          ...base,
          id: `bank-${line.id}`,
          title: `Match to ${best.voucherNumber}`,
          likelyParty: best.partyName || "",
          relatedDocument: best.voucherNumber,
          likelyLedger: statement.accountName || "",
          transactionType: line.direction === "in" ? "Receipt already recorded" : "Payment already recorded",
          confidencePct: line.matchConfidence,
          confidence: line.matchConfidence >= 85 ? "high" : "medium",
          explanation: `Matches on ${best.reasons.join(", ")}.`,
          suggestedAction: `Approve to match with ${best.voucherNumber}.`,
          actionKind: "match",
          voucherLineId: best.id,
          severity: "low",
          source: source("bank", "Open bank reconciliation", { lineId: line.id }),
        }));
        continue;
      }
      if (line.direction === "out" && bankCharges && BANK_CHARGE_TEXT.test(`${line.description} ${line.reference || ""}`)) {
        rows.push(advisory({
          ...base,
          id: `bank-${line.id}`,
          title: `${formatInr(line.amount)} → ${bankCharges.name}`,
          likelyParty: "Bank",
          relatedDocument: "",
          likelyLedger: bankCharges.name,
          transactionType: "Bank charges",
          confidencePct: 85,
          confidence: "high",
          explanation: "The narration looks like a bank fee or charge.",
          suggestedAction: `Approve to open an expense entry to ${bankCharges.name}. Nothing is posted until you save it.`,
          actionKind: "create_entry",
          entrySuggestion: { kind: "expense", partyId: "", partyName: "", reference: "", expenseCode: bankCharges.code, expenseName: bankCharges.name },
          severity: "low",
          source: source("bank", "Open bank reconciliation", { lineId: line.id }),
        }));
        continue;
      }
      const learned = recall(memory, line);
      const suggestion = line.entrySuggestion || (learned ? {
        kind: learned.partyId ? (line.direction === "in" ? "receipt" : "payment") : "expense",
        partyId: learned.partyId || "",
        partyName: learned.partyId ? learned.label : "",
        reference: "",
        expenseCode: learned.expenseCode || "",
        expenseName: learned.expenseCode ? learned.label : "",
      } : null);
      if (suggestion) {
        const fromHistory = !line.entrySuggestion && learned;
        rows.push(advisory({
          ...base,
          id: `bank-${line.id}`,
          title: suggestion.partyName ? `${typeLabel(suggestion.kind)} · ${suggestion.partyName}` : `${typeLabel(suggestion.kind)} · ${suggestion.expenseName}`,
          likelyParty: suggestion.partyName || "",
          relatedDocument: suggestion.reference || "",
          likelyLedger: suggestion.expenseName || (suggestion.kind === "receipt" ? "Receivables" : suggestion.kind === "payment" ? "Payables" : ""),
          transactionType: typeLabel(suggestion.kind),
          confidencePct: fromHistory ? Math.min(80, 50 + learned.hits * 5) : suggestion.reference ? 80 : 65,
          confidence: fromHistory ? (learned.hits >= 4 ? "medium" : "low") : suggestion.reference ? "high" : "medium",
          explanation: fromHistory
            ? `Similar narrations were approved ${learned.hits} time(s) before for ${learned.label} in this company.`
            : suggestion.reference ? `The narration mentions open invoice ${suggestion.reference}.` : suggestion.partyName ? `The narration mentions ${suggestion.partyName}.` : `The narration matches the ${suggestion.expenseName} ledger name.`,
          suggestedAction: "Approve to open a prefilled entry. Nothing is posted until you save it.",
          actionKind: "create_entry",
          entrySuggestion: suggestion,
          learnedFromHistory: Boolean(fromHistory),
          severity: "low",
          source: source("bank", "Open bank reconciliation", { lineId: line.id }),
        }));
        continue;
      }
      rows.push(advisory({
        ...base,
        id: `bank-${line.id}`,
        title: "No reliable suggestion",
        likelyParty: "",
        relatedDocument: "",
        likelyLedger: "",
        transactionType: line.direction === "in" ? "Money in" : "Money out",
        confidencePct: best ? best.confidence : 0,
        confidence: "low",
        explanation: best ? `${line.matchCandidates.length} possible voucher(s) with the same amount, none clearly best.` : "No saved voucher, party, or ledger matches this line.",
        suggestedAction: best ? "Review: choose a voucher to match." : "Review: create the entry manually.",
        actionKind: best ? "choose" : "review",
        severity: "medium",
        source: source("bank", "Open bank reconciliation", { lineId: line.id }),
      }));
    }
  }
  return {
    suggestions: rows,
    totalLines: total,
    reconciledLines: matched,
    reconciledPct: total ? Math.round(matched / total * 1000) / 10 : null,
  };
}
