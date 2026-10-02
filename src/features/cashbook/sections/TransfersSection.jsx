import { PanelHead } from "../components/CashbookUi.jsx";

export function TransfersSection({ openTransfer }) {
  return (
    <div className="accounts-panel">
      <PanelHead title="Transfers"><button type="button" className="btn primary" onClick={openTransfer}>Transfer money</button></PanelHead>
      <div className="card accounts-info-card">
        <p className="copy">Move money between your own accounts. Transfers are not income or expense.</p>
      </div>
    </div>
  );
}
