import { useMemo, useState } from "react";
import { formatInr } from "../../lib/formatMoney.js";
import { todayIso } from "./cashbookModel.js";
import { AccMoreMenu } from "./AccUi.jsx";
import {
  ITEM_TYPES,
  ITEM_UNITS,
  currentStockForItem,
  emptyItemForm,
  stockMovementReport,
  stockReasonLabel,
  stockStatus,
  validateItemForm,
} from "./inventoryModel.js";

const money = formatInr;

function Field({ label, children, className = "" }) {
  return <label className={`accounts-filter-field ${className}`.trim()}><span className="small">{label}</span>{children}</label>;
}

export function AccItemsSetup({
  items = [],
  categories = [],
  movements = [],
  voucherItemLines = [],
  vouchers = [],
  saving = false,
  onSaveItem,
  onDeleteItem,
  onSetItemActive,
  onSaveCategory,
  onDeleteCategory,
  onAdjustStock,
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("active");
  const [form, setForm] = useState(emptyItemForm);
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [adjust, setAdjust] = useState({ itemId: "", date: todayIso(), quantityDelta: "", reasonNote: "" });
  const [error, setError] = useState("");

  const stockByItem = useMemo(() => {
    const map = {};
    for (const item of items) map[item.id] = currentStockForItem(item, movements);
    return map;
  }, [items, movements]);

  const lowStock = useMemo(
    () => items.filter(item => item.itemType === "product" && item.isActive !== false && stockStatus(stockByItem[item.id], item.reorderLevel) === "low"),
    [items, stockByItem],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(item => {
      if (typeFilter !== "all" && item.itemType !== typeFilter) return false;
      if (activeFilter === "active" && item.isActive === false) return false;
      if (activeFilter === "inactive" && item.isActive !== false) return false;
      if (!q) return true;
      return [item.name, item.sku, item.hsnSac, item.description].join(" ").toLowerCase().includes(q);
    });
  }, [items, search, typeFilter, activeFilter]);

  const detail = items.find(item => item.id === detailId) || null;
  const detailMoves = detail ? stockMovementReport(movements, items, { itemId: detail.id }).slice(0, 12) : [];
  const detailSales = detail
    ? voucherItemLines.filter(line => line.itemId === detail.id && vouchers.find(v => v.id === line.voucherId)?.voucherType === "sales")
    : [];
  const detailPurchases = detail
    ? voucherItemLines.filter(line => line.itemId === detail.id && vouchers.find(v => v.id === line.voucherId)?.voucherType === "purchase")
    : [];

  const openCreate = () => {
    setForm(emptyItemForm());
    setShowForm(true);
    setError("");
  };

  const openEdit = item => {
    setForm({
      id: item.id,
      itemType: item.itemType,
      name: item.name,
      sku: item.sku,
      categoryId: item.categoryId || "",
      unit: item.unit || "Nos",
      description: item.description || "",
      sellingPrice: String(item.sellingPrice ?? ""),
      purchasePrice: String(item.purchasePrice ?? ""),
      gstRate: String(item.gstRate ?? "0"),
      hsnSac: item.hsnSac || "",
      openingStock: String(item.openingStock ?? "0"),
      openingStockDate: item.openingStockDate || "",
      reorderLevel: String(item.reorderLevel ?? "0"),
      isActive: item.isActive !== false,
    });
    setShowForm(true);
    setError("");
  };

  const saveItem = async () => {
    const message = validateItemForm(form);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    await onSaveItem(form);
    setShowForm(false);
    setForm(emptyItemForm());
  };

  return (
    <section className="acc-items-setup">
      {lowStock.length > 0 && (
        <div className="acc-low-stock card">
          <strong>Low stock</strong>
          <ul>
            {lowStock.map(item => (
              <li key={item.id}>
                <button type="button" className="link-button" onClick={() => setDetailId(item.id)}>
                  {item.name} — {stockByItem[item.id]} {item.unit} remaining
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="acc-items-toolbar">
        <input className="accounts-search" placeholder="Search name, SKU, HSN" value={search} onChange={event => setSearch(event.target.value)} />
        <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
          <option value="all">All types</option>
          <option value="product">Products</option>
          <option value="service">Services</option>
        </select>
        <select value={activeFilter} onChange={event => setActiveFilter(event.target.value)}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <button type="button" className="btn primary" onClick={openCreate}>+ Item</button>
      </div>

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

      <div className="acc-items-side-grid">
        <div className="card acc-item-categories-card">
          <strong>Categories</strong>
          <p className="small">Create a category here, then assign it when you add an item.</p>
          <label className="accounts-filter-field acc-category-create">
            <span className="small">New category name</span>
            <div className="acc-category-create-row">
              <input
                value={categoryName}
                placeholder="e.g. Construction Materials"
                onChange={event => { setCategoryName(event.target.value); setCategoryError(""); }}
                onKeyDown={async event => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const name = categoryName.trim();
                  if (!name || saving) return;
                  setCategoryError("");
                  try {
                    await onSaveCategory({ name });
                    setCategoryName("");
                  } catch (err) {
                    setCategoryError(err?.message || "Could not create category. Apply migration 067 if Items RPCs are missing.");
                  }
                }}
              />
              <button
                type="button"
                className="btn primary"
                disabled={saving || !categoryName.trim()}
                onClick={async () => {
                  const name = categoryName.trim();
                  if (!name) return;
                  setCategoryError("");
                  try {
                    await onSaveCategory({ name });
                    setCategoryName("");
                  } catch (err) {
                    setCategoryError(err?.message || "Could not create category. Apply migration 067 if Items RPCs are missing.");
                  }
                }}
              >
                Create category
              </button>
            </div>
          </label>
          {categoryError && <p className="red small">{categoryError}</p>}
          <ul className="acc-item-cat-list">
            {categories.map(category => (
              <li key={category.id}>
                <span>{category.name}</span>
                <button type="button" className="btn danger" disabled={saving} onClick={() => onDeleteCategory(category.id)}>Delete</button>
              </li>
            ))}
            {!categories.length && <li className="small">No categories yet — type a name above and click Create category.</li>}
          </ul>
        </div>

        <div className="card">
          <strong>Stock adjustment</strong>
          <p className="small">Increase or decrease product stock with a reason. Auditable movement only.</p>
          <div className="form">
            <Field label="Item">
              <select value={adjust.itemId} onChange={event => setAdjust(current => ({ ...current, itemId: event.target.value }))}>
                <option value="">Select product</option>
                {items.filter(item => item.itemType === "product" && item.isActive !== false).map(item => (
                  <option key={item.id} value={item.id}>{item.name} ({stockByItem[item.id]} {item.unit})</option>
                ))}
              </select>
            </Field>
            <Field label="Date"><input type="date" value={adjust.date} onChange={event => setAdjust(current => ({ ...current, date: event.target.value }))} /></Field>
            <Field label="Qty (+/-)"><input type="number" step="0.001" value={adjust.quantityDelta} onChange={event => setAdjust(current => ({ ...current, quantityDelta: event.target.value }))} /></Field>
            <Field className="span" label="Reason"><input value={adjust.reasonNote} placeholder="Damaged stock" onChange={event => setAdjust(current => ({ ...current, reasonNote: event.target.value }))} /></Field>
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={saving}
            onClick={async () => {
              await onAdjustStock(adjust);
              setAdjust({ itemId: "", date: todayIso(), quantityDelta: "", reasonNote: "" });
            }}
          >
            Save adjustment
          </button>
        </div>
      </div>

      {showForm && (
        <div className="modal-bg">
          <div className="modal acc-modal">
            <div className="row"><h2 className="title">{form.id ? "Edit item" : "Create item"}</h2><button type="button" className="btn" onClick={() => setShowForm(false)}>Close</button></div>
            {error && <p className="red small">{error}</p>}
            <div className="form">
              <Field label="Type"><select value={form.itemType} onChange={event => setForm(current => ({ ...current, itemType: event.target.value }))}>{ITEM_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></Field>
              <Field label="Name"><input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></Field>
              <Field label="SKU / Code"><input value={form.sku} onChange={event => setForm(current => ({ ...current, sku: event.target.value }))} /></Field>
              <Field label="Category">
                <select value={form.categoryId} onChange={event => setForm(current => ({ ...current, categoryId: event.target.value }))}>
                  <option value="">None</option>
                  {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </Field>
              <Field label="Unit"><select value={form.unit} onChange={event => setForm(current => ({ ...current, unit: event.target.value }))}>{ITEM_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></Field>
              <Field label="Selling price"><input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={event => setForm(current => ({ ...current, sellingPrice: event.target.value }))} /></Field>
              <Field label="Purchase price"><input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={event => setForm(current => ({ ...current, purchasePrice: event.target.value }))} /></Field>
              <Field label="GST %"><input type="number" min="0" max="100" step="0.01" value={form.gstRate} onChange={event => setForm(current => ({ ...current, gstRate: event.target.value }))} /></Field>
              <Field label="HSN / SAC"><input value={form.hsnSac} onChange={event => setForm(current => ({ ...current, hsnSac: event.target.value }))} /></Field>
              {form.itemType === "product" && <>
                <Field label="Opening stock"><input type="number" min="0" step="0.001" value={form.openingStock} onChange={event => setForm(current => ({ ...current, openingStock: event.target.value }))} /></Field>
                <Field label="Opening date"><input type="date" value={form.openingStockDate} onChange={event => setForm(current => ({ ...current, openingStockDate: event.target.value }))} /></Field>
                <Field label="Reorder level"><input type="number" min="0" step="0.001" value={form.reorderLevel} onChange={event => setForm(current => ({ ...current, reorderLevel: event.target.value }))} /></Field>
              </>}
              <Field className="span" label="Description"><input value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></Field>
            </div>
            <div className="tabs spacer">
              <button type="button" className="btn" disabled={saving} onClick={() => setShowForm(false)}>Cancel</button>
              <button type="button" className="btn primary" disabled={saving} onClick={saveItem}>{saving ? "Saving…" : "Save item"}</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal-bg">
          <div className="modal acc-modal">
            <div className="row"><h2 className="title">{detail.name}</h2><button type="button" className="btn" onClick={() => setDetailId(null)}>Close</button></div>
            <p className="copy">{detail.sku} · {detail.itemType} · {detail.unit}</p>
            <div className="acc-metric-grid three">
              <article className="card acc-metric-card"><div className="metric-label">Current stock</div><div className="metric-value">{stockByItem[detail.id] == null ? "—" : `${stockByItem[detail.id]} ${detail.unit}`}</div></article>
              <article className="card acc-metric-card"><div className="metric-label">Selling</div><div className="metric-value">{money(detail.sellingPrice)}</div></article>
              <article className="card acc-metric-card"><div className="metric-label">Purchase</div><div className="metric-value">{money(detail.purchasePrice)}</div></article>
            </div>
            <p className="small">GST {detail.gstRate}% · HSN {detail.hsnSac || "—"} · Reorder {detail.reorderLevel} · {stockStatus(stockByItem[detail.id], detail.reorderLevel) === "low" ? "Low stock" : "Normal"}</p>
            <p className="small">Item profitability will be available once sufficient cost data is recorded.</p>
            <h3 className="acc-section-title">Recent stock movements</h3>
            <div className="table acc-table-wrap"><table><thead><tr><th>Date</th><th>Reason</th><th className="acc-num">Qty</th><th>Voucher</th></tr></thead><tbody>
              {detailMoves.map(row => <tr key={row.id}><td>{row.movementDate}</td><td>{stockReasonLabel(row.reason)}</td><td className="acc-num">{row.quantityDelta > 0 ? `+${row.quantityDelta}` : row.quantityDelta}</td><td>{row.voucherNumber || "—"}</td></tr>)}
              {!detailMoves.length && <tr><td colSpan="4">No movements yet.</td></tr>}
            </tbody></table></div>
            <p className="small">Sales lines: {detailSales.length} · Purchase lines: {detailPurchases.length}</p>
            <div className="tabs spacer"><button type="button" className="btn" onClick={() => openEdit(detail)}>Edit</button><button type="button" className="btn primary" onClick={() => setDetailId(null)}>Done</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
