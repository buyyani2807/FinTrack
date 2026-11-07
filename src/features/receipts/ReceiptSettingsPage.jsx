import { useEffect, useRef, useState } from "react";
import { TabScroller } from "../../components/TabScroller.jsx";
import { Bell, Building2, CalendarDays, CalendarRange, Check, ChevronDown, Coins, MessageCircle, Plus, ReceiptText, RotateCcw } from "lucide-react";
import { DEFAULT_WHATSAPP_TEMPLATES } from "./model/templateEngine.js";
import { defaultConfirmationSettings } from "./io/transactionConfirmations.js";
import {
  completeWhatsAppConnect,
  disconnectWhatsApp,
  fetchWhatsAppConnection,
  metaTemplateSetupGuide,
  startWhatsAppConnect,
} from "./io/whatsappCloudApi.js";
import { loadOrganizationSettings, saveOrganizationSettings } from "../../lib/financeRepository.js";
import { LabeledField as Field } from "../../components/ui.jsx";


const defaultReminderSettings = () => ({
  monthly: { 7: true, 3: true, 1: true, 0: true },
  chit: { 7: true, 3: true, 1: true, 0: true },
  confirmations: defaultConfirmationSettings(),
});

const SETTINGS_TABS = [
  { id: "company", label: "Company & receipts" },
  { id: "whatsapp", label: "WhatsApp messages" },
  { id: "reminders", label: "Reminders" },
];

const TEMPLATE_GROUPS = [
  { title: "Receipts", items: [["payment_receipt", "Payment receipt", 8], ["daily_payment_receipt", "Daily finance payment receipt", 10], ["chit_payment_receipt", "Chit fund payment receipt", 10]] },
  { title: "Reminders", items: [["monthly_reminder", "Monthly finance reminder", 7], ["chit_reminder", "Chit fund reminder", 8], ["ar_reminder", "Accounts receivable reminder", 7]] },
  { title: "Confirmations", items: [["daily_account_opened", "Daily account opened confirmation", 10], ["monthly_account_opened", "Monthly account opened confirmation", 10], ["chit_lift_confirmation", "Chit lift confirmation", 10]] },
  { title: "Accounts", items: [["sales_invoice", "Accounts sales invoice", 8]] },
];

const TEMPLATE_VARIABLES = "{customer_name} {member_name} {amount} {receipt_number} {account_id} {account_number} {financed_amount} {amount_paid} {interest_amount} {interest_rate} {total_repayment} {daily_installment} {monthly_installment} {repayment_days} {start_date} {completion_date} {first_payment_date} {scheme_name} {chit_value} {chit_type} {month_number} {payment_month} {day_progress} {winning_bid} {amount_lifted} {commission} {discount} {dividend} {remaining_months} {lift_date} {company_name} {company_phone}".split(" ");

const REMINDER_DAYS = [7, 3, 1, 0];
const REMINDER_GROUPS = [{ id: "monthly", label: "Monthly Finance", icon: CalendarRange }, { id: "chit", label: "Chit Fund", icon: Coins }];
const initialsOf = name => String(name || "").trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() || "").join("") || "FT";
const reminderDayLabel = day => (day === 0 ? "On due date" : `${day} day${day === 1 ? "" : "s"} before`);

function SettingsSection({ icon: Icon, title, copy, children }) {
  return <section className="card settings-section">
    <header className="settings-section-head">
      <span className="ft-icon-tile" aria-hidden="true"><Icon size={20} /></span>
      <div><h2>{title}</h2>{copy && <p>{copy}</p>}</div>
    </header>
    {children}
  </section>;
}

function SwitchRow({ icon: RowIcon, checked, onChange, title, copy }) {
  return <label className="settings-switch-row">
    {RowIcon && <span className="settings-list-icon" aria-hidden="true"><RowIcon size={18} /></span>}
    <span className="settings-list-text"><strong>{title}</strong>{copy && <span className="small">{copy}</span>}</span>
    <input type="checkbox" role="switch" className="ft-switch" checked={checked} onChange={onChange} />
  </label>;
}

