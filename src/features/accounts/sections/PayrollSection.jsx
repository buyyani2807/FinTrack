import { useEffect, useMemo, useState } from "react";
import { Field, LabeledField } from "../../../components/ui.jsx";
import { Select } from "../../../components/Select.jsx";
import { todayIso } from "../../../lib/dates.js";
import { money, formatOverviewDate } from "../accountsFormat.js";
import { downloadAccountsCsv, downloadAccountsPdf, renderAccountsPdf } from "../io/accountingExport.js";
import { AccEmpty, AccMetric, AccSkeleton, AccTable, Modal } from "../components/AccUi.jsx";
import { whatsAppShareUrl } from "../../receipts/io/receiptWhatsApp.js";
import { hasWhatsAppPhone } from "../../receipts/model/phoneNormalize.js";
import {
  cancelPayrollAdvance,
  cancelVoucher,
  createChartAccount,
  createParty,
  decideLeaveRequest,
  deletePayrollHoliday,
  deletePayrollLeave,
  disableStaffPortal,
  issueStaffPortal,
  loadPayroll,
  loadPunchPhoto,
  postVoucher,
  savePayrollAdvance,
  savePayrollDays,
  savePayrollHoliday,
  savePayrollLeave,
  savePayrollProfile,
  savePayrollRun,
  savePayrollSettlement,
  savePayrollStaff,
  setAdvanceRecovery,
  updateParty,
} from "../data/accountingRepository.js";
import { findAccount, newClientRequestId, SYSTEM_CODES } from "../model/accountingModel.js";
import {
  DAY_STATUSES,
  GRATUITY_CODE,
  LEAVE_TYPES,
  PAYROLL_DISCLAIMER,
  STAFF_ADVANCE_CODE,
  advanceOutstanding,
  assertLeaveDraft,
  attendanceExceptions,
  attendanceHours,
  attendanceMarks,
  calendarLead,
  deductionParts,
  inclusiveDays,
  leaveTypeLabel,
  leavesOverlap,
  moneyAccounts,
  monthDates,
  defaultPayDate,
  monthEnd,
  monthLabel,
  monthStart,
  salaryRecorded,
  payrollMonthChoices,
  payrollRegisterExport,
  payState,
  payrollRows,
  payrollSummary,
  payrollVoucherLines,
  planRecoveries,
  resolveDay,
} from "../model/payroll.js";
import {
  advanceVoucherLines,
  bankPaymentFile,
  leaveBalance,
  leaveOverBalance,
  payslipFileName,
  payslipMessage,
  payslipPdfRows,
  profileForMonth,
  settlementVoucherLines,
} from "../model/payrollExtras.js";
import { EmployeePanel } from "./payroll/EmployeePanel.jsx";
import { payLabel } from "./payroll/payLabel.js";
import {
  AdvancesTab,
  HolidaysBlock,
  LeaveBalances,
  LeaveRequests,
  PayslipView,
  PunchesBlock,
  StaffAppTab,
} from "./payroll/PayrollPanels.jsx";
import "../payroll.css";

const amount = value => String(Number(value) || 0);
const blankLeave = { partyId: "", leaveType: "paid", fromDate: "", toDate: "", note: "" };

