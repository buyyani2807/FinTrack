import { useState } from "react";
import { Select } from "../../../../components/Select.jsx";
import { PackageMinus, PackagePlus, Plus, Tags, X } from "lucide-react";
import { todayIso } from "../../../../lib/dates.js";
import { SegmentedControl } from "../../../../components/ui.jsx";
import { FilterField as Field } from "../AccUi.jsx";

const REASONS = ["Damaged stock", "Expired", "Found in physical count", "Free sample", "Opening correction"];
const CATEGORY_ERROR = "Could not create category. Apply migration 067 if Items RPCs are missing.";

// Categories: add inline, then the list as chips with how many items use each.
// Stock adjustment: choose add or remove, then a positive quantity; the card previews the stock after saving.
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
  const [direction, setDirection] = useState(() => (Number(adjust.quantityDelta) < 0 ? "out" : "in"));
  const createCategory = async event => {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name || saving) return;
    setCategoryError("");
    try {
      await onSaveCategory({ name });
      setCategoryName("");
    } catch (err) {
      setCategoryError(err?.message || CATEGORY_ERROR);
    }
  };
  const itemsInCategory = id => items.filter(item => item.categoryId === id).length;

  const products = items.filter(item => item.itemType === "product" && item.isActive !== false);
  const chosen = products.find(item => item.id === adjust.itemId);
  const amount = Math.abs(Number(adjust.quantityDelta) || 0);
  const setAmount = (value, side = direction) => {
    const size = value === "" ? "" : Math.abs(Number(value));
    setAdjust(current => ({ ...current, quantityDelta: size === "" ? "" : String(side === "out" ? -size : size) }));
  };
  const chooseDirection = side => {
    setDirection(side);
    if (adjust.quantityDelta !== "") setAmount(amount, side);
  };
  const current = chosen ? Number(stockByItem[chosen.id] || 0) : null;
  const after = chosen && amount ? current + (direction === "out" ? -amount : amount) : null;
  const canSave = !saving && chosen && amount > 0;

  return (
    <div className="acc-items-side-grid">
      <section className="card acc-item-categories-card acc-side-card">
        <header className="acc-side-card-head">
          <span className="acc-settings-icon" aria-hidden="true"><Tags size={18} /></span>
          <div><h3>Categories</h3><p className="small">Group items for reports. Assign a category when you add or edit an item.</p></div>
          <span className="acc-side-card-count" aria-label={`${categories.length} categories`}>{categories.length}</span>
        </header>
        <form className="acc-category-create" onSubmit={createCategory}>
          <input
            aria-label="New category name"
            value={categoryName}
            placeholder="New category, e.g. Construction materials"
            onChange={event => { setCategoryName(event.target.value); setCategoryError(""); }}
          />
          <button type="submit" className="btn primary" disabled={saving || !categoryName.trim()}><Plus size={16} aria-hidden="true" />Add</button>
        </form>
        {categoryError && <p className="red small" role="alert">{categoryError}</p>}
        {categories.length ? (
          <ul className="acc-item-cat-list">
            {categories.map(category => (
              <li key={category.id}>
                <span className="acc-item-cat-name">{category.name}</span>
                <span className="acc-item-cat-count">{itemsInCategory(category.id)} item{itemsInCategory(category.id) === 1 ? "" : "s"}</span>
                <button type="button" className="acc-item-cat-delete" aria-label={`Delete category ${category.name}`} title="Delete" disabled={saving} onClick={() => onDeleteCategory(category.id)}><X size={15} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        ) : <p className="acc-side-card-empty small">No categories yet. Type a name above and press Add.</p>}
      </section>

      <section className="card acc-stock-adjust-card acc-side-card">
        <header className="acc-side-card-head">
          <span className="acc-settings-icon" aria-hidden="true">{direction === "out" ? <PackageMinus size={18} /> : <PackagePlus size={18} />}</span>
          <div><h3>Stock adjustment</h3><p className="small">Correct a product's stock with a reason. Posted as an auditable movement.</p></div>
        </header>
        <SegmentedControl
          label="Adjustment"
          className="acc-adjust-direction"
          value={direction}
          onChange={chooseDirection}
          options={[{ id: "in", label: "Add stock" }, { id: "out", label: "Remove stock" }]}
        />
        <div className="form acc-settings-grid">
          <Field className="span" label="Product">
            <Select value={adjust.itemId} onChange={event => setAdjust(state => ({ ...state, itemId: event.target.value }))}>
              <option value="">Select product</option>
              {products.map(item => (
                <option key={item.id} value={item.id}>{item.name} ({stockByItem[item.id]} {item.unit})</option>
              ))}
            </Select>
          </Field>
          <Field label={`Quantity${chosen ? ` (${chosen.unit})` : ""}`}>
            <input type="number" min="0" step="0.001" inputMode="decimal" value={adjust.quantityDelta === "" ? "" : amount} placeholder="0" onChange={event => setAmount(event.target.value)} />
          </Field>
          <Field label="Date"><input type="date" value={adjust.date} onChange={event => setAdjust(state => ({ ...state, date: event.target.value }))} /></Field>
          <Field className="span" label="Reason">
            <input list="acc-adjust-reasons" value={adjust.reasonNote} placeholder="e.g. Damaged stock" onChange={event => setAdjust(state => ({ ...state, reasonNote: event.target.value }))} />
            <datalist id="acc-adjust-reasons">{REASONS.map(reason => <option key={reason} value={reason} />)}</datalist>
          </Field>
        </div>
        <div className="acc-adjust-foot">
          <p className="small acc-adjust-preview" aria-live="polite">
            {chosen
              ? <>In stock <b>{current} {chosen.unit}</b>{after != null ? <> → after <b className={after < 0 ? "red" : ""}>{after} {chosen.unit}</b></> : null}</>
              : "Choose a product to see its stock."}
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={!canSave}
            onClick={async () => {
              await onAdjustStock(adjust);
              setAdjust({ itemId: "", date: todayIso(), quantityDelta: "", reasonNote: "" });
            }}
          >
            Save adjustment
          </button>
        </div>
      </section>
    </div>
  );
}
