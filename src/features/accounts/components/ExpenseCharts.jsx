import { useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { SegmentedControl } from "../../../components/ui.jsx";
import { axisMoney, money, niceStep, sharePercent } from "../accountsFormat.js";

// Spending going up is shown in red and going down in green.
export function ExpenseChange({ change, against }) {
  if (change == null) return null;
  const up = change > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const value = Math.abs(change) >= 100 ? Math.round(Math.abs(change)) : Math.abs(change);
  return <span className={`acc-exp-change ${change === 0 ? "is-flat" : up ? "is-up" : "is-down"}`}>
    {change !== 0 && <Icon size={14} aria-hidden="true" />}
    {change === 0 ? `Same as ${against || "before"}` : `${value}% ${up ? "higher" : "lower"}${against ? ` than ${against}` : ""}`}
  </span>;
}

const AGGREGATIONS = [{ id: "month", label: "Monthly" }, { id: "quarter", label: "Quarterly" }, { id: "year", label: "Yearly" }];
const TREND_TITLES = { month: "Monthly Expense Trends", quarter: "Quarterly Expense Trends", year: "Yearly Expense Trends" };
// Wide for desktop; the narrow one is taller with fewer labels so a phone can read it.
const TREND_LAYOUTS = [
  { id: "wide", w: 1000, h: 290, pad: { top: 24, right: 10, bottom: 30, left: 62 }, barMax: 40, values: true },
  { id: "narrow", w: 420, h: 300, pad: { top: 14, right: 6, bottom: 34, left: 64 }, barMax: 22, values: false },
];

function TrendPlot({ layout, rows, compare, hover, setHover, onPick, summary }) {
  const { w, h, pad } = layout;
  const peak = Math.max(0, ...rows.flatMap(row => [row.amount, compare ? row.previous || 0 : 0]));
  const step = niceStep(peak / 4);
  const top = Math.max(step, Math.ceil(peak / step) * step);
  const plotH = h - pad.top - pad.bottom;
  const y = value => pad.top + ((top - Math.max(0, value)) / top) * plotH;
  const ticks = [];
  for (let tick = 0; tick <= top + step / 2; tick += step) ticks.push(tick);
  const group = (w - pad.left - pad.right) / Math.max(1, rows.length);
  const barW = Math.min(layout.barMax, group * (compare ? 0.32 : 0.55));
  const center = index => pad.left + group * index + group / 2;
  const highlight = rows.some(row => row.selected) && !rows.every(row => row.selected || row.future);
  const active = hover == null ? null : rows[hover];
  const value = layout.values && !compare && rows.length <= 12;
  const initials = layout.id === "narrow" && rows.length > 8;
  const tipX = active ? center(hover) / w : 0;
  const tipY = active ? y(Math.max(active.amount, compare ? active.previous || 0 : 0)) / h : 0;
  const tipPlace = `${tipY < 0.35 ? " is-below" : ""}${tipX < 0.2 ? " is-start" : tipX > 0.8 ? " is-end" : ""}`;
  return <div className={`acc-exp-plot is-${layout.id}`}>
    <svg className="acc-exp-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={summary}>
      {ticks.map(tick => <g key={tick} className="acc-exp-gridline">
        <line x1={pad.left} x2={w - pad.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "zero" : ""} />
        <text x={pad.left - 8} y={y(tick)} dy="0.35em" textAnchor="end">{axisMoney(tick)}</text>
      </g>)}
      {rows.map((row, index) => {
        const x = compare ? center(index) + 1 : center(index) - barW / 2;
        const tone = `${row.selected ? " is-selected" : ""}${highlight && !row.selected ? " is-muted" : ""}${hover === index ? " is-hover" : ""}`;
        return <g key={row.key}>
          {compare && row.previous > 0 && <rect className="acc-exp-bar is-previous" x={center(index) - barW - 1} y={y(row.previous)} width={barW} height={Math.max(0, y(0) - y(row.previous))} rx="3" />}
          {row.amount > 0 && <rect className={`acc-exp-bar${tone}`} x={x} y={y(row.amount)} width={barW} height={Math.max(0, y(0) - y(row.amount))} rx="3" />}
          {value && row.amount > 0 && <text className="acc-exp-bar-value" x={center(index)} y={y(row.amount) - 6} textAnchor="middle">{axisMoney(row.amount)}</text>}
          <text className={`acc-exp-axis${row.selected && highlight ? " is-selected" : ""}${row.future ? " is-future" : ""}`} x={center(index)} y={h - 10} textAnchor="middle">{initials ? row.label.slice(0, 1) : row.label}</text>
          <rect
            className={`acc-exp-hit${onPick && !row.future ? " is-pickable" : ""}`}
            x={pad.left + group * index}
            y={pad.top}
            width={group}
            height={plotH}
            tabIndex={0}
            aria-label={`${row.longLabel}: ${money(row.amount)}`}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(index)}
            onBlur={() => setHover(null)}
            onClick={onPick && !row.future ? () => onPick(row) : undefined}
            onKeyDown={event => { if (onPick && !row.future && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onPick(row); } }}
          />
        </g>;
      })}
    </svg>
    {active && <div
      className={`acc-exp-tip${tipPlace}`}
      style={{ left: `${tipX * 100}%`, top: `${tipY * 100}%` }}
      role="status"
    >
      <strong>{active.longLabel}</strong>
      <span>{active.future ? "Not reached yet" : `Expenses ${money(active.amount)}`}</span>
      {active.previous > 0 && !active.future && <span className="small">A year earlier {money(active.previous)}</span>}
      {active.previous > 0 && !active.future && <ExpenseChange change={Math.round(((active.amount - active.previous) / active.previous) * 1000) / 10} against="a year earlier" />}
      {active.partial && <span className="small">Month to date</span>}
    </div>}
  </div>;
}

