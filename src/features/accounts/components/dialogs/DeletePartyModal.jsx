import { Modal } from "../AccUi.jsx";
import { partyTypeLabel } from "../../accountsFormat.js";

export function DeletePartyModal({ saving, setPartyDeleteDialog, confirmDeleteParty, partyDeleteDialog }) {
  return (
    <Modal title="Delete party?" close={() => !saving && setPartyDeleteDialog(null)} actions={<div className="tabs spacer"><button type="button" className="btn danger" disabled={saving} onClick={confirmDeleteParty}>{saving ? "Deleting…" : "Delete"}</button></div>}>
      <p className="copy">Are you sure you want to delete this party?</p>
      <p className="small"><strong>{partyDeleteDialog.party.name}</strong> · {partyTypeLabel(partyDeleteDialog.party.partyType)}</p>
    </Modal>
  );
}
