import { useEffect, useState } from "react";
import { Select } from "../../../components/Select.jsx";
import { loadChitSchemeDetails } from "../../../lib/financeRepository";
import { CHIT_TYPES } from "../model/fixedChit";
import { buildChitMonthStatement, currentSchemeMonth, monthLabel as chitMonthLabel } from "../model/monthStatement";
import { downloadChitMonthStatementPdf } from "../io/monthStatementPdf";
import { money, schemeStatusLabel, enrollmentName } from "../model/chitFormat.js";
import { Button, Field, Metric, Spinner } from "../../../components/ui.jsx";
import { Badge } from "./ChitUi.jsx";
import { AuctionChitSchemeDetails } from "../auction/AuctionChitSchemeDetails.jsx";
import { FixedChitSchemeDetails } from "../fixed/FixedChitSchemeDetails.jsx";
import { PredefinedBidSchemeDetails } from "../predefined/PredefinedBidSchemeDetails.jsx";

export function ChitSchemeDetails(props) {
  if (props.scheme.chit_type === CHIT_TYPES.FIXED) return <FixedChitSchemeDetails {...props} />;
  if (props.scheme.chit_type === CHIT_TYPES.FIXED_PREDEFINED_BID) return <PredefinedBidSchemeDetails {...props} />;
  return <AuctionChitSchemeDetails {...props} />;
}
const CHIT_BOARD = {
  auction: { title: "Auction Chits", bidType: "Auction", icon: "◎", currentLabel: "Current bid" },
  fixed: { title: "Fixed Chits", bidType: "Fixed lift", icon: "▣", currentLabel: "Current lift" },
  predefined: { title: "Fixed Predefined Bid Chits", bidType: "Predefined bid", icon: "◈", currentLabel: "Current bid" },
};
function ChitSchemeCard({ kind, row, open, edit, activate }) {
  const { scheme, current, members, winner, fixedCurrent, fixedWinner, predefinedCurrent, predefinedWinner } = row;
  const fixed = kind === "fixed";
  const predefined = kind === "predefined";
  const meta = CHIT_BOARD[kind];
  const activeRow = predefined ? predefinedCurrent : fixed ? fixedCurrent : current;
  const activeMember = predefined ? predefinedWinner : fixed ? fixedWinner : winner;
  const currentAmount = activeRow
    ? (predefined ? activeRow.bid_amount : fixed ? activeRow.lift_amount : activeRow.winning_bid_amount)
    : null;
  const monthText = activeRow ? `Month ${activeRow.month_number || activeRow.cycle_number}` : "—";
  return <article className="chit-scheme-card" onClick={() => open(scheme)}>
    <div className="chit-scheme-card-top">
      <span className="chit-scheme-type">{meta.bidType}</span>
      <Badge status={schemeStatusLabel(scheme.status)} />
    </div>
    <h3 className="chit-scheme-name">{scheme.name}</h3>
    <div className="chit-scheme-value">{money(scheme.chit_value)}</div>
    <p className="chit-scheme-value-label">Chit value</p>
    <div className="chit-scheme-stats">
      <div><span>Contribution</span><strong>{money(scheme.installment_amount)}</strong></div>
      <div><span>Duration</span><strong>{scheme.duration_months} months</strong></div>
      <div><span>Members</span><strong>{members.length}/{scheme.member_count}</strong></div>
      <div><span>Current month</span><strong>{monthText}</strong></div>
    </div>
    <div className="chit-scheme-current">
      <div><span>{meta.currentLabel}</span><strong>{currentAmount == null ? "—" : money(currentAmount)}</strong></div>
      <div><span>Current member</span><strong>{activeMember ? enrollmentName(activeMember) : "—"}</strong></div>
      {predefined && <div className="chit-scheme-current-wide"><span>Net receivable</span><strong>{activeRow ? money(activeRow.net_receivable) : "—"}</strong></div>}
    </div>
    {scheme.status === "draft" && <div className="chit-scheme-actions" onClick={event => event.stopPropagation()}>
      {!predefined && <Button onClick={() => edit(scheme)}>Edit</Button>}
      <Button className="primary" onClick={() => activate(scheme, members.length)}>Activate</Button>
    </div>}
  </article>;
}
export function ChitSchemeDashboardSection({ kind, rows, busy, open, edit, activate }) {
  const meta = CHIT_BOARD[kind];
  return <section className={`chit-board chit-board-${kind}`}>
    <div className="chit-board-head">
      <div className="chit-board-title">
        <div className="chit-board-icon">{meta.icon}</div>
        <div>
          <strong>{meta.title}</strong>
          <p className="small">{meta.bidType} schemes</p>
        </div>
      </div>
      <span className="chit-board-count">{rows.length} {rows.length === 1 ? "scheme" : "schemes"}</span>
    </div>
    {rows.length ? <div className="chit-board-grid">{rows.map(row => <ChitSchemeCard key={row.scheme.id} kind={kind} row={row} open={open} edit={edit} activate={activate} />)}</div> : !busy && <p className="small chit-board-empty">No {meta.title} yet.</p>}
  </section>;
}
export function ChitLandingReports({ token, schemes }) {
  const [schemeId, setSchemeId] = useState(schemes[0]?.id || "");
  const [monthNumber, setMonthNumber] = useState(1);
  const [details, setDetails] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scheme = schemes.find(item => item.id === schemeId);
  useEffect(() => {
    if (!schemeId && schemes[0]) {
      setSchemeId(schemes[0].id);
      setMonthNumber(currentSchemeMonth(schemes[0]));
    }
  }, [schemes, schemeId]);
  useEffect(() => {
    if (!schemeId) { setDetails(null); return; }
    let ignore = false;
    setBusy(true);
    loadChitSchemeDetails(token, schemeId).then(payload => {
      if (ignore) return;
      setDetails(payload);
      setError("");
      setBusy(false);
    }).catch(err => { if (!ignore) { setError(err.message || "Could not load scheme details."); setBusy(false); } });
    return () => { ignore = true; };
  }, [token, schemeId]);
  const statement = scheme && details ? buildChitMonthStatement({ scheme, details, monthNumber }) : null;
  const months = Array.from({ length: Number(scheme?.duration_months || 0) }, (_, index) => index + 1);
  return <div className="card">
    <strong>Chit Fund reports</strong>
    <p className="copy">Scheme collection, member dues, bid history, and outstanding for the selected month. Open a scheme for dividends and live bid detail.</p>
    <div className="form spacer">
      <Field label="Scheme"><Select value={schemeId} onChange={event => { const next = schemes.find(item => item.id === event.target.value); setSchemeId(event.target.value); if (next) setMonthNumber(currentSchemeMonth(next)); }}>{schemes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      <Field label="Month"><Select value={monthNumber} onChange={event => setMonthNumber(Number(event.target.value))}>{months.map(month => <option key={month} value={month}>{chitMonthLabel(scheme?.start_date, month)}</option>)}</Select></Field>
    </div>
    {error && <p className="red small">{error}</p>}
    {busy && <Spinner label="Loading statement" />}
    {statement && !busy && <>
      <div className="grid metrics">
        <Metric label="Expected" value={money(statement.expected)} color="gold" />
        <Metric label="Collected" value={money(statement.collected)} color="green" />
        <Metric label="Pending" value={money(statement.pending)} color="red" />
      </div>
      <div className="row spacer"><Button className="primary" onClick={() => downloadChitMonthStatementPdf({ scheme, details, monthNumber })}>Download month statement</Button></div>
    </>}
    {!schemes.length && <p className="small spacer">No Chit Fund schemes yet.</p>}
  </div>;
}
