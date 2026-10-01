import { AccMoreMenu } from "../AccUi.jsx";
import { stockStatus } from "../../model/inventoryModel.js";
import { money } from "../../accountsFormat.js";

export function ItemCards({ filtered, stockByItem, setDetailId, saving, openEdit, onSetItemActive, onDeleteItem }) {
  return (
    <div className="acc-item-cards spacer">
      {filtered.map(item => {
        const stock = stockByItem[item.id];
        const status = stockStatus(stock, item.reorderLevel);
        return (
          <article key={item.id} className="card acc-item-card">
            <div className="acc-item-line-card-top">
              <div>
                <strong>{item.name}</strong>
                <p className="small">{item.sku} · {item.itemType}</p>
              </div>
              <span className="small">{item.isActive === false ? "Inactive" : status === "low" ? "Low stock" : "Active"}</span>
            </div>
            <p className="acc-ledger-card-amounts">
              <span>Sell <strong>{money(item.sellingPrice)}</strong></span>
              <span>Buy <strong>{money(item.purchasePrice)}</strong></span>
              <span>Stock <strong>{stock == null ? "—" : `${stock} ${item.unit}`}</strong></span>
            </p>
            <div className="acc-item-actions">
              <button type="button" className="btn" onClick={() => setDetailId(item.id)}>View</button>
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
            </div>
          </article>
        );
      })}
      {!filtered.length && <p className="copy">No items yet. Create Cement 50kg or a service to start.</p>}
    </div>
  );
}
