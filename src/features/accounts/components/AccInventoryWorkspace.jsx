import { useMemo, useState } from "react";
import { formatInr } from "../../../lib/formatMoney.js";
import { todayIso } from "../../../lib/dates.js";
import { downloadAccountsCsv } from "../io/accountingExport.js";
import { stockMovementReport, stockReasonLabel, stockStatus } from "../model/inventoryModel.js";
import { STOCK_AGE_BUCKETS, physicalCountVariances, stockAgeing, stockValuation } from "../model/inventoryValuation.js";
import { ITEM_CSV_TEMPLATE, parseItemCsv, planItemImport } from "../io/itemCsvImport.js";
import { FilterField as Field } from "./AccUi.jsx";

const money = formatInr;
const qty = (value, unit) => `${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;

const TABS = [
  { id: "summary", label: "Stock summary" },
  { id: "items", label: "Items" },
  { id: "movements", label: "Movements" },
  { id: "count", label: "Physical count" },
  { id: "ageing", label: "Ageing" },
  { id: "import", label: "Import items" },
  { id: "settings", label: "Settings" },
];


function Metric({ label, value, tone = "" }) {
  return <article className="card acc-metric-card"><div className="metric-label">{label}</div><div className={`metric-value ${tone}`.trim()}>{value}</div></article>;
}

export function AccInventoryWorkspace({
  items = [],
  movements = [],
  voucherItemLines = [],
  range = {},
  saving = false,
  canEdit = true,
  itemsSetup = null,
  inventorySettings = { available: false, allowNegativeStock: false },
  onSaveInventorySettings,
  onImportItems,
  onApplyCount,
}) {
  const [tab, setTab] = useState("summary");
  const [asOf, setAsOf] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [moveFrom, setMoveFrom] = useState(range.from || "");
  const [moveTo, setMoveTo] = useState(range.to || "");
  const [moveItemId, setMoveItemId] = useState("");
  const [countDate, setCountDate] = useState(todayIso());
  const [counts, setCounts] = useState({});
  const [countError, setCountError] = useState("");
  const [importPlan, setImportPlan] = useState(null);
  const [importStatus, setImportStatus] = useState("");

  const products = useMemo(() => items.filter(item => item.itemType !== "service"), [items]);
  const valuation = useMemo(
    () => (tab === "summary" ? stockValuation({ items: products, movements, voucherItemLines, asOf }) : null),
    [tab, products, movements, voucherItemLines, asOf],
  );
  const ageing = useMemo(
    () => (tab === "ageing" ? stockAgeing({ items: products, movements, voucherItemLines, asOf }) : null),
    [tab, products, movements, voucherItemLines, asOf],
  );
  const moveRows = useMemo(
    () => (tab === "movements" ? stockMovementReport(movements, items, { from: moveFrom, to: moveTo, itemId: moveItemId }).slice(0, 500) : []),
    [tab, movements, items, moveFrom, moveTo, moveItemId],
  );
  const countBook = useMemo(
    () => (tab === "count" ? stockValuation({ items: products.filter(item => item.isActive !== false), movements, voucherItemLines, asOf: countDate }) : null),
    [tab, products, movements, voucherItemLines, countDate],
  );
  const variances = useMemo(() => {
    if (tab !== "count") return [];
    try {
      return physicalCountVariances({ items: products, movements, voucherItemLines, counts, date: countDate });
    } catch {
      return [];
    }
  }, [tab, products, movements, voucherItemLines, counts, countDate]);

  const q = search.trim().toLowerCase();
  const matches = row => !q || `${row.name} ${row.sku || ""}`.toLowerCase().includes(q);

  const exportSummary = () => downloadAccountsCsv(`fintrack-stock-summary-${asOf}.csv`, [
    ["Item", "SKU", "Unit", "Quantity", "Average cost", "Value", "Last received"],
    ...valuation.rows.map(row => [row.name, row.sku, row.unit, row.quantity, row.averageCost, row.value, row.lastInDate || ""]),
    ["Total", "", "", "", "", valuation.totalValue, ""],
  ]);

  const exportAgeing = () => downloadAccountsCsv(`fintrack-stock-ageing-${asOf}.csv`, [
    ["Item", "SKU", "Quantity", "Value", "Oldest (days)", ...STOCK_AGE_BUCKETS.map(bucket => bucket.label)],
    ...ageing.rows.map(row => [row.name, row.sku, row.quantity, row.value, row.oldestDays, ...STOCK_AGE_BUCKETS.map(bucket => row[bucket.id])]),
  ]);

  const readImportFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setImportStatus("");
    if (!file) return;
    const rows = parseItemCsv(await file.text());
    if (!rows.length) {
      setImportPlan(null);
      setImportStatus("No item rows found. Use the template: it needs at least Name and SKU columns.");
      return;
    }
    setImportPlan(planItemImport(rows, items));
  };

  const runImport = async () => {
    if (!importPlan?.toCreate.length) return;
    const status = await onImportItems(importPlan.toCreate);
    setImportStatus(status || "");
    setImportPlan(null);
  };

  const applyCount = async () => {
    setCountError("");
    let rows;
    try {
      rows = physicalCountVariances({ items: products, movements, voucherItemLines, counts, date: countDate });
    } catch (err) {
      setCountError(err.message);
      return;
    }
    if (!rows.length) {
      setCountError("Counted quantities match the books — nothing to adjust.");
      return;
    }
    const ok = await onApplyCount({ date: countDate, variances: rows });
    if (ok) setCounts({});
  };

  return (
    <section className="acc-inventory">
      <div className="accounts-section-nav">
        {TABS.map(item => (
          <button key={item.id} type="button" className={`accounts-section-tab ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </div>

      {tab === "summary" && valuation && <>
        <div className="accounts-action-row spacer">
          <Field label="Stock as on"><input type="date" value={asOf} onChange={event => setAsOf(event.target.value || todayIso())} /></Field>
          <input className="accounts-search" placeholder="Search item or SKU" value={search} onChange={event => setSearch(event.target.value)} />
          <button type="button" className="btn" onClick={exportSummary}>Export CSV</button>
        </div>
        <div className="acc-metric-grid three spacer">
          <Metric label="Stock value (weighted average)" value={money(valuation.totalValue)} />
          <Metric label="Products in stock" value={String(valuation.itemsInStock)} />
          <Metric label="Negative stock" value={String(valuation.negativeItems)} tone={valuation.negativeItems ? "red" : ""} />
        </div>
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Item</th><th>SKU</th><th className="acc-num">Quantity</th><th className="acc-num">Avg cost</th><th className="acc-num">Value</th><th>Status</th></tr></thead><tbody>
          {valuation.rows.filter(matches).map(row => {
            const status = row.quantity < 0 ? "Negative" : stockStatus(row.quantity, row.reorderLevel) === "low" ? "Low stock" : row.quantity === 0 ? "Out of stock" : "";
            return <tr key={row.itemId}><td>{row.name}</td><td>{row.sku}</td><td className="acc-num">{qty(row.quantity, row.unit)}</td><td className="acc-num">{money(row.averageCost)}</td><td className="acc-num">{money(row.value)}</td><td className={row.quantity < 0 ? "red" : ""}>{status}</td></tr>;
          })}
          {!valuation.rows.length && <tr><td colSpan="6">No products yet. Add items or import them from a CSV.</td></tr>}
          {valuation.rows.length > 0 && <tr><td colSpan="4"><strong>Total</strong></td><td className="acc-num"><strong>{money(valuation.totalValue)}</strong></td><td></td></tr>}
        </tbody></table></div>
        <p className="small spacer">Valued at moving weighted-average cost. Purchases use the line value after discount and before GST; opening stock uses the item's opening rate (or purchase price). This value flows into the Profit &amp; Loss and Balance Sheet as closing stock.</p>
      </>}

      {tab === "items" && itemsSetup}

      {tab === "movements" && <>
        <div className="accounts-action-row spacer">
          <Field label="From"><input type="date" value={moveFrom} onChange={event => setMoveFrom(event.target.value)} /></Field>
          <Field label="To"><input type="date" value={moveTo} onChange={event => setMoveTo(event.target.value)} /></Field>
          <Field label="Item">
            <select value={moveItemId} onChange={event => setMoveItemId(event.target.value)}>
              <option value="">All products</option>
              {products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Date</th><th>Item</th><th>Reason</th><th className="acc-num">Qty</th><th>Voucher / note</th></tr></thead><tbody>
          {moveRows.map(row => <tr key={row.id}><td>{row.movementDate}</td><td>{row.itemName}</td><td>{stockReasonLabel(row.reason)}</td><td className={`acc-num ${row.quantityDelta < 0 ? "red" : "green"}`}>{row.quantityDelta > 0 ? `+${qty(row.quantityDelta)}` : qty(row.quantityDelta)}</td><td>{row.voucherNumber || row.note || "—"}</td></tr>)}
          {!moveRows.length && <tr><td colSpan="5">No stock movements for this filter.</td></tr>}
        </tbody></table></div>
      </>}

      {tab === "count" && countBook && <>
        <p className="copy spacer">Enter what you counted on the shelf. Leave a row blank to skip it. Differences are posted as stock adjustments dated on the count date.</p>
        <div className="accounts-action-row spacer">
          <Field label="Count date"><input type="date" value={countDate} onChange={event => setCountDate(event.target.value || todayIso())} /></Field>
          <input className="accounts-search" placeholder="Search item or SKU" value={search} onChange={event => setSearch(event.target.value)} />
        </div>
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Item</th><th className="acc-num">Book qty</th><th className="acc-num">Counted</th><th className="acc-num">Difference</th><th className="acc-num">Value impact</th></tr></thead><tbody>
          {countBook.rows.filter(matches).map(row => {
            const variance = variances.find(entry => entry.itemId === row.itemId);
            return <tr key={row.itemId}>
              <td>{row.name} <span className="small">{row.sku}</span></td>
              <td className="acc-num">{qty(row.quantity, row.unit)}</td>
              <td className="acc-num"><input type="number" min="0" step="0.001" className="acc-count-input" value={counts[row.itemId] ?? ""} disabled={!canEdit} onChange={event => setCounts(current => ({ ...current, [row.itemId]: event.target.value }))} /></td>
              <td className={`acc-num ${variance ? (variance.quantityDelta < 0 ? "red" : "green") : ""}`}>{variance ? (variance.quantityDelta > 0 ? `+${qty(variance.quantityDelta)}` : qty(variance.quantityDelta)) : ""}</td>
              <td className="acc-num">{variance ? money(variance.valueImpact) : ""}</td>
            </tr>;
          })}
          {!countBook.rows.length && <tr><td colSpan="5">No active products to count.</td></tr>}
        </tbody></table></div>
        {countError && <p className="red small">{countError}</p>}
        <div className="accounts-action-row spacer">
          <p className="small">{variances.length} item{variances.length === 1 ? "" : "s"} to adjust · value impact {money(variances.reduce((sum, row) => sum + row.valueImpact, 0))}</p>
          <button type="button" className="btn primary" disabled={saving || !canEdit || !variances.length} onClick={applyCount}>{saving ? "Posting…" : "Post adjustments"}</button>
        </div>
      </>}

      {tab === "ageing" && ageing && <>
        <div className="accounts-action-row spacer">
          <Field label="Age as on"><input type="date" value={asOf} onChange={event => setAsOf(event.target.value || todayIso())} /></Field>
          <button type="button" className="btn" onClick={exportAgeing}>Export CSV</button>
        </div>
        <div className="acc-metric-grid spacer">
          {STOCK_AGE_BUCKETS.map(bucket => <Metric key={bucket.id} label={bucket.label} value={money(ageing.totals[bucket.id])} tone={bucket.id === "d180" && ageing.totals[bucket.id] ? "red" : ""} />)}
        </div>
        <div className="table spacer acc-table-wrap"><table><thead><tr><th>Item</th><th className="acc-num">Quantity</th><th className="acc-num">Oldest</th>{STOCK_AGE_BUCKETS.map(bucket => <th key={bucket.id} className="acc-num">{bucket.label}</th>)}</tr></thead><tbody>
          {ageing.rows.map(row => <tr key={row.itemId}><td>{row.name}</td><td className="acc-num">{qty(row.quantity, row.unit)}</td><td className="acc-num">{row.oldestDays} days</td>{STOCK_AGE_BUCKETS.map(bucket => <td key={bucket.id} className="acc-num">{row[bucket.id] ? money(row[bucket.id]) : ""}</td>)}</tr>)}
          {!ageing.rows.length && <tr><td colSpan={3 + STOCK_AGE_BUCKETS.length}>No stock on hand on this date.</td></tr>}
        </tbody></table></div>
        <p className="small spacer">Assumes the oldest stock is sold first. Values use weighted-average cost.</p>
      </>}

      {tab === "import" && <>
        <p className="copy spacer">Upload a CSV of items. Name and SKU are required; type, unit, category, prices, GST, HSN/SAC, opening stock, opening rate, opening date and reorder level are optional. Existing SKUs are skipped.</p>
        <div className="accounts-action-row spacer">
          <button type="button" className="btn" onClick={() => downloadAccountsCsv("fintrack-items-template.csv", ITEM_CSV_TEMPLATE.split("\n").map(line => line.split(",")))}>Download template</button>
          <label className={`btn primary ${!canEdit ? "disabled" : ""}`.trim()}>
            Choose CSV
            <input type="file" accept=".csv,text/csv" hidden disabled={!canEdit || saving} onChange={readImportFile} />
          </label>
        </div>
        {importPlan && <div className="card spacer">
          <strong>{importPlan.toCreate.length} new item{importPlan.toCreate.length === 1 ? "" : "s"} ready</strong>
          <p className="small">{importPlan.duplicates.length} existing SKU{importPlan.duplicates.length === 1 ? "" : "s"} skipped · {importPlan.invalid.length} row{importPlan.invalid.length === 1 ? "" : "s"} with errors</p>
          {importPlan.invalid.length > 0 && <ul className="small">
            {importPlan.invalid.slice(0, 8).map(row => <li key={row.rowNumber}>Row {row.rowNumber}: {row.error}</li>)}
          </ul>}
          {importPlan.toCreate.length > 0 && <div className="table spacer acc-table-wrap"><table><thead><tr><th>Name</th><th>SKU</th><th>Type</th><th>Unit</th><th className="acc-num">Opening</th><th className="acc-num">Rate</th></tr></thead><tbody>
            {importPlan.toCreate.slice(0, 20).map(row => <tr key={row.rowNumber}><td>{row.name}</td><td>{row.sku}</td><td>{row.itemType}</td><td>{row.unit}</td><td className="acc-num">{row.openingStock}</td><td className="acc-num">{row.openingRate || row.purchasePrice}</td></tr>)}
          </tbody></table></div>}
          <div className="tabs spacer">
            <button type="button" className="btn" onClick={() => setImportPlan(null)}>Cancel</button>
            <button type="button" className="btn primary" disabled={saving || !importPlan.toCreate.length} onClick={runImport}>{saving ? "Importing…" : `Import ${importPlan.toCreate.length}`}</button>
          </div>
        </div>}
        {importStatus && <p className="small spacer">{importStatus}</p>}
      </>}

      {tab === "settings" && <div className="card spacer">
        <strong>Stock rules</strong>
        {!inventorySettings.available && <p className="small">Run migration 080 to enable stock settings and opening rates.</p>}
        <label className="acc-toggle-row spacer">
          <input
            type="checkbox"
            checked={Boolean(inventorySettings.allowNegativeStock)}
            disabled={saving || !canEdit || !inventorySettings.available}
            onChange={event => onSaveInventorySettings({ allowNegativeStock: event.target.checked })}
          />
          <span>Allow negative stock</span>
        </label>
        <p className="small">Off (recommended): a sale, purchase return or adjustment is blocked if stock on its date — or on any later date — would go below zero. Turn on if you bill before recording purchases and fix stock later.</p>
      </div>}
    </section>
  );
}
