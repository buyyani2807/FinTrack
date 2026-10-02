import { Modal } from "../AccUi.jsx";

export function PartyDeleteBlockedModal({ saving, setPartyDeleteDialog, partyDeleteDialog, setPartyActiveState }) {
  return (
    <Modal title="This party cannot be deleted" close={() => !saving && setPartyDeleteDialog(null)} actions={<div className="tabs spacer">{partyDeleteDialog.party.isActive !== false && <button type="button" className="btn" disabled={saving} onClick={() => setPartyActiveState(partyDeleteDialog.party, false)}>{saving ? "Saving…" : "Deactivate instead"}</button>}<button type="button" className="btn primary" disabled={saving} onClick={() => setPartyDeleteDialog(null)}>Close</button></div>}>
      <p className="copy">This party cannot be deleted because accounting transactions already exist for this party.</p>
      <p className="small">Historical vouchers, ledgers, receivables, payables, and reports stay intact. Deactivate the party if it should no longer appear on new entries.</p>
    </Modal>
  );
}
