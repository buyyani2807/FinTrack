import { useState } from "react";
import { Modal, Field } from "./AccUi.jsx";
import { Select } from "../../../components/Select.jsx";
import { money } from "../accountsFormat.js";
import { formatIstTime } from "../../../lib/dates.js";
import { newClientRequestId } from "../model/accountingModel.js";
import {
  cashMovementPostTargets,
  cashMovementReasons,
  cashMovementTotals,
  cashMovementVoucherDraft,
  parseCashAmount,
  suggestCashMovementTarget,
  validateCashMovement,
} from "../model/counterCashMovements.js";
import {
  cancelCounterCashMovement,
  markCounterCashMovementPosted,
  postVoucher,
  recordCounterCashMovement,
} from "../data/accountingRepository.js";

/**
 * Cash put into or taken out of the till drawer that is not a sale.
 * Anyone on the Counter can record one. The owner or accountant (`canManage`) also
 * chooses the ledger and posts each record to the books from the same list.
 */
export function CounterCashDialog({
  token,
  online = true,
  canManage = false,
  closed = false,
  unavailable = "",
  date,
  tillId,
  tillLabel,
  cashierName = "",
  accounts = [],
  movements = [],
  onChanged,
  onPosted,
  onClose,
}) {
  const [direction, setDirection] = useState("out");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [targets, setTargets] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const totals = cashMovementTotals(movements);
  const blocked = unavailable || (!online ? "Cash in / out needs the internet." : closed ? "This till is closed for today." : "");

  const run = async work => {
    if (busy) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await work();
    } catch (err) {
      setError(err?.message || "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = event => {
    event?.preventDefault?.();
    const problem = validateCashMovement({ direction, amount, reason, note });
    if (problem) {
      setError(problem);
      return;
    }
    const value = parseCashAmount(amount);
    run(async () => {
      await recordCounterCashMovement(token, {
        direction,
        amount: value,
        reason,
        note: note.trim(),
        tillId,
        tillLabel,
        cashierName,
        date,
        clientRequestId: newClientRequestId(),
      });
      setAmount("");
      setReason("");
      setNote("");
      setSaved(`${direction === "in" ? "Cash in" : "Cash out"} of ${money(value)} recorded.`);
      await onChanged?.();
    });
  };

  const cancel = movement => {
    if (!window.confirm(`Cancel this ${movement.direction === "in" ? "cash in" : "cash out"} of ${money(movement.amount)}?`)) return;
    run(async () => {
      await cancelCounterCashMovement(token, { id: movement.id, reason: "Cancelled at the Counter" });
      await onChanged?.();
    });
  };

  const post = movement => {
    const targetAccountId = targets[movement.id] ?? suggestCashMovementTarget(accounts, movement);
    run(async () => {
      const draft = cashMovementVoucherDraft({ accounts, movement, targetAccountId });
      const voucherId = await postVoucher(token, draft);
      await markCounterCashMovementPosted(token, { id: movement.id, voucherId });
      setSaved(`${money(movement.amount)} posted to the books.`);
      await onChanged?.();
      await onPosted?.(voucherId);
    });
  };

  return (
    <Modal title={`Cash in / out · ${tillLabel || "Till"}`} close={() => !busy && onClose()} wide>
      {blocked ? (
        <p className="notice" role="status">{blocked}</p>
      ) : (
        <form className="form counter-cash-form" onSubmit={save}>
          <div className="counter-mode-toggle span" role="group" aria-label="Cash in or cash out">
            <button type="button" className={`btn${direction === "out" ? " primary" : ""}`} disabled={busy} onClick={() => { setDirection("out"); setReason(""); }}>Cash out</button>
            <button type="button" className={`btn${direction === "in" ? " primary" : ""}`} disabled={busy} onClick={() => { setDirection("in"); setReason(""); }}>Cash in</button>
          </div>
          <Field label="Amount">
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={event => setAmount(event.target.value)}
              disabled={busy}
              aria-label="Amount"
              autoFocus
            />
          </Field>
          <Field label="Reason">
            <Select aria-label="Reason" value={reason} onChange={event => setReason(event.target.value)} disabled={busy}>
              <option value="">Choose a reason</option>
              {cashMovementReasons(direction).map(label => (
                <option key={label} value={label}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field className="span" label={reason === "Other" ? "Note" : "Note (optional)"}>
            <input value={note} maxLength={140} onChange={event => setNote(event.target.value)} disabled={busy} placeholder="What was it for?" />
          </Field>
          <div className="span">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Saving…" : direction === "in" ? "Record cash in" : "Record cash out"}
            </button>
          </div>
        </form>
      )}
      {error ? <p className="acc-form-error" role="alert">{error}</p> : null}
      {saved ? <p className="notice" role="status">{saved}</p> : null}

      <div className="counter-cash-list-head">
        <h3 className="acc-subsection-title">Today on this till</h3>
        <p className="small">Cash in {money(totals.cashIn)} · Cash out {money(totals.cashOut)}</p>
      </div>
      {movements.length ? (
        <ul className="counter-cash-list">
          {movements.map(movement => {
            const postTargets = canManage && !movement.postedVoucherId ? cashMovementPostTargets(accounts, movement.direction) : [];
            const chosen = targets[movement.id] ?? suggestCashMovementTarget(accounts, movement);
            return (
              <li key={movement.id} className="counter-cash-row">
                <div className="counter-cash-copy">
                  <strong>{movement.reason}</strong>
                  <span className="small">
                    {[
                      formatIstTime(movement.createdAt),
                      movement.cashierName,
                      movement.note,
                      movement.postedVoucherId ? "Posted to the books" : "Not posted yet",
                    ].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <strong className={`counter-cash-amount is-${movement.direction}`}>
                  {movement.direction === "in" ? "+" : "−"}{money(movement.amount)}
                </strong>
                {!movement.postedVoucherId ? (
                  <div className="counter-cash-actions">
                    {postTargets.length ? (
                      <>
                        <Select
                          aria-label={`Ledger for ${movement.reason}`}
                          value={chosen}
                          onChange={event => setTargets(current => ({ ...current, [movement.id]: event.target.value }))}
                          disabled={busy}
                        >
                          <option value="">Post to…</option>
                          {postTargets.map(target => (
                            <option key={target.id} value={target.id}>{target.group} · {target.name}</option>
                          ))}
                        </Select>
                        <button type="button" className="btn primary" disabled={busy || !chosen || !online} onClick={() => post(movement)}>Post</button>
                      </>
                    ) : null}
                    <button type="button" className="btn" disabled={busy || !online} onClick={() => cancel(movement)}>Cancel entry</button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small">No cash in or out on this till today.</p>
      )}
      {!canManage && movements.some(movement => !movement.postedVoucherId) ? (
        <p className="small">The owner posts these to the books.</p>
      ) : null}
    </Modal>
  );
}
