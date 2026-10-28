import { AccTable, DateSortTh } from "../components/AccUi.jsx";
import { stockReasonLabel } from "../model/inventoryModel.js";
import { money } from "../accountsFormat.js";
import { useDateSort } from "../model/useDateSort.js";
import { ReportRangeBar } from "../components/AccPeriodBars.jsx";
import { InvoiceTable } from "../components/InvoiceTable.jsx";
import {
  BalanceShell,
  CashflowShell,
  PayablesShell,
  PlainReportShell,
  PnlShell,
  ReceivablesShell,
  TrialShell,
} from "../../reportsCenter/AccountsReportPresentations.jsx";
import { ReportActions } from "./reports/ReportActions.jsx";
import { TrialBalanceReport } from "./reports/TrialBalanceReport.jsx";
import { ProfitLossReport } from "./reports/ProfitLossReport.jsx";
import { BalanceSheetReport } from "./reports/BalanceSheetReport.jsx";
import { DayBookReport } from "./reports/DayBookReport.jsx";
import { DateSortedVoucherTable } from "./reports/DateSortedVoucherTable.jsx";
import { GstReport } from "./reports/GstReport.jsx";
import { LedgerReport } from "./reports/LedgerReport.jsx";
import { ItemProfitReport } from "./reports/ItemProfitReport.jsx";
import { PurchaseMatchReport } from "./reports/PurchaseMatchReport.jsx";

