import { useMemo, useState } from "react";
import { GAUGE_SEGMENTS, calculateFintrackCreditScore, scoreToGaugeAngle } from "./creditScoreModel.js";
import { formatInr } from "../../lib/formatMoney.js";

const money = formatInr;

const BAND_COLORS = {
  excellent: "#4fd08d",
  good: "#8fd14f",
  fair: "#f4b942",
  attention: "#f08a4b",
  high_risk: "#ff7373",
};

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlice(cx, cy, outer, inner, startDeg, endDeg) {
  const startOuter = polar(cx, cy, outer, startDeg);
  const endOuter = polar(cx, cy, outer, endDeg);
  const startInner = polar(cx, cy, inner, endDeg);
  const endInner = polar(cx, cy, inner, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${startOuter.x} ${startOuter.y} A ${outer} ${outer} 0 ${large} 1 ${endOuter.x} ${endOuter.y} L ${startInner.x} ${startInner.y} A ${inner} ${inner} 0 ${large} 0 ${endInner.x} ${endInner.y} Z`;
}

export function CreditScoreGauge({ score = 300, available = true, size = 320 }) {
  const cx = 180;
  const cy = 188;
  const outer = 118;
  const inner = 74;
  const needleDeg = scoreToGaugeAngle(score);
  const tip = polar(cx, cy, inner - 8, needleDeg);
  const rad = (needleDeg * Math.PI) / 180;
  const px = -Math.sin(rad);
  const py = Math.cos(rad);
  const left = { x: cx + px * 8, y: cy + py * 8 };
  const right = { x: cx - px * 8, y: cy - py * 8 };
  const scale = size / 360;

  return <svg className="credit-score-gauge" viewBox="0 0 360 250" width={size} height={250 * scale} role="img" aria-label={available ? `FinTrack Credit Score ${score}` : "FinTrack Credit Score not available"}>
    {GAUGE_SEGMENTS.map(segment => {
      const mid = (segment.start + segment.end) / 2;
      const labelPos = polar(cx, cy, outer + 22, mid);
      const rangePos = polar(cx, cy, (outer + inner) / 2, mid);
      return <g key={segment.label}>
        <path d={donutSlice(cx, cy, outer, inner, segment.start, segment.end)} fill={segment.color} />
        <text x={labelPos.x} y={labelPos.y} textAnchor="middle" dominantBaseline="middle" className="credit-score-gauge-label">{segment.label}</text>
        <text x={rangePos.x} y={rangePos.y} textAnchor="middle" dominantBaseline="middle" className="credit-score-gauge-range">{segment.range}</text>
      </g>;
    })}
    {available && <polygon points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`} fill="#2b3344" />}
    <circle cx={cx} cy={cy} r="11" fill="#2b3344" />
    <circle cx={cx} cy={cy} r="5" fill="#e8edf5" />
    <text x={cx} y="236" textAnchor="middle" className="credit-score-gauge-title">FINTRACK CREDIT SCORE</text>
  </svg>;
}

function FactorList({ items, tone }) {
  if (!items?.length) return null;
  return <ul className={`credit-score-factors ${tone}`}>
    {items.map(item => <li key={item}>{item}</li>)}
  </ul>;
}

