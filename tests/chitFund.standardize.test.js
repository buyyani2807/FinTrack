import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CHIT_PAYMENT_MODES, CHIT_LIFT_LABELS, paymentReversalPrompt, paymentReversalReasonError, memberStanding, memberStandingAction, memberStandingError } from "../src/features/chitFund/model/chitLabels.js";
import { buildChitProfitAndLoss, financialYearBounds } from "../src/features/chitFund/model/chitProfitAndLoss.js";
import { calculateDividend } from "../src/features/chitFund/model/calculations.js";
import { fixedChitMonth } from "../src/features/chitFund/model/fixedChit.js";
import { cashUpiSplit } from "../src/features/finance/model/paymentSplit.js";

const read = path => fs.readFileSync(path, "utf8");

test("payment modes stay the modes the chit records already accept", () => {
  assert.deepEqual(CHIT_PAYMENT_MODES.map(item => item.id), ["cash", "upi", "bank", "cash_upi"]);
  assert.equal(CHIT_PAYMENT_MODES.some(item => item.id === "cheque"), false);
  assert.deepEqual(cashUpiSplit("bank", 5000, 10, 20), { cash: 0, upi: 0 });
  assert.deepEqual(cashUpiSplit("cash", 5000, 0, 0), { cash: 5000, upi: 0 });
  for (const file of [
    "src/features/chitFund/auction/AuctionModals.jsx",
    "src/features/chitFund/fixed/FixedChitModals.jsx",
    "src/features/chitFund/predefined/PredefinedChitModals.jsx",
  ]) {
    const source = read(file);
    assert.match(source, /label="Payment mode"/);
    assert.match(source, /value="bank">Bank/);
    assert.match(source, /value="cash">Cash/);
    assert.match(source, /value="upi">UPI/);
    assert.match(source, /value="cash_upi">Cash \+ UPI/);
  }
});

test("lift labels are the shared wording and legacy payout phrases are gone from the screens", () => {
  assert.equal(CHIT_LIFT_LABELS.amount, "Lift amount");
  assert.equal(CHIT_LIFT_LABELS.method, "Lift method");
  assert.equal(CHIT_LIFT_LABELS.record, "Lift Chit");
  const files = [
    "src/features/chitFund/auction/AuctionModals.jsx",
    "src/features/chitFund/auction/AuctionChitSchemeDetails.jsx",
    "src/features/chitFund/auction/ChitLiveBidding.jsx",
    "src/features/chitFund/fixed/FixedChitModals.jsx",
    "src/features/chitFund/fixed/FixedChitSchemeDetails.jsx",
    "src/features/chitFund/predefined/PredefinedChitModals.jsx",
    "src/features/chitFund/predefined/PredefinedBidSchemeDetails.jsx",
    "src/features/chitFund/ChitCustomerPortal.jsx",
    "src/features/chitFund/components/ChitSchemeDashboard.jsx",
    "src/features/statements/CustomerStatementPage.jsx",
  ];
  const combined = files.map(read).join("\n");
  const lower = combined.toLowerCase();
  for (const phrase of ["Prize payout mode", "Winner receives", "Assign Member", "Net receivable", "Bid winner", "Record monthly bid", "Finalize lift", "Record Lift"]) {
    assert.equal(lower.includes(phrase.toLowerCase()), false, phrase);
  }
  assert.match(combined, /Lift method/);
  assert.match(combined, /Lift amount/);
  assert.match(combined, /Lift Chit/);
  assert.match(read("src/features/chitFund/ChitFundPage.jsx"), /Profit &amp; Loss|ChitLandingReports/);
  assert.match(read("src/features/chitFund/components/ChitSchemeDashboard.jsx"), /Profit &amp; Loss/);
});

