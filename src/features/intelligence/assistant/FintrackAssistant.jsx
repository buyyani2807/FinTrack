import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router";
import { formatInr } from "../../../lib/formatMoney.js";
import { askFintrack, assistantPromptsForPath, createAskLimiter } from "./askFintrack.js";
import "./assistant.css";

const limiter = createAskLimiter();

export function FintrackAssistant({ open, onClose, context, onNavigate, loadBooks, loadCashbook }) {
  const location = useLocation();
  const titleId = useId();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const prompts = assistantPromptsForPath(location.pathname);

  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = event => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const ask = async question => {
    const text = String(question || "").trim();
    if (!text || loading) return;
    const gate = limiter();
    if (!gate.ok) {
      setError("Too many questions just now. Wait a moment and try again.");
      return;
    }
    setQuery(text);
    setError("");
    setLoading(true);
    try {
      let ctx = context;
      let next = askFintrack(text, ctx);
      if (next.needs === "cashbook" && loadCashbook) {
        const cashbook = await loadCashbook();
        ctx = { ...ctx, cashbook };
        next = askFintrack(text, ctx);
      }
      if (next.needs === "accounts" && loadBooks) {
        const books = await loadBooks();
        ctx = { ...ctx, books, accountsLoaded: true };
        next = askFintrack(text, ctx);
      }
      setAnswer(next);
    } catch (err) {
      setAnswer(null);
      setError(err?.message || "Ask could not read the books.");
    } finally {
      setLoading(false);
    }
  };

  const openLink = link => {
    if (!link?.path || !onNavigate) return;
    onNavigate(link.path);
    onClose();
  };

  return (
    <div className="ft-ask-backdrop" onClick={onClose}>
      <section
        className="ft-ask"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={event => event.stopPropagation()}
      >
        <header className="ft-ask-head">
          <div>
            <p className="ft-ask-kicker">Ask FinTrack</p>
            <h2 id={titleId}>Answers from your records</h2>
            <p className="ft-ask-note">Read-only. Amounts come from the same reports as the screens. Nothing is posted.</p>
          </div>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </header>
        <form className="ft-ask-form" onSubmit={event => { event.preventDefault(); ask(query); }}>
          <label className="sr-only" htmlFor="ft-ask-query">Question</label>
          <input
            id="ft-ask-query"
            ref={inputRef}
            value={query}
            placeholder="Who has not paid today?"
            onChange={event => setQuery(event.target.value)}
            disabled={loading}
          />
          <button type="submit" className="btn primary" disabled={loading || !query.trim()}>{loading ? "Looking up…" : "Ask"}</button>
        </form>
        <div className="ft-ask-prompts" aria-label="Suggested questions">
          {prompts.map(prompt => (
            <button key={prompt} type="button" className="ft-ask-prompt" disabled={loading} onClick={() => ask(prompt)}>{prompt}</button>
          ))}
        </div>
        {error ? (
          <p className="ft-ask-error" role="alert">{error} <button type="button" className="btn" onClick={() => ask(query)}>Retry</button></p>
        ) : null}
        {loading ? <p className="ft-ask-note" role="status">Reading the verified figures…</p> : null}
        {answer ? (
          <article className="ft-ask-answer" aria-live="polite">
            <header className="ft-ask-answer-head">
              <h3>{answer.title}</h3>
              {answer.link ? <button type="button" className="btn" onClick={() => openLink(answer.link)}>{answer.link.label}</button> : null}
            </header>
            <p>{answer.summary}</p>
            {answer.lines?.length ? (
              <ul className="ft-ask-lines">
                {answer.lines.map(line => (
                  <li key={`${line.label}-${line.detail}`}>
                    <span><strong>{line.label}</strong>{line.detail ? <em>{line.detail}</em> : null}</span>
                    {line.amount == null ? null : <span>{formatInr(line.amount)}</span>}
                  </li>
                ))}
              </ul>
            ) : null}
            <dl className="ft-ask-meta">
              <div><dt>Period</dt><dd>{answer.period?.label}</dd></div>
              <div><dt>Financial year</dt><dd>{answer.period?.financialYear}</dd></div>
              <div><dt>Source</dt><dd>{answer.source?.module} · {answer.source?.report}</dd></div>
              {answer.filters?.length ? <div><dt>Filters</dt><dd>{answer.filters.join(" · ")}</dd></div> : null}
            </dl>
            {answer.warning ? <p className="ft-ask-warning">{answer.warning}</p> : null}
          </article>
        ) : !loading && !error ? <p className="ft-ask-note">Choose a suggested question or type your own. If the records cannot answer it, Ask says so.</p> : null}
      </section>
    </div>
  );
}
