import { useState } from "react";
import { Select } from "../../../components/Select.jsx";
import {
  finalizePredefinedChitMonth,
  updatePredefinedChitPayment,
  updatePredefinedChitScheduleMonth,
  fetchPredefinedChitPaymentById,
} from "../../../lib/financeRepository";
import { buildChitReceipt } from "../../receipts/model/receiptModel.js";
import { buildPredefinedLiftPayload } from "../../receipts/io/transactionConfirmations.js";
import { roundMoney } from "../model/calculations";
import { cashUpiSplit, cashUpiSplitIsValid } from "../../finance/model/paymentSplit";
import { disbursementPayoutError, disbursementPayoutSplit } from "../../finance/model/disbursementMode";
import { today, money, enrollmentName } from "../model/chitFormat.js";
import { fireChitLiftWhatsApp } from "../io/chitNotifications.js";
import { Button, Field, Metric } from "../../../components/ui.jsx";
import { Modal } from "../components/ChitUi.jsx";

function predefinedLiftSaveError(err) {
  const message = String(err?.message || "");
  if (/scheme_member_month_key/i.test(message)) {
    return "This member already has payment rows for later months. Paste 094 in the Supabase SQL editor, then finalize again. Recorded payments stay as they are.";
  }
  return message || "Could not finalize this predefined month.";
}

