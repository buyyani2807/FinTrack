import { useMemo, useState } from "react";
import { buildAccountsIntelligence } from "./accountsIntelligence.js";

const CATEGORY_ORDER = ["profitability", "cash", "receivables", "payables", "expenses", "gst"];

export function AccIntelligenceBrief({
  accounts,
  vouchers,
  parties,
  range,
  previousRange,
  today,
  companyId,
  companyName,
  onNavigate,
}) {
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);

  const report = useMemo(() => {
    try {
      return buildAccountsIntelligence({
        accounts,
        vouchers,
        parties,
        range,
        previousRange,
        today,
        companyId,
        companyName,
      });
    } catch {
      return { failed: true };
    }
  }, [accounts, vouchers, parties, range, previousRange, today, companyId, companyName, nonce]);

  const refresh = () => {
    setBusy(true);
    setNonce(value => value + 1);
    window.setTimeout(() => setBusy(false), 180);
  };

  if (report?.failed) {
    return (
      <section className="card acc-intel">
        <header className="acc-intel-head">
          <div>
            <p className="acc-intel-kicker">AI business brief</p>
            <p className="acc-intel-copy">Financial insights are temporarily unavailable.</p>
          </div>
          <button type="button" className="acc-ov-link-btn" onClick={refresh}>Retry</button>
        </header>
      </section>
    );
  }

  if (!report) return null;

  return (
    <section className="card acc-intel">
      <header className="acc-intel-head">
        <div>
          <p className="acc-intel-kicker">AI business brief</p>
          <p className="acc-intel-note">Interpretation of verified Accounts figures for {companyName || "this company"} · {range.from} to {range.to}</p>
        </div>
        <div className="acc-intel-tools">
          <button type="button" className="acc-ov-link-btn" onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
          <button type="button" className="acc-ov-link-btn" onClick={() => setOpen(value => !value)} aria-expanded={open}>
            {open ? "Hide insights" : "View insights"}
          </button>
        </div>
      </header>

      {busy ? (
        <p className="acc-intel-loading">Analyzing financial activity…</p>
      ) : (
        <>
          <ul className="acc-intel-brief">
            {report.brief.map(line => <li key={line}>{line}</li>)}
          </ul>
          {report.watch.length ? (
            <div className="acc-intel-block">
              <strong>Areas to watch</strong>
              <ul>{report.watch.slice(0, 3).map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          ) : null}
          {report.actions.length ? (
            <div className="acc-intel-block">
              <strong>Recommended actions</strong>
              <ul>{report.actions.slice(0, 3).map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          ) : null}
        </>
      )}

      {open && !busy && (
        <div className="acc-intel-details">
          {CATEGORY_ORDER.map(id => {
            const category = report.categories[id];
            if (!category) return null;
            return (
              <article key={id} className="acc-intel-cat">
                <header>
                  <h3>{category.title}</h3>
                  {category.link && onNavigate ? (
                    <button type="button" className="acc-ov-link-btn" onClick={() => onNavigate(category.link)}>
                      Open
                    </button>
                  ) : null}
                </header>
                {category.verified?.length ? (
                  <p className="acc-intel-facts">{category.verified.map(item => `${item.label} ${item.value}`).join(" · ")}</p>
                ) : null}
                <ul>
                  {(category.insights || []).map(item => <li key={item}>{item}</li>)}
                </ul>
              </article>
            );
          })}
          <article className="acc-intel-cat">
            <header><h3>Anomalies / attention required</h3></header>
            {report.anomalies.length ? (
              <ul>{report.anomalies.map(item => <li key={item.title + item.detail}><em>{item.title}.</em> {item.detail}</li>)}</ul>
            ) : (
              <p className="acc-intel-empty">No unusual activity flagged from the selected period.</p>
            )}
          </article>
          <p className="acc-intel-disclaimer">Verified amounts come from Accounts reports. Insights are advisory and do not change vouchers, ledgers, or GST.</p>
        </div>
      )}
    </section>
  );
}
