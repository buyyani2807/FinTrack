import { PanelHead } from "../components/CashbookUi.jsx";

export function TransfersSection({ openTransfer, canWrite = true }) {
  return (
    <div className="accounts-panel">
      <PanelHead title="Transfers">{canWrite ? <button type="button" className="btn primary" onClick={openTransfer}>Transfer money</button> : null}</PanelHead>
      <div className="card accounts-info-card">
        <p className="copy">{canWrite ? "Move money between your own accounts. Transfers are not income or expense." : "Transfers between cash, bank, and UPI are recorded by the owner."}</p>
      </div>
    </div>
  );
}
