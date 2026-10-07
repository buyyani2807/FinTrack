import { setAccountingIntegration, syncAccountingOperations } from "../../data/accountingRepository.js";
import { AccSetupSection } from "../../components/AccUi.jsx";

export function IntegrationSetupPanel({ settings, saving, run, token }) {
  return (
    <AccSetupSection
      icon="↔"
      title="Accounting integration"
      copy="The finance company is created with this business account. Cashbook stays the finance cash book. Sync copies it into that finance company only while integration is on. Collections, loans given, chit receipts and payouts, expenses, openings, transfers and manual lines go there. A sale, receipt or route collection typed in Accounts stays in the Accounts company where it was entered. The same cashbook row is never posted twice in the finance company."
      actions={<span className={`acc-chip ${settings?.integrationEnabled ? "ok" : ""}`}>Status: {settings?.integrationEnabled ? "ON" : "OFF"}</span>}
    >
      <div className="accounts-action-row">
        <button type="button" className="btn" disabled={saving} onClick={() => run(() => setAccountingIntegration(token, !settings?.integrationEnabled), `Integration ${settings?.integrationEnabled ? "disabled" : "enabled"}.`)}>{settings?.integrationEnabled ? "Turn integration off" : "Turn integration on"}</button>
        {settings?.integrationEnabled && <button type="button" className="btn" disabled={saving} onClick={() => run(() => syncAccountingOperations(token), result => {
          const created = Number(result?.created || 0);
          const skipped = Number(result?.skipped || 0);
          const company = result?.company_name || "the finance company";
          if (result?.integration === false) return "Integration is off. Nothing was copied.";
          if (skipped) return `Synced ${created} into ${company}. ${skipped} left out: ${result.skip_reason || "could not post"}.`;
          return created ? `Synced ${created} into ${company}.` : `${company} already had these cashbook rows.`;
        })}>Sync linked vouchers</button>}
      </div>
    </AccSetupSection>
  );
}
