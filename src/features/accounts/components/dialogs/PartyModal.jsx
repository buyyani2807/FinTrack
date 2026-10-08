import { Modal } from "../AccUi.jsx";
import { partyHasAccountingUse, partyTypeChangeNeedsConfirm } from "../../model/accountingModel.js";
import { PartyFormFields } from "../PartyFields.jsx";

export function PartyModal({
  partyForm,
  closeParty,
  saving,
  saveParty,
  setPartyForm,
  vouchers,
  originalType = "",
  typeConfirmed = false,
  onConfirmType,
}) {
  const hasTransactions = Boolean(partyForm.id && partyHasAccountingUse(partyForm.id, vouchers));
  const needsConfirm = partyTypeChangeNeedsConfirm({ id: partyForm.id, partyType: originalType || partyForm.partyType }, partyForm.partyType, vouchers);
  return (
    <Modal title={partyForm.id ? "Edit party" : "Add party"} close={closeParty} actions={<div className="tabs spacer"><button type="button" className="btn primary" disabled={saving || (needsConfirm && !typeConfirmed)} onClick={saveParty}>{saving ? "Saving…" : partyForm.id ? "Save changes" : "Save party"}</button></div>}>
      <p className="copy">{partyForm.id ? "Updates this party only. The party ID stays the same. Existing vouchers and ledgers stay attached to it." : "Accounts parties are independent of Daily Finance customers and Chit Fund members."}</p>
      <PartyFormFields form={partyForm} setForm={setPartyForm} originalType={originalType} hasTransactions={hasTransactions} typeConfirmed={typeConfirmed} onConfirmType={onConfirmType} />
    </Modal>
  );
}
