import { useMemo, useState } from "react";
import {
  buildChitStatementBundle,
  buildCustomerStatementBundle,
  formatReceiptDate,
  statementWhatsAppMessage,
  todayIso,
} from "./statementModel.js";
import { downloadCustomerStatementPdf } from "./statementPdf.js";
import { canWhatsAppShare, openWhatsAppShare } from "../receipts/receiptWhatsApp.js";

const money = n => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function SummaryRow({ label, value, emphasize = false }) {
  return <div className={`statement-summary-row ${emphasize ? "emphasize" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function FinanceAccountSection({ account }) {
  const s = account.summary;
  return <section className="card spacer statement-account">
    <div className="toolbar"><div><strong>{account.financeType}</strong><p className="small">{account.accountId} · Status: {String(s.status || "").toUpperCase()}</p></div><div className="metric-value gold statement-outstanding">{money(s.outstanding)}</div></div>
    <div className="statement-summary">
      <SummaryRow label="Finance Type" value={account.financeType} />
      <SummaryRow label="Account ID" value={account.accountId} />
      {account.kind === "daily" ? <>
        <SummaryRow label="Finance Amount" value={money(s.financeAmount)} />
        <SummaryRow label="Total Payable" value={money(s.totalPayable)} />
        <SummaryRow label="Total Paid" value={money(s.totalPaid)} />
        <SummaryRow label="Outstanding" value={money(s.outstanding)} emphasize />
        <SummaryRow label="Start Date" value={formatReceiptDate(s.startDate)} />
        <SummaryRow label="Repayment Period" value={s.repaymentPeriod} />
        <SummaryRow label="Days Completed" value={String(s.daysCompleted)} />
        <SummaryRow label="Days Remaining" value={String(s.daysRemaining)} />
      </> : <>
        <SummaryRow label="Loan Amount" value={money(s.loanAmount)} />
        <SummaryRow label="Total Paid" value={money(s.totalPaid)} />
        <SummaryRow label="Outstanding" value={money(s.outstanding)} emphasize />
        <SummaryRow label="Monthly Interest" value={money(s.monthlyInstallment)} />
        <SummaryRow label="No of months interest paid" value={String(s.installmentsPaid)} />
        <SummaryRow label="Start Date" value={formatReceiptDate(s.startDate)} />
        {s.nextDueDate && <SummaryRow label="Next Due Date" value={formatReceiptDate(s.nextDueDate)} />}
      </>}
      <SummaryRow label="Status" value={String(s.status || "").toUpperCase()} />
    </div>
    <strong className="spacer">Payment history</strong>
    <div className="table spacer statement-payments"><table><thead><tr><th>Date</th><th>Amount</th><th>Payment Mode</th><th>Collected By</th><th>Balance</th><th>Notes</th></tr></thead><tbody>
      {account.payments.map(payment => <tr key={payment.id}>
        <td>{formatReceiptDate(payment.date)}</td>
        <td className="green">{money(payment.amount)}{payment.splitPayment ? <div className="small">Cash {money(payment.cashAmount)} · UPI {money(payment.upiAmount)}</div> : null}</td>
        <td>{payment.paymentMode}</td>
        <td>{payment.collectedBy}</td>
        <td>{money(payment.balanceAfter)}</td>
        <td>{payment.notes || "—"}</td>
      </tr>)}
    </tbody></table>{!account.payments.length && <p className="small spacer">No payments recorded up to this statement date.</p>}</div>
  </section>;
}

function ChitAccountSection({ account }) {
  const s = account.summary;
  return <section className="card spacer statement-account">
    <div className="toolbar"><div><strong>{account.scheme.name}</strong><p className="small">{account.scheme.chitTypeLabel} · Ticket {account.ticketNumber || "—"} · {String(s.status || "").toUpperCase()}</p></div><div className="metric-value gold statement-outstanding">{money(s.outstanding)}</div></div>
    <div className="statement-summary">
      <SummaryRow label="Finance Type" value="Chit Fund" />
      <SummaryRow label="Chit Type" value={account.scheme.chitTypeLabel || "Auction"} />
      <SummaryRow label="Chit Scheme" value={account.scheme.name} />
      <SummaryRow label="Account ID" value={account.accountId || "—"} />
      <SummaryRow label="Chit Value" value={money(account.scheme.chitValue)} />
      <SummaryRow label="Total Members" value={String(account.scheme.memberCount || "—")} />
      <SummaryRow label="Installment" value={money(s.installment)} />
      <SummaryRow label="Total Months" value={String(account.scheme.totalMonths || "—")} />
      <SummaryRow label="Months Paid" value={String(s.monthsPaid)} />
      <SummaryRow label="Months Remaining" value={String(s.monthsRemaining)} />
      <SummaryRow label="Total Paid" value={money(s.totalPaid)} />
      <SummaryRow label="Outstanding" value={money(s.outstanding)} emphasize />
      <SummaryRow label="Status" value={String(s.status || "").toUpperCase()} />
    </div>
    {account.bid?.isWinner && <div className="card spacer"><strong>Bid / Lift information</strong><div className="statement-summary spacer">
      <SummaryRow label="Bid Winner" value="Yes" />
      <SummaryRow label="Winning Month" value={account.bid.winningMonth ? `Month ${account.bid.winningMonth}` : "—"} />
      <SummaryRow label="Winning Bid / Lift" value={money(account.bid.winningBid)} />
      {!!account.bid.discount && <SummaryRow label="Discount" value={money(account.bid.discount)} />}
      {!!account.bid.managerCommission && <SummaryRow label="Commission" value={money(account.bid.managerCommission)} />}
      {!!account.bid.distributable && <SummaryRow label="Distributable Amount" value={money(account.bid.distributable)} />}
      {!!account.bid.dividendPerMember && <SummaryRow label="Dividend Per Member" value={money(account.bid.dividendPerMember)} />}
      {!!account.bid.amountPaidToMember && <SummaryRow label="Amount Paid to Member" value={money(account.bid.amountPaidToMember)} />}
    </div></div>}
    {!account.bid?.isWinner && <p className="notice">Bid Winner: No. This member has not won / lifted in this scheme.</p>}
    <strong className="spacer">Payment history</strong>
    <div className="table spacer statement-payments"><table><thead><tr><th>Month</th><th>Due Date</th><th>Amount</th><th>Payment Mode</th><th>Status</th><th>Notes</th></tr></thead><tbody>
      {account.payments.map(payment => <tr key={payment.id || `${payment.month}-${payment.dueDate}`}>
        <td>Month {payment.month || "—"}</td>
        <td>{formatReceiptDate(payment.dueDate)}</td>
        <td className="green">{money(payment.paid || payment.expected)}{payment.splitPayment ? <div className="small">Cash {money(payment.cashAmount)} · UPI {money(payment.upiAmount)}</div> : null}</td>
        <td>{payment.paymentMode || "—"}</td>
        <td>{payment.status}</td>
        <td>{payment.notes || "—"}</td>
      </tr>)}
    </tbody></table>{!account.payments.length && <p className="small spacer">No payment rows for this statement date.</p>}</div>
  </section>;
}

export function CustomerStatementPage({
  mode = "finance",
  loans = [],
  focusLoan = null,
  chit = null,
  settings = {},
  back,
}) {
  const [asOf, setAsOf] = useState(todayIso());
  const [selectedAccountId, setSelectedAccountId] = useState(mode === "finance" ? "all" : "chit");
  const [appliedAsOf, setAppliedAsOf] = useState(todayIso());

  const bundle = useMemo(() => {
    if (mode === "chit" && chit) {
      return buildChitStatementBundle({ ...chit, asOf: appliedAsOf, settings });
    }
    return buildCustomerStatementBundle({
      loans,
      focusLoan,
      selectedAccountId,
      asOf: appliedAsOf,
      settings,
    });
  }, [mode, chit, loans, focusLoan, selectedAccountId, appliedAsOf, settings]);

  const accountOptions = mode === "finance"
    ? [["all", "All Accounts"], ...(bundle.allAccounts || []).map(account => [account.loanId, `${account.financeType} · ${account.accountId}`])]
    : [["chit", chit?.scheme?.name || "Chit Fund"]];

  const shareWhatsApp = () => {
    if (!canWhatsAppShare(bundle.phone)) return;
    openWhatsAppShare({ phone: bundle.phone, message: statementWhatsAppMessage(bundle) });
  };

  return <main className="shell customer-statement-page">
    <div className="toolbar">
      <div>
        <button type="button" className="btn" onClick={back}>← Back</button>
        <h1 className="title spacer">Customer Statement</h1>
        <p className="copy">{bundle.customerName} · {bundle.phone || "No phone"} · As of {formatReceiptDate(bundle.asOf)}</p>
      </div>
      <div className="tabs receipt-actions">
        <button type="button" className="btn primary" onClick={() => downloadCustomerStatementPdf(bundle)}>Download PDF</button>
        {canWhatsAppShare(bundle.phone)
          ? <button type="button" className="btn whatsapp" onClick={shareWhatsApp}>WhatsApp</button>
          : <span className="small">No phone for WhatsApp</span>}
      </div>
    </div>

    <div className="card spacer statement-controls">
      <div className="form">
        <label className="field"><span>Account</span>
          <select value={selectedAccountId} onChange={event => setSelectedAccountId(event.target.value)} disabled={mode === "chit"}>
            {accountOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="field"><span>Statement As Of</span>
          <input type="date" value={asOf} onChange={event => setAsOf(event.target.value)} />
        </label>
        <div className="field"><span>&nbsp;</span>
          <button type="button" className="btn primary" onClick={() => setAppliedAsOf(asOf || todayIso())}>Generate Statement</button>
        </div>
      </div>
    </div>

    <div className="card spacer statement-header">
      <strong>CUSTOMER STATEMENT</strong>
      <h2 className="title spacer">{bundle.customerName}</h2>
      <p className="small">Customer ID: {bundle.customerId || "—"}</p>
      {bundle.address && <p className="small">{bundle.address}</p>}
      <p className="small">Phone: {bundle.phone || "—"} · Statement Date: {formatReceiptDate(bundle.asOf)}</p>
    </div>

    {!bundle.accounts.length && <p className="notice">No accounts are available for this statement.</p>}
    {bundle.accounts.map(account => account.type === "chit"
      ? <ChitAccountSection key={account.accountId} account={account} />
      : <FinanceAccountSection key={account.loanId || account.accountId} account={account} />)}
  </main>;
}
