import { useState } from "react";
import { Select } from "../../../components/Select.jsx";
import { recordChitMonthlyBid, updateChitInstallmentPayment, fetchChitInstallmentById } from "../../../lib/financeRepository";
import { buildChitReceipt } from "../../receipts/model/receiptModel.js";
import { buildAuctionLiftPayload } from "../../receipts/io/transactionConfirmations.js";
import { today, money, enrollmentName } from "../model/chitFormat.js";
import { calculateDividend } from "../model/calculations.js";
import { fireChitLiftWhatsApp } from "../io/chitNotifications.js";
import { Button, Field } from "../../../components/ui.jsx";
import { Modal } from "../components/ChitUi.jsx";
import { ChitPaymentForm } from "../components/ChitPaymentForm.jsx";

export function ChitBidModal({ token, scheme, enrollments, nextMonth, close, done, orgSettings = {}, workspace = {} }) {
  const [f, setF] = useState({ month: nextMonth, date: today(), winner: "", amount: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setF(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    const winner = enrollments.find(item => item.id === f.winner);
    const month = Number(f.month);
    const duration = Number(scheme.duration_months);
    if (!winner || !(Number(f.amount) > 0)) return setError("Select a lift member and enter a lift amount.");
    if (!Number.isInteger(month) || month < 1 || (duration > 0 && month > duration)) return setError(`Month must be between 1 and ${duration || 1}.`);
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
  // Calculated values, shown as the owner types. The server recalculates and stores them when the lift is saved.
  const preview = (() => {
    try {
      return Number(f.amount) > 0 ? calculateDividend({ chitValue: scheme.chit_value, winningBidAmount: Number(f.amount), commissionPercent: scheme.commission_percent, totalMembers: scheme.member_count }) : null;
    } catch (err) { return { error: err.message }; }
  })();
  return <Modal close={close}><h2 className="title">Lift Chit{f.month ? ` — Month ${f.month}` : ""}</h2><form onSubmit={submit}><div className="form spacer"><Field label="Month number"><input type="number" min="1" required value={f.month} onChange={e => set("month", e.target.value)} /></Field><Field label="Lift date"><input type="date" required value={f.date} onChange={e => set("date", e.target.value)} /></Field><Field className="span" label="Lift member"><Select required value={f.winner} onChange={e => set("winner", e.target.value)}><option value="">Select member</option>{enrollments.map(item => <option key={item.id} value={item.id}>Ticket {item.ticket_number} — {enrollmentName(item)}</option>)}</Select></Field><Field className="span" label="Lift amount paid to member (₹)"><input type="number" min="0.01" step="0.01" required value={f.amount} onChange={e => set("amount", e.target.value)} /></Field><Field className="span" label="Notes"><input value={f.notes} onChange={e => set("notes", e.target.value)} /></Field></div>{preview && !preview.error && <dl className="chit-form-context chit-form-calculated spacer" aria-label="Calculated values"><div><dt>Discount bid</dt><dd>{money(preview.discount)}</dd></div><div><dt>Commission</dt><dd>{money(preview.commission)}</dd></div><div><dt>Distributable</dt><dd>{money(preview.distributable)}</dd></div><div><dt>Dividend / member</dt><dd>{money(preview.dividendPerMember)}</dd></div></dl>}{preview?.error && <p className="small red">{preview.error}</p>}<p className="small">Discount, commission and dividend are calculated from the lift amount and saved with this month. Allowed lift amount: {Number(scheme.min_bid_percent)}–{Number(scheme.max_bid_percent)}% of the chit value.</p>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button type="button" disabled={busy} onClick={close}>Cancel</Button><Button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : "Lift Chit"}</Button></div></form></Modal>;
}
export function ChitPaymentModal({ token, installment, memberName, memberPhone, scheme, close, done, orgSettings = {}, workspace = {}, onReceipt }) {
  const [f, setF] = useState({ amount: String(installment.amount_paid || installment.net_amount_due), mode: installment.payment_mode || "upi", date: installment.paid_date || today(), cash: String(installment.cash_amount || ""), upi: String(installment.upi_amount || ""), ref: installment.payment_reference || "", notes: installment.notes || "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setF(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    const amount = Number(f.amount);
    const cash = f.mode === "cash" ? amount : f.mode === "cash_upi" ? Number(f.cash || 0) : 0;
    const upi = f.mode === "upi" ? amount : f.mode === "cash_upi" ? Number(f.upi || 0) : 0;
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
  const cycleMonth = installment.payment_month || installment.cycle_number || "";
  const expected = Number(installment.net_amount_due || 0);
  const paidAlready = Number(installment.amount_paid || 0);
  return <Modal close={close}><h2 className="title">{installment.amount_paid ? "Edit payment" : "Record payment"}</h2><ChitPaymentForm schemeName={scheme?.name} dueDate={installment.due_date} recordedBy={workspace?.fullName || workspace?.businessName || "Owner"} memberName={memberName} paymentMonth={cycleMonth} amountDue={expected} amountDueLabel="Expected" previouslyPaid={paidAlready} outstanding={Math.max(0, expected - paidAlready)} amount={f.amount} onAmount={value => set("amount", value)} date={f.date} onDate={value => set("date", value)} mode={f.mode} onMode={value => set("mode", value)} cash={f.cash} onCash={value => set("cash", value)} upi={f.upi} onUpi={value => set("upi", value)} reference={f.ref} onReference={value => set("ref", value)} notes={f.notes} onNotes={value => set("notes", value)} error={error} busy={busy} onSubmit={submit} onCancel={close} /></Modal>;
}