export function ExpenseTrendChart({ rows, aggregation, onAggregation, compare, onCompare, scopeLabel, insight, onPick, loading }) {
  const [hover, setHover] = useState(null);
  const canCompare = aggregation !== "year" && rows.some(row => row.previous > 0);
  const showCompare = compare && canCompare;
  const hasData = rows.some(row => row.amount || row.previous);
  const summary = `${TREND_TITLES[aggregation]}. ${rows.map(row => `${row.longLabel} ${money(row.amount)}`).join("; ")}`;
  return <section className="card acc-exp-card acc-exp-trend" aria-label={TREND_TITLES[aggregation]}>
    <header className="acc-exp-card-head">
      <div>
        <h2>{TREND_TITLES[aggregation]}</h2>
        <p className="small">{scopeLabel}{onPick && aggregation === "month" ? " · tap a month to see it" : ""}</p>
      </div>
      <div className="acc-exp-trend-controls">
        <SegmentedControl label="Group the trend by" className="acc-exp-seg" options={AGGREGATIONS} value={aggregation} onChange={next => { setHover(null); onAggregation(next); }} />
        {aggregation !== "year" && <label className={`acc-exp-toggle${canCompare ? "" : " is-disabled"}`} title={canCompare ? "" : "No expenses a year earlier to compare"}>
          <input type="checkbox" checked={showCompare} disabled={!canCompare} onChange={event => onCompare(event.target.checked)} />
          <span>Compare with last year</span>
        </label>}
      </div>
    </header>
    {showCompare && <div className="acc-exp-legend" aria-hidden="true">
      <span><i className="is-current" /> This period</span>
      <span><i className="is-previous" /> A year earlier</span>
    </div>}
    {loading ? <div className="acc-exp-skeleton" aria-hidden="true" /> : hasData
      ? TREND_LAYOUTS.map(layout => <TrendPlot key={layout.id} layout={layout} rows={rows} compare={showCompare} hover={hover} setHover={setHover} onPick={aggregation === "month" ? onPick : null} summary={summary} />)
      : <p className="acc-exp-empty">No expenses posted in {scopeLabel} yet.</p>}
    {insight && <p className="acc-exp-insight">
      {insight.month} expenses were {money(insight.amount)}, {insight.change === 0
        ? `the same as ${insight.previousMonth}`
        : <ExpenseChange change={insight.change} against={`${insight.previousMonth} (${money(insight.previous)})`} />}.
    </p>}
  </section>;
}

const R = 58;
const CIRC = 2 * Math.PI * R;
const SLICES = 6;

