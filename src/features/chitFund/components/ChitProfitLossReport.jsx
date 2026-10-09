import { useMemo, useState } from "react";
import { Select } from "../../../components/Select.jsx";
import { Button, Field, Metric } from "../../../components/ui.jsx";
import { CHIT_TYPES } from "../model/fixedChit.js";
import { money } from "../model/chitFormat.js";
import { buildChitProfitAndLoss, currentFinancialYearStart, financialYearBounds } from "../model/chitProfitAndLoss.js";

const TYPE_OPTIONS = [
  ["", "All types"],
  [CHIT_TYPES.AUCTION, "Auction"],
  [CHIT_TYPES.FIXED, "Fixed"],
  [CHIT_TYPES.FIXED_PREDEFINED_BID, "Fixed Predefined Bid"],
];

function moneyOrDash(entry) {
  if (!entry || entry.status === "unavailable" || entry.status === "insufficient" || entry.amount == null) return "—";
  return money(entry.amount);
}

export function ChitProfitLossReport({ schemes = [], cycles = [], fixedLifts = [], predefinedSchedule = [], enrollments = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultYear = currentFinancialYearStart(today);
  const [schemeId, setSchemeId] = useState("");
  const [chitType, setChitType] = useState("");
  const [financialYear, setFinancialYear] = useState(String(defaultYear));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [memberId, setMemberId] = useState("");
  const years = [defaultYear - 2, defaultYear - 1, defaultYear];
  const members = enrollments.filter(item => !schemeId || item.scheme_id === schemeId);
  const report = useMemo(() => buildChitProfitAndLoss({
    schemes, cycles, fixedLifts, predefinedSchedule,
    filters: {
      schemeId, chitType, financialYear: financialYear || "", from, to, month, status, memberId,
    },
  }), [schemes, cycles, fixedLifts, predefinedSchedule, schemeId, chitType, financialYear, from, to, month, status, memberId]);
  const fy = financialYearBounds(financialYear);

  return <div className="card spacer">
    <strong>Chit Fund Profit &amp; Loss</strong>
    <p className="copy">Commission recorded on settled auction months and completed lifts. This report is separate from Accounts Profit &amp; Loss and from the operational Profit &amp; Loss.</p>
    <div className="form spacer">
      <Field label="Scheme"><Select value={schemeId} onChange={event => { setSchemeId(event.target.value); setMemberId(""); }}><option value="">All schemes</option>{schemes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field label="Chit Fund type"><Select value={chitType} onChange={event => setChitType(event.target.value)}>{TYPE_OPTIONS.map(([id, label]) => <option key={id || "all"} value={id}>{label}</option>)}</Select></Field>
      <Field label="Financial year"><Select value={financialYear} onChange={event => setFinancialYear(event.target.value)}><option value="">Custom dates</option>{years.map(year => <option key={year} value={year}>{financialYearBounds(year).label}</option>)}</Select></Field>
      <Field label="From"><input type="date" value={fy ? fy.from : from} disabled={Boolean(fy)} onChange={event => setFrom(event.target.value)} /></Field>
      <Field label="To"><input type="date" value={fy ? fy.to : to} disabled={Boolean(fy)} onChange={event => setTo(event.target.value)} /></Field>
      <Field label="Month"><input type="number" min="1" value={month} onChange={event => setMonth(event.target.value)} placeholder="All" /></Field>
      <Field label="Status"><Select value={status} onChange={event => setStatus(event.target.value)}><option value="">Any status</option><option value="draft">Draft</option><option value="active">Active</option><option value="closed">Completed</option></Select></Field>
      <Field label="Member"><Select value={memberId} onChange={event => setMemberId(event.target.value)}><option value="">All members</option>{members.map(item => <option key={item.id} value={item.id}>{item.chit_members?.full_name || "Member"} · Ticket {item.ticket_number}</option>)}</Select></Field>
    </div>
    <div className="grid metrics spacer">
      <Metric label="Gross income" value={moneyOrDash(report.grossIncome)} color="green" />
      <Metric label="Expenses" value="Unavailable" color="gold" />
      <Metric label="Net result" value="Unavailable" />
    </div>
    <p className="small">Commission income: {report.income.commission == null ? "Insufficient data" : money(report.income.commission)}. {report.expenses.reason}</p>
    <p className="small">{report.net.reason}</p>
    <p className="small">{report.dividends.note} {report.dividends.amount == null ? "" : `Recorded dividends: ${money(report.dividends.amount)}.`} {report.dividends.missing ? `${report.dividends.missing} month(s) have no dividend amount.` : ""}</p>
    <p className="small">{report.collections.reason}</p>
    {report.insufficient.length > 0 && <p className="notice">{report.insufficient.length} completed record(s) have no stored commission and are excluded.</p>}
    {!report.schemes.length && <p className="small spacer">No completed lifts or settled auction months match these filters.</p>}
    {!!report.schemes.length && <div className="table spacer"><table><thead><tr><th>Scheme</th><th>Type</th><th>Commission income</th><th>Months</th></tr></thead><tbody>
      {report.schemes.map(row => <tr key={row.schemeId}><td>{row.name}</td><td>{TYPE_OPTIONS.find(item => item[0] === row.chitType)?.[1] || "Auction"}</td><td>{row.commission == null ? "Insufficient data" : money(row.commission)}{row.missing ? ` · ${row.missing} missing` : ""}</td><td>{row.months}</td></tr>)}
    </tbody></table></div>}
    <div className="row spacer"><Button onClick={() => { setSchemeId(""); setChitType(""); setFinancialYear(String(defaultYear)); setFrom(""); setTo(""); setMonth(""); setStatus(""); setMemberId(""); }}>Reset filters</Button></div>
  </div>;
}
