import { CHIT_TYPES, fixedCommissionFromPercent } from "../model/fixedChit";
import { money } from "../model/chitFormat.js";
import { Button, Field, SegmentedControl } from "../../../components/ui.jsx";
import { Modal } from "./ChitUi.jsx";

const CHIT_TYPE_OPTIONS = [
  { id: CHIT_TYPES.AUCTION, label: "Auction Chit" },
  { id: CHIT_TYPES.FIXED, label: "Fixed Chit" },
  { id: CHIT_TYPES.FIXED_PREDEFINED_BID, label: "Fixed Predefined Bid" },
];

// While creating a scheme the type can still be changed from inside the form.
const ChitTypeSwitch = ({ value, onChange }) => <SegmentedControl label="Chit type" options={CHIT_TYPE_OPTIONS} value={value} onChange={onChange} className="chit-type-switch" />;
const typeLabel = value => CHIT_TYPE_OPTIONS.find(item => item.id === value)?.label || "Auction Chit";

// Every scheme form has the same structure: Scheme details (shared fields, same order), the type's own
// terms, then Charges. Calculated values are shown read-only and marked "Calculated".
const FormSection = ({ title, children }) => <fieldset className="chit-form-section"><legend>{title}</legend><div className="form">{children}</div></fieldset>;
const Calculated = ({ label, value }) => <div className="field chit-calculated"><span className="chit-calculated-label">{label}<span className="chit-calculated-tag">Calculated</span></span><output>{value}</output></div>;

function SchemeDetailsFields({ form, set, onChangeType }) {
  return <FormSection title="Scheme details">
    <Field label="Scheme name *"><input required value={form.name} onChange={e => set("name", e.target.value)} /></Field>
    {!onChangeType && <Calculated label="Chit type" value={typeLabel(form.chitType)} />}
    <Field label="Start date *"><input required type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} /></Field>
    <Field label="Chit value (₹) *"><input required type="number" min="1" value={form.chitValue} onChange={e => set("chitValue", e.target.value)} /></Field>
    <Field label="Duration (months) *"><input required type="number" min="1" value={form.durationMonths} onChange={e => set("durationMonths", e.target.value)} /></Field>
    <Field label="Member count *"><input required type="number" min="1" value={form.memberCount} onChange={e => set("memberCount", e.target.value)} /></Field>
  </FormSection>;
}

function ChargesFields({ form, set }) {
  return <FormSection title="Charges">
    <Field label="Late penalty per installment (₹)"><input type="number" min="0" value={form.latePenaltyAmount} onChange={e => set("latePenaltyAmount", e.target.value)} /></Field>
    <Field label="Security deposit per member (₹)"><input type="number" min="0" value={form.securityDepositAmount} onChange={e => set("securityDepositAmount", e.target.value)} /></Field>
  </FormSection>;
}

function FormFooter({ busy, onClose, submitLabel }) {
  return <div className="row spacer"><Button type="button" disabled={busy} onClick={onClose}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : submitLabel}</Button></div>;
}

