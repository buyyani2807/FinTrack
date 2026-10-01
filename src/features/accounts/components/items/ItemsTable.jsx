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
            <th>SKU</th>
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
                <td><button type="button" className="link-button" onClick={() => setDetailId(item.id)}><strong>{item.name}</strong></button></td>
                <td>{item.sku}</td>
                <td>{item.itemType}</td>
                <td>{item.unit}</td>
                <td className="acc-num">{money(item.sellingPrice)}</td>
                <td className="acc-num">{money(item.purchasePrice)}</td>
                <td className="acc-num">{stock == null ? "—" : `${stock} ${item.unit}`}</td>
                <td>{item.isActive === false ? "Inactive" : status === "low" ? "Low stock" : "Active"}</td>
                <td className="acc-item-actions">
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
                </td>
              </tr>
            );
          })}
          {!filtered.length && <tr><td colSpan="9">No items yet. Create Cement 50kg or a service to start.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
