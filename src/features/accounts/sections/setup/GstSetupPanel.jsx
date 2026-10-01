import { saveGstSettings } from "../../accountingRepository.js";
import { Field, AccSetupSection } from "../../components/AccUi.jsx";
import { INDIA_STATES, gstStateFromGstin, validateGstSettings } from "../../accountingGst.js";

export function GstSetupPanel({ activeCompany, canAdmin, gstForm, setGstForm, saving, setError, run, token }) {
  return (
    <AccSetupSection icon="GST" title={`GST${activeCompany?.name ? ` · ${activeCompany.name}` : ""}`} copy="GST is per company. These settings never apply to another Accounts company or to Daily / Monthly Finance. Books reports only — not GST portal filing. Owner manages GST registration.">
      {!canAdmin && <p className="small">View GST details below. Only the owner can change GST registration settings.</p>}
      <div className="form">
        <Field label="Registration">
          <select value={gstForm.gstRegistration} disabled={!canAdmin} onChange={event => setGstForm(current => ({ ...current, gstRegistration: event.target.value }))}>
            <option value="unregistered">Unregistered</option>
            <option value="regular">Regular</option>
            <option value="composition">Composition</option>
          </select>
        </Field>
        <Field label="GSTIN"><input value={gstForm.gstin} disabled={!canAdmin} placeholder="e.g. 36AAAAA0000A1Z3" onChange={event => setGstForm(current => ({ ...current, gstin: event.target.value, stateCode: gstStateFromGstin(event.target.value) || current.stateCode }))} /></Field>
        <Field label="Legal name"><input value={gstForm.legalName} disabled={!canAdmin} onChange={event => setGstForm(current => ({ ...current, legalName: event.target.value }))} /></Field>
        <Field label="State">
          <select value={gstForm.stateCode} disabled={!canAdmin} onChange={event => setGstForm(current => ({ ...current, stateCode: event.target.value }))}>
            <option value="">Select state</option>
            {INDIA_STATES.map(state => <option key={state.code} value={state.code}>{state.code} · {state.name}</option>)}
          </select>
        </Field>
      </div>
      {canAdmin && (
        <div className="acc-form-actions">
          <button type="button" className="btn primary" disabled={saving} onClick={() => {
            const message = validateGstSettings(gstForm);
            if (message) { setError(message); return; }
            run(() => saveGstSettings(token, { ...gstForm, stateName: INDIA_STATES.find(state => state.code === gstForm.stateCode)?.name || "" }), "GST settings saved.");
          }}>{saving ? "Saving…" : "Save GST"}</button>
        </div>
      )}
    </AccSetupSection>
  );
}
