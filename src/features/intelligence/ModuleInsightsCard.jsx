import { useState } from "react";
import { ArrowRight, ChevronDown, Info, Lightbulb, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";

function InsightHead({ title, note, children }) {
  return (
    <header className="module-intel-head">
      <span className="ft-intel-icon" aria-hidden="true"><Sparkles size={20} /></span>
      <div className="module-intel-titles">
        <h2 className="module-intel-kicker">{title}</h2>
        {note ? <p className="module-intel-note">{note}</p> : null}
      </div>
      {children}
    </header>
  );
}

function InsightList({ tone, title, items }) {
  const Icon = tone === "warn" ? TriangleAlert : Lightbulb;
  return (
    <div className={`module-intel-block is-${tone}`}>
      <h3>{title}<span className="module-intel-block-count">{items.length}</span></h3>
      <ul>
        {items.map(item => <li key={item}><Icon size={15} aria-hidden="true" /><span>{item}</span></li>)}
      </ul>
    </div>
  );
}

const capitalise = text => text.charAt(0).toUpperCase() + text.slice(1);

// Customers to follow up as risk-coloured rows: name with the amount due, then every other reason on one line and the
// credit score on its own line. All reasons the model gives are shown; only their placement changes.
function PeopleList({ rows }) {
  return (
    <ul className="module-intel-people">
      {rows.map(row => {
        const why = row.why || [];
        const due = why.find(reason => /^₹[\d,.]+ due\b/.test(reason));
        const credit = why.find(reason => /credit score/i.test(reason));
        const rest = why.filter(reason => reason !== due && reason !== credit);
        const [, dueAmount, dueWhen] = due?.match(/^(₹[\d,.]+) (due\b.*)$/) || [];
        const tone = /high risk/i.test(credit || "") || rest.some(reason => /overdue/i.test(reason)) ? "high" : credit ? "medium" : "low";
        return (
          <li key={row.id || row.name} className={`module-intel-person risk-${tone}`}>
            <div className="module-intel-person-top">
              <strong>{row.name}</strong>
              {due ? <span className="module-intel-person-due"><b>{dueAmount || due}</b>{dueWhen ? ` ${dueWhen}` : ""}</span> : null}
            </div>
            {rest.length ? <p>{rest.map(capitalise).join(" · ")}</p> : null}
            {credit ? <p className="module-intel-person-credit">{capitalise(credit)}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ModuleInsightsCard({
  report,
  failed = false,
  onRetry,
  onNavigate,
}) {
  const [open, setOpen] = useState(false);

  if (failed || !report) {
    return (
      <section className="card module-intel" aria-label="AI business insights">
        <InsightHead title="AI business insights" note="AI insights are temporarily unavailable.">
          {onRetry ? <button type="button" className="btn module-intel-retry" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Retry</button> : null}
        </InsightHead>
      </section>
    );
  }

  const attention = (report.attention || []).slice(0, 3);
  const actions = (report.actions || []).slice(0, 3);
  // A details section that already lists the priority customers replaces the separate follow-up list.
  const listsPeople = (report.details || []).some(section => section.people?.length);
  const hasDetails = (report.details || []).length || report.priorities?.length || report.alerts?.length;

  return (
    <section className="card module-intel" aria-label={report.kicker}>
      <InsightHead title={report.kicker} note={report.note} />
      <p className="module-intel-summary">{report.summary}</p>
      {report.performance?.length ? (
        <dl className="module-intel-metrics">
          {report.performance.map(item => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {attention.length || actions.length ? (
        <div className="module-intel-lists">
          {attention.length ? <InsightList tone="warn" title="Needs attention" items={attention} /> : null}
          {actions.length ? <InsightList tone="tip" title="Recommended actions" items={actions} /> : null}
        </div>
      ) : null}

      {open ? (
        <div className="module-intel-details" id="module-intel-details">
          {(report.details || []).map(section => (
            <article key={section.id || section.title} className="module-intel-cat">
              <header>
                <h3>{section.title}</h3>
                {section.link && onNavigate ? (
                  <button type="button" className="module-intel-link" onClick={() => onNavigate(section.link)}>
                    {section.linkLabel || "Open"}<ArrowRight size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </header>
              {section.verified?.length ? (
                <ul className="module-intel-facts">
                  {section.verified.map(item => <li key={item.label}><span>{item.label}</span><strong>{item.value}</strong></li>)}
                </ul>
              ) : null}
              {section.people?.length ? <PeopleList rows={section.people} /> : null}
              {section.insights?.length ? (
                <ul className="module-intel-points">{section.insights.map(item => <li key={item}>{item}</li>)}</ul>
              ) : null}
            </article>
          ))}
          {report.priorities?.length && !listsPeople ? (
            <article className="module-intel-cat">
              <header><h3>Priority follow-up</h3></header>
              <PeopleList rows={report.priorities} />
            </article>
          ) : null}
          {report.alerts?.length ? (
            <article className="module-intel-cat">
              <header><h3>Alerts</h3></header>
              <ul className="module-intel-points">{report.alerts.map(item => <li key={item}>{item}</li>)}</ul>
            </article>
          ) : null}
          {report.disclaimer ? <p className="module-intel-disclaimer"><Info size={13} aria-hidden="true" />{report.disclaimer}</p> : null}
        </div>
      ) : null}

      {hasDetails ? (
        <button type="button" className="ft-intel-more" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="module-intel-details">
          {open ? "Hide insights" : "View all insights"}<ChevronDown size={16} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
