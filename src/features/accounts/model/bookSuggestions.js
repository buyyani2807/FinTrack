import { SYSTEM_CODES, isPosted, roundMoney } from "./accountingModel.js";

const STOP_WORDS = new Set([
  "for", "the", "and", "of", "from", "with", "this", "that", "month", "bill",
  "payment", "paid", "pay", "expense", "expenses", "neft", "imps", "rtgs", "upi", "inft",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
]);

export function textHasPhrase(text, phrase) {
  const hay = String(text || "").toLowerCase();
  const needle = String(phrase || "").trim().toLowerCase();
  if (needle.length < 3) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(hay);
}

export function significantTokens(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 3 && !STOP_WORDS.has(token));
}

function expenseAccounts(accounts = []) {
  return (accounts || []).filter(account =>
    account.groupType === "expense"
    && account.code !== SYSTEM_CODES.purchase
    && !/cost of goods/i.test(account.name || "")
  );
}

function nameHits(tokens, account) {
  const nameTokens = significantTokens(account.name);
  return nameTokens.filter(token => tokens.includes(token));
}

/** Last posted expense whose ledger name is in the note. The owner still saves. */
export function suggestExpense(narration, vouchers = [], accounts = []) {
  const tokens = significantTokens(narration);
  if (!tokens.length) return null;
  const books = expenseAccounts(accounts);
  const hits = [];
  for (const voucher of vouchers || []) {
    if (!isPosted(voucher)) continue;
    for (const line of voucher.lines || []) {
      const debit = roundMoney(line.debit);
      if (!(debit > 0)) continue;
      const account = books.find(item => item.id === line.coaId || item.code === line.code);
      if (!account || !nameHits(tokens, account).length) continue;
      hits.push({
        expenseCode: account.code,
        expenseName: account.name,
        amount: debit,
        date: voucher.date || "",
        voucherNumber: voucher.voucherNumber || "",
      });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => `${b.date}${b.voucherNumber}`.localeCompare(`${a.date}${a.voucherNumber}`));
  const best = hits[0];
  const sameAmount = hits.every(hit => hit.expenseCode !== best.expenseCode || hit.amount === best.amount);
  return {
    expenseCode: best.expenseCode,
    expenseName: best.expenseName,
    amount: best.amount,
    date: best.date,
    confidence: hits.length >= 2 && sameAmount ? "high" : "medium",
    similar: hits.slice(0, 3).map(hit => ({
      date: hit.date,
      voucherNumber: hit.voucherNumber,
      amount: hit.amount,
      expenseName: hit.expenseName,
    })),
  };
}

/** Advisory bank review. Accept, edit, and reject stay with the person using the screen. */
export function reconciliationReview(line) {
  if (!line || line.matchStatus === "matched" || line.matchStatus === "ignored") return null;
  const best = line.matchCandidates?.[0];
  if (line.matchStatus === "suggested" && best) {
    return {
      proposal: [best.date, best.voucherNumber, best.partyName].filter(Boolean).join(" · "),
      confidence: line.matchConfidence ?? best.confidence ?? null,
      reason: (best.reasons || []).join(", ") || line.matchHint || "",
      records: [best.voucherNumber].filter(Boolean),
      difference: roundMoney(Number(line.amount || 0) - Number(best.amount || 0)),
    };
  }
  if (line.entrySuggestion) {
    const label = [line.entrySuggestion.expenseName || line.entrySuggestion.partyName, line.entrySuggestion.reference].filter(Boolean).join(" · ");
    return {
      proposal: label,
      confidence: null,
      reason: "Statement text matches this party, invoice, or expense.",
      records: [line.entrySuggestion.reference || label].filter(Boolean),
      difference: 0,
    };
  }
  return null;
}

/**
 * When a statement line is not already matched to a books line, suggest the
 * party, open invoice, or expense ledger named in the text. Nothing is posted.
 */
export function suggestBankEntry(statementLine, { parties = [], openInvoices = [], accounts = [] } = {}) {
  if (!statementLine || statementLine.matchStatus === "matched" || statementLine.matchStatus === "ignored" || statementLine.matchStatus === "suggested") {
    return null;
  }
  const text = `${statementLine.description || ""} ${statementLine.reference || ""}`;
  const outgoing = statementLine.direction === "out";

  const invoiceHits = (openInvoices || []).filter(invoice => {
    const reference = String(invoice.reference || "").trim();
    if (reference.length < 4 || !textHasPhrase(text, reference)) return false;
    if (!(Number(invoice.outstanding || 0) > 0)) return false;
    const payable = invoice.partyType === "supplier" || invoice.voucherType === "purchase";
    return payable ? outgoing : !outgoing;
  });
  if (invoiceHits.length === 1) {
    const invoice = invoiceHits[0];
    const payable = invoice.partyType === "supplier" || invoice.voucherType === "purchase";
    return {
      kind: payable ? "payment" : "receipt",
      partyId: invoice.partyId || "",
      partyName: invoice.partyName || "",
      reference: invoice.reference || "",
      expenseCode: "",
      expenseName: "",
    };
  }

  const partyHits = (parties || [])
    .filter(party => party?.name && party.isActive !== false && textHasPhrase(text, party.name))
    .filter(party => (outgoing ? party.partyType === "supplier" : party.partyType === "customer"))
    .sort((a, b) => String(b.name).length - String(a.name).length);
  const longest = partyHits[0]?.name?.length || 0;
  const uniqueParty = partyHits.filter(party => String(party.name).length === longest);
  if (uniqueParty.length === 1) {
    const party = uniqueParty[0];
    return {
      kind: party.partyType === "supplier" ? "payment" : "receipt",
      partyId: party.id || "",
      partyName: party.name,
      reference: "",
      expenseCode: "",
      expenseName: "",
    };
  }

  if (!outgoing) return null;
  const tokens = significantTokens(text);
  const ranked = expenseAccounts(accounts)
    .map(account => ({ account, hits: nameHits(tokens, account) }))
    .filter(row => row.hits.length)
    .sort((a, b) => b.hits.length - a.hits.length || b.account.name.length - a.account.name.length);
  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0].hits.length === ranked[1].hits.length) return null;
  const account = ranked[0].account;
  return {
    kind: "expense",
    partyId: "",
    partyName: "",
    reference: "",
    expenseCode: account.code,
    expenseName: account.name,
  };
}