export function PredefinedAssignModal({ token, item, enrollments, usedEnrollmentIds, close, done, scheme, orgSettings = {}, workspace = {} }) {
  const [enrollmentId, setEnrollmentId] = useState("");
  const [assignedDate, setAssignedDate] = useState(today());
  const [payoutMode, setPayoutMode] = useState("cash");
  const [payoutCash, setPayoutCash] = useState("");
  const [payoutUpi, setPayoutUpi] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eligible = enrollments.filter(row => row.status === "active" && !usedEnrollmentIds.has(row.id));
  const submit = async event => {
    event.preventDefault();
    if (!enrollmentId) return setError("Select a member.");
    const paid = Number(item.net_receivable);
    const payoutErr = disbursementPayoutError(payoutMode, paid, payoutCash, payoutUpi);
    if (payoutErr) return setError(payoutErr);
    const split = disbursementPayoutSplit(payoutMode, paid, payoutCash, payoutUpi);
    setBusy(true); setError("");
    try {
      const scheduleId = await finalizePredefinedChitMonth(token, {
        id: item.id, enrollmentId, assignedDate,
        payoutMode: split.mode, payoutCashAmount: split.cashAmount, payoutUpiAmount: split.upiAmount,
      });
      const enrollment = enrollments.find(row => row.id === enrollmentId);
      const toast = await fireChitLiftWhatsApp({
        token,
        settings: orgSettings,
        workspace,
        sourceId: scheduleId || item.id,
        payload: buildPredefinedLiftPayload({ scheme, item, enrollment, assignedDate }),
      });
      done(toast);
    }
    catch (err) { setError(predefinedLiftSaveError(err)); }
    finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">Assign Member — Month {item.month_number}</h2><div className="grid metrics"><Metric label="EMI" value={money(item.emi)} /><Metric label="Bid amount" value={money(item.bid_amount)} color="gold" /><Metric label="Manager commission" value={money(item.manager_commission)} /><Metric label="Net receivable" value={money(item.net_receivable)} color="green" /></div><form onSubmit={submit}><div className="form spacer"><Field className="span" label="Member"><Select required value={enrollmentId} onChange={event => setEnrollmentId(event.target.value)}><option value="">Select member</option>{eligible.map(row => <option key={row.id} value={row.id}>Ticket {row.ticket_number} — {enrollmentName(row)}</option>)}</Select></Field><Field label="Finalized date"><input required type="date" value={assignedDate} onChange={event => setAssignedDate(event.target.value)} /></Field><Field label="Prize payout mode"><Select value={payoutMode} onChange={event => setPayoutMode(event.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="cash_upi">Cash + UPI</option></Select></Field>{payoutMode === "cash_upi" && <><Field label="Cash amount (₹)"><input type="number" min="0" value={payoutCash} onChange={event => setPayoutCash(event.target.value)} /></Field><Field label="UPI amount (₹)"><input type="number" min="0" value={payoutUpi} onChange={event => setPayoutUpi(event.target.value)} /></Field></>}</div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" disabled={busy || !eligible.length} type="submit">{busy ? "Finalizing…" : "Finalize assignment"}</Button></div></form></Modal>;
}
export function PredefinedScheduleEditModal({ token, item, close, done }) {
  const [form, setForm] = useState({ emi: item.emi, commAmount: item.comm_amount, auctionAmount: item.auction_amount, bidAmount: item.bid_amount, managerCommissionPercent: item.manager_commission_percent });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError("");
    try { await updatePredefinedChitScheduleMonth(token, { id: item.id, ...form }); done(); }
    catch (err) { setError(err.message || "Could not update this schedule month."); }
    finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">Edit Month {item.month_number}</h2><form onSubmit={submit}><div className="form spacer"><Field label="EMI (₹)"><input required type="number" min="0" value={form.emi} onChange={e => set("emi", e.target.value)} /></Field><Field label="COMM (₹)"><input required type="number" min="0" value={form.commAmount} onChange={e => set("commAmount", e.target.value)} /></Field><Field label="Auction amount (₹)"><input required type="number" min="0" value={form.auctionAmount} onChange={e => set("auctionAmount", e.target.value)} /></Field><Field label="Bid amount (₹)"><input required type="number" min="0" value={form.bidAmount} onChange={e => set("bidAmount", e.target.value)} /></Field><Field label="Manager commission (%)"><input required type="number" min="0" max="100" step=".01" value={form.managerCommissionPercent} onChange={e => set("managerCommissionPercent", e.target.value)} /></Field></div><p className="notice">Manager commission and net receivable are recalculated by the backend. Finalized months cannot be edited.</p>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save month"}</Button></div></form></Modal>;
}
export function PredefinedPaymentModal({ token, payment, memberName, memberPhone, scheme, close, done, orgSettings = {}, workspace = {}, onReceipt }) {
  const [form, setForm] = useState({ amountPaid: payment.amount_paid || payment.amount_due, paidDate: payment.paid_date || today(), paymentMode: payment.payment_mode || "upi", cash: payment.cash_amount || "", upi: payment.upi_amount || "", paymentReference: payment.payment_reference || "", notes: payment.notes || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amountDue = roundMoney(payment.amount_due);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    const value = Number(form.amountPaid);
    const split = cashUpiSplit(form.paymentMode, value, form.cash, form.upi);
    if (!(value > 0) || value > Number(payment.amount_due)) return setError("Enter an amount within the scheduled payment.");
    if (!cashUpiSplitIsValid(form.paymentMode, value, split.cash, split.upi)) return setError("Cash + UPI must equal the total.");
    setBusy(true); setError("");
    try {
      await updatePredefinedChitPayment(token, { id: payment.id, ...form, cashAmount: split.cash, upiAmount: split.upi });
      const row = await fetchPredefinedChitPaymentById(token, payment.id);
      if (row?.receipt_number && onReceipt) {
        onReceipt(buildChitReceipt({
          source: "chit_predefined",
          paymentRow: row,
          memberName,
          memberPhone,
          schemeName: scheme?.name || "",
          schemeDuration: scheme?.duration_months || 0,
          schemeStartDate: scheme?.start_date || "",
          settings: orgSettings,
          workspace,
        }));
      }
      done();
    }
    catch (err) { setError(err.message || "Could not save this payment."); }
    finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">{payment.amount_paid ? "Edit" : "Record"} EMI payment</h2><form onSubmit={submit}><div className="form spacer"><Field label="Member"><input disabled value={memberName || "Member"} /></Field><Field label="Expected EMI"><input disabled value={money(amountDue)} /></Field><Field label="Amount paid (₹)"><input required type="number" min="0.01" max={amountDue} step="0.01" value={form.amountPaid} onChange={e => set("amountPaid", e.target.value)} /></Field><Field label="Payment date"><input required type="date" value={form.paidDate} onChange={e => set("paidDate", e.target.value)} /></Field><Field label="Payment mode"><Select value={form.paymentMode} onChange={e => set("paymentMode", e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="cash_upi">Cash + UPI</option></Select></Field>{form.paymentMode === "cash_upi" && <><Field label="Cash amount (₹)"><input type="number" min="0" value={form.cash} onChange={e => set("cash", e.target.value)} /></Field><Field label="UPI amount (₹)"><input type="number" min="0" value={form.upi} onChange={e => set("upi", e.target.value)} /></Field></>}<Field label="Reference"><input value={form.paymentReference} onChange={e => set("paymentReference", e.target.value)} /></Field><Field label="Notes"><input value={form.notes} onChange={e => set("notes", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save payment"}</Button></div></form></Modal>;
}
