import { loadRecurringTemplates, upsertRecurringTemplate, deleteRecurringTemplate } from "../../data/accountingRepository.js";
import { Field, AccSetupSection, AccTable } from "../../components/AccUi.jsx";
import { MONEY_MODES } from "../../model/accountingModel.js";
import { todayIso } from "../../../../lib/dates.js";
import { emptyRecurringDraft, RECURRING_KINDS, RECURRING_FREQUENCIES } from "../../accountsFormDefaults.js";
import { money } from "../../accountsFormat.js";

export function RecurringEntriesPanel({
  recurringTemplates,
  recurringDraft,
  setRecurringDraft,
  parties,
  saving,
  run,
  token,
  setRecurringTemplates,
  canWrite,
  openSimpleFromRecurring,
}) {
  return (
    <AccSetupSection
      icon="↻"
      title="Recurring entries"
      copy="Templates for monthly rent, retainers, or standing expenses. Run now opens a pre-filled entry; posting advances the next run date. Requires migration 075."
      collapsible
      summary={`${recurringTemplates.filter(row => row.isActive).length} active`}
    >
      <div className="form">
        <Field label="Name"><input value={recurringDraft.name} onChange={event => setRecurringDraft(current => ({ ...current, name: event.target.value }))} placeholder="e.g. Office rent" /></Field>
        <Field label="Kind">
          <select value={recurringDraft.kind} onChange={event => setRecurringDraft(current => ({ ...current, kind: event.target.value }))}>
            {RECURRING_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Frequency">
          <select value={recurringDraft.frequency} onChange={event => setRecurringDraft(current => ({ ...current, frequency: event.target.value }))}>
            {RECURRING_FREQUENCIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Next run"><input type="date" value={recurringDraft.nextRunOn} onChange={event => setRecurringDraft(current => ({ ...current, nextRunOn: event.target.value }))} /></Field>
        <Field label="Amount"><input className="acc-num-input" type="number" min="0" step="0.01" value={recurringDraft.amount} onChange={event => setRecurringDraft(current => ({ ...current, amount: event.target.value }))} /></Field>
        <Field label="Party">
          <select value={recurringDraft.partyId} onChange={event => setRecurringDraft(current => ({ ...current, partyId: event.target.value }))}>
            <option value="">Optional</option>
            {parties.filter(party => party.isActive !== false).map(party => <option key={party.id} value={party.id}>{party.name}</option>)}
          </select>
        </Field>
        <Field label="Payment mode">
          <select value={recurringDraft.mode} onChange={event => setRecurringDraft(current => ({ ...current, mode: event.target.value }))}>
            {MONEY_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
          </select>
        </Field>
        <Field className="span" label="Narration"><input value={recurringDraft.narration} onChange={event => setRecurringDraft(current => ({ ...current, narration: event.target.value }))} /></Field>
      </div>
      <div className="acc-form-actions">
        <button type="button" className="btn primary" disabled={saving || !recurringDraft.name.trim() || !recurringDraft.nextRunOn} onClick={() => run(async () => {
          await upsertRecurringTemplate(token, {
            ...recurringDraft,
            amount: Number(recurringDraft.amount || 0),
            partyId: recurringDraft.partyId || null,
          });
          setRecurringDraft(emptyRecurringDraft());
          setRecurringTemplates(await loadRecurringTemplates(token));
        }, recurringDraft.id ? "Recurring template updated." : "Recurring template saved.")}>{saving ? "Saving…" : recurringDraft.id ? "Update template" : "Save template"}</button>
        {recurringDraft.id ? <button type="button" className="btn" disabled={saving} onClick={() => setRecurringDraft(emptyRecurringDraft())}>Clear</button> : null}
      </div>
      <AccTable columns={["Name", "Kind", "Next", { label: "Amount", num: true }, ""]} empty={!recurringTemplates.length && "No recurring templates yet."}>
        {recurringTemplates.map(row => (
          <tr key={row.id}>
            <td>{row.name}{row.isActive === false ? " · inactive" : ""}</td>
            <td>{RECURRING_KINDS.find(item => item.id === row.kind)?.label || row.kind} · {row.frequency}</td>
            <td>{row.nextRunOn || "—"}</td>
            <td className="acc-num">{money(row.amount)}</td>
            <td className="accounts-action-row">
              <button type="button" className="btn primary" disabled={saving || !canWrite} onClick={() => openSimpleFromRecurring(row)}>Run now</button>
              <button type="button" className="btn" disabled={saving} onClick={() => setRecurringDraft({
                id: row.id,
                name: row.name,
                kind: row.kind,
                frequency: row.frequency,
                nextRunOn: row.nextRunOn || todayIso(),
                amount: String(row.amount || ""),
                partyId: row.partyId || "",
                narration: row.narration || "",
                mode: row.mode || "cash",
                isActive: row.isActive !== false,
              })}>Edit</button>
              <button type="button" className="btn danger" disabled={saving} onClick={() => run(async () => {
                await deleteRecurringTemplate(token, row.id);
                setRecurringTemplates(await loadRecurringTemplates(token));
              }, "Template deleted.")}>Delete</button>
            </td>
          </tr>
        ))}
      </AccTable>
    </AccSetupSection>
  );
}
