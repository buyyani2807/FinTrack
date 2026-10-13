import { useEffect, useMemo, useRef } from "react";
import { todayIso } from "../../../lib/dates.js";
import { Button, Metric } from "../../../components/ui.jsx";
import { buildChitSchemeHealth } from "../model/chitSchemeHealth.js";
import { recordAiInsightRun } from "../../intelligence/ai/aiReviewRepository.js";
import { money } from "../model/chitFormat.js";

const RISK_LABEL = { high: "High", medium: "Medium", low: "Low", insufficient: "Insufficient history" };

/** Read-only Scheme Health. Auctions, winners, dividends, commissions, and payments are never changed here. */
export function ChitSchemeHealthPanel({ token, scheme, details, openScheme }) {
  const health = useMemo(() => (scheme && details ? buildChitSchemeHealth({ scheme, details, asOf: todayIso() }) : null), [scheme, details]);
  const logged = useRef(new Set());

  useEffect(() => {
    if (!token || !health?.available) return;
    const key = `${health.schemeId}:${health.asOf}`;
    if (logged.current.has(key)) return;
    logged.current.add(key);
    recordAiInsightRun(token, { module: "chit", feature: "chit_health", insights: health.insights });
  }, [token, health]);

  if (!health) return null;
  if (!health.available) return <p className="small spacer">{health.reason}</p>;
  return <div className="chit-scheme-health spacer">
    <p className="small">Verified figures come from saved payments, bids, and lifts up to {health.asOf}. Next month's collection is an estimate, not a guarantee. Nothing here changes auctions, winners, dividends, or payments.</p>
    <div className="grid metrics">
      <Metric label="Collection rate" value={health.collectionRate == null ? "—" : `${health.collectionRate}%`} color={health.collectionRate != null && health.collectionRate < 90 ? "red" : "green"} />
      <Metric label="Overdue" value={money(health.overdueAmount)} color={health.overdueAmount > 0 ? "red" : ""} />
      <Metric label="Members with increasing delays" value={String(health.increasingDelayMembers)} />
      <Metric label="Expected next month (estimate)" value={money(health.expectedNextMonth.amount)} color="gold" />
      <Metric label="Risk" value={RISK_LABEL[health.risk] || health.risk} color={health.risk === "high" ? "red" : health.risk === "medium" ? "gold" : ""} />
    </div>
    <p className="small">Basis for the estimate: {health.expectedNextMonth.basis}.{health.recentRate != null && health.earlierRate != null ? ` Collection rate ${health.recentRate}% in the last three months vs ${health.earlierRate}% before.` : ""}</p>
    {health.insufficientHistory && <p className="small">Insufficient history: at least two due months are needed before trends are shown.</p>}
    {!health.insights.length && !health.insufficientHistory && <p className="small">No collection, bidding, or dividend issues found for this scheme.</p>}
    {health.insights.map(item => <article key={item.id} className={`card ai-alert ai-alert-${item.severity}`}>
      <header className="ai-alert-head">
        <strong>{item.title}</strong>
        <span><span className={`ai-risk ai-risk-${item.severity}`}>{item.severity}</span> <span className="small">{item.confidence} confidence</span></span>
      </header>
      <p className="small">{item.scheme} · {item.period}</p>
      {item.metrics && <p className="small">{Object.entries(item.metrics).map(([key, value]) => `${key.replace(/([A-Z])/g, " $1").toLowerCase()}: ${typeof value === "number" && /amount|dividend/i.test(key) ? money(value) : value}`).join(" · ")}</p>}
      <p className="small">{item.explanation}</p>
      {item.affected?.length > 0 && <p className="small">Affected: {item.affected.slice(0, 8).join("; ")}{item.affected.length > 8 ? "…" : ""}</p>}
      <footer className="ai-alert-foot">
        <span className="small"><strong>Review:</strong> {item.reviewAction}</span>
        {openScheme && <Button onClick={() => openScheme(health.schemeId)}>{item.source?.label || "Open scheme"}</Button>}
      </footer>
    </article>)}
  </div>;
}
