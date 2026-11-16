import { useState } from "react";
import { Field, LabeledField } from "../../../../components/ui.jsx";
import { Select } from "../../../../components/Select.jsx";
import { todayIso } from "../../../../lib/dates.js";
import { money, formatOverviewDate } from "../../accountsFormat.js";
import { AccTable, Modal } from "../../components/AccUi.jsx";
import { validatePartyForm } from "../../model/accountingModel.js";
import {
  DAY_BASIS,
  PAY_TYPES,
  PAYROLL_DISCLAIMER,
  advanceOutstanding,
  deductionTotal,
  emptyProfile,
  monthLabel,
  monthlyGross,
  payTypeOf,
} from "../../model/payroll.js";
import {
  assertBankDetails,
  gratuityEstimate,
  leaveBalance,
  revisionAmount,
  revisionChange,
  settlementTotals,
} from "../../model/payrollExtras.js";

const plain = value => String(Number(value) || 0);

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
const NUMBER_FIELDS = [...PAY_FIELDS, ...DEDUCTION_FIELDS, { id: "rate" }, { id: "overtimeRate" }, { id: "paidLeaveQuota" }, { id: "sickLeaveQuota" }];

function Amounts({ values, set, fields }) {
  return fields.map(field => (
    <LabeledField key={field.id} label={field.label}>
      <input inputMode="decimal" value={values[field.id]} onChange={event => set({ [field.id]: event.target.value })} />
    </LabeledField>
  ));
}

/**
 * One place for everything about an employee: who they are and where they are paid,
 * what they are paid, how that has changed, and leaving.
 */
