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
}) {
  return (
    <div className="acc-panel">
      <AccInventoryWorkspace
        items={items}
        movements={stockMovements}
        voucherItemLines={voucherItemLines}
        range={range}
        saving={saving}
        canEdit={canWrite}
        inventorySettings={inventorySettings}
        onSaveInventorySettings={saveStockRules}
        onImportItems={importItems}
        onApplyCount={applyPhysicalCount}
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
            const ok = await run(() => upsertItemCategory(token, payload), "Category saved.");
            if (!ok) throw new Error("Could not create category. Confirm migration 067 is applied, then try again.");
          }}
          onDeleteCategory={id => run(() => deleteItemCategory(token, id), "Category deleted.")}
          onAdjustStock={payload => run(() => adjustStock(token, payload), "Stock adjustment saved.")}
        />}
      />
    </div>
  );
}
