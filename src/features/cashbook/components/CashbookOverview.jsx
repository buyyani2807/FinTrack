import { money, PERIOD_IN_OUT_LABEL } from "../cashbookConfig.js";

export function CashbookOverview({ balances, movement, period }) {
  const when = PERIOD_IN_OUT_LABEL[period] || "Period";
  return <>
    <div className="accounts-balance-strip">
      <div className="accounts-balance-item"><span>Cash on hand</span><strong className="gold">{money(balances.cash)}</strong></div>
      <div className="accounts-balance-item"><span>Bank balance</span><strong>{money(balances.bank)}</strong></div>
      <div className="accounts-balance-item"><span>UPI balance</span><strong>{money(balances.upi)}</strong></div>
      <div className="accounts-balance-item"><span>All money</span><strong className="gold">{money(balances.total)}</strong></div>
      <div className="accounts-balance-item accounts-balance-move"><span>{when} in</span><strong className="green">{money(movement.moneyIn)}</strong></div>
      <div className="accounts-balance-item accounts-balance-move"><span>{when} out</span><strong className="red">{money(movement.moneyOut)}</strong></div>
    </div>
    <p className="small accounts-balance-hint">Cash, Bank and UPI are running balances of every recorded transaction, not only today. Collection received by UPI increases UPI, not Cash. Money paid to customers is recorded as money out on the payout method you chose.</p>
  </>;
}
