import { PARTY_TYPE_CHANGE_WARNING, PARTY_TYPES } from "../model/accountingModel.js";
import { Select } from "../../../components/Select.jsx";
import { INDIA_STATES, gstStateFromGstin } from "../model/accountingGst.js";
import { partyTypeLabel } from "../accountsFormat.js";
import { Field } from "./AccUi.jsx";

export const PartyTypeBadge = ({ type }) => (
  <span className={`acc-type-badge ${type || "other"}`}>{partyTypeLabel(type)}</span>
);
export function PartyFormFields({ form, setForm, originalType = "", hasTransactions = false, typeConfirmed = false, onConfirmType }) {
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const currentType = originalType || form.partyType;
  const typeChanged = Boolean(form.id) && currentType !== form.partyType;
  const needsConfirm = typeChanged && hasTransactions;
  return (
    <div className="form acc-party-form">
      <Field required label="Party type">
        <Select value={form.partyType} onChange={event => { set({ partyType: event.target.value }); onConfirmType?.(false); }}>
          {PARTY_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
        </Select>
      </Field>
      {form.id ? <p className="small acc-party-current-type">Current type: {partyTypeLabel(currentType)}</p> : null}
      <Field required label="Name"><input value={form.name} placeholder="e.g. Sai Traders" onChange={event => set({ name: event.target.value })} /></Field>
      <Field label="Phone"><input value={form.phone} placeholder="10-digit mobile" onChange={event => set({ phone: event.target.value })} /></Field>
      <Field label="Email"><input value={form.email} placeholder="optional" onChange={event => set({ email: event.target.value })} /></Field>
      <Field className="span" label="Address"><input value={form.address} placeholder="optional" onChange={event => set({ address: event.target.value })} /></Field>
      <Field label="GSTIN"><input value={form.gstin} placeholder="optional" onChange={event => set({ gstin: event.target.value, stateCode: event.target.value ? (gstStateFromGstin(event.target.value) || form.stateCode) : form.stateCode })} /></Field>
      <Field label="GST registration">
        <Select value={form.gstRegistration || ""} onChange={event => set({ gstRegistration: event.target.value })}>
          <option value="">Not set</option>
          <option value="regular">Regular</option>
          <option value="composition">Composition</option>
          <option value="unregistered">Unregistered</option>
        </Select>
      </Field>
      <Field label="State">
        <Select value={form.stateCode || ""} onChange={event => set({ stateCode: event.target.value })}>
          <option value="">Select state</option>
          {INDIA_STATES.map(state => <option key={state.code} value={state.code}>{state.code} · {state.name}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><input value={form.notes} placeholder="optional" onChange={event => set({ notes: event.target.value })} /></Field>
      {(form.partyType === "customer" || form.partyType === "supplier") && <>
        {form.partyType === "customer" && (
          <Field label="Credit limit (₹)"><input type="number" min="0" step="0.01" value={form.creditLimit ?? ""} placeholder="0 = no limit" onChange={event => set({ creditLimit: event.target.value })} /></Field>
        )}
        <Field label="Credit days"><input type="number" min="0" max="365" step="1" value={form.creditDays ?? ""} placeholder="Default due date" onChange={event => set({ creditDays: event.target.value })} /></Field>
      </>}
      {needsConfirm ? <div className="acc-party-type-warn" role="status">
        <p>{PARTY_TYPE_CHANGE_WARNING}</p>
        <label>
          <input type="checkbox" checked={typeConfirmed} onChange={event => onConfirmType?.(event.target.checked)} />
          <span>Update the classification only. Leave historical vouchers unchanged.</span>
        </label>
      </div> : null}
    </div>
  );
}
