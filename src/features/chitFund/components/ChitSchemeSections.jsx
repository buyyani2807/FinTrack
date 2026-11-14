import { useMemo, useState } from "react";
import { Select } from "../../../components/Select.jsx";
import { Button, Field, Metric, Spinner } from "../../../components/ui.jsx";
import { AccPager } from "../../accounts/components/AccUi.jsx";
import { usePagedList } from "../../accounts/model/usePagedList.js";
import { todayIso } from "../../../lib/dates.js";
import { money, formatChitDate, enrollmentName, paymentsByMemberName } from "../model/chitFormat.js";
import { chitPaymentModeLabel } from "../model/chitLabels.js";
import { chitPaymentAmounts } from "../model/memberPayments.js";
import { enrollmentPortalId } from "../model/liveBidding.js";
import { buildChitSchemeHealth } from "../model/chitSchemeHealth.js";
import { buildChitMonthStatement, currentSchemeMonth, monthLabel } from "../model/monthStatement.js";
import { downloadChitMonthStatementPdf } from "../io/monthStatementPdf.js";
import { CHIT_RECEIPT_SOURCE, chitInstallmentFigure, chitMemberSummary, chitSchemeKind, chitSchemePayments, chitSchemeProgress, defaultChitPaymentMonth } from "../model/chitSchemeView.js";
import { chitPaymentActionLabel } from "../model/chitSchemeChrome.js";
import { ChitDeleteMemberControl, ChitDeletePaymentButton } from "./ChitAdminControls.jsx";
import { ChitPaymentMonthPicker, ChitPaymentStatus, ChitReceiptCell } from "./ChitMemberParts.jsx";
import { ChitStandingTag } from "./ChitMemberPage.jsx";
import { ChitMembersToolbar } from "./ChitMemberManagement.jsx";

/** Section heading inside a scheme tab: title on the left, the tab's actions on the right. */
export function ChitSectionHead({ title, note, children }) {
  return <div className="toolbar chit-section-head"><div><strong>{title}</strong>{note ? <p className="small">{note}</p> : null}</div>{children ? <div className="row">{children}</div> : null}</div>;
}

const memberName = (enrollments, id) => {
  const owner = enrollments.find(item => item.id === id);
  return owner ? enrollmentName(owner) : "—";
};
const ticketLabel = (enrollments, id) => {
  const owner = enrollments.find(item => item.id === id);
  return owner ? `Ticket ${owner.ticket_number}` : "Ticket —";
};

/**
 * Overview, the same three blocks for every type:
 * scheme terms, lift progress, collections; then the type's own figures (labelled), then scheme health.
 */
export function ChitSchemeOverview({ scheme, details, commissionText, typeTitle, typeMetrics = [], typeNote = null }) {
  const kind = chitSchemeKind(scheme);
  const enrollments = details.enrollments || [];
  const progress = useMemo(() => chitSchemeProgress(scheme, details), [scheme, details]);
  const health = useMemo(() => buildChitSchemeHealth({ scheme, details, asOf: todayIso() }), [scheme, details]);
  const latest = progress.latest;
  const installment = chitInstallmentFigure(scheme);
  const next = progress.next;
  return <>
    <section className="chit-overview-block" aria-label="Scheme terms">
      <h2 className="chit-overview-title">Scheme terms</h2>
      <div className="grid metrics">
        <Metric label="Chit value" value={money(scheme.chit_value)} color="gold" />
        <Metric label={installment.label} value={installment.amount == null ? "—" : money(installment.amount)} />
        <Metric label="Members" value={`${enrollments.length}/${scheme.member_count}`} />
        <Metric label="Duration" value={`${scheme.duration_months} months`} />
        <Metric label="Manager commission" value={commissionText} />
      </div>
    </section>
    <section className="chit-overview-block" aria-label="Lift progress">
      <h2 className="chit-overview-title">Lift progress</h2>
      <div className="grid metrics">
        <Metric label="Months lifted" value={`${progress.liftedCount}/${progress.duration}`} color="blue" />
        <Metric label={latest ? `Latest lift — Month ${latest.month}` : "Latest lift"} value={latest ? money(latest.amount) : "None yet"} color="gold" />
        <Metric label={latest ? `Lift member — ${ticketLabel(enrollments, latest.enrollmentId)}` : "Lift member"} value={latest ? memberName(enrollments, latest.enrollmentId) : "—"} color="green" />
        <Metric label="Next lift month" value={next ? `Month ${next.month}` : "All months lifted"} color="blue" />
        {kind !== "auction" && <Metric label={next ? `Scheduled lift — Month ${next.month}` : "Scheduled lift"} value={next?.scheduledAmount != null ? money(next.scheduledAmount) : "—"} />}
      </div>
    </section>
    <section className="chit-overview-block" aria-label="Collections">
      <h2 className="chit-overview-title">Collections to date</h2>
      <div className="grid metrics">
        <Metric label="Due so far" value={health.available ? money(health.expectedDue) : "—"} />
        <Metric label="Collected" value={health.available ? money(health.collectedDue) : "—"} color="green" />
        <Metric label="Outstanding (past due)" value={health.available ? money(health.overdueAmount) : "—"} color={health.overdueAmount > 0 ? "red" : ""} />
        <Metric label="Collection rate" value={health.collectionRate == null ? "No dues yet" : `${health.collectionRate}%`} />
      </div>
    </section>
    {typeMetrics.length > 0 && <section className="chit-overview-block" aria-label={typeTitle}>
      <h2 className="chit-overview-title">{typeTitle}</h2>
      <div className="grid metrics">{typeMetrics.map(([label, value, color]) => <Metric key={label} label={label} value={value} color={color} />)}</div>
      {typeNote}
    </section>}
    <section className="card spacer" aria-label="AI scheme health"><span className="eyebrow">AI ADVISORY</span><h3>Scheme health</h3><p className="small">Collection rate: {health.collectionRate == null ? "Insufficient payment history" : `${health.collectionRate}%`} · Delayed members: {health.overdueMembers || 0}</p>{(health.insights || []).map(row => <p className="small" key={row.id}><strong>{row.title}:</strong> {row.explanation}</p>)}</section>
  </>;
}

