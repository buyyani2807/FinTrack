import { REPORT_BLURB, REPORT_HELP, insightToneFromText } from "./reportPlainCopy.js";

/**
 * Compact plain-language block above an existing report body.
 * tone: info | ok | warn (defaults from insight wording when omitted).
 */
export function ReportPlainSpeak({
  reportId,
  blurb,
  insight = "",
  tone,
  help,
  children,
}) {
  const copy = blurb ?? REPORT_BLURB[reportId] ?? "";
  const details = help ?? REPORT_HELP[reportId] ?? "";
  const resolvedTone = tone || insightToneFromText(insight);
  const toneClass = resolvedTone === "warn" ? " is-warn" : resolvedTone === "ok" ? " is-ok" : "";

  if (!copy && !insight && !details && !children) return null;

  return (
    <aside className={`acc-report-plain${toneClass}`} aria-label="Report explanation">
      {copy ? <p className="acc-report-plain-blurb">{copy}</p> : null}
      {insight ? <p className="acc-report-plain-insight" role="status">{insight}</p> : null}
      {details ? (
        <details className="acc-report-plain-help">
          <summary>Learn more</summary>
          <p>{details}</p>
        </details>
      ) : null}
      {children}
    </aside>
  );
}
