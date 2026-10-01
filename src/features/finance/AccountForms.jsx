import { useState } from "react";
import { Button, Field, Modal } from "../../components/ui.jsx";
import { formatInr as money } from "../../lib/formatMoney.js";
import { dailyInstallmentAmount } from "./calculations";
import { disbursementPayoutError, disbursementPayoutSplit, disbursementPayoutTotal } from "./disbursementMode.js";
import { annualRate, loanBalance, monthlyBalance, today } from "./loanState.js";
import { paymentModeLabel } from "./paymentFormat.js";
import { paymentExceedsRemaining, remainingCollectable } from "./paymentLimits.js";

export function PayoutModeFields({ mode, cash, upi, onMode, onCash, onUpi }) {
  return <>
    <Field className="span" label="Paid out by">
      <select value={mode || "cash"} onChange={event => onMode(event.target.value)}>
        <option value="cash">Cash</option>
        <option value="upi">UPI</option>
        <option value="bank">Bank transfer</option>
        <option value="cash_upi">Cash + UPI</option>
      </select>
    </Field>
    {(mode || "cash") === "cash_upi" && <>
      <Field label="Cash amount (₹)"><input type="number" min="0" step="0.01" value={cash ?? ""} onChange={event => onCash(event.target.value)} /></Field>
      <Field label="UPI amount (₹)"><input type="number" min="0" step="0.01" value={upi ?? ""} onChange={event => onUpi(event.target.value)} /></Field>
    </>}
  </>;
}
export function NewFinance({
  close,
  save,
  kind = "daily",
}) {
  const lockedKind = kind === "monthly" ? "monthly" : "daily";
  const isDaily = lockedKind === "daily";
  const [f, setF] = useState({
    kind: lockedKind,
    customerName: "",
    phone: "",
    address: "",
    aadhaar: "",
    pan: "",
    startDate: today(),
    collectionAmount: "10000",
    disbursedAmount: "",
    principal: "100000",
    annualRate: "3",
    penaltyRate: "5",
    disbursementMode: "cash",
    disbursementCashAmount: "",
    disbursementUpiAmount: ""
  });
  const [err, setErr] = useState("");
  const set = (k, v) => setF(x => ({
    ...x,
    [k]: v
  }));
  const submit = async () => {
    if (!f.customerName || !f.phone || isDaily && (+f.collectionAmount <= 0 || +f.disbursedAmount <= 0) || !isDaily && +f.principal <= 0) return setErr(isDaily ? "Enter customer details, the financed amount, and the actual positive amount paid to the customer." : "Complete the customer details and amount.");
    const payoutTotal = disbursementPayoutTotal(lockedKind, f.disbursedAmount, f.principal);
    const payoutErr = disbursementPayoutError(f.disbursementMode, payoutTotal, f.disbursementCashAmount, f.disbursementUpiAmount);
    if (payoutErr) return setErr(payoutErr);
    const payout = disbursementPayoutSplit(f.disbursementMode, payoutTotal, f.disbursementCashAmount, f.disbursementUpiAmount);
    const stamp = Date.now().toString().slice(-6);
    try {
      await save({
      ...f,
      kind: lockedKind,
      aadhaar: f.aadhaar.trim(),
      pan: f.pan.trim().toUpperCase(),
      id: `${isDaily ? "D" : "M"}${stamp}`,
      customerId: `C${stamp}`,
      pin: "0000",
      collectionAmount: +f.collectionAmount,
      // This is the actual amount entered by the financier; never calculate a default percentage.
      disbursedAmount: isDaily ? +f.disbursedAmount : +f.disbursedAmount,
      principal: +f.principal,
      annualRate: +f.annualRate,
      penaltyRate: +f.penaltyRate,
      dailyCollection: isDaily ? dailyInstallmentAmount(f.collectionAmount) : 0,
      rateChanges: [],
      disbursementMode: payout.mode,
      disbursementCashAmount: payout.cashAmount,
      disbursementUpiAmount: payout.upiAmount,
      transactions: []
      });
    } catch (error) { setErr(error.message || "Could not create the finance account."); }
  };
  return <Modal close={close}><h2 className="title">{isDaily ? "New daily finance account" : "New monthly finance account"}</h2><p className="copy">Customer portal access is enabled automatically with a generated PIN.</p><div className="form spacer"><Field label="Customer name *"><input value={f.customerName} onChange={e => set("customerName", e.target.value)} /></Field><Field label="Phone *"><input value={f.phone} onChange={e => set("phone", e.target.value)} /></Field><Field label="Start date"><input type="date" value={f.startDate} onChange={e => set("startDate", e.target.value)} /></Field><Field label="Address"><input value={f.address} onChange={e => set("address", e.target.value)} /></Field><div className="notice span"><strong>KYC details</strong> — store these only with customer consent.</div><Field label="Aadhaar number"><input inputMode="numeric" maxLength="12" placeholder="12-digit Aadhaar" value={f.aadhaar} onChange={e => set("aadhaar", e.target.value.replace(/\D/g, ""))} /></Field><Field label="PAN number"><input maxLength="10" placeholder="ABCDE1234F" value={f.pan} onChange={e => set("pan", e.target.value.toUpperCase())} /></Field>{isDaily ? <><Field label="Amount financed — repaid in 100 days (₹) *"><input type="number" min="1" value={f.collectionAmount} onChange={e => set("collectionAmount", e.target.value)} /></Field><Field label="Actual paid to customer (₹) *"><input type="number" min="1" placeholder="Enter the actual amount paid" value={f.disbursedAmount} onChange={e => set("disbursedAmount", e.target.value)} /></Field><PayoutModeFields mode={f.disbursementMode} cash={f.disbursementCashAmount} upi={f.disbursementUpiAmount} onMode={value => set("disbursementMode", value)} onCash={value => set("disbursementCashAmount", value)} onUpi={value => set("disbursementUpiAmount", value)} /><div className="notice span">Enter the actual amount paid to the customer. It is not calculated automatically and will be used in Profit &amp; Loss. The repayment schedule remains 100 days: {money(dailyInstallmentAmount(f.collectionAmount || 0))} per day.</div></> : <><Field label="Principal (₹) *"><input type="number" value={f.principal} onChange={e => set("principal", e.target.value)} /></Field><PayoutModeFields mode={f.disbursementMode} cash={f.disbursementCashAmount} upi={f.disbursementUpiAmount} onMode={value => set("disbursementMode", value)} onCash={value => set("disbursementCashAmount", value)} onUpi={value => set("disbursementUpiAmount", value)} /><Field label="Monthly interest rate (%)"><input type="number" value={f.annualRate} onChange={e => set("annualRate", e.target.value)} /></Field><Field label="Missed-interest penalty (%)"><input type="number" value={f.penaltyRate} onChange={e => set("penaltyRate", e.target.value)} /></Field></>}</div>{err && <p className="red small">{err}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={submit}>Create account</Button></div></Modal>;
}
export function Payment({
  loan,
  close,
  save
}) {
  const isDaily = loan.kind === "daily";
  const [f, setF] = useState({
    date: today(),
    mode: "upi",
    ref: "",
    amount: isDaily ? String(Math.min(Number(loan.dailyCollection || 0), remainingCollectable(loan))) : "",
    interestAmount: isDaily ? "" : String(Math.round(monthlyBalance(loan) * annualRate(loan, today()) / 100)),
    principalAmount: "",
    penaltyAmount: "",
    cashAmount: "",
    upiAmount: "",
    notes: ""
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(x => ({
    ...x,
    [k]: v
  }));
  const total = isDaily ? Number(f.amount || 0) : Number(f.interestAmount || 0) + Number(f.principalAmount || 0) + Number(f.penaltyAmount || 0);
  const splitTotal = Number(f.cashAmount || 0) + Number(f.upiAmount || 0);
  const submit = async () => {
    if (busy) return;
    if (!(total > 0)) return setError("Enter a valid collection amount.");
    if (isDaily && paymentExceedsRemaining(loan, { amount: total })) {
      return setError(`Collection cannot exceed the remaining balance of ${money(remainingCollectable(loan))}.`);
    }
    if (!isDaily && paymentExceedsRemaining(loan, { principalAmount: Number(f.principalAmount || 0) })) {
      return setError(`Principal repaid cannot exceed the remaining principal of ${money(remainingCollectable(loan))}.`);
    }
    const isSplit = f.mode === "cash_upi";
    if (isSplit && (!(Number(f.cashAmount) > 0) || !(Number(f.upiAmount) > 0) || Math.abs(splitTotal - total) > 0.001)) return setError("Cash and UPI amounts must both be positive and equal the total collected.");
    setError("");
    setBusy(true);
    try { await save({
      ...f,
      id: `P${Date.now()}`,
      amount: total,
      interestAmount: Number(f.interestAmount || 0),
      principalAmount: Number(f.principalAmount || 0),
      penaltyAmount: Number(f.penaltyAmount || 0),
      cashAmount: isSplit ? Number(f.cashAmount) : f.mode === "cash" ? total : 0,
      upiAmount: isSplit ? Number(f.upiAmount) : f.mode === "upi" ? total : 0
    }); } catch (err) { setError(err?.message || "Could not save payment. Please try again."); } finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">Record payment</h2><p className="copy">{loan.customerName} · Current balance {money(loanBalance(loan))}</p><div className="form spacer"><Field label="Payment date"><input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field><Field label="Payment mode"><select value={f.mode} onChange={e => set("mode", e.target.value)}><option value="upi">UPI</option><option value="cash">Cash</option><option value="cash_upi">Cash + UPI</option><option value="bank">Bank transfer</option></select></Field>{isDaily ? <Field className="span" label="Collection amount (₹)"><input type="number" value={f.amount} onChange={e => set("amount", e.target.value)} /></Field> : <><Field label="Interest paid (₹)"><input type="number" value={f.interestAmount} onChange={e => set("interestAmount", e.target.value)} /></Field><Field label="Principal repaid (₹)"><input type="number" value={f.principalAmount} onChange={e => set("principalAmount", e.target.value)} /></Field><Field label="Penalty paid (₹)"><input type="number" value={f.penaltyAmount} onChange={e => set("penaltyAmount", e.target.value)} /></Field><div className="card"><div className="metric-label">Total received</div><div className="metric-value green">{money((+f.interestAmount || 0) + (+f.principalAmount || 0) + (+f.penaltyAmount || 0))}</div></div></>}{f.mode === "cash_upi" && <><Field label="Cash amount (₹)"><input type="number" min="0" value={f.cashAmount} onChange={e => set("cashAmount", e.target.value)} /></Field><Field label="UPI amount (₹)"><input type="number" min="0" value={f.upiAmount} onChange={e => set("upiAmount", e.target.value)} /></Field><div className="card span"><div className="metric-label">Total collected</div><div className="metric-value green">{money(total)}</div><div className="small">Cash {money(f.cashAmount)} + UPI {money(f.upiAmount)} = {money(splitTotal)}</div></div></>}<Field label="UPI / bank reference"><input value={f.ref} onChange={e => set("ref", e.target.value)} /></Field><Field label="Notes"><input value={f.notes} onChange={e => set("notes", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save payment"}</Button></div></Modal>;
}
export function EditAccount({ loan, close, save }) {
  const isDaily = loan.kind === "daily";
  const [form, setForm] = useState({ ...loan, kind: loan.kind });
  const [error, setError] = useState("");
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async () => {
    try {
      const kind = loan.kind;
      const payoutTotal = disbursementPayoutTotal(kind, form.disbursedAmount, form.principal);
      const payoutErr = disbursementPayoutError(form.disbursementMode, payoutTotal, form.disbursementCashAmount, form.disbursementUpiAmount);
      if (payoutErr) return setError(payoutErr);
      const payout = disbursementPayoutSplit(form.disbursementMode, payoutTotal, form.disbursementCashAmount, form.disbursementUpiAmount);
      const updated = {
        ...form,
        kind,
        collectionAmount: +form.collectionAmount,
        disbursedAmount: kind === "daily" ? +form.disbursedAmount : 0,
        dailyCollection: kind === "daily" ? dailyInstallmentAmount(form.collectionAmount) : 0,
        principal: +form.principal,
        annualRate: +form.annualRate,
        penaltyRate: +form.penaltyRate,
        disbursementMode: payout.mode,
        disbursementCashAmount: payout.cashAmount,
        disbursementUpiAmount: payout.upiAmount,
      };
      await save(updated); close();
    } catch (err) { setError(err.message || "Could not update the account."); }
  };
  return <Modal><h2 className="title">{isDaily ? "Edit daily finance account" : "Edit monthly finance account"}</h2><p className="copy">Correct account details. Account type cannot be changed. Changes are recorded in the audit log.</p><div className="form spacer"><Field label="Customer name"><input value={form.customerName} onChange={e => set("customerName", e.target.value)} /></Field><Field label="Phone"><input value={form.phone} onChange={e => set("phone", e.target.value)} /></Field><Field label="Collection start date"><input type="date" value={form.startDate} disabled /></Field><Field label="Address"><input value={form.address} onChange={e => set("address", e.target.value)} /></Field>{isDaily ? <><Field label="100-day repayment amount (₹)"><input type="number" value={form.collectionAmount} onChange={e => set("collectionAmount", e.target.value)} /></Field><Field label="Paid to customer (₹)"><input type="number" min="0" value={form.disbursedAmount} onChange={e => set("disbursedAmount", e.target.value)} /></Field><PayoutModeFields mode={form.disbursementMode} cash={form.disbursementCashAmount} upi={form.disbursementUpiAmount} onMode={value => set("disbursementMode", value)} onCash={value => set("disbursementCashAmount", value)} onUpi={value => set("disbursementUpiAmount", value)} /><div className="notice span">Paid to customer is editable for corrections. Profit, loss and outstanding figures update automatically from the saved value.</div></> : <><Field label="Principal (₹)"><input type="number" value={form.principal} onChange={e => set("principal", e.target.value)} /></Field><PayoutModeFields mode={form.disbursementMode} cash={form.disbursementCashAmount} upi={form.disbursementUpiAmount} onMode={value => set("disbursementMode", value)} onCash={value => set("disbursementCashAmount", value)} onUpi={value => set("disbursementUpiAmount", value)} /><Field label="Monthly interest rate (%)"><input type="number" value={form.annualRate} onChange={e => set("annualRate", e.target.value)} /></Field><Field label="Penalty rate (%)"><input type="number" value={form.penaltyRate} onChange={e => set("penaltyRate", e.target.value)} /></Field><div className="notice span">A rate change applies from today. Interest already due for earlier months stays at the previous rate.</div></>}</div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={submit}>Save changes</Button></div></Modal>;
}
export function PaymentNoteEditor({ transaction, close, save }) {
  const [notes, setNotes] = useState(transaction.notes || "");
  const [error, setError] = useState("");
  const submit = async () => { try { await save(transaction, notes); close(); } catch (e) { setError(e.message || "Could not save notes."); } };
  return <Modal><h2 className="title">Edit payment notes</h2><Field className="spacer" label="Notes / comments"><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add a collection note" /></Field>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={submit}>Save notes</Button></div></Modal>;
}
export function PaymentCorrectionEditor({ loan, transaction, close, save }) {
  const isDaily = loan.kind === "daily";
  const isSplit = transaction.mode === "cash_upi";
  const [f, setF] = useState({
    amount: String(transaction.amount ?? ""),
    interestAmount: String(transaction.interestAmount ?? 0),
    principalAmount: String(transaction.principalAmount ?? 0),
    penaltyAmount: String(transaction.penaltyAmount ?? 0),
    cashAmount: String(transaction.cashAmount ?? 0),
    upiAmount: String(transaction.upiAmount ?? 0),
    notes: transaction.notes || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setF(current => ({ ...current, [key]: value }));
  const total = isDaily ? Number(f.amount || 0) : Number(f.interestAmount || 0) + Number(f.principalAmount || 0) + Number(f.penaltyAmount || 0);
  const splitTotal = Number(f.cashAmount || 0) + Number(f.upiAmount || 0);
  const submit = async () => {
    if (!(total > 0)) return setError("Enter a valid collection amount.");
    if (isDaily && paymentExceedsRemaining(loan, { amount: total, excludePaymentId: transaction.id })) {
      return setError(`Collection cannot exceed the remaining balance of ${money(remainingCollectable(loan, { excludePaymentId: transaction.id }))}.`);
    }
    if (!isDaily && paymentExceedsRemaining(loan, { principalAmount: Number(f.principalAmount || 0), excludePaymentId: transaction.id })) {
      return setError(`Principal repaid cannot exceed the remaining principal of ${money(remainingCollectable(loan, { excludePaymentId: transaction.id }))}.`);
    }
    if (isSplit && (!(Number(f.cashAmount) > 0) || !(Number(f.upiAmount) > 0) || Math.abs(splitTotal - total) > 0.001)) {
      return setError("Cash and UPI amounts must both be positive and equal the total collected.");
    }
    setBusy(true); setError("");
    try {
      await save({
        ...transaction,
        amount: total,
        interestAmount: Number(f.interestAmount || 0),
        principalAmount: Number(f.principalAmount || 0),
        penaltyAmount: Number(f.penaltyAmount || 0),
        cashAmount: isSplit ? Number(f.cashAmount) : transaction.mode === "cash" ? total : 0,
        upiAmount: isSplit ? Number(f.upiAmount) : transaction.mode === "upi" ? total : 0,
        notes: f.notes,
      });
      close();
    } catch (err) {
      setError(err?.message || "Could not update this payment.");
    } finally {
      setBusy(false);
    }
  };
  return <Modal close={close}><h2 className="title">Edit payment</h2><p className="copy">{loan.customerName} · {transaction.date} · {paymentModeLabel(transaction)}</p><div className="form spacer">{isDaily ? <Field className="span" label="Collection amount (₹)"><input type="number" min="0.01" step="0.01" value={f.amount} onChange={e => set("amount", e.target.value)} /></Field> : <><Field label="Interest paid (₹)"><input type="number" min="0" step="0.01" value={f.interestAmount} onChange={e => set("interestAmount", e.target.value)} /></Field><Field label="Principal repaid (₹)"><input type="number" min="0" step="0.01" value={f.principalAmount} onChange={e => set("principalAmount", e.target.value)} /></Field><Field label="Penalty paid (₹)"><input type="number" min="0" step="0.01" value={f.penaltyAmount} onChange={e => set("penaltyAmount", e.target.value)} /></Field><div className="card span"><div className="metric-label">Total received</div><div className="metric-value green">{money(total)}</div></div></>}{isSplit && <><Field label="Cash amount (₹)"><input type="number" min="0" step="0.01" value={f.cashAmount} onChange={e => set("cashAmount", e.target.value)} /></Field><Field label="UPI amount (₹)"><input type="number" min="0" step="0.01" value={f.upiAmount} onChange={e => set("upiAmount", e.target.value)} /></Field><div className="card span"><div className="small">Cash {money(f.cashAmount)} + UPI {money(f.upiAmount)} = {money(splitTotal)}</div></div></>}<Field className="span" label="Notes / comments"><input value={f.notes} onChange={e => set("notes", e.target.value)} placeholder="Add a collection note" /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close} disabled={busy}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save changes"}</Button></div></Modal>;
}
export function AccountStatusModal({ loan, status, close, save }) {
  const isClosing = status === "closed";
  const isBankrupt = status === "bankrupt";
  const requiresNote = isClosing || isBankrupt;
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title = isBankrupt ? "Mark account bankrupt" : isClosing ? "Close account" : "Reopen account";
  const description = isBankrupt
    ? "The outstanding balance will be recorded as a loss. Add a reason for your records."
    : isClosing
      ? "Close only after full repayment. New collections will be disabled."
      : "This account will become active again and collections can resume.";
  const submit = async () => {
    if (requiresNote && !note.trim()) return setError("A note is required.");
    setBusy(true); setError("");
    try {
      await save(loan, status, requiresNote ? note.trim() : "Account reopened by financier");
      close();
    } catch (err) {
      setError(err?.message || "Could not update account status.");
    } finally {
      setBusy(false);
    }
  };
  return <Modal close={close}><h2 className="title">{title}</h2><p className="copy">{loan.customerName} · {description}</p>{requiresNote && <Field className="spacer" label={isBankrupt ? "Bankruptcy reason" : "Closure note"}><textarea rows={4} value={note} onChange={event => setNote(event.target.value)} placeholder={isBankrupt ? "Why is this account being marked bankrupt?" : "Confirm full repayment before closing."} /></Field>}{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close} disabled={busy}>Cancel</Button><Button className={isBankrupt ? "danger primary" : "primary"} disabled={busy} onClick={submit}>{busy ? "Saving…" : title}</Button></div></Modal>;
}