// What is kept for the month. `extras` holds what was typed for this month only.
const snapshotLine = (row, profile, typed) => ({
  partyId: row.partyId,
  name: row.name,
  payType: row.payType || "monthly",
  rate: Number(row.rate || 0),
  paidDays: row.paidDays,
  lopDays: row.lopDays,
  workedDays: Number(row.workedDays || 0),
  hours: Number(row.hours || 0),
  overtimeHours: Number(row.overtimeHours || 0),
  basis: row.basis,
  basic: Number(profile?.basic || row.basic || 0),
  hra: Number(profile?.hra || row.hra || 0),
  allowance: Number(profile?.allowance || row.allowance || 0),
  gross: row.gross,
  baseEarned: row.baseEarned ?? row.earned,
  overtime: Number(row.overtime || 0),
  bonus: Number(row.bonus || 0),
  incentive: Number(row.incentive || 0),
  extras: { ...(row.extras || {}), recoveries: typed?.recoveries || row.extras?.recoveries || {} },
  earned: row.earned,
  deductions: row.deductions,
  deductionTotal: row.deductionTotal,
  recoveries: row.recoveries || [],
  advanceRecovery: Number(row.advanceRecovery || 0),
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
  unset: { label: "Pay not set", tone: "inv-due" },
  check: { label: "Check pay", tone: "inv-overdue" },
};

const DEDUCTION_FIELDS = [
  { id: "pf", label: "Provident fund" },
  { id: "esi", label: "ESI" },
  { id: "professionalTax", label: "Professional tax" },
  { id: "tds", label: "Tax deducted" },
  { id: "otherDeduction", label: "Other deduction" },
];
const EXTRA_FIELDS = [
  { id: "bonus", label: "Bonus" },
  { id: "incentive", label: "Incentive" },
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
  canAdmin = false,
  onRefresh,
  onOpenSection,
}) {
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [payEdit, setPayEdit] = useState(null);
  const [panel, setPanel] = useState(null);
  const [monthParty, setMonthParty] = useState(null);
  const [monthForm, setMonthForm] = useState(null);
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
  const phase = bundle?.phase || 0;
  const extra = bundle?.extra;
  const ready = Boolean(extra?.ready);
  const paidFrom = useMemo(() => moneyAccounts(accounts), [accounts]);
  const holidays = useMemo(() => bundle?.holidays || [], [bundle]);
  const advances = useMemo(() => bundle?.advances || [], [bundle]);

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

  // One wrapper for every save: busy state, the error line, and a fresh read afterwards.
  const act = async (work, fallback, { refresh = false } = {}) => {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const result = await work();
      if (refresh) await onRefresh?.();
      await reload();
      return result === undefined ? true : result;
    } catch (err) {
      setActionError(err.message || fallback);
      if (refresh) await onRefresh?.();
      await reload();
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Each month is paid on the salary that applied in it, not on today's.
  const profiles = useMemo(
    () => (bundle?.profiles || []).map(profile => profileForMonth(profile, extra?.revisions, monthIso)),
    [bundle, extra, monthIso],
  );

  const savedOverrides = useMemo(() => {
    const next = {};
    if (bundle?.run?.status === "draft") {
      for (const line of bundle.run.lines || []) {
        if (line.partyId && line.deductions) next[line.partyId] = deductionParts(line.deductions);
      }
    }
    return next;
  }, [bundle]);
  const savedExtras = useMemo(() => {
    const next = {};
    if (bundle?.run?.status === "draft") {
      for (const line of bundle.run.lines || []) {
        if (line.partyId && line.extras) next[line.partyId] = line.extras;
      }
    }
    return next;
  }, [bundle]);
  const runKey = `${monthIso}:${bundle?.run?.id || "none"}:${bundle?.run?.status || "open"}`;
  const editingPay = payEdit?.key === runKey;
  const overrides = editingPay ? payEdit.overrides : savedOverrides;
  const extrasByParty = editingPay ? payEdit.extras : savedExtras;
  const payAccountId = editingPay
    ? payEdit.payAccountId
    : (bundle?.run?.payAccountId || paidFrom.find(account => account.accountType === "bank")?.id || paidFrom[0]?.id || "");
  const today = todayIso();
  const storedPayDate = bundle?.run?.payDate || "";
  const requestedPayDate = editingPay ? payEdit.payDate : storedPayDate;
  const payDate = requestedPayDate && requestedPayDate <= today ? requestedPayDate : defaultPayDate(monthIso, today);
  const changePay = patch => setPayEdit({ key: runKey, overrides, extras: extrasByParty, payAccountId, payDate, ...patch });
  const attendancePartyId = employees.some(person => person.id === pickedEmployee) ? pickedEmployee : (employees[0]?.id || "");
  const attendanceProfile = profiles.find(profile => profile.partyId === attendancePartyId);
  const baseMarks = useMemo(() => (
    bundle && attendancePartyId
      ? attendanceMarks({ partyId: attendancePartyId, month: monthIso, days: bundle.days, leaves: bundle.leave, holidays })
      : {}
  ), [bundle, attendancePartyId, monthIso, holidays]);
  const baseHours = useMemo(() => (
    bundle && attendancePartyId ? attendanceHours({ partyId: attendancePartyId, month: monthIso, days: bundle.days }) : {}
  ), [bundle, attendancePartyId, monthIso]);
  const markKey = `${monthIso}:${attendancePartyId}:${(bundle?.days || []).map(day => `${day.partyId}${day.workDate}${day.status}${day.hours || 0}${day.overtimeHours || 0}`).join("|")}:${holidays.length}`;
  const marks = markEdit?.key === markKey ? markEdit.marks : baseMarks;
  const hours = markEdit?.key === markKey ? markEdit.hours : baseHours;
  const changeMarks = patch => setMarkEdit({ key: markKey, marks, hours, ...patch });

  const rows = useMemo(() => (bundle ? payrollRows({
    employees,
    month: monthIso,
    profiles,
    days: bundle.days,
    leaves: bundle.leave,
    overrides,
    run: bundle.run,
    holidays,
    advances,
    extrasByParty,
  }) : []), [bundle, employees, monthIso, profiles, overrides, holidays, advances, extrasByParty]);
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
    profiles.find(profile => profile.partyId === row.partyId),
    extrasByParty[row.partyId],
  ));

  const ensureLedger = async (books, { code, name, groupType, openingSide }) => {
    const found = findAccount(books, { code });
    if (found) return [books, found];
    const id = await createChartAccount(token, { code, name, groupType, accountType: "other", openingSide });
    const account = { id, code, name, groupType, accountType: "other", isActive: true };
    return [[...books, account], account];
  };
  const ensureDeductions = books => ensureLedger(books, { code: SYSTEM_CODES.salaryDeductions, name: "Salary deductions payable", groupType: "liability", openingSide: "credit" });
  const ensureAdvances = books => ensureLedger(books, { code: STAFF_ADVANCE_CODE, name: "Staff advances", groupType: "asset", openingSide: "debit" });

  const postLineVoucher = (books, line, description) => postVoucher(token, {
    voucherType: line.net > 0 ? "payment" : "journal",
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
      advanceRecovery: line.advanceRecovery,
      partyId: line.partyId,
      description,
    }),
  });

  const recordRecoveries = async line => {
    for (const recovery of line.recoveries || []) {
      if (recovery.amount > 0) await setAdvanceRecovery(token, { advanceId: recovery.advanceId, month: monthStart(monthIso), amount: recovery.amount });
    }
  };

  const saveDraft = () => act(() => savePayrollRun(token, runPayload("draft", draftLines())), "Could not save this month.");

  const postPay = async () => {
    await act(async () => {
      const start = monthStart(monthIso);
      let books = accounts;
      // A line whose voucher is already posted keeps the figures it was posted with, so a retry cannot drift from the books.
      const frozen = (bundle?.run?.lines || []).filter(line => line.voucherId);
      let lines = draftLines().map(line => {
        const kept = frozen.find(item => item.partyId === line.partyId);
        if (kept) return kept;
        const sourceId = line.sourceId || (line.earned > 0 ? newClientRequestId() : null);
        const existing = (vouchers || []).find(voucher => voucher.sourceType === "salary"
          && sourceId
          && voucher.sourceTransactionId === sourceId
          && voucher.status === "posted");
        return { ...line, sourceId, voucherId: line.voucherId || existing?.id || null };
      }).filter(salaryRecorded);
      if (!lines.some(line => Number(line.earned) > 0)) throw new Error("Set a salary before posting this month.");
      if (lines.some(line => line.earned > 0 && line.deductionTotal > 0)) [books] = await ensureDeductions(books);
      if (lines.some(line => line.earned > 0 && line.advanceRecovery > 0)) [books] = await ensureAdvances(books);
      await savePayrollRun(token, runPayload("draft", lines));
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.earned <= 0 || line.voucherId) continue;
        const voucherId = await postLineVoucher(books, line, `Salary for ${monthLabel(start)} · ${line.name}`);
        lines = lines.map((item, itemIndex) => (itemIndex === index ? { ...item, voucherId } : item));
        await savePayrollRun(token, runPayload("draft", lines));
      }
      for (const line of lines) await recordRecoveries(line);
      await savePayrollRun(token, runPayload("posted", lines));
    }, "Could not post salary.", { refresh: true });
    setConfirmPost(false);
  };

  const postLate = async () => {
    const row = confirmLate;
    if (!row || row.earned <= 0) return;
    await act(async () => {
      const start = monthStart(monthIso);
      let books = accounts;
      if (row.deductionTotal > 0) [books] = await ensureDeductions(books);
      if (row.advanceRecovery > 0) [books] = await ensureAdvances(books);
      const profile = profiles.find(item => item.partyId === row.partyId);
      const sourceId = row.sourceId || newClientRequestId();
      const kept = (bundle?.run?.lines || []).filter(item => item.partyId !== row.partyId);
      let line = { ...snapshotLine(row, profile, null), sourceId, voucherId: null };
      await savePayrollRun(token, runPayload("posted", [...kept, line]));
      const existing = (vouchers || []).find(voucher => voucher.sourceType === "salary"
        && voucher.sourceTransactionId === sourceId
        && voucher.status === "posted");
      const voucherId = existing?.id || await postLineVoucher(books, line, `Salary for ${monthLabel(start)} · ${row.name}`);
      line = { ...line, voucherId };
      await recordRecoveries(line);
      await savePayrollRun(token, runPayload("posted", [...kept, line]));
    }, "Could not post salary.", { refresh: true });
    setConfirmLate(null);
  };

  /* ----- employee panel ----- */

  const openPanel = (person = null, initialTab = "details") => {
    setActionError("");
    setPanel({ person, initialTab, key: newClientRequestId() });
  };

  const saveDetails = async draft => {
    const person = panel?.person;
    const done = await act(async () => {
      let partyId = person?.id || null;
      const party = { name: draft.name, phone: draft.phone, email: draft.email, address: draft.address, partyType: "employee" };
      if (partyId) {
        const existing = (parties || []).find(item => item.id === partyId) || {};
        await updateParty(token, { ...existing, ...party, id: partyId });
      } else {
        partyId = await createParty(token, party);
      }
      const hasStaff = draft.joinedOn || draft.fixedTerm || draft.bankAccount || draft.bankIfsc || draft.bankHolder || draft.bankName
        || (extra?.staff || []).some(row => row.partyId === partyId);
      if (ready && hasStaff && typeof partyId === "string") await savePayrollStaff(token, { ...draft, partyId });
    }, "The employee could not be saved.", { refresh: true });
    if (done) setPanel(null);
  };

  const savePay = async profile => {
    const done = await act(() => savePayrollProfile(token, profile, { phase }), "Could not save pay.");
    if (done) setPanel(null);
  };

  const settle = draft => act(async () => {
    let books = accounts;
    const id = draft.id || newClientRequestId();
    const settlement = { ...draft, id };
    await savePayrollSettlement(token, { ...settlement, finish: false });
    let voucherId = (vouchers || []).find(voucher => voucher.sourceType === "settlement" && voucher.sourceTransactionId === id && voucher.status === "posted")?.id || null;
    if (!voucherId && (draft.payable > 0 || draft.held > 0)) {
      let advanceAccount = null;
      let deductionAccount = null;
      let gratuityAccount = null;
      if (draft.advanceRecovery > 0) [books, advanceAccount] = await ensureAdvances(books);
      if (draft.otherDeduction > 0) [books, deductionAccount] = await ensureDeductions(books);
      if (draft.gratuity > 0) [books, gratuityAccount] = await ensureLedger(books, { code: GRATUITY_CODE, name: "Gratuity", groupType: "expense", openingSide: "debit" });
      const name = employees.find(person => person.id === draft.partyId)?.name || "Employee";
      const description = `Final settlement · ${name}`;
      voucherId = await postVoucher(token, {
        voucherType: draft.net > 0 ? "payment" : "journal",
        date: draft.payDate || today,
        narration: description,
        partyId: draft.partyId,
        sourceModule: "payroll",
        sourceType: "settlement",
        sourceTransactionId: id,
        clientRequestId: id,
        lines: settlementVoucherLines({
          salaryAccount: findAccount(books, { code: SYSTEM_CODES.salary }),
          gratuityAccount,
          advanceAccount,
          deductionAccount,
          payAccount: paidFrom.find(account => account.id === draft.payAccountId),
          totals: draft,
          partyId: draft.partyId,
          description,
        }),
      });
    }
    if (draft.advanceRecovery > 0) {
      const plan = planRecoveries({
        advances: advances.map(row => ({ ...row, emi: 0 })),
        partyId: draft.partyId,
        month: "9999-12-01",
        available: draft.advanceRecovery,
      });
      for (const recovery of plan) {
        if (recovery.amount > 0) await setAdvanceRecovery(token, { advanceId: recovery.advanceId, month: monthStart(draft.lastDay), amount: recovery.amount, source: "settlement" });
      }
    }
    await savePayrollSettlement(token, { ...settlement, voucherId, finish: true });
  }, "The settlement could not be posted.", { refresh: true });

  /* ----- advances ----- */

  const finishAdvance = (advance, payAccountIdForAdvance) => act(async () => {
    const [, advanceAccount] = await ensureAdvances(accounts);
    const payAccount = paidFrom.find(account => account.id === payAccountIdForAdvance) || paidFrom.find(account => account.accountType === "cash") || paidFrom[0];
    const name = employees.find(person => person.id === advance.partyId)?.name || "Employee";
    const description = `${advance.kind === "loan" ? "Staff loan" : "Salary advance"} · ${name}`;
    const existing = (vouchers || []).find(voucher => voucher.sourceType === "advance" && voucher.sourceTransactionId === advance.id && voucher.status === "posted");
    const voucherId = existing?.id || await postVoucher(token, {
      voucherType: "payment",
      date: advance.givenOn,
      narration: description,
      partyId: advance.partyId,
      sourceModule: "payroll",
      sourceType: "advance",
      sourceTransactionId: advance.id,
      clientRequestId: advance.id,
      lines: advanceVoucherLines({ advanceAccount, payAccount, amount: advance.amount, partyId: advance.partyId, description }),
    });
    await savePayrollAdvance(token, { ...advance, voucherId });
  }, "The advance could not be recorded in the books.", { refresh: true });

  const giveAdvance = async draft => {
    const advance = { ...draft, id: newClientRequestId() };
    const saved = await act(() => savePayrollAdvance(token, advance), "The advance could not be saved.");
    if (!saved) return false;
    if (draft.postToBooks === false) return true;
    return finishAdvance(advance, draft.payAccountId);
  };

  const cancelAdvance = advance => act(async () => {
    if (advance.voucherId) await cancelVoucher(token, advance.voucherId, "Staff advance cancelled");
    await cancelPayrollAdvance(token, advance.id);
  }, "The advance could not be cancelled.", { refresh: true });

  /* ----- attendance, leave, holidays ----- */

  const saveAttendance = () => act(() => savePayrollDays(token, {
    partyId: attendancePartyId,
    month: monthIso,
    days: attendanceExceptions({ partyId: attendancePartyId, month: monthIso, marks, leaves: bundle.leave, holidays, hours }),
  }), "Could not save attendance.");

  const leaveProfile = profiles.find(profile => profile.partyId === leaveForm.partyId);
  const leaveWarning = leaveForm.partyId && leaveForm.fromDate && leaveForm.toDate && leaveForm.toDate >= leaveForm.fromDate
    ? leaveOverBalance({
      balance: leaveBalance({ profile: leaveProfile, used: bundle?.leaveUsed, partyId: leaveForm.partyId }),
      leaveType: leaveForm.leaveType,
      days: inclusiveDays(leaveForm.fromDate, leaveForm.toDate),
    })
    : "";

  const addLeave = async () => {
    const problem = assertLeaveDraft(leaveForm) || (leavesOverlap(bundle.leave, leaveForm) ? "Leave already covers one of these dates." : "");
    if (problem) { setActionError(problem); return; }
    if (await act(() => savePayrollLeave(token, leaveForm), "Could not save leave.")) setLeaveForm(blankLeave);
  };

  const removeLeave = id => act(() => deletePayrollLeave(token, id), "Could not remove leave.");

  /* ----- this month ----- */

  const openMonth = row => {
    const typed = extrasByParty[row.partyId] || {};
    const open = planRecoveries({ advances, partyId: row.partyId, month: monthIso, available: Number.MAX_SAFE_INTEGER, overrides: typed.recoveries });
    setMonthForm({
      ...Object.fromEntries(DEDUCTION_FIELDS.map(field => [field.id, amount(row.deductions?.[field.id] || 0)])),
      bonus: amount(row.bonus || 0),
      incentive: amount(row.incentive || 0),
      overtimeAmount: typed.overtimeAmount === null || typed.overtimeAmount === undefined ? "" : amount(typed.overtimeAmount),
      recoveries: Object.fromEntries(open.map(item => [item.advanceId, amount(item.amount)])),
      open,
    });
    setMonthParty(row);
  };

  const applyMonthForm = () => {
    const numbers = Object.fromEntries(DEDUCTION_FIELDS.map(field => [field.id, Number(monthForm[field.id] || 0)]));
    const extraNumbers = { bonus: Number(monthForm.bonus || 0), incentive: Number(monthForm.incentive || 0) };
    const typedOvertime = monthForm.overtimeAmount === "" ? null : Number(monthForm.overtimeAmount);
    const recoveries = Object.fromEntries(Object.entries(monthForm.recoveries).map(([id, value]) => [id, Number(value || 0)]));
    const all = [...Object.values(numbers), ...Object.values(extraNumbers), ...Object.values(recoveries), typedOvertime ?? 0];
    if (all.some(value => !Number.isFinite(value) || value < 0)) { setActionError("Amounts cannot be negative."); return; }
    changePay({
      overrides: { ...overrides, [monthParty.partyId]: numbers },
      extras: { ...extrasByParty, [monthParty.partyId]: { ...extraNumbers, overtimeAmount: typedOvertime, recoveries } },
    });
    setMonthParty(null);
  };

  /* ----- payslip and exports ----- */

  const printSlip = () => {
    document.body.classList.add("pay-slip-print");
    const done = () => document.body.classList.remove("pay-slip-print");
    window.addEventListener("afterprint", done, { once: true });
    window.print();
  };
  const slipPdf = () => ({
    title: `${companyName || "Company"} - Payslip`,
    subtitle: `${monthLabel(monthIso)} - ${slip.name}`,
    rows: payslipPdfRows({ slip, payDate: payDate ? formatOverviewDate(payDate) : "" }),
  });
  const downloadSlip = () => downloadAccountsPdf(payslipFileName({ slip, month: monthIso }), slipPdf());
  const slipPhone = slip ? (parties || []).find(party => party.id === slip.partyId)?.phone || "" : "";
  // A phone can hand the PDF straight to WhatsApp. A computer downloads it and opens the chat with the figures.
  const shareSlip = async () => {
    const name = payslipFileName({ slip, month: monthIso });
    const text = payslipMessage({ slip, month: monthIso, companyName });
    try {
      const file = new File([renderAccountsPdf(slipPdf())], name, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Payslip ${monthLabel(monthIso)}`, text });
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
    downloadSlip();
    const url = whatsAppShareUrl(slipPhone, `${text}\n\nThe payslip PDF is attached separately.`);
    if (url) window.open(url, "_blank", "noopener");
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
      <Select value={month} onChange={chooseMonth}>
        {monthChoices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </Select>
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
  const exportBankFile = () => {
    const file = bankPaymentFile({ rows, staff: extra?.staff, month: monthIso, companyName });
    if (!file.count) {
      setActionError("No one in this month has a bank account on record. Add account details from each employee’s Details tab.");
      return;
    }
    downloadAccountsCsv(`salary-bank-file-${month}.csv`, file.rows);
    setActionError("");
    setNotice(`Bank file: ${file.count} ${file.count === 1 ? "payment" : "payments"}, ${money(file.total)}.${file.missing.length ? ` No bank details for ${file.missing.join(", ")} — pay them separately.` : ""} Check the layout against your bank’s bulk-upload template before uploading.`);
  };
  const waitingRequests = (extra?.requests || []).filter(row => row.status === "pending").length;
  const openSlip = row => {
    const profile = profiles.find(item => item.partyId === row.partyId);
    setSlip({ ...row, basic: row.basic ?? profile?.basic ?? 0, hra: row.hra ?? profile?.hra ?? 0, allowance: row.allowance ?? profile?.allowance ?? 0 });
  };
  const rowActions = (row, person) => <>
    {canWrite && <button type="button" className={`btn${Number(row.monthly) > 0 ? "" : " primary"}`} onClick={() => openPanel(person, Number(row.monthly) > 0 ? "details" : "pay")}>{Number(row.monthly) > 0 ? "Open" : "Set pay"}</button>}
    {canWrite && posted && row.inRun === false && row.earned > 0 && !row.error && <button type="button" className="btn primary" disabled={busy} onClick={() => setConfirmLate(row)}>Post salary</button>}
    {canWrite && !posted && row.inRun !== false && <button type="button" className="btn" onClick={() => openMonth(row)}>This month</button>}
    {row.inRun !== false && <button type="button" className="btn" onClick={() => openSlip(row)}>Payslip</button>}
  </>;
  const daysCell = row => (row.payType === "hourly"
    ? `${amount(row.hours)} hours`
    : row.payType === "daily" ? `${amount(row.workedDays)} worked` : `${amount(row.paidDays)} paid · ${amount(row.lopDays)} loss`);
  const heldCell = row => money(Number(row.deductionTotal || 0) + Number(row.advanceRecovery || 0));
  const showHours = attendanceProfile?.payType === "hourly";
  const showOvertime = Number(attendanceProfile?.overtimeRate || 0) > 0;
  const panelPerson = panel?.person || null;
  const isMonthOnly = tab === "payroll" || tab === "attendance" || tab === "leave";

  return <div className="acc-panel">
    {loadError ? <p className="copy" role="alert">{loadError}</p> : null}
    {actionError ? <p className="copy" role="alert">{actionError}</p> : null}
    {notice ? <p className="copy pay-notice" role="status">{notice}</p> : null}
    {loading && !bundle ? <AccSkeleton /> : null}
    {!loadError && bundle && !employees.length && !rows.length && isMonthOnly ? <AccEmpty title="No employees yet" copy="Add the people you pay. Salary, attendance, and leave stay in Payroll." actionLabel={canWrite ? "Add employee" : ""} onAction={canWrite ? () => openPanel() : undefined} /> : null}

    {!loadError && bundle && (employees.length > 0 || rows.length > 0 || !isMonthOnly) && <>
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
            : "Record each person’s pay, then post this month once. That pays every employee together."}</p>
          <div className="pay-hero-tools">
            {monthMenu}
            <div className="pay-quick">
              {canWrite ? <button type="button" className="btn" onClick={() => openPanel()}>Add employee</button> : null}
              {onOpenSection ? <button type="button" className="btn" onClick={() => onOpenSection("attendance")}>Attendance</button> : null}
              {onOpenSection ? <button type="button" className="btn" onClick={() => onOpenSection("leave")}>Leave{waitingRequests ? ` (${waitingRequests})` : ""}</button> : null}
              {onOpenSection && phase >= 1 ? <button type="button" className="btn" onClick={() => onOpenSection("advances")}>Advances</button> : null}
              <button type="button" className="btn" disabled={!visibleRows.length} onClick={exportRegister}>Export</button>
              {ready ? <button type="button" className="btn" disabled={!rows.length} onClick={exportBankFile}>Bank file</button> : null}
            </div>
          </div>
        </header>
        <div className="acc-metric-grid pay-metrics">
          <AccMetric label="Employees" value={String(summary.employees)} hint={summary.unset ? `${summary.unset} still need their pay set` : summary.later ? `${summary.later} not posted yet` : "Pay recorded for each"} />
          <AccMetric label="Gross payroll" value={money(summary.monthly)} hint="Salaries on record, and wages earned so far" />
          <AccMetric label={posted ? "Net paid" : "Net payable"} value={money(summary.monthNet)} tone="green" hint={posted ? "Already posted" : "Posted together"} />
          <AccMetric label="Deductions" value={money(summary.monthDeductions)} hint={`${amount(lopDays)} loss-of-pay days · ${leaveRows.length} leave`} />
        </div>
        <div className="pay-toolbar pay-run">
          <LabeledField label="Pay date">
            <input type="date" max={today} value={payDate} disabled={blocked} onChange={event => changePay({ payDate: event.target.value })} />
          </LabeledField>
          <LabeledField label="Paid from">
            <Select value={payAccountId} disabled={blocked} onChange={event => changePay({ payAccountId: event.target.value })}>
              {!paidFrom.length && <option value="">Add a cash, bank, or UPI ledger</option>}
              {paidFrom.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </Select>
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
          <AccTable spaced={false} columns={["Employee", { label: "Pay on record", num: true }, { label: "This month", num: true }, { label: "Days", num: true }, { label: "Deductions", num: true }, ""]} empty={!visibleRows.length && "No employee matches this search."}>
            {visibleRows.map(row => {
              const state = PAY_STATE[payState({ posted, inRun: row.inRun !== false, monthly: row.monthly, error: row.error })];
              const person = employees.find(item => item.id === row.partyId) || { id: row.partyId, name: row.name };
              return <tr key={row.partyId}>
                <td><strong>{row.name}</strong> <span className={`acc-status-pill ${state.tone}`}>{state.label}</span>{row.error ? <div className="small">{row.error}</div> : null}</td>
                <td className="acc-num">{payLabel(row)}</td>
                <td className="acc-num">{money(row.net)}</td>
                <td className="acc-num">{daysCell(row)}</td>
                <td className="acc-num">{heldCell(row)}</td>
                <td><div className="acc-btn-group">{rowActions(row, person)}</div></td>
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
                <div><dt>Pay on record</dt><dd>{payLabel(row)}</dd></div>
                <div><dt>This month</dt><dd>{money(row.net)}</dd></div>
                <div><dt>Days</dt><dd>{daysCell(row)}</dd></div>
                <div><dt>Deductions</dt><dd>{heldCell(row)}</dd></div>
              </dl>
              <div className="acc-btn-group pay-person-actions">{rowActions(row, person)}</div>
            </li>;
          })}
        </ul>
        <p className="copy pay-note">A monthly salary is reduced only for absent days, half days, and unpaid leave. Weekly offs, holidays, and paid leave stay in it. Daily and hourly staff are paid for what they worked. {PAYROLL_DISCLAIMER} Payroll figures should be reviewed before the month is posted. Collection agents stay in Collection Staff.</p>
      </>}

      {tab === "attendance" && <>
        <div className="pay-toolbar">{monthMenu}</div>
        {posted ? <p className="copy pay-note">{monthLabel(monthIso)} is posted. Attendance for this month stays as it was posted.</p> : null}
        <p className="copy pay-note">A working day with no mark counts as present. Sunday counts as a weekly off until you change it. Days on leave are changed from Leave.</p>
        {employees.length > 0 && <>
          <div className="pay-toolbar">
            <LabeledField label="Employee">
              <Select value={attendancePartyId} onChange={event => setPickedEmployee(event.target.value)}>
                {employees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
              </Select>
            </LabeledField>
            {canWrite && <button type="button" className="btn" onClick={() => openPanel()}>Add employee</button>}
            {canWrite && !posted && <button type="button" className="btn primary" disabled={busy} onClick={saveAttendance}>Save attendance</button>}
          </div>
          <div className="pay-day-grid" role="grid" aria-label={`Attendance for ${monthLabel(monthIso)}`}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(label => <div key={label} className="pay-dow">{label}</div>)}
            {Array.from({ length: calendarLead(monthIso) }, (_, index) => <div key={`pad-${index}`} />)}
            {attendancePartyId && monthDates(monthIso).map(day => {
              const resolved = resolveDay({ partyId: attendancePartyId, date: day.date, weekday: day.weekday, days: bundle.days, leaves: bundle.leave, holidays });
              if (resolved.source === "leave") {
                return <div key={day.date} className="pay-day is-leave"><span>{day.day}</span><small>{leaveTypeLabel(resolved.leaveType)}</small></div>;
              }
              const status = marks[day.date] || resolved.status;
              const worked = status === "present" || status === "half";
              const holiday = holidays.find(row => row.date === day.date);
              const setHours = patch => changeMarks({ hours: { ...hours, [day.date]: { ...(hours[day.date] || {}), ...patch } } });
              return <div key={day.date} className={`pay-day is-${status}`}>
                <span>{day.day}{holiday ? <small> · {holiday.name}</small> : null}</span>
                <select aria-label={`${day.date} attendance`} value={status} disabled={blocked} onChange={event => changeMarks({ marks: { ...marks, [day.date]: event.target.value } })}>
                  {DAY_STATUSES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
                {showHours && worked && <input className="pay-hours" inputMode="decimal" placeholder="Hours" aria-label={`${day.date} hours worked`} disabled={blocked} value={hours[day.date]?.hours || ""} onChange={event => setHours({ hours: event.target.value })} />}
                {showOvertime && worked && <input className="pay-hours" inputMode="decimal" placeholder="OT hours" aria-label={`${day.date} overtime hours`} disabled={blocked} value={hours[day.date]?.overtimeHours || ""} onChange={event => setHours({ overtimeHours: event.target.value })} />}
              </div>;
            })}
          </div>
        </>}
        {phase >= 1 && <HolidaysBlock
          holidays={holidays}
          canWrite={canWrite}
          busy={busy}
          onSave={holiday => act(() => savePayrollHoliday(token, holiday), "Could not save the holiday.")}
          onRemove={date => act(() => deletePayrollHoliday(token, date), "Could not remove the holiday.")}
        />}
        {ready && <PunchesBlock punches={extra.punches} employees={employees} canAdmin={canAdmin} onOpenPhoto={(id, kind) => loadPunchPhoto(token, id, kind)} />}
      </>}

      {tab === "leave" && <>
        <div className="pay-toolbar">{monthMenu}</div>
        {posted ? <p className="copy pay-note">{monthLabel(monthIso)} is posted. Leave for this month stays as it was posted.</p> : null}
        <p className="copy pay-note">Paid leave and sick leave stay in the salary. Unpaid leave reduces it.</p>
        {ready && <LeaveRequests requests={extra.requests} employees={employees} canWrite={canWrite} busy={busy} onDecide={(id, approve) => act(() => decideLeaveRequest(token, id, approve), "Could not answer the request.")} />}
        {canWrite && !posted && <div className="form pay-toolbar">
          <LabeledField label="Employee">
            <Select value={leaveForm.partyId} onChange={event => setLeaveForm(current => ({ ...current, partyId: event.target.value }))}>
              <option value="">Choose</option>
              {employees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </Select>
          </LabeledField>
          <LabeledField label="Type">
            <select value={leaveForm.leaveType} onChange={event => setLeaveForm(current => ({ ...current, leaveType: event.target.value }))}>
              {LEAVE_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
          </LabeledField>
          <LabeledField label="From"><input type="date" value={leaveForm.fromDate} onChange={event => setLeaveForm(current => ({ ...current, fromDate: event.target.value }))} /></LabeledField>
          <LabeledField label="To"><input type="date" value={leaveForm.toDate} onChange={event => setLeaveForm(current => ({ ...current, toDate: event.target.value }))} /></LabeledField>
          <Field className="span" label="Note"><input value={leaveForm.note} onChange={event => setLeaveForm(current => ({ ...current, note: event.target.value }))} /></Field>
          {leaveWarning ? <p className="copy span pay-warn">{leaveWarning} You can still save it.</p> : null}
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
        {phase >= 1 && <LeaveBalances employees={employees} profiles={bundle.profiles} leaveUsed={bundle.leaveUsed} year={month.slice(0, 4)} />}
      </>}

      {tab === "advances" && (phase >= 1
        ? <AdvancesTab
          employees={employees}
          advances={advances}
          paidFrom={paidFrom}
          canWrite={canWrite}
          busy={busy}
          onGive={giveAdvance}
          onFinish={advance => finishAdvance(advance)}
          onCancel={cancelAdvance}
        />
        : <AccEmpty title="Advances are not set up yet" copy="Run migration 149_accounts_payroll_phase1.sql in the Supabase SQL editor to record salary advances and staff loans." />)}

      {tab === "staffapp" && <StaffAppTab
        employees={employees}
        logins={extra?.logins || []}
        ready={ready}
        canAdmin={canAdmin}
        busy={busy}
        companyName={companyName}
        onIssue={person => act(() => issueStaffPortal(token, person.id), "The staff login could not be created.")}
        onDisable={person => act(() => disableStaffPortal(token, person.id), "The staff login could not be switched off.")}
      />}
    </>}

    {panel && <EmployeePanel
      key={panel.key}
      person={panelPerson}
      party={panelPerson ? (parties || []).find(party => party.id === panelPerson.id) : null}
      profile={panelPerson ? (bundle?.profiles || []).find(row => row.partyId === panelPerson.id) : null}
      staff={panelPerson ? (extra?.staff || []).find(row => row.partyId === panelPerson.id) : null}
      revisions={panelPerson ? (extra?.revisions || []).filter(row => row.partyId === panelPerson.id) : []}
      settlement={panelPerson ? (extra?.settlements || []).find(row => row.partyId === panelPerson.id) : null}
      advances={panelPerson ? advances.filter(row => row.partyId === panelPerson.id) : []}
      leaveUsed={bundle?.leaveUsed || []}
      monthRow={panelPerson ? rows.find(row => row.partyId === panelPerson.id) : null}
      monthIso={monthIso}
      paidFrom={paidFrom}
      phase={phase}
      ready={ready}
      canWrite={canWrite}
      busy={busy}
      initialTab={panel.initialTab}
      close={() => setPanel(null)}
      onSaveDetails={saveDetails}
      onSavePay={savePay}
      onSettle={settle}
    />}

    {monthParty && monthForm && <Modal title={`${monthLabel(monthIso)} · ${monthParty.name}`} close={() => setMonthParty(null)} actions={<button type="button" className="btn primary" onClick={applyMonthForm}>Use for this month</button>}>
      <p className="copy">Used for {monthLabel(monthIso)} only. Save the draft or post the month to keep it.</p>
      {phase >= 1 && <>
        <h3 className="pay-subhead">Extra pay</h3>
        <div className="form">
          <AmountFields values={monthForm} onChange={(id, value) => setMonthForm(current => ({ ...current, [id]: value }))} fields={EXTRA_FIELDS} />
          <LabeledField label={`Overtime amount${Number(monthParty.overtimeHours) > 0 ? ` (${amount(monthParty.overtimeHours)} hours on the sheet)` : ""}`}>
            <input inputMode="decimal" value={monthForm.overtimeAmount} placeholder={amount(monthParty.overtime || 0)} onChange={event => setMonthForm(current => ({ ...current, overtimeAmount: event.target.value }))} />
          </LabeledField>
        </div>
      </>}
      {monthForm.open.length > 0 && <>
        <h3 className="pay-subhead">Advance and loan recovery</h3>
        <div className="form">
          {monthForm.open.map(item => {
            const advance = advances.find(row => row.id === item.advanceId);
            return <LabeledField key={item.advanceId} label={`${item.kind === "loan" ? "Loan" : "Advance"} of ${formatOverviewDate(advance?.givenOn)} · ${money(advanceOutstanding(advance))} outstanding`}>
              <input inputMode="decimal" value={monthForm.recoveries[item.advanceId] ?? ""} onChange={event => setMonthForm(current => ({ ...current, recoveries: { ...current.recoveries, [item.advanceId]: event.target.value } }))} />
            </LabeledField>;
          })}
        </div>
      </>}
      <h3 className="pay-subhead">Deductions</h3>
      <div className="form">
        <AmountFields values={monthForm} onChange={(id, value) => setMonthForm(current => ({ ...current, [id]: value }))} fields={DEDUCTION_FIELDS} />
      </div>
      <p className="copy pay-note">{PAYROLL_DISCLAIMER}</p>
    </Modal>}

    {slip && <Modal title={`Payslip · ${slip.name}`} close={() => setSlip(null)}>
      <div className="pay-slip-actions">
        <button type="button" className="btn" onClick={printSlip}>Print</button>
        <button type="button" className="btn" onClick={downloadSlip}>Download PDF</button>
        <button type="button" className="btn primary" onClick={shareSlip} title={hasWhatsAppPhone(slipPhone) ? "" : "Add a phone number to open the chat directly"}>Send on WhatsApp</button>
      </div>
      <PayslipView slip={slip} companyName={companyName} monthIso={monthIso} payDate={payDate} />
    </Modal>}

    {confirmPost && <Modal title={`Post salary for ${monthLabel(monthIso)}`} close={() => !busy && setConfirmPost(false)} actions={<button type="button" className="btn primary" disabled={busy} onClick={postPay}>{busy ? "Posting…" : "Post salary"}</button>}>
      <p className="copy">This pays {summary.inMonth} {summary.inMonth === 1 ? "employee" : "employees"}, {money(summary.monthNet)}, from {payAccountName}. A posted month stays as it was paid.</p>
    </Modal>}
    {confirmLate && <Modal title={`Post salary for ${confirmLate.name}`} close={() => !busy && setConfirmLate(null)} actions={<button type="button" className="btn primary" disabled={busy} onClick={postLate}>{busy ? "Posting…" : "Post salary"}</button>}>
      <p className="copy">This adds {money(confirmLate.net)} for {confirmLate.name} to {monthLabel(monthIso)}, from {payAccountName}. Salaries already posted this month stay as they are.</p>
    </Modal>}
  </div>;
}
