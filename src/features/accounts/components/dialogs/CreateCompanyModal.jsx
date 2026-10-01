import { createAccountsCompany } from "../../data/accountingRepository.js";
import { INDUSTRY_TEMPLATES, saveIndustry } from "../AccOnboardingWizard.jsx";
import { Field, Modal } from "../AccUi.jsx";

export function CreateCompanyModal({ saving, setShowCreateCompany, companyDraft, run, token, setCompanyDraft }) {
  return (
    <Modal title="Create company" close={() => !saving && setShowCreateCompany(false)} actions={<div className="tabs spacer"><button type="button" className="btn" disabled={saving} onClick={() => setShowCreateCompany(false)}>Cancel</button><button type="button" className="btn primary" disabled={saving || !String(companyDraft.name || "").trim()} onClick={() => run(async () => {
      const created = await createAccountsCompany(token, companyDraft);
      const id = Array.isArray(created) ? created[0] : created;
      if (typeof id === "string") saveIndustry(id, companyDraft.industry || "retail");
      setShowCreateCompany(false);
      return typeof id === "string" ? id : undefined;
    }, "Company created. This company’s books start empty.")}>{saving ? "Saving…" : "Create company"}</button></div>}>
      <p className="copy">A new company has its own chart, parties, vouchers, bank, GST, and locks. It does not copy SriHitha Infra or any other company.</p>
      <div className="form">
        <Field required label="Company name"><input value={companyDraft.name} onChange={event => setCompanyDraft(current => ({ ...current, name: event.target.value }))} placeholder="e.g. ABC Traders" /></Field>
        <Field label="Books start date"><input type="date" value={companyDraft.booksStartedOn} onChange={event => setCompanyDraft(current => ({ ...current, booksStartedOn: event.target.value }))} /></Field>
        <Field label="Industry template"><select value={companyDraft.industry || "retail"} onChange={event => setCompanyDraft(current => ({ ...current, industry: event.target.value }))}>{INDUSTRY_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.label}</option>)}</select><span className="small">{INDUSTRY_TEMPLATES.find(template => template.id === (companyDraft.industry || "retail"))?.hint}</span></Field>
        <div className="accounts-template-features span">{(INDUSTRY_TEMPLATES.find(template => template.id === (companyDraft.industry || "retail"))?.features || []).map(feature => <span key={feature}>{feature}</span>)}</div>
      </div>
    </Modal>
  );
}
