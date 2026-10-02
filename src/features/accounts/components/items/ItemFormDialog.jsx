import { FilterField as Field } from "../AccUi.jsx";
import { ITEM_TYPES, ITEM_UNITS } from "../../model/inventoryModel.js";
import { DialogModal } from "../../../../components/ui.jsx";

export function ItemFormDialog({ form, setShowForm, error, setForm, categories, saving, saveItem }) {
  return (
    <DialogModal className="acc-modal" title={form.id ? "Edit item" : "Create item"} close={() => setShowForm(false)}>
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
          <Field label="Opening rate (cost / unit)"><input type="number" min="0" step="0.01" value={form.openingRate ?? ""} placeholder={form.purchasePrice ? `Uses purchase price ${form.purchasePrice}` : "Uses purchase price"} onChange={event => setForm(current => ({ ...current, openingRate: event.target.value }))} /></Field>
          <Field label="Reorder level"><input type="number" min="0" step="0.001" value={form.reorderLevel} onChange={event => setForm(current => ({ ...current, reorderLevel: event.target.value }))} /></Field>
        </>}
        <Field className="span" label="Description"><input value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></Field>
      </div>
      <div className="tabs spacer">
        
        <button type="button" className="btn primary" disabled={saving} onClick={saveItem}>{saving ? "Saving…" : "Save item"}</button>
      </div>
    </DialogModal>
  );
}
