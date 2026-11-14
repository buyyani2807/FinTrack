import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CHIT_RECEIPT_SOURCE,
  chitInstallmentFigure,
  chitLiftTimeline,
  chitMemberSummary,
  chitSchemeKind,
  chitSchemePayments,
  chitSchemeProgress,
  chitStatusText,
  defaultChitPaymentMonth,
} from "../src/features/chitFund/model/chitSchemeView.js";
import { CHIT_SCHEME_TABS, chitSchemeTabIds } from "../src/features/chitFund/model/chitSchemeChrome.js";

const read = path => fs.readFileSync(path, "utf8");

const auction = { id: "a", chit_type: "auction", duration_months: 3, chit_value: 2000, installment_amount: 1000, member_count: 2 };
const fixed = { id: "f", chit_type: "fixed", duration_months: 2, chit_value: 2000, installment_amount: 1000, member_count: 2 };
const predefined = { id: "p", chit_type: "fixed_predefined_bid", duration_months: 2, chit_value: 2000, installment_amount: 1000, predefined_starting_emi: 950, member_count: 2 };

test("every type has the same tab order, with Auction's extras placed beside their equivalents", () => {
  assert.deepEqual(chitSchemeTabIds("fixed"), ["overview", "members", "schedule", "payments", "reports"]);
  assert.deepEqual(chitSchemeTabIds("predefined"), ["overview", "members", "schedule", "payments", "reports"]);
  assert.deepEqual(chitSchemeTabIds("auction"), ["overview", "members", "bids", "live", "payments", "dividends", "reports"]);
  // Tab ids are URL segments; existing links keep working.
  for (const id of ["overview", "members", "bids", "payments", "dividends", "live"]) assert.ok(chitSchemeTabIds("auction").includes(id), id);
  assert.equal(CHIT_SCHEME_TABS.fixed[2][1], CHIT_SCHEME_TABS.predefined[2][1]);
});

test("scheme kind and receipt source map every chit type", () => {
  assert.equal(chitSchemeKind(auction), "auction");
  assert.equal(chitSchemeKind({}), "auction");
  assert.equal(chitSchemeKind(fixed), "fixed");
  assert.equal(chitSchemeKind(predefined), "predefined");
  assert.deepEqual(CHIT_RECEIPT_SOURCE, { auction: "chit_auction", fixed: "chit_fixed", predefined: "chit_predefined" });
});

test("installment figure is the member's configured monthly payment for each type", () => {
  assert.deepEqual(chitInstallmentFigure(auction), { label: "Monthly installment", amount: 1000 });
  assert.deepEqual(chitInstallmentFigure(fixed), { label: "Monthly contribution", amount: 1000 });
  // Predefined Bid stores chit value / members in installment_amount; the member actually pays the EMI.
  assert.deepEqual(chitInstallmentFigure(predefined), { label: "Starting EMI", amount: 950 });
});

