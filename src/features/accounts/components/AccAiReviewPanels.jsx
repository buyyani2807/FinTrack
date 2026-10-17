import { useState } from "react";
import { openManualWhatsAppShare } from "../../receipts/io/receiptWhatsApp.js";
import { REMINDER_LANGUAGES, draftCollectionReminder, reminderSendAllowed } from "../../finance/model/collectionCopilot.js";
import { money } from "../accountsFormat.js";
import { AccEmpty, AccTable, SimpleMetric } from "./AccUi.jsx";
import { CaBriefSheet } from "./CaBriefSheet.jsx";

const pct = value => (value == null ? "—" : `${value > 0 ? "+" : ""}${value}%`);
const differenceText = alert => alert.pattern === "possible_backdated_entry" ? `${alert.difference} day(s)`
  : alert.pattern === "unusual_inventory_adjustment" ? `${alert.difference} unit(s)` : money(alert.difference);
const SeverityBadge = ({ severity }) => <span className={`ai-risk ai-risk-${severity || "low"}`}>{severity || "low"}</span>;
const Confidence = ({ row }) => <span className="small muted">{row.confidence} confidence{row.confidencePct != null ? ` · ${row.confidencePct}%` : ""}</span>;

export function SourceLink({ link, onOpen, children }) {
  if (!link) return null;
  return <button type="button" className="ai-source-link" onClick={() => onOpen(link)}>{children || link.label}</button>;
}

function DecisionBadge({ decision }) {
  if (!decision) return null;
  const label = { approved: "Approved", rejected: "Rejected", reviewed: "Reviewed", dismissed: "Dismissed", edited: "Edited" }[decision.action] || decision.action;
  return <span className="badge">{label}</span>;
}

function ReviewButtons({ decision, canWrite, busy, onReview, onDismiss }) {
  if (decision || !canWrite) return <DecisionBadge decision={decision} />;
  return <span className="ai-review-actions">
    <button type="button" className="btn" disabled={busy} onClick={onReview}>Mark reviewed</button>
    {onDismiss ? <button type="button" className="btn" disabled={busy} onClick={onDismiss}>Dismiss</button> : null}
  </span>;
}

export function ExpensesPanel({ data, openSource }) {
  const { comparisons, supplierPrices, supplierSpend } = data;
  const nothing = !comparisons.insights.length && !supplierPrices.insights.length && !supplierSpend.length;
  return <>
    <p className="small muted">Period {comparisons.period.from} to {comparisons.period.to}, compared with the same days of earlier periods. Amounts come from posted vouchers.</p>
    {comparisons.insufficientHistory && <AccEmpty title="Insufficient history" copy="At least a month of posted expenses is needed before trends are shown. No trend is reported yet." />}
    {!comparisons.insufficientHistory && nothing && <AccEmpty title="No unusual expense changes" copy="Spending is in line with comparable periods." />}
    {comparisons.insights.length > 0 && <AccTable columns={["Category", { label: "Current", num: true }, { label: "Comparison", num: true }, { label: "Difference", num: true }, { label: "Change", num: true }, "Period", "Severity", "Explanation"]}>
      {comparisons.insights.map(row => <tr key={row.id}>
        <td><strong>{row.category}</strong><div className="small">{row.status}</div></td>
        <td className="acc-num">{money(row.currentAmount)}</td>
        <td className="acc-num">{money(row.comparisonAmount)}<div className="small muted">3-month avg or nearest</div></td>
        <td className="acc-num">{money(row.difference)}</td>
        <td className="acc-num">{pct(row.changePct)}</td>
        <td className="small">{row.period}<div>{row.comparisons.map(item => `${item.label}: ${money(item.amount)} (${pct(item.changePct)})`).join(" · ")}</div></td>
        <td><SeverityBadge severity={row.severity} /></td>
        <td className="small">{row.explanation}<div>{row.recommendedAction}</div><Confidence row={row} /> <SourceLink link={row.source} onOpen={openSource} /></td>
      </tr>)}
    </AccTable>}
    {comparisons.insufficient.length > 0 && <p className="small muted">No trend (insufficient history): {comparisons.insufficient.map(row => row.accountName).join(", ")}.</p>}
    {(supplierPrices.insights.length > 0 || supplierSpend.length > 0) && <h3 className="acc-section-title">Suppliers</h3>}
    {supplierPrices.insights.length > 0 && <AccTable columns={["Supplier · item", { label: "Latest rate", num: true }, { label: "Earlier rate", num: true }, { label: "Change", num: true }, "30 / 60 / 90 days", "Explanation"]}>
      {supplierPrices.insights.map(row => <tr key={row.id}>
        <td><strong>{row.category}</strong><div className="small">{row.status}</div></td>
        <td className="acc-num">{money(row.currentAmount)}</td>
        <td className="acc-num">{money(row.comparisonAmount)}</td>
        <td className="acc-num">{pct(row.changePct)}</td>
        <td className="small">{row.windows.map(window => `${window.days}d: ${window.averageRate == null ? "no history" : `${money(window.averageRate)} (${pct(window.changePct)})`}`).join(" · ")}{row.otherSuppliersRate ? ` · Others: ${money(row.otherSuppliersRate)}` : ""}</td>
        <td className="small">{row.explanation} {row.recommendedAction} <Confidence row={row} /> <SourceLink link={row.source} onOpen={openSource} /></td>
      </tr>)}
    </AccTable>}
    {supplierSpend.length > 0 && <AccTable columns={["Supplier", { label: "This period", num: true }, { label: "3-month avg", num: true }, { label: "Change", num: true }, "Bills", "Explanation"]}>
      {supplierSpend.map(row => <tr key={row.id}>
        <td><strong>{row.category}</strong><div className="small">{row.status}</div></td>
        <td className="acc-num">{money(row.currentAmount)}</td>
        <td className="acc-num">{money(row.comparisonAmount)}</td>
        <td className="acc-num">{pct(row.changePct)}</td>
        <td className="small">{row.entries} vs ~{row.usualEntries}</td>
        <td className="small">{row.explanation} <SourceLink link={row.source} onOpen={openSource} /></td>
      </tr>)}
    </AccTable>}
    {supplierPrices.insufficient.length > 0 && <p className="small muted">Supplier prices without enough history for a trend: {supplierPrices.insufficient.slice(0, 8).map(row => `${row.supplierName} · ${row.itemName}`).join(", ")}.</p>}
  </>;
}

