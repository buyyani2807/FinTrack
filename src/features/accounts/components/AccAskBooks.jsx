import { useState } from "react";
import { ASK_PROMPTS, askAccountsBooks } from "../model/accountsAsk.js";
import { money } from "../accountsFormat.js";

export function AccAskBooks({
  accounts = [],
  vouchers = [],
  parties = [],
  items = [],
  stockMovements = [],
  voucherItemLines = [],
  range,
  today,
  onNavigate,
}) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState(null);

  const ask = question => {
    const text = String(question || "").trim();
    setQuery(text);
    setAnswer(askAccountsBooks(text, {
      accounts,
      vouchers,
      parties,
      items,
      stockMovements,
      voucherItemLines,
      range,
      today,
    }));
  };

  return (
    <section className="card acc-ask">
      <header className="acc-ask-head">
        <div>
          <p className="acc-intel-kicker">Ask the books</p>
          <p className="acc-intel-note">Answers quote posted reports for {range?.from} to {range?.to}. They leave vouchers unchanged.</p>
        </div>
      </header>
      <form className="acc-ask-form" onSubmit={event => { event.preventDefault(); ask(query); }}>
        <input
          id="acc-ask-query"
          aria-label="Question"
          value={query}
          placeholder="Who owes me, rent, GST, or a party name"
          onChange={event => setQuery(event.target.value)}
        />
        <button type="submit" className="btn primary">Ask</button>
      </form>
      <div className="acc-ask-prompts">
        {ASK_PROMPTS.map(prompt => (
          <button key={prompt.id} type="button" className="acc-ov-link-btn" onClick={() => ask(prompt.question)}>
            {prompt.label}
          </button>
        ))}
      </div>
      {answer ? (
        <div className="acc-ask-answer">
          <div className="acc-ask-answer-head">
            <strong>{answer.title}</strong>
            {answer.link && onNavigate ? (
              <button type="button" className="acc-ov-link-btn" onClick={() => onNavigate(answer.link)}>Open</button>
            ) : null}
          </div>
          <p>{answer.summary}</p>
          {answer.lines?.length ? (
            <ul className="acc-ask-lines">
              {answer.lines.map(line => (
                <li key={`${line.label}-${line.detail}`}>
                  <span>
                    <strong>{line.label}</strong>
                    {line.detail ? <em>{line.detail}</em> : null}
                  </span>
                  {line.amount == null ? null : <span>{money(line.amount)}</span>}
                </li>
              ))}
            </ul>
          ) : null}
          {answer.source ? <p className="acc-intel-note">{answer.source}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
