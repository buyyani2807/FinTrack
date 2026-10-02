import { MANUAL_IN_CATEGORIES, MANUAL_OUT_CATEGORIES } from "../cashbookModel.js";
import { Select } from "../../../components/Select.jsx";
import { Field, Modal } from "../components/CashbookUi.jsx";

export function ManualEntryModal({ closeManual, saveManual, manualForm, setManualForm, ledgers }) {
  return (
    <Modal title="Add transaction" close={closeManual} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveManual}>Save</button></div>}>
      <div className="form">
        <Field label="Direction"><Select value={manualForm.direction} onChange={event => setManualForm(current => ({ ...current, direction: event.target.value }))}><option value="in">Money in</option><option value="out">Money out</option></Select></Field>
        <Field label="Account"><Select value={manualForm.ledgerAccountId} onChange={event => setManualForm(current => ({ ...current, ledgerAccountId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</Select></Field>
        <Field label="Date"><input type="date" value={manualForm.date} onChange={event => setManualForm(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Category"><Select value={manualForm.category} onChange={event => setManualForm(current => ({ ...current, category: event.target.value }))}>{(manualForm.direction === "in" ? MANUAL_IN_CATEGORIES : MANUAL_OUT_CATEGORIES).map(item => <option key={item}>{item}</option>)}</Select></Field>
        <Field label="Description"><input value={manualForm.description} onChange={event => setManualForm(current => ({ ...current, description: event.target.value }))} /></Field>
        <Field label="Amount"><input type="number" value={manualForm.amount} onChange={event => setManualForm(current => ({ ...current, amount: event.target.value }))} /></Field>
      </div>
    </Modal>
  );
}
