import { todayIso } from "../../../../lib/dates.js";
import { ExportButton } from "../../../../components/ui.jsx";
import { AccPager, AccTable, FilterField as Field, SimpleMetric } from "../AccUi.jsx";
import { usePagedList } from "../../model/usePagedList.js";
import { qty } from "../../accountsFormat.js";

export function ExpiredStockTab({ asOf, setAsOf, rows = [], exportExpired }) {
  const expiredCount = rows.filter(row => row.status === "expired").length;
  const soonCount = rows.filter(row => row.status === "soon").length;
  const paged = usePagedList(rows, asOf);
  return (
    <>
      <div className="acc-list-toolbar spacer">
        <Field label="As of"><input type="date" max={todayIso()} value={asOf} onChange={event => setAsOf(event.target.value || todayIso())} /></Field>
        <ExportButton className="acc-list-new" onClick={exportExpired} />
      </div>
      <div className="acc-metric-grid fill spacer">
        <SimpleMetric label="Expired" value={String(expiredCount)} tone={expiredCount ? "red" : ""} />
        <SimpleMetric label="Due within 30 days" value={String(soonCount)} />
      </div>
      <AccTable
        columns={["Status", "Item", "SKU", "Batch", "Expiry", { label: "On hand", num: true }]}
        empty={!rows.length && "No expired or near-expiry stock."}
      >
        {paged.items.map(row => (
          <tr key={row.itemId}>
            <td>{row.statusLabel}</td>
            <td>{row.name}</td>
            <td>{row.sku || "—"}</td>
            <td>{row.batchNo || "—"}</td>
            <td>{row.expiryDate}</td>
            <td className="acc-num">{qty(row.stock, row.unit)}</td>
          </tr>
        ))}
      </AccTable>
      <AccPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} noun="items" />
      <p className="small spacer">Items past expiry or due within 30 days of this date — check before you sell. Set expiry on the item to appear here.</p>
    </>
  );
}
