import { setItemActive, upsertItemCategory, deleteItem, deleteItemCategory, adjustStock } from "../data/accountingRepository.js";
import { AccItemsSetup } from "../components/AccItemsSetup.jsx";
import { AccInventoryWorkspace } from "../components/AccInventoryWorkspace.jsx";

export function InventorySection({
  items,
  stockMovements,
  voucherItemLines,
  range,
  saving,
  canWrite,
  inventorySettings,
  saveStockRules,
  importItems,
  applyPhysicalCount,
  itemCategories,
  vouchers,
  run,
  saveItemRecord,
  token,
  costLines,
  tab,
  onTabChange,
}) {
  return (
    <div className="acc-panel">
      <AccInventoryWorkspace
        items={items}
        movements={stockMovements}
        voucherItemLines={costLines}
        range={range}
        saving={saving}
        canEdit={canWrite}
        inventorySettings={inventorySettings}
        onSaveInventorySettings={saveStockRules}
        onImportItems={importItems}
        onApplyCount={applyPhysicalCount}
        tab={tab}
        onTabChange={onTabChange}
        itemsSetup={<AccItemsSetup
          items={items}
          categories={itemCategories}
          movements={stockMovements}
          voucherItemLines={voucherItemLines}
          vouchers={vouchers}
          saving={saving}
          onSaveItem={form => run(() => saveItemRecord(form), form.id ? "Item updated." : "Item created.")}
          onDeleteItem={item => run(() => deleteItem(token, item.id), "Item deleted.")}
          onSetItemActive={(id, active) => run(() => setItemActive(token, id, active), active ? "Item reactivated." : "Item deactivated.")}
          onSaveCategory={async payload => {
            let failure = null;
            const ok = await run(async () => {
              try {
                return await upsertItemCategory(token, payload);
              } catch (err) {
                failure = err;
                throw err;
              }
            }, payload.parentId ? "Subcategory saved." : "Category saved.");
            if (ok) return;
            const message = failure?.message || "";
            if (payload.parentId && /could not find the function|parent_id|schema cache/i.test(message)) {
              throw new Error("Could not create the subcategory. Run migration 105, then try again.");
            }
            throw new Error(message || "Could not create category. Confirm migration 067 is applied, then try again.");
          }}
          onDeleteCategory={id => run(() => deleteItemCategory(token, id), "Category deleted.")}
          onAdjustStock={payload => run(() => adjustStock(token, payload), "Stock adjustment saved.")}
        />}
      />
    </div>
  );
}
