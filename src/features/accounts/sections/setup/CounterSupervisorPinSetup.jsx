import { useEffect, useState } from "react";
import { loadCounterSupervisorPinStatus, setCounterSupervisorPin } from "../../data/accountingRepository.js";
import { Field } from "../../components/AccUi.jsx";

/** Owner sets the supervisor PIN that approves cashier voids and returns at the Counter. */
export function CounterSupervisorPinSetup({ token, canAdmin, companyId, setError }) {
  const [status, setStatus] = useState(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    if (!token || !companyId) return undefined;
    loadCounterSupervisorPinStatus(token).then(result => { if (alive) setStatus(result || { set: false }); });
    return () => { alive = false; };
  }, [token, companyId]);

  const valid = /^[0-9]{4,8}$/.test(pin);
  const save = async () => {
    if (!valid || !canAdmin) return;
    setBusy(true);
    setNotice("");
    try {
      await setCounterSupervisorPin(token, pin);
      setPin("");
      setStatus({ set: true });
      setNotice("Supervisor PIN saved. Share it only with the person who approves voids and returns.");
    } catch (err) {
      setError?.(err?.message || "Could not save the supervisor PIN.");
    } finally {
      setBusy(false);
    }
  };

  if (status?.unavailable) {
    return <p className="small span">Supervisor PIN needs migration 144_counter_supervisor_override.sql.</p>;
  }
  return (
    <div className="span acc-counter-supervisor">
      <p className="small">
        <strong>Supervisor PIN</strong> — a cashier needs it to void a completed bill or post a return.
        {" "}{status?.set ? "A PIN is set." : "No PIN is set yet, so cashiers cannot void or do returns."}
        {status?.lockedUntil ? " Locked after wrong tries; it opens again in 15 minutes." : ""}
      </p>
      {canAdmin ? (
        <div className="accounts-action-row">
          <Field label={status?.set ? "New supervisor PIN" : "Supervisor PIN"}>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={8}
              placeholder="4 to 8 digits"
              value={pin}
              onChange={event => setPin(event.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <button type="button" className="btn" disabled={!valid || busy} onClick={save}>
            {busy ? "Saving…" : status?.set ? "Change PIN" : "Set PIN"}
          </button>
        </div>
      ) : null}
      {notice ? <p className="small">{notice}</p> : null}
    </div>
  );
}
