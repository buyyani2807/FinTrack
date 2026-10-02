import { AccEmpty } from "./AccUi.jsx";
import { ArReminderButton, PaymentAdviceButton } from "./SalesInvoiceActions.jsx";
import { money } from "../accountsFormat.js";

const invoiceStatusTone = status => {
  if (status === "Overdue") return "inv-overdue";
  if (status === "Due") return "inv-due";
  if (status === "Paid") return "inv-paid";
  if (status === "Partially Paid") return "inv-partial";
  return "inv-current";
};

export function InvoiceTable({ rows, kind, orgSettings, activeCompany, workspace }) {
  const emptyTitle = kind === "payable" ? "No outstanding payables" : "No outstanding receivables";
  const emptyCopy = kind === "payable"
    ? "Supplier invoices will appear here after you record a purchase."
    : "Customer invoices will appear here after you record a credit sale.";
  if (!rows.length) {
    return <AccEmpty title={emptyTitle} copy={emptyCopy} />;
  }
  return (
    <>
      <div className="table spacer acc-table-wrap accounts-invoice-table acc-invoice-desktop">
        <table>
          <thead>
            <tr>
              <th>{kind === "payable" ? "Supplier" : "Customer"}</th>
              <th>Invoice</th>
              <th>Invoice date</th>
              <th>Due date</th>
              <th className="acc-num">Amount</th>
              <th className="acc-num">Paid</th>
              <th className="acc-num">Outstanding</th>
              <th className="acc-num">Days overdue</th>
              <th>Status</th>
              <th>{kind === "payable" ? "Advice" : "Remind"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className={row.status === "Overdue" ? "acc-invoice-overdue" : ""}>
                <td>
                  <strong className="acc-invoice-party">{row.partyName}</strong>
                </td>
                <td><span className="acc-invoice-ref">{row.reference}</span></td>
                <td>{row.invoiceDate}</td>
                <td>{row.dueDate}</td>
                <td className="acc-num">{money(row.amount)}</td>
                <td className="acc-num acc-invoice-paid">{money(row.paid)}</td>
                <td className={`acc-num acc-invoice-out${row.status === "Overdue" ? " is-overdue" : row.outstanding > 0 ? "" : " is-clear"}`}>{money(row.outstanding)}</td>
                <td className="acc-num">{row.daysOverdue || 0}</td>
                <td><span className={`acc-status-pill ${invoiceStatusTone(row.status)}`}>{row.status}</span></td>
                <td className="acc-invoice-remind">
                  {kind === "payable"
                    ? <PaymentAdviceButton row={row} settings={orgSettings} company={activeCompany} workspace={workspace} compact />
                    : <ArReminderButton row={row} settings={orgSettings} company={activeCompany} workspace={workspace} compact />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="acc-invoice-cards spacer">
        {rows.map(row => (
          <article key={row.id} className={`card acc-invoice-card${row.status === "Overdue" ? " is-overdue" : ""}`}>
            <div className="acc-invoice-card-top">
              <div>
                <strong>{row.partyName}</strong>
                <p className="small">{row.reference} · due {row.dueDate}</p>
              </div>
              <span className={`acc-status-pill ${invoiceStatusTone(row.status)}`}>{row.status}</span>
            </div>
            <p className="acc-ledger-card-amounts">
              <span>Amount <strong>{money(row.amount)}</strong></span>
              <span>Paid <strong>{money(row.paid)}</strong></span>
              <span>Outstanding <strong>{money(row.outstanding)}</strong></span>
            </p>
            <div className="acc-invoice-remind">
              {kind === "payable"
                ? <PaymentAdviceButton row={row} settings={orgSettings} company={activeCompany} workspace={workspace} compact />
                : <ArReminderButton row={row} settings={orgSettings} company={activeCompany} workspace={workspace} compact />}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
