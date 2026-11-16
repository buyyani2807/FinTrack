import { useState } from "react";
import { Field, LabeledField } from "../../../../components/ui.jsx";
import { Select } from "../../../../components/Select.jsx";
import { formatIstTime, todayIso } from "../../../../lib/dates.js";
import { money, formatOverviewDate } from "../../accountsFormat.js";
import { AccEmpty, AccMetric, AccTable, Modal } from "../../components/AccUi.jsx";
import { whatsAppShareUrl } from "../../../receipts/io/receiptWhatsApp.js";
import { hasWhatsAppPhone } from "../../../receipts/model/phoneNormalize.js";
import {
  PAYROLL_DISCLAIMER,
  advanceOutstanding,
  inclusiveDays,
  leaveTypeLabel,
  monthLabel,
  rupeesInWords,
} from "../../model/payroll.js";
import {
  ADVANCE_KINDS,
  advanceSummary,
  assertAdvanceDraft,
  leaveBalance,
  mapLink,
  monthsToRecover,
  payslipDeductions,
  payslipEarnings,
  payslipTotals,
  punchHours,
  staffPortalInvite,
} from "../../model/payrollExtras.js";

const plain = value => String(Number(value) || 0);

/* ---------- Payslip ---------- */

export function PayslipView({ slip, companyName, monthIso, payDate }) {
  const totals = payslipTotals(slip);
  return <article className="pay-slip">
    <header className="pay-slip-head">
      <p className="pay-slip-company">{companyName || "Company"}</p>
      <p className="pay-slip-doc">Payslip</p>
      <p className="pay-slip-period">{monthLabel(monthIso)}</p>
    </header>
    <dl className="pay-slip-meta">
      <div><dt>Employee</dt><dd>{slip.name}</dd></div>
      <div><dt>Pay date</dt><dd>{payDate ? formatOverviewDate(payDate) : "—"}</dd></div>
      <div><dt>Paid days</dt><dd>{plain(slip.paidDays)} of {plain(slip.basis)}</dd></div>
      <div><dt>Loss of pay</dt><dd>{plain(slip.lopDays)} {Number(slip.lopDays) === 1 ? "day" : "days"}</dd></div>
    </dl>
    <div className="pay-slip-cols">
      <table>
        <thead><tr><th>Earnings</th><th>Amount</th></tr></thead>
        <tbody>
          {payslipEarnings(slip).map(row => <tr key={row.label}><td>{row.label}</td><td>{money(row.amount)}</td></tr>)}
        </tbody>
        <tfoot><tr><td>Total earnings</td><td>{money(totals.earnings)}</td></tr></tfoot>
      </table>
      <table>
        <thead><tr><th>Deductions</th><th>Amount</th></tr></thead>
        <tbody>
          {payslipDeductions(slip).map(row => <tr key={row.label}><td>{row.label}</td><td>{money(row.amount)}</td></tr>)}
        </tbody>
        <tfoot><tr><td>Total deductions</td><td>{money(totals.deductions)}</td></tr></tfoot>
      </table>
    </div>
    <div className="pay-slip-net">
      <div>
        <span>Net pay</span>
        <strong>{money(slip.net)}</strong>
      </div>
      <p>{rupeesInWords(slip.net)}</p>
    </div>
    <p className="pay-slip-foot">{PAYROLL_DISCLAIMER}</p>
  </article>;
}

/* ---------- Advances and loans ---------- */

const blankAdvance = () => ({ partyId: "", kind: "advance", givenOn: todayIso(), amount: "", emi: "", note: "", payAccountId: "", postToBooks: true });

