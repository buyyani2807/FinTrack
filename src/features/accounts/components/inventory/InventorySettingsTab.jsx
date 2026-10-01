export function InventorySettingsTab({ inventorySettings, saving, canEdit, onSaveInventorySettings }) {
  return (
    <div className="card spacer">
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
    </div>
  );
}
