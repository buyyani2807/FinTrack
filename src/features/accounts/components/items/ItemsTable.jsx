import { AccMoreMenu } from "../AccUi.jsx";
import { stockStatus } from "../../model/inventoryModel.js";
import { money } from "../../accountsFormat.js";

export function ItemsTable({ filtered, stockByItem, setDetailId, saving, openEdit, onSetItemActive, onDeleteItem }) {
  return (
    <div className="table spacer acc-table-wrap acc-items-desktop">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Type</th>
            <th>Unit</th>
            <th className="acc-num">Sell</th>
            <th className="acc-num">Buy</th>
            <th className="acc-num">Stock</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(item => {
            const stock = stockByItem[item.id];
            const status = stockStatus(stock, item.reorderLevel);
            return (
              <tr key={item.id}>
                <td className="acc-cell-stack">
                  <button type="button" className="btn linkish" onClick={() => setDetailId(item.id)}>{item.name}</button>
                  {item.sku || item.hsnSac ? <span className="small">{[item.sku, item.hsnSac && `HSN ${item.hsnSac}`].filter(Boolean).join(" · ")}</span> : null}
                </td>
                <td className="acc-cap">{item.itemType}</td>
                <td>{item.unit}</td>
                <td className="acc-num">{money(item.sellingPrice)}</td>
                <td className="acc-num">{money(item.purchasePrice)}</td>
                <td className={`acc-num${status === "low" && item.isActive !== false ? " acc-stock-low" : ""}`}>{stock == null ? "—" : `${stock} ${item.unit}`}</td>
                <td>{item.isActive === false ? <span className="acc-doc-status tone-muted">Inactive</span> : status === "low" ? <span className="acc-doc-status tone-warn">Low stock</span> : <span className="acc-doc-status tone-green">Active</span>}</td>
                <td><div className="acc-item-actions">
                  <button type="button" className="btn" disabled={saving} onClick={() => openEdit(item)}>Edit</button>
                  <AccMoreMenu
                    label="More"
                    items={[
                      item.isActive !== false
                        ? { id: "deactivate", label: "Deactivate", disabled: saving, onClick: () => onSetItemActive(item.id, false) }
                        : { id: "reactivate", label: "Reactivate", disabled: saving, onClick: () => onSetItemActive(item.id, true) },
                      { id: "delete", label: "Delete", danger: true, disabled: saving, onClick: () => onDeleteItem(item) },
                    ]}
                  />
                </div></td>
              </tr>
            );
          })}
          {!filtered.length && <tr><td colSpan="8">No items yet. Create Cement 50kg or a service to start.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
