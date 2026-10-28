import { useMemo, useState } from "react";
import { Select } from "../../../../components/Select.jsx";
import { Field, AccSetupSection, AccTable, Modal } from "../../components/AccUi.jsx";
import { money } from "../../accountsFormat.js";
import {
  deletePriceList,
  loadPriceLists,
  savePriceListRates,
  setPartyPriceList,
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
  parties = [],
  items = [],
  token,
  canWrite,
  saving,
  run,
}) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const products = useMemo(
    () => (items || []).filter(item => item.isActive !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );
  const editing = Boolean(draft?.id);
  const partyType = draft?.kind === "purchase" ? "supplier" : "customer";
  const partyOptions = useMemo(
    () => (parties || [])
      .filter(party => party.partyType === partyType && party.isActive !== false)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [parties, partyType],
  );

  const closeForm = () => {
    if (saving) return;
    setError("");
    setDraft(null);
  };

  const openCreate = () => {
    setError("");
    setDraft(emptyPriceListDraft("selling"));
  };

  const openList = list => {
    setError("");
    const assigned = (parties || []).find(party => party.priceListId === list.id);
    setDraft({
      id: list.id,
      name: list.name,
      kind: list.kind,
      partyId: assigned?.id || "",
      isDefault: Boolean(list.isDefault),
      isActive: list.isActive !== false,
      rates: { ...(list.rates || {}) },
    });
  };

  const pickParty = partyId => {
    const party = partyOptions.find(row => row.id === partyId);
    setDraft(current => ({
      ...current,
      partyId,
      name: party?.name || (current.isDefault ? current.name : ""),
      isDefault: partyId ? false : current.isDefault,
    }));
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

  const assignParty = async (listId, partyId) => {
    const previous = (parties || []).filter(party => party.priceListId === listId && party.id !== partyId);
    for (const party of previous) await setPartyPriceList(token, party.id, null);
    if (partyId) await setPartyPriceList(token, partyId, listId);
  };

  const save = () => run(async () => {
    setError("");
    if (!draft.isDefault && !draft.partyId) {
      throw new Error(draft.kind === "purchase"
        ? "Choose a supplier for this purchase list, or mark it as the company default."
        : "Choose a customer for this selling list, or mark it as the company default.");
    }
    const ready = assertPriceListDraft(draft, { existing: priceLists });
    const id = await upsertPriceList(token, ready);
    await savePriceListRates(token, id, ratesPayload(ready.rates));
    try {
      await assignParty(id, draft.partyId || null);
    } catch (err) {
      if (err.code !== "MIGRATION_REQUIRED") throw err;
    }
    setPriceLists(await loadPriceLists(token) || []);
    setDraft(null);
  }, draft.id ? "Price list updated." : "Price list saved.");

  const remove = list => run(async () => {
    await deletePriceList(token, list.id);
    setPriceLists(await loadPriceLists(token) || []);
    if (draft?.id === list.id) setDraft(null);
  }, "Price list deleted.");

  const partyLabel = draft?.kind === "purchase" ? "Supplier" : "Customer";
  const canSave = draft && (draft.isDefault ? Boolean(String(draft.name || "").trim()) : Boolean(draft.partyId));
  const activeCount = (priceLists || []).filter(row => row.isActive !== false).length;

  return (
    <>
      <AccSetupSection
        icon="₹"
        title="Price lists"
        copy="Customer or supplier rates for items. Create a list, choose the party, set rates, and save — it is assigned automatically. Blank rates use the item price."
        collapsible
        summary={`${activeCount} ${activeCount === 1 ? "list" : "lists"}`}
        actions={canWrite ? <button type="button" className="btn" onClick={openCreate}>+ Create price list</button> : null}
      >
        {!canWrite ? <p className="small">View-only. An owner or accountant can edit price lists.</p> : null}
        <AccTable columns={["Name", "Kind", "For", "Rates", ""]} empty={!priceLists.length && "No price lists yet."}>
          {(priceLists || []).map(list => {
            const assigned = (parties || []).find(party => party.priceListId === list.id);
            return (
              <tr key={list.id}>
                <td>{list.name}{list.isDefault ? " · default" : ""}{list.isActive === false ? " · inactive" : ""}</td>
                <td>{PRICE_LIST_KINDS.find(kind => kind.id === list.kind)?.label || list.kind}</td>
                <td>{assigned?.name || (list.isDefault ? "Any party without a list" : "—")}</td>
                <td>{Object.keys(list.rates || {}).length}</td>
                <td className="accounts-action-row">
                  <button type="button" className="btn" onClick={() => openList(list)}>Open</button>
                  {canWrite ? <button type="button" className="btn" disabled={saving} onClick={() => remove(list).catch(err => setError(err.message || "Could not delete the price list."))}>Delete</button> : null}
                </td>
              </tr>
            );
          })}
        </AccTable>
      </AccSetupSection>

      {draft && (
        <Modal
          wide
          panelClassName="acc-entry-dialog"
          title={editing ? `Edit price list · ${draft.name || "Untitled"}` : "Create price list"}
          close={closeForm}
          actions={(
            <div className="tabs spacer">
              <button type="button" className="btn" disabled={saving} onClick={closeForm}>Cancel</button>
              {canWrite ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={saving || !canSave}
                  onClick={() => save().catch(err => setError(err.message || "Could not save the price list."))}
                >
                  {saving ? "Saving…" : editing ? "Update list" : "Save list"}
                </button>
              ) : null}
            </div>
          )}
        >
          <p className="copy">
            {draft.kind === "purchase"
              ? "Choose a supplier and set purchase rates for the items they sell you."
              : "Choose a customer and set selling rates for the items you sell them."}
            {" "}Leave a rate blank to use the item’s own price.
          </p>
          {error ? <p className="notice" role="alert">{error}</p> : null}
          <div className="form">
            <Field label="Kind">
              <Select
                value={draft.kind}
                disabled={!canWrite || editing}
                onChange={event => setDraft(current => ({
                  ...emptyPriceListDraft(event.target.value),
                  id: current.id,
                  isDefault: current.isDefault,
                  rates: {},
                }))}
              >
                {PRICE_LIST_KINDS.map(kind => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
              </Select>
            </Field>
            <Field label={partyLabel}>
              <Select value={draft.partyId || ""} disabled={!canWrite} onChange={event => pickParty(event.target.value)}>
                <option value="">{draft.isDefault ? "Company default (no party)" : `Select ${partyLabel.toLowerCase()}`}</option>
                {partyOptions.map(party => (
                  <option key={party.id} value={party.id}>
                    {party.name}{party.priceListId && party.priceListId !== draft.id ? " · has a list" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            {draft.isDefault && !draft.partyId ? (
              <Field label="List name">
                <input
                  value={draft.name}
                  placeholder={draft.kind === "purchase" ? "e.g. Standard purchase" : "e.g. Standard selling"}
                  onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
                  disabled={!canWrite}
                />
              </Field>
            ) : null}
            <Field className="span" label="Company default">
              <label className="small">
                <input
                  type="checkbox"
                  checked={draft.isDefault}
                  disabled={!canWrite}
                  onChange={event => setDraft(current => ({
                    ...current,
                    isDefault: event.target.checked,
                    name: event.target.checked && !current.partyId
                      ? (current.name || (current.kind === "purchase" ? "Standard purchase" : "Standard selling"))
                      : current.name,
                  }))}
                />
                {" "}Also use for any {partyType} who does not have their own list
              </label>
            </Field>
          </div>
          <h3 className="acc-form-section-title spacer">Products</h3>
          <div className="table acc-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>SKU</th>
                  <th className="acc-num">Item price</th>
                  <th className="acc-num">List rate</th>
                </tr>
              </thead>
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
                          placeholder={itemPrice ? String(itemPrice) : "0"}
                        />
                      </td>
                    </tr>
                  );
                })}
                {!products.length && <tr><td colSpan={4}>Add items in Inventory before setting list rates.</td></tr>}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}
