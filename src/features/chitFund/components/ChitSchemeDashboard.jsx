import { useEffect, useState } from "react";
import { CardSlider } from "../../../components/CardSlider.jsx";
import { Select } from "../../../components/Select.jsx";
import { loadChitSchemeDetails } from "../../../lib/financeRepository";
import { CHIT_TYPES } from "../model/fixedChit";
import { buildChitMonthStatement, currentSchemeMonth, monthLabel as chitMonthLabel } from "../model/monthStatement";
import { downloadChitMonthStatementPdf } from "../io/monthStatementPdf";
import { money, schemeStatusLabel, enrollmentName } from "../model/chitFormat.js";
import { chitInstallmentFigure } from "../model/chitSchemeView.js";
import { Button, Field, Metric, Spinner } from "../../../components/ui.jsx";
import { Badge } from "./ChitUi.jsx";
import { ChitProfitLossReport } from "./ChitProfitLossReport.jsx";
import { ChitSchemeHealthPanel } from "./ChitSchemeHealthPanel.jsx";
import { AuctionChitSchemeDetails } from "../auction/AuctionChitSchemeDetails.jsx";
import { FixedChitSchemeDetails } from "../fixed/FixedChitSchemeDetails.jsx";
import { PredefinedBidSchemeDetails } from "../predefined/PredefinedBidSchemeDetails.jsx";

export function ChitSchemeDetails(props) {
  if (props.scheme.chit_type === CHIT_TYPES.FIXED) return <FixedChitSchemeDetails {...props} />;
  if (props.scheme.chit_type === CHIT_TYPES.FIXED_PREDEFINED_BID) return <PredefinedBidSchemeDetails {...props} />;
  return <AuctionChitSchemeDetails {...props} />;
}
const CHIT_BOARD = {
  auction: { title: "Auction Chits", bidType: "Auction Chit", icon: "◎" },
  fixed: { title: "Fixed Chits", bidType: "Fixed Chit", icon: "▣" },
  predefined: { title: "Fixed Predefined Bid Chits", bidType: "Fixed Predefined Bid", icon: "◈" },
};
// One card layout for every type. "Latest lift" is always the most recent finalized month and
// "Next lift" the next month waiting for one, so the same words mean the same thing on every card.
function ChitSchemeCard({ kind, row, open, edit, activate, loading }) {
  const { scheme, members, progress } = row;
  const predefined = kind === "predefined";
  const meta = CHIT_BOARD[kind];
  const installment = chitInstallmentFigure(scheme);
  const latest = progress?.latest;
  const latestMember = latest ? members.find(item => item.id === latest.enrollmentId) : null;
  const next = progress?.next;
  const pending = value => (loading ? <span className="chit-loading-value">…</span> : value);
  return <article className="chit-scheme-card" onClick={() => open(scheme)}>
    <div className="chit-scheme-card-top">
      <span className="chit-scheme-type">{meta.bidType}</span>
      <Badge status={schemeStatusLabel(scheme.status)} />
    </div>
    <h3 className="chit-scheme-name">{scheme.name}</h3>
    <div className="chit-scheme-value">{money(scheme.chit_value)}</div>
    <p className="chit-scheme-value-label">Chit value</p>
    <div className="chit-scheme-stats">
      <div><span>{installment.label}</span><strong>{installment.amount == null ? "—" : money(installment.amount)}</strong></div>
      <div><span>Duration</span><strong>{scheme.duration_months} months</strong></div>
      <div><span>Members</span><strong>{pending(`${members.length}/${scheme.member_count}`)}</strong></div>
      <div><span>Months lifted</span><strong>{pending(progress ? `${progress.liftedCount}/${progress.duration}` : "—")}</strong></div>
    </div>
    <div className="chit-scheme-current">
      <div><span>Latest lift</span><strong>{pending(latest ? `Month ${latest.month} · ${money(latest.amount)}` : "None yet")}</strong></div>
      <div><span>Lift member</span><strong>{pending(latestMember ? enrollmentName(latestMember) : "—")}</strong></div>
      <div className="chit-scheme-current-wide"><span>Next lift</span><strong>{pending(scheme.status !== "active" ? "After activation" : next ? `Month ${next.month}${next.scheduledAmount != null ? ` · ${money(next.scheduledAmount)}` : ""}` : "All months lifted")}</strong></div>
    </div>
    {scheme.status === "draft" && (edit || activate) && <div className="chit-scheme-actions" onClick={event => event.stopPropagation()}>
      {/* Predefined Bid drafts have no edit API yet; their schedule months are edited inside the scheme. */}
      {!predefined && edit ? <Button onClick={() => edit(scheme)}>Edit</Button> : null}
      {activate ? <Button className="primary" onClick={() => activate(scheme)}>Activate</Button> : null}
    </div>}
  </article>;
}
export function ChitSchemeDashboardSection({ kind, rows, busy, loading = false, open, edit, activate }) {
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
    {rows.length ? <CardSlider className="chit-board-slider" label={meta.title}>{rows.map(row => <ChitSchemeCard key={row.scheme.id} kind={kind} row={row} open={open} edit={edit} activate={activate} loading={loading} />)}</CardSlider> : !busy && <p className="small chit-board-empty">No {meta.title} match this filter.</p>}
  </section>;
}
export function ChitLandingReports({ token, schemes, cycles = [], fixedLifts = [], predefinedSchedule = [], enrollments = [], aiEnabled = false, openScheme = null }) {
  const [report, setReport] = useState("statement");
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
  return <div>
    <div className="tabs spacer">
      <Button className={`tab ${report === "statement" ? "active" : ""}`} onClick={() => setReport("statement")}>Month statement</Button>
      <Button className={`tab ${report === "profit" ? "active" : ""}`} onClick={() => setReport("profit")}>Profit &amp; Loss</Button>
      {aiEnabled && <Button className={`tab ${report === "health" ? "active" : ""}`} onClick={() => setReport("health")}>Scheme health</Button>}
    </div>
    {report === "health" && aiEnabled && <div className="card spacer">
      <strong>Scheme health</strong>
      <div className="form spacer">
        <Field label="Scheme"><Select value={schemeId} onChange={event => setSchemeId(event.target.value)}>{schemes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
      </div>
      {error && <p className="red small">{error}</p>}
      {busy ? <Spinner label="Loading scheme" /> : <ChitSchemeHealthPanel token={token} scheme={scheme} details={details} openScheme={openScheme} />}
      {!schemes.length && <p className="small spacer">No Chit Fund schemes yet.</p>}
    </div>}
    {report === "profit" && <ChitProfitLossReport schemes={schemes} cycles={cycles} fixedLifts={fixedLifts} predefinedSchedule={predefinedSchedule} enrollments={enrollments} />}
    {report === "statement" && <div className="card spacer">
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
  </div>}
  </div>;
}