export function ExpenseCategoryDonut({ categories, total, selectedId, onSelect }) {
  const positive = categories.filter(category => category.amount > 0);
  const sum = positive.reduce((acc, category) => acc + category.amount, 0);
  const shown = positive.slice(0, SLICES);
  const rest = positive.slice(SLICES);
  const slices = shown.map(category => ({ ...category, share: sum ? category.amount / sum : 0 }));
  if (rest.length) {
    const amount = rest.reduce((acc, category) => acc + category.amount, 0);
    slices.push({ id: "", name: `${rest.length} more`, amount, share: sum ? amount / sum : 0, count: rest.reduce((acc, category) => acc + category.count, 0), other: true });
  }
  const starts = slices.map((_, index) => slices.slice(0, index).reduce((acc, slice) => acc + slice.share * CIRC, 0));
  const selected = categories.find(category => category.id === selectedId);
  return <section className="card acc-exp-card acc-exp-donut-card" aria-label="Expenses by category">
    <header className="acc-exp-card-head">
      <div>
        <h2>Expenses by Category</h2>
        <p className="small">{selected ? `Showing ${selected.name} · tap it again to see all` : "Share of spending · tap a category to filter"}</p>
      </div>
    </header>
    {slices.length ? <div className="acc-exp-donut-body">
      <svg className="acc-exp-donut" viewBox="0 0 160 160" role="img" aria-label={`Expenses ${money(total)}: ${slices.map(slice => `${slice.name} ${money(slice.amount)}`).join(", ")}`}>
        <circle cx="80" cy="80" r={R} className="acc-exp-donut-track" />
        {slices.map((slice, index) => <circle
          key={slice.id || "other"}
          cx="80"
          cy="80"
          r={R}
          className={`acc-exp-slice slice-${slice.other ? "other" : index}${selectedId && slice.id !== selectedId ? " is-muted" : ""}`}
          strokeDasharray={`${Math.max(0, slice.share * CIRC - (slices.length > 1 ? 1.5 : 0))} ${CIRC}`}
          strokeDashoffset={-starts[index]}
          transform="rotate(-90 80 80)"
          onClick={slice.other ? undefined : () => onSelect(slice.id === selectedId ? "" : slice.id)}
        ><title>{`${slice.name} · ${money(slice.amount)} · ${sharePercent(slice.share)}`}</title></circle>)}
        <text x="80" y="76" textAnchor="middle" className="acc-exp-donut-total">{axisMoney(selected ? selected.amount : sum)}</text>
        <text x="80" y="94" textAnchor="middle" className="acc-exp-donut-caption">{selected ? "selected" : "total"}</text>
      </svg>
      <ul className="acc-exp-legend-list">
        {slices.map((slice, index) => <li key={slice.id || "other"}>
          <button
            type="button"
            className={`acc-exp-legend-item${slice.id && slice.id === selectedId ? " is-active" : ""}${selectedId && slice.id !== selectedId ? " is-muted" : ""}`}
            disabled={slice.other}
            aria-pressed={slice.other ? undefined : slice.id === selectedId}
            onClick={() => onSelect(slice.id === selectedId ? "" : slice.id)}
          >
            <i className={`slice-${slice.other ? "other" : index}`} aria-hidden="true" />
            <span className="name">{slice.name}<em>{slice.count} {slice.count === 1 ? "entry" : "entries"}</em></span>
            <span className="amount">{money(slice.amount)}</span>
            <span className="share">{sharePercent(slice.share)}</span>
          </button>
        </li>)}
      </ul>
    </div> : <p className="acc-exp-empty">No expenses in this period.</p>}
  </section>;
}

const RANKED = 8;

// Categories ranked by spend, each with the earlier period beneath it when there is one to compare.
export function ExpenseCategoryBars({ categories, canCompare, previousLabel, selectedId, onSelect }) {
  const rows = categories.filter(category => category.amount > 0 || (canCompare && category.previous > 0)).slice(0, RANKED);
  const peak = Math.max(1, ...rows.flatMap(row => [row.amount, canCompare ? row.previous : 0]));
  const hidden = categories.filter(category => category.amount > 0).length - rows.filter(row => row.amount > 0).length;
  return <section className="card acc-exp-card acc-exp-rank" aria-label="Expense breakdown by category">
    <header className="acc-exp-card-head">
      <div>
        <h2>Expense Breakdown by Category</h2>
        <p className="small">{canCompare ? `Highest first, against ${previousLabel}` : "Highest first · no earlier period with expenses to compare"}</p>
      </div>
      {canCompare && <div className="acc-exp-legend" aria-hidden="true">
        <span><i className="is-current" /> This period</span>
        <span><i className="is-previous" /> {previousLabel}</span>
      </div>}
    </header>
    {rows.length ? <ol className="acc-exp-rank-list">
      {rows.map(row => <li key={row.id}>
        <button
          type="button"
          className={`acc-exp-rank-row${row.id === selectedId ? " is-active" : ""}${selectedId && row.id !== selectedId ? " is-muted" : ""}`}
          aria-pressed={row.id === selectedId}
          onClick={() => onSelect(row.id === selectedId ? "" : row.id)}
        >
          <span className="acc-exp-rank-top">
            <span className="name">{row.name}</span>
            <span className="amount">{money(row.amount)}</span>
          </span>
          <span className="acc-exp-rank-track"><span className="is-current" style={{ width: `${(Math.max(0, row.amount) / peak) * 100}%` }} /></span>
          {canCompare && <span className="acc-exp-rank-track is-thin"><span className="is-previous" style={{ width: `${(Math.max(0, row.previous) / peak) * 100}%` }} /></span>}
          {canCompare && <span className="acc-exp-rank-foot">
            <span className="small">{money(row.previous)} before</span>
            {row.previous > 0 ? <ExpenseChange change={row.change} /> : row.amount > 0 ? <span className="acc-exp-change is-new">New this period</span> : null}
          </span>}
        </button>
      </li>)}
    </ol> : <p className="acc-exp-empty">No expenses in this period.</p>}
    {hidden > 0 && <p className="small acc-exp-rank-more">{hidden} smaller {hidden === 1 ? "category is" : "categories are"} in the category filter.</p>}
  </section>;
}
