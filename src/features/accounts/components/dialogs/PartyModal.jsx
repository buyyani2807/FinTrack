import { Modal } from "../AccUi.jsx";
import { partyHasAccountingUse } from "../../accountingModel.js";
import { PartyFormFields } from "../PartyFields.jsx";

export function PartyModal({ partyForm, closeParty, saving, saveParty, setPartyForm, vouchers }) {
  return (
    <Modal title={partyForm.id ? "Edit party" : "Add party"} close={closeParty} actions={<div className="tabs spacer"><button type="button" className="btn" disabled={saving} onClick={closeParty}>Cancel</button><button type="button" className="btn primary" disabled={saving} onClick={saveParty}>{saving ? "Saving…" : partyForm.id ? "Save changes" : "Save party"}</button></div>}>
      <p className="copy">{partyForm.id ? "Updates this party only. Existing vouchers and ledgers stay attached to the same party." : "Accounts parties are independent of Daily Finance customers and Chit Fund members."}</p>
      <PartyFormFields form={partyForm} setForm={setPartyForm} typeLocked={Boolean(partyForm.id && partyHasAccountingUse(partyForm.id, vouchers))} />
    </Modal>
  );
}
