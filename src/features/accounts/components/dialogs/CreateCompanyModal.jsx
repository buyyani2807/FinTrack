import {
  createAccountsCompany,
  createAccountsCompanyFrom,
  DEFAULT_DOCUMENT_SETTINGS,
  saveDocumentSettings,
  setActiveAccountsCompanyId,
} from "../../data/accountingRepository.js";
import { Select } from "../../../../components/Select.jsx";
import { INDUSTRY_TEMPLATES, saveIndustry } from "../AccOnboardingWizard.jsx";
import { normalizePan, panValidationMessage } from "../../model/accountingGst.js";
import { Field, Modal } from "../AccUi.jsx";

function addDaysIso(iso, days) {
  if (!iso) return "";
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function CreateCompanyModal({
  saving,
  setShowCreateCompany,
  companyDraft,
  run,
  token,
  setCompanyDraft,
  onCreated,
  setError,
  companies = [],
}) {
  const sourceOptions = (companies || []).filter(company => company.status !== "archived");
  const copyFromExisting = Boolean(companyDraft.copyFromExisting);
  const sourceId = companyDraft.sourceCompanyId || "";

  const create = () => {
    const panMessage = panValidationMessage(companyDraft.pan);
    if (panMessage) {
      setError?.(panMessage);
      return;
    }
    if (copyFromExisting && !sourceId) {
      setError?.("Choose a company to copy from.");
      return;
    }
    run(async () => {
      const payload = {
        name: companyDraft.name,
        booksStartedOn: companyDraft.booksStartedOn,
        pan: companyDraft.pan,
        fyStartMonth: companyDraft.fyStartMonth || 4,
      };
      let created;
      if (copyFromExisting) {
        created = await createAccountsCompanyFrom(token, {
          ...payload,
          sourceCompanyId: sourceId,
          asOf: companyDraft.asOf || addDaysIso(companyDraft.booksStartedOn, -1),
          copyCoa: companyDraft.copyCoa !== false,
          copyParties: companyDraft.copyParties !== false,
          copyItems: companyDraft.copyItems !== false,
          copyDocumentSettings: companyDraft.copyDocumentSettings !== false,
          copyOpenings: companyDraft.copyOpenings !== false,
        });
      } else {
        created = await createAccountsCompany(token, payload);
      }
      const id = Array.isArray(created) ? created[0] : created;
      if (typeof id === "string") saveIndustry(id, companyDraft.industry || "retail");
      const address = String(companyDraft.businessAddress || "").trim();
      const phone = String(companyDraft.businessPhone || "").trim();
      if (
        typeof id === "string"
        && (address || phone)
        && !(copyFromExisting && companyDraft.copyDocumentSettings !== false)
      ) {
        setActiveAccountsCompanyId(id);
        await saveDocumentSettings(token, {
          ...DEFAULT_DOCUMENT_SETTINGS,
          businessAddress: address,
          businessPhone: phone,
        });
      }
      if (typeof id === "string") onCreated?.(id);
      setShowCreateCompany(false);
      setCompanyDraft({
        name: "",
        booksStartedOn: companyDraft.booksStartedOn,
        industry: "retail",
        pan: "",
        businessAddress: "",
        businessPhone: "",
        copyFromExisting: false,
        sourceCompanyId: "",
        asOf: "",
        copyCoa: true,
        copyParties: true,
        copyItems: true,
        copyDocumentSettings: true,
        copyOpenings: true,
      });
      return typeof id === "string" ? id : undefined;
    }, copyFromExisting
      ? "Company created from the selected company (masters and openings as chosen)."
      : "Company created. This company’s books start empty.");
  };

  return (
    <Modal
      title="Create company"
      close={() => !saving && setShowCreateCompany(false)}
      actions={(
        <div className="tabs spacer">
          <button
            type="button"
            className="btn primary"
            disabled={saving || !String(companyDraft.name || "").trim()}
            onClick={create}
          >
            {saving ? "Saving…" : copyFromExisting ? "Create from copy" : "Create company"}
          </button>
        </div>
      )}
    >
      <p className="copy">
        A new company has its own chart, parties, vouchers, bank, GST, and locks.
        {copyFromExisting
          ? " Selected masters and closing balances are copied as openings — not live day-to-day vouchers."
          : " Start empty, or copy masters and closings from a company you already use."}
      </p>
      <div className="form">
        <Field required label="Company name">
          <input
            value={companyDraft.name}
            onChange={event => setCompanyDraft(current => ({ ...current, name: event.target.value }))}
            placeholder="e.g. ABC Traders"
          />
        </Field>
        <Field label="PAN">
          <input
            value={companyDraft.pan || ""}
            placeholder="e.g. ABCDE1234F"
            maxLength={10}
            autoComplete="off"
            onChange={event => setCompanyDraft(current => ({ ...current, pan: normalizePan(event.target.value) }))}
          />
          <span className="small">Optional. GSTIN / legal identity of the source company is not copied.</span>
        </Field>
        <Field label="Books start date">
          <input
            type="date"
            value={companyDraft.booksStartedOn}
            onChange={event => {
              const booksStartedOn = event.target.value;
              setCompanyDraft(current => ({
                ...current,
                booksStartedOn,
                asOf: current.asOf || addDaysIso(booksStartedOn, -1),
              }));
            }}
          />
        </Field>
        <Field label="Business address">
          <input
            value={companyDraft.businessAddress || ""}
            onChange={event => setCompanyDraft(current => ({ ...current, businessAddress: event.target.value }))}
            placeholder="Shop / office address for receipts"
          />
          <span className="small">Printed and WhatsApp bills use this address.</span>
        </Field>
        <Field label="Business phone">
          <input
            type="tel"
            inputMode="tel"
            value={companyDraft.businessPhone || ""}
            onChange={event => setCompanyDraft(current => ({ ...current, businessPhone: event.target.value }))}
            placeholder="Mobile / landline on receipts"
          />
        </Field>
        <Field label="Industry template">
          <Select
            value={companyDraft.industry || "retail"}
            onChange={event => setCompanyDraft(current => ({ ...current, industry: event.target.value }))}
          >
            {INDUSTRY_TEMPLATES.map(template => (
              <option key={template.id} value={template.id}>{template.label}</option>
            ))}
          </Select>
          <span className="small">
            {INDUSTRY_TEMPLATES.find(template => template.id === (companyDraft.industry || "retail"))?.hint}
          </span>
        </Field>
        <div className="accounts-template-features span">
          {(INDUSTRY_TEMPLATES.find(template => template.id === (companyDraft.industry || "retail"))?.features || [])
            .map(feature => <span key={feature}>{feature}</span>)}
        </div>

        <label className="span accounts-filter-field">
          <span className="small">
            <input
              type="checkbox"
              checked={copyFromExisting}
              onChange={event => setCompanyDraft(current => ({
                ...current,
                copyFromExisting: event.target.checked,
                sourceCompanyId: event.target.checked
                  ? (current.sourceCompanyId || sourceOptions[0]?.id || "")
                  : "",
                asOf: current.asOf || addDaysIso(current.booksStartedOn, -1),
              }))}
            />
            {" "}Copy from an existing company
          </span>
        </label>

        {copyFromExisting ? (
          <>
            <Field required label="Copy from">
              <Select
                value={sourceId}
                onChange={event => setCompanyDraft(current => ({ ...current, sourceCompanyId: event.target.value }))}
              >
                <option value="">Select company</option>
                {sourceOptions.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Closing balances as of">
              <input
                type="date"
                value={companyDraft.asOf || addDaysIso(companyDraft.booksStartedOn, -1)}
                max={addDaysIso(companyDraft.booksStartedOn, -1) || undefined}
                onChange={event => setCompanyDraft(current => ({ ...current, asOf: event.target.value }))}
              />
              <span className="small">Usually the day before books start. Becomes openings in the new company.</span>
            </Field>
            <div className="span" style={{ display: "grid", gap: "6px" }}>
              {[
                ["copyCoa", "Chart of accounts"],
                ["copyParties", "Parties (customers / suppliers)"],
                ["copyItems", "Items and categories"],
                ["copyDocumentSettings", "Document / print settings"],
                ["copyOpenings", "Closing balances → openings (ledgers, party AR/AP, stock)"],
              ].map(([key, label]) => (
                <label key={key} className="small">
                  <input
                    type="checkbox"
                    checked={companyDraft[key] !== false}
                    onChange={event => setCompanyDraft(current => ({ ...current, [key]: event.target.checked }))}
                  />
                  {" "}{label}
                </label>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
