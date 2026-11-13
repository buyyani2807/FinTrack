import { money } from "../cashbookConfig.js";

/** Explains, from recorded entries only, why a cash / bank / UPI balance is below zero. */
export function NegativeBalanceNotice({ items = [], onShowAccount, openTransfer, canWrite = true }) {
  if (!items.length) return null;
  return (
    <div className="notice spacer cashbook-negative-notice" role="status">
      <strong>{items.length === 1 ? `${items[0].name} is below zero` : "Some balances are below zero"}</strong>
      <p className="small">A balance goes negative when more money is recorded going out of an account than coming in. Nothing is wrong with the arithmetic. Here is how each one adds up.</p>
      {items.map(item => (
        <div key={item.id} className="cashbook-negative-item spacer">
          <p><strong>{item.name}: {money(item.balance)}</strong></p>
          <p className="small">
            Opening {money(item.opening)} + money in {money(item.moneyIn)} − money out {money(item.moneyOut)}
            {(item.transfersIn || item.transfersOut) ? <> + transfers in {money(item.transfersIn)} − transfers out {money(item.transfersOut)}</> : null}
            {" "}= {money(item.balance)}
          </p>
          {item.largestOut.length > 0 && <>
            <p className="small">Largest money out:</p>
            <ul className="small">
              {item.largestOut.map(entry => <li key={entry.id}>{entry.entryDate} · {entry.description} · {money(entry.amount)}</li>)}
            </ul>
          </>}
          <p className="small">Likely reasons:</p>
          <ul className="small">
            {item.reasons.map(reason => <li key={reason}>{reason}</li>)}
          </ul>
          <div className="accounts-action-row">
            {onShowAccount && <button type="button" className="btn" onClick={() => onShowAccount(item.id)}>Show all {item.name} entries</button>}
            {canWrite && openTransfer && <button type="button" className="btn" onClick={openTransfer}>Record a transfer</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
