import { money } from "../cashbookConfig.js";
import { Field, PanelHead } from "../components/CashbookUi.jsx";

export function BankAccountsSection({ allTimeOverview, bankForm, setBankForm, addBank }) {
  return (
    <div className="accounts-panel">
      <PanelHead title="Bank & UPI accounts"><span className="small">Cash and UPI are created at setup. Add named bank accounts below.</span></PanelHead>
      <div className="accounts-ledger-grid spacer">
        {allTimeOverview.ledgers.map(ledger => <article key={ledger.id} className="card accounts-ledger-card">
          <span className="accounts-ledger-type">{ledger.accountType}</span>
          <strong className="accounts-ledger-name">{ledger.name}{ledger.bankAccountLast4 ? ` · ${ledger.bankAccountLast4}` : ""}</strong>
          <span className="accounts-ledger-balance">{money(ledger.balance)}</span>
        </article>)}
      </div>
      <div className="card accounts-form-card spacer">
        <strong>Add bank account</strong>
        <div className="form spacer">
          <Field label="Bank name"><input value={bankForm.name} onChange={event => setBankForm(current => ({ ...current, name: event.target.value }))} placeholder="e.g. HDFC" /></Field>
          <Field label="Account last 4 digits"><input value={bankForm.bankAccountLast4} onChange={event => setBankForm(current => ({ ...current, bankAccountLast4: event.target.value }))} maxLength={4} placeholder="1234" /></Field>
          <button type="button" className="btn primary" onClick={addBank}>Add bank account</button>
        </div>
      </div>
    </div>
  );
}
