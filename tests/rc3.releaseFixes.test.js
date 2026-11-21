// Regression tests for the RC3 end-to-end QA findings (2026-11-21).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { earliestPaymentDate, paymentDateError } from "../src/features/finance/model/paymentDates.js";
import { counterReturnError, counterReturnLimits } from "../src/features/accounts/model/counterReturns.js";
import { counterDayReport } from "../src/features/accounts/model/counterDayReport.js";
import { counterDayCloseCoach } from "../src/features/accounts/model/counterAi.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// ---- P1-1: double-submit on Create account --------------------------------------------------
test("P1-1 create and edit account buttons are locked while saving", () => {
  const src = read("src/features/finance/components/AccountForms.jsx");
  const create = src.slice(src.indexOf("export function NewFinance"), src.indexOf("export function Payment"));
  assert.match(create, /if \(busy\) return;/);
  assert.match(create, /disabled=\{busy\} onClick=\{submit\}>\{busy \? "Creating…" : "Create account"\}/);
  const edit = src.slice(src.indexOf("export function EditAccount"));
  assert.match(edit.slice(0, 2500), /if \(busy\) return;/);
});

test("P1-1 database refuses the same account opened twice within 30 seconds", () => {
  const sql = read("supabase/154_rc3_money_guards_and_lift_reversal.sql");
  assert.match(sql, /create trigger finance_accounts_double_submit_guard\s+before insert on public\.finance_accounts/);
  assert.match(sql, /interval '30 seconds'/);
  assert.match(sql, /pg_advisory_xact_lock/);
});

// ---- P2-2: payment dates -------------------------------------------------------------------
const daily = { kind: "daily", startDate: "2026-11-15" };
const monthly = { kind: "monthly", startDate: "2026-08-21" };

test("P2-2 daily collections start the day after the account opens", () => {
  assert.equal(earliestPaymentDate(daily), "2026-11-16");
  assert.match(paymentDateError(daily, "2026-11-10", "2026-11-21"), /start the day after/);
  assert.match(paymentDateError(daily, "2026-11-15", "2026-11-21"), /start the day after/);
  assert.equal(paymentDateError(daily, "2026-11-16", "2026-11-21"), "");
  assert.equal(paymentDateError(daily, "2026-11-21", "2026-11-21"), "");
});

test("P2-2 payments cannot be dated in the future", () => {
  assert.match(paymentDateError(daily, "2026-12-25", "2026-11-21"), /future/);
  assert.match(paymentDateError(monthly, "2026-11-22", "2026-11-21"), /future/);
});

test("P2-2 monthly payments may fall on the start date but not before it", () => {
  assert.equal(paymentDateError(monthly, "2026-08-21", "2026-11-21"), "");
  assert.match(paymentDateError(monthly, "2026-08-20", "2026-11-21"), /before the account start date/);
  assert.match(paymentDateError(monthly, "", "2026-11-21"), /Choose a payment date/);
});

test("P2-2 the record-payment form checks the date and bounds the picker", () => {
  const src = read("src/features/finance/components/AccountForms.jsx");
  assert.match(src, /const dateError = paymentDateError\(loan, f\.date\);/);
  assert.match(src, /min=\{earliestPaymentDate\(loan\) \|\| undefined\} max=\{today\(\)\}/);
});

test("P2-2 database refuses future and pre-start dates for finance and chit money", () => {
  const sql = read("supabase/154_rc3_money_guards_and_lift_reversal.sql");
  for (const name of ["payments_date_guard", "chit_installments_date_guard", "fixed_chit_payments_date_guard",
    "predefined_chit_payments_date_guard", "chit_cycles_date_guard", "fixed_chit_lifts_date_guard",
    "predefined_chit_schedule_date_guard"]) {
    assert.match(sql, new RegExp(`create trigger ${name}`), name);
  }
  assert.match(sql, /acct\.start_date \+ 1/);
});

// ---- P1-2: Counter returns -----------------------------------------------------------------
const vouchers = [
  { id: "s1", voucherType: "sales", status: "posted" },
  { id: "s2", voucherType: "sales", status: "cancelled" },
  { id: "r1", voucherType: "credit_note", status: "posted" },
];
const itemLines = [
  { voucherId: "s1", itemId: "i1", quantity: 2, taxableAmount: 270 },  // ₹150 list, 10% bill discount
  { voucherId: "s2", itemId: "i1", quantity: 40, taxableAmount: 6000 }, // cancelled: does not count
  { voucherId: "r1", itemId: "i1", quantity: 1, taxableAmount: 135 },
];
const limits = counterReturnLimits({ vouchers, voucherItemLines: itemLines });
const line = (quantity, rate) => ({ itemId: "i1", name: "Paint", quantity, rate, unit: "Nos", discount: "" });

test("P1-2 returnable quantity is sold minus already returned, ignoring cancelled bills", () => {
  assert.deepEqual(limits.get("i1"), { sold: 2, returned: 1, maxNetRate: 135, returnable: 1 });
});

test("P1-2 the 50-unit refund from RC3 is refused", () => {
  assert.match(counterReturnError([line(50, 150)], limits), /only 1 can be returned/);
});

test("P1-2 refund at list price above the billed price is refused", () => {
  assert.match(counterReturnError([line(1, 150)], limits), /above the billed price after discount \(135\)/);
});

test("P1-2 a return within what was sold, at the billed price, is allowed", () => {
  assert.equal(counterReturnError([line(1, 135)], limits), "");
});