export function ChitSchemeForm({ title, form, setForm, busy, error, onClose, onSubmit, submitLabel, onChangeType }) {
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const pool = Number(form.installmentAmount || 0) * Number(form.memberCount || 0);
  const commission = Number(form.chitValue || 0) * Number(form.commissionPercent || 0) / 100;
  return <Modal close={onClose}><h2 className="title">{title}</h2>{onChangeType && <ChitTypeSwitch value={form.chitType} onChange={onChangeType} />}<form onSubmit={onSubmit}>
    <SchemeDetailsFields form={form} set={set} onChangeType={onChangeType} />
    <FormSection title="Installment and auction rules">
      <Field label="Monthly installment (₹) *"><input required type="number" min="1" value={form.installmentAmount} onChange={e => set("installmentAmount", e.target.value)} /></Field>
      <Calculated label="Installment × members" value={`${money(pool)}${Number(form.chitValue) > 0 && Math.round(pool * 100) !== Math.round(Number(form.chitValue) * 100) ? " — must equal the chit value" : ""}`} />
      <Field label="Manager commission (% of chit value) *"><input required type="number" min="0" max="7" step=".01" value={form.commissionPercent} onChange={e => set("commissionPercent", e.target.value)} /></Field>
      <Calculated label="Manager commission per month" value={money(commission)} />
      <Field label="Minimum lift amount (% of chit value)"><input type="number" min="0" max="100" value={form.minBidPercent} onChange={e => set("minBidPercent", e.target.value)} /></Field>
      <Field label="Maximum lift amount (% of chit value)"><input type="number" min="0" max="100" value={form.maxBidPercent} onChange={e => set("maxBidPercent", e.target.value)} /></Field>
    </FormSection>
    <ChargesFields form={form} set={set} />
    <p className="notice">Installment × member count must equal the chit value. Commission is capped at 7%. Live bidding starts after deducting the fund manager commission. Members bid above that commission, up to 30% of the chit value. The highest bid wins, and the lift amount is the chit value minus the winning bid. Live bids always give a lift amount between 70% and 100% minus commission, so the lift-amount limits must overlap that range.</p>
    {error && <p className="red small">{error}</p>}
    <FormFooter busy={busy} onClose={onClose} submitLabel={submitLabel} />
  </form></Modal>;
}
export function ChitTypeChooser({ close, choose }) {
  return <Modal close={close}><h2 className="title">Choose Chit type</h2><p className="copy">Each Chit type uses an independent calculation and monthly workflow.</p><div className="grid spacer"><button className="card" onClick={() => choose(CHIT_TYPES.AUCTION)}><strong>Auction Chit</strong><p className="small spacer">Existing auction, discount, dividend, and live-bidding model.</p></button><button className="card" onClick={() => choose(CHIT_TYPES.FIXED)}><strong>Fixed Chit</strong><p className="small spacer">Predetermined lift amounts that increase each month.</p></button><button className="card" onClick={() => choose(CHIT_TYPES.FIXED_PREDEFINED_BID)}><strong>Fixed Predefined Bid Chit</strong><p className="small spacer">Generated EMI, COMM, auction amount, bid amount, commission, and net-receivable schedule without live bidding.</p></button></div></Modal>;
}
export function FixedChitSchemeForm({ title, form, setForm, busy, error, onClose, onSubmit, submitLabel, onChangeType }) {
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const commissionRupees = fixedCommissionFromPercent(form.chitValue, form.commissionPercent);
  const derivedInitial = Number(form.chitValue || 0) - commissionRupees;
  return <Modal close={onClose}><h2 className="title">{title}</h2>{onChangeType && <ChitTypeSwitch value={form.chitType} onChange={onChangeType} />}<form onSubmit={onSubmit}>
    <SchemeDetailsFields form={form} set={set} onChangeType={onChangeType} />
    <FormSection title="Contribution and lift schedule">
      <Field label="Monthly contribution before lift (₹) *"><input required type="number" min="0.01" step="0.01" value={form.installmentAmount} onChange={e => set("installmentAmount", e.target.value)} /></Field>
      <Field label="Manager commission (% of chit value) *"><input required type="number" min="0" max="100" step=".01" value={form.commissionPercent} onChange={e => set("commissionPercent", e.target.value)} /></Field>
      <Calculated label="Manager commission per month" value={money(commissionRupees)} />
      <Field label="Initial lift amount (₹) *"><input required type="number" min="0" step="0.01" value={form.fixedInitialLiftAmount === "" && derivedInitial >= 0 ? derivedInitial : form.fixedInitialLiftAmount} onChange={e => set("fixedInitialLiftAmount", e.target.value)} /></Field>
      <Field label="Monthly lift increment (₹) *"><input required type="number" min="0" step="0.01" value={form.fixedMonthlyIncrement} onChange={e => set("fixedMonthlyIncrement", e.target.value)} /></Field>
      <Calculated label="Monthly contribution after lift" value={money(Number(form.installmentAmount || 0) + Number(form.fixedMonthlyIncrement || 0))} />
    </FormSection>
    <ChargesFields form={form} set={set} />
    <p className="notice">The manager receives the same commission every lift month. For a ₹1,00,000 chit at 5%, that is ₹5,000 per month. Initial lift defaults to chit value minus one month's commission, but remains configurable. Each later month adds the configured increment. The contribution after lift is the contribution before lift plus that increment.</p>
    {error && <p className="red small">{error}</p>}
    <FormFooter busy={busy} onClose={onClose} submitLabel={submitLabel} />
  </form></Modal>;
}
export function PredefinedBidSchemeForm({ title = "Create Fixed Predefined Bid scheme", form, setForm, busy, error, onClose, onSubmit, submitLabel = "Create draft", onChangeType }) {
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const managerFee = Number(form.chitValue || 0) * Number(form.predefinedManagerCommissionPercent || 0) / 100;
  const firstLift = Number(form.predefinedStartingBidAmount || 0) - managerFee;
  return <Modal close={onClose}><h2 className="title">{title}</h2>{onChangeType && <ChitTypeSwitch value={form.chitType} onChange={onChangeType} />}<form onSubmit={onSubmit}>
    <SchemeDetailsFields form={form} set={set} onChangeType={onChangeType} />
    <FormSection title="Monthly schedule">
      <Field label="Starting EMI (₹) *"><input required type="number" min="0" value={form.predefinedStartingEmi} onChange={e => set("predefinedStartingEmi", e.target.value)} /></Field>
      <Field label="EMI increment (₹) *"><input required type="number" min="0" value={form.predefinedEmiIncrement} onChange={e => set("predefinedEmiIncrement", e.target.value)} /></Field>
      <Field label="Starting COMM (₹) *"><input required type="number" min="0" value={form.predefinedStartingComm} onChange={e => set("predefinedStartingComm", e.target.value)} /></Field>
      <Field label="COMM decrement (₹) *"><input required type="number" min="0" value={form.predefinedCommDecrement} onChange={e => set("predefinedCommDecrement", e.target.value)} /></Field>
      <Field label="Starting auction amount (₹) *"><input required type="number" min="0" value={form.predefinedStartingAuctionAmount} onChange={e => set("predefinedStartingAuctionAmount", e.target.value)} /></Field>
      <Field label="Auction decrement (₹) *"><input required type="number" min="0" value={form.predefinedAuctionDecrement} onChange={e => set("predefinedAuctionDecrement", e.target.value)} /></Field>
      <Field label="Starting bid amount (₹) *"><input required type="number" min="0" value={form.predefinedStartingBidAmount} onChange={e => set("predefinedStartingBidAmount", e.target.value)} /></Field>
      <Field label="Bid increment (₹) *"><input required type="number" min="0" value={form.predefinedBidIncrement} onChange={e => set("predefinedBidIncrement", e.target.value)} /></Field>
      <Field label="Manager commission (% of chit value) *"><input required type="number" min="0" max="100" step=".01" value={form.predefinedManagerCommissionPercent} onChange={e => set("predefinedManagerCommissionPercent", e.target.value)} /></Field>
      <Calculated label="Manager commission per month" value={money(managerFee)} />
      <Calculated label="Month 1 lift amount" value={money(firstLift)} />
    </FormSection>
    <ChargesFields form={form} set={set} />
    <p className="notice">MyFinTracker generates every month from these values. Lift amount is always calculated as bid amount minus manager commission and cannot be entered manually. Pending months can be edited before they are lifted.</p>
    {error && <p className="red small">{error}</p>}
    <FormFooter busy={busy} onClose={onClose} submitLabel={submitLabel} />
  </form></Modal>;
}