/**
 * Members, the same columns for every type: ticket, member, phone, lift month, lift amount, balance, portal.
 * `extraColumns` adds type-specific figures after the shared ones: [{ header, cell: enrollment => node }].
 */
export function ChitSchemeMembersTable({ token, scheme, details, canWrite, onAddMember, onView, onDeleted, changed, extraColumns = [] }) {
  const enrollments = details.enrollments || [];
  const asOf = todayIso();
  const paged = usePagedList(enrollments, `${scheme.id}|members`);
  return <div className="card">
    <ChitMembersToolbar scheme={scheme} enrollments={enrollments} onAddMember={canWrite ? onAddMember : null} token={token} changed={changed} />
    <div className="table spacer chit-members-table"><table><thead><tr>
      <th>Ticket</th><th>Member</th><th>Phone</th><th>Lift month</th><th className="num">Lift amount</th>
      {extraColumns.map(column => <th key={column.header} className={column.numeric ? "num" : undefined}>{column.header}</th>)}
      <th className="num">Outstanding</th><th>Portal</th><th><span className="ft-sr-only">Actions</span></th>
    </tr></thead><tbody>
      {paged.items.map(item => {
        const summary = chitMemberSummary(scheme, details, item, asOf);
        return <tr key={item.id}>
          <td>{item.ticket_number}</td>
          <td>{enrollmentName(item)}<ChitStandingTag enrollment={item} /></td>
          <td>{item.chit_members?.phone || "—"}</td>
          <td>{summary.lift ? `Month ${summary.lift.month}` : "Not lifted"}</td>
          <td className="num">{summary.lift ? money(summary.lift.amount) : "—"}</td>
          {extraColumns.map(column => <td key={column.header} className={column.numeric ? "num" : undefined}>{column.cell(item)}</td>)}
          <td className={`num${summary.outstanding > 0 ? " red" : ""}`}>{summary.paymentCount ? money(summary.outstanding) : "—"}</td>
          <td>{enrollmentPortalId(item) || "Not enabled"}</td>
          <td className="chit-row-actions"><Button onClick={() => onView(item)}>View details</Button>{canWrite ? <ChitDeleteMemberControl token={token} scheme={scheme} enrollment={item} onDeleted={onDeleted} /> : null}</td>
        </tr>;
      })}
    </tbody></table>
    <AccPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} noun="members" />
    {!enrollments.length && <p className="small spacer">No members in this scheme yet.{canWrite && onAddMember ? " Use Add member to enrol the first member." : ""}</p>}
    </div>
    <p className="small spacer">Outstanding counts months already due. Future months are not included.</p>
  </div>;
}

/**
 * Payments for one month, the same columns and controls for every type.
 * Record / Edit opens the type's own payment dialog; Delete reverses through the type's own API.
 */