test("payment reversal asks for the recorded details and a reason", () => {
  const prompt = paymentReversalPrompt({
    memberName: "Raju",
    schemeName: "Morning Auction",
    amount: "₹8,000",
    paidDate: "09 Oct 2026",
    mode: "upi",
    reference: "UPI-14",
  });
  assert.equal(prompt.title, "Reverse this payment?");
  assert.deepEqual(prompt.lines.map(line => line[0]), ["Member", "Scheme", "Amount", "Payment date", "Payment mode", "Reference"]);
  assert.equal(prompt.lines[0][1], "Raju");
  assert.equal(prompt.lines[4][1], "UPI");
  assert.match(prompt.effect, /audit trail/);
  assert.match(prompt.effect, /Auction results, lift amounts, dividends, and commission/);
  assert.equal(paymentReversalReasonError("  "), "Enter a reason for this reversal.");
  assert.equal(paymentReversalReasonError("Recorded twice"), "");
  const controls = read("src/features/chitFund/components/ChitAdminControls.jsx");
  assert.match(controls, /if \(!allowed\) return null/);
  assert.match(controls, /paymentReversalReasonError/);
  const sql = read("supabase/095_chit_payment_reversal.sql");
  for (const needle of [
    "chit_is_owner()",
    "A reason is required to reverse this payment",
    "This payment is already reversed",
    "current_organization_id()",
    "payment_reversed",
    "acc_assert_period_open",
    "amount_paid = 0",
  ]) assert.match(sql, new RegExp(needle.replace(/[()]/g, "\\$&")));
  assert.equal(sql.includes("delete from public.chit_installments"), false);
  assert.equal(sql.includes("update public.chit_cycles"), false);
  assert.equal(sql.includes("update public.fixed_chit_lifts"), false);
});

test("chit profit and loss uses stored commission and does not invent expenses", () => {
  const schemes = [
    { id: "a", name: "Morning", chit_type: "auction", status: "active" },
    { id: "f", name: "Fixed One", chit_type: "fixed", status: "active" },
    { id: "p", name: "Predefined", chit_type: "fixed_predefined_bid", status: "closed" },
  ];
  const report = buildChitProfitAndLoss({
    schemes,
    cycles: [
      { id: "c1", scheme_id: "a", status: "settled", cycle_date: "2026-08-22", cycle_number: 2, commission_amount: 5000, distributable_amount: 3000, winning_enrollment_id: "m1" },
      { id: "c2", scheme_id: "a", status: "scheduled", cycle_date: "2026-09-22", cycle_number: 3, commission_amount: 5000 },
    ],
    fixedLifts: [
      { id: "l1", scheme_id: "f", status: "completed", lift_date: "2026-07-01", month_number: 1, manager_commission: 4000, enrollment_id: "m2" },
      { id: "l2", scheme_id: "f", status: "pending", lift_date: "2026-08-01", month_number: 2, manager_commission: 4000, enrollment_id: "m3" },
    ],
    predefinedSchedule: [
      { id: "s1", scheme_id: "p", status: "completed", assigned_date: "2026-06-01", month_number: 1, manager_commission: 2500, enrollment_id: "m4" },
    ],
    filters: { financialYear: 2026 },
  });
  assert.equal(financialYearBounds(2026).from, "2026-04-01");
  assert.equal(report.grossIncome.amount, 11500);
  assert.equal(report.income.commission, 11500);
  assert.equal(report.expenses.status, "unavailable");
  assert.equal(report.expenses.amount, null);
  assert.equal(report.net.status, "unavailable");
  assert.equal(report.net.amount, null);
  assert.equal(report.dividends.amount, 3000);
  assert.match(report.dividends.note, /not deducted again/);
  assert.equal(report.collections.status, "unavailable");
  assert.deepEqual(report.schemes.map(row => [row.name, row.commission]), [["Morning", 5000], ["Fixed One", 4000], ["Predefined", 2500]]);

  const fixedOnly = buildChitProfitAndLoss({
    schemes, cycles: [], fixedLifts: [
      { id: "l1", scheme_id: "f", status: "completed", lift_date: "2026-07-01", month_number: 1, manager_commission: 4000, enrollment_id: "m2" },
    ], predefinedSchedule: [],
    filters: { chitType: "fixed", schemeId: "f", from: "2026-07-01", to: "2026-07-31", month: 1, memberId: "m2" },
  });
  assert.equal(fixedOnly.grossIncome.amount, 4000);

  const missing = buildChitProfitAndLoss({
    schemes: [{ id: "a", name: "Morning", chit_type: "auction", status: "active" }],
    cycles: [{ id: "c1", scheme_id: "a", status: "settled", cycle_date: "2026-08-22", cycle_number: 2, commission_amount: null }],
    filters: { from: "2026-04-01", to: "2027-03-31" },
  });
  assert.equal(missing.grossIncome.status, "insufficient");
  assert.equal(missing.grossIncome.amount, null);
  assert.equal(missing.insufficient.length, 1);
});

