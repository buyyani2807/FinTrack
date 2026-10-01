import { AccMoreMenu, AccMetric, AccPager } from "../components/AccUi.jsx";
import {
  buildGstr1Preparation,
  buildGstr3bPreparation,
  EINVOICE_INTEGRATION_STUB,
  gstrPrepToCsvRows,
  gstrPrepToJson,
} from "../gstPrepExport.js";
import { trackProductEvent } from "../../commercial/productAnalytics.js";
import { roundMoney } from "../accountingModel.js";
import { todayIso } from "../cashbookModel.js";
import { downloadAccountsCsv } from "../accountingExport.js";
import { stockReasonLabel } from "../inventoryModel.js";
import { REPORT_TABS } from "../accountsNavigation.js";
import { money } from "../accountsFormat.js";
import { ReportRangeBar } from "../components/AccPeriodBars.jsx";
import { InvoiceTable } from "../components/InvoiceTable.jsx";

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
      <div className="accounts-action-row spacer">
        <div className="accounts-section-nav">
        {REPORT_TABS.map(item => <button key={item.id} type="button" className={`accounts-section-tab ${(section === "pnl" ? "pnl" : section === "balance" ? "balance" : section === "trial" ? "trial" : reportTab) === item.id ? "active" : ""}`} onClick={() => {
          if (item.id === "pnl") openSection("pnl");
          else if (item.id === "balance") openSection("balance");
          else if (item.id === "trial") openSection("trial");
          else { setSection("reports"); setReportTab(item.id); }
        }}>{item.label}</button>)}
        </div>
        <div className="acc-btn-group">
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
      {(section === "trial" || reportTab === "trial") && section !== "pnl" && section !== "balance" && <>
        <div className="acc-metric-grid three spacer">
          <AccMetric label="Total debit" value={money(tb.totalDebit)} />
          <AccMetric label="Total credit" value={money(tb.totalCredit)} />
          <AccMetric label="Difference" value={money(Math.abs(Number(tb.totalDebit || 0) - Number(tb.totalCredit || 0)))} tone={Math.abs(Number(tb.totalDebit || 0) - Number(tb.totalCredit || 0)) < 0.01 ? "green" : "red"} />
        </div>
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Code</th><th>Account</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th></tr></thead><tbody>
        {tb.rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td className="acc-num">{row.debit ? money(row.debit) : ""}</td><td className="acc-num">{row.credit ? money(row.credit) : ""}</td></tr>)}
        <tr><td></td><td><strong>Total</strong></td><td className="acc-num"><strong>{money(tb.totalDebit)}</strong></td><td className="acc-num"><strong>{money(tb.totalCredit)}</strong></td></tr>
      </tbody></table></div>
      </>}
      {(section === "pnl" || reportTab === "pnl") && section !== "trial" && section !== "balance" && <div className="grid two spacer">
        <div className="card"><strong>Income</strong>{pnl.income.filter(row => row.amount).map(row => <p key={row.id} className="row spacer"><span>{row.name}</span><strong>{money(row.amount)}</strong></p>)}<p className="row"><span>Total income</span><strong className="green">{money(pnl.totalIncome)}</strong></p></div>
        <div className="card"><strong>Expenses</strong>{pnl.expenses.filter(row => row.amount).map(row => <p key={row.id} className="row spacer"><span>{row.name}</span><strong>{money(row.amount)}</strong></p>)}<p className="row"><span>Total expenses</span><strong className="red">{money(pnl.totalExpense)}</strong></p></div>
        {(pnl.openingStock || pnl.closingStock) ? <div className="card span"><strong>Stock (weighted average)</strong>
          <p className="row spacer"><span>Opening stock (charged)</span><strong>{money(pnl.openingStock)}</strong></p>
          <p className="row"><span>Closing stock (added back)</span><strong>{money(pnl.closingStock)}</strong></p>
          <p className="row"><span>Stock adjustment to profit</span><strong className={pnl.stockAdjustment < 0 ? "red" : "green"}>{money(pnl.stockAdjustment)}</strong></p>
          <p className="small">Purchases are expensed when booked; cost of goods sold = opening stock + purchases − closing stock.</p>
        </div> : null}
        <div className="card span"><strong>Net {pnl.net < 0 ? "loss" : "profit"}</strong><p className={`metric-value ${pnl.net < 0 ? "red" : "green"}`}>{money(pnl.net)}</p></div>
      </div>}
      {(section === "balance" || reportTab === "balance") && section !== "trial" && section !== "pnl" && <div className="grid two spacer">
        <div className="card"><strong>Assets {money(sheet.totalAssets)}</strong>{sheet.assets.map(row => <p key={row.id} className="row spacer"><span>{row.code} {row.name}</span><strong>{money(row.balance)}</strong></p>)}</div>
        <div className="card"><strong>Liabilities & equity {money(roundMoney(sheet.totalLiabilities + sheet.totalEquity))}</strong>
          {sheet.liabilities.map(row => <p key={row.id} className="row spacer"><span>{row.code} {row.name}</span><strong>{money(row.balance)}</strong></p>)}
          {sheet.equity.map(row => <p key={row.id} className="row spacer"><span>{row.code} {row.name}</span><strong>{money(row.balance)}</strong></p>)}
          <p className="small">{sheet.balanced ? "Assets equal liabilities plus equity." : "Balance sheet is out of equation."}</p>
        </div>
      </div>}
      {section === "reports" && reportTab === "daybook" && <>
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
      </>}
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
      {section === "reports" && reportTab === "gst" && <div className="acc-gst-reports">
        <p className="copy">GST figures are from this company’s books for the selected dates. They are <strong>calculated</strong> data — not a filed GSTR-1 or GSTR-3B.</p>
        <div className="accounts-action-row spacer">
          <button type="button" className="btn" onClick={() => {
            const prep = buildGstr1Preparation({ vouchers, parties, range });
            downloadAccountsCsv(`fintrack-gstr1-prep-${todayIso()}.csv`, gstrPrepToCsvRows(prep));
            trackProductEvent("gstr1_prep_export");
            setNotice("GSTR-1 preparation CSV downloaded (calculated / not filed).");
          }}>Export GSTR-1 prep CSV</button>
          <button type="button" className="btn" onClick={() => {
            const prep = buildGstr1Preparation({ vouchers, parties, range });
            const blob = new Blob([JSON.stringify(gstrPrepToJson(prep), null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `fintrack-gstr1-prep-${todayIso()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            trackProductEvent("gstr1_prep_json_export");
            setNotice("GSTR-1 preparation JSON downloaded (calculated / not filed).");
          }}>Export GSTR-1 prep JSON</button>
          <button type="button" className="btn" onClick={() => {
            const prep = buildGstr3bPreparation({ vouchers, range });
            downloadAccountsCsv(`fintrack-gstr3b-prep-${todayIso()}.csv`, gstrPrepToCsvRows(prep));
            trackProductEvent("gstr3b_prep_export");
            setNotice("GSTR-3B preparation CSV downloaded (calculated / not filed).");
          }}>Export GSTR-3B prep CSV</button>
          <button type="button" className="btn" onClick={() => {
            const prep = buildGstr3bPreparation({ vouchers, range });
            const blob = new Blob([JSON.stringify(gstrPrepToJson(prep), null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `fintrack-gstr3b-prep-${todayIso()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            trackProductEvent("gstr3b_prep_json_export");
            setNotice("GSTR-3B preparation JSON downloaded (calculated / not filed).");
          }}>Export GSTR-3B prep JSON</button>
        </div>
        <div className="notice spacer">
          <strong>e-Invoice / e-Way:</strong> {EINVOICE_INTEGRATION_STUB.note} Queue a payload from a posted sales voucher — FinTrack will not invent IRNs or call the portal.
        </div>
        <div className="acc-metric-grid three">
          <AccMetric label="Output GST" value={money(gstReport.outputTax)} />
          <AccMetric label="Eligible ITC" value={money(gstReport.inputTax)} />
          <AccMetric label="Net GST payable" value={money(gstReport.netPayable)} tone={gstReport.netPayable > 0 ? "due" : ""} />
        </div>
        <h3 className="acc-section-title">Tax-rate summary</h3>
        <div className="table acc-table-wrap"><table><thead><tr><th>Rate</th><th className="acc-num">Taxable</th><th className="acc-num">CGST</th><th className="acc-num">SGST</th><th className="acc-num">IGST</th></tr></thead><tbody>
          {gstReport.byRate.map(row => <tr key={row.rate}><td>{row.rate}%</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.cgst)}</td><td className="acc-num">{money(row.sgst)}</td><td className="acc-num">{money(row.igst)}</td></tr>)}
          {!gstReport.byRate.length && <tr><td colSpan="5">No GST lines in this period.</td></tr>}
        </tbody></table></div>
        <h3 className="acc-section-title">HSN / SAC</h3>
        <div className="table acc-table-wrap"><table><thead><tr><th>HSN / SAC</th><th className="acc-num">Taxable</th><th className="acc-num">CGST</th><th className="acc-num">SGST</th><th className="acc-num">IGST</th></tr></thead><tbody>
          {gstReport.byHsn.map(row => <tr key={row.hsnSac}><td>{row.hsnSac}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.cgst)}</td><td className="acc-num">{money(row.sgst)}</td><td className="acc-num">{money(row.igst)}</td></tr>)}
          {!gstReport.byHsn.length && <tr><td colSpan="5">No HSN/SAC lines in this period.</td></tr>}
        </tbody></table></div>
        <h3 className="acc-section-title">Output GST</h3>
        <div className="table acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>HSN</th><th className="acc-num">Taxable</th><th className="acc-num">Tax</th></tr></thead><tbody>
          {pagedGstOutput.items.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.hsnSac || "—"}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.cgst + row.sgst + row.igst)}</td></tr>)}
          {!gstReport.output.length && <tr><td colSpan="5">No output GST in this period.</td></tr>}
        </tbody></table></div>
        <AccPager page={pagedGstOutput.page} pages={pagedGstOutput.pages} total={pagedGstOutput.total} onPage={setListPage} noun="output lines" />
        <h3 className="acc-section-title">Input GST / ITC</h3>
        <div className="table acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>HSN</th><th className="acc-num">Taxable</th><th className="acc-num">ITC</th></tr></thead><tbody>
          {gstReport.input.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.hsnSac || "—"}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.itcEligible ? row.cgst + row.sgst + row.igst : 0)}</td></tr>)}
          {!gstReport.input.length && <tr><td colSpan="5">No input GST in this period.</td></tr>}
        </tbody></table></div>
      </div>}
      {section === "reports" && reportTab === "ledger" && <>
        <div className="card accounts-filter-card spacer">
          <label className="accounts-filter-field"><span className="small">Account</span>
            <select value={ledgerId} onChange={event => setLedgerId(event.target.value)}>{visibleAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select>
          </label>
        </div>
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>Narration</th><th className="acc-num">Debit</th><th className="acc-num">Credit</th><th className="acc-num">Balance</th></tr></thead><tbody>
          {ledger.rows.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.narration}</td><td className="acc-num">{row.debit ? money(row.debit) : ""}</td><td className="acc-num">{row.credit ? money(row.credit) : ""}</td><td className="acc-num">{money(row.balance)}</td></tr>)}
          {!ledger.rows.length && <tr><td colSpan="6">No postings on this ledger in this period.</td></tr>}
        </tbody></table></div>
      </>}
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
