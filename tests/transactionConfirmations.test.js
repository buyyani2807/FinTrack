import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WHATSAPP_TEMPLATES, applyTemplate, resolveWhatsAppTemplate } from "../src/features/receipts/templateEngine.js";
import {
  buildAuctionLiftPayload,
  buildChitLiftVariables,
  buildDailyAccountOpenedVariables,
  buildFixedLiftPayload,
  buildMonthlyAccountOpenedVariables,
  CONFIRMATION_EVENTS,
  confirmationSettingsFromReminder,
  eventTypeForFinanceLoan,
  isConfirmationEnabled,
} from "../src/features/receipts/transactionConfirmations.js";

test("confirmation templates exist in defaults", () => {
  assert.match(DEFAULT_WHATSAPP_TEMPLATES.daily_account_opened, /Daily Finance/);
  assert.match(DEFAULT_WHATSAPP_TEMPLATES.monthly_account_opened, /Monthly Finance/);
  assert.match(DEFAULT_WHATSAPP_TEMPLATES.chit_lift_confirmation, /lifted/);
});

test("daily account confirmation uses stored amounts and 100-day schedule", () => {
  const vars = buildDailyAccountOpenedVariables({
    id: "acc-1",
    customerName: "Ravi",
    collectionAmount: 10000,
    disbursedAmount: 8500,
    dailyCollection: 100,
    startDate: "2026-09-08",
  }, { companyName: "Srihitha" });
  assert.equal(vars.customer_name, "Ravi");
  assert.equal(vars.account_number, "acc-1");
  assert.equal(vars.financed_amount, "₹10,000");
  assert.equal(vars.amount_paid, "₹8,500");
  assert.equal(vars.interest_amount, "₹1,500");
  assert.equal(vars.daily_installment, "₹100");
  assert.equal(vars.repayment_days, "100");
  assert.equal(vars.company_name, "Srihitha");
  const message = applyTemplate(resolveWhatsAppTemplate({}, "daily_account_opened"), vars);
  assert.match(message, /Ravi/);
  assert.match(message, /₹10,000/);
});

test("monthly account confirmation uses principal and first-month interest helper", () => {
  const vars = buildMonthlyAccountOpenedVariables({
    id: "acc-2",
    customerName: "Anita",
    principal: 100000,
    annualRate: 3,
    startDate: "2026-09-08",
  });
  assert.equal(vars.financed_amount, "₹1,00,000");
  assert.equal(vars.interest_rate, "3% per month");
  assert.equal(vars.monthly_installment, "₹3,000");
  assert.equal(vars.first_payment_date.includes("2026"), true);
  assert.equal(eventTypeForFinanceLoan({ kind: "monthly" }), CONFIRMATION_EVENTS.monthly);
  assert.equal(eventTypeForFinanceLoan({ kind: "daily" }), CONFIRMATION_EVENTS.daily);
});

test("confirmation settings default on and can be disabled", () => {
  assert.equal(isConfirmationEnabled({ reminderSettings: {} }, CONFIRMATION_EVENTS.daily), true);
  assert.equal(isConfirmationEnabled({
    reminderSettings: { confirmations: { daily_account: false } },
  }, CONFIRMATION_EVENTS.daily), false);
  assert.deepEqual(confirmationSettingsFromReminder({}), {
    daily_account: true,
    monthly_account: true,
    chit_lift: true,
  });
});

test("fixed lift payload uses schedule lift amount and post-lift installment", () => {
  const payload = buildFixedLiftPayload({
    scheme: { name: "Gold Fixed", chit_value: 100000, duration_months: 20, installment_amount: 5000, fixed_monthly_increment: 500 },
    lift: { month_number: 5, lift_amount: 97000 },
    enrollment: { chit_members: { full_name: "Kumar", phone: "9876543210" } },
    liftDate: "2026-09-08",
    managerCommission: 5000,
  });
  const vars = buildChitLiftVariables(payload, { companyName: "FinTrack Co" });
  assert.equal(vars.member_name, "Kumar");
  assert.equal(vars.amount_lifted, "₹97,000");
  assert.equal(vars.commission, "₹5,000");
  assert.equal(vars.monthly_installment, "₹5,500");
  assert.equal(vars.remaining_months, "15");
});

test("auction lift payload maps winner payout fields", () => {
  const payload = buildAuctionLiftPayload({
    scheme: { name: "Auction A", chit_value: 100000, duration_months: 20, installment_amount: 5000 },
    enrollment: { chit_members: { full_name: "Sita", phone: "9123456789" } },
    cycleNumber: 3,
    cycleDate: "2026-09-08",
    winningBidAmount: 92000,
    commission: 5000,
    discount: 8000,
    dividend: 150,
  });
  const vars = buildChitLiftVariables(payload);
  assert.equal(vars.chit_type, "Auction");
  assert.equal(vars.amount_lifted, "₹92,000");
  assert.equal(vars.discount, "₹8,000");
  assert.equal(vars.dividend, "₹150");
  assert.equal(vars.month_number, "3");
});