test("progress means the same thing for every type: latest finalized lift and next month waiting", () => {
  const auctionDetails = {
    cycles: [
      { id: "c1", cycle_number: 1, cycle_date: "2026-10-14", winning_enrollment_id: "e1", winning_bid_amount: 1800, discount_amount: 200 },
      { id: "c9", cycle_number: 9, cycle_date: "2026-10-20", winning_enrollment_id: "e2", winning_bid_amount: 1700 },
    ],
  };
  const a = chitSchemeProgress(auction, auctionDetails);
  assert.equal(a.liftedCount, 1); // month 9 is outside a 3-month scheme
  assert.equal(a.latest.month, 1);
  assert.equal(a.latest.amount, 1800);
  assert.equal(a.latest.enrollmentId, "e1");
  assert.equal(a.next.month, 2);
  assert.equal(a.next.scheduledAmount, null); // decided by the auction, not scheduled
  assert.equal(chitLiftTimeline(auction, auctionDetails).length, 3);

  const fixedDetails = {
    fixedLifts: [
      { id: "l2", month_number: 2, lift_amount: 1950, status: "pending" },
      { id: "l1", month_number: 1, lift_amount: 1900, amount_paid_to_member: 1900, status: "completed", enrollment_id: "e1", lift_date: "2026-10-14" },
    ],
  };
  const f = chitSchemeProgress(fixed, fixedDetails);
  assert.equal(f.liftedCount, 1);
  assert.equal(f.latest.month, 1);
  assert.equal(f.latest.amount, 1900);
  assert.equal(f.next.month, 2);
  assert.equal(f.next.scheduledAmount, 1950);

  const predefinedDetails = {
    predefinedSchedule: [
      { id: "s1", month_number: 1, net_receivable: 1700, bid_amount: 1800, status: "completed", enrollment_id: "e1", assigned_date: "2026-10-14" },
      { id: "s2", month_number: 2, net_receivable: 1750, bid_amount: 1850, status: "pending" },
    ],
  };
  const p = chitSchemeProgress(predefined, predefinedDetails);
  assert.equal(p.latest.amount, 1700);
  assert.equal(p.next.month, 2);
  assert.equal(p.next.scheduledAmount, 1750);
  assert.equal(p.next.bidAmount, 1850);

  const done = chitSchemeProgress(fixed, { fixedLifts: fixedDetails.fixedLifts.map(row => ({ ...row, status: "completed", enrollment_id: row.enrollment_id || "e2" })) });
  assert.equal(done.next, null);
  assert.equal(done.liftedCount, 2);
});

test("payment rows carry their month for every type and the default month follows one rule", () => {
  const auctionRows = chitSchemePayments(auction, {
    cycles: [{ id: "c1", cycle_number: 1 }, { id: "c2", cycle_number: 2 }],
    installments: [
      { id: "i1", cycle_id: "c1", enrollment_id: "e1", due_date: "2026-10-14", net_amount_due: 950, amount_paid: 0 },
      { id: "i2", cycle_id: "c2", enrollment_id: "e1", due_date: "2026-11-14", net_amount_due: 950, amount_paid: 0 },
    ],
  });
  assert.deepEqual(auctionRows.map(row => row.month), [1, 2]);
  // Latest month whose due date has arrived.
  assert.equal(defaultChitPaymentMonth(auctionRows, "2026-11-01"), 1);
  assert.equal(defaultChitPaymentMonth(auctionRows, "2026-11-14"), 2);
  // Before anything is due: the first month with rows.
  assert.equal(defaultChitPaymentMonth(auctionRows, "2026-09-01"), 1);
  assert.equal(defaultChitPaymentMonth([], "2026-11-14"), 1);

  const fixedRows = chitSchemePayments(fixed, { fixedPayments: [{ id: "x", payment_month: "2", due_date: "2026-11-14" }] });
  assert.equal(fixedRows[0].month, 2);
  const predefinedRows = chitSchemePayments(predefined, { predefinedPayments: [{ id: "y", payment_month: 1, due_date: "2026-10-14" }] });
  assert.equal(predefinedRows[0].month, 1);
});

