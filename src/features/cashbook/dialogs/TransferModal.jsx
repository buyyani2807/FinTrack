import { Field, Modal } from "../components/CashbookUi.jsx";
import { Select } from "../../../components/Select.jsx";

export function TransferModal({ closeTransfer, saveTransfer, transferForm, setTransferForm, ledgers }) {
  return (
    <Modal
      title="Transfer money"
      close={closeTransfer}
      actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveTransfer}>Transfer</button></div>}
    >
      <p className="copy spacer">
        Moves money from one of your books to another. Total Cash + UPI + Bank stays the same.
      </p>
      <div className="form">
        <Field label="From">
          <Select
            value={transferForm.fromLedgerId}
            onChange={event => setTransferForm(current => ({ ...current, fromLedgerId: event.target.value }))}
          >
            <option value="">Select</option>
            {ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
          </Select>
        </Field>
        <Field label="To">
          <Select
            value={transferForm.toLedgerId}
            onChange={event => setTransferForm(current => ({ ...current, toLedgerId: event.target.value }))}
          >
            <option value="">Select</option>
            {ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}
          </Select>
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={transferForm.date}
            onChange={event => setTransferForm(current => ({ ...current, date: event.target.value }))}
          />
        </Field>
        <Field label="Amount">
          <input
            type="number"
            min="0"
            step="0.01"
            value={transferForm.amount}
            onChange={event => setTransferForm(current => ({ ...current, amount: event.target.value }))}
          />
        </Field>
        <Field className="span" label="Description (optional)">
          <input
            value={transferForm.description}
            placeholder="e.g. Cash deposit to HDFC"
            onChange={event => setTransferForm(current => ({ ...current, description: event.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}
