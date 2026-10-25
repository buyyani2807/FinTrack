import { money, PERIOD_IN_OUT_LABEL } from "../cashbookConfig.js";

export function CashbookOverview({ balances, movement, period, onOpen, showHint = true, moneyFmt = money }) {
  const when = PERIOD_IN_OUT_LABEL[period] || "Period";
  const Tile = onOpen ? "button" : "div";
  const tileProps = onOpen ? { type: "button", onClick: onOpen } : {};
  return <>
    <div className="accounts-balance-strip">
      <Tile className="accounts-balance-item" {...tileProps}><span>Cash on hand</span><strong className="gold">{moneyFmt(balances.cash)}</strong></Tile>
      <Tile className="accounts-balance-item" {...tileProps}><span>Bank balance</span><strong>{moneyFmt(balances.bank)}</strong></Tile>
      <Tile className="accounts-balance-item" {...tileProps}><span>UPI balance</span><strong>{moneyFmt(balances.upi)}</strong></Tile>
      <Tile className="accounts-balance-item" {...tileProps}><span>All money</span><strong className="gold">{moneyFmt(balances.total)}</strong></Tile>
      <Tile className="accounts-balance-item accounts-balance-move" {...tileProps}><span>{when} in</span><strong className="green">{moneyFmt(movement.moneyIn)}</strong></Tile>
      <Tile className="accounts-balance-item accounts-balance-move" {...tileProps}><span>{when} out</span><strong className="red">{moneyFmt(movement.moneyOut)}</strong></Tile>
    </div>
    {showHint && <p className="small accounts-balance-hint">Cash, Bank and UPI are running balances of every recorded transaction, not only today. Collection received by UPI increases UPI, not Cash. Money paid to customers is recorded as money out on the payout method you chose.</p>}
  </>;
}
