import { todayIso } from "../../../../lib/dates.js";
import { STOCK_AGE_BUCKETS } from "../../model/inventoryValuation.js";
import { FilterField as Field } from "../AccUi.jsx";
import { SimpleMetric } from "../AccUi.jsx";
import { money, qty } from "../../accountsFormat.js";

export function StockAgeingTab({ asOf, setAsOf, exportAgeing, ageing }) {
  return (
    <>
      <div className="accounts-action-row spacer">
        <Field label="Age as on"><input type="date" value={asOf} onChange={event => setAsOf(event.target.value || todayIso())} /></Field>
        <button type="button" className="btn" onClick={exportAgeing}>Export CSV</button>
      </div>
      <div className="acc-metric-grid spacer">
        {STOCK_AGE_BUCKETS.map(bucket => <SimpleMetric key={bucket.id} label={bucket.label} value={money(ageing.totals[bucket.id])} tone={bucket.id === "d180" && ageing.totals[bucket.id] ? "red" : ""} />)}
      </div>
      <div className="table spacer acc-table-wrap"><table><thead><tr><th>Item</th><th className="acc-num">Quantity</th><th className="acc-num">Oldest</th>{STOCK_AGE_BUCKETS.map(bucket => <th key={bucket.id} className="acc-num">{bucket.label}</th>)}</tr></thead><tbody>
        {ageing.rows.map(row => <tr key={row.itemId}><td>{row.name}</td><td className="acc-num">{qty(row.quantity, row.unit)}</td><td className="acc-num">{row.oldestDays} days</td>{STOCK_AGE_BUCKETS.map(bucket => <td key={bucket.id} className="acc-num">{row[bucket.id] ? money(row[bucket.id]) : ""}</td>)}</tr>)}
        {!ageing.rows.length && <tr><td colSpan={3 + STOCK_AGE_BUCKETS.length}>No stock on hand on this date.</td></tr>}
      </tbody></table></div>
      <p className="small spacer">Assumes the oldest stock is sold first. Values use weighted-average cost.</p>
    </>
  );
}
