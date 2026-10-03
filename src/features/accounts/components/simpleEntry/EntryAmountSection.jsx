import { GST_RATES } from "../../model/accountingGst.js";
import { Select } from "../../../../components/Select.jsx";
import { money, gstStatusLabel } from "../../accountsFormat.js";
import { Field } from "../AccUi.jsx";

export function EntryAmountSection({
  kind,
  form,
  set,
  settlementKinds,
  syncSettlements,
  showReceivedOnCredit,
  showMoneyMode,
  cashUpiValid,
  splitTargetAmount,
  splitEntered,
  itemMode,
  gstKinds,
  gstOn,
  intra,
  partyState,
  gstCompany,
  onGstSetup,
}) {
  return (
    <section className="acc-form-section">
      <h3 className="acc-form-section-title">{kind === "sale" ? "Invoice amount" : "Amount"}</h3>
      <div className="form">
        <Field required label={kind === "sale" ? "Sale value (invoice)" : "Amount"}><input type="number" min="0" step="0.01" value={form.amount} placeholder="0.00" onChange={event => {
          const amount = event.target.value;
          set({
            amount,
            settlements: settlementKinds ? syncSettlements(form.partyId, amount) : form.settlements,
          });
        }} /></Field>
        {showReceivedOnCredit && (
          <Field label="Amount received now">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amountReceived}
              placeholder="0.00 — leave blank if unpaid"
              onChange={event => set({ amountReceived: event.target.value })}
            />
          </Field>
        )}
        {showMoneyMode && form.moneyMode === "cash_upi" && (
          <>
            <Field label="Cash amount (₹)">
              <input type="number" min="0" step="0.01" value={form.receivedCash} placeholder="0.00" onChange={event => set({ receivedCash: event.target.value })} />
            </Field>
            <Field label="UPI amount (₹)">
              <input type="number" min="0" step="0.01" value={form.receivedUpi} placeholder="0.00" onChange={event => set({ receivedUpi: event.target.value })} />
            </Field>
            <p className={`small span ${cashUpiValid ? "" : "red"}`}>
              Cash + UPI must equal {money(splitTargetAmount)}
              {splitEntered > 0 ? ` · entered ${money(splitEntered)}` : ""}
              {!cashUpiValid && splitTargetAmount > 0 ? " · enter both amounts" : ""}
            </p>
          </>
        )}
        {!itemMode && gstKinds && gstOn && <>
          <Field label="GST rate"><Select value={form.gstRate} onChange={event => set({ gstRate: event.target.value })}>{GST_RATES.map(rate => <option key={rate} value={String(rate)}>{rate}%</option>)}</Select></Field>
          <Field label="Price"><Select value={form.taxInclusive ? "incl" : "excl"} onChange={event => set({ taxInclusive: event.target.value === "incl" })}><option value="excl">Tax exclusive</option><option value="incl">Tax inclusive</option></Select></Field>
          <Field label="HSN / SAC"><input value={form.hsnSac} placeholder="optional" onChange={event => set({ hsnSac: event.target.value })} /></Field>
          <Field label="Supply">{intra ? "Intra-state (CGST + SGST)" : partyState ? "Inter-state (IGST)" : "Set party state for CGST/SGST vs IGST"}</Field>
        </>}
        {gstKinds && !gstOn && (
          <div className="acc-gst-setup-hint span">
            <p className="copy">GST is off for {gstCompany?.name || "this company"} ({gstStatusLabel(gstCompany)}). This {kind.replaceAll("_", " ")} posts without tax until you choose Regular in Setup and save GSTIN + state.</p>
            {onGstSetup ? <button type="button" className="btn" onClick={onGstSetup}>Open GST setup</button> : null}
          </div>
        )}
        <Field className="span" label="Note (optional)"><input value={form.narration} onChange={event => set({ narration: event.target.value })} placeholder="Received from Ravi" /></Field>
      </div>
    </section>
  );
}
