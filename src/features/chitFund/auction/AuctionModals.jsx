import { useState } from "react";
import { recordChitMonthlyBid, updateChitInstallmentPayment, fetchChitInstallmentById } from "../../../lib/financeRepository";
import { buildChitReceipt } from "../../receipts/model/receiptModel.js";
import { buildAuctionLiftPayload } from "../../receipts/io/transactionConfirmations.js";
import { today, enrollmentName } from "../model/chitFormat.js";
import { fireChitLiftWhatsApp } from "../io/chitNotifications.js";
import { Button, Field } from "../../../components/ui.jsx";
import { Modal } from "../components/ChitUi.jsx";

export function ChitBidModal({ token, scheme, enrollments, nextMonth, close, done, orgSettings = {}, workspace = {} }) {
  const [f, setF] = useState({ month: nextMonth, date: today(), winner: "", amount: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setF(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    const winner = enrollments.find(item => item.id === f.winner);
    if (!winner || !(Number(f.amount) > 0)) return setError("Select a winning member and enter a valid bid amount.");
    setBusy(true); setError("");
    try {
      const payout = Number(f.amount);
      const cycleId = await recordChitMonthlyBid(token, { schemeId: scheme.id, cycleNumber: Number(f.month), cycleDate: f.date, winningEnrollmentId: winner.id, winningBidAmount: payout, notes: f.notes });
      const commission = Number(scheme.chit_value || 0) * Number(scheme.commission_percent || 0) / 100;
      const discount = Math.max(0, Number(scheme.chit_value || 0) - payout);
      const toast = await fireChitLiftWhatsApp({
        token,
        settings: orgSettings,
        workspace,
        sourceId: cycleId,
        payload: buildAuctionLiftPayload({
          scheme,
          enrollment: winner,
          cycleNumber: Number(f.month),
          cycleDate: f.date,
          winningBidAmount: payout,
          commission,
          discount,
          dividend: null,
          installment: scheme.installment_amount,
        }),
      });
      done(toast);
    } catch (err) { setError(err.message || "Could not save bid."); }
    finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">Record monthly bid</h2><form onSubmit={submit}><div className="form spacer"><Field label="Month number"><input type="number" min="1" required value={f.month} onChange={e => set("month", e.target.value)} /></Field><Field label="Bid date"><input type="date" required value={f.date} onChange={e => set("date", e.target.value)} /></Field><Field className="span" label="Winning member"><select required value={f.winner} onChange={e => set("winner", e.target.value)}><option value="">Select member</option>{enrollments.map(item => <option key={item.id} value={item.id}>Ticket {item.ticket_number} — {enrollmentName(item)}</option>)}</select></Field><Field className="span" label="Winning bid / payout amount (₹)"><input type="number" min="0.01" step="0.01" required value={f.amount} onChange={e => set("amount", e.target.value)} /></Field><Field className="span" label="Notes"><input value={f.notes} onChange={e => set("notes", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save bid"}</Button></div></form></Modal>;
}
export function ChitPaymentModal({ token, installment, memberName, memberPhone, scheme, close, done, orgSettings = {}, workspace = {}, onReceipt }) {
  const [f, setF] = useState({ amount: String(installment.amount_paid || installment.net_amount_due), mode: installment.payment_mode || "upi", date: installment.paid_date || today(), cash: String(installment.cash_amount || ""), upi: String(installment.upi_amount || ""), ref: installment.payment_reference || "", notes: installment.notes || "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setF(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    const amount = Number(f.amount);
    const cash = f.mode === "cash" ? amount : f.mode === "upi" ? 0 : Number(f.cash || 0);
    const upi = f.mode === "upi" ? amount : f.mode === "cash" ? 0 : Number(f.upi || 0);
    if (!(amount > 0) || amount > Number(installment.net_amount_due)) return setError("Enter a valid amount within the installment balance.");
    if (f.mode === "cash_upi" && (cash <= 0 || upi <= 0 || Math.abs(cash + upi - amount) > 0.001)) return setError("Cash + UPI must equal the total.");
    setBusy(true); setError("");
    try {
      await updateChitInstallmentPayment(token, { id: installment.id, amountPaid: amount, paidDate: f.date, paymentMode: f.mode, paymentReference: f.ref, cashAmount: cash, upiAmount: upi, notes: f.notes });
      const row = await fetchChitInstallmentById(token, installment.id);
      if (row?.receipt_number && onReceipt) {
        onReceipt(buildChitReceipt({
          source: "chit_auction",
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
    } catch (err) { setError(err.message || "Could not save payment."); }
    finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">{installment.amount_paid ? "Edit payment" : "Record payment"}</h2><div className="form spacer"><Field label="Member"><input disabled value={memberName || "Member"} /></Field><Field label="Payment date"><input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field><Field label="Payment mode"><select value={f.mode} onChange={e => set("mode", e.target.value)}><option value="upi">UPI</option><option value="cash">Cash</option><option value="cash_upi">Cash + UPI</option></select></Field><Field className="span" label="Amount paid (₹)"><input type="number" min="0.01" step="0.01" value={f.amount} onChange={e => set("amount", e.target.value)} /></Field>{f.mode === "cash_upi" && <><Field label="Cash amount (₹)"><input type="number" min="0" value={f.cash} onChange={e => set("cash", e.target.value)} /></Field><Field label="UPI amount (₹)"><input type="number" min="0" value={f.upi} onChange={e => set("upi", e.target.value)} /></Field></>}<Field label="UPI / bank reference"><input value={f.ref} onChange={e => set("ref", e.target.value)} /></Field><Field label="Notes"><input value={f.notes} onChange={e => set("notes", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save payment"}</Button></div></Modal>;
}
