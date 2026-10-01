import { money } from "../../accountsFormat.js";

export function LedgerReport({ ledgerId, setLedgerId, visibleAccounts, ledger }) {
  return (
    <>
      <div className="card accounts-filter-card spacer">
        <label className="accounts-filter-field"><span className="small">Account</span>
          <select value={ledgerId} onChange={event => setLedgerId(event.target.value)}>{visibleAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select>
        </label>
      </div>
      <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th><th className="acc-num">Balance</th></tr></thead><tbody>
        {ledger.rows.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{row.debit ? money(row.debit) : ""}</td><td className="acc-num">{row.credit ? money(row.credit) : ""}</td><td className="acc-num">{money(row.balance)}</td></tr>)}
        {!ledger.rows.length && <tr><td colSpan="6">No postings on this ledger in this period.</td></tr>}
      </tbody></table></div>
    </>
  );
}
