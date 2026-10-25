import { useEffect, useMemo, useState } from "react";
import { SearchInput } from "../../../../components/ui.jsx";
import { Select } from "../../../../components/Select.jsx";
import { AccPager, FilterField as Field } from "../../components/AccUi.jsx";
import { money, qty } from "../../accountsFormat.js";
import { canOpenVoucherDocument } from "../../model/salesInvoiceModel.js";
import { usePagedList } from "../../model/usePagedList.js";
import {
  canViewItemProfitability,
  filterItemProfit,
  itemProfitability,
  itemProfitExportRows,
  itemProfitTotals,
  ITEM_PROFIT_LIMITATIONS,
} from "../../model/itemProfitability.js";

const SORTS = [
  ["revenue", "Revenue"],
  ["profit", "Gross profit"],
  ["margin", "Margin"],
  ["qty", "Quantity sold"],
  ["stock", "Current stock"],
];

const marginText = value => (value == null ? "—" : `${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

const FlowLine = ({ label, quantity, value, unit, always = false }) => {
  if (!always && !Number(quantity) && !Number(value)) return null;
  return <p className="row"><span>{label}</span><strong>{qty(quantity, unit)}{value == null ? "" : ` · ${money(value)}`}</strong></p>;
};

export function ItemProfitReport({
  items = [],
  categories = [],
  movements = [],
  voucherItemLines = [],
  costLines = null,
  vouchers = [],
  parties = [],
  range = {},
  onViewDocument,
  workspaceRole,
  accountsRole,
  onExportReady,
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stockStatus, setStockStatus] = useState("all");
  const [sort, setSort] = useState("revenue");
  const [selectedId, setSelectedId] = useState("");
  const allowed = canViewItemProfitability({ workspaceRole, accountsRole });
  const report = useMemo(
    () => (allowed ? itemProfitability({ items, movements, voucherItemLines, costLines, vouchers, parties, from: range.from, to: range.to }) : null),
    [allowed, items, movements, voucherItemLines, costLines, vouchers, parties, range.from, range.to],
  );
  const filtered = useMemo(
    () => (report ? filterItemProfit(report.rows, { search, categoryId, stockStatus, sort }) : []),
    [report, search, categoryId, stockStatus, sort],
  );
  const totals = useMemo(() => itemProfitTotals(filtered), [filtered]);
  const paged = usePagedList(filtered, `${range.from}|${range.to}|${search}|${categoryId}|${stockStatus}|${sort}`);
  const selected = filtered.find(row => row.itemId === selectedId) || report?.rows.find(row => row.itemId === selectedId) || null;

  useEffect(() => {
    if (!allowed) {
      onExportReady?.(null);
      return undefined;
    }
    onExportReady?.(() => ({
      filename: `fintrack-item-profit-${range.from || "start"}-to-${range.to || "end"}`,
      rows: itemProfitExportRows(filtered, totals),
    }));
    return () => onExportReady?.(null);
  }, [allowed, filtered, totals, range.from, range.to, onExportReady]);

  if (!allowed) {
    return <p className="notice">Item profitability is available to the owner, accountant, and viewer of these books.</p>;
  }

  return (
    <div className="acc-item-profit">
      <p className="small">Revenue is the posted invoice price after discount and before GST. Cost is the weighted average already used to value stock. Gross profit is revenue minus that cost. Stock value is what is still in hand, not profit.</p>
      <div className="acc-list-toolbar spacer">
        <SearchInput label="Search items" className="acc-list-search" placeholder="Search item or SKU" value={search} onChange={event => { setSearch(event.target.value); setSelectedId(""); }} />
        <Field label="Category">
          <Select value={categoryId} onChange={event => { setCategoryId(event.target.value); setSelectedId(""); }}>
            <option value="">All categories</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
        </Field>
        <Field label="Stock status">
          <Select value={stockStatus} onChange={event => { setStockStatus(event.target.value); setSelectedId(""); }}>
            <option value="all">All</option>
            <option value="in">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
            <option value="negative">Negative</option>
          </Select>
        </Field>
        <Field label="Sort">
          <Select value={sort} onChange={event => setSort(event.target.value)}>
            {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            {SORTS.map(([id, label]) => <option key={`${id}_asc`} value={`${id}_asc`}>{label}, lowest first</option>)}
          </Select>
        </Field>
      </div>
      <p className="small">Brand is not stored on an item. {range.from} to {range.to}.</p>
      <div className="acc-metric-grid acc-metric-compact spacer">
        <article className="card acc-metric-card"><div className="metric-label">Revenue</div><div className="metric-value">{money(totals.revenue)}</div></article>
        <article className="card acc-metric-card"><div className="metric-label">Cost</div><div className="metric-value">{money(totals.cogs)}</div></article>
        <article className="card acc-metric-card"><div className="metric-label">Gross profit</div><div className={`metric-value ${totals.grossProfit < 0 ? "red" : "green"}`}>{money(totals.grossProfit)}</div></article>
        <article className="card acc-metric-card"><div className="metric-label">Margin</div><div className="metric-value">{marginText(totals.marginPercent)}</div></article>
        <article className="card acc-metric-card"><div className="metric-label">Stock value</div><div className="metric-value">{money(totals.stockValue)}</div></article>
      </div>
      <div className="table spacer acc-table-wrap acc-profit-table">
        <table>
          <thead><tr>
            <th>Item</th>
            <th className="acc-num">Qty sold</th>
            <th className="acc-num">Revenue</th>
            <th className="acc-num">Cost</th>
            <th className="acc-num">Profit</th>
            <th className="acc-num">Margin</th>
            <th className="acc-num">Current stock</th>
            <th></th>
          </tr></thead>
          <tbody>
            {paged.items.map(row => (
              <tr key={row.itemId}>
                <td data-label="Item"><strong>{row.name}</strong>{row.sku ? <span className="small"> {row.sku}</span> : null}{row.needsReview ? <span className="small red"> Requires review</span> : null}</td>
                <td className="acc-num" data-label="Qty sold">{qty(row.quantitySold, row.unit)}</td>
                <td className="acc-num" data-label="Revenue">{money(row.revenue)}</td>
                <td className="acc-num" data-label="Cost">{money(row.cogs)}</td>
                <td className={`acc-num ${row.grossProfit < 0 ? "red" : ""}`} data-label="Profit">{money(row.grossProfit)}</td>
                <td className="acc-num" data-label="Margin">{marginText(row.marginPercent)}</td>
                <td className={`acc-num ${row.stockQuantity < 0 ? "red" : ""}`} data-label="Current stock">{qty(row.stockQuantity, row.unit)}</td>
                <td data-label=""><button type="button" className="btn" onClick={() => setSelectedId(row.itemId)}>Open</button></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={8}>No items match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <AccPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} noun="items" />
      {selected && <ItemProfitDetail row={selected} vouchers={vouchers} onViewDocument={onViewDocument} onClose={() => setSelectedId("")} />}
      <p className="small spacer">{ITEM_PROFIT_LIMITATIONS[0]} {ITEM_PROFIT_LIMITATIONS[2]}</p>
    </div>
  );
}

function ItemProfitDetail({ row, vouchers, onViewDocument, onClose }) {
  const ledger = usePagedList(row.ledger, row.itemId);
  const invoices = usePagedList(row.invoices, `${row.itemId}|invoices`);
  const openVoucher = entry => {
    const voucher = vouchers.find(item => item.id === entry.voucherId);
    if (voucher && onViewDocument && canOpenVoucherDocument(voucher.voucherType)) onViewDocument(voucher);
  };
  const unit = row.unit;
  const flow = row.flow;
  return (
    <div className="card spacer acc-item-profit-detail">
      <div className="toolbar"><strong>{row.name}</strong><button type="button" className="btn" onClick={onClose}>Back to items</button></div>
      <p className="small">{row.sku || "No SKU"} · {row.from || "Start"} to {row.to || "today"}</p>
      {row.needsReview && <p className="notice">{row.reconciled ? "Requires review." : "Stock movement requires review. The recorded movements do not fully reconcile with the current stock balance."}</p>}
      {row.warnings.map(warning => <p key={`${warning.code}-${warning.message}`} className="small red">{warning.message}</p>)}
      <div className="grid two spacer">
        <div>
          <p className="row"><span>Current stock</span><strong>{qty(row.stockQuantity, unit)}</strong></p>
          <p className="row"><span>Stock value</span><strong>{money(row.stockValue)}</strong></p>
          <p className="row"><span>Purchased</span><strong>{qty(row.purchasedQuantity, unit)}</strong></p>
          <p className="row"><span>Sold</span><strong>{qty(row.quantitySold, unit)}</strong></p>
          <p className="row"><span>Customer returns</span><strong>{qty(row.returnedQuantity, unit)}</strong></p>
        </div>
        <div>
          <p className="row"><span>Revenue</span><strong>{money(row.revenue)}</strong></p>
          <p className="row"><span>Cost of goods sold</span><strong>{money(row.cogs)}</strong></p>
          <p className="row"><span>Gross profit</span><strong className={row.grossProfit < 0 ? "red" : "green"}>{money(row.grossProfit)}</strong></p>
          <p className="row"><span>Margin</span><strong>{marginText(row.marginPercent)}</strong></p>
          <p className="row"><span>Average selling price</span><strong>{row.averageSellingPrice == null ? "—" : money(row.averageSellingPrice)}</strong></p>
          <p className="row"><span>Average cost</span><strong>{row.averageCostPrice == null ? "—" : money(row.averageCostPrice)}</strong></p>
          <p className="row"><span>Average purchase price</span><strong>{row.averagePurchasePrice == null ? "—" : money(row.averagePurchasePrice)}</strong></p>
        </div>
      </div>
      <strong>Where the quantity went</strong>
      <FlowLine label="Brought forward" quantity={row.openingQuantity} unit={unit} always />
      <FlowLine label="Opening stock" quantity={flow.opening} value={row.flowValue.opening} unit={unit} />
      <FlowLine label="Purchases" quantity={flow.purchase} value={row.flowValue.purchase} unit={unit} />
      <FlowLine label="Goods receipts" quantity={flow.goodsReceipt} value={row.flowValue.goodsReceipt} unit={unit} />
      <FlowLine label="Sold" quantity={flow.sale} value={row.flowValue.sale} unit={unit} />
      <FlowLine label="Customer returns" quantity={flow.salesReturn} value={row.flowValue.salesReturn} unit={unit} />
      <FlowLine label="Purchase returns" quantity={flow.purchaseReturn} value={row.flowValue.purchaseReturn} unit={unit} />
      <FlowLine label="Delivery challans" quantity={flow.delivery} value={row.flowValue.delivery} unit={unit} />
      <FlowLine label="Adjusted in" quantity={flow.adjustmentIn} value={row.flowValue.adjustmentIn} unit={unit} />
      <FlowLine label="Adjusted" quantity={flow.adjustmentOut} value={row.flowValue.adjustmentOut} unit={unit} />
      <FlowLine label="Reversals in" quantity={flow.reversalIn} value={row.flowValue.reversalIn} unit={unit} />
      <FlowLine label="Reversals out" quantity={flow.reversalOut} value={row.flowValue.reversalOut} unit={unit} />
      <FlowLine label="Available stock" quantity={row.stockQuantity} value={row.stockValue} unit={unit} always />
      <p className="small">Damaged stock, wastage, and warehouse transfers are not separate movement types. A write-off is an adjustment. A delivery challan leaves stock without a sale.</p>
      <strong>Stock reconciliation</strong>
      <p className="small">Opening {qty(row.openingQuantity, unit)} + movements {qty(row.expectedQuantity - row.openingQuantity, unit)} = {qty(row.expectedQuantity, unit)}. Closing quantity is {qty(row.stockQuantity, unit)}.</p>
      <strong>Profit by date</strong>
      {!row.profitByDate.length && <p className="small">No posted sales in this period.</p>}
      {row.profitByDate.map(day => <p key={day.date} className="row"><span>{day.date}</span><strong>{money(day.profit)} profit on {money(day.revenue)}</strong></p>)}
      <strong>Profit by invoice</strong>
      <div className="table spacer acc-table-wrap acc-profit-table">
        <table>
          <thead><tr><th>Date</th><th>Invoice</th><th className="acc-num">Revenue</th><th className="acc-num">Cost</th><th className="acc-num">Profit</th><th></th></tr></thead>
          <tbody>
            {invoices.items.map(invoice => (
              <tr key={invoice.voucherId}>
                <td data-label="Date">{invoice.date}</td>
                <td data-label="Invoice">{invoice.voucherNumber}{invoice.partyName ? ` · ${invoice.partyName}` : ""}</td>
                <td className="acc-num" data-label="Revenue">{money(invoice.revenue)}</td>
                <td className="acc-num" data-label="Cost">{money(invoice.cogs)}</td>
                <td className="acc-num" data-label="Profit">{money(invoice.profit)}</td>
                <td data-label="">{onViewDocument ? <button type="button" className="btn" onClick={() => openVoucher(invoice)}>View</button> : null}</td>
              </tr>
            ))}
            {!row.invoices.length && <tr><td colSpan={6}>No posted sales invoices for this item in the period.</td></tr>}
          </tbody>
        </table>
      </div>
      <AccPager page={invoices.page} pages={invoices.pages} total={invoices.total} from={invoices.from} to={invoices.to} onPage={invoices.setPage} noun="invoices" />
      <strong>Stock movements</strong>
      <div className="table spacer acc-table-wrap acc-profit-table">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th className="acc-num">In</th><th className="acc-num">Out</th><th className="acc-num">Balance</th><th className="acc-num">Unit cost</th><th className="acc-num">Value</th><th>Recorded</th><th></th></tr></thead>
          <tbody>
            {ledger.items.map(entry => (
              <tr key={entry.id}>
                <td data-label="Date">{entry.date}</td>
                <td data-label="Type">{entry.reasonLabel}</td>
                <td data-label="Reference">{entry.reference || "—"}{entry.note ? <span className="small"> {entry.note}</span> : null}</td>
                <td className="acc-num" data-label="In">{entry.quantityIn ? qty(entry.quantityIn, unit) : "—"}</td>
                <td className="acc-num" data-label="Out">{entry.quantityOut ? qty(entry.quantityOut, unit) : "—"}</td>
                <td className="acc-num" data-label="Balance">{qty(entry.balance, unit)}</td>
                <td className="acc-num" data-label="Unit cost">{money(entry.unitCost)}</td>
                <td className="acc-num" data-label="Value">{money(entry.value)}</td>
                <td data-label="Recorded">{entry.recorded ? "Recorded" : "Not recorded"}</td>
                <td data-label="">{entry.voucherId && onViewDocument ? <button type="button" className="btn" onClick={() => openVoucher(entry)}>View</button> : null}</td>
              </tr>
            ))}
            {!row.ledger.length && <tr><td colSpan={10}>No movements in this period. Brought forward {qty(row.openingQuantity, unit)}.</td></tr>}
          </tbody>
        </table>
      </div>
      <AccPager page={ledger.page} pages={ledger.pages} total={ledger.total} from={ledger.from} to={ledger.to} onPage={ledger.setPage} noun="movements" />
    </div>
  );
}
