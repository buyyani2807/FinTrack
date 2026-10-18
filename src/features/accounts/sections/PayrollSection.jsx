import { useEffect, useMemo, useState } from "react";
import { Field, LabeledField } from "../../../components/ui.jsx";
import { todayIso } from "../../../lib/dates.js";
import { money, formatOverviewDate } from "../accountsFormat.js";
import { AccEmpty, AccSkeleton, AccTable, Modal } from "../components/AccUi.jsx";
import {
  createChartAccount,
  deletePayrollLeave,
  loadPayroll,
  postVoucher,
  savePayrollDays,
  savePayrollLeave,
  savePayrollProfile,
  savePayrollRun,
} from "../data/accountingRepository.js";
import { findAccount, newClientRequestId, SYSTEM_CODES } from "../model/accountingModel.js";
import {
  DAY_BASIS,
  DAY_STATUSES,
  LEAVE_TYPES,
  PAYROLL_DISCLAIMER,
  assertLeaveDraft,
  attendanceExceptions,
  attendanceMarks,
  calendarLead,
  deductionParts,
  emptyProfile,
  inclusiveDays,
  leaveTypeLabel,
  leavesOverlap,
  moneyAccounts,
  monthDates,
  monthEnd,
  monthLabel,
  monthStart,
  payrollRows,
  payrollVoucherLines,
  resolveDay,
} from "../model/payroll.js";
import "../payroll.css";

const amount = value => (Number.isInteger(Number(value)) ? String(Number(value)) : String(Number(value)));
const blankLeave = { partyId: "", leaveType: "paid", fromDate: "", toDate: "", note: "" };

const snapshotLine = (row, profile) => ({
  partyId: row.partyId,
  name: row.name,
  paidDays: row.paidDays,
  lopDays: row.lopDays,
  basis: row.basis,
  basic: Number(profile?.basic || row.basic || 0),
  hra: Number(profile?.hra || row.hra || 0),
  allowance: Number(profile?.allowance || row.allowance || 0),
  gross: row.gross,
  earned: row.earned,
  deductions: row.deductions,
  deductionTotal: row.deductionTotal,
  net: row.net,
  voucherId: row.voucherId || null,
});

function AmountFields({ values, onChange, fields }) {
  return fields.map(field => (
    <LabeledField key={field.id} label={field.label}>
      <input inputMode="decimal" min="0" value={values[field.id]} onChange={event => onChange(field.id, event.target.value)} />
    </LabeledField>
  ));
}

const PAY_FIELDS = [
  { id: "basic", label: "Basic" },
  { id: "hra", label: "House rent allowance" },
  { id: "allowance", label: "Other allowance" },
];
const DEDUCTION_FIELDS = [
  { id: "pf", label: "Provident fund" },
  { id: "esi", label: "ESI" },
  { id: "professionalTax", label: "Professional tax" },
  { id: "tds", label: "Tax deducted" },
  { id: "otherDeduction", label: "Other deduction" },
];

