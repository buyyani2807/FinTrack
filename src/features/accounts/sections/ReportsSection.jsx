import { AccTable, DateSortTh } from "../components/AccUi.jsx";
import { stockReasonLabel } from "../model/inventoryModel.js";
import { money } from "../accountsFormat.js";
import { useDateSort } from "../model/useDateSort.js";
import { ReportRangeBar } from "../components/AccPeriodBars.jsx";
import { InvoiceTable } from "../components/InvoiceTable.jsx";
import { ReportActions } from "./reports/ReportActions.jsx";
import { ReportPlainSpeak } from "./reports/ReportPlainSpeak.jsx";
import { StatementSheet } from "./reports/StatementSheet.jsx";
import {
  agingInsight,
  balanceInsight,
  cashflowInsight,
  countInsight,
  gstInsight,
  pnlInsight,
  trialInsight,
} from "./reports/reportPlainCopy.js";
import { cashflowStatementRows, periodCaption } from "./reports/reportStatementRows.js";
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
  const companyName = activeCompany?.name || settings?.companyName || "";
  const showTrial = (section === "trial" || reportTab === "trial") && section !== "pnl" && section !== "balance";
  const showPnl = (section === "pnl" || reportTab === "pnl") && section !== "trial" && section !== "balance";
  const showBalance = (section === "balance" || reportTab === "balance") && section !== "trial" && section !== "pnl";

  return (
    <div className="acc-panel">
      {reportTab !== "purchase_match" && <>
        <ReportRangeBar fy={fy} lastFy={lastFy} from={rangeFrom} to={rangeTo} onChange={setReportRange} />
        <ReportActions exportReport={exportReport} />
      </>}
      {showTrial && (
        <>
          <ReportPlainSpeak reportId="trial" insight={trialInsight(tb)} />
          <TrialBalanceReport tb={tb} rangeFrom={rangeFrom} rangeTo={rangeTo} companyName={companyName} />
        </>
      )}
      {showPnl && (
        <>
          <ReportPlainSpeak reportId="pnl" insight={pnlInsight(pnl)} />
          <ProfitLossReport pnl={pnl} rangeFrom={rangeFrom} rangeTo={rangeTo} companyName={companyName} />
        </>
      )}
      {showBalance && (
        <>
          <ReportPlainSpeak reportId="balance" insight={balanceInsight(sheet)} />
          <BalanceSheetReport sheet={sheet} rangeFrom={rangeFrom} rangeTo={rangeTo} companyName={companyName} />
        </>
      )}
      {section === "reports" && reportTab === "daybook" && (
        <>
          <ReportPlainSpeak reportId="daybook" insight={countInsight(books, "posted vouchers", "posted voucher")} />
          <DayBookReport books={books} listPage={listPage} setListPage={setListPage} />
        </>
      )}
      {section === "reports" && reportTab === "cashflow" && (
        <>
          <ReportPlainSpeak reportId="cashflow" insight={cashflowInsight(flow)} />
          <StatementSheet
            title="Cash Flow"
            periodLabel={[companyName, periodCaption(rangeFrom, rangeTo)].filter(Boolean).join(" · ")}
            rows={cashflowStatementRows(flow)}
          />
        </>
      )}
      {section === "reports" && reportTab === "receivables" && (
        <>
          <ReportPlainSpeak reportId="receivables" insight={agingInsight(arInvoices, { partyWord: "customer" })} />
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
        </>
      )}
      {section === "reports" && reportTab === "payables" && (
        <>
          <ReportPlainSpeak reportId="payables" insight={agingInsight(apInvoices, { partyWord: "supplier" })} />
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
        </>
      )}
      {section === "reports" && reportTab === "sales" && (
        <>
          <ReportPlainSpeak reportId="sales" insight={countInsight(salesRows, "sales vouchers", "sales voucher")} />
          <DateSortedVoucherTable
            rows={salesRows}
            voucherType="sales"
            empty="No sales vouchers in this period."
            onViewDocument={onViewDocument}
          />
        </>
      )}
      {section === "reports" && reportTab === "purchases" && (
        <>
          <ReportPlainSpeak reportId="purchases" insight={countInsight(purchaseRows, "purchase vouchers", "purchase voucher")} />
          <DateSortedVoucherTable
            rows={purchaseRows}
            voucherType="purchase"
            empty="No purchase vouchers in this period."
            onViewDocument={onViewDocument}
          />
        </>
      )}
      {section === "reports" && reportTab === "gst" && (
        <>
          <ReportPlainSpeak reportId="gst" insight={gstInsight(gstReport)} />
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
        </>
      )}
      {section === "reports" && reportTab === "ledger" && (
        <>
          <ReportPlainSpeak
            reportId="ledger"
            insight={ledgerId
              ? countInsight(ledger?.rows || [], "ledger lines", "ledger line")
              : "Choose an account to see its movement for this period."}
          />
          <LedgerReport
            ledgerId={ledgerId}
            setLedgerId={setLedgerId}
            visibleAccounts={visibleAccounts}
            ledger={ledger}
            onViewDocument={onViewDocument}
          />
        </>
      )}
      {section === "reports" && reportTab === "item_sales" && (
        <>
          <ReportPlainSpeak reportId="item_sales" insight={countInsight(itemSalesRows, "items with sales", "item with sales")} />
          <AccTable columns={["Item", "SKU", { label: "Qty sold", num: true }, { label: "Sales amount", num: true }]} empty={!itemSalesRows.length && "No itemized sales in this period. Use Line items on a Sale entry."}>
            {itemSalesRows.map(row => <tr key={row.itemId || row.name}><td>{row.name}</td><td>{row.sku || "—"}</td><td className="acc-num">{row.quantity}</td><td className="acc-num">{money(row.amount)}</td></tr>)}
          </AccTable>
        </>
      )}
      {section === "reports" && reportTab === "item_purchases" && (
        <>
          <ReportPlainSpeak reportId="item_purchases" insight={countInsight(itemPurchaseRows, "items with purchases", "item with purchases")} />
          <AccTable columns={["Item", "SKU", { label: "Qty bought", num: true }, { label: "Purchase amount", num: true }]} empty={!itemPurchaseRows.length && "No itemized purchases in this period."}>
            {itemPurchaseRows.map(row => <tr key={row.itemId || row.name}><td>{row.name}</td><td>{row.sku || "—"}</td><td className="acc-num">{row.quantity}</td><td className="acc-num">{money(row.amount)}</td></tr>)}
          </AccTable>
        </>
      )}
      {section === "reports" && reportTab === "item_profit" && (
        <>
          <ReportPlainSpeak reportId="item_profit" insight="Open an item to see revenue, cost, and profit for the selected dates." />
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
        </>
      )}
      {section === "reports" && reportTab === "stock_moves" && (
        <>
          <ReportPlainSpeak reportId="stock_moves" insight={countInsight(stockMoveRows, "stock movements", "stock movement")} />
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
        </>
      )}
      {section === "reports" && reportTab === "purchase_match" && (
        <>
          <ReportPlainSpeak
            reportId="purchase_match"
            insight={countInsight(tradeDocuments || [], "trade documents available to match", "trade document available to match")}
          />
          <PurchaseMatchReport
            documents={tradeDocuments || []}
            voucherItemLines={voucherItemLines}
            vouchers={vouchers}
            parties={parties}
            onOpenDocument={onOpenTradeDocument}
          />
        </>
      )}
    </div>
  );
}
