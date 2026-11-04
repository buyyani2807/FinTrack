import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { FilterSelect, SearchInput } from "../../../components/ui.jsx";
import { todayIso } from "../../../lib/dates.js";
import { currentStockForItem, defaultUnitForIndustry, emptyItemForm, itemToForm, stockMovementReport, stockStatus, validateItemForm } from "../model/inventoryModel.js";
import { findSkuConflict } from "./items/ItemFormDialog.jsx";
import { costItemMovements } from "../model/inventoryValuation.js";
import { AccPager } from "./AccUi.jsx";
import { usePagedList } from "../model/usePagedList.js";
import { ItemsTable } from "./items/ItemsTable.jsx";
import { ItemCards } from "./items/ItemCards.jsx";
import { ItemsSidePanels } from "./items/ItemsSidePanels.jsx";
import { ItemFormDialog } from "./items/ItemFormDialog.jsx";
import { ItemDetailDialog } from "./items/ItemDetailDialog.jsx";
import { printItemLabels } from "../model/barcodeLabelPrint.js";

export function AccItemsSetup({
  items = [],
  categories = [],
  movements = [],
  voucherItemLines = [],
  vouchers = [],
  saving = false,
  companyName = "",
  industry = "",
  onSaveItem,
  onDeleteItem,
  onSetItemActive,
  onSaveCategory,
  onDeleteCategory,
  onAdjustStock,
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("active");
  const [form, setForm] = useState(emptyItemForm);
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [adjust, setAdjust] = useState({ itemId: "", date: todayIso(), quantityDelta: "", reasonNote: "" });
  const [error, setError] = useState("");

  const stockByItem = useMemo(() => {
    const map = {};
    for (const item of items) map[item.id] = currentStockForItem(item, movements);
    return map;
  }, [items, movements]);

  const lowStock = useMemo(
    () => items.filter(item => item.itemType === "product" && item.isActive !== false && stockStatus(stockByItem[item.id], item.reorderLevel) === "low"),
    [items, stockByItem],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(item => {
      if (typeFilter !== "all" && item.itemType !== typeFilter) return false;
      if (activeFilter === "active" && item.isActive === false) return false;
      if (activeFilter === "inactive" && item.isActive !== false) return false;
      if (!q) return true;
      return [item.name, item.sku, item.barcode, item.brand, item.hsnSac, item.description].join(" ").toLowerCase().includes(q);
    });
  }, [items, search, typeFilter, activeFilter]);
  const pagedItems = usePagedList(filtered, `${search}|${typeFilter}|${activeFilter}`);

  const detail = items.find(item => item.id === detailId) || null;
  const detailValue = detail && detail.itemType === "product" ? costItemMovements(detail, movements, voucherItemLines) : null;
  const detailMoves = detail ? stockMovementReport(movements, items, { itemId: detail.id }).slice(0, 12) : [];
  const detailSales = detail
    ? voucherItemLines.filter(line => line.itemId === detail.id && vouchers.find(v => v.id === line.voucherId)?.voucherType === "sales")
    : [];
  const detailPurchases = detail
    ? voucherItemLines.filter(line => line.itemId === detail.id && vouchers.find(v => v.id === line.voucherId)?.voucherType === "purchase")
    : [];

  const openCreate = () => {
    setForm({ ...emptyItemForm(), unit: defaultUnitForIndustry(industry, "product") });
    setShowForm(true);
    setError("");
  };

  const openEdit = item => {
    setForm(itemToForm(item));
    setShowForm(true);
    setError("");
  };

  const saveItem = async () => {
    const message = validateItemForm(form);
    if (message) {
      setError(message);
      return;
    }
    const conflict = findSkuConflict(items, form.sku, form.id || null);
    if (conflict) {
      setError(`SKU ${String(form.sku || "").trim().toUpperCase()} is already used by ${conflict.name}.`);
      return;
    }
    setError("");
    await onSaveItem(form);
    setShowForm(false);
    setForm(emptyItemForm());
  };

  return (
    <section className="acc-items-setup">
      {lowStock.length > 0 && (
        <div className="acc-low-stock" role="status">
          <span className="acc-low-stock-icon" aria-hidden="true"><TriangleAlert size={18} /></span>
          <div className="acc-low-stock-body">
            <strong>{lowStock.length} item{lowStock.length === 1 ? " is" : "s are"} low on stock</strong>
            <ul>
              {lowStock.map(item => (
                <li key={item.id}>
                  <button type="button" className="acc-low-stock-chip" onClick={() => setDetailId(item.id)}>
                    {item.name}<b>{stockByItem[item.id]} {item.unit} left</b>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="acc-list-toolbar acc-items-toolbar">
        <SearchInput label="Search items" className="acc-list-search" placeholder="Search name, SKU, HSN" value={search} onChange={event => setSearch(event.target.value)} />
        <div className="acc-list-filters">
          <FilterSelect label="Type" value={typeFilter} onChange={setTypeFilter}>
            <option value="all">All</option>
            <option value="product">Products</option>
            <option value="service">Services</option>
          </FilterSelect>
          <FilterSelect label="Status" value={activeFilter} onChange={setActiveFilter} allValue="active">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </FilterSelect>
        </div>
        <button
          type="button"
          className="btn"
          disabled={!filtered.length}
          onClick={() => {
            try {
              printItemLabels(filtered, { companyName });
            } catch (err) {
              setError(err?.message || "Could not print labels.");
            }
          }}
        >
          Print labels
        </button>
        <button type="button" className="btn primary acc-list-new" onClick={openCreate}>+ Item</button>
      </div>

      <ItemsTable
        filtered={pagedItems.items}
        stockByItem={stockByItem}
        setDetailId={setDetailId}
        saving={saving}
        openEdit={openEdit}
        onSetItemActive={onSetItemActive}
        onDeleteItem={onDeleteItem}
      />
      <ItemCards
        filtered={pagedItems.items}
        stockByItem={stockByItem}
        setDetailId={setDetailId}
        saving={saving}
        openEdit={openEdit}
        onSetItemActive={onSetItemActive}
        onDeleteItem={onDeleteItem}
      />
      <AccPager page={pagedItems.page} pages={pagedItems.pages} total={pagedItems.total} from={pagedItems.from} to={pagedItems.to} onPage={pagedItems.setPage} noun="items" />

      <ItemsSidePanels
        categoryName={categoryName}
        setCategoryName={setCategoryName}
        setCategoryError={setCategoryError}
        saving={saving}
        onSaveCategory={onSaveCategory}
        categoryError={categoryError}
        categories={categories}
        onDeleteCategory={onDeleteCategory}
        adjust={adjust}
        setAdjust={setAdjust}
        items={items}
        stockByItem={stockByItem}
        onAdjustStock={onAdjustStock}
      />

      {showForm && (
        <ItemFormDialog
          form={form}
          setShowForm={setShowForm}
          error={error}
          setForm={setForm}
          categories={categories}
          saving={saving}
          saveItem={saveItem}
          industry={industry}
          items={items}
        />
      )}

      {detail && (
        <ItemDetailDialog
          detail={detail}
          setDetailId={setDetailId}
          stockByItem={stockByItem}
          detailValue={detailValue}
          detailMoves={detailMoves}
          detailSales={detailSales}
          detailPurchases={detailPurchases}
          openEdit={openEdit}
        />
      )}
    </section>
  );
}
