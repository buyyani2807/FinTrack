import { useEffect, useMemo, useState } from "react";
import { Field, LabeledField } from "../../../components/ui.jsx";
import { todayIso } from "../../../lib/dates.js";
import { money, formatOverviewDate } from "../accountsFormat.js";
import { downloadAccountsCsv } from "../io/accountingExport.js";
import { AccEmpty, AccMetric, AccSkeleton, AccTable, Modal } from "../components/AccUi.jsx";
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
  payrollMonthChoices,
  payrollRegisterExport,
  payState,
  payrollRows,
  payrollSummary,
  rupeesInWords,
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
  sourceId: row.sourceId || null,
});

function AmountFields({ values, onChange, fields }) {
  return fields.map(field => (
    <LabeledField key={field.id} label={field.label}>
      <input inputMode="decimal" min="0" value={values[field.id]} onChange={event => onChange(field.id, event.target.value)} />
    </LabeledField>
  ));
}

const PAY_STATE = {
  posted: { label: "Posted", tone: "inv-paid" },
  ready: { label: "Ready", tone: "active" },
  later: { label: "Not posted", tone: "inactive" },
  unset: { label: "Salary not set", tone: "inv-due" },
  check: { label: "Check pay", tone: "inv-overdue" },
};

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
  booksStartedOn = "",
  canWrite,
  onRefresh,
  onOpenParties,
  onOpenSection,
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
  const [confirmLate, setConfirmLate] = useState(null);
  const [query, setQuery] = useState("");
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
  const summary = useMemo(() => payrollSummary(rows), [rows]);

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
        const sourceId = line.sourceId || (line.earned > 0 ? newClientRequestId() : null);
        const existing = (vouchers || []).find(voucher => voucher.sourceType === "salary"
          && sourceId
          && voucher.sourceTransactionId === sourceId
          && voucher.status === "posted");
        return { ...line, sourceId, voucherId: line.voucherId || existing?.id || null };
      });
      await savePayrollRun(token, runPayload("draft", lines));
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
          sourceTransactionId: line.sourceId,
          clientRequestId: line.sourceId,
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

  const postLate = async () => {
    const row = confirmLate;
    if (!row || row.earned <= 0) return;
    setBusy(true);
    setActionError("");
    try {
      const start = monthStart(monthIso);
      let books = accounts;
      if (row.deductionTotal > 0 && !findAccount(books, { code: SYSTEM_CODES.salaryDeductions })) {
        const id = await createChartAccount(token, {
          code: SYSTEM_CODES.salaryDeductions,
          name: "Salary deductions payable",
          groupType: "liability",
          accountType: "other",
          openingSide: "credit",
        });
        books = [...books, { id, code: SYSTEM_CODES.salaryDeductions, name: "Salary deductions payable", groupType: "liability", accountType: "other", isActive: true }];
      }
      const profile = (bundle?.profiles || []).find(item => item.partyId === row.partyId);
      const sourceId = row.sourceId || newClientRequestId();
      const description = `Salary for ${monthLabel(start)} · ${row.name}`;
      const kept = (bundle?.run?.lines || []).filter(item => item.partyId !== row.partyId);
      let line = { ...snapshotLine(row, profile), sourceId, voucherId: null };
      await savePayrollRun(token, runPayload("posted", [...kept, line]));
      const existing = (vouchers || []).find(voucher => voucher.sourceType === "salary"
        && voucher.sourceTransactionId === sourceId
        && voucher.status === "posted");
      const voucherId = existing?.id || await postVoucher(token, {
        voucherType: "payment",
        date: payDate,
        narration: description,
        partyId: line.partyId,
        sourceModule: "payroll",
        sourceType: "salary",
        sourceTransactionId: sourceId,
        clientRequestId: sourceId,
        lines: payrollVoucherLines({
          accounts: books,
          payAccountId,
          earned: line.earned,
          deductionTotal: line.deductionTotal,
          partyId: line.partyId,
          description,
        }),
      });
      line = { ...line, voucherId };
      await savePayrollRun(token, runPayload("posted", [...kept, line]));
      await onRefresh?.();
      await reload();
    } catch (err) {
      setActionError(err.message || "Could not post salary.");
      await onRefresh?.();
      await reload();
    } finally {
      setBusy(false);
      setConfirmLate(null);
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

  const monthChoices = useMemo(
    () => payrollMonthChoices({ today: todayIso(), booksStartedOn, selected: month }),
    [booksStartedOn, month],
  );
  const chooseMonth = event => {
    setMonth(event.target.value);
    setBundle(null);
    setLoading(true);
  };
  const monthMenu = (
    <LabeledField label="Month" className="pay-month">
      <select value={month} onChange={chooseMonth}>
        {monthChoices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>
    </LabeledField>
  );
  const blocked = posted || !canWrite || busy;
  const postable = rows.some(row => row.inRun !== false && row.earned > 0) && rows.every(row => row.inRun === false || !row.error) && payDate && payAccountId;
  const payAccountName = paidFrom.find(account => account.id === payAccountId)?.name || "the chosen account";
  const needle = query.trim().toLowerCase();
  const visibleRows = needle ? rows.filter(row => String(row.name || "").toLowerCase().includes(needle)) : rows;
  const lopDays = rows.reduce((sum, row) => sum + (row.inRun === false ? 0 : Number(row.lopDays || 0)), 0);
  const runLabel = posted ? "Posted" : bundle?.run?.status === "draft" ? "Draft" : "Open";
  const runTone = posted ? "inv-paid" : bundle?.run?.status === "draft" ? "suggested" : "active";
  const exportRegister = () => downloadAccountsCsv(`payroll-${month}.csv`, payrollRegisterExport(visibleRows));

  return <div className="acc-panel">
    {loadError ? <p className="copy" role="alert">{loadError}</p> : null}
    {actionError ? <p className="copy" role="alert">{actionError}</p> : null}
    {loading && !bundle ? <AccSkeleton /> : null}
    {!loadError && bundle && !employees.length && !rows.length ? <AccEmpty title="No employees yet" copy="Add a person under Parties and set the type to Employee. Payroll uses those people." actionLabel="Open parties" onAction={onOpenParties} /> : null}

    {!loadError && bundle && (employees.length > 0 || rows.length > 0) && <>
      {tab === "payroll" && <>
        <header className="pay-hero">
          <div className="pay-hero-title">
            <h2>{monthLabel(monthIso)}</h2>
            <span className={`acc-status-pill ${runTone}`}>{runLabel}</span>
          </div>
          <p className="pay-hero-copy">{posted
            ? (summary.later
              ? "This month is posted. Pay already recorded stays as it is. Anyone added after that can be posted on their own."
              : "This month is posted. Everyone in that pay stays as they were paid.")
            : "Record each salary, then post this month once. That pays every employee together."}</p>
          <div className="pay-hero-tools">
            {monthMenu}
            <div className="pay-quick">
              {onOpenParties ? <button type="button" className="btn" onClick={onOpenParties}>Add employee</button> : null}
              {onOpenSection ? <button type="button" className="btn" onClick={() => onOpenSection("attendance")}>Attendance</button> : null}
              {onOpenSection ? <button type="button" className="btn" onClick={() => onOpenSection("leave")}>Leave</button> : null}
              <button type="button" className="btn" disabled={!visibleRows.length} onClick={exportRegister}>Export</button>
            </div>
          </div>
        </header>
        <div className="acc-metric-grid pay-metrics">
          <AccMetric label="Employees" value={String(summary.employees)} hint={summary.unset ? `${summary.unset} still need a salary` : summary.later ? `${summary.later} not posted yet` : "Salary recorded for each"} />
          <AccMetric label="Gross payroll" value={money(summary.monthly)} hint="Recorded pay, before this month’s attendance" />
          <AccMetric label={posted ? "Net paid" : "Net payable"} value={money(summary.monthNet)} tone="green" hint={posted ? "Already posted" : "Posted together"} />
          <AccMetric label="Deductions" value={money(summary.monthDeductions)} hint={`${amount(lopDays)} loss-of-pay days · ${leaveRows.length} leave`} />
        </div>
        <div className="pay-toolbar pay-run">
          <LabeledField label="Pay date">
            <input type="date" value={payDate} disabled={blocked} onChange={event => changePay({ payDate: event.target.value })} />
          </LabeledField>
          <LabeledField label="Paid from">
            <select value={payAccountId} disabled={blocked} onChange={event => changePay({ payAccountId: event.target.value })}>
              {!paidFrom.length && <option value="">Add a cash, bank, or UPI ledger</option>}
              {paidFrom.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </LabeledField>
          <label className="field pay-search">
            <span>Employees</span>
            <input type="search" value={query} placeholder="Search" aria-label="Search employees" onChange={event => setQuery(event.target.value)} />
          </label>
          {canWrite && !posted && <div className="pay-run-actions">
            <button type="button" className="btn" disabled={busy} onClick={saveDraft}>Save draft</button>
            <button type="button" className="btn primary" disabled={busy || !postable} onClick={() => setConfirmPost(true)}>Post salary</button>
          </div>}
        </div>
        <div className="pay-register-table">
          <AccTable spaced={false} columns={["Employee", { label: "Monthly salary", num: true }, { label: "This month", num: true }, { label: "Days", num: true }, { label: "Deductions", num: true }, ""]} empty={!visibleRows.length && "No employee matches this search."}>
            {visibleRows.map(row => {
              const state = PAY_STATE[payState({ posted, inRun: row.inRun !== false, monthly: row.monthly, error: row.error })];
              const person = employees.find(item => item.id === row.partyId) || { id: row.partyId, name: row.name };
              return <tr key={row.partyId}>
                <td><strong>{row.name}</strong> <span className={`acc-status-pill ${state.tone}`}>{state.label}</span>{row.error ? <div className="small">{row.error}</div> : null}</td>
                <td className="acc-num">{Number(row.monthly) > 0 ? money(row.monthly) : "Not set"}</td>
                <td className="acc-num">{money(row.net)}</td>
                <td className="acc-num">{`${amount(row.paidDays)} paid · ${amount(row.lopDays)} loss`}</td>
                <td className="acc-num">{money(row.deductionTotal)}</td>
                <td><div className="acc-btn-group">
                  {canWrite && <button type="button" className={`btn${Number(row.monthly) > 0 ? "" : " primary"}`} onClick={() => openProfile(person)}>Set salary</button>}
                  {canWrite && posted && row.inRun === false && row.earned > 0 && !row.error && <button type="button" className="btn primary" disabled={busy} onClick={() => setConfirmLate(row)}>Post salary</button>}
                  {canWrite && !posted && row.inRun !== false && <button type="button" className="btn" onClick={() => openDeductions(row)}>This month</button>}
                  {row.inRun !== false && <button type="button" className="btn" onClick={() => {
                    const profile = (bundle.profiles || []).find(item => item.partyId === row.partyId);
                    setSlip({ ...row, basic: row.basic ?? profile?.basic ?? 0, hra: row.hra ?? profile?.hra ?? 0, allowance: row.allowance ?? profile?.allowance ?? 0 });
                  }}>Payslip</button>}
                </div></td>
              </tr>;
            })}
          </AccTable>
        </div>
        <ul className="pay-register">
          {visibleRows.map(row => {
            const state = PAY_STATE[payState({ posted, inRun: row.inRun !== false, monthly: row.monthly, error: row.error })];
            const person = employees.find(item => item.id === row.partyId) || { id: row.partyId, name: row.name };
            return <li key={row.partyId} className="pay-person">
              <div className="pay-person-id">
                <strong>{row.name}</strong>
                <span className={`acc-status-pill ${state.tone}`}>{state.label}</span>
                {row.error ? <span className="small">{row.error}</span> : null}
              </div>
              <dl className="pay-facts">
                <div><dt>Monthly salary</dt><dd>{Number(row.monthly) > 0 ? money(row.monthly) : "Not set"}</dd></div>
                <div><dt>This month</dt><dd>{money(row.net)}</dd></div>
                <div><dt>Days</dt><dd>{`${amount(row.paidDays)} paid · ${amount(row.lopDays)} loss`}</dd></div>
                <div><dt>Deductions</dt><dd>{money(row.deductionTotal)}</dd></div>
              </dl>
              <div className="acc-btn-group pay-person-actions">
                {canWrite && <button type="button" className={`btn${Number(row.monthly) > 0 ? "" : " primary"}`} onClick={() => openProfile(person)}>Set salary</button>}
                {canWrite && posted && row.inRun === false && row.earned > 0 && !row.error && <button type="button" className="btn primary" disabled={busy} onClick={() => setConfirmLate(row)}>Post salary</button>}
                {canWrite && !posted && row.inRun !== false && <button type="button" className="btn" onClick={() => openDeductions(row)}>This month</button>}
                {row.inRun !== false && <button type="button" className="btn" onClick={() => {
                  const profile = (bundle.profiles || []).find(item => item.partyId === row.partyId);
                  setSlip({ ...row, basic: row.basic ?? profile?.basic ?? 0, hra: row.hra ?? profile?.hra ?? 0, allowance: row.allowance ?? profile?.allowance ?? 0 });
                }}>Payslip</button>}
              </div>
            </li>;
          })}
        </ul>
        <p className="copy pay-note">Salary is reduced only for absent days, half days, and unpaid leave. Weekly offs, holidays, and paid leave stay in the month’s salary. {PAYROLL_DISCLAIMER} Payroll figures should be reviewed before the month is posted. Collection agents stay in Collection Staff.</p>
      </>}

      {tab === "attendance" && <>
        <div className="pay-toolbar">{monthMenu}</div>
        {posted ? <p className="copy pay-note">{monthLabel(monthIso)} is posted. Attendance for this month stays as it was posted.</p> : null}
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
        <div className="pay-toolbar">{monthMenu}</div>
        {posted ? <p className="copy pay-note">{monthLabel(monthIso)} is posted. Leave for this month stays as it was posted.</p> : null}
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

    {profileParty && profileForm && <Modal title={`Salary for ${profileParty.name}`} close={() => !busy && setProfileParty(null)} actions={<button type="button" className="btn primary" disabled={busy} onClick={saveProfile}>Save salary</button>}>
      <p className="copy">This is the monthly salary on record. A month that is already posted keeps the figures it was posted with.</p>
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
      <div className="pay-slip-actions"><button type="button" className="btn" onClick={printSlip}>Print</button></div>
      <article className="pay-slip">
        <header className="pay-slip-head">
          <p className="pay-slip-company">{companyName || "Company"}</p>
          <p className="pay-slip-doc">Payslip</p>
          <p className="pay-slip-period">{monthLabel(monthIso)}</p>
        </header>
        <dl className="pay-slip-meta">
          <div><dt>Employee</dt><dd>{slip.name}</dd></div>
          <div><dt>Pay date</dt><dd>{payDate ? formatOverviewDate(payDate) : "—"}</dd></div>
          <div><dt>Paid days</dt><dd>{amount(slip.paidDays)} of {amount(slip.basis)}</dd></div>
          <div><dt>Loss of pay</dt><dd>{amount(slip.lopDays)} {Number(slip.lopDays) === 1 ? "day" : "days"}</dd></div>
        </dl>
        <div className="pay-slip-cols">
          <table>
            <thead><tr><th>Earnings</th><th>Amount</th></tr></thead>
            <tbody>
              <tr><td>Basic</td><td>{money(slip.basic || 0)}</td></tr>
              <tr><td>House rent allowance</td><td>{money(slip.hra || 0)}</td></tr>
              <tr><td>Other allowance</td><td>{money(slip.allowance || 0)}</td></tr>
            </tbody>
            <tfoot><tr><td>Gross earnings</td><td>{money(slip.gross)}</td></tr></tfoot>
          </table>
          <table>
            <thead><tr><th>Deductions</th><th>Amount</th></tr></thead>
            <tbody>
              <tr><td>Loss of pay</td><td>{money(Math.max(0, Number(slip.gross || 0) - Number(slip.earned || 0)))}</td></tr>
              <tr><td>Provident fund</td><td>{money(slip.deductions?.pf || 0)}</td></tr>
              <tr><td>ESI</td><td>{money(slip.deductions?.esi || 0)}</td></tr>
              <tr><td>Professional tax</td><td>{money(slip.deductions?.professionalTax || 0)}</td></tr>
              <tr><td>Tax deducted</td><td>{money(slip.deductions?.tds || 0)}</td></tr>
              <tr><td>Other deduction</td><td>{money(slip.deductions?.otherDeduction || 0)}</td></tr>
            </tbody>
            <tfoot><tr><td>Total deductions</td><td>{money(Math.max(0, Number(slip.gross || 0) - Number(slip.earned || 0)) + Number(slip.deductionTotal || 0))}</td></tr></tfoot>
          </table>
        </div>
        <div className="pay-slip-net">
          <div>
            <span>Net pay</span>
            <strong>{money(slip.net)}</strong>
          </div>
          <p>{rupeesInWords(slip.net)}</p>
        </div>
        <p className="pay-slip-foot">{PAYROLL_DISCLAIMER}</p>
      </article>
    </Modal>}

    {confirmPost && <Modal title={`Post salary for ${monthLabel(monthIso)}`} close={() => !busy && setConfirmPost(false)} actions={<button type="button" className="btn primary" disabled={busy} onClick={postPay}>{busy ? "Posting…" : "Post salary"}</button>}>
      <p className="copy">This pays {summary.inMonth} {summary.inMonth === 1 ? "employee" : "employees"}, {money(summary.monthNet)}, from {payAccountName}. A posted month stays as it was paid.</p>
    </Modal>}
    {confirmLate && <Modal title={`Post salary for ${confirmLate.name}`} close={() => !busy && setConfirmLate(null)} actions={<button type="button" className="btn primary" disabled={busy} onClick={postLate}>{busy ? "Posting…" : "Post salary"}</button>}>
      <p className="copy">This adds {money(confirmLate.net)} for {confirmLate.name} to {monthLabel(monthIso)}, from {payAccountName}. Salaries already posted this month stay as they are.</p>
    </Modal>}
  </div>;
}
