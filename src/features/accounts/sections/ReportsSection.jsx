import { AccMetric, AccPager } from "../components/AccUi.jsx";
import { stockReasonLabel } from "../inventoryModel.js";
import { money } from "../accountsFormat.js";
import { ReportRangeBar } from "../components/AccPeriodBars.jsx";
import { InvoiceTable } from "../components/InvoiceTable.jsx";
import { ReportActions } from "./reports/ReportActions.jsx";
import { TrialBalanceReport } from "./reports/TrialBalanceReport.jsx";
import { ProfitLossReport } from "./reports/ProfitLossReport.jsx";
import { BalanceSheetReport } from "./reports/BalanceSheetReport.jsx";
import { DayBookReport } from "./reports/DayBookReport.jsx";
import { GstReport } from "./reports/GstReport.jsx";
import { LedgerReport } from "./reports/LedgerReport.jsx";

export function ReportsSection({
  fy,
  lastFy,
  rangeFrom,
  rangeTo,
  setReportRange,
  section,
  reportTab,
  openSection,
  setSection,
  setReportTab,
  exportReport,
  tb,
  pnl,
  sheet,
  pagedBooks,
  books,
  setListPage,
  flow,
  pagedArInvoices,
  orgSettings,
  activeCompany,
  workspace,
  pagedApInvoices,
  salesRows,
  purchaseRows,
  vouchers,
  parties,
  range,
  setNotice,
  gstReport,
  pagedGstOutput,
  ledgerId,
  setLedgerId,
  visibleAccounts,
  ledger,
  itemSalesRows,
  itemPurchaseRows,
  stockMoveRows,
}) {
  return (
    <div className="acc-panel">
      <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
      <ReportActions
        section={section}
        reportTab={reportTab}
        openSection={openSection}
        setSection={setSection}
        setReportTab={setReportTab}
        exportReport={exportReport}
      />
      {(section === "trial" || reportTab === "trial") && section !== "pnl" && section !== "balance" && <TrialBalanceReport tb={tb} />}
      {(section === "pnl" || reportTab === "pnl") && section !== "trial" && section !== "balance" && <ProfitLossReport pnl={pnl} />}
      {(section === "balance" || reportTab === "balance") && section !== "trial" && section !== "pnl" && <BalanceSheetReport sheet={sheet} />}
      {section === "reports" && reportTab === "daybook" && <DayBookReport pagedBooks={pagedBooks} books={books} setListPage={setListPage} />}
      {section === "reports" && reportTab === "cashflow" && <>
        <div className="acc-metric-grid three"><AccMetric label="Inflow" value={money(flow.inflow)} tone="green" /><AccMetric label="Outflow" value={money(flow.outflow)} tone="red" /><AccMetric label="Net cash" value={money(flow.net)} tone="gold" /></div>
        <p className="small">Internal cash/bank/UPI transfers ({money(flow.transfers || 0)}) are excluded from inflow and outflow. Closing cash still follows the ledgers.</p>
      </>}
      {section === "reports" && reportTab === "receivables" && <>
        <InvoiceTable rows={pagedArInvoices.items} kind="receivable" orgSettings={orgSettings} activeCompany={activeCompany} workspace={workspace} />
        <AccPager page={pagedArInvoices.page} pages={pagedArInvoices.pages} total={pagedArInvoices.total} onPage={setListPage} noun="invoices" />
      </>}
      {section === "reports" && reportTab === "payables" && <>
        <InvoiceTable rows={pagedApInvoices.items} kind="payable" orgSettings={orgSettings} activeCompany={activeCompany} workspace={workspace} />
        <AccPager page={pagedApInvoices.page} pages={pagedApInvoices.pages} total={pagedApInvoices.total} onPage={setListPage} noun="invoices" />
      </>}
      {section === "reports" && reportTab === "sales" && <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Number</th><th>Narration</th><th className="acc-num">Amount</th></tr></thead><tbody>
        {salesRows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{money(row.debit)}</td></tr>)}
        {!salesRows.length && <tr><td colSpan="4">No sales vouchers in this period.</td></tr>}
      </tbody></table></div>}
      {section === "reports" && reportTab === "purchases" && <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Number</th><th>Narration</th><th className="acc-num">Amount</th></tr></thead><tbody>
        {purchaseRows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{money(row.debit)}</td></tr>)}
        {!purchaseRows.length && <tr><td colSpan="4">No purchase vouchers in this period.</td></tr>}
      </tbody></table></div>}
      {section === "reports" && reportTab === "gst" && <GstReport
        vouchers={vouchers}
        parties={parties}
        range={range}
        setNotice={setNotice}
        gstReport={gstReport}
        pagedGstOutput={pagedGstOutput}
        setListPage={setListPage}
      />}
      {section === "reports" && reportTab === "ledger" && <LedgerReport
        ledgerId={ledgerId}
        setLedgerId={setLedgerId}
        visibleAccounts={visibleAccounts}
        ledger={ledger}
      />}
      {section === "reports" && reportTab === "item_sales" && (
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Item</th><th>SKU</th><th className="acc-num">Qty sold</th><th className="acc-num">Sales amount</th></tr></thead><tbody>
          {itemSalesRows.map(row => <tr key={row.itemId || row.name}><td>{row.name}</td><td>{row.sku || "—"}</td><td className="acc-num">{row.quantity}</td><td className="acc-num">{money(row.amount)}</td></tr>)}
          {!itemSalesRows.length && <tr><td colSpan="4">No itemized sales in this period. Use Line items on a Sale entry.</td></tr>}
        </tbody></table></div>
      )}
      {section === "reports" && reportTab === "item_purchases" && (
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Item</th><th>SKU</th><th className="acc-num">Qty bought</th><th className="acc-num">Purchase amount</th></tr></thead><tbody>
          {itemPurchaseRows.map(row => <tr key={row.itemId || row.name}><td>{row.name}</td><td>{row.sku || "—"}</td><td className="acc-num">{row.quantity}</td><td className="acc-num">{money(row.amount)}</td></tr>)}
          {!itemPurchaseRows.length && <tr><td colSpan="4">No itemized purchases in this period.</td></tr>}
        </tbody></table></div>
      )}
      {section === "reports" && reportTab === "stock_moves" && (
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Item</th><th>Direction</th><th className="acc-num">Qty</th><th>Reason</th><th>Voucher</th></tr></thead><tbody>
          {stockMoveRows.map(row => <tr key={row.id}><td>{row.movementDate}</td><td>{row.itemName}</td><td>{row.direction}</td><td className="acc-num">{row.quantityDelta}</td><td>{stockReasonLabel(row.reason)}</td><td>{row.voucherNumber || "—"}</td></tr>)}
          {!stockMoveRows.length && <tr><td colSpan="6">No stock movements in this period.</td></tr>}
        </tbody></table></div>
      )}
    </div>
  );
}
