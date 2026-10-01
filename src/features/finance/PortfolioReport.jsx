import { useEffect, useState } from "react";
import { Button, Field, Metric, Modal } from "../../components/ui.jsx";
import { loadChitSchemeDetails, loadChitSchemes } from "../../lib/financeRepository";
import { formatInr as money } from "../../lib/formatMoney.js";
import { buildChitMonthStatement, currentSchemeMonth, monthLabel as chitMonthLabel } from "../chitFund/monthStatement";
import { downloadChitMonthStatementPdf } from "../chitFund/monthStatementPdf";
import { financeKindLabel } from "./collectionStaff";
import { annualRate, loanBalance, loanPaid, loanStatus, monthlyBalance, today } from "./loanState.js";
import { paymentValue } from "./paymentFormat.js";
import { investedAmount, realizedLoss, realizedProfit } from "./pnl.js";
import { downloadCustomerReport, downloadDailyReport, downloadProfitLossReport } from "./reportDownloads.js";
import { accountStatusLabel, filterCollectionReportAccounts, filterProfitLossAccounts } from "./reports.js";

export function PinResetModal({ title, currentPin, onSave, close }) {
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const save = () => {
    if (oldPin !== currentPin) return setError("Current PIN is incorrect.");
    if (!/^\d{4,}$/.test(newPin)) return setError("New PIN must be at least 4 digits.");
    if (newPin !== confirmPin) return setError("New PINs do not match.");
    onSave(newPin);
    close();
  };
  return <Modal><h2 className="title">Reset {title} PIN</h2><p className="copy">Choose a secure numeric PIN with at least four digits.</p><div className="tool-stack spacer"><Field label="Current PIN"><input type="password" value={oldPin} onChange={event => setOldPin(event.target.value)} /></Field><Field label="New PIN"><input type="password" value={newPin} onChange={event => setNewPin(event.target.value)} /></Field><Field label="Confirm new PIN"><input type="password" value={confirmPin} onChange={event => setConfirmPin(event.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={save}>Save new PIN</Button></div></Modal>;
}
export function ChitFundMonthReport({ token }) {
  const [schemes, setSchemes] = useState([]);
  const [schemeId, setSchemeId] = useState("");
  const [monthNumber, setMonthNumber] = useState(1);
  const [details, setDetails] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const scheme = schemes.find(item => item.id === schemeId);
  useEffect(() => {
    let ignore = false;
    loadChitSchemes(token).then(list => {
      if (ignore) return;
      setSchemes(list || []);
      const first = list?.[0];
      if (first) {
        setSchemeId(first.id);
        setMonthNumber(currentSchemeMonth(first));
      } else {
        setBusy(false);
      }
    }).catch(err => { if (!ignore) { setError(err.message || "Could not load Chit Fund schemes."); setBusy(false); } });
    return () => { ignore = true; };
  }, [token]);
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
  const download = () => {
    try {
      setError("");
      downloadChitMonthStatementPdf({ scheme, details, monthNumber });
    } catch (err) {
      setError(err.message || "Could not download statement.");
    }
  };
  return <>
    <p className="copy spacer">Download a month statement for any Chit Fund scheme. Daily and Monthly reports are unchanged.</p>
    <div className="form spacer">
      <Field label="Scheme"><select value={schemeId} onChange={event => { const next = schemes.find(item => item.id === event.target.value); setSchemeId(event.target.value); if (next) setMonthNumber(currentSchemeMonth(next)); }}>{schemes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Month"><select value={monthNumber} onChange={event => setMonthNumber(Number(event.target.value))}>{months.map(month => <option key={month} value={month}>{chitMonthLabel(scheme.start_date, month)}</option>)}</select></Field>
    </div>
    {error && <p className="red small">{error}</p>}
    {busy && <p className="small spacer">Loading Chit Fund statement…</p>}
    {statement && !busy && <>
      <div className="grid metrics">
        <Metric label="Expected" value={money(statement.expected)} color="gold" />
        <Metric label="Collected" value={money(statement.collected)} color="green" />
        <Metric label="Pending" value={money(statement.pending)} color="red" />
        <Metric label="Collection progress" value={`${statement.progress}%`} color="blue" />
      </div>
      <div className="row spacer">
        <span className="small">PDF includes auction/prize, member collections with payment mode and collected by, and outstanding dues for {statement.monthLabel}.</span>
        <Button className="primary" onClick={download}>Download PDF</Button>
      </div>
      <div className="table spacer"><table><thead><tr><th>Member</th><th>Ticket</th><th>Due</th><th>Paid</th><th>Payment mode</th><th>Collected by</th><th>Status</th></tr></thead><tbody>{statement.collections.map(row => <tr key={row.enrollmentId || `${row.ticket}-${row.name}`}><td>{row.name}</td><td>{row.ticket || "—"}</td><td>{money(row.due)}</td><td>{money(row.paid)}</td><td>{row.paymentMode}</td><td>{row.collectedBy}</td><td>{row.status}</td></tr>)}</tbody></table></div>
    </>}
    {!busy && !schemes.length && <p className="small spacer">No Chit Fund schemes yet.</p>}
  </>;
}
export function PortfolioReport({ loans, token, close, lockedKind, showChit = true, embedded = false, title = "Reports" }) {
  const [tab, setTab] = useState("collections"), [kind, setKind] = useState(lockedKind || "all"), [status, setStatus] = useState("all"), [customer, setCustomer] = useState(""), [reportDate, setReportDate] = useState(today()), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => { if (lockedKind) setKind(lockedKind); }, [lockedKind]);
  const collectionAccounts = filterCollectionReportAccounts(loans, { kind, customer, statusOf: loanStatus });
  const profitAccounts = filterProfitLossAccounts(loans, { kind, status, customer, statusOf: loanStatus });
  const collectionTotal = key => collectionAccounts.reduce((sum, loan) => sum + key(loan), 0);
  const profitTotal = key => profitAccounts.reduce((sum, loan) => sum + key(loan), 0);
  const daily = profitAccounts.filter(loan => loan.kind === "daily"), monthly = profitAccounts.filter(loan => loan.kind === "monthly");
  const profitNet = profitTotal(realizedProfit) - profitTotal(realizedLoss);
  const downloadCollections = () => { try { setNotice(""); setError(""); downloadDailyReport(collectionAccounts, reportDate); setNotice("Collection report downloaded."); } catch (e) { setError(e.message); } };
  const downloadProfit = () => { try { setNotice(""); setError(""); downloadProfitLossReport(profitAccounts, { kind, status, customer, generatedOn: today() }); setNotice("Profit & Loss report downloaded."); } catch (e) { setError(e.message); } };
  const body = <><div className="row"><h2 className="title">{title}</h2>{!embedded && <Button onClick={close}>Close</Button>}</div><div className="tabs spacer"><Button className={`tab ${tab === "collections" ? "active" : ""}`} onClick={() => { setTab("collections"); setError(""); setNotice(""); }}>{lockedKind === "monthly" ? "Collection report" : lockedKind === "daily" ? "Daily collection report" : "Collection Reports"}</Button><Button className={`tab ${tab === "profit" ? "active" : ""}`} onClick={() => { setTab("profit"); setError(""); setNotice(""); }}>{lockedKind === "monthly" ? "Monthly P&L" : lockedKind === "daily" ? "Daily P&L" : "Profit & Loss Report"}</Button>{showChit && <Button className={`tab ${tab === "chit" ? "active" : ""}`} onClick={() => { setTab("chit"); setError(""); setNotice(""); }}>Chit Fund</Button>}</div>{tab === "collections" ? <><p className="copy spacer">Review and download {lockedKind === "monthly" ? "Monthly" : lockedKind === "daily" ? "Daily" : "Daily and Monthly"} collection activity for active customers on a selected date.</p><div className="form spacer"><Field label="Collection report date"><input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} /></Field><Field label="Finance type"><select value={kind} disabled={Boolean(lockedKind)} onChange={e => setKind(e.target.value)}><option value="all">Daily + Monthly</option><option value="daily">Daily finance</option><option value="monthly">Monthly finance</option></select></Field><Field className="span" label="Customer"><input placeholder="Filter by customer name" value={customer} onChange={e => setCustomer(e.target.value)} /></Field></div><div className="grid metrics"><Metric label="Accounts in report" value={collectionAccounts.length} color="blue" /><Metric label="Expected collection" value={money(collectionAccounts.reduce((sum, loan) => sum + (loan.kind === "daily" ? loan.dailyCollection : Math.round(monthlyBalance(loan, reportDate) * annualRate(loan, reportDate) / 100)), 0))} color="gold" /><Metric label="Collected on selected date" value={money(collectionAccounts.reduce((sum, loan) => sum + (loan.transactions || []).filter(t => t.date === reportDate).reduce((value, t) => value + paymentValue(loan, t), 0), 0))} color="green" /><Metric label="Outstanding" value={money(collectionTotal(loanBalance))} color="red" /></div>{error && <p className="red small">{error}</p>}{notice && <p className="green small">{notice}</p>}<div className="row spacer"><span className="small">The download includes only active customers, expected and actual collection, notes, and Collected By.</span><Button className="primary" onClick={downloadCollections}>Download collection report</Button></div></> : tab === "profit" ? <><p className="copy spacer">Financial position based on the saved Daily and Monthly finance transactions. Outstanding amounts are receivables, not losses.</p><div className="form spacer"><Field label="Finance type"><select value={kind} disabled={Boolean(lockedKind)} onChange={e => setKind(e.target.value)}><option value="all">Daily + Monthly</option><option value="daily">Daily finance</option><option value="monthly">Monthly finance</option></select></Field><Field label="Account status"><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="closed">Closed</option><option value="bankrupt">Bankrupt</option></select></Field><Field label="Customer"><input placeholder="Filter by customer name" value={customer} onChange={e => setCustomer(e.target.value)} /></Field></div><div className="grid metrics"><Metric label="Paid to customers" value={money(profitTotal(investedAmount))} color="gold" /><Metric label="Total collected" value={money(profitTotal(loanPaid))} color="green" /><Metric label="Outstanding / receivable" value={money(profitTotal(loanBalance))} color="red" /><Metric label="Realized profit" value={money(profitTotal(realizedProfit))} color="green" /><Metric label="Loss / bankrupt" value={money(profitTotal(realizedLoss))} color="red" /><Metric label="Net profit / loss" value={money(profitNet)} color={profitNet < 0 ? "red" : "green"} /></div><div className="grid two spacer"><div className="card"><strong>Daily finance</strong><p className="small">Paid to customers: {money(daily.reduce((sum, loan) => sum + investedAmount(loan), 0))} · Collected: {money(daily.reduce((sum, loan) => sum + loanPaid(loan), 0))}</p><p className="small">Profit: {money(daily.reduce((sum, loan) => sum + realizedProfit(loan), 0))} · Loss: {money(daily.reduce((sum, loan) => sum + realizedLoss(loan), 0))} · Outstanding: {money(daily.reduce((sum, loan) => sum + loanBalance(loan), 0))}</p></div><div className="card"><strong>Monthly finance</strong><p className="small">Paid to customers: {money(monthly.reduce((sum, loan) => sum + investedAmount(loan), 0))} · Collected: {money(monthly.reduce((sum, loan) => sum + loanPaid(loan), 0))}</p><p className="small">Profit: {money(monthly.reduce((sum, loan) => sum + realizedProfit(loan), 0))} · Loss: {money(monthly.reduce((sum, loan) => sum + realizedLoss(loan), 0))} · Outstanding: {money(monthly.reduce((sum, loan) => sum + loanBalance(loan), 0))}</p></div></div>{error && <p className="red small">{error}</p>}{notice && <p className="green small">{notice}</p>}<div className="row spacer"><span className="small">The download includes the selected filters, totals, and every account shown below. Generated on {today()}.</span><Button className="primary" onClick={downloadProfit}>Download Profit &amp; Loss report</Button></div><div className="table spacer"><table><thead><tr><th>Customer</th><th>Finance type</th><th>Status</th><th>Paid to customers</th><th>Total collected</th><th>Outstanding</th><th>Realized profit</th><th>Loss</th><th>Net profit / loss</th></tr></thead><tbody>{profitAccounts.length ? profitAccounts.map(loan => { const rowNet = realizedProfit(loan) - realizedLoss(loan); return <tr key={loan.id}><td>{loan.customerName}</td><td>{financeKindLabel(loan.kind)}</td><td>{accountStatusLabel(loanStatus(loan))}</td><td>{money(investedAmount(loan))}</td><td>{money(loanPaid(loan))}</td><td>{money(loanBalance(loan))}</td><td>{money(realizedProfit(loan))}</td><td>{money(realizedLoss(loan))}</td><td>{money(rowNet)}</td></tr>; }) : <tr><td colSpan="9">No accounts match these filters.</td></tr>}</tbody></table></div></> : showChit ? <ChitFundMonthReport token={token} /> : null}</>;
  return embedded ? <div className="module-reports">{body}</div> : <Modal>{body}</Modal>;
}
export function CustomerReportDownload({ loan, onResetPin }) {
  const [reset, setReset] = useState(false);
  return <div className="customer-actions" style={{
    position: "fixed",
    right: 20,
    bottom: 20,
    zIndex: 5
  }}><div className="tabs">{onResetPin && <Button onClick={() => setReset(true)}>Reset PIN</Button>}<Button className="primary" onClick={() => downloadCustomerReport(loan)}>Download payment report</Button></div>{reset && onResetPin && <PinResetModal title="customer" currentPin={loan.pin} onSave={onResetPin} close={() => setReset(false)} />}</div>;
}
