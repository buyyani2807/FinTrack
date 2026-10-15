import { useMemo, useRef, useState } from "react";
import { CheckCircle2, MessageSquareText, RotateCcw, Send } from "lucide-react";
import { Select } from "../../../components/Select.jsx";
import { GST_RATES, moneyAccounts, newClientRequestId } from "../model/accountingModel.js";
import {
  BOOKKEEPER_ACTIONS,
  BOOKKEEPER_EXAMPLES,
  NEW_LEDGER_ID,
  buildBookkeeperDraft,
  combineIntents,
  fieldsFromIntent,
  ledgerOptions,
  normalizeEntryIntent,
  parseEntryText,
  starterLedger,
} from "../model/bookkeeper.js";
import { money } from "../accountsFormat.js";
import "../bookkeeper.css";

const LEDGER_LABEL = {
  asset_purchase: "Asset ledger",
  expense: "Expense",
  stock_purchase: "Ledger",
  sale: "Sales ledger",
  other_income: "Income ledger",
  capital: "Capital ledger",
  drawings: "Drawings ledger",
  loan_received: "Loan ledger",
  loan_repayment: "Loan ledger",
};
const CREDITABLE = new Set(["sale", "stock_purchase", "asset_purchase", "expense"]);
const PARTY_ROLE = { sale: "customer", receipt: "customer", stock_purchase: "supplier", asset_purchase: "supplier", expense: "supplier", supplier_payment: "supplier" };
const MONEY_IN = new Set(["sale", "receipt", "other_income", "capital", "loan_received"]);

async function readWithAssistant(text, { token, today, accounts }) {
  if (!token || typeof fetch === "undefined") return null;
  try {
    const response = await fetch("/api/accounts/bookkeeper", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
      body: JSON.stringify({
        text,
        today,
        moneyAccounts: moneyAccounts(accounts).map(account => account.name),
        expenseLedgers: (accounts || []).filter(account => account.groupType === "expense").map(account => account.name),
      }),
    });
    if (!response.ok || !/json/i.test(response.headers.get("content-type") || "")) return null;
    const body = await response.json();
    return body?.intent ? normalizeEntryIntent(body.intent) : null;
  } catch {
    return null;
  }
}