test("member summary uses enrollment ids, not names, and counts only months already due", () => {
  const details = {
    enrollments: [{ id: "e1", chit_members: { full_name: "Same Name" } }, { id: "e2", chit_members: { full_name: "Same Name" } }],
    fixedLifts: [{ id: "l1", month_number: 1, lift_amount: 1900, amount_paid_to_member: 1900, status: "completed", enrollment_id: "e2", lift_date: "2026-10-14" }],
    fixedPayments: [
      { id: "p1", enrollment_id: "e1", payment_month: 1, due_date: "2026-10-14", amount_due: 1000, amount_paid: 400 },
      { id: "p2", enrollment_id: "e1", payment_month: 2, due_date: "2026-12-14", amount_due: 1000, amount_paid: 0 },
      { id: "p3", enrollment_id: "e2", payment_month: 1, due_date: "2026-10-14", amount_due: 1000, amount_paid: 1000 },
    ],
  };
  const first = chitMemberSummary(fixed, details, details.enrollments[0], "2026-11-14");
  assert.equal(first.lift, null);
  assert.equal(first.outstanding, 600);
  assert.equal(first.scheduledBalance, 1600);
  const second = chitMemberSummary(fixed, details, details.enrollments[1], "2026-11-14");
  assert.deepEqual(second.lift, { month: 1, amount: 1900, date: "2026-10-14" });
  assert.equal(second.outstanding, 0);

  const auctionSummary = chitMemberSummary(auction, {
    cycles: [{ id: "c1", cycle_number: 1, cycle_date: "2026-10-14", winning_bid_amount: 1800 }],
    bids: [{ enrollment_id: "e1", cycle_id: "c1", status: "winner", bid_amount: 1800 }],
    installments: [],
  }, { id: "e1" }, "2026-11-14");
  assert.equal(auctionSummary.lift.month, 1);
  assert.equal(auctionSummary.lift.amount, 1800);
});

test("status text is sentence case without changing the status", () => {
  assert.equal(chitStatusText("overdue"), "Overdue");
  assert.equal(chitStatusText("partially paid"), "Partially paid");
  assert.equal(chitStatusText(""), "—");
});

test("all three scheme pages use the shared frame, overview, members, payments and reports", () => {
  for (const file of [
    "src/features/chitFund/auction/AuctionChitSchemeDetails.jsx",
    "src/features/chitFund/fixed/FixedChitSchemeDetails.jsx",
    "src/features/chitFund/predefined/PredefinedBidSchemeDetails.jsx",
  ]) {
    const source = read(file);
    for (const part of ["<ChitSchemeShell", "<ChitSchemeOverview", "<ChitSchemeMembersTable", "<ChitSchemePaymentsTable", "<ChitSchemeReports", "liftAction={liftAction}", "Lift Chit — Month"]) {
      assert.match(source, new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file}: ${part}`);
    }
    // Dialogs and pages stay owner-only.
    assert.match(source, /canWrite && memberOpen/, file);
  }
});

test("every chit data-entry dialog has Cancel next to its primary action and never uses browser prompts", () => {
  for (const file of [
    "src/features/chitFund/auction/AuctionModals.jsx",
    "src/features/chitFund/fixed/FixedChitModals.jsx",
    "src/features/chitFund/predefined/PredefinedChitModals.jsx",
    "src/features/chitFund/components/ChitMemberManagement.jsx",
    "src/features/chitFund/components/ChitSchemeForms.jsx",
    "src/features/chitFund/components/ChitPaymentForm.jsx",
  ]) {
    const source = read(file);
    assert.match(source, />Cancel<\/Button>/, file);
    assert.doesNotMatch(source, /window\.(prompt|confirm|alert)\(|[^.\w]prompt\(/, file);
  }
  const form = read("src/features/chitFund/components/ChitPaymentForm.jsx");
  for (const label of ["Scheme", "Due date", "Recorded by", "Previously paid", "Outstanding"]) assert.match(form, new RegExp(`<dt>${label}</dt>`), label);
  assert.match(form, /chit-split-total/);
});

test("scheme forms share one structure: Scheme details, the type's terms, then Charges", () => {
  const forms = read("src/features/chitFund/components/ChitSchemeForms.jsx");
  for (const name of ["ChitSchemeForm", "FixedChitSchemeForm", "PredefinedBidSchemeForm"]) {
    const start = forms.indexOf(`export function ${name}(`);
    const end = forms.indexOf("export function", start + 10);
    const body = forms.slice(start, end > 0 ? end : undefined);
    const details = body.indexOf("<SchemeDetailsFields");
    const charges = body.indexOf("<ChargesFields");
    assert.ok(details > 0 && charges > details, name);
    assert.match(body, /<FormSection title=/, name);
    assert.match(body, /<FormFooter/, name);
  }
});
