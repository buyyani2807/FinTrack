import { money } from "../accountsFormat.js";

const axisMoney = value => {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  const trim = text => text.replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
  if (abs >= 10000000) return `₹${trim((n / 10000000).toFixed(1))}Cr`;
  if (abs >= 100000) return `₹${trim((n / 100000).toFixed(1))}L`;
  if (abs >= 1000) return `₹${trim((n / 1000).toFixed(1))}K`;
  return `₹${n}`;
};

const niceStep = raw => {
  if (raw <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(factor => factor * power).find(step => step >= raw);
};

const W = 640;
const H = 260;
const PAD = { top: 14, right: 12, bottom: 30, left: 58 };

export function AccMonthlyChart({ rows = [], onOpenPnl }) {
  const hasData = rows.some(row => row.income || row.expenses);
  const values = rows.flatMap(row => [row.income, Math.max(0, row.expenses), row.net]);
  const step = niceStep((Math.max(0, ...values) - Math.min(0, ...values)) / 4);
  const top = Math.max(step, Math.ceil(Math.max(0, ...values) / step) * step);
  const bottom = Math.floor(Math.min(0, ...values) / step) * step;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const y = value => PAD.top + ((top - value) / (top - bottom)) * plotH;
  const ticks = [];
  for (let tick = bottom; tick <= top + step / 2; tick += step) ticks.push(tick);
  const group = rows.length ? plotW / rows.length : plotW;
  const barW = Math.min(30, group * 0.3);
  const center = index => PAD.left + group * index + group / 2;
  const netPoints = rows.map((row, index) => `${center(index)},${y(row.net)}`).join(" ");
  const summary = rows.map(row => `${row.label}: income ${money(row.income)}, expenses ${money(row.expenses)}, net ${money(row.net)}`).join("; ");

  return <section className="card acc-ov-trend" aria-label="Monthly overview">
    <header className="acc-ov-chart-head">
      <div>
        <strong>Monthly overview</strong>
        <p className="small">Income and expenses for the last {rows.length} months, with net profit</p>
      </div>
      {onOpenPnl && <button type="button" className="acc-ov-link-btn" onClick={onOpenPnl}>Open P&amp;L</button>}
    </header>
    <div className="acc-ov-legend" aria-hidden="true">
      <span><i className="income" /> Income</span>
      <span><i className="expenses" /> Expenses</span>
      <span><i className="net" /> Net</span>
    </div>
    {hasData ? <svg className="acc-ov-trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Monthly income, expenses, and net. ${summary}`}>
      {ticks.map(tick => <g key={tick} className="acc-ov-grid">
        <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "zero" : ""} />
        <text x={PAD.left - 8} y={y(tick)} dy="0.35em" textAnchor="end">{axisMoney(tick)}</text>
      </g>)}
      {rows.map((row, index) => {
        const expenses = Math.max(0, row.expenses);
        return <g key={row.month}>
          <rect className="acc-ov-bar income" x={center(index) - barW - 2} y={y(Math.max(0, row.income))} width={barW} height={Math.max(0, y(0) - y(Math.max(0, row.income)))} rx="3">
            <title>{`${row.label} · Income ${money(row.income)}`}</title>
          </rect>
          <rect className="acc-ov-bar expenses" x={center(index) + 2} y={y(expenses)} width={barW} height={Math.max(0, y(0) - y(expenses))} rx="3">
            <title>{`${row.label} · Expenses ${money(row.expenses)}`}</title>
          </rect>
          <text className="acc-ov-axis-label" x={center(index)} y={H - 8} textAnchor="middle">{row.label}</text>
        </g>;
      })}
      <polyline className="acc-ov-net-line" points={netPoints} />
      {rows.map((row, index) => <circle key={row.month} className="acc-ov-net-dot" cx={center(index)} cy={y(row.net)} r="4">
        <title>{`${row.label} · Net ${money(row.net)}`}</title>
      </circle>)}
    </svg> : <p className="acc-ov-chart-empty">No income or expenses posted in these months yet.</p>}
  </section>;
}

