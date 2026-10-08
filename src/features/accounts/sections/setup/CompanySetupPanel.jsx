import { saveAccountingSettings } from "../../data/accountingRepository.js";
import { Field, AccSetupSection } from "../../components/AccUi.jsx";
import { todayIso } from "../../../../lib/dates.js";
import { gstStatusLabel } from "../../accountsFormat.js";

function companyDetailsChanged(form, company) {
  if (!company?.id) return true;
  const name = String(form?.companyName || "").trim();
  const savedName = String(company.name || "").trim();
  const started = String(form?.booksStartedOn || "").slice(0, 10);
  const savedStarted = String(company.booksStartedOn || "").slice(0, 10);
  return name !== savedName || started !== savedStarted;
}

export function CompanySetupPanel({
  setupForm,
  setSetupForm,
  canAdmin,
  saving,
  setError,
  run,
  token,
  downloadCompanyBackup,
  previewCompanyRestore,
  restoreDraft,
  restoreBusy,
  confirmCompanyRestore,
  activeCompany,
  setRestoreDraft,
  companies,
  activeCompanyId,
  switchCompany,
  archiveCompany,
  setCompanyDraft,
  setShowCreateCompany,
}) {
  const companyChanged = companyDetailsChanged(setupForm, activeCompany);
  return (
    <AccSetupSection icon="FY" title="Company / financial year" copy="Indian financial year is 1 April to 31 March. Saving the name here updates the current Accounts company, not Finance.">
      <div className="form">
        <Field label="Business name"><input value={setupForm.companyName} onChange={event => setSetupForm(current => ({ ...current, companyName: event.target.value }))} /></Field>
        <Field label="Books start date"><input type="date" value={setupForm.booksStartedOn} onChange={event => setSetupForm(current => ({ ...current, booksStartedOn: event.target.value }))} /></Field>
      </div>
      <div className="acc-form-actions">
        <button type="button" className="btn primary" disabled={!canAdmin || saving || !companyChanged} title={canAdmin && !companyChanged ? "No company changes to save" : undefined} onClick={() => {
          if (!canAdmin) {
            setError("Only the business owner can change company settings.");
            return;
          }
          run(() => saveAccountingSettings(token, { ...setupForm, fyStartMonth: 4 }), "Company details saved.");
        }}>{saving ? "Saving…" : "Save company"}</button>
        <button type="button" className="btn" onClick={downloadCompanyBackup}>Download company backup</button>
        {canAdmin && <label className="btn">
          Choose restore file
          <input type="file" accept="application/json,.json" hidden onChange={previewCompanyRestore} />
        </label>}
        {canAdmin && restoreDraft && (
          <button type="button" className="btn primary" disabled={saving || restoreBusy} onClick={confirmCompanyRestore}>
            {restoreBusy ? "Restoring…" : `Confirm restore into ${activeCompany?.name || "this company"}`}
          </button>
        )}
        {canAdmin && restoreDraft && (
          <button type="button" className="btn" disabled={restoreBusy} onClick={() => setRestoreDraft(null)}>Cancel restore</button>
        )}
      </div>
      {!canAdmin && <p className="small">Only the business owner can change company name / books start settings.</p>}
      <p className="small">Backups are company-isolated. Restore only works into the same company when it has no vouchers yet. Cross-company overwrite is blocked.</p>
      <div className="acc-company-setup-list">
        <p className="small">Each company has its own books. Switching never mixes vouchers.</p>
        {companies.map(company => (
          <div
            key={company.id}
            className={`acc-company-setup-item${company.id === activeCompanyId ? " current" : ""}${company.status === "archived" ? " archived" : ""}`}
          >
            <button
              type="button"
              className="acc-company-setup-pick"
              disabled={company.status === "archived"}
              onClick={() => company.id !== activeCompanyId && company.status !== "archived" && switchCompany(company.id)}
            >
              <strong>{company.name}</strong>
              <span className="small">
                {company.isPrimary ? "Primary" : "Company"}
                {company.status === "archived" ? " · archived" : ""}
                {company.id === activeCompanyId ? " · current" : ""}
                {` · ${gstStatusLabel(company)}`}
              </span>
            </button>
            {canAdmin && company.status !== "archived" && !company.isPrimary && (
              <button type="button" className="btn" disabled={saving} onClick={() => archiveCompany(company)}>Archive</button>
            )}
          </div>
        ))}
        {canAdmin && <button type="button" className="btn" onClick={() => { setCompanyDraft({ name: "", booksStartedOn: todayIso(), industry: "retail" }); setShowCreateCompany(true); }}>+ Create company</button>}
        {!canAdmin && <p className="small">Only the owner can create or archive Accounts companies.</p>}
      </div>
    </AccSetupSection>
  );
}
