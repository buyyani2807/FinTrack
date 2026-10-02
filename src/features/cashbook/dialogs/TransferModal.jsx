import { Field, Modal } from "../components/CashbookUi.jsx";

export function TransferModal({ closeTransfer, saveTransfer, transferForm, setTransferForm, ledgers }) {
  return (
    <Modal title="Transfer money" close={closeTransfer} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveTransfer}>Transfer</button></div>}>
      <div className="form">
        <Field label="From"><select value={transferForm.fromLedgerId} onChange={event => setTransferForm(current => ({ ...current, fromLedgerId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></Field>
        <Field label="To"><select value={transferForm.toLedgerId} onChange={event => setTransferForm(current => ({ ...current, toLedgerId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={transferForm.date} onChange={event => setTransferForm(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Amount"><input type="number" value={transferForm.amount} onChange={event => setTransferForm(current => ({ ...current, amount: event.target.value }))} /></Field>
      </div>
    </Modal>
  );
}
