import { useMemo, useState } from "react";
import { formatInr } from "../../../lib/formatMoney.js";
import { downloadAccountsZip } from "../io/accountingExport.js";
import { GST_FREQUENCIES, addMonths, daysBetweenIso, dueLabel, gstReturnsForPeriod, monthKey, monthLabel } from "../model/gstCalendar.js";
import { buildGstMonthlyPack } from "../model/gstMonthlyPack.js";

const money = formatInr;
const SEVERITY_LABEL = { error: "Fix", warn: "Review", info: "Note", ok: "Ready" };

function FilingRow({ item, filing, canWrite, saving, today, onMark }) {
  const [editing, setEditing] = useState(false);
  const [filedOn, setFiledOn] = useState(today);
  const [reference, setReference] = useState("");
  const status = filing ? "filed" : item.dueDate < today ? "overdue" : "open";
  return <li className={`acc-gstpack-filing tone-${status}`}>
    <div>
      <strong>{item.label}</strong> <span className="small">· {item.periodLabel}</span>
      <div className="small">{filing ? `Filed ${filing.filedOn}${filing.reference ? ` · ${filing.reference}` : ""}` : `Due ${item.dueDate} · ${dueLabel({ ...item, status, daysLeft: daysBetweenIso(today, item.dueDate) })}`}</div>
    </div>
    {canWrite && !editing && (filing
      ? <button type="button" className="btn ghost" disabled={saving} onClick={() => onMark({ returnCode: item.code, period: item.period, clear: true })}>Undo</button>
      : <button type="button" className="btn" disabled={saving} onClick={() => setEditing(true)}>Mark filed</button>)}
    {editing && <div className="acc-gstpack-mark">
      <input type="date" value={filedOn} max={today} aria-label="Filed on" onChange={event => setFiledOn(event.target.value)} />
      <input value={reference} placeholder="ARN (optional)" maxLength={40} aria-label="ARN" onChange={event => setReference(event.target.value)} />
      <button type="button" className="btn primary" disabled={saving || !filedOn} onClick={async () => {
        const ok = await onMark({ returnCode: item.code, period: item.period, filedOn, reference });
        if (ok) setEditing(false);
      }}>Save</button>
      <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
    </div>}
  </li>;
}

/** One-click monthly GST pack for the CA, plus the filing tracker for that month. */
export function AccGstPackCard({
  company = null,
  businessName = "",
  vouchers = [],
  parties = [],
  voucherItemLines = [],
  filings = null,
  frequency = "monthly",
  onFrequencyChange,
  canWrite = false,
  saving = false,
  today,
  onMarkFiled,
}) {
  const current = monthKey(today);
  const months = useMemo(() => Array.from({ length: 13 }, (_, index) => addMonths(current, -index)), [current]);
  const [period, setPeriod] = useState(() => addMonths(current, -1));
  const [copied, setCopied] = useState(false);
  const pack = useMemo(
    () => buildGstMonthlyPack({ company: company || {}, businessName, period, vouchers, parties, voucherItemLines }),
    [company, businessName, period, vouchers, parties, voucherItemLines],
  );
  const registration = company?.gstRegistration || "unregistered";
  const returns = gstReturnsForPeriod(period, { registration, frequency, stateCode: company?.stateCode || "" });
  const filingByKey = new Map((filings || []).map(row => [`${row.returnCode}:${row.period}`, row]));

  const download = () => downloadAccountsZip(pack.fileName, pack.files);
  const shareWhatsApp = () => {
    if (typeof window !== "undefined") window.open(`https://wa.me/?text=${encodeURIComponent(pack.shareText)}`, "_blank", "noopener,noreferrer");
  };
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(pack.shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return <section className="card acc-gstpack">
    <header className="acc-gstpack-head">
      <div>
        <p className="acc-kicker">For your CA</p>
        <h3>Monthly GST pack</h3>
        <p className="small">One ZIP with GSTR-1 and GSTR-3B preparation, sales and purchase registers, HSN summary, day book and a checks list.</p>
      </div>
      <label className="accounts-filter-field"><span className="small">Month</span>
        <select value={period} onChange={event => setPeriod(event.target.value)}>
          {months.map(key => <option key={key} value={key}>{monthLabel(key)}{key === current ? " (in progress)" : ""}</option>)}
        </select>
      </label>
    </header>

    <div className="acc-gstpack-metrics">
      <div><span className="small">Sales / bills</span><strong>{pack.summary.salesCount} / {pack.summary.purchaseCount}</strong></div>
      <div><span className="small">Outward taxable</span><strong>{money(pack.summary.outwardTaxable)}</strong></div>
      <div><span className="small">Output tax</span><strong>{money(pack.summary.outputTax)}</strong></div>
      <div><span className="small">Eligible ITC</span><strong>{money(pack.summary.eligibleItc)}</strong></div>
      <div><span className="small">Net payable</span><strong className={pack.summary.netPayable > 0 ? "red" : ""}>{money(pack.summary.netPayable)}</strong></div>
    </div>

    <ul className="acc-gstpack-checks">
      {pack.checks.map((check, index) => <li key={`${check.title}-${index}`} className={`tone-${check.severity}`}>
        <span className="acc-gstpack-sev">{SEVERITY_LABEL[check.severity] || check.severity}</span>
        <span><strong>{check.title}</strong>{check.detail ? <span className="small"> — {check.detail}</span> : null}</span>
      </li>)}
    </ul>

    <div className="accounts-action-row">
      <button type="button" className="btn primary" onClick={download}>Download GST pack (ZIP)</button>
      <button type="button" className="btn" onClick={shareWhatsApp}>Send summary on WhatsApp</button>
      <button type="button" className="btn ghost" onClick={copySummary}>{copied ? "Copied" : "Copy summary"}</button>
    </div>
    <p className="small muted">Calculated from your books — not filed. Attach the ZIP in WhatsApp or email after it downloads.</p>

    {(registration === "regular" || registration === "composition") && <div className="acc-gstpack-filings">
      <div className="acc-gstpack-filings-head">
        <strong>Returns for {monthLabel(period)}</strong>
        {registration === "regular" && <label className="accounts-filter-field"><span className="small">You file</span>
          <select value={frequency} onChange={event => onFrequencyChange?.(event.target.value)}>
            {GST_FREQUENCIES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>}
      </div>
      {filings === null && <p className="small">Run migration 082 to track which returns are filed.</p>}
      {filings !== null && <ul>
        {returns.map(item => <FilingRow
          key={`${item.code}:${item.period}`}
          item={item}
          filing={filingByKey.get(`${item.code}:${item.period}`)}
          canWrite={canWrite}
          saving={saving}
          today={today}
          onMark={onMarkFiled}
        />)}
        {!returns.length && <li className="small">No return falls due for this month{frequency === "quarterly" || registration === "composition" ? " (quarterly filer)" : ""}.</li>}
      </ul>}
      <p className="small muted">Due dates are the standard GST dates; check the portal for any government extension.</p>
    </div>}
  </section>;
}
