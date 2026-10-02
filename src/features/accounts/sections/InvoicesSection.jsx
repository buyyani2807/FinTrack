import { AccMoreMenu, AccPager } from "../components/AccUi.jsx";
import { money } from "../accountsFormat.js";
import { ReportRangeBar } from "../components/AccPeriodBars.jsx";
import { InvoiceTable } from "../components/InvoiceTable.jsx";

export function InvoicesSection({
  fy,
  lastFy,
  rangeFrom,
  rangeTo,
  setReportRange,
  isInvoicePayables,
  invoiceAging,
  outstandingOnly,
  setOutstandingOnly,
  exportReport,
  pagedInvoiceRows,
  orgSettings,
  activeCompany,
  workspace,
  setListPage,
  invoicePartyRows,
}) {
  return (
    <div className="acc-panel acc-invoice-page">
      <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
      <div className="acc-invoice-kpis">
        <article className={`acc-invoice-kpi ${isInvoicePayables ? "tone-gold" : "tone-blue"}`}>
          <span>Outstanding</span>
          <strong>{money(invoiceAging.total)}</strong>
        </article>
        <article className="acc-invoice-kpi tone-green">
          <span>Current</span>
          <strong>{money(invoiceAging.current)}</strong>
        </article>
        <article className="acc-invoice-kpi tone-red">
          <span>Overdue</span>
          <strong>{money(invoiceAging.overdue)}</strong>
        </article>
      </div>
      <div className="acc-invoice-aging" aria-label="Aging buckets">
        <span><em>1–30</em> {money(invoiceAging.d1_30 || 0)}</span>
        <span><em>31–60</em> {money(invoiceAging.d31_60 || 0)}</span>
        <span><em>61–90</em> {money(invoiceAging.d61_90 || 0)}</span>
        <span><em>90+</em> {money(invoiceAging.d90 || 0)}</span>
      </div>
      <p className="small">New receipts and payments store bill-wise links against selected invoices. Older vouchers without links still use party-level FIFO for remaining allocation.</p>
      <div className="acc-invoice-toolbar">
        <button
          type="button"
          className={`acc-outstanding-toggle${outstandingOnly ? " on" : ""}`}
          aria-pressed={outstandingOnly}
          onClick={() => setOutstandingOnly(current => !current)}
        >
          <span className="acc-switch" aria-hidden="true"><span className="acc-switch-knob" /></span>
          Outstanding only
        </button>
        <div className="acc-invoice-exports">
          <button type="button" className="btn acc-hide-mobile" onClick={() => exportReport("csv")}>Export CSV</button>
          <button type="button" className="btn acc-hide-mobile" onClick={() => exportReport("xlsx")}>Export Excel</button>
          <button type="button" className="btn acc-hide-mobile" onClick={() => exportReport("pdf")}>Download PDF</button>
          <AccMoreMenu
            className="acc-show-mobile"
            label="Export"
            items={[
              { id: "csv", label: "Export CSV", onClick: () => exportReport("csv") },
              { id: "xlsx", label: "Export Excel", onClick: () => exportReport("xlsx") },
              { id: "pdf", label: "Download PDF", onClick: () => exportReport("pdf") },
            ]}
          />
        </div>
      </div>
      <InvoiceTable rows={pagedInvoiceRows.items} kind={isInvoicePayables ? "payable" : "receivable"} orgSettings={orgSettings} activeCompany={activeCompany} workspace={workspace} />
      <AccPager
        page={pagedInvoiceRows.page}
        pages={pagedInvoiceRows.pages}
        total={pagedInvoiceRows.total}
        onPage={setListPage}
        noun="invoices"
      />
      <div className="acc-invoice-parties">
        <span className="acc-invoice-parties-label">Party totals</span>
        {invoicePartyRows.length
          ? invoicePartyRows.map(row => (
            <span key={row.id || row.name} className="acc-chip">{row.name} <strong>{money(row.balance)}</strong></span>
          ))
          : <span className="small">none</span>}
      </div>
    </div>
  );
}
