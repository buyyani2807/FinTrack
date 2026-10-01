import { VOUCHER_TYPES, voucherTotals } from "../accountingModel.js";
import { emptyLine } from "../accountsFormDefaults.js";
import { money } from "../accountsFormat.js";
import { Field } from "./AccUi.jsx";

export function VoucherForm({ accounts, parties, voucherType, setVoucherType, form, setForm, lines, setLines, onSubmit, saving, maxDate }) {
  const totals = voucherTotals(lines.map(line => ({ ...line, debit: Number(line.debit || 0), credit: Number(line.credit || 0) })));
  const setLine = (index, patch) => setLines(current => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  const selectableParties = parties.filter(party => party.isActive !== false || party.id === form.partyId);
  return <>
    <div className="form">
      <Field label="Voucher type"><select value={voucherType} onChange={event => setVoucherType(event.target.value)}>{Object.values(VOUCHER_TYPES).map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></Field>
      <Field label="Date"><input type="date" max={maxDate} value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></Field>
      <Field label="Party (optional)"><select value={form.partyId} onChange={event => setForm(current => ({ ...current, partyId: event.target.value }))}><option value="">None</option>{selectableParties.map(party => <option key={party.id} value={party.id}>{party.name}{party.isActive === false ? " · inactive" : ""}</option>)}</select></Field>
      {(voucherType === "sales" || voucherType === "purchase") && <Field label="Due date (optional)"><input type="date" value={form.dueDate || ""} onChange={event => setForm(current => ({ ...current, dueDate: event.target.value }))} /></Field>}
      <Field className="span" label="Narration"><input value={form.narration} placeholder="e.g. Office rent for September" onChange={event => setForm(current => ({ ...current, narration: event.target.value }))} /></Field>
    </div>
    <div className="table spacer"><table><thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th></th></tr></thead><tbody>
      {lines.map((line, index) => <tr key={index}>
        <td><select value={line.coaId} onChange={event => setLine(index, { coaId: event.target.value })}><option value="">Select account</option>{accounts.filter(account => account.isActive !== false).map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></td>
        <td><input type="number" min="0" value={line.debit} onChange={event => setLine(index, { debit: event.target.value, credit: "" })} /></td>
        <td><input type="number" min="0" value={line.credit} onChange={event => setLine(index, { credit: event.target.value, debit: "" })} /></td>
        <td>{lines.length > 2 && <button type="button" className="btn" onClick={() => setLines(current => current.filter((_, i) => i !== index))}>Remove</button>}</td>
      </tr>)}
    </tbody></table></div>
    <div className="row spacer">
      <button type="button" className="btn" onClick={() => setLines(current => [...current, emptyLine()])}>Add line</button>
      <span className={totals.balanced ? "green small" : "red small"}>Debit {money(totals.debit)} · Credit {money(totals.credit)}{totals.balanced ? " · Balanced" : " · Not balanced"}</span>
    </div>
    <div className="tabs spacer"><button type="button" className="btn primary" disabled={!totals.balanced || saving} onClick={onSubmit}>{saving ? "Posting…" : "Post voucher"}</button></div>
  </>;
}
