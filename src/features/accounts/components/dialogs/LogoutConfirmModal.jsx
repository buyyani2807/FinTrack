import { Modal } from "../AccUi.jsx";

export function LogoutConfirmModal({ signingOut, setConfirmLogout, confirmAccountsLogout }) {
  return (
    <Modal title="Log out of Accounts?" close={() => !signingOut && setConfirmLogout(false)} actions={<div className="tabs spacer"><button type="button" className="btn" disabled={signingOut} onClick={() => setConfirmLogout(false)}>Stay signed in</button><button type="button" className="btn danger" disabled={signingOut} onClick={confirmAccountsLogout}>{signingOut ? "Signing out…" : "Log out"}</button></div>}>
      <p className="copy">This ends your FinTrack session. You will need to sign in again to open Accounts or any other module.</p>
    </Modal>
  );
}
