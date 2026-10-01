import { SegmentedControl } from "../../../components/ui.jsx";
import { PERIOD_OPTIONS } from "../cashbookConfig.js";

export function PeriodPills({ period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo }) {
  return <div className="accounts-period-bar">
    <SegmentedControl label="Period" options={PERIOD_OPTIONS} value={period} onChange={setPeriod} className="cashbook-period" />
    {period === "custom" && <div className="accounts-custom-range">
      <input type="date" aria-label="From date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} />
      <span className="small">to</span>
      <input type="date" aria-label="To date" value={customTo} onChange={event => setCustomTo(event.target.value)} />
    </div>}
  </div>;
}
