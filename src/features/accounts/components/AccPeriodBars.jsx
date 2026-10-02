import { useState } from "react";
import { SegmentedControl } from "../../../components/ui.jsx";
import { formatOverviewDate } from "../accountsFormat.js";

export function AccOverviewContextBar({ fy, lastFy, from, to, onChange, equationHolds, integrationEnabled }) {
  const thisFy = from === fy.from && to === fy.to;
  const prevFy = from === lastFy.from && to === lastFy.to;
  const [customOpen, setCustomOpen] = useState(false);
  const mode = customOpen || (!thisFy && !prevFy) ? "custom" : thisFy ? "this" : "last";

  const setMode = next => {
    if (next === "this") {
      setCustomOpen(false);
      onChange(fy.from, fy.to);
      return;
    }
    if (next === "last") {
      setCustomOpen(false);
      onChange(lastFy.from, lastFy.to);
      return;
    }
    setCustomOpen(true);
  };

  return (
    <section className="acc-ov-context" aria-label="Overview reporting window">
      <div className="acc-ov-context-main">
        <div className="acc-ov-context-period">
          <span className="acc-ov-context-kicker">Report period</span>
          <SegmentedControl
            label="Report period"
            className="acc-ov-period"
            options={[{ id: "this", label: fy.label }, { id: "last", label: lastFy.label }, { id: "custom", label: "Custom" }]}
            value={mode}
            onChange={setMode}
          />
        </div>

        <div className="acc-ov-context-dates" aria-live="polite">
          <span className="acc-ov-context-kicker">Date range</span>
          <strong>
            <time dateTime={from}>{formatOverviewDate(from)}</time>
            <span className="acc-ov-context-arrow" aria-hidden="true">→</span>
            <time dateTime={to}>{formatOverviewDate(to)}</time>
          </strong>
        </div>

        <div className="acc-ov-context-status" aria-label="Books status">
          <span
            className={`acc-chip ${equationHolds ? "ok" : "warn"}`}
            title={equationHolds ? "Assets equal liabilities plus equity for these books." : "Assets do not equal liabilities plus equity. Check recent vouchers."}
          >
            <span className="acc-chip-dot" aria-hidden="true" />
            {equationHolds ? "Books balanced" : "Out of balance"}
          </span>
          <span
            className={`acc-chip ${integrationEnabled ? "info" : ""}`}
            title={integrationEnabled
              ? "Daily, Monthly, Chit, and Cashbook can sync into the primary Accounts company."
              : "Accounts stays independent. Finance modules are not syncing into these books."}
          >
            {integrationEnabled ? "Finance sync on" : "Finance sync off"}
          </span>
        </div>
      </div>

      {mode === "custom" && (
        <div className="acc-ov-context-custom">
          <label className="acc-ov-period-field">
            <span>From</span>
            <input type="date" value={from} onChange={event => onChange(event.target.value, to)} />
          </label>
          <label className="acc-ov-period-field">
            <span>To</span>
            <input type="date" value={to} onChange={event => onChange(from, event.target.value)} />
          </label>
        </div>
      )}
    </section>
  );
}
export function ReportRangeBar({ fy, lastFy, from, to, onChange }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const thisFy = from === fy.from && to === fy.to;
  const prevFy = from === lastFy.from && to === lastFy.to;
  // One row on wide screens: quick period, the two dates, and a short note. On phones it opens as a bottom sheet.
  const body = (
    <>
      <div className="acc-range-row">
        <SegmentedControl
          label="Report period"
          className="acc-range-quick"
          options={[{ id: "this", label: "This FY" }, { id: "last", label: "Last FY" }]}
          value={thisFy ? "this" : prevFy ? "last" : ""}
          onChange={id => (id === "this" ? onChange(fy.from, fy.to) : onChange(lastFy.from, lastFy.to))}
        />
        <div className="accounts-custom-range">
          <label className="accounts-filter-field"><span className="small">From</span>
            <input type="date" value={from} onChange={event => onChange(event.target.value, to)} />
          </label>
          <label className="accounts-filter-field"><span className="small">To</span>
            <input type="date" value={to} onChange={event => onChange(from, event.target.value)} />
          </label>
        </div>
        <p className="small acc-range-note">Changing the dates never rewrites posted vouchers.</p>
      </div>
      <button type="button" className="btn primary acc-filter-done" onClick={() => setFiltersOpen(false)}>Done</button>
    </>
  );
  return (
    <div className={`card accounts-filter-card acc-report-filters-wrap${filtersOpen ? " is-open" : ""}`}>
      <div className="acc-filter-summary">
        <div>
          <span className="acc-filter-summary-label">Period</span>
          <strong className="acc-filter-summary-value">{from} → {to}</strong>
        </div>
        <button type="button" className="btn" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}>
          Filters{thisFy || prevFy ? " (1)" : " (2)"}
        </button>
      </div>
      <div className="acc-filter-body">{body}</div>
      {filtersOpen ? <button type="button" className="acc-filter-sheet-bg" aria-label="Close filters" onClick={() => setFiltersOpen(false)} /> : null}
    </div>
  );
}
