import { useMemo, useState } from "react";
import { SearchInput } from "../../../../components/ui.jsx";
import { Select } from "../../../../components/Select.jsx";
import { AccPager, FilterField as Field } from "../../components/AccUi.jsx";
import { money, qty } from "../../accountsFormat.js";
import { usePagedList } from "../../model/usePagedList.js";
import { filterPurchaseMatch, purchaseMatchReport } from "../../model/purchaseMatch.js";

const STATUS = [
  ["all", "All orders"],
  ["review", "Needs match"],
  ["open", "Not received"],
  ["matched", "Matched"],
];

export function PurchaseMatchReport({
  documents = [],
  voucherItemLines = [],
  vouchers = [],
  parties = [],
  onOpenDocument,
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const report = useMemo(
    () => purchaseMatchReport({ documents, voucherItemLines, vouchers, parties }),
    [documents, voucherItemLines, vouchers, parties],
  );
  const filtered = useMemo(() => filterPurchaseMatch(report.orders, { search, status }), [report.orders, search, status]);
  const paged = usePagedList(filtered, `${search}|${status}`);
  const selected = filtered.find(row => row.documentId === selectedId) || report.orders.find(row => row.documentId === selectedId) || null;

  return (
    <div className="acc-purchase-match">
      <p className="copy">Compare each purchase order with goods receipts and posted bills that were made from it. Nothing is posted from this page.</p>
      <div className="acc-metric-grid acc-metric-compact spacer">
        <article className="card acc-metric-card"><div className="metric-label">Orders</div><div className="metric-value">{report.totals.orders}</div></article>
        <article className="card acc-metric-card"><div className="metric-label">Needs match</div><div className={`metric-value ${report.totals.review ? "red" : ""}`}>{report.totals.review}</div></article>
        <article className="card acc-metric-card"><div className="metric-label">Matched</div><div className="metric-value">{report.totals.matched}</div></article>
        <article className="card acc-metric-card"><div className="metric-label">Not received</div><div className="metric-value">{report.totals.open}</div></article>
      </div>
      <div className="accounts-filters">
        <Field label="Search"><SearchInput value={search} onChange={setSearch} placeholder="Order, supplier, or item" /></Field>
        <Field label="Status">
          <Select value={status} onChange={event => setStatus(event.target.value)}>
            {STATUS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </Select>
        </Field>
      </div>
      <div className="table spacer acc-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Supplier</th>
              <th className="acc-num">Ordered</th>
              <th className="acc-num">Received</th>
              <th className="acc-num">Billed</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {paged.items.map(row => (
              <tr key={row.documentId}>
                <td data-label="Order"><strong>{row.docNumber}</strong><span className="small"> {row.docDate}</span></td>
                <td data-label="Supplier">{row.partyName || "—"}</td>
                <td className="acc-num" data-label="Ordered">{qty(row.ordered)}</td>
                <td className="acc-num" data-label="Received">{qty(row.received)}</td>
                <td className="acc-num" data-label="Billed">{qty(row.billed)}</td>
                <td data-label="Status">{row.status === "review" ? <span className="small red">Needs match</span> : row.status === "matched" ? "Matched" : "Not received"}</td>
                <td data-label=""><button type="button" className="btn" onClick={() => setSelectedId(row.documentId)}>Open</button></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7}>No purchase orders match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <AccPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} noun="orders" />
      {selected && (
        <div className="card spacer">
          <div className="toolbar">
            <strong>{selected.docNumber} · {selected.partyName || "Supplier"}</strong>
            <div className="accounts-action-row">
              {onOpenDocument ? <button type="button" className="btn" onClick={() => onOpenDocument(selected.documentId)}>Open order</button> : null}
              <button type="button" className="btn" onClick={() => setSelectedId("")}>Back</button>
            </div>
          </div>
          {selected.warnings.length ? (
            <div className="notice" role="status">
              <strong>Needs match</strong>
              <ul>{selected.warnings.map(note => <li key={note}>{note}</li>)}</ul>
            </div>
          ) : null}
          <div className="table acc-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="acc-num">Ordered</th>
                  <th className="acc-num">Order rate</th>
                  <th className="acc-num">Received</th>
                  <th className="acc-num">Billed</th>
                  <th className="acc-num">Bill rate</th>
                  <th>Receipts</th>
                  <th>Bills</th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map(line => (
                  <tr key={line.poLineId}>
                    <td data-label="Item">{line.itemName}{line.warnings.length ? <span className="small red"> Needs match</span> : null}</td>
                    <td className="acc-num" data-label="Ordered">{qty(line.ordered, line.unit)}</td>
                    <td className="acc-num" data-label="Order rate">{money(line.orderRate)}</td>
                    <td className="acc-num" data-label="Received">{qty(line.received, line.unit)}</td>
                    <td className="acc-num" data-label="Billed">{qty(line.billed, line.unit)}</td>
                    <td className="acc-num" data-label="Bill rate">{line.billedRate == null ? "—" : money(line.billedRate)}</td>
                    <td data-label="Receipts">{line.receiptRefs.join(", ") || "—"}</td>
                    <td data-label="Bills">{line.billRefs.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
