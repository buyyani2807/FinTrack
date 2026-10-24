import { money } from "../../accountsFormat.js";
import { Select } from "../../../../components/Select.jsx";
import { AccTable } from "../../components/AccUi.jsx";
import { VoucherNumberLink } from "../../components/SalesInvoiceActions.jsx";
import { canOpenVoucherDocument } from "../../model/salesInvoiceModel.js";

export function LedgerReport({ ledgerId, setLedgerId, visibleAccounts, ledger, onViewDocument }) {
  return (
    <>
      <div className="card accounts-filter-card spacer">
        <label className="accounts-filter-field"><span className="small">Account</span>
          <Select value={ledgerId} onChange={event => setLedgerId(event.target.value)}>{visibleAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</Select>
        </label>
      </div>
      <AccTable columns={["Date", "Voucher", "Narration", { label: "Debit", num: true }, { label: "Credit", num: true }, { label: "Balance", num: true }, "View"]} empty={!ledger.rows.length && "No postings on this ledger in this period."}>
        {ledger.rows.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}>
          <td>{row.date}</td>
          <td><VoucherNumberLink number={row.voucherNumber} voucherType={row.voucherType} onView={onViewDocument && canOpenVoucherDocument(row.voucherType) ? () => onViewDocument(row) : null} /></td>
          <td>{row.narration}</td>
          <td className="acc-num">{row.debit ? money(row.debit) : ""}</td>
          <td className="acc-num">{row.credit ? money(row.credit) : ""}</td>
          <td className="acc-num">{money(row.balance)}</td>
          <td>{onViewDocument && canOpenVoucherDocument(row.voucherType) ? <button type="button" className="btn" onClick={() => onViewDocument(row)}>View</button> : null}</td>
        </tr>)}
      </AccTable>
    </>
  );
}
