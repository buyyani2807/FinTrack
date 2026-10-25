import { money } from "../../accountsFormat.js";
import { itemProfitHighlights, itemProfitTotals } from "../../model/itemProfitability.js";

const line = (label, names) => names.length ? `${label}: ${names.join(", ")}` : "";

export function InventoryProfitStrip({ rows = [], onOpen }) {
  if (!rows.length) return null;
  const totals = itemProfitTotals(rows);
  const highlights = itemProfitHighlights(rows);
  const lines = [
    line("Best profit", highlights.best),
    line("Lowest margin", highlights.lowestMargin),
    line("Fast moving", highlights.fast),
    line("Slow moving", highlights.slow),
    line("Negative margin", highlights.negativeMargin),
    line("Requires review", highlights.review),
    line("Nearing stockout", highlights.lowStock),
  ].filter(Boolean);
  return (
    <div className="card spacer">
      <div className="toolbar"><strong>Item profit</strong>{onOpen ? <button type="button" className="btn" onClick={onOpen}>Open report</button> : null}</div>
      <p className="small">Realised on items sold in this period. The stock value above is what is still in hand.</p>
      <p className="row"><span>Revenue</span><strong>{money(totals.revenue)}</strong></p>
      <p className="row"><span>Gross profit</span><strong className={totals.grossProfit < 0 ? "red" : "green"}>{money(totals.grossProfit)}</strong></p>
      {lines.map(text => <p key={text} className="small">{text}</p>)}
    </div>
  );
}
