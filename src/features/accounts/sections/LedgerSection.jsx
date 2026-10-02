import { AccMoreMenu, AccPager } from "../components/AccUi.jsx";
import { Select } from "../../../components/Select.jsx";
import { ExportGroup } from "../../../components/ui.jsx";
import { todayIso } from "../../../lib/dates.js";
import { downloadAccountsCsv, downloadAccountsExcel, downloadAccountsPdf } from "../io/accountingExport.js";
import { money } from "../accountsFormat.js";
import { ReportRangeBar } from "../components/AccPeriodBars.jsx";

export function LedgerSection({
  fy,
  lastFy,
  rangeFrom,
  rangeTo,
  setReportRange,
  ledgerId,
  setLedgerId,
  visibleAccounts,
  ledger,
  pagedLedger,
  setListPage,
}) {
  const header = ["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"];
  const rows = () => ledger.rows.map(row => [row.date, row.voucherNumber, row.narration, row.debit, row.credit, row.balance]);
  const exports = [
    { id: "csv", label: "CSV", onClick: () => downloadAccountsCsv(`fintrack-ledger-${todayIso()}.csv`, [header, ...rows()]) },
    { id: "xlsx", label: "Excel", onClick: () => downloadAccountsExcel(`fintrack-ledger-${todayIso()}.xlsx`, [header, ...rows()]) },
    { id: "pdf", label: "PDF", onClick: () => downloadAccountsPdf(`fintrack-ledger-${todayIso()}.pdf`, { title: "Ledger", subtitle: `${ledger.account?.code || ""} ${ledger.account?.name || ""}`, rows: [header, ...rows()] }) },
  ];
  return (
    <div className="acc-panel">
      <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
      <div className="card accounts-filter-card spacer">
        <label className="accounts-filter-field"><span className="small">Account</span>
          <Select value={ledgerId} onChange={event => setLedgerId(event.target.value)}>{visibleAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</Select>
        </label>
        <div className="acc-btn-group">
          <ExportGroup className="acc-hide-mobile" formats={exports} />
          <AccMoreMenu className="acc-show-mobile" label="Export" items={exports.map(item => ({ ...item, label: `Export ${item.label}` }))} />
        </div>
      </div>
      <div className="table spacer acc-table-wrap acc-ledger-table"><table><thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th><th className="acc-num">Balance</th></tr></thead><tbody>
        {pagedLedger.items.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{row.debit ? money(row.debit) : ""}</td><td className="acc-num">{row.credit ? money(row.credit) : ""}</td><td className="acc-num">{money(row.balance)}</td></tr>)}
        {!ledger.rows.length && <tr><td colSpan="6">No postings on this ledger yet. Post a voucher to see movement here.</td></tr>}
      </tbody></table></div>
      <div className="acc-ledger-cards spacer">
        {pagedLedger.items.map((row, index) => (
          <article key={`${row.voucherNumber}-${index}`} className="acc-ledger-card">
            <div className="acc-ledger-card-top">
              <strong>{row.voucherNumber}</strong>
              <span className="small">{row.date}</span>
            </div>
            {row.narration ? <p className="small">{row.narration}</p> : null}
            <p className="acc-ledger-card-amounts">
              {row.debit ? <span>Debit <strong>{money(row.debit)}</strong></span> : null}
              {row.credit ? <span>Credit <strong>{money(row.credit)}</strong></span> : null}
              <span>Balance <strong>{money(row.balance)}</strong></span>
            </p>
          </article>
        ))}
        {!ledger.rows.length && <p className="copy">No postings on this ledger yet. Post a voucher to see movement here.</p>}
      </div>
      <AccPager page={pagedLedger.page} pages={pagedLedger.pages} total={pagedLedger.total} onPage={setListPage} noun="postings" />
    </div>
  );
}
