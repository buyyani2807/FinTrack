import { AccSetupSection } from "../../components/AccUi.jsx";

export function ProductionReadinessPanel({ downloadCompanyBackup }) {
  return (
    <AccSetupSection icon="✓" title="Production readiness" copy="A practical checklist for running FinTrack safely in production." collapsible summary="Operational safeguards">
      <div className="production-readiness-grid">
        <div className="card"><strong>Backups</strong><p className="small">Download a company backup after each important month-end and store it outside the browser.</p><button type="button" className="btn" onClick={downloadCompanyBackup}>Download backup now</button></div>
        <div className="card"><strong>Restore drill</strong><p className="small">Test restore in a separate empty company before relying on a backup. Existing restore safeguards prevent overwriting posted books.</p><span className="acc-chip ok">Protected workflow</span></div>
        <div className="card"><strong>Period control</strong><p className="small">Lock completed periods so posted vouchers cannot be changed accidentally.</p><button type="button" className="btn" onClick={() => document.getElementById("accounts-period-lock")?.scrollIntoView({ behavior: "smooth" })}>Open period locks</button></div>
        <div className="card"><strong>Scale safely</strong><p className="small">Use date filters, company separation, and regular exports as transaction volume grows.</p><span className="acc-chip">Company isolated</span></div>
      </div>
    </AccSetupSection>
  );
}