export function EmployeePanel({
  person,
  party,
  profile,
  staff,
  revisions,
  settlement,
  advances,
  leaveUsed,
  monthRow,
  monthIso,
  paidFrom,
  phase,
  ready,
  canWrite,
  busy,
  initialTab = "details",
  close,
  onSaveDetails,
  onSavePay,
  onSettle,
}) {
  const isNew = !person?.id;
  const [tab, setTab] = useState(isNew ? "details" : initialTab);
  const [problem, setProblem] = useState("");
  const [details, setDetails] = useState(() => ({
    name: party?.name || person?.name || "",
    phone: party?.phone || "",
    email: party?.email || "",
    address: party?.address || "",
    joinedOn: staff?.joinedOn || "",
    fixedTerm: Boolean(staff?.fixedTerm),
    bankHolder: staff?.bankHolder || "",
    bankAccount: staff?.bankAccount || "",
    bankIfsc: staff?.bankIfsc || "",
    bankName: staff?.bankName || "",
  }));
  const source = profile || emptyProfile(person?.id);
  const [pay, setPay] = useState(() => ({
    payType: payTypeOf(source),
    dayBasis: source.dayBasis || 0,
    effectiveFrom: todayIso().slice(0, 7),
    revisionNote: "",
    ...Object.fromEntries(NUMBER_FIELDS.map(field => [field.id, plain(source[field.id])])),
  }));
  const outstanding = (advances || []).filter(row => row.status === "open").reduce((sum, row) => sum + advanceOutstanding(row), 0);
  const balance = leaveBalance({ profile: source, used: leaveUsed, partyId: person?.id });
  const monthlySalary = payTypeOf(source) === "monthly" ? monthlyGross(source) : 0;
  const perDayDefault = payTypeOf(source) === "monthly" ? Math.round((monthlySalary / 26) * 100) / 100 : payTypeOf(source) === "daily" ? Number(source.rate || 0) : 0;
  const [exit, setExit] = useState(() => ({
    lastDay: settlement?.lastDay || todayIso(),
    payDate: settlement?.payDate || todayIso(),
    payAccountId: "",
    unpaidSalary: plain(settlement?.unpaidSalary ?? 0),
    leaveDays: plain(settlement?.leaveDays ?? Math.max(0, balance.paid.left || 0)),
    perDay: plain(perDayDefault),
    gratuity: settlement ? plain(settlement.gratuity) : "",
    otherPay: plain(settlement?.otherPay ?? 0),
    advanceRecovery: plain(settlement?.advanceRecovery ?? outstanding),
    otherDeduction: plain(settlement?.otherDeduction ?? 0),
    note: settlement?.note || "",
  }));
  const [confirmExit, setConfirmExit] = useState(false);

  const setD = patch => setDetails(current => ({ ...current, ...patch }));
  const setP = patch => setPay(current => ({ ...current, ...patch }));
  const setE = patch => setExit(current => ({ ...current, ...patch }));

  const saveDetails = async () => {
    const name = details.name.trim();
    if (!name) { setProblem("Enter the employee name."); return; }
    const message = validatePartyForm({ ...details, name, partyType: "employee" }) || (ready ? assertBankDetails(details) : "");
    setProblem(message || "");
    if (message) return;
    await onSaveDetails({ ...details, name });
  };

  const payNumbers = Object.fromEntries(NUMBER_FIELDS.map(field => [field.id, Number(pay[field.id] || 0)]));
  const previewGross = pay.payType === "monthly" ? payNumbers.basic + payNumbers.hra + payNumbers.allowance : 0;
  const previewHeld = deductionTotal(payNumbers);
  const halfRule = pay.payType === "monthly" && previewGross > 0 && payNumbers.basic < previewGross / 2;
  const savePay = async () => {
    if (Object.values(payNumbers).some(value => !Number.isFinite(value) || value < 0)) { setProblem("Amounts cannot be negative."); return; }
    if (pay.payType !== "monthly" && !(payNumbers.rate > 0)) { setProblem("Enter the rate."); return; }
    setProblem("");
    await onSavePay({
      partyId: person.id,
      payType: pay.payType,
      dayBasis: Number(pay.dayBasis || 0),
      effectiveFrom: `${pay.effectiveFrom}-01`,
      revisionNote: pay.revisionNote.trim(),
      ...payNumbers,
    });
  };

  const estimate = gratuityEstimate({
    basic: source.basic,
    monthlySalary,
    joinedOn: details.joinedOn,
    lastDay: exit.lastDay,
    fixedTerm: details.fixedTerm,
  });
  const gratuityValue = exit.gratuity === "" ? estimate.amount : Number(exit.gratuity || 0);
  const totals = settlementTotals({ ...exit, gratuity: gratuityValue, advanceRecovery: Math.min(Number(exit.advanceRecovery || 0), outstanding) });
  const exitAccount = exit.payAccountId || paidFrom.find(account => account.accountType === "bank")?.id || paidFrom[0]?.id || "";
  const settled = settlement?.status === "posted";
  const history = (revisions || []).slice().sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));

  const tabs = [
    { id: "details", label: "Details" },
    ...(isNew ? [] : [{ id: "pay", label: "Pay" }]),
    ...(isNew || !ready ? [] : [{ id: "history", label: "Pay history" }, { id: "exit", label: "Leaving" }]),
  ];
  const actions = !canWrite ? null
    : tab === "details" ? <button type="button" className="btn primary" disabled={busy} onClick={saveDetails}>{isNew ? "Add employee" : "Save details"}</button>
      : tab === "pay" ? <button type="button" className="btn primary" disabled={busy} onClick={savePay}>Save pay</button>
        : tab === "exit" && !settled ? <button type="button" className="btn primary" disabled={busy || Boolean(totals.error) || !exit.lastDay || (totals.net > 0 && !exitAccount)} onClick={() => setConfirmExit(true)}>Settle and close</button>
          : null;

  return <Modal wide title={isNew ? "Add employee" : person.name} close={() => !busy && close()} actions={actions}>
    {tabs.length > 1 && <div className="tabs pay-tabs" role="tablist">
      {tabs.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`tab${tab === item.id ? " active" : ""}`} onClick={() => { setProblem(""); setTab(item.id); }}>{item.label}</button>)}
    </div>}
    {problem ? <p className="copy" role="alert">{problem}</p> : null}

    {tab === "details" && <>
      <p className="copy">This person is paid from Payroll. They do not appear with customers and suppliers.</p>
      <div className="form">
        <Field label="Name"><input value={details.name} onChange={event => setD({ name: event.target.value })} /></Field>
        <Field label="Phone"><input value={details.phone} placeholder="10-digit mobile" onChange={event => setD({ phone: event.target.value })} /></Field>
        <Field label="Email"><input value={details.email} placeholder="optional" onChange={event => setD({ email: event.target.value })} /></Field>
        <Field className="span" label="Address"><input value={details.address} placeholder="optional" onChange={event => setD({ address: event.target.value })} /></Field>
      </div>
      {ready ? <>
        <h3 className="pay-subhead">Joining</h3>
        <div className="form">
          <Field label="Joined on"><input type="date" value={details.joinedOn} onChange={event => setD({ joinedOn: event.target.value })} /></Field>
          <label className="pay-check">
            <input type="checkbox" checked={details.fixedTerm} onChange={event => setD({ fixedTerm: event.target.checked })} />
            <span>Fixed-term contract</span>
          </label>
        </div>
        <h3 className="pay-subhead">Bank account for salary</h3>
        <p className="copy">Used for the bank payment file. Leave blank for someone paid in cash.</p>
        <div className="form">
          <Field label="Account holder"><input value={details.bankHolder} placeholder={details.name} onChange={event => setD({ bankHolder: event.target.value })} /></Field>
          <Field label="Account number"><input inputMode="numeric" value={details.bankAccount} onChange={event => setD({ bankAccount: event.target.value })} /></Field>
          <Field label="IFSC"><input value={details.bankIfsc} placeholder="HDFC0001234" onChange={event => setD({ bankIfsc: event.target.value.toUpperCase() })} /></Field>
          <Field label="Bank"><input value={details.bankName} placeholder="optional" onChange={event => setD({ bankName: event.target.value })} /></Field>
        </div>
      </> : null}
    </>}

    {tab === "pay" && <>
      <p className="copy">A month that is already posted keeps the figures it was posted with.</p>
      <div className="form">
        <LabeledField label="Paid by">
          <select value={pay.payType} disabled={phase < 1} onChange={event => setP({ payType: event.target.value })}>
            {PAY_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </LabeledField>
        {pay.payType === "monthly" ? <>
          <Amounts values={pay} set={setP} fields={PAY_FIELDS} />
          <LabeledField label="Divide the month by">
            <select value={pay.dayBasis} onChange={event => setP({ dayBasis: event.target.value })}>
              {DAY_BASIS.map(basis => <option key={basis.id} value={basis.id}>{basis.label}</option>)}
            </select>
          </LabeledField>
        </> : <LabeledField label={pay.payType === "daily" ? "Wage for a day" : "Wage for an hour"}>
          <input inputMode="decimal" value={pay.rate} onChange={event => setP({ rate: event.target.value })} />
        </LabeledField>}
        {phase >= 1 && <LabeledField label="Overtime for an hour">
          <input inputMode="decimal" value={pay.overtimeRate} onChange={event => setP({ overtimeRate: event.target.value })} />
        </LabeledField>}
      </div>
      {phase < 1 && <p className="copy pay-note">Run migration 149_accounts_payroll_phase1.sql to pay by the day or hour, add overtime, and set leave allowances.</p>}
      {pay.payType === "daily" && <p className="copy pay-note">Paid for each day marked present and for paid leave. Weekly offs and holidays are not paid.</p>}
      {pay.payType === "hourly" && <p className="copy pay-note">Paid for the hours entered on the attendance sheet, or filled in when the employee punches out.</p>}
      {ready && profile ? <div className="form">
        <LabeledField label="Change applies from">
          <input type="month" value={pay.effectiveFrom} onChange={event => setP({ effectiveFrom: event.target.value })} />
        </LabeledField>
        <Field label="Reason for the change"><input value={pay.revisionNote} placeholder="Annual raise" onChange={event => setP({ revisionNote: event.target.value })} /></Field>
      </div> : null}
      {phase >= 1 && <>
        <h3 className="pay-subhead">Leave allowed in a year</h3>
        <div className="form">
          <Amounts values={pay} set={setP} fields={[{ id: "paidLeaveQuota", label: "Paid leave days" }, { id: "sickLeaveQuota", label: "Sick leave days" }]} />
        </div>
      </>}
      <h3 className="pay-subhead">Deductions each month</h3>
      <div className="form">
        <Amounts values={pay} set={setP} fields={DEDUCTION_FIELDS} />
      </div>
      {pay.payType === "monthly" && previewGross > 0 && <dl className="pay-preview">
        <div><dt>Monthly salary</dt><dd>{money(previewGross)}</dd></div>
        <div><dt>Deductions</dt><dd>{money(previewHeld)}</dd></div>
        <div><dt>Take-home</dt><dd>{money(Math.max(0, previewGross - previewHeld))}</dd></div>
      </dl>}
      {halfRule && <p className="copy pay-note pay-warn">Basic is less than half of the salary. Under the Labour Codes, wages (basic and dearness allowance) should be at least 50% of total pay. Check this with your accountant.</p>}
      <p className="copy pay-note">{PAYROLL_DISCLAIMER}</p>
    </>}

    {tab === "history" && <AccTable columns={["From", "Paid by", { label: "Pay", num: true }, "Change", "Reason"]} empty={!history.length && "No pay on record yet."}>
      {history.map((row, index) => {
        const change = revisionChange(row, history[index + 1]);
        return <tr key={row.id}>
          <td>{row.effectiveFrom <= "2000-01-01" ? "Start" : monthLabel(row.effectiveFrom)}</td>
          <td>{PAY_TYPES.find(type => type.id === row.payType)?.label || "Monthly salary"}</td>
          <td className="acc-num">{money(revisionAmount(row))}</td>
          <td>{change ? `${change.amount >= 0 ? "+" : "−"}${money(Math.abs(change.amount))} (${change.percent}%)` : "—"}</td>
          <td>{row.note}</td>
        </tr>;
      })}
    </AccTable>}

    {tab === "exit" && (settled ? <>
      <p className="copy">Settled. Last working day {formatOverviewDate(settlement.lastDay)}. {money(settlement.net)} was paid.</p>
      <dl className="pay-preview">
        <div><dt>Salary and leave</dt><dd>{money(settlement.unpaidSalary + settlement.leaveEncashment + settlement.otherPay)}</dd></div>
        <div><dt>Gratuity</dt><dd>{money(settlement.gratuity)}</dd></div>
        <div><dt>Recovered</dt><dd>{money(settlement.advanceRecovery + settlement.otherDeduction)}</dd></div>
      </dl>
    </> : <>
      <p className="copy">Final settlement pays what is still owed and closes the employee. Under the Labour Codes, final wages are due within two working days of leaving.</p>
      <div className="form">
        <Field label="Last working day"><input type="date" value={exit.lastDay} onChange={event => setE({ lastDay: event.target.value })} /></Field>
        <Field label="Salary not yet paid"><input inputMode="decimal" value={exit.unpaidSalary} onChange={event => setE({ unpaidSalary: event.target.value })} /></Field>
        <Field label="Leave days to pay out"><input inputMode="decimal" value={exit.leaveDays} onChange={event => setE({ leaveDays: event.target.value })} /></Field>
        <Field label="Pay for one leave day"><input inputMode="decimal" value={exit.perDay} onChange={event => setE({ perDay: event.target.value })} /></Field>
        <Field label="Gratuity"><input inputMode="decimal" value={exit.gratuity} placeholder={plain(estimate.amount)} onChange={event => setE({ gratuity: event.target.value })} /></Field>
        <Field label="Other pay (bonus, notice pay)"><input inputMode="decimal" value={exit.otherPay} onChange={event => setE({ otherPay: event.target.value })} /></Field>
        <Field label={`Advance to recover (${money(outstanding)} outstanding)`}><input inputMode="decimal" value={exit.advanceRecovery} onChange={event => setE({ advanceRecovery: event.target.value })} /></Field>
        <Field label="Other deduction"><input inputMode="decimal" value={exit.otherDeduction} onChange={event => setE({ otherDeduction: event.target.value })} /></Field>
        <Field label="Pay date"><input type="date" max={todayIso()} value={exit.payDate} onChange={event => setE({ payDate: event.target.value })} /></Field>
        <LabeledField label="Paid from">
          <Select value={exitAccount} onChange={event => setE({ payAccountId: event.target.value })}>
            {!paidFrom.length && <option value="">Add a cash, bank, or UPI ledger</option>}
            {paidFrom.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </Select>
        </LabeledField>
        <Field className="span" label="Note"><input value={exit.note} onChange={event => setE({ note: event.target.value })} /></Field>
      </div>
      <p className="copy pay-note">{estimate.eligible
        ? `Gratuity estimate: ${money(estimate.amount)} — 15 days of wages (${money(estimate.wages)} a month) for ${estimate.years} years of service. Change the figure if your accountant works it out differently.`
        : `Gratuity estimate: none. ${estimate.reason}`}{monthRow && monthRow.inRun !== false && Number(monthRow.net) > 0 && !monthRow.voucherId ? ` ${monthLabel(monthIso)} is not posted yet: ${money(monthRow.net)} is this month’s pay so far.` : ""}</p>
      <dl className="pay-preview">
        <div><dt>Due to the employee</dt><dd>{money(totals.payable)}</dd></div>
        <div><dt>Recovered</dt><dd>{money(totals.held)}</dd></div>
        <div><dt>To pay</dt><dd>{money(totals.net)}</dd></div>
      </dl>
      {totals.error ? <p className="copy" role="alert">{totals.error}</p> : null}
    </>)}

    {confirmExit && <Modal title={`Settle and close ${person.name}`} close={() => !busy && setConfirmExit(false)} actions={<button type="button" className="btn primary" disabled={busy} onClick={async () => {
      const done = await onSettle({
        ...totals,
        id: settlement?.id || null,
        partyId: person.id,
        lastDay: exit.lastDay,
        payDate: exit.payDate,
        payAccountId: exitAccount,
        note: exit.note.trim(),
      });
      setConfirmExit(false);
      if (done) close();
    }}>{busy ? "Settling…" : "Settle and close"}</button>}>
      <p className="copy">This pays {money(totals.net)} to {person.name}, records {formatOverviewDate(exit.lastDay)} as the last working day, removes them from future pay, and switches off their staff login. This cannot be undone here.</p>
    </Modal>}
  </Modal>;
}
