import { Select } from "../../../components/Select.jsx";
import { Button, Field } from "../../../components/ui.jsx";
import { CHIT_PAYMENT_MODES } from "../model/chitLabels.js";
import { money } from "../model/chitFormat.js";

/** Shared Record / Edit payment fields. Callers keep their own save APIs. */
export function ChitPaymentForm({
  memberName,
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
      <div className="form spacer">
        <Field label="Member"><input disabled value={memberName || "Member"} /></Field>
        {paymentMonth ? <Field label="Payment month"><input disabled value={`Month ${paymentMonth}`} /></Field> : null}
        {amountDue != null && amountDue !== "" ? <Field label={amountDueLabel}><input disabled value={money(amountDue)} /></Field> : null}
        {previouslyPaid != null && previouslyPaid !== "" ? <Field label="Previously paid"><input disabled value={money(previouslyPaid)} /></Field> : null}
        {outstanding != null && outstanding !== "" ? <Field label="Outstanding"><input disabled value={money(outstanding)} /></Field> : null}
        <Field className="span" label="Amount paid (₹)">
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