export function CashFlowPanel({ forecast, openSource }) {
  return <>
    <div className="ai-split">
      <section className="card ai-verified">
        <span className="eyebrow">VERIFIED · AS OF {forecast.asOf}</span>
        <h3>Current cash and bank: {money(forecast.currentBalance)}</h3>
        <ul className="ai-plain-list">{forecast.balances.map(row => <li key={row.id}>{row.name}: {money(row.balance)}</li>)}</ul>
        <p className="small">Actual last 30 days ({forecast.actualLast30Days.from} to {forecast.actualLast30Days.to}): in {money(forecast.actualLast30Days.inflows)}, out {money(forecast.actualLast30Days.outflows)}.</p>
      </section>
      <section className="card ai-predicted">
        <span className="eyebrow">PREDICTED · NOT GUARANTEED</span>
        <p>{forecast.explanation}</p>
        <Confidence row={forecast} />
      </section>
    </div>
    <AccTable columns={["Period", "Until", { label: "Expected inflows", num: true }, { label: "Expected outflows", num: true }, { label: "Projected balance", num: true }]}>
      {forecast.horizons.map(row => <tr key={row.days}>
        <td><strong>{row.label}</strong></td>
        <td>{row.until}</td>
        <td className="acc-num">{money(row.inflows)}{row.recurringInflows ? <div className="small muted">incl. {money(row.recurringInflows)} recurring</div> : null}</td>
        <td className="acc-num">{money(row.outflows)}{row.recurringOutflows ? <div className="small muted">incl. {money(row.recurringOutflows)} recurring</div> : null}</td>
        <td className={`acc-num${row.projectedBalance < 0 ? " red" : ""}`}>{money(row.projectedBalance)}</td>
      </tr>)}
    </AccTable>
    {forecast.drivers.length > 0 && <>
      <h3 className="acc-section-title">Major factors</h3>
      <AccTable columns={["Item", "Expected date", { label: "Amount", num: true }, "Basis", "Source"]}>
        {forecast.drivers.map(row => <tr key={row.id}>
          <td>{row.direction === "in" ? "In · " : "Out · "}{row.label}</td>
          <td>{row.date}</td>
          <td className="acc-num">{money(row.amount)}</td>
          <td className="small">{row.basis}</td>
          <td><SourceLink link={row.source} onOpen={openSource} /></td>
        </tr>)}
      </AccTable>
    </>}
    <h3 className="acc-section-title">Assumptions</h3>
    <ul className="ai-plain-list small">{forecast.assumptions.map(item => <li key={item}>{item}</li>)}</ul>
    <SourceLink link={forecast.source} onOpen={openSource} />
  </>;
}

