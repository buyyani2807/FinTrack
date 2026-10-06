import { useState } from "react";
import { formatInr as money } from "../../../lib/formatMoney.js";
import { openManualWhatsAppShare } from "../../receipts/io/receiptWhatsApp.js";
import {
  REMINDER_LANGUAGES,
  draftCollectionReminder,
  reminderSendAllowed,
} from "../model/collectionCopilot.js";

export function CollectionCopilotCard({ copilot }) {
  const [draftId, setDraftId] = useState("");
  const [language, setLanguage] = useState("en");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [sendNote, setSendNote] = useState("");
  if (!copilot) return null;
  const draft = copilot.ranked.find(row => row.id === draftId) || null;

  const openDraft = row => {
    const next = draftCollectionReminder({
      name: row.name,
      due: row.dueToday,
      outstanding: row.outstanding,
      date: copilot.asOf,
      businessName: copilot.businessName,
    }, "en");
    setDraftId(row.id);
    setLanguage("en");
    setMessage(next);
    setConfirmed(false);
    setSendNote("");
  };

  const changeLanguage = nextLanguage => {
    if (!draft) return;
    setLanguage(nextLanguage);
    setMessage(draftCollectionReminder({
      name: draft.name,
      due: draft.dueToday,
      outstanding: draft.outstanding,
      date: copilot.asOf,
      businessName: copilot.businessName,
    }, nextLanguage));
    setConfirmed(false);
  };

  const send = () => {
    if (!draft || !reminderSendAllowed({ confirmed, phone: draft.phone, message })) return;
    const result = openManualWhatsAppShare({ phone: draft.phone, message });
    setSendNote(result.opened ? "WhatsApp opened. The books were not changed." : "WhatsApp did not open. Copy the message and send it yourself. The books were not changed.");
  };

  return (
    <section className="card collection-copilot" aria-label="Collection copilot">
      <p className="acc-intel-kicker">Collection copilot</p>
      <h2>Who to collect first</h2>
      <p>{copilot.summary}</p>
      {copilot.scopedToAssigned ? <p className="small">Showing customers assigned to you.</p> : null}
      {copilot.ranked.length ? (
        <ol className="collection-copilot-list">
          {copilot.ranked.map((row, index) => (
            <li key={row.id}>
              <div>
                <strong>{index + 1}. {row.name}</strong>
                <span className="small">{row.why.join(" · ")}</span>
              </div>
              <span>{money(row.outstanding)}</span>
              <button type="button" className="btn" onClick={() => openDraft(row)}>Draft reminder</button>
            </li>
          ))}
        </ol>
      ) : <p className="small">No pending customer to rank.</p>}
      <ul className="collection-copilot-actions">
        {copilot.actions.map(action => <li key={action}>{action}</li>)}
      </ul>
      {draft ? (
        <form className="collection-copilot-draft" onSubmit={event => { event.preventDefault(); send(); }}>
          <h3>Reminder for {draft.name}</h3>
          <label>
            Language
            <select value={language} onChange={event => changeLanguage(event.target.value)}>
              {REMINDER_LANGUAGES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label>
            Message
            <textarea value={message} onChange={event => { setMessage(event.target.value); setConfirmed(false); }} rows={4} />
          </label>
          {draft.phone ? null : <p className="small">Add a phone number on the customer before sending.</p>}
          <label className="collection-copilot-confirm">
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            I confirm this reminder. It is not sent until I open WhatsApp.
          </label>
          <div className="collection-copilot-draft-actions">
            <button type="submit" className="btn primary" disabled={!reminderSendAllowed({ confirmed, phone: draft.phone, message })}>Open WhatsApp</button>
            <button type="button" className="btn" onClick={() => { setDraftId(""); setConfirmed(false); }}>Cancel</button>
          </div>
          {sendNote ? <p className="small" role="status">{sendNote}</p> : null}
        </form>
      ) : null}
      <p className="small">{copilot.disclaimer}</p>
    </section>
  );
}
