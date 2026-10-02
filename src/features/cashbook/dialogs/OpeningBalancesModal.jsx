import { Field, Modal } from "../components/CashbookUi.jsx";

export function OpeningBalancesModal({ setShowSetup, saveSetup, setupForm, setSetupForm }) {
  return (
    <Modal title="Set opening balances" close={() => setShowSetup(false)} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveSetup}>Save & sync</button></div>}>
      <p className="copy">Enter opening balances once. Existing FinTrack collections and disbursements will be synced automatically.</p>
      <div className="form spacer">
        <Field label="Opening cash"><input type="number" value={setupForm.openingCash} onChange={event => setSetupForm(current => ({ ...current, openingCash: event.target.value }))} /></Field>
        <Field label="Opening UPI"><input type="number" value={setupForm.openingUpi} onChange={event => setSetupForm(current => ({ ...current, openingUpi: event.target.value }))} /></Field>
        <Field label="Opening bank"><input type="number" value={setupForm.openingBank} onChange={event => setSetupForm(current => ({ ...current, openingBank: event.target.value }))} /></Field>
      </div>
    </Modal>
  );
}
