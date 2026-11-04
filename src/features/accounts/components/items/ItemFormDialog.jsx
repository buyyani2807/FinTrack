import { FilterField as Field } from "../AccUi.jsx";
import { Select } from "../../../../components/Select.jsx";
import {
  ITEM_TYPES,
  PACK_CONTAINS_UNITS,
  canSetPackContains,
  defaultUnitForIndustry,
  itemCategoryChoices,
  unitsForItemType,
} from "../../model/inventoryModel.js";
import { QtyInput } from "../QtyInput.jsx";
import { DialogModal } from "../../../../components/ui.jsx";
import { suggestHsn } from "../../../intelligence/ai/hsnSuggest.js";

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

/** Another item in this company already uses this SKU (case-insensitive). */
export function findSkuConflict(items = [], sku, excludeId = null) {
  const needle = normalizeSku(sku);
  if (!needle) return null;
  return (items || []).find(item => (
    normalizeSku(item.sku) === needle
    && (!excludeId || item.id !== excludeId)
  )) || null;
}

export function ItemFormDialog({
  form,
  setShowForm,
  error,
  setForm,
  categories,
  saving,
  saveItem,
  industry = "",
  items = [],
}) {
  const suggestion = suggestHsn(form.name);
  const suggestionDiffers = suggestion && (String(form.hsnSac || "") !== suggestion.hsn || Number(form.gstRate) !== suggestion.rate);
  const isService = form.itemType === "service";
  const baseUnits = unitsForItemType(form.itemType, industry);
  const unitOptions = !form.unit || baseUnits.includes(form.unit) ? baseUnits : [form.unit, ...baseUnits];
  const categoryOptions = itemCategoryChoices(categories);
  const skuConflict = findSkuConflict(items, form.sku, form.id || null);
  const showPackContains = !isService && canSetPackContains(form.unit);
  const defaultPackUnit = ["Bag", "Pack", "Box", "Tin", "Carton", "Packet", "Bundle", "Case"].includes(form.unit)
    ? "Kg"
    : "";
  const packUnitValue = form.packContainsUnit || defaultPackUnit;
  return (
    <DialogModal className="acc-modal" title={form.id ? "Edit item" : "Create item"} close={() => setShowForm(false)}>
      {error && <p className="red small">{error}</p>}
      <div className="form">
        <Field label="Type"><Select value={form.itemType} onChange={event => {
          const itemType = event.target.value;
          const nextUnits = unitsForItemType(itemType, industry);
          const fallback = defaultUnitForIndustry(industry, itemType);
          setForm(current => ({
            ...current,
            itemType,
            unit: nextUnits.includes(current.unit) ? current.unit : (nextUnits.includes(fallback) ? fallback : nextUnits[0]),
            packContainsQty: itemType === "service" ? "" : current.packContainsQty,
            packContainsUnit: itemType === "service" ? "" : current.packContainsUnit,
          }));
        }}>{ITEM_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</Select></Field>
        <Field label="Name"><input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></Field>
        {suggestionDiffers ? <p className="small span">Suggested for {suggestion.label}: HSN {suggestion.hsn}, GST {suggestion.rate}%. {suggestion.note} <button type="button" className="btn" onClick={() => setForm(current => ({ ...current, hsnSac: suggestion.hsn, gstRate: String(suggestion.rate) }))}>Use this</button></p> : null}
        <Field label="SKU / Code">
          <input
            value={form.sku}
            aria-invalid={Boolean(skuConflict)}
            onChange={event => setForm(current => ({ ...current, sku: event.target.value }))}
          />
          {skuConflict ? (
            <span className="small red" role="status">
              SKU {normalizeSku(form.sku)} is already used by {skuConflict.name}. Choose another code.
            </span>
          ) : null}
        </Field>
        <Field label="Barcode"><input value={form.barcode || ""} onChange={event => setForm(current => ({ ...current, barcode: event.target.value }))} placeholder="Optional — scan or type" /></Field>
        <Field label="Brand"><input value={form.brand || ""} onChange={event => setForm(current => ({ ...current, brand: event.target.value }))} placeholder="Optional" /></Field>
        <Field label="Category">
          <Select value={form.categoryId} onChange={event => setForm(current => ({ ...current, categoryId: event.target.value }))}>
            <option value="">None</option>
            {categoryOptions.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
          </Select>
        </Field>
        <Field label="Unit"><Select value={form.unit} onChange={event => {
          const unit = event.target.value;
          setForm(current => ({
            ...current,
            unit,
            ...(canSetPackContains(unit) ? {} : { packContainsQty: "", packContainsUnit: "" }),
          }));
        }}>{unitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}</Select></Field>
        {showPackContains ? (
          <>
            <Field label={`1 ${form.unit || "unit"} contains`}>
              <input
                type="number"
                min="0"
                step="0.001"
                value={form.packContainsQty || ""}
                placeholder="e.g. 25"
                onChange={event => setForm(current => ({
                  ...current,
                  packContainsQty: event.target.value,
                  packContainsUnit: event.target.value
                    ? (current.packContainsUnit || defaultPackUnit || "Kg")
                    : "",
                }))}
              />
            </Field>
            <Field label="Contains unit">
              <Select
                value={packUnitValue}
                onChange={event => setForm(current => ({ ...current, packContainsUnit: event.target.value }))}
              >
                <option value="">Not set</option>
                {PACK_CONTAINS_UNITS.map(unit => (
                  <option key={unit} value={unit}>{unit === "Gram" ? "g" : unit === "Millilitre" ? "ml" : unit}</option>
                ))}
              </Select>
            </Field>
            {(form.packContainsQty && packUnitValue) ? (
              <p className="small span">
                Counter can sell in {packUnitValue === "Gram" ? "g" : packUnitValue === "Millilitre" ? "ml" : packUnitValue}
                {" "}or {form.unit}. Price stays ₹{form.sellingPrice || "…"} / {form.unit}.
              </p>
            ) : (
              <p className="small span">Enter kg per bag (25 or 26) so Counter can sell Rice in Kg or g.</p>
            )}
          </>
        ) : null}
        <Field label="Selling price"><input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={event => setForm(current => ({ ...current, sellingPrice: event.target.value }))} /></Field>
        {!isService && <Field label="Purchase price"><input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={event => setForm(current => ({ ...current, purchasePrice: event.target.value }))} /></Field>}
        <Field label="GST %"><input type="number" min="0" max="100" step="0.01" value={form.gstRate} onChange={event => setForm(current => ({ ...current, gstRate: event.target.value }))} /></Field>
        <Field label="HSN / SAC"><input value={form.hsnSac} onChange={event => setForm(current => ({ ...current, hsnSac: event.target.value }))} /></Field>
        {form.itemType === "product" && <>
          <Field label="Batch no."><input value={form.batchNo || ""} onChange={event => setForm(current => ({ ...current, batchNo: event.target.value }))} placeholder="Optional" /></Field>
          <Field label="Expiry date"><input type="date" value={form.expiryDate || ""} onChange={event => setForm(current => ({ ...current, expiryDate: event.target.value }))} /></Field>
          <Field label="Opening stock"><QtyInput unit={form.unit} value={form.openingStock} onValue={openingStock => setForm(current => ({ ...current, openingStock }))} /></Field>
          <Field label="Opening date"><input type="date" value={form.openingStockDate} onChange={event => setForm(current => ({ ...current, openingStockDate: event.target.value }))} /></Field>
          <Field label="Opening rate (cost / unit)"><input type="number" min="0" step="0.01" value={form.openingRate ?? ""} placeholder={form.purchasePrice ? `Uses purchase price ${form.purchasePrice}` : "Uses purchase price"} onChange={event => setForm(current => ({ ...current, openingRate: event.target.value }))} /></Field>
          <Field label="Reorder level"><QtyInput unit={form.unit} value={form.reorderLevel} onValue={reorderLevel => setForm(current => ({ ...current, reorderLevel }))} /></Field>
        </>}
        <Field className="span" label="Description"><input value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></Field>
      </div>
      <div className="tabs spacer">
        <button type="button" className="btn primary" disabled={saving || Boolean(skuConflict)} onClick={saveItem}>
          {saving ? "Saving…" : "Save item"}
        </button>
      </div>
    </DialogModal>
  );
}