export function CreditScoreDetails({ result, close, accountLabel }) {
  if (!result) return null;
  return <div className="modal-bg" onClick={close}><div className="modal credit-score-modal" onClick={event => event.stopPropagation()}>
    <div className="row">
      <h2 className="title">FinTrack Credit Score</h2>
      <button type="button" className="btn" onClick={close}>Close</button>
    </div>
    <div className="credit-score-details-hero">
        <div className="credit-score-gauge-wrap"><CreditScoreGauge score={result.score} available={result.available} /></div>
      {result.available ? <div>
        <strong className={`credit-score-rating ${result.band}`}>{result.score} — {result.rating}</strong>
        <p className="small">{result.trendLabel} {result.trend === "improving" ? "↑" : result.trend === "declining" ? "↓" : "→"}</p>
        {result.accountScore && <p className="small">This {accountLabel || "account"}: {result.accountScore.score} · {result.accountScore.rating}</p>}
      </div> : <div>
        <strong>Not Available</strong>
        <p className="copy">{result.title}</p>
        <p className="small">{result.message}</p>
      </div>}
    </div>
    {result.available && <>
      <div className="grid metrics spacer">
        <div className="card"><div className="metric-label">Scheduled</div><div className="metric-value">{result.summary.scheduled}</div></div>
        <div className="card"><div className="metric-label">On-time</div><div className="metric-value green">{result.summary.onTime}</div></div>
        <div className="card"><div className="metric-label">Late</div><div className="metric-value">{result.summary.late}</div></div>
        <div className="card"><div className="metric-label">Partial</div><div className="metric-value">{result.summary.partial}</div></div>
        <div className="card"><div className="metric-label">Missed</div><div className="metric-value red">{result.summary.missed}</div></div>
        <div className="card"><div className="metric-label">On-time rate</div><div className="metric-value gold">{result.summary.onTimeRate}%</div></div>
      </div>
      <div className="card spacer">
        <strong>Why this score?</strong>
        <p className="small spacer">Positive factors</p>
        <FactorList items={result.positives} tone="good" />
        <p className="small spacer">Negative factors</p>
        <FactorList items={result.negatives} tone="bad" />
        <div className="credit-score-weight-list spacer">
          {result.factors.map(factor => <div key={factor.id} className="credit-score-weight-row">
            <span>{factor.label} · {Math.round(factor.weight * 100)}%</span>
            <strong>{factor.score}</strong>
          </div>)}
        </div>
      </div>
      {!!result.recent.length && <div className="card spacer">
        <strong>Recent payment behavior</strong>
        <ul className="credit-score-recent">{result.recent.map(item => <li key={item.date + item.label} className={item.tone}>{item.label}</li>)}</ul>
      </div>}
      {!!result.history.length && <div className="card spacer">
        <strong>Score history</strong>
        <ul className="credit-score-history">{result.history.map(item => <li key={item.month}><span>{item.label}</span><strong>{item.score}</strong></li>)}</ul>
      </div>}
    </>}
    <p className="small credit-score-disclaimer">FinTrack Credit Score is an internal assessment based on payment history recorded in FinTrack. It is not an official credit-bureau score.</p>
  </div></div>;
}

export function CreditScoreCard({
  loans = [],
  chitPayments = [],
  focusLoanId,
  accountLabel,
  asOf,
}) {
  const [open, setOpen] = useState(false);
  const result = useMemo(
    () => calculateFintrackCreditScore({ loans, chitPayments, focusLoanId, asOf }),
    [loans, chitPayments, focusLoanId, asOf],
  );
  const color = result.available ? BAND_COLORS[result.band] : "#9ba9bd";

  return <>
    <section className="card credit-score-card spacer">
      <div className="credit-score-card-main">
        <div className="credit-score-gauge-wrap"><CreditScoreGauge score={result.score} available={result.available} size={280} /></div>
        <div className="credit-score-card-copy">
          <p className="credit-score-kicker">FinTrack Credit Score</p>
          {result.available ? <>
            <strong className="credit-score-number" style={{ color }}>{result.score}</strong>
            <span className={`credit-score-rating ${result.band}`}>{result.rating} {result.trend === "improving" ? "↑" : result.trend === "declining" ? "↓" : ""}</span>
            <p className="small">{result.trendLabel}</p>
            <div className="credit-score-mini-stats">
              <span>On-time {result.summary.onTimeRate}%</span>
              <span>Late {result.summary.late}</span>
              <span>Missed {result.summary.missed}</span>
              <span>Overdue {money(result.summary.overdueAmount)}</span>
            </div>
            {result.accountScore && <p className="small">This {accountLabel || result.accountScore.kind} account: {result.accountScore.score} · {result.accountScore.rating}</p>}
          </> : <>
            <strong className="credit-score-number muted">Not Available</strong>
            <p className="copy">{result.title}</p>
            <p className="small">{result.message}</p>
          </>}
          <button type="button" className="btn" onClick={() => setOpen(true)}>View score details</button>
        </div>
      </div>
      {result.available && <div className="credit-score-why">
        {result.positives.slice(0, 3).map(item => <p key={item} className="credit-score-why-good">🟢 {item}</p>)}
        {result.negatives.slice(0, 2).map(item => <p key={item} className="credit-score-why-bad">🔴 {item}</p>)}
      </div>}
      <p className="small credit-score-disclaimer">Internal FinTrack assessment from recorded payments. Not a bureau score.</p>
    </section>
    {open && <CreditScoreDetails result={result} close={() => setOpen(false)} accountLabel={accountLabel} />}
  </>;
}
