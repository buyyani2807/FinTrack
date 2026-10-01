import { todayIso } from "../../../../lib/dates.js";
import { stockStatus } from "../../model/inventoryModel.js";
import { FilterField as Field, AccTable } from "../AccUi.jsx";
import { SimpleMetric } from "../AccUi.jsx";
import { money, qty } from "../../accountsFormat.js";

export function StockSummaryTab({ asOf, setAsOf, search, setSearch, exportSummary, valuation, matches }) {
  return (
    <>
      <div className="accounts-action-row spacer">
        <Field label="Stock as on"><input type="date" value={asOf} onChange={event => setAsOf(event.target.value || todayIso())} /></Field>
        <input className="accounts-search" placeholder="Search item or SKU" value={search} onChange={event => setSearch(event.target.value)} />
        <button type="button" className="btn" onClick={exportSummary}>Export CSV</button>
      </div>
      <div className="acc-metric-grid three spacer">
        <SimpleMetric label="Stock value (weighted average)" value={money(valuation.totalValue)} />
        <SimpleMetric label="Products in stock" value={String(valuation.itemsInStock)} />
        <SimpleMetric label="Negative stock" value={String(valuation.negativeItems)} tone={valuation.negativeItems ? "red" : ""} />
      </div>
      <AccTable columns={["Item", "SKU", { label: "Quantity", num: true }, { label: "Avg cost", num: true }, { label: "Value", num: true }, "Status"]}>
        {valuation.rows.filter(matches).map(row => {
          const status = row.quantity < 0 ? "Negative" : stockStatus(row.quantity, row.reorderLevel) === "low" ? "Low stock" : row.quantity === 0 ? "Out of stock" : "";
          return <tr key={row.itemId}><td>{row.name}</td><td>{row.sku}</td><td className="acc-num">{qty(row.quantity, row.unit)}</td><td className="acc-num">{money(row.averageCost)}</td><td className="acc-num">{money(row.value)}</td><td className={row.quantity < 0 ? "red" : ""}>{status}</td></tr>;
        })}
        {!valuation.rows.length && <tr><td colSpan="6">No products yet. Add items or import them from a CSV.</td></tr>}
        {valuation.rows.length > 0 && <tr><td colSpan="4"><strong>Total</strong></td><td className="acc-num"><strong>{money(valuation.totalValue)}</strong></td><td></td></tr>}
      </AccTable>
      <p className="small spacer">Valued at moving weighted-average cost. Purchases use the line value after discount and before GST; opening stock uses the item's opening rate (or purchase price). This value flows into the Profit &amp; Loss and Balance Sheet as closing stock.</p>
    </>
  );
}