export function CollectionsPanel({ rows, openSource, businessName, asOf, canWrite, onReminderOpened }) {
  const [draft, setDraft] = useState(null);
  const [language, setLanguage] = useState("en");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const compose = (row, lang) => draftCollectionReminder({ name: row.customer, due: row.overdueAmount || row.outstanding, outstanding: row.outstanding, date: row.nextDue || asOf, businessName }, lang);
  const open = row => { setDraft(row); setLanguage("en"); setMessage(compose(row, "en")); setConfirmed(false); setNote(""); };
  const send = () => {
    if (!draft || !reminderSendAllowed({ confirmed, phone: draft.phone, message })) return;
    const result = openManualWhatsAppShare({ phone: draft.phone, message });
    setNote(result.opened ? "WhatsApp opened. Nothing in the books changed." : "WhatsApp did not open. Copy the message and send it yourself.");
    if (result.opened) onReminderOpened?.(draft);
  };
  if (!rows.length) return <AccEmpty title="No open receivables" copy="Customers with outstanding invoices appear here, ranked by risk." />;
  return <>
    <AccTable columns={["Customer", { label: "Outstanding", num: true }, { label: "Days overdue", num: true }, "Risk", "Reason", "Recommended action", "Channel", "Assigned", "Sources"]}>
      {rows.map(row => <tr key={row.id}>
        <td><strong>{row.customer}</strong></td>
        <td className="acc-num">{money(row.outstanding)}</td>
        <td className="acc-num">{row.daysOverdue}</td>
        <td><SeverityBadge severity={row.risk} /></td>
        <td className="small">{row.reason}</td>
        <td className="small">{row.recommendedAction}{row.paymentPattern ? <div className="muted">{row.paymentPattern}</div> : null}</td>
        <td className="small">{row.channel}</td>
        <td className="small">{row.assignedAgent}</td>
        <td className="small">{row.sourceRecords.slice(0, 3).map(item => item.reference).join(", ")}{row.sourceRecords.length > 3 ? "…" : ""} <SourceLink link={row.source} onOpen={openSource} />{canWrite && row.phone ? <div><button type="button" className="btn" onClick={() => open(row)}>Draft message</button></div> : null}</td>
      </tr>)}
    </AccTable>
    {draft && <form className="card collection-copilot-draft" onSubmit={event => { event.preventDefault(); send(); }}>
      <h3>Message for {draft.customer}</h3>
      <label>Language
        <select value={language} onChange={event => { setLanguage(event.target.value); setMessage(compose(draft, event.target.value)); setConfirmed(false); }}>
          {REMINDER_LANGUAGES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label>Message<textarea rows={4} value={message} onChange={event => { setMessage(event.target.value); setConfirmed(false); }} /></label>
      <label className="collection-copilot-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I confirm this message. It is not sent until I open WhatsApp.</label>
      <div className="collection-copilot-draft-actions">
        <button type="submit" className="btn primary" disabled={!reminderSendAllowed({ confirmed, phone: draft.phone, message })}>Open WhatsApp</button>
        <button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button>
      </div>
      {note && <p className="small" role="status">{note}</p>}
    </form>}
  </>;
}

export function AlertsPanel({ alerts, decisions, feature, canWrite, busy, onDecide, openSource, emptyTitle, emptyCopy, header = null }) {
  return <>
    {header}
    {!alerts.length && <AccEmpty title={emptyTitle} copy={emptyCopy} />}
    <div className="ai-alert-list">
      {alerts.map(alert => {
        const decision = decisions.get(`${feature}:${alert.id}`);
        return <article key={alert.id} className={`card ai-alert ai-alert-${alert.severity}`}>
          <header className="ai-alert-head">
            <strong>{alert.title}</strong>
            <span><SeverityBadge severity={alert.severity} /> {alert.module ? <span className="badge">{alert.module}</span> : null} {alert.requiresReview ? <span className="badge warning">Requires review</span> : null}</span>
          </header>
          <dl className="ai-alert-facts">
            {alert.record ? <><dt>Record</dt><dd>{alert.record}</dd></> : null}
            {alert.expected ? <><dt>Expected</dt><dd>{alert.expected}</dd></> : null}
            {alert.actual ? <><dt>Actual</dt><dd>{alert.actual}</dd></> : null}
            {typeof alert.difference === "number" ? <><dt>Difference</dt><dd>{differenceText(alert)}</dd></> : null}
          </dl>
          <p className="small">{alert.explanation}</p>
          <p className="small"><strong>Action:</strong> {alert.recommendedAction}</p>
          <footer className="ai-alert-foot">
            <Confidence row={alert} />
            <SourceLink link={alert.source} onOpen={openSource} />
            {alert.relatedSource ? <SourceLink link={alert.relatedSource} onOpen={openSource} /> : null}
            <ReviewButtons decision={decision} canWrite={canWrite} busy={busy} onReview={() => onDecide(feature, alert, "reviewed")} onDismiss={() => onDecide(feature, alert, "dismissed")} />
          </footer>
        </article>;
      })}
    </div>
  </>;
}

export function MonthEndPanel({ readiness, months, month, setMonth, canWrite, busy, onResolve, openSource, brief }) {
  const [briefOpen, setBriefOpen] = useState(false);
  return <>
    <div className="ai-toolbar">
      <label className="small">Month <select value={month} onChange={event => setMonth(event.target.value)}>{months.map(key => <option key={key} value={key}>{key}</option>)}</select></label>
      <span className="small muted">{readiness.locked ? "This period is locked." : "This period is open."} {readiness.note}</span>
      {brief ? <button type="button" className="btn" onClick={() => setBriefOpen(true)}>Brief for the CA</button> : null}
    </div>
    {briefOpen && brief ? <CaBriefSheet brief={brief} onClose={() => setBriefOpen(false)} /> : null}
    <div className="acc-metric-grid acc-metric-compact">
      <SimpleMetric label="Readiness" value={`${readiness.readinessPct}%`} tone={readiness.readinessPct >= 90 ? "green" : readiness.readinessPct >= 60 ? "gold" : "red"} />
      <SimpleMetric label="Total issues" value={String(readiness.totalIssues)} />
      <SimpleMetric label="Critical" value={String(readiness.critical)} tone={readiness.critical ? "red" : ""} />
      <SimpleMetric label="High" value={String(readiness.high)} />
      <SimpleMetric label="Resolved" value={String(readiness.resolved)} tone="green" />
      <SimpleMetric label="Remaining" value={String(readiness.remaining)} />
    </div>
    <AccTable columns={["Check", "Status", "Result", "Detail", ""]}>
      {readiness.checks.map(check => <tr key={check.key}>
        <td><strong>{check.label}</strong>{check.count > 0 ? <div><SeverityBadge severity={check.severity} /></div> : null}</td>
        <td>{check.status}</td>
        <td>{check.value}</td>
        <td className="small">{check.detail}</td>
        <td>
          {check.count > 0 ? <SourceLink link={check.link} onOpen={openSource}>Resolve issues</SourceLink> : null}
          {check.count > 0 && !check.resolved && canWrite ? <div><button type="button" className="btn" disabled={busy} onClick={() => onResolve(check)}>Mark reviewed</button></div> : null}
        </td>
      </tr>)}
    </AccTable>
  </>;
}

export function BankPanel({ result, decisions, canWrite, busy, isLocked, onApprove, onReject, openSource }) {
  const [choice, setChoice] = useState({});
  if (!result.totalLines) return <AccEmpty title="No bank statements" copy="Import a bank statement in Banking to get reconciliation suggestions." />;
  return <>
    <div className="acc-metric-grid acc-metric-compact">
      <SimpleMetric label="Lines reconciled" value={result.reconciledPct == null ? "—" : `${result.reconciledPct}%`} />
      <SimpleMetric label="Open lines" value={String(result.suggestions.length)} />
      <SimpleMetric label="With a suggestion" value={String(result.suggestions.filter(row => row.actionKind === "match" || row.actionKind === "create_entry").length)} />
    </div>
    <p className="small muted">Approve only after checking the suggestion. A match uses the normal reconciliation; an entry opens a prefilled form and posts nothing until you save it. Locked periods are respected.</p>
    {!result.suggestions.length && <AccEmpty title="All lines reconciled" copy="Every statement line is matched or ignored." />}
    {result.suggestions.length > 0 && <AccTable columns={["Date", "Bank line", { label: "Amount", num: true }, "Likely party", "Related document", "Likely ledger", "Type", { label: "Confidence", num: true }, "Reason", "Action"]}>
      {result.suggestions.map(row => {
        const decision = decisions.get(`bank_reconciliation:${row.id}`);
        const final = decision && (decision.action === "approved" || decision.action === "rejected");
        const locked = isLocked(row);
        const selected = choice[row.id] || row.voucherLineId || "";
        return <tr key={row.id}>
          <td>{row.date}</td>
          <td className="small">{row.description}{row.reference ? ` · ${row.reference}` : ""}<div className="muted">{row.bankAccount}</div></td>
          <td className="acc-num">{row.direction === "out" ? "−" : "+"}{money(row.amount)}</td>
          <td>{row.likelyParty || "—"}</td>
          <td>{row.relatedDocument || "—"}</td>
          <td>{row.likelyLedger || "—"}</td>
          <td className="small">{row.transactionType}</td>
          <td className="acc-num">{row.confidencePct}%</td>
          <td className="small">{row.explanation}<div className="muted">{row.suggestedAction}</div>{row.learnedFromHistory ? <div className="muted">Learned from this company's approved matches.</div> : null}</td>
          <td>
            {final ? <DecisionBadge decision={decision} /> : locked ? <span className="small muted">Period locked</span> : canWrite ? <div className="ai-review-actions">
              {decision ? <DecisionBadge decision={decision} /> : null}
              {row.candidates.length > 0 && (row.actionKind === "match" || row.actionKind === "choose") && <select aria-label="Edit suggestion" value={selected} onChange={event => setChoice(current => ({ ...current, [row.id]: event.target.value }))}>
                <option value="">Choose voucher…</option>
                {row.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label} · {candidate.confidence}%</option>)}
              </select>}
              {(row.actionKind === "match" || row.actionKind === "choose") && <button type="button" className="btn primary" disabled={busy || !selected} onClick={() => onApprove(row, selected, selected !== row.voucherLineId)}>Approve</button>}
              {row.actionKind === "create_entry" && <button type="button" className="btn primary" disabled={busy} onClick={() => onApprove(row, null, false)}>Approve</button>}
              {row.actionKind === "create_entry" && <button type="button" className="btn" disabled={busy} onClick={() => onApprove(row, null, true)}>Edit suggestion</button>}
              <SourceLink link={row.source} onOpen={openSource}>Review</SourceLink>
              <button type="button" className="btn" disabled={busy} onClick={() => onReject(row)}>Reject</button>
            </div> : <SourceLink link={row.source} onOpen={openSource}>Review</SourceLink>}
          </td>
        </tr>;
      })}
    </AccTable>}
  </>;
}

