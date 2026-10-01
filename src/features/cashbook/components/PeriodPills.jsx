import { PERIOD_OPTIONS } from "../cashbookConfig.js";

export function PeriodPills({ period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo }) {
  return <div className="accounts-period-bar">
    <div className="accounts-period-pills">
      {PERIOD_OPTIONS.map(item => (
        <button
          key={item.id}
          type="button"
          className={`btn tab accounts-period-pill ${period === item.id ? "active" : ""}`}
          onClick={() => setPeriod(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
    {period === "custom" && <div className="accounts-custom-range">
      <input type="date" aria-label="From date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} />
      <span className="small">to</span>
      <input type="date" aria-label="To date" value={customTo} onChange={event => setCustomTo(event.target.value)} />
    </div>}
  </div>;
}
