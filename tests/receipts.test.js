import test from "node:test";
import assert from "node:assert/strict";
import { hasWhatsAppPhone, normalizeWhatsAppPhone } from "../src/features/receipts/phoneNormalize.js";
import { applyTemplate, DEFAULT_WHATSAPP_TEMPLATES, resolveWhatsAppTemplate } from "../src/features/receipts/templateEngine.js";
import { buildChitUpcomingRows, flattenSchemePaymentsForReminders } from "../src/features/receipts/upcomingPayments.js";
import { buildWhatsAppMessage } from "../src/features/receipts/receiptWhatsApp.js";

test("normalizes 10-digit Indian numbers", () => {
  assert.equal(normalizeWhatsAppPhone("9876543210"), "919876543210");
});

test("normalizes +91 prefixed numbers", () => {
  assert.equal(normalizeWhatsAppPhone("+91 98765 43210"), "919876543210");
});

test("rejects empty numbers", () => {
  assert.equal(hasWhatsAppPhone(""), false);
});

test("replaces receipt variables", () => {
  const message = applyTemplate(DEFAULT_WHATSAPP_TEMPLATES.payment_receipt, {
    customer_name: "Ravi",
    amount: "₹5,000",
    receipt_number: "FT-2026-000125",
    account_id: "DF-1025",
    payment_date: "28-Aug-2026",
    payment_mode: "UPI",
    remaining_balance: "₹40,000",
    company_name: "Sri Lakshmi Finance",
  });
  assert.match(message, /Ravi/);
  assert.match(message, /FT-2026-000125/);
  assert.doesNotMatch(message, /\{customer_name\}/);
});

test("payment WhatsApp uses the saved short template", () => {
  const message = buildWhatsAppMessage({
    customerName: "Vivek",
    amount: 100,
    receiptNumber: "FT-2026-000003",
    accountId: "FT-C91BAD5F",
    paymentDate: "2026-08-29",
    paymentMode: "Cash",
    remainingBalance: 9100,
    companyName: "Sudheer Finance",
    money: n => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
  }, {
    whatsappTemplates: {
      payment_receipt: "Hi {customer_name}, received {amount}. Receipt {receipt_number}.",
    },
  });
  assert.match(message, /Hi Vivek, received ₹100/);
  assert.doesNotMatch(message, /PAYMENT RECEIPT/);
});

test("chit reminder template includes scheme and chit type without days remaining", () => {
  const message = applyTemplate(DEFAULT_WHATSAPP_TEMPLATES.chit_reminder, {
    customer_name: "shashi",
    amount: "₹99,000",
    due_date: "25 Aug 2026",
    chit_type: "Auction",
    scheme_name: "10 Lakhs",
    month_number: "1",
    total_months: "10",
    company_name: "Sudheer Finance",
    company_phone: "9160710101",
  });
  assert.match(message, /Chit Scheme: 10 Lakhs/);
  assert.match(message, /Chit Type: Auction/);
  assert.match(message, /Month: 1 of 10/);
  assert.doesNotMatch(message, /Days remaining/i);
});

test("resolveWhatsAppTemplate upgrades old chit reminders that still show days remaining", () => {
  const template = resolveWhatsAppTemplate({
    whatsappTemplates: {
      chit_reminder: `Hi {customer_name},
Chit Scheme: {scheme_name}
Days remaining: {days_remaining}`,
    },
  }, "chit_reminder");
  assert.match(template, /Chit Type: \{chit_type\}/);
  assert.match(template, /Chit Scheme: \{scheme_name\}/);
  assert.doesNotMatch(template, /Days remaining/i);
});

test("buildChitUpcomingRows includes chit type label", () => {
  const items = buildChitUpcomingRows([{
    id: "pay-1",
    enrollment_id: "en-1",
    due_date: "2026-09-05",
    amount_due: 5000,
    amount_paid: 0,
    payment_month: 3,
    status: "pending",
    chit_enrollments: {
      chit_members: { full_name: "Ravi", phone: "9876543210" },
      chit_schemes: { name: "50L Predefined", duration_months: 25, chit_type: "fixed_predefined_bid" },
    },
  }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].chitTypeLabel, "Fixed Predefined Bid");
  assert.equal(items[0].schemeName, "50L Predefined");
});