const AGE_BUCKETS = [
  { id: "current", label: "Not yet due", short: "Not due" },
  { id: "d1_30", label: "1–30 days", short: "1–30" },
  { id: "d31_60", label: "31–60 days", short: "31–60" },
  { id: "d61_90", label: "61–90 days", short: "61–90" },
  { id: "d90", label: "90+ days", short: "90+" },
];
// Wide for desktop; the narrow one is taller with short labels so a phone can read it.
const AGE_LAYOUTS = [
  { id: "wide", w: 900, h: 230, pad: { top: 22, right: 12, bottom: 30, left: 58 }, barMax: 44, short: false, values: true },
  { id: "narrow", w: 420, h: 300, pad: { top: 14, right: 6, bottom: 34, left: 64 }, barMax: 26, short: true, values: false },
];
const ageAmount = (aging, id) => Math.max(0, Number(aging?.[id] || 0));

function AgingBars({ layout, ar, ap, onReceivables, onPayables, summary }) {
  const { w, h, pad } = layout;
  const peak = Math.max(0, ...AGE_BUCKETS.flatMap(bucket => [ageAmount(ar, bucket.id), ageAmount(ap, bucket.id)]));
  const step = niceStep(peak / 4);
  const top = Math.max(step, Math.ceil(peak / step) * step);
  const plotH = h - pad.top - pad.bottom;
  const y = value => pad.top + ((top - value) / top) * plotH;
  const ticks = [];
  for (let tick = 0; tick <= top + step / 2; tick += step) ticks.push(tick);
  const group = (w - pad.left - pad.right) / AGE_BUCKETS.length;
  const barW = Math.min(layout.barMax, group * 0.3);
  const center = index => pad.left + group * index + group / 2;
  const bar = (kind, bucket, index) => {
    const value = ageAmount(kind === "ar" ? ar : ap, bucket.id);
    const x = kind === "ar" ? center(index) - barW - 2 : center(index) + 2;
    const who = kind === "ar" ? "Customers owe you" : "You owe suppliers";
    return <g key={kind}>
      <rect className={`acc-ov-bar ${kind}`} x={x} y={y(value)} width={barW} height={Math.max(0, y(0) - y(value))} rx="3" onClick={value > 0 ? (kind === "ar" ? onReceivables : onPayables) : undefined}>
        <title>{`${bucket.label} · ${who} ${money(value)}`}</title>
      </rect>
      {layout.values && value > 0 && <text className="acc-ov-bar-value" x={x + barW / 2} y={y(value) - 6} textAnchor="middle">{axisMoney(value)}</text>}
    </g>;
  };
  return <svg className={`acc-ov-trend-svg acc-ov-arap-svg is-${layout.id}`} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Receivables and payables by age. ${summary}`}>
    {ticks.map(tick => <g key={tick} className="acc-ov-grid">
      <line x1={pad.left} x2={w - pad.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "zero" : ""} />
      <text x={pad.left - 8} y={y(tick)} dy="0.35em" textAnchor="end">{axisMoney(tick)}</text>
    </g>)}
    {AGE_BUCKETS.map((bucket, index) => {
      const overdue = bucket.id !== "current" && ageAmount(ar, bucket.id) + ageAmount(ap, bucket.id) > 0;
      return <g key={bucket.id}>
        {bar("ar", bucket, index)}
        {bar("ap", bucket, index)}
        <text className={`acc-ov-axis-label${overdue ? " is-overdue" : ""}`} x={center(index)} y={h - 10} textAnchor="middle">{layout.short ? bucket.short : bucket.label}</text>
      </g>;
    })}
  </svg>;
}

// What customers owe and what is owed to suppliers, side by side for each age of the unpaid amount.
export function AccArApAgingChart({ ar, ap, onReceivables, onPayables }) {
  const arTotal = Number(ar?.total || 0);
  const apTotal = Number(ap?.total || 0);
  const hasData = arTotal > 0 || apTotal > 0;
  const summary = AGE_BUCKETS.map(bucket => `${bucket.label}: receivables ${money(ageAmount(ar, bucket.id))}, payables ${money(ageAmount(ap, bucket.id))}`).join("; ");

  return <section className="card acc-ov-chart acc-ov-arap" aria-label="Receivables and payables by age">
    <header className="acc-ov-chart-head">
      <div>
        <strong>Receivables & payables</strong>
        <p className="small">What customers owe you and what you owe suppliers, by how long it is unpaid</p>
      </div>
    </header>
    <div className="acc-ov-arap-totals">
      <button type="button" className="acc-ov-arap-total ar" onClick={onReceivables}>
        <span><i aria-hidden="true" /> Customers owe you</span>
        <strong>{money(arTotal)}</strong>
        <em className={Number(ar?.overdue) > 0 ? "is-due" : ""}>{Number(ar?.overdue) > 0 ? `${money(ar.overdue)} overdue` : "Nothing overdue"}</em>
      </button>
      <button type="button" className="acc-ov-arap-total ap" onClick={onPayables}>
        <span><i aria-hidden="true" /> You owe suppliers</span>
        <strong>{money(apTotal)}</strong>
        <em className={Number(ap?.overdue) > 0 ? "is-due" : ""}>{Number(ap?.overdue) > 0 ? `${money(ap.overdue)} overdue` : "Nothing overdue"}</em>
      </button>
    </div>
    {hasData
      ? AGE_LAYOUTS.map(layout => <AgingBars key={layout.id} layout={layout} ar={ar} ap={ap} onReceivables={onReceivables} onPayables={onPayables} summary={summary} />)
      : <p className="acc-ov-chart-empty">No unpaid invoices or bills in this period.</p>}
  </section>;
}

const percent = share => (share > 0 && share < 0.005 ? "<1%" : `${Math.round(share * 100)}%`);

const R = 58;
const CIRC = 2 * Math.PI * R;

export function AccSpendingDonut({ breakdown, onOpenPnl, onOpenReview }) {
  const slices = breakdown?.slices || [];
  const starts = slices.map((_, index) => slices.slice(0, index).reduce((sum, slice) => sum + slice.share * CIRC, 0));
  return <section className="card acc-ov-spend" aria-label="Spending analysis">
    <header className="acc-ov-chart-head">
      <div>
        <strong>Spending analysis</strong>
        <p className="small">Top expense ledgers in this period</p>
      </div>
    </header>
    {slices.length ? <>
      <div className="acc-ov-spend-body">
        <svg className="acc-ov-donut" viewBox="0 0 160 160" role="img" aria-label={`Expenses ${money(breakdown.total)}: ${slices.map(slice => `${slice.name} ${money(slice.amount)}`).join(", ")}`}>
          <circle cx="80" cy="80" r={R} className="acc-ov-donut-track" />
          {slices.map((slice, index) => <circle
            key={slice.id}
            cx="80"
            cy="80"
            r={R}
            className={`acc-ov-donut-slice slice-${index}`}
            strokeDasharray={`${Math.max(0, slice.share * CIRC - (slices.length > 1 ? 1.5 : 0))} ${CIRC}`}
            strokeDashoffset={-starts[index]}
            transform="rotate(-90 80 80)"
          ><title>{`${slice.name} · ${money(slice.amount)} · ${percent(slice.share)}`}</title></circle>)}
          <text x="80" y="76" textAnchor="middle" className="acc-ov-donut-total">{axisMoney(breakdown.total)}</text>
          <text x="80" y="94" textAnchor="middle" className="acc-ov-donut-caption">expenses</text>
        </svg>
        <ul className="acc-ov-spend-legend">
          {slices.map((slice, index) => <li key={slice.id}>
            <i className={`slice-${index}`} aria-hidden="true" />
            <span className="name">{slice.name}</span>
            <span className="amount">{money(slice.amount)}</span>
            <span className="share">{percent(slice.share)}</span>
          </li>)}
        </ul>
      </div>
      {breakdown.purchases > 0 && <p className="small acc-ov-spend-note">Stock purchases of {money(breakdown.purchases)} are not included.</p>}
    </> : <p className="acc-ov-chart-empty">No expenses posted in this period yet.</p>}
    <div className="acc-ov-spend-actions">
      {onOpenPnl && <button type="button" className="acc-ov-link-btn" onClick={onOpenPnl}>Open P&amp;L</button>}
      {onOpenReview && <button type="button" className="acc-ov-link-btn" onClick={onOpenReview}>Expense review</button>}
    </div>
  </section>;
}