export function ChitSchemePaymentsTable({ token, scheme, details, canWrite, onRecord, onDelete, emptyNote, orgSettings = {}, workspace = {}, onLogReceipt }) {
  const kind = chitSchemeKind(scheme);
  const enrollments = details.enrollments || [];
  const rows = useMemo(() => chitSchemePayments(scheme, details), [scheme, details]);
  const [chosenMonth, setChosenMonth] = useState(null);
  const month = chosenMonth ?? defaultChitPaymentMonth(rows, todayIso());
  const visible = paymentsByMemberName(rows.filter(row => row.month === month), enrollments, details.cycles || []);
  const showLateFee = visible.some(row => Number(row.late_penalty || 0) > 0);
  const paged = usePagedList(visible, `${scheme.id}|${month}|payments`);
  const totals = visible.reduce((sum, row) => { const amounts = chitPaymentAmounts(row); return { expected: sum.expected + amounts.expected, paid: sum.paid + amounts.paid, balance: sum.balance + amounts.balance }; }, { expected: 0, paid: 0, balance: 0 });
  return <div className="card">
    <ChitSectionHead title={`Payments — Month ${month}`} note={visible.length ? `Expected ${money(totals.expected)} · Collected ${money(totals.paid)} · Balance ${money(totals.balance)}` : null}>
      <ChitPaymentMonthPicker duration={scheme.duration_months} value={month} onChange={setChosenMonth} />
    </ChitSectionHead>
    <div className="table spacer chit-member-payments"><table><thead><tr>
      <th>Member</th><th>Ticket</th><th>Due date</th><th>Paid on</th><th className="num">Expected</th><th className="num">Paid</th><th className="num">Balance</th>
      {showLateFee && <th className="num">Late fee</th>}
      <th>Mode</th><th>Reference</th><th>Status</th><th>Receipt</th><th><span className="ft-sr-only">Actions</span></th>
    </tr></thead><tbody>
      {paged.items.map(item => {
        const owner = enrollments.find(row => row.id === item.enrollment_id);
        const amounts = chitPaymentAmounts(item);
        return <tr key={item.id}>
          <td>{enrollmentName(owner)}</td>
          <td>{owner?.ticket_number || "—"}</td>
          <td>{formatChitDate(item.due_date)}</td>
          <td>{formatChitDate(item.paid_date)}</td>
          <td className="num">{money(amounts.expected)}</td>
          <td className="num">{money(amounts.paid)}</td>
          <td className={`num${amounts.balance > 0 ? " red" : ""}`}>{money(amounts.balance)}</td>
          {showLateFee && <td className="num">{amounts.lateFee ? money(amounts.lateFee) : "—"}</td>}
          <td>{item.payment_mode && amounts.paid > 0 ? chitPaymentModeLabel(item.payment_mode) : "—"}</td>
          <td>{item.payment_reference || "—"}</td>
          <td><ChitPaymentStatus row={item} /></td>
          <td><ChitReceiptCell source={CHIT_RECEIPT_SOURCE[kind]} paymentRow={item} memberName={enrollmentName(owner)} memberPhone={owner?.chit_members?.phone || ""} scheme={scheme} orgSettings={orgSettings} workspace={workspace} token={token} onLogAction={onLogReceipt} /></td>
          <td className="chit-row-actions">{canWrite ? <Button onClick={() => onRecord(item)}>{chitPaymentActionLabel(item.amount_paid)}</Button> : null}{canWrite && amounts.paid > 0 && <ChitDeletePaymentButton allowed memberName={enrollmentName(owner)} schemeName={scheme.name} amount={money(amounts.paid)} paidDate={formatChitDate(item.paid_date)} mode={item.payment_mode} reference={item.payment_reference} onConfirm={reason => onDelete(item.id, reason)} />}</td>
        </tr>;
      })}
    </tbody></table>
    <AccPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} noun="payments" />
    {!visible.length && <p className="small spacer">{emptyNote(month)}</p>}
    </div>
  </div>;
}

/** Scheme-level report: the month statement for this scheme, the same for every type. */
export function ChitSchemeReports({ scheme, details }) {
  const [monthNumber, setMonthNumber] = useState(() => Math.min(Math.max(1, currentSchemeMonth(scheme)), Number(scheme.duration_months) || 1));
  const statement = useMemo(() => buildChitMonthStatement({ scheme, details, monthNumber }), [scheme, details, monthNumber]);
  const months = Array.from({ length: Number(scheme.duration_months || 0) }, (_, index) => index + 1);
  return <div className="card">
    <ChitSectionHead title="Month statement" note="Collections, member dues and the month's lift for this scheme.">
      <Field label="Month"><Select value={monthNumber} onChange={event => setMonthNumber(Number(event.target.value))}>{months.map(month => <option key={month} value={month}>{monthLabel(scheme.start_date, month)}</option>)}</Select></Field>
    </ChitSectionHead>
    {statement ? <>
      <div className="grid metrics spacer">
        <Metric label="Expected" value={money(statement.expected)} color="gold" />
        <Metric label="Collected" value={money(statement.collected)} color="green" />
        <Metric label="Pending" value={money(statement.pending)} color="red" />
      </div>
      <div className="row spacer"><Button className="primary" onClick={() => downloadChitMonthStatementPdf({ scheme, details, monthNumber })}>Download month statement (PDF)</Button></div>
    </> : <Spinner label="Preparing statement" />}
    <p className="small spacer">Member statements are on each member's page. Profit &amp; Loss across schemes is under Chit Fund → Reports.</p>
  </div>;
}