// The open tab is the URL (/settings/:tab, see app/AppRoutes.jsx); every tab route renders this same page, so unsaved
// edits survive switching tabs.
export function ReceiptSettingsPage({ token, close, onSettingsSaved, tab: routeTab = "company", onTabChange }) {
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
  // A logo URL that failed to load shows the initials instead (until the URL changes).
  const [logoFailed, setLogoFailed] = useState("");
  const [cloudStatus, setCloudStatus] = useState(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [cloudForm, setCloudForm] = useState({ accessToken: "", phoneNumberId: "", wabaId: "", displayPhone: "" });
  const tab = SETTINGS_TABS.some(item => item.id === routeTab) ? routeTab : "company";
  const setTab = next => onTabChange?.(next);
  // The settings as last loaded or saved, to show when there are unsaved changes.
  const [baseline, setBaseline] = useState(null);
  // The template being edited, so a variable chip is inserted at its cursor.
  const lastTemplate = useRef(null);
  const metaGuide = metaTemplateSetupGuide();

  const refreshCloudStatus = async () => {
    if (!token) return;
    try {
      const status = await fetchWhatsAppConnection(token);
      setCloudStatus(status);
      setCloudError("");
    } catch (err) {
      setCloudStatus(null);
      setCloudError(err.message || "Could not load WhatsApp Business status.");
    }
  };

  useEffect(() => {
    refreshCloudStatus();
  }, [token]);

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
      setForm(current => {
        const next = {
          ...current,
          ...settings,
          reminderSettings,
          whatsappTemplates: {
            ...DEFAULT_WHATSAPP_TEMPLATES,
            ...savedTemplates,
            chit_reminder: useDefaultChitReminder ? DEFAULT_WHATSAPP_TEMPLATES.chit_reminder : chitReminder,
          },
        };
        setBaseline(JSON.stringify(next));
        return next;
      });
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

  const connectCloudManual = async event => {
    event.preventDefault();
    setCloudBusy(true);
    setCloudError("");
    try {
      const status = await completeWhatsAppConnect(token, {
        accessToken: cloudForm.accessToken,
        phoneNumberId: cloudForm.phoneNumberId,
        wabaId: cloudForm.wabaId,
        displayPhone: cloudForm.displayPhone,
      });
      setCloudStatus(current => ({ ...(current || {}), ...status, platform: current?.platform }));
      setCloudForm({ accessToken: "", phoneNumberId: "", wabaId: "", displayPhone: "" });
      await refreshCloudStatus();
    } catch (err) {
      setCloudError(err.message || "Could not connect WhatsApp Business.");
    } finally {
      setCloudBusy(false);
    }
  };

  const connectCloudEmbedded = async () => {
    setCloudBusy(true);
    setCloudError("");
    try {
      const start = await startWhatsAppConnect(token);
      if (start.mode !== "embedded_signup") {
        setCloudError(start.message || "Embedded Signup is not available. Use the token form below.");
        return;
      }
      setCloudError("Open Meta Embedded Signup with your App ID / Config ID from the server, then paste the resulting code or token below to finish.");
      await refreshCloudStatus();
    } catch (err) {
      setCloudError(err.message || "Could not start WhatsApp connect.");
    } finally {
      setCloudBusy(false);
    }
  };

  const disconnectCloud = async () => {
    if (!window.confirm("Disconnect WhatsApp Business for this workspace? Receipts can still open wa.me.")) return;
    setCloudBusy(true);
    setCloudError("");
    try {
      await disconnectWhatsApp(token);
      await refreshCloudStatus();
    } catch (err) {
      setCloudError(err.message || "Could not disconnect.");
    } finally {
      setCloudBusy(false);
    }
  };

  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError(""); setSaved(false);
    try {
      await saveOrganizationSettings(token, form);
      await onSettingsSaved?.();
      setBaseline(JSON.stringify(form));
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

  const logoOk = /^https?:\/\/\S+$/i.test(form.companyLogoUrl || "") && logoFailed !== form.companyLogoUrl;
  const dirty = baseline !== null && JSON.stringify(form) !== baseline;
  const insertVariable = variable => {
    const target = lastTemplate.current;
    if (!target) return;
    const value = form.whatsappTemplates[target.key] || "";
    const start = target.el.selectionStart ?? value.length;
    const end = target.el.selectionEnd ?? value.length;
    setTemplate(target.key, value.slice(0, start) + variable + value.slice(end));
    requestAnimationFrame(() => { target.el.focus(); target.el.setSelectionRange(start + variable.length, start + variable.length); });
  };

  return <main className="shell settings-page">
    <div className="toolbar"><div><h1 className="title">Settings</h1><p className="copy">Company branding, receipts, WhatsApp messages and payment reminders.</p></div></div>
    <TabScroller><nav className="module-section-nav" aria-label="Settings sections">
      {SETTINGS_TABS.map(item => <button key={item.id} type="button" className={`module-section-tab ${tab === item.id ? "active" : ""}`} aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </nav></TabScroller>
    <form onSubmit={submit} className="settings-form">
      {tab === "company" && <div className="settings-company">
        <div className="settings-company-main">
          <SettingsSection icon={Building2} title="Business details" copy="Your name, contact and logo, shown on receipts, statements and WhatsApp messages.">
            <div className="settings-logo-row">
              <span className="settings-logo-tile" aria-hidden="true">{logoOk ? <img src={form.companyLogoUrl} alt="" onError={() => setLogoFailed(form.companyLogoUrl)} /> : initialsOf(form.companyName)}</span>
              <Field className="settings-logo-field" label="Logo URL"><input type="url" value={form.companyLogoUrl} onChange={e => set("companyLogoUrl", e.target.value.trim())} placeholder="https://yourbusiness.in/logo.png" /></Field>
            </div>
            <div className="form settings-grid">
              <Field className="span" label="Company / Financer name"><input value={form.companyName} onChange={e => set("companyName", e.target.value)} placeholder="e.g. Sri Lakshmi Finance" /></Field>
              <Field label="Phone"><input type="tel" inputMode="tel" value={form.companyPhone} onChange={e => set("companyPhone", e.target.value)} placeholder="98765 43210" /></Field>
              <Field label="Email"><input type="email" value={form.companyEmail} onChange={e => set("companyEmail", e.target.value)} placeholder="accounts@yourbusiness.in" /></Field>
              <Field className="span" label="Address"><textarea rows={2} value={form.companyAddress} onChange={e => set("companyAddress", e.target.value)} placeholder="Shop / office address" /></Field>
            </div>
          </SettingsSection>
          <SettingsSection icon={ReceiptText} title="Receipt" copy="The closing lines printed at the bottom of every receipt and PDF.">
            <div className="form settings-grid">
              <Field className="span" label="Receipt footer"><input value={form.receiptFooter} maxLength={120} onChange={e => set("receiptFooter", e.target.value)} placeholder="Thank you for your payment." /></Field>
              <Field className="span" label="Terms / notes (optional)"><textarea rows={3} value={form.receiptTerms} onChange={e => set("receiptTerms", e.target.value)} placeholder="e.g. Payments are due by the 5th of every month." /></Field>
            </div>
          </SettingsSection>
        </div>
        <aside className="card settings-preview" aria-label="Receipt preview">
          <span className="settings-preview-kicker">Live preview</span>
          <div className="settings-preview-paper">
            <div className="settings-preview-brand">
              <span className="settings-logo-tile is-small" aria-hidden="true">{logoOk ? <img src={form.companyLogoUrl} alt="" /> : initialsOf(form.companyName)}</span>
              <div>
                <strong>{form.companyName || "Your business name"}</strong>
                {(form.companyPhone || form.companyEmail) && <span>{[form.companyPhone, form.companyEmail].filter(Boolean).join(" · ")}</span>}
              </div>
            </div>
            {form.companyAddress && <p className="settings-preview-address">{form.companyAddress}</p>}
            <div className="settings-preview-rule" />
            <dl className="settings-preview-lines">
              <div><dt>Receipt</dt><dd>R-0001</dd></div>
              <div><dt>Customer</dt><dd>Ravi Kumar</dd></div>
              <div><dt>Paid</dt><dd className="is-amount">₹500</dd></div>
            </dl>
            <div className="settings-preview-rule" />
            <p className="settings-preview-footer">{form.receiptFooter || "Thank you for your payment."}</p>
            {form.receiptTerms && <p className="settings-preview-terms">{form.receiptTerms}</p>}
          </div>
        </aside>
      </div>}

      {tab === "whatsapp" && <>
        <SettingsSection
          icon={MessageCircle}
          title="WhatsApp Business (Cloud API)"
          copy="Connect your own WhatsApp Business number so FinTrack can send receipts and reminders for you. When disconnected, buttons still open wa.me for you to tap Send."
        >
          {cloudError ? <p className="copy" role="alert">{cloudError}</p> : null}
          {cloudStatus?.connected ? (
            <div className="settings-list">
              <div className="settings-list-row">
                <div className="settings-list-text">
                  <strong>Connected · {cloudStatus.displayPhone || "Business number"}</strong>
                  <span className="small">
                    Cloud API sends this month: {cloudStatus.sendsThisMonth ?? 0}
                    {cloudStatus.detail ? ` · ${cloudStatus.detail}` : ""}
                  </span>
                </div>
                <button type="button" className="btn" disabled={cloudBusy} onClick={disconnectCloud}>Disconnect</button>
              </div>
            </div>
          ) : (
            <div className="form spacer">
              <p className="small">
                Platform ready: Meta app {cloudStatus?.platform?.metaAppConfigured ? "yes" : "no"} ·
                Embedded Signup {cloudStatus?.platform?.embeddedSignupConfigured ? "yes" : "no"} ·
                Token encryption {cloudStatus?.platform?.cryptoConfigured ? "yes" : "no"}
              </p>
              {cloudStatus?.platform?.embeddedSignupConfigured ? (
                <button type="button" className="btn primary" disabled={cloudBusy} onClick={connectCloudEmbedded}>
                  {cloudBusy ? "Working…" : "Start Embedded Signup"}
                </button>
              ) : null}
              <Field label="Permanent Cloud API token">
                <input
                  type="password"
                  autoComplete="off"
                  value={cloudForm.accessToken}
                  onChange={event => setCloudForm(current => ({ ...current, accessToken: event.target.value }))}
                  placeholder="EAAG…"
                />
              </Field>
              <Field label="Phone number id">
                <input
                  value={cloudForm.phoneNumberId}
                  onChange={event => setCloudForm(current => ({ ...current, phoneNumberId: event.target.value }))}
                  placeholder="From Meta WhatsApp → API Setup"
                />
              </Field>
              <Field label="WABA id (optional)">
                <input
                  value={cloudForm.wabaId}
                  onChange={event => setCloudForm(current => ({ ...current, wabaId: event.target.value }))}
                />
              </Field>
              <Field label="Display phone (optional)">
                <input
                  value={cloudForm.displayPhone}
                  onChange={event => setCloudForm(current => ({ ...current, displayPhone: event.target.value }))}
                  placeholder="+91…"
                />
              </Field>
              <button type="button" className="btn primary" disabled={cloudBusy || !cloudForm.accessToken || !cloudForm.phoneNumberId} onClick={connectCloudManual}>
                {cloudBusy ? "Connecting…" : "Connect with token"}
              </button>
            </div>
          )}
          <div className="settings-variables" style={{ marginTop: 12 }}>
            <span className="small">Meta-approved templates to create in Business Manager (for Cloud API business-initiated sends):</span>
            <ul className="settings-list">
              {metaGuide.slice(0, 3).map(item => (
                <li key={item.fintrackKey} className="settings-list-row">
                  <div className="settings-list-text">
                    <strong>{item.metaName}</strong>
                    <span className="small">{item.category} · {item.language} · {item.bodyParams.length} body variables</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </SettingsSection>
        <SettingsSection icon={MessageCircle} title="WhatsApp message drafts" copy="Optional wording for wa.me and in-session replies. Cloud API business-initiated sends use Meta-approved templates above. WhatsApp buttons work without connecting Cloud API.">
          <div className="settings-variables">
            <span className="small">Tap a variable to insert it where your cursor is in the open template.</span>
            <div className="settings-variable-chips">
              {TEMPLATE_VARIABLES.map(variable => <button key={variable} type="button" className="settings-variable" onMouseDown={event => event.preventDefault()} onClick={() => insertVariable(variable)}>{variable}</button>)}
            </div>
          </div>
        </SettingsSection>
        {TEMPLATE_GROUPS.map(group => <section key={group.title} className="settings-template-group">
          <h3>{group.title}</h3>
          <div className="card settings-template-list">
            {group.items.map(([key, label, rows]) => {
              const value = form.whatsappTemplates[key] || "";
              const changed = DEFAULT_WHATSAPP_TEMPLATES[key] !== undefined && value !== DEFAULT_WHATSAPP_TEMPLATES[key];
              return <details key={key} className="settings-template">
                <summary>
                  <span className="settings-template-title"><strong>{label}</strong><span className="small">{value.split("\n").find(line => line.trim()) || "Built-in message"}</span></span>
                  {changed && <span className="settings-template-badge">Edited</span>}
                  <ChevronDown className="settings-template-chevron" size={18} aria-hidden="true" />
                </summary>
                <div className="settings-template-body">
                  <Field label={label}><textarea rows={rows} value={value} onFocus={event => { lastTemplate.current = { key, el: event.target }; }} onChange={e => setTemplate(key, e.target.value)} /></Field>
                  {changed && <button type="button" className="settings-reset" onClick={() => setTemplate(key, DEFAULT_WHATSAPP_TEMPLATES[key])}><RotateCcw size={14} aria-hidden="true" />Reset to default</button>}
                </div>
              </details>;
            })}
          </div>
        </section>)}
      </>}

      {tab === "reminders" && <>
        <SettingsSection icon={Bell} title="Payment reminders" copy="When a customer appears in the reminders list before a due date. Pick any combination.">
          <ul className="settings-list">
            {REMINDER_GROUPS.map(({ id: group, label, icon: GroupIcon }) => {
              const on = REMINDER_DAYS.filter(day => form.reminderSettings?.[group]?.[day]).length;
              return <li key={group} className="settings-list-row settings-reminder-row">
                <span className="settings-list-icon" aria-hidden="true"><GroupIcon size={18} /></span>
                <div className="settings-list-text">
                  <strong>{label}</strong>
                  <span className="small">{on ? `${on} of ${REMINDER_DAYS.length} reminders on` : "No reminders"}</span>
                </div>
                <div className="settings-day-chips" role="group" aria-label={`${label} reminders`}>
                  {REMINDER_DAYS.map(day => {
                    const checked = !!form.reminderSettings?.[group]?.[day];
                    return <label key={day} className={`settings-day-chip${checked ? " is-on" : ""}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleReminder(group, day)} />
                      {checked ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}{reminderDayLabel(day)}
                    </label>;
                  })}
                </div>
              </li>;
            })}
          </ul>
        </SettingsSection>
        <SettingsSection icon={MessageCircle} title="Automatic WhatsApp confirmations" copy="After a successful save, FinTrack sends via Cloud API when connected, otherwise opens WhatsApp with the confirmation message. The save still succeeds if WhatsApp cannot send or open.">
          <div className="settings-switches">
            <SwitchRow icon={CalendarDays} title="Daily Finance" copy="New account confirmation" checked={confirmations.daily_account !== false} onChange={() => toggleConfirmation("daily_account")} />
            <SwitchRow icon={CalendarRange} title="Monthly Finance" copy="New account confirmation" checked={confirmations.monthly_account !== false} onChange={() => toggleConfirmation("monthly_account")} />
            <SwitchRow icon={Coins} title="Chit Fund" copy="Lift confirmation" checked={confirmations.chit_lift !== false} onChange={() => toggleConfirmation("chit_lift")} />
          </div>
        </SettingsSection>
      </>}

      <div className="settings-savebar" role="region" aria-label="Save settings">
        <span className={`settings-status${error ? " is-error" : saved && !dirty ? " is-saved" : ""}`} role="status">
          {error || (dirty ? "Unsaved changes" : saved ? "Settings saved." : "")}
        </span>
        <button type="button" className="btn" onClick={close}>Cancel</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
      </div>
    </form>
  </main>;
}
