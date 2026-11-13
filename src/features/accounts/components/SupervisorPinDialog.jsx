import { useState } from "react";
import { Modal, Field } from "./AccUi.jsx";

/** Asks a supervisor to type the Counter supervisor PIN on the till. Resolves with the PIN or null. */
export function SupervisorPinDialog({ title, note, onSubmit, onCancel }) {
  const [pin, setPin] = useState("");
  const valid = /^[0-9]{4,8}$/.test(pin);
  const submit = event => {
    event?.preventDefault?.();
    if (valid) onSubmit(pin);
  };
  return (
    <Modal
      title={title}
      close={onCancel}
      actions={<div className="tabs spacer">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" disabled={!valid} onClick={submit}>Approve</button>
      </div>}
    >
      <form className="form" onSubmit={submit}>
        <p className="copy span">{note || "A supervisor must enter the supervisor PIN. The approval is recorded on the audit trail."}</p>
        <Field className="span" label="Supervisor PIN">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            onChange={event => setPin(event.target.value.replace(/\D/g, ""))}
            autoFocus
          />
        </Field>
      </form>
    </Modal>
  );
}
