import { useMemo, useState } from "react";
import { Select } from "../../../../components/Select.jsx";
import { Field, AccSetupSection, AccTable } from "../../components/AccUi.jsx";
import { money } from "../../accountsFormat.js";
import {
  deletePriceList,
  loadPriceLists,
  savePriceListRates,
  upsertPriceList,
} from "../../data/accountingRepository.js";
import {
  PRICE_LIST_KINDS,
  assertPriceListDraft,
  emptyPriceListDraft,
  ratesPayload,
} from "../../model/priceLists.js";

export function PriceListsPanel({
  priceLists = [],
  setPriceLists,
  items = [],
  token,
  canWrite,
  saving,
  run,
}) {
  const [draft, setDraft] = useState(() => emptyPriceListDraft());
  const [error, setError] = useState("");
  const products = useMemo(
    () => (items || []).filter(item => item.isActive !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  const openList = list => {
    setError("");
    setDraft({
      id: list.id,
      name: list.name,
      kind: list.kind,
      isDefault: Boolean(list.isDefault),
      isActive: list.isActive !== false,
      rates: { ...(list.rates || {}) },
    });
  };

  const setRate = (itemId, value) => {
    setDraft(current => {
      const rates = { ...current.rates };
      const text = String(value ?? "").trim();
      if (!text) delete rates[itemId];
      else rates[itemId] = value;
      return { ...current, rates };
    });
  };

  const save = () => run(async () => {
    setError("");
    const ready = assertPriceListDraft(draft, { existing: priceLists });
    const id = await upsertPriceList(token, ready);
    await savePriceListRates(token, id, ratesPayload(ready.rates));
    setPriceLists(await loadPriceLists(token) || []);
    setDraft(emptyPriceListDraft(ready.kind));
  }, draft.id ? "Price list updated." : "Price list saved.");

  const remove = list => run(async () => {
    await deletePriceList(token, list.id);
    setPriceLists(await loadPriceLists(token) || []);
    if (draft.id === list.id) setDraft(emptyPriceListDraft(list.kind));
  }, "Price list deleted.");

  return (
    <AccSetupSection
      icon="₹"
      title="Price lists"
      copy="Named selling or purchase rates for items. Assign a list on a customer or supplier. The item’s own price is used when the list has no rate. Requires migration 107."
      collapsible
      summary={`${(priceLists || []).filter(row => row.isActive !== false).length} lists`}
    >
      {!canWrite ? <p className="small">View-only. An owner or accountant can edit price lists.</p> : null}
      {error ? <p className="notice" role="alert">{error}</p> : null}
      <div className="form">
        <Field label="Name"><input value={draft.name} placeholder="e.g. Dealer" onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} disabled={!canWrite} /></Field>
        <Field label="Kind">
          <Select value={draft.kind} disabled={!canWrite || Boolean(draft.id)} onChange={event => setDraft(current => ({ ...current, kind: event.target.value, rates: {} }))}>
            {PRICE_LIST_KINDS.map(kind => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
          </Select>
        </Field>
        <Field label="Default for this kind">
          <label className="small"><input type="checkbox" checked={draft.isDefault} disabled={!canWrite} onChange={event => setDraft(current => ({ ...current, isDefault: event.target.checked }))} /> Use when a party has no list</label>
        </Field>
      </div>
      <p className="small spacer">Rates on this list. Leave blank to fall back to the item price.</p>
      <div className="table acc-table-wrap">
        <table>
          <thead><tr><th>Item</th><th>SKU</th><th className="acc-num">Item price</th><th className="acc-num">List rate</th></tr></thead>
          <tbody>
            {products.map(item => {
              const itemPrice = draft.kind === "purchase" ? item.purchasePrice : item.sellingPrice;
              return (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.sku || "—"}</td>
                  <td className="acc-num">{money(itemPrice)}</td>
                  <td className="acc-num">
                    <input
                      className="acc-num-input"
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!canWrite}
                      value={draft.rates[item.id] ?? ""}
                      onChange={event => setRate(item.id, event.target.value)}
                    />
                  </td>
                </tr>
              );
            })}
            {!products.length && <tr><td colSpan={4}>Add items in Inventory before setting list rates.</td></tr>}
          </tbody>
        </table>
      </div>
      {canWrite ? (
        <div className="acc-form-actions">
          <button type="button" className="btn primary" disabled={saving || !draft.name.trim()} onClick={() => save().catch(err => setError(err.message || "Could not save the price list."))}>{saving ? "Saving…" : draft.id ? "Update list" : "Save list"}</button>
          {draft.id ? <button type="button" className="btn" disabled={saving} onClick={() => setDraft(emptyPriceListDraft(draft.kind))}>Clear</button> : null}
        </div>
      ) : null}
      <AccTable columns={["Name", "Kind", "Rates", ""]} empty={!priceLists.length && "No price lists yet."}>
        {(priceLists || []).map(list => (
          <tr key={list.id}>
            <td>{list.name}{list.isDefault ? " · default" : ""}{list.isActive === false ? " · inactive" : ""}</td>
            <td>{PRICE_LIST_KINDS.find(kind => kind.id === list.kind)?.label || list.kind}</td>
            <td>{Object.keys(list.rates || {}).length}</td>
            <td className="accounts-action-row">
              <button type="button" className="btn" onClick={() => openList(list)}>Open</button>
              {canWrite ? <button type="button" className="btn" disabled={saving} onClick={() => remove(list).catch(err => setError(err.message || "Could not delete the price list."))}>Delete</button> : null}
            </td>
          </tr>
        ))}
      </AccTable>
    </AccSetupSection>
  );
}