export function PayrollSection({
  tab = "payroll",
  token,
  parties,
  accounts,
  vouchers,
  companyName,
  canWrite,
  onRefresh,
  onOpenParties,
}) {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [payEdit, setPayEdit] = useState(null);
  const [profileParty, setProfileParty] = useState(null);
  const [profileForm, setProfileForm] = useState(null);
  const [deductionParty, setDeductionParty] = useState(null);
  const [deductionForm, setDeductionForm] = useState(null);
  const [slip, setSlip] = useState(null);
  const [confirmPost, setConfirmPost] = useState(false);
  const [pickedEmployee, setPickedEmployee] = useState("");
  const [markEdit, setMarkEdit] = useState(null);
  const [leaveForm, setLeaveForm] = useState(blankLeave);

  const employees = useMemo(
    () => (parties || []).filter(party => party.partyType === "employee" && party.isActive !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [parties],
  );
  const monthIso = `${month}-01`;
  const posted = bundle?.run?.status === "posted";
  const paidFrom = useMemo(() => moneyAccounts(accounts), [accounts]);

  const reload = async () => {
    setLoading(true);
    try {
      const next = await loadPayroll(token, monthIso);
      setBundle(next);
      setLoadError("");
    } catch (err) {
      setBundle(null);
      setLoadError(err.message || "Could not load payroll.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    loadPayroll(token, monthIso).then(next => {
      if (cancelled) return;
      setBundle(next);
      setLoadError("");
      setLoading(false);
    }).catch(err => {
      if (cancelled) return;
      setBundle(null);
      setLoadError(err.message || "Could not load payroll.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token, monthIso]);

  const savedOverrides = useMemo(() => {
    const next = {};
    if (bundle?.run?.status === "draft") {
      for (const line of bundle.run.lines || []) {
        if (line.partyId && line.deductions) next[line.partyId] = deductionParts(line.deductions);
      }
    }
    return next;
  }, [bundle]);
  const runKey = `${monthIso}:${bundle?.run?.id || "none"}:${bundle?.run?.status || "open"}`;
  const editingPay = payEdit?.key === runKey;
  const overrides = editingPay ? payEdit.overrides : savedOverrides;
  const payAccountId = editingPay
    ? payEdit.payAccountId
    : (bundle?.run?.payAccountId || paidFrom.find(account => account.accountType === "bank")?.id || paidFrom[0]?.id || "");
  const payDate = editingPay ? payEdit.payDate : (bundle?.run?.payDate || monthEnd(monthIso));
  const changePay = patch => setPayEdit({ key: runKey, overrides, payAccountId, payDate, ...patch });
  const attendancePartyId = employees.some(person => person.id === pickedEmployee) ? pickedEmployee : (employees[0]?.id || "");
  const baseMarks = useMemo(() => (
    bundle && attendancePartyId
      ? attendanceMarks({ partyId: attendancePartyId, month: monthIso, days: bundle.days, leaves: bundle.leave })
      : {}
  ), [bundle, attendancePartyId, monthIso]);
  const markKey = `${monthIso}:${attendancePartyId}:${(bundle?.days || []).map(day => `${day.partyId}${day.workDate}${day.status}`).join("|")}`;
  const marks = markEdit?.key === markKey ? markEdit.marks : baseMarks;

  const rows = useMemo(() => (bundle ? payrollRows({
    employees,
    month: monthIso,
    profiles: bundle.profiles,
    days: bundle.days,
    leaves: bundle.leave,
    overrides,
    run: bundle.run,
  }) : []), [bundle, employees, monthIso, overrides]);

  const leaveRows = useMemo(() => {
    if (!bundle) return [];
    const end = monthEnd(monthIso);
    return bundle.leave.filter(row => row.fromDate <= end && row.toDate >= monthStart(monthIso));
  }, [bundle, monthIso]);

  const runPayload = (status, lines) => {
    const account = paidFrom.find(item => item.id === payAccountId);
    return {
      month: monthStart(monthIso),
      payDate,
      payMode: account?.accountType || "bank",
      payAccountId: payAccountId || null,
      status,
      lines,
    };
  };

  const draftLines = () => rows.map(row => snapshotLine(
    row,
    (bundle?.profiles || []).find(profile => profile.partyId === row.partyId),
  ));

  const saveDraft = async () => {
    setBusy(true);
    setActionError("");
    try {
      await savePayrollRun(token, runPayload("draft", draftLines()));
      await reload();
    } catch (err) {
      setActionError(err.message || "Could not save this month.");
    } finally {
      setBusy(false);
    }
  };

  const postPay = async () => {
    setBusy(true);
    setActionError("");
    try {
      const start = monthStart(monthIso);
      let books = accounts;
      const held = rows.some(row => !row.error && row.earned > 0 && row.deductionTotal > 0);
      if (held && !findAccount(books, { code: SYSTEM_CODES.salaryDeductions })) {
        const id = await createChartAccount(token, {
          code: SYSTEM_CODES.salaryDeductions,
          name: "Salary deductions payable",
          groupType: "liability",
          accountType: "other",
          openingSide: "credit",
        });
        books = [...books, { id, code: SYSTEM_CODES.salaryDeductions, name: "Salary deductions payable", groupType: "liability", accountType: "other", isActive: true }];
      }
      let lines = draftLines().map(line => {
        const existing = (vouchers || []).find(voucher => voucher.sourceType === "salary"
          && voucher.sourceTransactionId === `${start}:${line.partyId}`
          && voucher.status === "posted");
        return { ...line, voucherId: line.voucherId || existing?.id || null };
      });
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.earned <= 0 || line.voucherId) continue;
        const description = `Salary for ${monthLabel(start)} · ${line.name}`;
        const voucherId = await postVoucher(token, {
          voucherType: "payment",
          date: payDate,
          narration: description,
          partyId: line.partyId,
          sourceModule: "payroll",
          sourceType: "salary",
          sourceTransactionId: `${start}:${line.partyId}`,
          clientRequestId: newClientRequestId(),
          lines: payrollVoucherLines({
            accounts: books,
            payAccountId,
            earned: line.earned,
            deductionTotal: line.deductionTotal,
            partyId: line.partyId,
            description,
          }),
        });
        lines = lines.map((item, itemIndex) => (itemIndex === index ? { ...item, voucherId } : item));
        await savePayrollRun(token, runPayload("draft", lines));
      }
      await savePayrollRun(token, runPayload("posted", lines));
      await onRefresh?.();
      await reload();
    } catch (err) {
      setActionError(err.message || "Could not post salary.");
      await onRefresh?.();
      await reload();
    } finally {
      setBusy(false);
      setConfirmPost(false);
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    setActionError("");
    try {
      const numbers = Object.fromEntries([...PAY_FIELDS, ...DEDUCTION_FIELDS].map(field => [field.id, Number(profileForm[field.id] || 0)]));
      if (Object.values(numbers).some(value => !Number.isFinite(value) || value < 0)) throw new Error("Amounts cannot be negative.");
      await savePayrollProfile(token, { partyId: profileParty.id, dayBasis: Number(profileForm.dayBasis || 0), ...numbers });
      setProfileParty(null);
      await reload();
    } catch (err) {
      setActionError(err.message || "Could not save pay.");
    } finally {
      setBusy(false);
    }
  };

  const saveAttendance = async () => {
    setBusy(true);
    setActionError("");
    try {
      await savePayrollDays(token, {
        partyId: attendancePartyId,
        month: monthIso,
        days: attendanceExceptions({ partyId: attendancePartyId, month: monthIso, marks, leaves: bundle.leave }),
      });
      await reload();
    } catch (err) {
      setActionError(err.message || "Could not save attendance.");
    } finally {
      setBusy(false);
    }
  };

  const addLeave = async () => {
    const problem = assertLeaveDraft(leaveForm) || (leavesOverlap(bundle.leave, leaveForm) ? "Leave already covers one of these dates." : "");
    if (problem) { setActionError(problem); return; }
    setBusy(true);
    setActionError("");
    try {
      await savePayrollLeave(token, leaveForm);
      setLeaveForm(blankLeave);
      await reload();
    } catch (err) {
      setActionError(err.message || "Could not save leave.");
    } finally {
      setBusy(false);
    }
  };

  const removeLeave = async id => {
    setBusy(true);
    setActionError("");
    try {
      await deletePayrollLeave(token, id);
      await reload();
    } catch (err) {
      setActionError(err.message || "Could not remove leave.");
    } finally {
      setBusy(false);
    }
  };

  const openProfile = person => {
    const profile = bundle.profiles.find(row => row.partyId === person.id) || emptyProfile(person.id);
    setProfileForm({
      dayBasis: profile.dayBasis,
      ...Object.fromEntries([...PAY_FIELDS, ...DEDUCTION_FIELDS].map(field => [field.id, amount(profile[field.id] || 0)])),
    });
    setProfileParty(person);
  };

  const openDeductions = row => {
    setDeductionForm(Object.fromEntries(DEDUCTION_FIELDS.map(field => [field.id, amount(row.deductions?.[field.id] || 0)])));
    setDeductionParty(row);
  };

  const printSlip = () => {
    document.body.classList.add("pay-slip-print");
    const done = () => document.body.classList.remove("pay-slip-print");
    window.addEventListener("afterprint", done, { once: true });
    window.print();
  };

  const blocked = posted || !canWrite || busy;
  const postable = rows.some(row => row.earned > 0) && rows.every(row => !row.error) && payDate && payAccountId;

  return <div className="acc-panel">
    <p className="copy pay-note">Monthly salary for employees in this company. Attendance and leave change the days paid. Collection agents stay in Collection Staff.</p>
    <div className="pay-toolbar">
      <LabeledField label="Month">
        <input type="month" value={month} onChange={event => { setMonth(event.target.value); setBundle(null); setLoading(true); }} />
      </LabeledField>
    </div>
    {loadError ? <p className="copy" role="alert">{loadError}</p> : null}
    {actionError ? <p className="copy" role="alert">{actionError}</p> : null}
    {loading && !bundle ? <AccSkeleton /> : null}
    {!loadError && bundle && !employees.length ? <AccEmpty title="No employees yet" copy="Add a person under Parties and set the type to Employee. Payroll uses those people." actionLabel="Open parties" onAction={onOpenParties} /> : null}

    {!loadError && bundle && employees.length > 0 && <>
      {posted ? <p className="copy pay-note">{monthLabel(monthIso)} is posted. Pay, attendance, and leave for this month stay as they were posted.</p> : null}

      {tab === "payroll" && <>
        <p className="copy pay-note">Salary is reduced only for absent days, half days, and unpaid leave. Weekly offs, holidays, and paid leave stay in the month’s salary. {PAYROLL_DISCLAIMER}</p>
        <div className="pay-toolbar">
          <LabeledField label="Pay date">
            <input type="date" value={payDate} disabled={blocked} onChange={event => changePay({ payDate: event.target.value })} />
          </LabeledField>
          <LabeledField label="Paid from">
            <select value={payAccountId} disabled={blocked} onChange={event => changePay({ payAccountId: event.target.value })}>
              {!paidFrom.length && <option value="">Add a cash, bank, or UPI ledger</option>}
              {paidFrom.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </LabeledField>
          {canWrite && !posted && <>
            <button type="button" className="btn" disabled={busy} onClick={saveDraft}>Save draft</button>
            <button type="button" className="btn primary" disabled={busy || !postable} onClick={() => setConfirmPost(true)}>Post salary</button>
          </>}
        </div>
        <AccTable columns={["Employee", { label: "Paid days", num: true }, { label: "Loss of pay", num: true }, { label: "Earned", num: true }, { label: "Deductions", num: true }, { label: "Net", num: true }, ""]}>
          {rows.map(row => <tr key={row.partyId}>
            <td>{row.name}{row.error ? <div className="small">{row.error}</div> : null}</td>
            <td className="acc-num">{amount(row.paidDays)}</td>
            <td className="acc-num">{amount(row.lopDays)}</td>
            <td className="acc-num">{money(row.earned)}</td>
            <td className="acc-num">{money(row.deductionTotal)}</td>
            <td className="acc-num">{money(row.net)}</td>
            <td>
              <div className="acc-btn-group">
                {canWrite && !posted && <button type="button" className="btn" onClick={() => openProfile(employees.find(person => person.id === row.partyId) || { id: row.partyId, name: row.name })}>Set pay</button>}
                {canWrite && !posted && <button type="button" className="btn" onClick={() => openDeductions(row)}>This month</button>}
                <button type="button" className="btn" onClick={() => {
                  const profile = (bundle.profiles || []).find(item => item.partyId === row.partyId);
                  setSlip({ ...row, basic: row.basic ?? profile?.basic ?? 0, hra: row.hra ?? profile?.hra ?? 0, allowance: row.allowance ?? profile?.allowance ?? 0 });
                }}>Payslip</button>
              </div>
            </td>
          </tr>)}
        </AccTable>
      </>}

      {tab === "attendance" && <>
        <p className="copy pay-note">A working day with no mark counts as present. Sunday counts as a weekly off until you change it. Days on leave are changed from Leave.</p>
        <div className="pay-toolbar">
          <LabeledField label="Employee">
            <select value={attendancePartyId} onChange={event => setPickedEmployee(event.target.value)}>
              {employees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </LabeledField>
          {canWrite && !posted && <button type="button" className="btn primary" disabled={busy} onClick={saveAttendance}>Save attendance</button>}
        </div>
        <div className="pay-day-grid" role="grid" aria-label={`Attendance for ${monthLabel(monthIso)}`}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(label => <div key={label} className="pay-dow">{label}</div>)}
          {Array.from({ length: calendarLead(monthIso) }, (_, index) => <div key={`pad-${index}`} />)}
          {attendancePartyId && monthDates(monthIso).map(day => {
            const resolved = resolveDay({ partyId: attendancePartyId, date: day.date, weekday: day.weekday, days: bundle.days, leaves: bundle.leave });
            if (resolved.source === "leave") {
              return <div key={day.date} className="pay-day is-leave"><span>{day.day}</span><small>{leaveTypeLabel(resolved.leaveType)}</small></div>;
            }
            return <label key={day.date} className={`pay-day is-${marks[day.date] || resolved.status}`}>
              <span>{day.day}</span>
              <select aria-label={`${day.date} attendance`} value={marks[day.date] || resolved.status} disabled={blocked} onChange={event => setMarkEdit({ key: markKey, marks: { ...marks, [day.date]: event.target.value } })}>
                {DAY_STATUSES.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}
              </select>
            </label>;
          })}
        </div>
      </>}

      {tab === "leave" && <>
        <p className="copy pay-note">Paid leave and sick leave stay in the salary. Unpaid leave reduces it. The owner records leave here.</p>
        {canWrite && !posted && <div className="form pay-toolbar">
          <LabeledField label="Employee">
            <select value={leaveForm.partyId} onChange={event => setLeaveForm(current => ({ ...current, partyId: event.target.value }))}>
              <option value="">Choose</option>
              {employees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </LabeledField>
          <LabeledField label="Type">
            <select value={leaveForm.leaveType} onChange={event => setLeaveForm(current => ({ ...current, leaveType: event.target.value }))}>
              {LEAVE_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
          </LabeledField>
          <LabeledField label="From"><input type="date" value={leaveForm.fromDate} onChange={event => setLeaveForm(current => ({ ...current, fromDate: event.target.value }))} /></LabeledField>
          <LabeledField label="To"><input type="date" value={leaveForm.toDate} onChange={event => setLeaveForm(current => ({ ...current, toDate: event.target.value }))} /></LabeledField>
          <Field className="span" label="Note"><input value={leaveForm.note} onChange={event => setLeaveForm(current => ({ ...current, note: event.target.value }))} /></Field>
          <button type="button" className="btn primary" disabled={busy} onClick={addLeave}>Save leave</button>
        </div>}
        <AccTable columns={["Employee", "Type", "From", "To", { label: "Days", num: true }, "Note", ""]} empty={!leaveRows.length && "No leave in this month."}>
          {leaveRows.map(row => <tr key={row.id}>
            <td>{employees.find(person => person.id === row.partyId)?.name || "Employee"}</td>
            <td>{leaveTypeLabel(row.leaveType)}</td>
            <td>{formatOverviewDate(row.fromDate)}</td>
            <td>{formatOverviewDate(row.toDate)}</td>
            <td className="acc-num">{inclusiveDays(row.fromDate, row.toDate)}</td>
            <td>{row.note}</td>
            <td>{canWrite && !posted ? <button type="button" className="btn" disabled={busy} onClick={() => removeLeave(row.id)}>Remove</button> : null}</td>
          </tr>)}
        </AccTable>
      </>}
    </>}

    {profileParty && profileForm && <Modal title={`Pay for ${profileParty.name}`} close={() => !busy && setProfileParty(null)} actions={<button type="button" className="btn primary" disabled={busy} onClick={saveProfile}>Save pay</button>}>
      <p className="copy">These amounts are the usual monthly pay. A posted month keeps the figures it was posted with.</p>
      <div className="form">
        <AmountFields values={profileForm} onChange={(id, value) => setProfileForm(current => ({ ...current, [id]: value }))} fields={PAY_FIELDS} />
        <LabeledField label="Divide the month by">
          <select value={profileForm.dayBasis} onChange={event => setProfileForm(current => ({ ...current, dayBasis: event.target.value }))}>
            {DAY_BASIS.map(basis => <option key={basis.id} value={basis.id}>{basis.label}</option>)}
          </select>
        </LabeledField>
        <AmountFields values={profileForm} onChange={(id, value) => setProfileForm(current => ({ ...current, [id]: value }))} fields={DEDUCTION_FIELDS} />
      </div>
    </Modal>}

    {deductionParty && deductionForm && <Modal title={`Deductions for ${deductionParty.name}`} close={() => setDeductionParty(null)} actions={<button type="button" className="btn primary" onClick={() => {
      const numbers = Object.fromEntries(DEDUCTION_FIELDS.map(field => [field.id, Number(deductionForm[field.id] || 0)]));
      if (Object.values(numbers).some(value => !Number.isFinite(value) || value < 0)) { setActionError("Amounts cannot be negative."); return; }
      changePay({ overrides: { ...overrides, [deductionParty.partyId]: numbers } });
      setDeductionParty(null);
    }}>Use for this month</button>}>
      <p className="copy">Used for {monthLabel(monthIso)} only. Save the draft or post the month to keep it. {PAYROLL_DISCLAIMER}</p>
      <div className="form">
        <AmountFields values={deductionForm} onChange={(id, value) => setDeductionForm(current => ({ ...current, [id]: value }))} fields={DEDUCTION_FIELDS} />
      </div>
    </Modal>}

    {slip && <Modal title={`Payslip · ${slip.name}`} close={() => setSlip(null)}>
      <div className="pay-slip">
        <div className="pay-slip-actions"><button type="button" className="btn" onClick={printSlip}>Print</button></div>
        <p className="ca-brief-kicker">Payslip</p>
        <h3>{companyName || "Company"}</h3>
        <dl>
          <dt>Employee</dt><dd>{slip.name}</dd>
          <dt>Month</dt><dd>{monthLabel(monthIso)}</dd>
          <dt>Pay date</dt><dd>{payDate ? formatOverviewDate(payDate) : "—"}</dd>
          <dt>Basic</dt><dd>{money(slip.basic || 0)}</dd>
          <dt>House rent allowance</dt><dd>{money(slip.hra || 0)}</dd>
          <dt>Other allowance</dt><dd>{money(slip.allowance || 0)}</dd>
          <dt>Gross</dt><dd>{money(slip.gross)}</dd>
          <dt>Paid days</dt><dd>{amount(slip.paidDays)} of {amount(slip.basis)}</dd>
          <dt>Loss of pay</dt><dd>{amount(slip.lopDays)} days</dd>
          <dt>Earned</dt><dd>{money(slip.earned)}</dd>
          <dt>Provident fund</dt><dd>{money(slip.deductions?.pf || 0)}</dd>
          <dt>ESI</dt><dd>{money(slip.deductions?.esi || 0)}</dd>
          <dt>Professional tax</dt><dd>{money(slip.deductions?.professionalTax || 0)}</dd>
          <dt>Tax deducted</dt><dd>{money(slip.deductions?.tds || 0)}</dd>
          <dt>Other deduction</dt><dd>{money(slip.deductions?.otherDeduction || 0)}</dd>
          <dt>Net pay</dt><dd>{money(slip.net)}</dd>
        </dl>
        <p className="copy">{PAYROLL_DISCLAIMER}</p>
      </div>
    </Modal>}

    {confirmPost && <Modal title={`Post salary for ${monthLabel(monthIso)}`} close={() => !busy && setConfirmPost(false)} actions={<button type="button" className="btn primary" disabled={busy} onClick={postPay}>{busy ? "Posting…" : "Post salary"}</button>}>
      <p className="copy">This adds one payment for each employee who has salary this month. A posted month cannot be edited.</p>
    </Modal>}
  </div>;
}
