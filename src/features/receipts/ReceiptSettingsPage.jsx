import { useEffect, useState } from "react";
import { DEFAULT_WHATSAPP_TEMPLATES } from "./model/templateEngine.js";
import { defaultConfirmationSettings } from "./io/transactionConfirmations.js";
import { loadOrganizationSettings, saveOrganizationSettings } from "../../lib/financeRepository.js";
import { LabeledField as Field } from "../../components/ui.jsx";


const defaultReminderSettings = () => ({
  monthly: { 7: true, 3: true, 1: true, 0: true },
  chit: { 7: true, 3: true, 1: true, 0: true },
  confirmations: defaultConfirmationSettings(),
});

export function ReceiptSettingsPage({ token, close, onSettingsSaved }) {
  const [form, setForm] = useState({
    companyName: "",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
    companyLogoUrl: "",
    receiptFooter: "Thank you for your payment.",
    receiptTerms: "",
    whatsappTemplates: { ...DEFAULT_WHATSAPP_TEMPLATES },
    reminderSettings: defaultReminderSettings(),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadOrganizationSettings(token).then(settings => {
      const savedTemplates = settings.whatsappTemplates || {};
      const chitReminder = savedTemplates.chit_reminder || "";
      const useDefaultChitReminder = !chitReminder.trim()
        || /days.?remaining/i.test(chitReminder)
        || !/\{chit_type\}/i.test(chitReminder)
        || !/\{scheme_name\}/i.test(chitReminder);
      const reminderSettings = {
        ...defaultReminderSettings(),
        ...(settings.reminderSettings || {}),
        confirmations: {
          ...defaultConfirmationSettings(),
          ...(settings.reminderSettings?.confirmations || {}),
        },
      };
      setForm(current => ({
        ...current,
        ...settings,
        reminderSettings,
        whatsappTemplates: {
          ...DEFAULT_WHATSAPP_TEMPLATES,
          ...savedTemplates,
          chit_reminder: useDefaultChitReminder ? DEFAULT_WHATSAPP_TEMPLATES.chit_reminder : chitReminder,
        },
      }));
    }).catch(err => setError(err.message || "Could not load settings."));
  }, [token]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const setTemplate = (key, value) => setForm(current => ({
    ...current,
    whatsappTemplates: { ...current.whatsappTemplates, [key]: value },
  }));
  const toggleReminder = (group, day) => setForm(current => ({
    ...current,
    reminderSettings: {
      ...current.reminderSettings,
      [group]: { ...current.reminderSettings[group], [day]: !current.reminderSettings[group]?.[day] },
    },
  }));
  const toggleConfirmation = key => setForm(current => ({
    ...current,
    reminderSettings: {
      ...current.reminderSettings,
      confirmations: {
        ...defaultConfirmationSettings(),
        ...(current.reminderSettings?.confirmations || {}),
        [key]: !(current.reminderSettings?.confirmations?.[key] !== false),
      },
    },
  }));

  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError(""); setSaved(false);
    try {
      await saveOrganizationSettings(token, form);
      await onSettingsSaved?.();
      setSaved(true);
    } catch (err) {
      setError(err.message || "Could not save settings.");
    } finally {
      setBusy(false);
    }
  };

  const confirmations = {
    ...defaultConfirmationSettings(),
    ...(form.reminderSettings?.confirmations || {}),
  };

  return <main className="shell"><div className="toolbar"><div><button type="button" className="btn" onClick={close}>← Back</button><h1 className="title spacer">Settings</h1><p className="copy">Company branding, receipt footer, WhatsApp templates, and payment reminders.</p></div></div>
    <form onSubmit={submit} className="card spacer">
      <strong>Company branding</strong>
      <div className="form spacer">
        <Field label="Company / Financer name"><input value={form.companyName} onChange={e => set("companyName", e.target.value)} /></Field>
        <Field label="Address"><input value={form.companyAddress} onChange={e => set("companyAddress", e.target.value)} /></Field>
        <Field label="Phone"><input value={form.companyPhone} onChange={e => set("companyPhone", e.target.value)} /></Field>
        <Field label="Email"><input value={form.companyEmail} onChange={e => set("companyEmail", e.target.value)} /></Field>
        <Field label="Logo URL"><input value={form.companyLogoUrl} onChange={e => set("companyLogoUrl", e.target.value)} placeholder="https://..." /></Field>
        <Field className="span" label="Receipt footer"><input value={form.receiptFooter} onChange={e => set("receiptFooter", e.target.value)} /></Field>
        <Field className="span" label="Terms / notes"><textarea rows={3} value={form.receiptTerms} onChange={e => set("receiptTerms", e.target.value)} /></Field>
      </div>
      <strong className="spacer">WhatsApp templates</strong>
      <p className="small">Optional. WhatsApp buttons work without saving these settings and without an API key or provider account. When a template is saved, that wording is used. Otherwise FinTrack uses the built-in message. View/PDF still shows the full receipt.</p>
      <p className="small">Variables: {"{customer_name} {member_name} {amount} {receipt_number} {account_id} {account_number} {financed_amount} {amount_paid} {interest_amount} {interest_rate} {total_repayment} {daily_installment} {monthly_installment} {repayment_days} {start_date} {completion_date} {first_payment_date} {scheme_name} {chit_value} {chit_type} {month_number} {payment_month} {day_progress} {winning_bid} {amount_lifted} {commission} {discount} {dividend} {remaining_months} {lift_date} {company_name} {company_phone}"}</p>
      <div className="form spacer">
        <Field className="span" label="Payment receipt"><textarea rows={8} value={form.whatsappTemplates.payment_receipt || ""} onChange={e => setTemplate("payment_receipt", e.target.value)} /></Field>
        <Field className="span" label="Daily finance payment receipt"><textarea rows={10} value={form.whatsappTemplates.daily_payment_receipt || ""} onChange={e => setTemplate("daily_payment_receipt", e.target.value)} /></Field>
        <Field className="span" label="Chit fund payment receipt"><textarea rows={10} value={form.whatsappTemplates.chit_payment_receipt || ""} onChange={e => setTemplate("chit_payment_receipt", e.target.value)} /></Field>
        <Field className="span" label="Monthly finance reminder"><textarea rows={7} value={form.whatsappTemplates.monthly_reminder || ""} onChange={e => setTemplate("monthly_reminder", e.target.value)} /></Field>
        <Field className="span" label="Chit fund reminder"><textarea rows={8} value={form.whatsappTemplates.chit_reminder || ""} onChange={e => setTemplate("chit_reminder", e.target.value)} /></Field>
        <Field className="span" label="Daily account opened confirmation"><textarea rows={10} value={form.whatsappTemplates.daily_account_opened || ""} onChange={e => setTemplate("daily_account_opened", e.target.value)} /></Field>
        <Field className="span" label="Monthly account opened confirmation"><textarea rows={10} value={form.whatsappTemplates.monthly_account_opened || ""} onChange={e => setTemplate("monthly_account_opened", e.target.value)} /></Field>
        <Field className="span" label="Chit lift confirmation"><textarea rows={10} value={form.whatsappTemplates.chit_lift_confirmation || ""} onChange={e => setTemplate("chit_lift_confirmation", e.target.value)} /></Field>
        <Field className="span" label="Accounts sales invoice"><textarea rows={8} value={form.whatsappTemplates.sales_invoice || ""} onChange={e => setTemplate("sales_invoice", e.target.value)} /></Field>
        <Field className="span" label="Accounts receivable reminder"><textarea rows={7} value={form.whatsappTemplates.ar_reminder || ""} onChange={e => setTemplate("ar_reminder", e.target.value)} /></Field>
      </div>
      <strong className="spacer">Automatic WhatsApp confirmations</strong>
      <p className="small">After a successful save, FinTrack can open WhatsApp with the confirmation message (same wa.me flow as receipts). Account/chit save always succeeds even if WhatsApp cannot open.</p>
      <div className="card spacer">
        <label className="row small"><input type="checkbox" checked={confirmations.daily_account !== false} onChange={() => toggleConfirmation("daily_account")} /> Daily Finance — new account confirmation</label>
        <label className="row small"><input type="checkbox" checked={confirmations.monthly_account !== false} onChange={() => toggleConfirmation("monthly_account")} /> Monthly Finance — new account confirmation</label>
        <label className="row small"><input type="checkbox" checked={confirmations.chit_lift !== false} onChange={() => toggleConfirmation("chit_lift")} /> Chit Fund — lift confirmation</label>
      </div>
      <strong className="spacer">Payment reminders</strong>
      <div className="grid two spacer">
        <div className="card"><strong>Monthly Finance</strong>{[7, 3, 1, 0].map(day => <label key={`m-${day}`} className="row small"><input type="checkbox" checked={!!form.reminderSettings?.monthly?.[day]} onChange={() => toggleReminder("monthly", day)} /> {day === 0 ? "On due date" : `${day} days before due date`}</label>)}</div>
        <div className="card"><strong>Chit Fund</strong>{[7, 3, 1, 0].map(day => <label key={`c-${day}`} className="row small"><input type="checkbox" checked={!!form.reminderSettings?.chit?.[day]} onChange={() => toggleReminder("chit", day)} /> {day === 0 ? "On due date" : `${day} days before due date`}</label>)}</div>
      </div>
      {error && <p className="red small">{error}</p>}
      {saved && <p className="green small">Settings saved.</p>}
      <div className="row spacer"><button type="button" className="btn" onClick={close}>Cancel</button><button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button></div>
    </form>
  </main>;
}
