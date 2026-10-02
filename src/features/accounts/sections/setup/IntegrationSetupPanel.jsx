import { setAccountingIntegration, syncAccountingOperations } from "../../data/accountingRepository.js";
import { AccSetupSection } from "../../components/AccUi.jsx";

export function IntegrationSetupPanel({ settings, saving, run, token }) {
  return (
    <AccSetupSection
      icon="↔"
      title="Accounting integration"
      copy="Cashbook is always available from Finance. This switch only copies eligible Daily, Monthly, Chit, and Cashbook rows into the primary Accounts company. Keep it off if Accounts books belong to a different business. The same payment is never posted twice."
      actions={<span className={`acc-chip ${settings?.integrationEnabled ? "ok" : ""}`}>Status: {settings?.integrationEnabled ? "ON" : "OFF"}</span>}
    >
      <div className="accounts-action-row">
        <button type="button" className="btn" disabled={saving} onClick={() => run(() => setAccountingIntegration(token, !settings?.integrationEnabled), `Integration ${settings?.integrationEnabled ? "disabled" : "enabled"}.`)}>{settings?.integrationEnabled ? "Turn integration off" : "Turn integration on"}</button>
        {settings?.integrationEnabled && <button type="button" className="btn" disabled={saving} onClick={() => run(() => syncAccountingOperations(token), "Linked vouchers synced from operations.")}>Sync linked vouchers</button>}
      </div>
    </AccSetupSection>
  );
}
