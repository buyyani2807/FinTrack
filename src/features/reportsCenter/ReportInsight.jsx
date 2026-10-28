/** Short plain-language line. tone: info | ok | warn */
export function ReportInsight({ children, tone = "info" }) {
  if (!children) return null;
  const className = tone === "warn" ? " is-warn" : tone === "ok" ? " is-ok" : "";
  return <p className={`ft-report-insight${className}`} role="status">{children}</p>;
}
