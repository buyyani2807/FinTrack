import { setAccountingIntegration, syncAccountingOperations } from "../../data/accountingRepository.js";
import { AccSetupSection } from "../../components/AccUi.jsx";

export function IntegrationSetupPanel({ settings, saving, run, token }) {
  return (
    <AccSetupSection
      icon="↔"
      title="Accounting integration"
      copy="Cashbook stays the finance cash book. Sync copies it into the primary Accounts company: collections, loans given, chit receipts and payouts, expenses, openings, transfers and manual lines. A sale, receipt or route collection typed in Accounts stays in Accounts. Keep this off when the Accounts company is a different business. The same cashbook row is never posted twice."
      actions={<span className={`acc-chip ${settings?.integrationEnabled ? "ok" : ""}`}>Status: {settings?.integrationEnabled ? "ON" : "OFF"}</span>}
    >
      <div className="accounts-action-row">
        <button type="button" className="btn" disabled={saving} onClick={() => run(() => setAccountingIntegration(token, !settings?.integrationEnabled), `Integration ${settings?.integrationEnabled ? "disabled" : "enabled"}.`)}>{settings?.integrationEnabled ? "Turn integration off" : "Turn integration on"}</button>
        {settings?.integrationEnabled && <button type="button" className="btn" disabled={saving} onClick={() => run(() => syncAccountingOperations(token), result => {
          const created = Number(result?.created || 0);
          const skipped = Number(result?.skipped || 0);
          if (result?.integration === false) return "Integration is off. Nothing was copied.";
          if (skipped) return `Synced ${created} into the primary company. ${skipped} left out: ${result.skip_reason || "could not post"}.`;
          return created ? `Synced ${created} into the primary company.` : "Primary company already had these cashbook rows.";
        })}>Sync linked vouchers</button>}
      </div>
    </AccSetupSection>
  );
}
