import { AccTable } from "../AccUi.jsx";
import { stockReasonLabel, stockStatus } from "../../model/inventoryModel.js";
import { DialogModal } from "../../../../components/ui.jsx";
import { money } from "../../accountsFormat.js";

export function ItemDetailDialog({
  detail,
  setDetailId,
  stockByItem,
  detailValue,
  detailMoves,
  detailSales,
  detailPurchases,
  openEdit,
}) {
  return (
    <DialogModal className="acc-modal" title={detail.name} close={() => setDetailId(null)}>
      <p className="copy">{detail.sku} · {detail.itemType} · {detail.unit}</p>
      <div className="acc-metric-grid three">
        <article className="card acc-metric-card"><div className="metric-label">Current stock</div><div className="metric-value">{stockByItem[detail.id] == null ? "—" : `${stockByItem[detail.id]} ${detail.unit}`}</div></article>
        <article className="card acc-metric-card"><div className="metric-label">Selling</div><div className="metric-value">{money(detail.sellingPrice)}</div></article>
        <article className="card acc-metric-card"><div className="metric-label">Purchase</div><div className="metric-value">{money(detail.purchasePrice)}</div></article>
      </div>
      <p className="small">GST {detail.gstRate}% · HSN {detail.hsnSac || "—"} · Reorder {detail.reorderLevel} · {stockStatus(stockByItem[detail.id], detail.reorderLevel) === "low" ? "Low stock" : "Normal"}</p>
      {detailValue && <p className="small">Average cost {money(detailValue.averageCost)} · Stock value {money(detailValue.value)} (weighted average)</p>}
      <h3 className="acc-section-title">Recent stock movements</h3>
      <AccTable spaced={false} columns={["Date", "Reason", { label: "Qty", num: true }, "Voucher"]} empty={!detailMoves.length && "No movements yet."}>
        {detailMoves.map(row => <tr key={row.id}><td>{row.movementDate}</td><td>{stockReasonLabel(row.reason)}</td><td className="acc-num">{row.quantityDelta > 0 ? `+${row.quantityDelta}` : row.quantityDelta}</td><td>{row.voucherNumber || "—"}</td></tr>)}
      </AccTable>
      <p className="small">Sales lines: {detailSales.length} · Purchase lines: {detailPurchases.length}</p>
      <div className="tabs spacer"><button type="button" className="btn" onClick={() => openEdit(detail)}>Edit</button><button type="button" className="btn primary" onClick={() => setDetailId(null)}>Done</button></div>
    </DialogModal>
  );
}
