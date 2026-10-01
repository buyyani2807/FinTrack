import { Modal } from "../AccUi.jsx";
import { CoaFormFields } from "../CoaFormFields.jsx";

export function CoaModal({ coaForm, closeCoa, saving, saveCoa, setCoaForm, visibleAccounts }) {
  return (
    <Modal title={coaForm.id ? "Edit ledger account" : "Add ledger account"} close={closeCoa} actions={<div className="tabs spacer"><button type="button" className="btn primary" disabled={saving} onClick={saveCoa}>{saving ? "Saving…" : "Save account"}</button></div>}>
      <CoaFormFields form={coaForm} setForm={setCoaForm} accounts={visibleAccounts} />
    </Modal>
  );
}