export function ReportsSection({
  fy,
  lastFy,
  rangeFrom,
  rangeTo,
  setReportRange,
  section,
  reportTab,
  exportReport,
  tb,
  pnl,
  sheet,
  books,
  setListPage,
  listPage,
  flow,
  arInvoices,
  orgSettings,
  activeCompany,
  workspace,
  apInvoices,
  salesRows,
  purchaseRows,
  onViewDocument,
  vouchers,
  parties,
  range,
  setNotice,
  gstReport,
  ledgerId,
  setLedgerId,
  visibleAccounts,
  ledger,
  itemSalesRows,
  itemPurchaseRows,
  stockMoveRows,
  itemCategories = [],
  costLines = null,
  accountsRole = null,
  onItemProfitExport,
  settings,
  voucherItemLines,
  stockMovements,
  items,
  complianceFilings,
  gstFrequency,
  changeGstFrequency,
  canWrite,
  saving,
  markGstFiled,
  focusItemId = "",
  onFocusHandled,
  token = "",
  aiEnabled = false,
  tradeDocuments = [],
  onOpenTradeDocument,
}) {
  const stockSort = useDateSort(stockMoveRows, "movementDate");
  return (
    <div className="acc-panel">
      {reportTab !== "purchase_match" && <>
        <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
        <ReportActions exportReport={exportReport} />
      </>}
      {(section === "trial" || reportTab === "trial") && section !== "pnl" && section !== "balance" && (
        <TrialShell tb={tb} rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <TrialBalanceReport tb={tb} />
        </TrialShell>
      )}
      {(section === "pnl" || reportTab === "pnl") && section !== "trial" && section !== "balance" && (
        <PnlShell pnl={pnl} rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <ProfitLossReport pnl={pnl} />
        </PnlShell>
      )}
      {(section === "balance" || reportTab === "balance") && section !== "trial" && section !== "pnl" && (
        <BalanceShell sheet={sheet} rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <BalanceSheetReport sheet={sheet} />
        </BalanceShell>
      )}
      {section === "reports" && reportTab === "daybook" && (
        <PlainReportShell reportId="daybook" rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <DayBookReport books={books} listPage={listPage} setListPage={setListPage} />
        </PlainReportShell>
      )}
      {section === "reports" && reportTab === "cashflow" && (
        <CashflowShell flow={flow} rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <p className="small">Internal cash/bank/UPI transfers ({money(flow.transfers || 0)}) are excluded from inflow and outflow. Closing cash still follows the ledgers.</p>
        </CashflowShell>
      )}
      {section === "reports" && reportTab === "receivables" && (
        <ReceivablesShell rows={arInvoices} rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <InvoiceTable
            rows={arInvoices}
            page={listPage}
            onPage={setListPage}
            kind="receivable"
            orgSettings={orgSettings}
            activeCompany={activeCompany}
            workspace={workspace}
            voucherItemLines={voucherItemLines}
            stockMovements={stockMovements}
            items={items}
            onViewDocument={onViewDocument}
          />
        </ReceivablesShell>
      )}
      {section === "reports" && reportTab === "payables" && (
        <PayablesShell rows={apInvoices} rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <InvoiceTable
            rows={apInvoices}
            page={listPage}
            onPage={setListPage}
            kind="payable"
            orgSettings={orgSettings}
            activeCompany={activeCompany}
            workspace={workspace}
            voucherItemLines={voucherItemLines}
            stockMovements={stockMovements}
            items={items}
            onViewDocument={onViewDocument}
          />
        </PayablesShell>
      )}
      {section === "reports" && reportTab === "sales" && (
        <PlainReportShell reportId="sales" rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <DateSortedVoucherTable
            rows={salesRows}
            voucherType="sales"
            empty="No sales vouchers in this period."
            onViewDocument={onViewDocument}
          />
        </PlainReportShell>
      )}
      {section === "reports" && reportTab === "purchases" && (
        <PlainReportShell reportId="purchases" rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <DateSortedVoucherTable
            rows={purchaseRows}
            voucherType="purchase"
            empty="No purchase vouchers in this period."
            onViewDocument={onViewDocument}
          />
        </PlainReportShell>
      )}
      {section === "reports" && reportTab === "gst" && (
        <PlainReportShell
          reportId="gst"
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          insight="These GST figures are from your books for review — they are not a filed portal return."
        >
          <GstReport
            vouchers={vouchers}
            parties={parties}
            range={range}
            setNotice={setNotice}
            gstReport={gstReport}
            listPage={listPage}
            setListPage={setListPage}
            activeCompany={activeCompany}
            workspace={workspace}
            settings={settings}
            voucherItemLines={voucherItemLines}
            complianceFilings={complianceFilings}
            gstFrequency={gstFrequency}
            changeGstFrequency={changeGstFrequency}
            canWrite={canWrite}
            saving={saving}
            markGstFiled={markGstFiled}
          />
        </PlainReportShell>
      )}
      {section === "reports" && reportTab === "ledger" && (
        <PlainReportShell reportId="ledger" rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <LedgerReport
            ledgerId={ledgerId}
            setLedgerId={setLedgerId}
            visibleAccounts={visibleAccounts}
            ledger={ledger}
            onViewDocument={onViewDocument}
          />
        </PlainReportShell>
      )}
      {section === "reports" && reportTab === "item_sales" && (
        <PlainReportShell reportId="item_sales" rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <AccTable columns={["Item", "SKU", { label: "Qty sold", num: true }, { label: "Sales amount", num: true }]} empty={!itemSalesRows.length && "No itemized sales in this period. Use Line items on a Sale entry."}>
            {itemSalesRows.map(row => <tr key={row.itemId || row.name}><td>{row.name}</td><td>{row.sku || "—"}</td><td className="acc-num">{row.quantity}</td><td className="acc-num">{money(row.amount)}</td></tr>)}
          </AccTable>
        </PlainReportShell>
      )}
      {section === "reports" && reportTab === "item_purchases" && (
        <PlainReportShell reportId="item_purchases" rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <AccTable columns={["Item", "SKU", { label: "Qty bought", num: true }, { label: "Purchase amount", num: true }]} empty={!itemPurchaseRows.length && "No itemized purchases in this period."}>
            {itemPurchaseRows.map(row => <tr key={row.itemId || row.name}><td>{row.name}</td><td>{row.sku || "—"}</td><td className="acc-num">{row.quantity}</td><td className="acc-num">{money(row.amount)}</td></tr>)}
          </AccTable>
        </PlainReportShell>
      )}
      {section === "reports" && reportTab === "item_profit" && (
        <PlainReportShell reportId="item_profit" rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <ItemProfitReport
            key={focusItemId || "list"}
            items={items}
            categories={itemCategories}
            movements={stockMovements}
            voucherItemLines={voucherItemLines}
            costLines={costLines}
            vouchers={vouchers}
            parties={parties}
            range={range}
            onViewDocument={onViewDocument}
            workspaceRole={workspace?.role}
            accountsRole={accountsRole}
            onExportReady={onItemProfitExport}
            focusItemId={focusItemId}
            onFocusHandled={onFocusHandled}
            token={token}
            canWrite={canWrite}
            aiEnabled={aiEnabled}
          />
        </PlainReportShell>
      )}
      {section === "reports" && reportTab === "stock_moves" && (
        <PlainReportShell reportId="stock_moves" rangeFrom={rangeFrom} rangeTo={rangeTo}>
          <AccTable
            columns={[
              { label: <DateSortTh label="Date" direction={stockSort.direction} onToggle={stockSort.toggle} /> },
              "Item",
              "Direction",
              { label: "Qty", num: true },
              "Reason",
              "Voucher",
            ]}
            empty={!stockMoveRows.length && "No stock movements in this period."}
          >
            {stockSort.sorted.map(row => (
              <tr key={row.id}>
                <td>{row.movementDate}</td>
                <td>{row.itemName}</td>
                <td>{row.direction}</td>
                <td className="acc-num">{row.quantityDelta}</td>
                <td>{stockReasonLabel(row.reason)}</td>
                <td>{row.voucherNumber || "—"}</td>
              </tr>
            ))}
          </AccTable>
        </PlainReportShell>
      )}
      {section === "reports" && reportTab === "purchase_match" && (
        <PurchaseMatchReport
          documents={tradeDocuments || []}
          voucherItemLines={voucherItemLines}
          vouchers={vouchers}
          parties={parties}
          onOpenDocument={onOpenTradeDocument}
        />
      )}
    </div>
  );
}
