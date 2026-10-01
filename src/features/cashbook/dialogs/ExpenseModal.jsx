import { EXPENSE_CATEGORIES } from "../cashbookModel.js";
import { Field, Modal } from "../components/CashbookUi.jsx";

export function ExpenseModal({ closeExpense, saveExpense, expenseForm, setExpenseForm, ledgers }) {
  return (
    <Modal title="Add expense" close={closeExpense} actions={<div className="tabs spacer"><button type="button" className="btn primary" onClick={saveExpense}>Save expense</button></div>}>
      <div className="form">
        <Field label="Account"><select value={expenseForm.ledgerAccountId} onChange={event => setExpenseForm(current => ({ ...current, ledgerAccountId: event.target.value }))}><option value="">Select</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={expenseForm.date} onChange={event => setExpenseForm(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Category"><select value={expenseForm.category} onChange={event => setExpenseForm(current => ({ ...current, category: event.target.value }))}>{EXPENSE_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Description"><input value={expenseForm.description} onChange={event => setExpenseForm(current => ({ ...current, description: event.target.value }))} /></Field>
        <Field label="Amount"><input type="number" value={expenseForm.amount} onChange={event => setExpenseForm(current => ({ ...current, amount: event.target.value }))} /></Field>
      </div>
    </Modal>
  );
}
