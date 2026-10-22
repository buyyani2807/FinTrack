import { useEffect, useRef, useState } from "react";
import { formatInr as money } from "../../../lib/formatMoney.js";
import { openManualWhatsAppShare } from "../../receipts/io/receiptWhatsApp.js";
import {
  REMINDER_LANGUAGES,
  draftCollectionReminder,
  reminderSendAllowed,
} from "../model/collectionCopilot.js";

const RISK_LABEL = { high: "High", medium: "Medium", low: "Low" };

function SliderArrow({ direction }) {
  const previous = direction === "prev";
  return (
    <svg className="collection-copilot-arrow-icon" viewBox="0 0 40 120" aria-hidden="true">
      <path
        d={previous ? "M30 8 8 60l22 52" : "M10 8l22 52L10 112"}
        fill="none"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function reminderFields(row, copilot) {
  return {
    name: row.name,
    due: row.dueToday,
    outstanding: row.outstanding,
    date: copilot.asOf,
    businessName: copilot.businessName,
  };
}

function sentence(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function CollectionCopilotCard({ copilot }) {
  const listRef = useRef(null);
  const [draftId, setDraftId] = useState("");
  const [language, setLanguage] = useState("en");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [sendNote, setSendNote] = useState("");
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const waiting = copilot?.ranked.length || 0;

  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const update = () => {
      setCanPrev(el.scrollLeft > 4);
      setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [waiting]);

  if (!copilot) return null;
  const draft = copilot.ranked.find(row => row.id === draftId) || null;
  const monthly = copilot.kind === "monthly";
  const dueLabel = monthly ? "Next due" : "Due today";
  const missedNote = copilot.actions.find(action => /missed/.test(action)) || "";

  const slide = direction => {
    const el = listRef.current;
    const cards = [...(el?.querySelectorAll(":scope > li") || [])];
    if (!el || !cards.length) return;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 16;
    const stride = cards[0].getBoundingClientRect().width + gap;
    const page = Math.max(1, Math.floor((el.clientWidth + 1) / stride));
    const origin = el.getBoundingClientRect().left;
    let current = cards.findIndex(card => card.getBoundingClientRect().left >= origin - 8);
    if (current < 0) current = cards.length - 1;
    const target = cards[Math.min(cards.length - 1, Math.max(0, current + direction * page))];
    const peek = page === 1 && target !== cards[0] ? 64 : 0;
    const left = el.scrollLeft + target.getBoundingClientRect().left - origin - peek;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  };

  const openDraft = row => {
    if (draftId === row.id) {
      setDraftId("");
      setConfirmed(false);
      setSendNote("");
      return;
    }
    setDraftId(row.id);
    setLanguage("en");
    setMessage(draftCollectionReminder(reminderFields(row, copilot), "en"));
    setConfirmed(false);
    setSendNote("");
  };

  const changeLanguage = nextLanguage => {
    if (!draft) return;
    setLanguage(nextLanguage);
    setMessage(draftCollectionReminder(reminderFields(draft, copilot), nextLanguage));
    setConfirmed(false);
  };

  const send = () => {
    if (!draft || !reminderSendAllowed({ confirmed, phone: draft.phone, message })) return;
    const result = openManualWhatsAppShare({ phone: draft.phone, message });
    setSendNote(result.opened ? "WhatsApp opened. The books were not changed." : "WhatsApp did not open. Copy the message and send it yourself. The books were not changed.");
  };

  return (
    <section className="card collection-copilot" aria-label="Who to collect first">
      <header className="collection-copilot-head">
        <div>
          <h2>Who to collect first</h2>
          <p>
            {waiting
              ? `Collect in this order. ${money(copilot.pending)} is still to collect${monthly ? " this month" : " today"}.`
              : `Nothing is waiting${monthly ? " this month" : " today"}.`}
          </p>
        </div>
        {waiting ? <p className="collection-copilot-count">{waiting} {waiting === 1 ? "customer" : "customers"}</p> : null}
      </header>
      {copilot.scopedToAssigned ? <p className="collection-copilot-scope">Only customers assigned to you.</p> : null}
      {missedNote ? <p className="collection-copilot-alert">{missedNote}</p> : null}
      {waiting ? (
        <div className={`collection-copilot-slider${canPrev ? " has-prev" : ""}${canNext ? " has-next" : ""}`}>
          {waiting > 1 ? (
            <button type="button" className="collection-copilot-arrow is-prev" aria-label="Previous customers" disabled={!canPrev} onClick={() => slide(-1)}>
              <SliderArrow direction="prev" />
            </button>
          ) : null}
          <ol className="collection-copilot-list" ref={listRef} tabIndex={0} aria-label="Collection order">
          {copilot.ranked.map((row, index) => {
            const open = draft?.id === row.id;
            const recorded = (row.why || []).map(sentence).filter(Boolean);
            const restated = new Set([`${money(row.dueToday)} due today`, `${money(row.outstanding)} outstanding`]);
            const reasons = recorded.filter(reason => !restated.has(reason));
            return (
              <li key={row.id} className={open ? "is-open" : ""} data-risk={row.risk || "low"}>
                <div className="collection-copilot-top">
                  <span className="collection-copilot-rank">{index + 1}</span>
                  <div className="collection-copilot-main">
                    <div className="collection-copilot-title">
                      <strong>{row.name}</strong>
                      {row.risk ? <span className={`ai-risk ai-risk-${row.risk}`}>{RISK_LABEL[row.risk] || row.risk}</span> : null}
                    </div>
                    <p className="collection-copilot-action">{row.recommendedAction || "Review this customer."}</p>
                    {row.phone ? <a className="collection-copilot-phone" href={`tel:${row.phone}`}>{row.phone}</a> : null}
                  </div>
                </div>
                <dl className="collection-copilot-facts">
                  <div>
                    <dt>{dueLabel}</dt>
                    <dd>{money(row.dueToday)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd>{money(row.outstanding)}</dd>
                  </div>
                  <div>
                    <dt>Reach</dt>
                    <dd>{row.channel || "—"}</dd>
                  </div>
                  <div>
                    <dt>Assigned</dt>
                    <dd>{row.assignedAgent || "Not assigned"}</dd>
                  </div>
                  {row.paymentPattern ? (
                    <div className="collection-copilot-span">
                      <dt>Payment pattern</dt>
                      <dd>{row.paymentPattern}</dd>
                    </div>
                  ) : null}
                </dl>
                {reasons.length || !recorded.length ? (
                  <div className="collection-copilot-why">
                    <p>Why this order</p>
                    {reasons.length ? (
                      <ul>
                        {reasons.map(reason => <li key={reason}>{reason}</li>)}
                      </ul>
                    ) : <p className="collection-copilot-muted">No extra reason was recorded.</p>}
                  </div>
                ) : null}
                <div className="collection-copilot-tools">
                  <button type="button" className={`btn${open ? "" : " primary"}`} aria-expanded={open} onClick={() => openDraft(row)}>
                    {open ? "Close reminder" : "Draft reminder"}
                  </button>
                </div>
              </li>
            );
          })}
          </ol>
          {waiting > 1 ? (
            <button type="button" className="collection-copilot-arrow is-next" aria-label="Next customers" disabled={!canNext} onClick={() => slide(1)}>
              <SliderArrow direction="next" />
            </button>
          ) : null}
        </div>
      ) : <p className="collection-copilot-empty">No customer is waiting for a collection.</p>}
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
          {draft.phone ? null : <p className="collection-copilot-warn">Add a phone number on this customer before sending.</p>}
          <label className="collection-copilot-confirm">
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            <span>I have checked this message. WhatsApp opens only after this is ticked.</span>
          </label>
          <div className="collection-copilot-draft-actions">
            <button type="submit" className="btn primary" disabled={!reminderSendAllowed({ confirmed, phone: draft.phone, message })}>Open WhatsApp</button>
            <button type="button" className="btn" onClick={() => { setDraftId(""); setConfirmed(false); setSendNote(""); }}>Cancel</button>
          </div>
          {sendNote ? <p className="collection-copilot-status" role="status">{sendNote}</p> : null}
        </form>
      ) : null}
      <p className="collection-copilot-note">{copilot.disclaimer}</p>
    </section>
  );
}
