import { Fragment, useState } from "react";
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

export function linesForVoucher(voucherItemLines, voucherId) {
  return (voucherItemLines || []).filter(line => line.voucherId === voucherId);
}

export function GoodsLines({ lines, narration, empty }) {
  if (lines?.length) {
    return (
      <table className="acc-goods-lines">
        <thead>
          <tr>
            <th>Item</th>
            <th className="acc-num">Qty</th>
            <th className="acc-num">Rate</th>
            <th className="acc-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(line => (
            <tr key={line.id || `${line.lineNo}-${line.itemName}`}>
              <td>{line.itemName || "Item"}{line.itemSku ? <span className="small"> · {line.itemSku}</span> : null}</td>
              <td className="acc-num">{line.quantity} {line.unit || ""}</td>
              <td className="acc-num">{money(line.rate)}</td>
              <td className="acc-num">{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <p className="small">{narration || empty}</p>;
}

export function SettledGoods({ voucher, vouchers, voucherItemLines, kind }) {
  const links = Array.isArray(voucher?.settlements) ? voucher.settlements.filter(link => link.invoiceVoucherId && Number(link.amount) > 0) : [];
  const noun = kind === "payable" ? "purchase" : "sale";
  if (!links.length) {
    return <p className="small">This {kind === "payable" ? "payment" : "receipt"} is not linked to one {noun}. It was applied to the oldest open bill.</p>;
  }
  return (
    <div className="acc-goods-stack">
      {links.map(link => {
        const invoice = (vouchers || []).find(item => item.id === link.invoiceVoucherId);
        return (
          <div key={`${link.invoiceVoucherId}-${link.amount}`}>
            <p className="small"><strong>{invoice?.voucherNumber || "Bill"}</strong> · settled {money(link.amount)}</p>
            <GoodsLines
              lines={linesForVoucher(voucherItemLines, link.invoiceVoucherId)}
              narration={invoice?.narration}
              empty={`This ${noun} was entered as an amount, with no item lines.`}
            />
          </div>
        );
      })}
    </div>
  );
}

export function InvoiceTable({ rows, kind, orgSettings, activeCompany, workspace, voucherItemLines = [] }) {
  const [openId, setOpenId] = useState(null);
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
            {rows.map(row => {
              const open = openId === row.id;
              const goods = (
                <GoodsLines
                  lines={linesForVoucher(voucherItemLines, row.voucherId || String(row.id).split(":")[0])}
                  narration={row.narration}
                  empty={kind === "payable" ? "This purchase was entered as an amount, with no item lines." : "This sale was entered as an amount, with no item lines."}
                />
              );
              return (
                <Fragment key={row.id}>
                  <tr className={row.status === "Overdue" ? "acc-invoice-overdue" : ""}>
                    <td>
                      <strong className="acc-invoice-party">{row.partyName}</strong>
                    </td>
                    <td>
                      <button type="button" className="acc-invoice-ref-btn" aria-expanded={open} onClick={() => setOpenId(current => current === row.id ? null : row.id)}>
                        {row.reference}
                      </button>
                    </td>
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
                  {open ? <tr className="acc-goods-row"><td colSpan={10}>{goods}</td></tr> : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="acc-invoice-cards spacer">
        {rows.map(row => (
          <article key={row.id} className={`card acc-invoice-card${row.status === "Overdue" ? " is-overdue" : ""}`}>
            <div className="acc-invoice-card-top">
              <div>
                <strong>{row.partyName}</strong>
                <p className="small">
                  <button type="button" className="acc-invoice-ref-btn" aria-expanded={openId === row.id} onClick={() => setOpenId(current => current === row.id ? null : row.id)}>
                    {row.reference}
                  </button>
                  {" · due "}{row.dueDate}
                </p>
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
            {openId === row.id && (
              <GoodsLines
                lines={linesForVoucher(voucherItemLines, row.voucherId || String(row.id).split(":")[0])}
                narration={row.narration}
                empty={kind === "payable" ? "This purchase was entered as an amount, with no item lines." : "This sale was entered as an amount, with no item lines."}
              />
            )}
          </article>
        ))}
      </div>
    </>
  );
}
