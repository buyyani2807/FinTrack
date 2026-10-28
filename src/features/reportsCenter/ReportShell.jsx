import { REPORT_HELP, reportById } from "./reportCatalog.js";
import { ReportInsight } from "./ReportInsight.jsx";
import "./reportsCenter.css";

/**
 * Premium header for an existing report view.
 * Does not change calculations — wraps title, metrics, insight, help, and charts.
 */
export function ReportShell({
  reportId,
  title,
  blurb,
  periodLabel = "",
  metrics = [],
  insight = null,
  insightTone = "info",
  warnings = [],
  charts = null,
  sourceNote = "Figures come from posted books for the selected company and period.",
  children,
}) {
  const meta = reportId ? reportById(reportId) : null;
  const heading = title || meta?.name || "Report";
  const copy = blurb || meta?.description || "";
  const help = (reportId && REPORT_HELP[reportId]) || meta?.helps || "";

  return (
    <div className="ft-report-shell">
      <header className="ft-report-shell-head">
        <h2>{heading}</h2>
        {copy ? <p className="ft-report-shell-blurb">{copy}</p> : null}
        {periodLabel ? <p className="ft-report-shell-period">{periodLabel}</p> : null}
        <p className="ft-report-shell-period">{sourceNote}</p>
      </header>

      {metrics.length > 0 && (
        <div className="ft-report-metrics" aria-label="Key totals">
          {metrics.map(metric => (
            <article key={metric.label} className={`ft-report-metric${metric.tone ? ` is-${metric.tone}` : ""}`}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </div>
      )}

      {warnings.map(note => <ReportInsight key={note} tone="warn">{note}</ReportInsight>)}
      {insight ? <ReportInsight tone={insightTone}>{insight}</ReportInsight> : null}

      {charts}

      {help ? (
        <div className="ft-report-help">
          <details>
            <summary>Learn about this report</summary>
            <p>{help}</p>
          </details>
        </div>
      ) : null}

      {children}
    </div>
  );
}
