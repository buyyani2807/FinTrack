import { useMemo, useState } from "react";
import { SegmentedControl } from "../../../../components/ui.jsx";
import {
  STARTER_CATALOGS,
  starterCatalogForIndustry,
  starterCatalogImportRows,
  starterCatalogView,
} from "../../model/starterItemCatalog.js";

/**
 * Pick common items for this business type and send them to the same import preview as a CSV.
 * Already-owned items are shown but cannot be ticked.
 */
export function StarterCatalogPicker({ industry = "", items = [], canEdit, saving, onPrepare }) {
  const [catalogId, setCatalogId] = useState(() => starterCatalogForIndustry(industry).id);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const view = useMemo(() => starterCatalogView(catalogId, items), [catalogId, items]);
  const q = query.trim().toLowerCase();
  const shown = q ? view.filter(row => `${row.name} ${row.category} ${row.hsnSac}`.toLowerCase().includes(q)) : view;
  const selectable = shown.filter(row => !row.owned);
  const allShownPicked = selectable.length > 0 && selectable.every(row => picked.has(row.sku));
  const groups = useMemo(() => {
    const map = new Map();
    for (const row of shown) {
      if (!map.has(row.category)) map.set(row.category, []);
      map.get(row.category).push(row);
    }
    return [...map.entries()];
  }, [shown]);

  const toggle = sku => setPicked(current => {
    const next = new Set(current);
    if (next.has(sku)) next.delete(sku);
    else next.add(sku);
    return next;
  });
  const toggleAll = () => setPicked(current => {
    const next = new Set(current);
    for (const row of selectable) {
      if (allShownPicked) next.delete(row.sku);
      else next.add(row.sku);
    }
    return next;
  });
  const switchCatalog = id => {
    setCatalogId(id);
    setPicked(new Set());
    setQuery("");
  };
  const prepare = () => {
    const rows = starterCatalogImportRows(catalogId, [...picked]);
    if (rows.length) onPrepare(rows);
    setPicked(new Set());
  };

  return (
    <div className="card spacer acc-starter-catalog">
      <strong>Start from a ready item list</strong>
      <p className="small">
        Tick the items you sell. Unit, HSN and GST rate are filled in (GST rates in force from 22 Sept 2025);
        prices and stock start at zero for you to set after import. GST can depend on packing or price,
        so confirm rates with your CA.
      </p>
      <SegmentedControl
        label="Business type"
        value={catalogId}
        onChange={switchCatalog}
        options={STARTER_CATALOGS.map(catalog => ({ id: catalog.id, label: catalog.label }))}
      />
      <div className="accounts-action-row spacer">
        <input
          type="search"
          className="acc-starter-search"
          placeholder="Search items, category or HSN"
          aria-label="Search the item list"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <button type="button" className="btn" disabled={!canEdit || !selectable.length} onClick={toggleAll}>
          {allShownPicked ? "Clear" : "Select all"}
        </button>
        <button type="button" className="btn primary" disabled={!canEdit || saving || !picked.size} onClick={prepare}>
          {picked.size ? `Review ${picked.size} item${picked.size === 1 ? "" : "s"}` : "Review selected"}
        </button>
      </div>
      {!shown.length && <p className="small">No items match “{query}”.</p>}
      {groups.map(([category, rows]) => (
        <fieldset key={category} className="acc-starter-group">
          <legend className="small"><strong>{category}</strong></legend>
          {rows.map(row => (
            <label key={row.sku} className={`acc-starter-item${row.owned ? " is-owned" : ""}`}>
              <input
                type="checkbox"
                checked={row.owned || picked.has(row.sku)}
                disabled={!canEdit || row.owned}
                onChange={() => toggle(row.sku)}
              />
              <span>{row.name}</span>
              <span className="small">{row.unit} · HSN {row.hsnSac} · GST {row.gstRate}%{row.owned ? " · already in your items" : ""}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