test("buildChitUpcomingRows infers chit type from payment kind when scheme is missing", () => {
  const items = buildChitUpcomingRows([
    {
      id: "fixed-1",
      enrollment_id: "en-1",
      due_date: "2026-09-05",
      amount_due: 5000,
      amount_paid: 0,
      payment_month: 2,
      paymentKind: "fixed",
      chit_enrollments: { chit_members: { full_name: "Ravi", phone: "9876543210" } },
    },
    {
      id: "auction-1",
      enrollment_id: "en-2",
      due_date: "2026-09-01",
      net_amount_due: 4000,
      amount_paid: 0,
      paymentKind: "auction",
      chit_enrollments: { chit_members: { full_name: "Kiran", phone: "9123456780" } },
    },
  ], "2026-08-29");
  assert.equal(items.length, 2);
  assert.equal(items.find(item => item.sourceId === "fixed-1")?.chitTypeLabel, "Fixed");
  assert.equal(items.find(item => item.sourceId === "auction-1")?.chitTypeLabel, "Auction");
});

test("flattenSchemePaymentsForReminders synthesizes fixed chit dues for the current month", () => {
  const rows = flattenSchemePaymentsForReminders({
    id: "scheme-fixed",
    name: "2 Lakh Fixed",
    chit_type: "fixed",
    status: "active",
    start_date: "2026-01-01",
    duration_months: 20,
    installment_amount: 10000,
  }, {
    enrollments: [{
      id: "en-1",
      status: "active",
      chit_members: { full_name: "Ravi", phone: "9876543210" },
    }],
    fixedPayments: [],
    fixedLifts: [],
  }, "2026-08-29");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].paymentKind, "fixed");
  assert.equal(rows[0].chit_enrollments.chit_schemes.chit_type, "fixed");
  assert.equal(rows[0].amount_due, 10000);
  const items = buildChitUpcomingRows(rows, "2026-08-29");
  assert.equal(items[0].chitTypeLabel, "Fixed");
  assert.equal(items[0].schemeName, "2 Lakh Fixed");
});

test("flattenSchemePaymentsForReminders includes predefined chit payment rows", () => {
  const rows = flattenSchemePaymentsForReminders({
    id: "scheme-pre",
    name: "50L Predefined",
    chit_type: "fixed_predefined_bid",
    status: "active",
    start_date: "2026-01-01",
    duration_months: 25,
  }, {
    enrollments: [{
      id: "en-2",
      status: "active",
      chit_members: { full_name: "Mallaiah", phone: "9123456780" },
    }],
    predefinedSchedule: [{ month_number: 8, emi: 166000 }],
    predefinedPayments: [{
      id: "pay-pre-1",
      enrollment_id: "en-2",
      payment_month: 8,
      due_date: "2026-08-01",
      amount_due: 166000,
      amount_paid: 0,
      status: "due",
    }],
  }, "2026-08-29");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].paymentKind, "fixed_predefined_bid");
  assert.equal(buildChitUpcomingRows(rows, "2026-08-29")[0].chitTypeLabel, "Fixed Predefined Bid");
});

test("buildChitUpcomingRows includes overdue predefined bid members from 50L scheme", () => {
  const scheme = {
    id: "scheme-50l",
    name: "50Lakhs",
    chit_type: "fixed_predefined_bid",
    status: "active",
    start_date: "2026-08-01",
    duration_months: 25,
  };
  const members = ["Aarush", "kiran", "manish", "mohan"];
  const enrollments = members.map((name, index) => ({
    id: `en-${index}`,
    status: "active",
    chit_members: { full_name: name, phone: `987654321${index}` },
  }));
  const predefinedPayments = members.map((name, index) => ({
    id: `pay-${index}`,
    enrollment_id: `en-${index}`,
    payment_month: 1,
    due_date: "2026-08-26",
    amount_due: 152000,
    amount_paid: 0,
    status: "overdue",
  }));
  const rows = flattenSchemePaymentsForReminders(scheme, { enrollments, predefinedPayments, predefinedSchedule: [{ month_number: 1, emi: 152000 }] }, "2026-08-29");
  const items = buildChitUpcomingRows(rows, "2026-08-29");
  assert.equal(items.length, 4);
  assert.ok(items.every(item => item.chitTypeLabel === "Fixed Predefined Bid"));
  assert.ok(items.every(item => item.schemeName === "50Lakhs"));
  assert.ok(items.every(item => item.amount === 152000));
});