export function InventoryPanel({ rows, openSource }) {
  if (!rows.length) return <AccEmpty title="No stock items" copy="Products with stock tracking appear here." />;
  return <AccTable columns={["Item", "Status", { label: "Current stock", num: true }, { label: "Avg weekly sales", num: true }, { label: "Forecast 30 days", num: true }, "Expected stockout", "Lead time", { label: "Suggested reorder", num: true }, "Explanation"]}>
    {rows.map(row => <tr key={row.id}>
      <td><strong>{row.itemName}</strong></td>
      <td><span className={`badge${row.status === "Likely stockout" ? " warning" : ""}`}>{row.status}</span></td>
      <td className="acc-num">{row.currentStock} {row.unit}</td>
      <td className="acc-num">{row.insufficientHistory ? "—" : row.averageWeeklySales}</td>
      <td className="acc-num">{row.forecastDemand30Days ?? "—"}</td>
      <td>{row.stockoutDate || "—"}{row.daysOfCover != null ? <div className="small muted">{row.daysOfCover} day(s) of cover</div> : null}</td>
      <td>{row.leadTimeDays != null ? `${row.leadTimeDays} days` : "Unknown (7 assumed)"}</td>
      <td className="acc-num">{row.suggestedReorderQty || "—"}</td>
      <td className="small">{row.explanation} {row.recommendedAction} <Confidence row={row} /> <SourceLink link={row.source} onOpen={openSource} /></td>
    </tr>)}
  </AccTable>;
}
