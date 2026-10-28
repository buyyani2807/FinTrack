import { useId } from "react";
import { axisMoney } from "../accounts/accountsFormat.js";

function readColor(token, fallback) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || fallback;
}

function useChartColors() {
  return {
    primary: readColor("--ft-primary", "currentColor"),
    info: readColor("--ft-info", "currentColor"),
    success: readColor("--ft-success", "currentColor"),
    danger: readColor("--ft-danger", "currentColor"),
    muted: readColor("--ft-muted", "currentColor"),
    border: readColor("--ft-border", "currentColor"),
  };
}

/** Simple horizontal comparison bars (two or few values). */
export function CompareBars({ title, items = [], ariaLabel }) {
  const colors = useChartColors();
  const max = Math.max(1, ...items.map(item => Math.abs(Number(item.value) || 0)));
  const palette = [colors.primary, colors.info, colors.success, colors.danger];
  return (
    <div className="ft-report-chart">
      {title ? <h3>{title}</h3> : null}
      <svg viewBox="0 0 320 120" role="img" aria-label={ariaLabel || title || "Comparison chart"}>
        {items.map((item, index) => {
          const y = 18 + index * 28;
          const width = Math.max(2, (Math.abs(Number(item.value) || 0) / max) * 200);
          return (
            <g key={item.label}>
              <text className="ft-report-bar-label" x="0" y={y} dy="0.35em">{item.label}</text>
              <rect x="96" y={y - 8} width={width} height="16" rx="4" fill={palette[index % palette.length]} />
              <text className="ft-report-bar-value" x={104 + width} y={y} dy="0.35em">{axisMoney(item.value)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Vertical bars for a short series (e.g. ageing buckets). */
export function BucketBars({ title, items = [], ariaLabel }) {
  const colors = useChartColors();
  const w = 320;
  const h = 140;
  const pad = { top: 16, right: 8, bottom: 28, left: 8 };
  const max = Math.max(1, ...items.map(item => Math.abs(Number(item.value) || 0)));
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const group = plotW / Math.max(1, items.length);
  const barW = Math.min(36, group * 0.55);
  return (
    <div className="ft-report-chart">
      {title ? <h3>{title}</h3> : null}
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel || title || "Bar chart"}>
        {items.map((item, index) => {
          const value = Math.abs(Number(item.value) || 0);
          const barH = (value / max) * plotH;
          const x = pad.left + group * index + (group - barW) / 2;
          const y = pad.top + plotH - barH;
          return (
            <g key={item.label}>
              <rect x={x} y={y} width={barW} height={Math.max(0, barH)} rx="3" fill={item.tone === "bad" ? colors.danger : colors.primary} />
              <text className="ft-report-bar-label" x={x + barW / 2} y={h - 8} textAnchor="middle">{item.label}</text>
            </g>
          );
        })}
      </svg>
      <p className="ft-report-chart-legend">
        {items.map(item => (
          <span key={item.label}>{item.label}: {axisMoney(item.value)}</span>
        ))}
      </p>
    </div>
  );
}

/** Two-slice donut for current vs overdue (or similar). */
export function TwinDonut({ title, primary, secondary, primaryLabel, secondaryLabel, ariaLabel }) {
  const colors = useChartColors();
  const uid = useId();
  const a = Math.max(0, Number(primary) || 0);
  const b = Math.max(0, Number(secondary) || 0);
  const total = a + b;
  const r = 42;
  const c = 2 * Math.PI * r;
  const aLen = total > 0 ? (a / total) * c : 0;
  return (
    <div className="ft-report-chart">
      {title ? <h3>{title}</h3> : null}
      <svg viewBox="0 0 160 120" role="img" aria-label={ariaLabel || title || "Donut chart"}>
        <circle cx="60" cy="60" r={r} fill="none" stroke={colors.border} strokeWidth="14" />
        {total > 0 ? (
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={colors.success}
            strokeWidth="14"
            strokeDasharray={`${aLen} ${c - aLen}`}
            strokeDashoffset={c / 4}
            transform="rotate(-90 60 60)"
          />
        ) : null}
        {total > 0 && b > 0 ? (
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={colors.danger}
            strokeWidth="14"
            strokeDasharray={`${(b / total) * c} ${c - (b / total) * c}`}
            strokeDashoffset={c / 4 - aLen}
            transform="rotate(-90 60 60)"
          />
        ) : null}
        <text x="60" y="56" textAnchor="middle" className="ft-report-bar-value">{axisMoney(total)}</text>
        <text x="60" y="72" textAnchor="middle" className="ft-report-bar-label">total</text>
        <g aria-hidden="true">
          <rect id={`${uid}-a`} x="118" y="36" width="8" height="8" fill={colors.success} rx="1" />
          <rect id={`${uid}-b`} x="118" y="58" width="8" height="8" fill={colors.danger} rx="1" />
        </g>
        <text x="130" y="43" className="ft-report-bar-label">{primaryLabel}</text>
        <text x="130" y="65" className="ft-report-bar-label">{secondaryLabel}</text>
      </svg>
    </div>
  );
}

/** Composition list as stacked horizontal share (assets vs liabilities). */
export function ShareStack({ title, left, right, leftLabel, rightLabel, ariaLabel }) {
  const colors = useChartColors();
  const a = Math.max(0, Number(left) || 0);
  const b = Math.max(0, Number(right) || 0);
  const total = a + b || 1;
  const aPct = (a / total) * 100;
  return (
    <div className="ft-report-chart">
      {title ? <h3>{title}</h3> : null}
      <svg viewBox="0 0 320 72" role="img" aria-label={ariaLabel || title || "Composition"}>
        <rect x="16" y="24" width="288" height="18" rx="6" fill={colors.border} />
        <rect x="16" y="24" width={Math.max(0, (288 * aPct) / 100)} height="18" rx="6" fill={colors.primary} />
        <text className="ft-report-bar-label" x="16" y="58">{leftLabel}: {axisMoney(a)}</text>
        <text className="ft-report-bar-label" x="304" y="58" textAnchor="end">{rightLabel}: {axisMoney(b)}</text>
      </svg>
    </div>
  );
}
