import { useState } from "react";

export function ModuleInsightsCard({
  report,
  failed = false,
  onRetry,
  onNavigate,
}) {
  const [open, setOpen] = useState(false);

  if (failed || !report) {
    return (
      <section className="card module-intel">
        <header className="module-intel-head">
          <div>
            <p className="module-intel-kicker">AI business insights</p>
            <p className="module-intel-copy">AI insights are temporarily unavailable.</p>
          </div>
          {onRetry ? <button type="button" className="btn" onClick={onRetry}>Retry</button> : null}
        </header>
      </section>
    );
  }

  return (
    <section className="card module-intel">
      <header className="module-intel-head">
        <div>
          <p className="module-intel-kicker">{report.kicker}</p>
          <p className="module-intel-note">{report.note}</p>
        </div>
        <button type="button" className="btn" onClick={() => setOpen(value => !value)} aria-expanded={open}>
          {open ? "Hide insights" : "View all insights"}
        </button>
      </header>
      <p className="module-intel-summary">{report.summary}</p>
      {report.attention?.length ? (
        <div className="module-intel-block">
          <strong>Needs attention</strong>
          <ul>{report.attention.slice(0, 3).map(item => <li key={item}>{item}</li>)}</ul>
        </div>
      ) : null}
      {report.performance?.length ? (
        <div className="module-intel-metrics">
          {report.performance.map(item => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {report.actions?.length ? (
        <div className="module-intel-block">
          <strong>Recommended actions</strong>
          <ul>{report.actions.slice(0, 3).map(item => <li key={item}>{item}</li>)}</ul>
        </div>
      ) : null}

      {open ? (
        <div className="module-intel-details">
          {(report.details || []).map(section => (
            <article key={section.id || section.title} className="module-intel-cat">
              <header>
                <h3>{section.title}</h3>
                {section.link && onNavigate ? (
                  <button type="button" className="btn" onClick={() => onNavigate(section.link)}>
                    {section.linkLabel || "Open"}
                  </button>
                ) : null}
              </header>
              {section.verified?.length ? (
                <p className="module-intel-facts">
                  {section.verified.map(item => `${item.label} ${item.value}`).join(" · ")}
                </p>
              ) : null}
              {section.insights?.length ? (
                <ul>{section.insights.map(item => <li key={item}>{item}</li>)}</ul>
              ) : null}
            </article>
          ))}
          {report.priorities?.length ? (
            <article className="module-intel-cat">
              <header><h3>Priority follow-up</h3></header>
              <ol className="module-intel-priority">
                {report.priorities.map(row => (
                  <li key={row.id || row.name}>
                    <strong>{row.name}</strong>
                    <span>{(row.why || []).join(" · ")}</span>
                  </li>
                ))}
              </ol>
            </article>
          ) : null}
          {report.alerts?.length ? (
            <article className="module-intel-cat">
              <header><h3>Alerts</h3></header>
              <ul>{report.alerts.map(item => <li key={item}>{item}</li>)}</ul>
            </article>
          ) : null}
          <p className="module-intel-disclaimer">{report.disclaimer}</p>
        </div>
      ) : null}
    </section>
  );
}
