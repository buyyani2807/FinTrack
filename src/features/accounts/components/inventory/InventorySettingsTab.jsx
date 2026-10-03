import { Boxes } from "lucide-react";

export function InventorySettingsTab({ inventorySettings, saving, canEdit, onSaveInventorySettings }) {
  return (
    <section className="card acc-side-card">
      <header className="acc-side-card-head">
        <span className="acc-settings-icon" aria-hidden="true"><Boxes size={18} /></span>
        <div><h3>Stock rules</h3><p className="small">How Accounts treats stock that would go below zero.</p></div>
      </header>
      {!inventorySettings.available && <p className="notice small">Run migration 080 to enable stock settings and opening rates.</p>}
      <label className="settings-switch-row acc-settings-switch">
        <span>
          <strong>Allow negative stock</strong>
          <span className="small">Off (recommended): a sale, purchase return or adjustment is blocked if stock on its date — or on any later date — would go below zero. Turn on if you bill before recording purchases and fix stock later.</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="ft-switch"
          checked={Boolean(inventorySettings.allowNegativeStock)}
          disabled={saving || !canEdit || !inventorySettings.available}
          onChange={event => onSaveInventorySettings({ allowNegativeStock: event.target.checked })}
        />
      </label>
    </section>
  );
}
