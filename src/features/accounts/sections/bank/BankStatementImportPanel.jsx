import { Field, AccSetupSection } from "../../components/AccUi.jsx";
import { BANK_IMPORT_FIELDS } from "../../io/bankStatementImport.js";
import { emptyBankLine } from "../../accountsFormDefaults.js";

export function BankStatementImportPanel({
  onBankImportFile,
  bankImport,
  bankImportMapping,
  setBankImportMapping,
  applyBankImportMapping,
  bankForm,
  bankAccounts,
  setBankForm,
  patchBankLine,
  saving,
  submitBankStatement,
}) {
  return (
    <AccSetupSection icon="B" title="Add bank statement" copy="Import a CSV from net banking, map columns, then save. PDF is not auto-parsed yet.">
      <h3 className="acc-section-title">Import file (CSV / Excel text export)</h3>
      <div className="accounts-action-row acc-bank-actions">
        <label className="btn">
          Choose statement file
          <input type="file" accept=".csv,.txt,.tsv,.xls,.xlsx" hidden onChange={onBankImportFile} />
        </label>
      </div>
      {bankImport && <>
        <p className="small">Map columns from your bank file, then apply. Amounts are not posted to ledgers until you create vouchers separately.</p>
        <div className="acc-bank-meta">
          {BANK_IMPORT_FIELDS.map(field => (
            <Field key={field.id} label={field.label}>
              <select
                value={bankImportMapping[field.id] ?? ""}
                onChange={event => setBankImportMapping(current => ({ ...current, [field.id]: event.target.value === "" ? undefined : Number(event.target.value) }))}
              >
                <option value="">Ignore</option>
                {bankImport.headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header}</option>)}
              </select>
            </Field>
          ))}
        </div>
        <button type="button" className="btn primary" onClick={applyBankImportMapping}>Apply mapping to draft lines</button>
      </>}
      <h3 className="acc-section-title">Statement details</h3>
      <div className="acc-bank-meta">
        <Field label="Bank account"><select value={bankForm.coaId || bankAccounts[0]?.id || ""} onChange={event => setBankForm(current => ({ ...current, coaId: event.target.value }))}><option value="">Select bank</option>{bankAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field>
        <Field label="Statement date"><input type="date" value={bankForm.statementDate} onChange={event => setBankForm(current => ({ ...current, statementDate: event.target.value }))} /></Field>
        <Field label="Opening balance"><input className="acc-num-input" type="number" step="0.01" placeholder="0.00" value={bankForm.openingBalance} onChange={event => setBankForm(current => ({ ...current, openingBalance: event.target.value }))} /></Field>
        <Field label="Closing balance"><input className="acc-num-input" type="number" step="0.01" placeholder="0.00" value={bankForm.closingBalance} onChange={event => setBankForm(current => ({ ...current, closingBalance: event.target.value }))} /></Field>
      </div>
      <h3 className="acc-section-title">Statement lines</h3>
      <div className="table acc-table-wrap acc-bank-line-table"><table><thead><tr><th>Date</th><th>Description</th><th className="acc-num">Amount</th><th>In / Out</th><th></th></tr></thead><tbody>
        {bankForm.lines.map((line, index) => <tr key={index}>
          <td><input type="date" value={line.lineDate} onChange={event => patchBankLine(index, { lineDate: event.target.value })} /></td>
          <td className="acc-bank-desc"><input value={line.description} placeholder="e.g. UPI from customer" onChange={event => patchBankLine(index, { description: event.target.value })} /></td>
          <td><input className="acc-num-input" type="number" min="0" step="0.01" placeholder="0.00" value={line.amount} onChange={event => patchBankLine(index, { amount: event.target.value })} /></td>
          <td><select value={line.direction} onChange={event => patchBankLine(index, { direction: event.target.value })}><option value="in">In</option><option value="out">Out</option></select></td>
          <td>{bankForm.lines.length > 1 && <button type="button" className="btn danger" onClick={() => setBankForm(current => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>Remove</button>}</td>
        </tr>)}
      </tbody></table></div>
      <div className="acc-bank-line-cards">
        {bankForm.lines.map((line, index) => (
          <article key={index} className="card acc-bank-line-card">
            <div className="acc-bank-meta">
              <Field label="Date"><input type="date" value={line.lineDate} onChange={event => patchBankLine(index, { lineDate: event.target.value })} /></Field>
              <Field label="In / Out"><select value={line.direction} onChange={event => patchBankLine(index, { direction: event.target.value })}><option value="in">Money in</option><option value="out">Money out</option></select></Field>
              <Field className="span" label="Description"><input value={line.description} placeholder="e.g. UPI from customer" onChange={event => patchBankLine(index, { description: event.target.value })} /></Field>
              <Field label="Amount"><input className="acc-num-input" type="number" min="0" step="0.01" placeholder="0.00" value={line.amount} onChange={event => patchBankLine(index, { amount: event.target.value })} /></Field>
            </div>
            {bankForm.lines.length > 1 && <button type="button" className="btn danger" onClick={() => setBankForm(current => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>Remove line</button>}
          </article>
        ))}
      </div>
      <div className="accounts-action-row acc-bank-actions acc-form-actions">
        <button type="button" className="btn" onClick={() => setBankForm(current => ({ ...current, lines: [...current.lines, emptyBankLine()] }))}>+ Add line</button>
        <button type="button" className="btn primary" disabled={saving} onClick={submitBankStatement}>{saving ? "Saving…" : "Save statement"}</button>
      </div>
    </AccSetupSection>
  );
}
