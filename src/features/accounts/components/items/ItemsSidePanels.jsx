import { todayIso } from "../../../../lib/dates.js";
import { FilterField as Field } from "../AccUi.jsx";

export function ItemsSidePanels({
  categoryName,
  setCategoryName,
  setCategoryError,
  saving,
  onSaveCategory,
  categoryError,
  categories,
  onDeleteCategory,
  adjust,
  setAdjust,
  items,
  stockByItem,
  onAdjustStock,
}) {
  return (
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
  );
}