export function AccBookkeeper({
  accounts = [],
  parties = [],
  company = null,
  openInvoices = [],
  token = "",
  today = "",
  aiEnabled = false,
  canWrite = false,
  saving = false,
  onPost,
  onOpenTransactions,
  compact = false,
}) {
  const [input, setInput] = useState("");
  const [entry, setEntry] = useState(null);
  const [reading, setReading] = useState(false);
  const [posted, setPosted] = useState([]);
  const createdRecords = useRef(new Map());

  const ctx = useMemo(() => ({ accounts, parties, company, today, openInvoices }), [accounts, parties, company, today, openInvoices]);
  const draft = useMemo(() => (entry ? buildBookkeeperDraft(entry.fields, ctx) : null), [entry, ctx]);
  const moneyRows = useMemo(() => moneyAccounts(accounts).filter(account => account.isActive !== false), [accounts]);

  const read = async raw => {
    const sentence = String(raw || "").replace(/\s+/g, " ").trim();
    if (!sentence || reading) return;
    const alone = parseEntryText(sentence, { today });
    const amend = entry && !(alone.action && alone.amount);
    const text = amend ? `${entry.text} ${sentence}` : sentence;
    setReading(true);
    try {
      const local = amend ? parseEntryText(text, { today }) : alone;
      const remote = aiEnabled ? await readWithAssistant(text, { token, today, accounts }) : null;
      const intent = combineIntents(remote, local);
      setEntry({
        text,
        said: amend ? [...entry.said, sentence] : [sentence],
        fields: fieldsFromIntent(intent, { accounts, parties, today }),
        requestId: amend ? entry.requestId : newClientRequestId(),
        understood: Boolean(intent.action),
      });
      setInput("");
    } finally {
      setReading(false);
    }
  };

  const setField = patch => setEntry(current => (current ? { ...current, fields: { ...current.fields, ...patch, notes: [] } } : current));

  const changeAction = action => setEntry(current => {
    if (!current) return current;
    const next = fieldsFromIntent({ ...parseEntryText(current.text, { today }), action }, { accounts, parties, today });
    return { ...current, understood: true, fields: { ...next, amount: current.fields.amount, date: current.fields.date } };
  });

  const post = async () => {
    if (!draft?.ok || !onPost) return;
    const ok = await onPost({ draft, requestId: entry.requestId, createdRecords: createdRecords.current });
    if (!ok) return;
    setPosted(list => [{ id: entry.requestId, text: entry.said.join(" "), label: draft.voucherLabel, amount: draft.total }, ...list].slice(0, 5));
    setEntry(null);
  };

  const fields = entry?.fields;
  const action = fields?.action || "";
  const ledgers = ledgerOptions(action, accounts);
  const starter = starterLedger(action, accounts);
  const role = PARTY_ROLE[action] || "";
  const partyRows = role ? parties.filter(party => party.partyType === role && party.isActive !== false) : [];
  const showParty = role && (action === "receipt" || action === "supplier_payment" || fields?.settlement === "credit");
  const showMoney = action && (action === "transfer" || !CREDITABLE.has(action) || fields?.settlement === "paid");
  const gstShown = company?.gstRegistration === "regular" && ["asset_purchase", "expense", "stock_purchase", "sale"].includes(action);

  return (
    <section className={`card acc-bk${compact ? " is-compact" : ""}`} aria-label="Tell FinTrack">
      {compact && <p className="acc-bk-sub">Say it the way you would tell your accountant. Nothing is saved until you post it.</p>}
      {!compact && (
        <header className="acc-bk-head">
          <span className="acc-bk-icon" aria-hidden="true"><MessageSquareText size={18} /></span>
          <div>
            <h2 className="acc-bk-title">Tell FinTrack what happened</h2>
            <p className="acc-bk-sub">Say it the way you would tell your accountant. FinTrack works out the entry, and nothing is saved until you post it.</p>
          </div>
        </header>
      )}

      {posted.length > 0 && (
        <ul className="acc-bk-posted">
          {posted.map(item => (
            <li key={item.id}>
              <CheckCircle2 size={15} aria-hidden="true" />
              <span><strong>Posted</strong> {item.label} · {money(item.amount)}</span>
              <em>{item.text}</em>
            </li>
          ))}
          {onOpenTransactions && <li className="acc-bk-posted-link"><button type="button" className="acc-ov-link-btn" onClick={onOpenTransactions}>Open Transactions</button></li>}
        </ul>
      )}

      {entry && (
        <div className="acc-bk-thread">
          {entry.said.map((line, index) => <p key={`${index}-${line}`} className="acc-bk-said">{line}</p>)}
          {!entry.understood ? (
            <div className="acc-bk-reply">
              <p className="acc-bk-reply-lead">I could not tell what kind of entry this is. Choose one, and I will fill in the rest.</p>
              <div className="acc-bk-choices">
                {BOOKKEEPER_ACTIONS.map(item => <button key={item.id} type="button" className="acc-bk-chip" onClick={() => changeAction(item.id)}>{item.label}</button>)}
              </div>
            </div>
          ) : (
            <div className="acc-bk-reply">
              <p className="acc-bk-reply-lead">{draft?.ok ? "Here is how I will record it." : "I need a little more before I can record it."}</p>
              <div className="acc-bk-fields">
                <label className="acc-bk-field wide"><span>What happened</span>
                  <Select value={action} onChange={event => changeAction(event.target.value)}>
                    {BOOKKEEPER_ACTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </Select>
                </label>
                <label className="acc-bk-field"><span>Amount (₹)</span>
                  <input inputMode="decimal" value={fields.amount} onChange={event => setField({ amount: event.target.value.replace(/[^\d.]/g, "") })} />
                </label>
                <label className="acc-bk-field"><span>Date</span>
                  <input type="date" max={today} value={fields.date} onChange={event => setField({ date: event.target.value })} />
                </label>
                {(ledgers.length > 0 || starter) && action !== "stock_purchase" && (
                  <label className="acc-bk-field"><span>{LEDGER_LABEL[action] || "Ledger"}</span>
                    <Select value={fields.ledgerId} onChange={event => setField({ ledgerId: event.target.value })}>
                      <option value="">Select</option>
                      {starter && <option value={NEW_LEDGER_ID}>New: {starter.name}</option>}
                      {ledgers.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </Select>
                  </label>
                )}
                {CREDITABLE.has(action) && (
                  <label className="acc-bk-field"><span>Payment</span>
                    <Select value={fields.settlement} onChange={event => {
                      const settlement = event.target.value;
                      setField({ settlement, moneyAccountId: settlement === "paid" ? fields.moneyAccountId || moneyRows.find(account => account.accountType === "cash")?.id || "" : "" });
                    }}>
                      <option value="paid">{action === "sale" ? "Received now" : "Paid now"}</option>
                      <option value="credit">On credit</option>
                    </Select>
                  </label>
                )}
                {showMoney && (
                  <label className="acc-bk-field"><span>{action === "transfer" ? "From" : MONEY_IN.has(action) ? "Received into" : "Paid from"}</span>
                    <Select value={fields.moneyAccountId} onChange={event => setField({ moneyAccountId: event.target.value })}>
                      <option value="">Select</option>
                      {moneyRows.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </Select>
                  </label>
                )}
                {action === "transfer" && (
                  <label className="acc-bk-field"><span>To</span>
                    <Select value={fields.toAccountId} onChange={event => setField({ toAccountId: event.target.value })}>
                      <option value="">Select</option>
                      {moneyRows.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </Select>
                  </label>
                )}
                {showParty && (
                  <label className="acc-bk-field"><span>{role === "customer" ? "Customer" : "Supplier"}</span>
                    <Select value={fields.partyId || (fields.partyName ? "__new" : "")} onChange={event => setField({ partyId: event.target.value === "__new" ? "" : event.target.value })}>
                      <option value="">Select</option>
                      {fields.partyName && <option value="__new">New: {fields.partyName}</option>}
                      {partyRows.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}
                    </Select>
                  </label>
                )}
                {gstShown && (
                  <label className="acc-bk-field"><span>GST</span>
                    <Select value={fields.gstRate || "0"} onChange={event => setField({ gstRate: event.target.value === "0" ? "" : event.target.value })}>
                      {GST_RATES.map(rate => <option key={rate} value={String(rate)}>{rate ? `${rate}%` : "No GST"}</option>)}
                    </Select>
                  </label>
                )}
                {gstShown && Number(fields.gstRate) > 0 && (
                  <label className="acc-bk-check">
                    <input type="checkbox" checked={fields.gstIncluded} onChange={event => setField({ gstIncluded: event.target.checked })} />
                    The amount includes GST
                  </label>
                )}
              </div>

              {draft?.newParty && <p className="acc-bk-newparty">{draft.newParty.name} is not in your parties yet. FinTrack adds them as a {draft.newParty.partyType} when you post.</p>}
              {draft?.newLedger && <p className="acc-bk-newparty">There is no {draft.newLedger.name} ledger yet. FinTrack adds it to the chart of accounts when you post.</p>}

              {draft?.effects.length > 0 && (
                <div className="acc-bk-effects">
                  <strong>What changes in your books</strong>
                  <ul>{draft.effects.map(line => <li key={line}>{line}</li>)}</ul>
                </div>
              )}
              {draft?.notes.length > 0 && (
                <div className="acc-bk-notes">
                  <strong>I assumed</strong>
                  <ul>{draft.notes.map(line => <li key={line}>{line}</li>)}</ul>
                </div>
              )}
              {draft?.errors.length > 0 && (
                <ul className="acc-bk-errors" role="alert">{draft.errors.map(line => <li key={line}>{line}</li>)}</ul>
              )}

              {draft?.lines.length > 0 && (
                <details className="acc-bk-ledger">
                  <summary>Accountant view · {draft.voucherLabel} voucher</summary>
                  <table>
                    <thead><tr><th scope="col">Ledger</th><th scope="col">Debit</th><th scope="col">Credit</th></tr></thead>
                    <tbody>
                      {draft.lines.map((line, index) => (
                        <tr key={`${line.coaId}-${index}`}>
                          <td>{line.name}{line.partyLine && (fields.partyId || fields.partyName) ? <em> · {parties.find(party => party.id === fields.partyId)?.name || fields.partyName}</em> : null}</td>
                          <td>{line.debit ? money(line.debit) : ""}</td>
                          <td>{line.credit ? money(line.credit) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><th scope="row">Total</th><td>{money(draft.totals.debit)}</td><td>{money(draft.totals.credit)}</td></tr></tfoot>
                  </table>
                </details>
              )}

              <div className="acc-bk-actions">
                <button type="button" className="btn primary" disabled={!canWrite || saving || !draft?.ok} onClick={post}>{saving ? "Posting…" : "Post entry"}</button>
                <button type="button" className="btn" disabled={saving} onClick={() => setEntry(null)}><RotateCcw size={14} aria-hidden="true" /> Start over</button>
                {!canWrite && <span className="small">Your Accounts role is view-only.</span>}
              </div>
            </div>
          )}
        </div>
      )}

      <form className="acc-bk-form" onSubmit={event => { event.preventDefault(); read(input); }}>
        <input
          aria-label="Describe what happened"
          value={input}
          maxLength={500}
          placeholder={entry ? "Add a detail, such as “paid from HDFC”, or describe a new entry" : "I bought a laptop for ₹85,000 using HDFC"}
          onChange={event => setInput(event.target.value)}
        />
        <button type="submit" className="btn primary" disabled={reading || !input.trim()} aria-label="Read entry">
          <Send size={15} aria-hidden="true" /> {reading ? "Reading…" : "Go"}
        </button>
      </form>
      {!entry && (
        <div className="acc-bk-examples">
          <span>Try:</span>
          {BOOKKEEPER_EXAMPLES.slice(0, compact ? 3 : 5).map(example => (
            <button key={example} type="button" className="acc-bk-chip" disabled={reading} onClick={() => read(example)}>{example}</button>
          ))}
        </div>
      )}
    </section>
  );
}
