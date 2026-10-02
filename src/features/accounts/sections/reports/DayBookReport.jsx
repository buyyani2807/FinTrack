import { AccPager } from "../../components/AccUi.jsx";
import { money } from "../../accountsFormat.js";

export function DayBookReport({ pagedBooks, books, setListPage }) {
  return (
    <>
      <div className="table spacer acc-table-wrap acc-daybook-table"><table><thead><tr><th>Date</th><th>Number</th><th>Type</th><th>Narration</th><th className="acc-num">Amount</th></tr></thead><tbody>
      {pagedBooks.items.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.voucherType}</td><td>{row.narration}</td><td className="acc-num">{money(row.debit)}</td></tr>)}
      {!books.length && <tr><td colSpan="5">No posted vouchers in this period. Change the date range or record a transaction.</td></tr>}
    </tbody></table></div>
      <div className="acc-ledger-cards spacer">
        {pagedBooks.items.map(row => (
          <article key={row.id} className="acc-ledger-card">
            <div className="acc-ledger-card-top">
              <strong>{row.voucherNumber}</strong>
              <span className="acc-voucher-chip">{row.voucherType}</span>
            </div>
            <p className="small">{row.date}{row.narration ? ` · ${row.narration}` : ""}</p>
            <p className="acc-ledger-card-amounts"><span>Amount <strong>{money(row.debit)}</strong></span></p>
          </article>
        ))}
        {!books.length && <p className="copy">No posted vouchers in this period. Change the date range or record a transaction.</p>}
      </div>
      <AccPager page={pagedBooks.page} pages={pagedBooks.pages} total={pagedBooks.total} onPage={setListPage} noun="vouchers" />
    </>
  );
}
