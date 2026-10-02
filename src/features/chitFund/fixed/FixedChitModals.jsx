import { useState } from "react";
import { finalizeFixedChitLift, updateFixedChitPayment, fetchFixedChitPaymentById } from "../../../lib/financeRepository";
import { buildChitReceipt } from "../../receipts/model/receiptModel.js";
import { buildFixedLiftPayload } from "../../receipts/io/transactionConfirmations.js";
import { fixedChitPostLiftMonthlyPayment, resolveFixedManagerCommission } from "../model/fixedChit";
import { roundMoney } from "../model/calculations";
import { cashUpiSplit, cashUpiSplitIsValid } from "../../finance/model/paymentSplit";
import { disbursementPayoutError, disbursementPayoutSplit } from "../../finance/model/disbursementMode";
import { today, money, enrollmentName } from "../model/chitFormat.js";
import { fireChitLiftWhatsApp } from "../io/chitNotifications.js";
import { Button, Field, Metric } from "../../../components/ui.jsx";
import { Modal } from "../components/ChitUi.jsx";

export function FixedChitLiftModal({ token, scheme, lift, enrollments, usedEnrollmentIds, close, done, orgSettings = {}, workspace = {} }) {
  const [enrollmentId, setEnrollmentId] = useState("");
  const [liftDate, setLiftDate] = useState(today());
  const [payoutMode, setPayoutMode] = useState("cash");
  const [payoutCash, setPayoutCash] = useState("");
  const [payoutUpi, setPayoutUpi] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const managerCommission = resolveFixedManagerCommission({
    chitValue: scheme.chit_value,
    fixedCommissionAmount: scheme.fixed_commission_amount,
    commissionPercent: scheme.commission_percent,
    lifts: [lift],
  }).amount;
  const eligible = enrollments.filter(item => item.status === "active" && !usedEnrollmentIds.has(item.id));
  const submit = async event => {
    event.preventDefault();
    if (!enrollmentId) return setError("Select a member.");
    const paid = Number(lift.lift_amount);
    const payoutErr = disbursementPayoutError(payoutMode, paid, payoutCash, payoutUpi);
    if (payoutErr) return setError(payoutErr);
    const split = disbursementPayoutSplit(payoutMode, paid, payoutCash, payoutUpi);
    setBusy(true); setError("");
    try {
      const liftId = await finalizeFixedChitLift(token, {
        schemeId: scheme.id, monthNumber: lift.month_number, enrollmentId, liftDate,
        payoutMode: split.mode, payoutCashAmount: split.cashAmount, payoutUpiAmount: split.upiAmount,
      });
      const enrollment = enrollments.find(item => item.id === enrollmentId);
      const toast = await fireChitLiftWhatsApp({
        token,
        settings: orgSettings,
        workspace,
        sourceId: liftId,
        payload: buildFixedLiftPayload({ scheme, lift, enrollment, liftDate, managerCommission }),
      });
      done(toast);
    } catch (err) { setError(err.message || "Could not finalize this Fixed Chit lift."); }
    finally { setBusy(false); }
  };
  const postLiftMonthlyPayment = fixedChitPostLiftMonthlyPayment(scheme.installment_amount, scheme.fixed_monthly_increment);
  return <Modal close={close}><h2 className="title">Lift Chit — Month {lift.month_number}</h2><div className="grid metrics"><Metric label="Lift amount" value={money(lift.lift_amount)} color="gold" /><Metric label="Manager commission" value={money(managerCommission)} /><Metric label="Monthly payment after lift" value={money(postLiftMonthlyPayment)} /><Metric label="Remaining months" value={Number(scheme.duration_months) - Number(lift.month_number)} /></div><form onSubmit={submit}><div className="form spacer"><Field className="span" label="Member"><select required value={enrollmentId} onChange={event => setEnrollmentId(event.target.value)}><option value="">Select member</option>{eligible.map(item => <option key={item.id} value={item.id}>Ticket {item.ticket_number} — {enrollmentName(item)}</option>)}</select></Field><Field label="Lift date"><input required type="date" value={liftDate} onChange={event => setLiftDate(event.target.value)} /></Field><Field label="Prize payout mode"><select value={payoutMode} onChange={event => setPayoutMode(event.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="cash_upi">Cash + UPI</option></select></Field>{payoutMode === "cash_upi" && <><Field label="Cash amount (₹)"><input type="number" min="0" value={payoutCash} onChange={event => setPayoutCash(event.target.value)} /></Field><Field label="UPI amount (₹)"><input type="number" min="0" value={payoutUpi} onChange={event => setPayoutUpi(event.target.value)} /></Field></>}</div>{!eligible.length && <p className="notice">No eligible member remains for this lift.</p>}{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" type="submit" disabled={busy || !eligible.length}>{busy ? "Finalizing…" : "Finalize lift"}</Button></div></form></Modal>;
}
export function FixedChitPaymentModal({ token, payment, memberName, memberPhone, scheme, close, done, orgSettings = {}, workspace = {}, onReceipt }) {
  const [amount, setAmount] = useState(String(payment.amount_paid || payment.amount_due));
  const [date, setDate] = useState(payment.paid_date || today());
  const [mode, setMode] = useState(payment.payment_mode || "upi");
  const [cash, setCash] = useState(String(payment.cash_amount || ""));
  const [upi, setUpi] = useState(String(payment.upi_amount || ""));
  const [reference, setReference] = useState(payment.payment_reference || "");
  const [notes, setNotes] = useState(payment.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amountDue = roundMoney(payment.amount_due);
  const submit = async event => {
    event.preventDefault();
    const value = Number(amount);
    const split = cashUpiSplit(mode, value, cash, upi);
    if (!(value > 0) || value > Number(payment.amount_due)) return setError("Enter an amount within the scheduled payment.");
    if (!cashUpiSplitIsValid(mode, value, split.cash, split.upi)) return setError("Cash + UPI must equal the total.");
    setBusy(true); setError("");
    try {
      await updateFixedChitPayment(token, { id: payment.id, amountPaid: value, paidDate: date, paymentMode: mode, paymentReference: reference, notes, cashAmount: split.cash, upiAmount: split.upi });
      const row = await fetchFixedChitPaymentById(token, payment.id);
      if (row?.receipt_number && onReceipt) {
        onReceipt(buildChitReceipt({
          source: "chit_fixed",
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
    } catch (err) { setError(err.message || "Could not save this Fixed Chit payment."); }
    finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">{payment.amount_paid ? "Edit" : "Record"} Fixed Chit payment</h2><form onSubmit={submit}><div className="form spacer"><Field label="Member"><input disabled value={memberName || "Member"} /></Field><Field label="Payment month"><input disabled value={`Month ${payment.payment_month}`} /></Field><Field label="Amount due"><input disabled value={money(amountDue)} /></Field><Field label="Amount paid (₹)"><input required type="number" min="0.01" max={amountDue} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></Field><Field label="Paid date"><input required type="date" value={date} onChange={event => setDate(event.target.value)} /></Field><Field label="Payment mode"><select value={mode} onChange={event => setMode(event.target.value)}><option value="upi">UPI</option><option value="cash">Cash</option><option value="cash_upi">Cash + UPI</option></select></Field>{mode === "cash_upi" && <><Field label="Cash amount (₹)"><input type="number" min="0" value={cash} onChange={event => setCash(event.target.value)} /></Field><Field label="UPI amount (₹)"><input type="number" min="0" value={upi} onChange={event => setUpi(event.target.value)} /></Field></>}<Field label="Reference"><input value={reference} onChange={event => setReference(event.target.value)} /></Field><Field className="span" label="Notes"><input value={notes} onChange={event => setNotes(event.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save payment"}</Button></div></form></Modal>;
}
