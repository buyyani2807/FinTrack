import { Field, Modal } from "../components/CashbookUi.jsx";
import { Select } from "../../../components/Select.jsx";

export function DayClosingModal({ closeClosing, saveClosing, closingForm, setClosingForm, ledgers }) {
  return (
    <Modal title="Day closing" close={closeClosing} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveClosing}>Save closing</button></div>}>
      <div className="form">
        <Field label="Account"><Select value={closingForm.ledgerAccountId} onChange={event => setClosingForm(current => ({ ...current, ledgerAccountId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</Select></Field>
        <Field label="Date"><input type="date" value={closingForm.date} onChange={event => setClosingForm(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Actual balance counted"><input type="number" value={closingForm.actualBalance} onChange={event => setClosingForm(current => ({ ...current, actualBalance: event.target.value }))} /></Field>
      </div>
    </Modal>
  );
}
