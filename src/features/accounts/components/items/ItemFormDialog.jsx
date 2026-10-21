import { FilterField as Field } from "../AccUi.jsx";
import { Select } from "../../../../components/Select.jsx";
import { ITEM_TYPES, itemCategoryChoices, unitsForItemType } from "../../model/inventoryModel.js";
import { DialogModal } from "../../../../components/ui.jsx";
import { suggestHsn } from "../../../intelligence/ai/hsnSuggest.js";

export function ItemFormDialog({ form, setShowForm, error, setForm, categories, saving, saveItem }) {
  const suggestion = suggestHsn(form.name);
  const suggestionDiffers = suggestion && (String(form.hsnSac || "") !== suggestion.hsn || Number(form.gstRate) !== suggestion.rate);
  const isService = form.itemType === "service";
  const baseUnits = unitsForItemType(form.itemType);
  const unitOptions = !form.unit || baseUnits.includes(form.unit) ? baseUnits : [form.unit, ...baseUnits];
  const categoryOptions = itemCategoryChoices(categories);
  return (
    <DialogModal className="acc-modal" title={form.id ? "Edit item" : "Create item"} close={() => setShowForm(false)}>
      {error && <p className="red small">{error}</p>}
      <div className="form">
        <Field label="Type"><Select value={form.itemType} onChange={event => {
          const itemType = event.target.value;
          const nextUnits = unitsForItemType(itemType);
          setForm(current => ({ ...current, itemType, unit: nextUnits.includes(current.unit) ? current.unit : nextUnits[0] }));
        }}>{ITEM_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</Select></Field>
        <Field label="Name"><input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></Field>
        {suggestionDiffers ? <p className="small span">Suggested for {suggestion.label}: HSN {suggestion.hsn}, GST {suggestion.rate}%. {suggestion.note} <button type="button" className="btn" onClick={() => setForm(current => ({ ...current, hsnSac: suggestion.hsn, gstRate: String(suggestion.rate) }))}>Use this</button></p> : null}
        <Field label="SKU / Code"><input value={form.sku} onChange={event => setForm(current => ({ ...current, sku: event.target.value }))} /></Field>
        <Field label="Category">
          <Select value={form.categoryId} onChange={event => setForm(current => ({ ...current, categoryId: event.target.value }))}>
            <option value="">None</option>
            {categoryOptions.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
          </Select>
        </Field>
        <Field label="Unit"><Select value={form.unit} onChange={event => setForm(current => ({ ...current, unit: event.target.value }))}>{unitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}</Select></Field>
        <Field label="Selling price"><input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={event => setForm(current => ({ ...current, sellingPrice: event.target.value }))} /></Field>
        {!isService && <Field label="Purchase price"><input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={event => setForm(current => ({ ...current, purchasePrice: event.target.value }))} /></Field>}
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
