import { stockReasonLabel } from "../../model/inventoryModel.js";
import { Select } from "../../../../components/Select.jsx";
import { AccPager, FilterField as Field, AccTable } from "../AccUi.jsx";
import { usePagedList } from "../../model/usePagedList.js";
import { qty } from "../../accountsFormat.js";

export function StockMovementsTab({ moveFrom, setMoveFrom, moveTo, setMoveTo, moveItemId, setMoveItemId, products, moveRows }) {
  const paged = usePagedList(moveRows, `${moveFrom}|${moveTo}|${moveItemId}`);
  return (
    <>
      <div className="accounts-action-row spacer">
        <Field label="From"><input type="date" value={moveFrom} onChange={event => setMoveFrom(event.target.value)} /></Field>
        <Field label="To"><input type="date" value={moveTo} onChange={event => setMoveTo(event.target.value)} /></Field>
        <Field label="Item">
          <Select value={moveItemId} onChange={event => setMoveItemId(event.target.value)}>
            <option value="">All products</option>
            {products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
      </div>
      <AccTable columns={["Date", "Item", "Reason", { label: "Qty", num: true }, "Voucher / note"]} empty={!moveRows.length && "No stock movements for this filter."}>
        {paged.items.map(row => <tr key={row.id}><td>{row.movementDate}</td><td>{row.itemName}</td><td>{stockReasonLabel(row.reason)}</td><td className={`acc-num ${row.quantityDelta < 0 ? "red" : "green"}`}>{row.quantityDelta > 0 ? `+${qty(row.quantityDelta)}` : qty(row.quantityDelta)}</td><td>{row.voucherNumber || row.note || "—"}</td></tr>)}
      </AccTable>
      <AccPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} noun="movements" />
    </>
  );
}
