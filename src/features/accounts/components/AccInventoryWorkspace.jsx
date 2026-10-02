import { useMemo, useState } from "react";
import { todayIso } from "../../../lib/dates.js";
import { downloadAccountsCsv } from "../io/accountingExport.js";
import { stockMovementReport } from "../model/inventoryModel.js";
import { STOCK_AGE_BUCKETS, physicalCountVariances, stockAgeing, stockValuation } from "../model/inventoryValuation.js";
import { parseItemCsv, planItemImport } from "../io/itemCsvImport.js";
import { StockSummaryTab } from "./inventory/StockSummaryTab.jsx";
import { StockMovementsTab } from "./inventory/StockMovementsTab.jsx";
import { PhysicalCountTab } from "./inventory/PhysicalCountTab.jsx";
import { StockAgeingTab } from "./inventory/StockAgeingTab.jsx";
import { ItemImportTab } from "./inventory/ItemImportTab.jsx";
import { InventorySettingsTab } from "./inventory/InventorySettingsTab.jsx";


const TABS = [
  { id: "summary", label: "Stock summary" },
  { id: "items", label: "Items" },
  { id: "movements", label: "Movements" },
  { id: "count", label: "Physical count" },
  { id: "ageing", label: "Ageing" },
  { id: "import", label: "Import items" },
  { id: "settings", label: "Settings" },
];


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
  tab: routeTab = null,
  onTabChange,
}) {
  // The open tab is the URL (/accounting/inventory/:tab).
  const tab = TABS.some(item => item.id === routeTab) ? routeTab : "summary";
  const setTab = next => onTabChange?.(next);
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

      {tab === "summary" && valuation && <StockSummaryTab
        asOf={asOf}
        setAsOf={setAsOf}
        search={search}
        setSearch={setSearch}
        exportSummary={exportSummary}
        valuation={valuation}
        matches={matches}
      />}

      {tab === "items" && itemsSetup}

      {tab === "movements" && <StockMovementsTab
        moveFrom={moveFrom}
        setMoveFrom={setMoveFrom}
        moveTo={moveTo}
        setMoveTo={setMoveTo}
        moveItemId={moveItemId}
        setMoveItemId={setMoveItemId}
        products={products}
        moveRows={moveRows}
      />}

      {tab === "count" && countBook && <PhysicalCountTab
        countDate={countDate}
        setCountDate={setCountDate}
        search={search}
        setSearch={setSearch}
        countBook={countBook}
        matches={matches}
        variances={variances}
        counts={counts}
        canEdit={canEdit}
        setCounts={setCounts}
        countError={countError}
        saving={saving}
        applyCount={applyCount}
      />}

      {tab === "ageing" && ageing && <StockAgeingTab
        asOf={asOf}
        setAsOf={setAsOf}
        exportAgeing={exportAgeing}
        ageing={ageing}
      />}

      {tab === "import" && <ItemImportTab
        canEdit={canEdit}
        saving={saving}
        readImportFile={readImportFile}
        importPlan={importPlan}
        setImportPlan={setImportPlan}
        runImport={runImport}
        importStatus={importStatus}
      />}

      {tab === "settings" && <InventorySettingsTab
        inventorySettings={inventorySettings}
        saving={saving}
        canEdit={canEdit}
        onSaveInventorySettings={onSaveInventorySettings}
      />}
    </section>
  );
}