export function AdvancesTab({ employees, advances, paidFrom, canWrite, busy, onGive, onFinish, onCancel }) {
  const [form, setForm] = useState(blankAdvance);
  const [problem, setProblem] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(null);
  const summary = advanceSummary(advances);
  const nameOf = id => employees.find(person => person.id === id)?.name || "Employee";
  const payAccountId = form.payAccountId || paidFrom.find(account => account.accountType === "cash")?.id || paidFrom[0]?.id || "";
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const give = async () => {
    const draft = { ...form, payAccountId, amount: Number(form.amount || 0), emi: Number(form.emi || 0) };
    const message = assertAdvanceDraft(draft, todayIso());
    setProblem(message);
    if (message) return;
    if (await onGive(draft)) setForm(blankAdvance());
  };
  return <>
    <div className="acc-metric-grid pay-metrics">
      <AccMetric label="Open advances" value={String(summary.open)} hint="Advances and loans not yet recovered" />
      <AccMetric label="Outstanding" value={money(summary.outstanding)} tone={summary.outstanding > 0 ? "amber" : ""} hint="Still to come back from salary" />
      <AccMetric label="Given" value={money(summary.given)} hint="Total of the open advances" />
    </div>
    <p className="copy pay-note">An advance comes back from the next salary. A loan comes back a fixed amount each month. Recovery is taken when the month is posted and can be changed for one month from “This month” on the Pay screen.</p>
    {canWrite && <div className="form pay-toolbar">
      <LabeledField label="Employee">
        <Select value={form.partyId} onChange={event => set({ partyId: event.target.value })}>
          <option value="">Choose</option>
          {employees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </Select>
      </LabeledField>
      <LabeledField label="Type">
        <select value={form.kind} onChange={event => set({ kind: event.target.value })}>
          {ADVANCE_KINDS.map(kind => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
        </select>
      </LabeledField>
      <LabeledField label="Given on"><input type="date" max={todayIso()} value={form.givenOn} onChange={event => set({ givenOn: event.target.value })} /></LabeledField>
      <LabeledField label="Amount"><input inputMode="decimal" value={form.amount} onChange={event => set({ amount: event.target.value })} /></LabeledField>
      <LabeledField label={form.kind === "loan" ? "Recover each month" : "Recover each month (blank = all at once)"}>
        <input inputMode="decimal" value={form.emi} onChange={event => set({ emi: event.target.value })} />
      </LabeledField>
      {form.postToBooks && <LabeledField label="Paid from">
        <Select value={payAccountId} onChange={event => set({ payAccountId: event.target.value })}>
          {!paidFrom.length && <option value="">Add a cash, bank, or UPI ledger</option>}
          {paidFrom.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
        </Select>
      </LabeledField>}
      <Field className="span" label="Note"><input value={form.note} onChange={event => set({ note: event.target.value })} /></Field>
      <label className="pay-check span">
        <input type="checkbox" checked={!form.postToBooks} onChange={event => set({ postToBooks: !event.target.checked })} />
        <span>This payment is already in the books. Record the advance only.</span>
      </label>
      {problem ? <p className="copy span" role="alert">{problem}</p> : null}
      <button type="button" className="btn primary" disabled={busy} onClick={give}>{busy ? "Saving…" : "Give advance"}</button>
    </div>}
    <AccTable columns={["Employee", "Type", "Given on", { label: "Amount", num: true }, { label: "Outstanding", num: true }, "Recovery", ""]} empty={!advances.length && "No advances or loans yet."}>
      {advances.map(row => {
        const left = advanceOutstanding(row);
        const unfinished = row.postToBooks && !row.voucherId && row.status === "open";
        const months = monthsToRecover(row);
        return <tr key={row.id}>
          <td><strong>{nameOf(row.partyId)}</strong>{row.note ? <div className="small">{row.note}</div> : null}</td>
          <td>{ADVANCE_KINDS.find(kind => kind.id === row.kind)?.label || "Advance"} {row.status === "closed"
            ? <span className="acc-status-pill inv-paid">Recovered</span>
            : unfinished ? <span className="acc-status-pill inv-overdue">Not in the books</span> : null}</td>
          <td>{formatOverviewDate(row.givenOn)}</td>
          <td className="acc-num">{money(row.amount)}</td>
          <td className="acc-num">{money(left)}</td>
          <td>{row.status === "closed" ? "—" : row.emi > 0 ? `${money(row.emi)} a month · ${months} ${months === 1 ? "month" : "months"} left` : "From the next salary"}</td>
          <td><div className="acc-btn-group">
            {canWrite && unfinished && <button type="button" className="btn primary" disabled={busy} onClick={() => onFinish(row)}>Finish recording</button>}
            {canWrite && row.status === "open" && row.recovered === 0 && <button type="button" className="btn" disabled={busy} onClick={() => setConfirmCancel(row)}>Cancel</button>}
          </div></td>
        </tr>;
      })}
    </AccTable>
    {confirmCancel && <Modal title="Cancel this advance" close={() => !busy && setConfirmCancel(null)} actions={<button type="button" className="btn primary" disabled={busy} onClick={async () => { await onCancel(confirmCancel); setConfirmCancel(null); }}>{busy ? "Cancelling…" : "Cancel advance"}</button>}>
      <p className="copy">{money(confirmCancel.amount)} given to {nameOf(confirmCancel.partyId)} on {formatOverviewDate(confirmCancel.givenOn)} will be cancelled{confirmCancel.voucherId ? ", along with its payment voucher" : ""}. Nothing has been recovered from salary yet.</p>
    </Modal>}
  </>;
}

/* ---------- Holidays ---------- */

export function HolidaysBlock({ holidays, canWrite, busy, onSave, onRemove }) {
  const [form, setForm] = useState({ date: "", name: "" });
  const add = async () => {
    if (!form.date || !form.name.trim()) return;
    if (await onSave({ date: form.date, name: form.name.trim() })) setForm({ date: "", name: "" });
  };
  return <section className="pay-block">
    <h3>Company holidays</h3>
    <p className="copy pay-note">A holiday is a paid day off for monthly staff. Daily and hourly staff are paid only if they are marked present.</p>
    {canWrite && <div className="form pay-toolbar">
      <LabeledField label="Date"><input type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></LabeledField>
      <LabeledField label="Holiday"><input value={form.name} placeholder="Diwali" onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></LabeledField>
      <button type="button" className="btn" disabled={busy || !form.date || !form.name.trim()} onClick={add}>Add holiday</button>
    </div>}
    {holidays.length ? <ul className="pay-chip-list">
      {holidays.map(row => <li key={row.date}>
        <span><strong>{formatOverviewDate(row.date)}</strong> · {row.name}</span>
        {canWrite && <button type="button" className="btn" disabled={busy} aria-label={`Remove ${row.name}`} onClick={() => onRemove(row.date)}>Remove</button>}
      </li>)}
    </ul> : <p className="copy pay-note">No holidays added for this year.</p>}
  </section>;
}

/* ---------- Punches ---------- */

export function PunchesBlock({ punches, employees, canAdmin, onOpenPhoto }) {
  const [photo, setPhoto] = useState(null);
  const nameOf = id => employees.find(person => person.id === id)?.name || "Employee";
  const open = async (row, kind) => {
    setPhoto({ title: `${nameOf(row.partyId)} · ${formatOverviewDate(row.workDate)} · punch ${kind}`, src: "", error: "" });
    try {
      const body = await onOpenPhoto(row.id, kind);
      setPhoto(current => (current ? { ...current, src: body ? `data:image/jpeg;base64,${body}` : "", error: body ? "" : "This photo is no longer kept. Photos are removed after 90 days." } : current));
    } catch (err) {
      setPhoto(current => (current ? { ...current, error: err.message || "The photo could not be opened." } : current));
    }
  };
  const place = (lat, lng) => {
    const href = mapLink(lat, lng);
    return href ? <a href={href} target="_blank" rel="noreferrer">Map</a> : null;
  };
  return <section className="pay-block">
    <h3>Punches from the staff app</h3>
    <AccTable columns={["Employee", "Date", "In", "Out", { label: "Hours", num: true }, ""]} empty={!punches.length && "No one has punched in this month."}>
      {punches.map(row => <tr key={row.id}>
        <td>{nameOf(row.partyId)}</td>
        <td>{formatOverviewDate(row.workDate)}</td>
        <td>{formatIstTime(row.inAt)} {place(row.inLat, row.inLng)}</td>
        <td>{row.outAt ? <>{formatIstTime(row.outAt)} {place(row.outLat, row.outLng)}</> : "Not yet"}</td>
        <td className="acc-num">{row.outAt ? punchHours(row.inAt, row.outAt) : "—"}</td>
        <td><div className="acc-btn-group">
          {canAdmin && row.hasInPhoto && <button type="button" className="btn" onClick={() => open(row, "in")}>In photo</button>}
          {canAdmin && row.hasOutPhoto && <button type="button" className="btn" onClick={() => open(row, "out")}>Out photo</button>}
        </div></td>
      </tr>)}
    </AccTable>
    {photo && <Modal title={photo.title} close={() => setPhoto(null)}>
      {photo.error ? <p className="copy" role="alert">{photo.error}</p> : photo.src ? <img className="pay-punch-photo" src={photo.src} alt={photo.title} /> : <p className="copy">Opening…</p>}
    </Modal>}
  </section>;
}

/* ---------- Leave balances and requests ---------- */

export function LeaveBalances({ employees, profiles, leaveUsed, year }) {
  const rows = employees.map(person => {
    const profile = profiles.find(row => row.partyId === person.id);
    return { person, balance: leaveBalance({ profile, used: leaveUsed, partyId: person.id }) };
  }).filter(row => row.balance.paid.quota > 0 || row.balance.sick.quota > 0 || row.balance.paid.used > 0 || row.balance.sick.used > 0);
  const cell = entry => (entry.quota > 0 ? `${plain(entry.left)} left of ${plain(entry.quota)}` : entry.used > 0 ? `${plain(entry.used)} taken` : "—");
  return <section className="pay-block">
    <h3>Leave balance · {year}</h3>
    {rows.length ? <AccTable columns={["Employee", "Paid leave", "Sick leave"]}>
      {rows.map(row => <tr key={row.person.id}>
        <td>{row.person.name}</td>
        <td className={row.balance.paid.left !== null && row.balance.paid.left < 0 ? "pay-over" : ""}>{cell(row.balance.paid)}</td>
        <td className={row.balance.sick.left !== null && row.balance.sick.left < 0 ? "pay-over" : ""}>{cell(row.balance.sick)}</td>
      </tr>)}
    </AccTable> : <p className="copy pay-note">Set the paid and sick leave allowed in a year on each employee’s Pay tab to see balances here.</p>}
  </section>;
}

export function LeaveRequests({ requests, employees, canWrite, busy, onDecide }) {
  const waiting = requests.filter(row => row.status === "pending");
  if (!waiting.length) return null;
  const nameOf = id => employees.find(person => person.id === id)?.name || "Employee";
  return <section className="pay-block pay-block-alert">
    <h3>Leave requests from the staff app</h3>
    <AccTable columns={["Employee", "Type", "From", "To", { label: "Days", num: true }, "Note", ""]}>
      {waiting.map(row => <tr key={row.id}>
        <td>{nameOf(row.partyId)}</td>
        <td>{leaveTypeLabel(row.leaveType)}</td>
        <td>{formatOverviewDate(row.fromDate)}</td>
        <td>{formatOverviewDate(row.toDate)}</td>
        <td className="acc-num">{inclusiveDays(row.fromDate, row.toDate)}</td>
        <td>{row.note}</td>
        <td>{canWrite && <div className="acc-btn-group">
          <button type="button" className="btn primary" disabled={busy} onClick={() => onDecide(row.id, true)}>Approve</button>
          <button type="button" className="btn" disabled={busy} onClick={() => onDecide(row.id, false)}>Decline</button>
        </div>}</td>
      </tr>)}
    </AccTable>
  </section>;
}

/* ---------- Staff app ---------- */

export function StaffAppTab({ employees, logins, ready, canAdmin, busy, companyName, onIssue, onDisable }) {
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "/staff" : `${window.location.origin}/staff`;
  if (!ready) {
    return <AccEmpty title="Staff app is not set up yet" copy="Run migration 150_accounts_payroll_phase3.sql in the Supabase SQL editor. Staff can then sign in with a Staff ID and PIN to punch in, see payslips, and ask for leave." />;
  }
  const issue = async person => {
    const result = await onIssue(person);
    if (result?.pin) { setCopied(false); setIssued({ person, ...result }); }
  };
  const invite = issued ? staffPortalInvite({ name: issued.person.name, staffId: issued.staffId, pin: issued.pin, url, companyName }) : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(invite); setCopied(true); } catch { setCopied(false); }
  };
  return <>
    <p className="copy pay-note">Staff open <strong>{url}</strong> on their phone and sign in with a Staff ID and a 6-digit PIN. There they punch in and out with a selfie and their location, see their attendance and payslips, and ask for leave. They see nothing else in the books.</p>
    {!canAdmin && <p className="copy pay-note">Only the owner can issue or switch off a staff login.</p>}
    <AccTable columns={["Employee", "Staff ID", "Status", ""]} empty={!employees.length && "Add an employee first."}>
      {employees.map(person => {
        const login = logins.find(row => row.partyId === person.id);
        return <tr key={person.id}>
          <td><strong>{person.name}</strong>{person.phone ? <div className="small">{person.phone}</div> : null}</td>
          <td>{login?.staffId || "—"}</td>
          <td>{!login
            ? <span className="acc-status-pill inactive">No login</span>
            : !login.enabled ? <span className="acc-status-pill inv-due">Switched off</span>
              : login.locked ? <span className="acc-status-pill inv-overdue">Locked for 15 minutes</span>
                : <span className="acc-status-pill inv-paid">Active</span>}</td>
          <td>{canAdmin && <div className="acc-btn-group">
            <button type="button" className={`btn${login ? "" : " primary"}`} disabled={busy} onClick={() => issue(person)}>{login ? "New PIN" : "Create login"}</button>
            {login?.enabled && <button type="button" className="btn" disabled={busy} onClick={() => onDisable(person)}>Switch off</button>}
          </div>}</td>
        </tr>;
      })}
    </AccTable>
    {issued && <Modal title={`Staff login · ${issued.person.name}`} close={() => setIssued(null)} actions={<div className="acc-btn-group">
      <button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      {hasWhatsAppPhone(issued.person.phone) && <a className="btn primary" href={whatsAppShareUrl(issued.person.phone, invite)} target="_blank" rel="noreferrer">Send on WhatsApp</a>}
    </div>}>
      <p className="copy">Share this now. The PIN is not shown again; if it is lost, create a new one.</p>
      <dl className="pay-login-card">
        <div><dt>Staff ID</dt><dd>{issued.staffId}</dd></div>
        <div><dt>PIN</dt><dd>{issued.pin}</dd></div>
        <div><dt>Open</dt><dd>{url}</dd></div>
      </dl>
    </Modal>}
  </>;
}
