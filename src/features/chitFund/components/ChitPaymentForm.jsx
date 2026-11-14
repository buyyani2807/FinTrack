import { Select } from "../../../components/Select.jsx";
import { Button, Field } from "../../../components/ui.jsx";
import { CHIT_PAYMENT_MODES } from "../model/chitLabels.js";
import { money, formatChitDate } from "../model/chitFormat.js";

/**
 * Shared Record / Edit payment fields for every Chit type. Callers keep their own save APIs and validation.
 * Read-only context (scheme, member, month, due date, amounts) comes first and is shown as calculated values;
 * the editable payment fields follow.
 */
export function ChitPaymentForm({
  schemeName,
  memberName,
  dueDate,
  recordedBy,
  paymentMonth,
  amountDue,
  amountDueLabel = "Expected",
  previouslyPaid,
  outstanding,
  amount,
  onAmount,
  date,
  onDate,
  mode,
  onMode,
  cash,
  onCash,
  upi,
  onUpi,
  reference,
  onReference,
  notes,
  onNotes,
  error,
  busy,
  onSubmit,
  onCancel,
}) {
  return (
    <form onSubmit={onSubmit}>
      <dl className="chit-form-context spacer" aria-label="Payment details">
        {schemeName ? <div><dt>Scheme</dt><dd>{schemeName}</dd></div> : null}
        <div><dt>Member</dt><dd>{memberName || "Member"}</dd></div>
        {paymentMonth ? <div><dt>Payment month</dt><dd>Month {paymentMonth}</dd></div> : null}
        {dueDate ? <div><dt>Due date</dt><dd>{formatChitDate(dueDate)}</dd></div> : null}
        {amountDue != null && amountDue !== "" ? <div><dt>{amountDueLabel}</dt><dd>{money(amountDue)}</dd></div> : null}
        {previouslyPaid != null && previouslyPaid !== "" ? <div><dt>Previously paid</dt><dd>{money(previouslyPaid)}</dd></div> : null}
        {outstanding != null && outstanding !== "" ? <div><dt>Outstanding</dt><dd className={Number(outstanding) > 0 ? "red" : ""}>{money(outstanding)}</dd></div> : null}
        {recordedBy ? <div><dt>Recorded by</dt><dd>{recordedBy}</dd></div> : null}
      </dl>
      <div className="form spacer">
        <Field className="span" label="Total paid for this month (₹)">
          <input type="number" min="0.01" step="0.01" required value={amount} onChange={event => onAmount(event.target.value)} />
        </Field>
        <Field label="Payment date">
          <input type="date" required value={date} onChange={event => onDate(event.target.value)} />
        </Field>
        <Field label="Payment mode">
          <Select value={mode} onChange={event => onMode(event.target.value)}>
            {CHIT_PAYMENT_MODES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </Select>
        </Field>
        {mode === "cash_upi" ? <>
          <Field label="Cash amount (₹)"><input type="number" min="0" value={cash} onChange={event => onCash(event.target.value)} /></Field>
          <Field label="UPI amount (₹)"><input type="number" min="0" value={upi} onChange={event => onUpi(event.target.value)} /></Field>
          <p className={`small span chit-split-total${Math.abs(Number(cash || 0) + Number(upi || 0) - Number(amount || 0)) > 0.001 ? " red" : ""}`} aria-live="polite">Cash {money(Number(cash || 0))} + UPI {money(Number(upi || 0))} = {money(Number(cash || 0) + Number(upi || 0))} of {money(Number(amount || 0))}</p>
        </> : null}
        <Field label="Reference"><input value={reference} onChange={event => onReference(event.target.value)} /></Field>
        <Field className="span" label="Notes"><input value={notes} onChange={event => onNotes(event.target.value)} /></Field>
      </div>
      {error ? <p className="red small">{error}</p> : null}
      <div className="row spacer">
        {onCancel ? <Button type="button" disabled={busy} onClick={onCancel}>Cancel</Button> : null}
        <Button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save payment"}</Button>
      </div>
    </form>
  );
}
