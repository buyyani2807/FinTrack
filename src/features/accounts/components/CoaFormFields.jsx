import { ACCOUNT_TYPES_BY_GROUP, COA_GROUPS, accountNormalSide, defaultAccountTypeForGroup } from "../model/accountingModel.js";
import { Select } from "../../../components/Select.jsx";
import { Field } from "./AccUi.jsx";

export function CoaFormFields({ form, setForm, accounts = [] }) {
  const types = ACCOUNT_TYPES_BY_GROUP[form.groupType] || ACCOUNT_TYPES_BY_GROUP.expense;
  const descendantIds = new Set();
  if (form.id) {
    const walk = id => {
      for (const child of (accounts || []).filter(account => account.parentId === id)) {
        if (descendantIds.has(child.id)) continue;
        descendantIds.add(child.id);
        walk(child.id);
      }
    };
    walk(form.id);
  }
  const parents = (accounts || []).filter(account =>
    account.groupType === form.groupType && account.id !== form.id && !descendantIds.has(account.id),
  );
  const set = patch => setForm(current => ({ ...current, ...patch }));
  return <div className="form">
    <Field label="Code"><input value={form.code} disabled={Boolean(form.isSystem)} onChange={event => set({ code: event.target.value })} /></Field>
    <Field label="Name"><input value={form.name} onChange={event => set({ name: event.target.value })} /></Field>
    <Field label="Group"><Select value={form.groupType} disabled={Boolean(form.id)} onChange={event => {
      const groupType = event.target.value;
      const accountType = defaultAccountTypeForGroup(groupType);
      set({ groupType, accountType, openingSide: accountNormalSide(groupType), parentId: "" });
    }}>{COA_GROUPS.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</Select></Field>
    <Field label="Type"><Select value={form.accountType} disabled={Boolean(form.id)} onChange={event => set({ accountType: event.target.value })}>{types.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</Select></Field>
    <Field label="Parent (optional)"><Select value={form.parentId || ""} onChange={event => set({ parentId: event.target.value })}><option value="">None</option>{parents.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</Select></Field>
    <Field label="Opening balance"><input type="number" min="0" step="0.01" value={form.openingBalance} onChange={event => set({ openingBalance: event.target.value })} /></Field>
    <Field label="Opening side"><Select value={form.openingSide} onChange={event => set({ openingSide: event.target.value })}><option value="debit">Debit</option><option value="credit">Credit</option></Select></Field>
  </div>;
}