test("auction dividend and fixed lift math are unchanged", () => {
  assert.deepEqual(calculateDividend({ chitValue: 100000, winningBidAmount: 80000, commissionPercent: 5, totalMembers: 20 }), {
    discount: 20000,
    commission: 5000,
    distributable: 15000,
    dividendPerMember: 750,
    retainedRemainder: 0,
  });
  assert.equal(fixedChitMonth({
    chitValue: 100000, memberCount: 20, durationMonths: 20, monthlyContribution: 5000,
    commissionAmount: 5000, initialLiftAmount: 95000, monthlyLiftIncrement: 1000, month: 2,
  }).liftAmount, 96000);
});

test("every chit type uses the shared member page with payment reversal and standing actions", () => {
  const page = read("src/features/chitFund/components/ChitMemberPage.jsx");
  assert.match(page, /ChitDeletePaymentButton/);
  assert.match(page, /allowed=\{isOwner\}/);
  assert.match(page, /Mark defaulter/);
  assert.match(page, /Mark bankrupt/);
  assert.match(page, /Mark regular/);
  assert.match(page, /account-actions-menu/);
  for (const file of [
    "src/features/chitFund/auction/AuctionChitSchemeDetails.jsx",
    "src/features/chitFund/fixed/FixedChitSchemeDetails.jsx",
    "src/features/chitFund/predefined/PredefinedBidSchemeDetails.jsx",
  ]) {
    const source = read(file);
    assert.match(source, /<ChitMemberPage/, file);
    assert.match(source, /deletePayment=\{/, file);
    assert.match(source, /recordPayment=\{/, file);
  }
  assert.match(read("src/features/chitFund/auction/AuctionChitSchemeDetails.jsx"), /recordPayment=\{openAuctionPayment\} deletePayment=\{remove\}/);
});

test("member standing needs a reason for defaulter or bankrupt and leaves enrollment status alone", () => {
  assert.equal(memberStanding({}), "regular");
  assert.equal(memberStanding({ member_standing: "Bankrupt" }), "bankrupt");
  assert.equal(memberStanding({ member_standing: "unknown" }), "regular");
  assert.equal(memberStandingError("defaulter", " "), "A reason is required.");
  assert.equal(memberStandingError("bankrupt", ""), "A reason is required.");
  assert.equal(memberStandingError("regular", ""), "");
  assert.equal(memberStandingError("closed", "x"), "Choose a valid standing.");
  assert.equal(memberStandingAction("bankrupt").title, "Mark member bankrupt");
  const sql = read("supabase/096_chit_member_standing.sql");
  assert.match(sql, /chit_is_owner\(\)/);
  assert.match(sql, /current_organization_id\(\)/);
  assert.match(sql, /reason is required/i);
  assert.match(sql, /chit_audit_log/);
  assert.match(sql, /'member_standing'/);
  assert.doesNotMatch(sql, /set\s+status\s*=/i);
});
