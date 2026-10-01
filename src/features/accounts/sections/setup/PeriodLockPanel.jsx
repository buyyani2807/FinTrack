import { lockAccountingPeriod, reopenAccountingPeriod } from "../../accountingRepository.js";
import { Field, AccSetupSection } from "../../components/AccUi.jsx";

export function PeriodLockPanel({ canAdmin, lockForm, setLockForm, saving, run, token, locks, askReason }) {
  return (
    <div id="accounts-period-lock"><AccSetupSection icon="L" title="Period locking" copy="Lock a closed period so posted vouchers in that range cannot be changed. Owner only.">
      {!canAdmin && <p className="small">Only the business owner can lock or reopen periods.</p>}
      {canAdmin && <>
      <div className="form">
        <Field label="From"><input type="date" value={lockForm.from} onChange={event => setLockForm(current => ({ ...current, from: event.target.value }))} /></Field>
        <Field label="To"><input type="date" value={lockForm.to} onChange={event => setLockForm(current => ({ ...current, to: event.target.value }))} /></Field>
      </div>
      <div className="acc-form-actions">
        <button type="button" className="btn primary" disabled={saving} onClick={event => {
          event.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" });
          run(() => lockAccountingPeriod(token, lockForm.from, lockForm.to), "Period locked.");
        }}>{saving ? "Saving…" : "Lock period"}</button>
      </div>
      <div className="table acc-table-wrap"><table><thead><tr><th>Period</th><th>Status</th><th></th></tr></thead><tbody>
        {locks.map(lock => <tr key={lock.id}><td>{lock.periodFrom} to {lock.periodTo}</td><td>{lock.isLocked ? "Locked" : "Reopened"}</td>              <td>{lock.isLocked && <button type="button" className="btn" disabled={saving} onClick={() => askReason("Reopen period", "Reopen", reason => run(() => reopenAccountingPeriod(token, lock.id, reason), "Period reopened."))}>Reopen</button>}</td></tr>)}
      </tbody></table></div>
      </>}
      {!canAdmin && <div className="table spacer acc-table-wrap"><table><thead><tr><th>Period</th><th>Status</th></tr></thead><tbody>
        {locks.map(lock => <tr key={lock.id}><td>{lock.periodFrom} to {lock.periodTo}</td><td>{lock.isLocked ? "Locked" : "Reopened"}</td></tr>)}
        {!locks.length && <tr><td colSpan="2">No period locks yet.</td></tr>}
      </tbody></table></div>}
    </AccSetupSection></div>
  );
}