test("P1-2 an item never sold cannot be returned", () => {
  assert.match(counterReturnError([{ itemId: "i9", name: "Brush", quantity: 1, rate: 10, unit: "Nos" }], limits), /no posted sale/);
});

test("P1-2 Counter checks returns before posting and the database enforces the same rule", () => {
  const src = read("src/features/accounts/components/CounterWorkspace.jsx");
  assert.match(src, /counterReturnError\(chargeLines, counterReturnLimits\(\{ vouchers, voucherItemLines \}\)\)/);
  const sql = read("supabase/154_rc3_money_guards_and_lift_reversal.sql");
  assert.match(sql, /create trigger acc_counter_return_guard\s+after insert on public\.acc_voucher_item_lines/);
});

// ---- P2-1: Day close and Day report include refunds ----------------------------------------
const accounts = [
  { id: "cash", accountType: "cash" }, { id: "upi", accountType: "upi" }, { id: "bank", accountType: "bank" },
  { id: "sales", accountType: "income" },
];
const day = "2026-11-21";
const dayVouchers = [
  { id: "a", voucherType: "sales", sourceType: "pos_counter", status: "posted", date: day, narration: "Counter sale · Till 1 · Cash",
    lines: [{ coaId: "cash", debit: 318.6, credit: 0 }, { coaId: "sales", debit: 0, credit: 318.6 }] },
  { id: "b", voucherType: "sales", sourceType: "pos_counter", status: "posted", date: day, narration: "Counter sale · Till 1 · Split",
    lines: [{ coaId: "cash", debit: 77, credit: 0 }, { coaId: "upi", debit: 50, credit: 0 }, { coaId: "bank", debit: 50, credit: 0 }, { coaId: "sales", debit: 0, credit: 177 }] },
  { id: "c", voucherType: "credit_note", sourceType: "pos_counter", status: "posted", date: day, narration: "Counter return · Till 1 · Cash",
    lines: [{ coaId: "sales", debit: 100, credit: 0 }, { coaId: "cash", debit: 0, credit: 100 }] },
  { id: "d", voucherType: "credit_note", sourceType: "pos_counter", status: "cancelled", date: day, narration: "Counter return · Till 1 · Cash",
    lines: [{ coaId: "sales", debit: 8850, credit: 0 }, { coaId: "cash", debit: 0, credit: 8850 }] },
  { id: "e", voucherType: "credit_note", sourceType: "pos_counter", status: "posted", date: day, narration: "Counter return · Till 2 · Cash",
    lines: [{ coaId: "sales", debit: 40, credit: 0 }, { coaId: "cash", debit: 0, credit: 40 }] },
];

test("P2-1 Day report lists today's refunds for the till and nets them off", () => {
  const report = counterDayReport(accounts, dayVouchers, { date: day, tillLabel: "Till 1" });
  assert.equal(report.billCount, 2);
  assert.equal(report.returnCount, 1);
  assert.deepEqual(report.refunds, { cash: 100, upi: 0, card: 0, total: 100 });
  assert.equal(report.tender.cash, 395.6);
  assert.equal(report.netTender.cash, 295.6);
  assert.equal(report.netSales, 395.6);
  const refundRow = report.bills.find(row => row.isReturn);
  assert.equal(refundRow.amount, -100);
  assert.equal(refundRow.modeLabel, "Refund · Cash");
});

test("P2-1 Day close expected cash subtracts cash refunds", () => {
  const report = counterDayReport(accounts, dayVouchers, { date: day, tillLabel: "Till 1" });
  const tips = counterDayCloseCoach({ report, openingFloat: 0, countedCash: 295.6 });
  assert.match(tips[0].detail, /cash tenders 395\.6 − cash refunds 100 .*= expected 295\.6/);
  assert.ok(tips.some(tip => tip.id === "close-ok"));
});

test("P2-1 Counter drawer expectation uses cash after refunds", () => {
  const src = read("src/features/accounts/components/CounterWorkspace.jsx");
  assert.match(src, /todayCloseReport\.tender\.cash - \(todayCloseReport\.refunds\?\.cash \|\| 0\)/);
});

// ---- P2-3: chit portal PIN on a second scheme ----------------------------------------------
test("P2-3 enabling the portal applies the owner's PIN to the member's whole login", () => {
  const src = read("src/features/chitFund/components/ChitMemberParts.jsx");
  const save = src.slice(src.indexOf("export const ChitPortalAccess"), src.indexOf("function ChitMemberPortalSetup"));
  assert.ok(save.indexOf("enableChitMemberPortal") < save.indexOf("resetChitMemberPortalPin(token, enrollment.id, pin)", save.indexOf("enableChitMemberPortal")));
});

// ---- P2-4: lift reversal -------------------------------------------------------------------
test("P2-4 a lift can be reversed from the UI through a guarded RPC", () => {
  const sql = read("supabase/154_rc3_money_guards_and_lift_reversal.sql");
  assert.match(sql, /create or replace function public\.chit_reverse_lift\(input_scheme_id uuid, input_month_number integer, input_reason text\)/);
  assert.match(sql, /Members have already paid this month/);
  assert.match(sql, /already in Accounts/);
  assert.match(sql, /'lift_reversed'/);
  for (const path of ["auction/AuctionChitSchemeDetails.jsx", "fixed/FixedChitSchemeDetails.jsx", "predefined/PredefinedBidSchemeDetails.jsx"]) {
    assert.match(read(`src/features/chitFund/${path}`), /<ChitReverseLiftButton /, path);
  }
});
