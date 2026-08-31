import test from "node:test";
import assert from "node:assert/strict";
import { buildChitMonthStatement, currentSchemeMonth, monthLabel } from "../src/features/chitFund/monthStatement.js";
import { renderChitMonthStatementPdf } from "../src/features/chitFund/monthStatementPdf.js";

const member = (id, name, ticket) => ({ id, ticket_number: ticket, chit_members: { full_name: name } });

const sampleAuction = () => {
  const enrollments = [
    member("e1", "Sudheer", 1),
    member("e2", "Satish", 2),
    member("e3", "Kishore", 3),
    member("e4", "Swathi", 4),
    member("e5", "Amogha", 5),
    member("e6", "Aarush", 6),
    member("e7", "Shankar", 7),
    member("e8", "Purna", 8),
    member("e9", "Manish", 9),
    member("e10", "Nishant", 10),
  ];
  const cycle = { id: "c1", cycle_number: 1, winning_enrollment_id: "e2", commission_amount: 40000 };
  return {
    scheme: {
      name: "₹10L · 10M",
      chit_type: "auction",
      start_date: "2026-09-01",
      duration_months: 10,
      chit_value: 1000000,
      installment_amount: 100000,
    },
    details: {
      enrollments,
      cycles: [cycle],
      installments: enrollments.map((item, index) => ({
        enrollment_id: item.id,
        cycle_id: "c1",
        net_amount_due: 100000,
        amount_paid: index < 2 ? 100000 : 0,
        payment_mode: index === 0 ? "cash" : index === 1 ? "upi" : null,
        collectorName: index === 0 ? "Vaishu" : index === 1 ? "Vamsee" : "",
      })),
    },
  };
};

test("builds an auction month statement matching the sample totals", () => {
  const { scheme, details } = sampleAuction();
  const statement = buildChitMonthStatement({ scheme, details, monthNumber: 1, generatedAt: new Date("2026-08-27T06:01:51+05:30") });
  assert.equal(statement.title, "MONTH STATEMENT");
  assert.equal(statement.schemeName, "₹10L · 10M");
  assert.equal(statement.monthLabel, "Sep 26");
  assert.equal(statement.expected, 1000000);
  assert.equal(statement.collected, 200000);
  assert.equal(statement.pending, 800000);
  assert.equal(statement.progress, 20);
  assert.deepEqual(statement.prize, {
    winner: "Satish",
    prize: 1000000,
    commission: 40000,
    netPayout: 960000,
    status: "Complete",
  });
  assert.equal(statement.collections.length, 10);
  assert.equal(statement.collections[0].status, "Paid");
  assert.equal(statement.collections[0].paymentMode, "Cash");
  assert.equal(statement.collections[0].collectedBy, "Vaishu");
  assert.equal(statement.collections[1].paymentMode, "UPI");
  assert.equal(statement.collections[1].collectedBy, "Vamsee");
  assert.equal(statement.collections[2].status, "Pending");
  assert.equal(statement.collections[2].paymentMode, "—");
  assert.equal(statement.collections[2].collectedBy, "—");
  assert.equal(statement.outstanding.length, 8);
  assert.equal(statement.outstanding[0].name, "Kishore");
  assert.equal(statement.outstanding[0].thisMonth, 100000);
  assert.equal(statement.outstanding[0].older, 0);
  assert.equal(statement.outstandingTotal, 800000);
});

test("includes older unpaid dues separately from the selected month", () => {
  const statement = buildChitMonthStatement({
    scheme: { name: "Auction", chit_type: "auction", start_date: "2026-01-01", installment_amount: 1000, chit_value: 10000 },
    details: {
      enrollments: [member("e1", "Rohit", 1)],
      cycles: [{ id: "c1", cycle_number: 1 }, { id: "c2", cycle_number: 2 }],
      installments: [
        { enrollment_id: "e1", cycle_id: "c1", net_amount_due: 1000, amount_paid: 200 },
        { enrollment_id: "e1", cycle_id: "c2", net_amount_due: 1000, amount_paid: 400 },
      ],
    },
    monthNumber: 2,
  });
  assert.equal(statement.outstanding[0].thisMonth, 600);
  assert.equal(statement.outstanding[0].older, 800);
  assert.equal(statement.outstanding[0].totalOwed, 1400);
});

test("uses fixed-chit payment rows and lift prize", () => {
  const statement = buildChitMonthStatement({
    scheme: { name: "Fixed", chit_type: "fixed", start_date: "2026-01-01", installment_amount: 5000 },
    details: {
      enrollments: [member("e1", "Anita", 1), member("e2", "Vikram", 2)],
      fixedLifts: [{ month_number: 1, status: "completed", enrollment_id: "e1", lift_amount: 50000, manager_commission: 2000, amount_paid_to_member: 48000 }],
      fixedPayments: [
        { enrollment_id: "e1", payment_month: 1, amount_due: 5000, amount_paid: 5000, payment_mode: "cash_upi", cash_amount: 2000, upi_amount: 3000, collectorName: "Admin" },
        { enrollment_id: "e2", payment_month: 1, amount_due: 5000, amount_paid: 0 },
      ],
    },
    monthNumber: 1,
  });
  assert.equal(statement.expected, 10000);
  assert.equal(statement.collected, 5000);
  assert.equal(statement.prize.winner, "Anita");
  assert.equal(statement.prize.netPayout, 48000);
  assert.equal(statement.outstanding[0].name, "Vikram");
  assert.match(statement.collections[0].paymentMode, /Cash \+ UPI/);
  assert.equal(statement.collections[0].collectedBy, "Admin");
  assert.equal(statement.collections[1].paymentMode, "—");
  assert.equal(statement.collections[1].collectedBy, "—");
});

test("uses predefined EMI rows and completed month prize", () => {
  const statement = buildChitMonthStatement({
    scheme: { name: "Predefined", chit_type: "fixed_predefined_bid", start_date: "2026-03-01" },
    details: {
      enrollments: [member("e1", "Meera", 1)],
      predefinedSchedule: [{ month_number: 1, status: "completed", enrollment_id: "e1", bid_amount: 90000, manager_commission: 3000, net_receivable: 87000, emi: 9000 }],
      predefinedPayments: [{ enrollment_id: "e1", payment_month: 1, amount_due: 9000, amount_paid: 9000, payment_mode: "bank", collectorName: "Kishore" }],
    },
    monthNumber: 1,
  });
  assert.equal(statement.expected, 9000);
  assert.equal(statement.collected, 9000);
  assert.equal(statement.prize.winner, "Meera");
  assert.equal(statement.prize.prize, 90000);
  assert.equal(statement.outstanding.length, 0);
  assert.equal(statement.collections[0].paymentMode, "Bank transfer");
  assert.equal(statement.collections[0].collectedBy, "Kishore");
});

test("treats paid legacy chit rows without mode or collector as unknown", () => {
  const statement = buildChitMonthStatement({
    scheme: { name: "Auction", chit_type: "auction", start_date: "2026-01-01", installment_amount: 1000, chit_value: 10000 },
    details: {
      enrollments: [member("e1", "Rohit", 1)],
      cycles: [{ id: "c1", cycle_number: 1 }],
      installments: [{ enrollment_id: "e1", cycle_id: "c1", net_amount_due: 1000, amount_paid: 1000 }],
    },
    monthNumber: 1,
  });
  assert.equal(statement.collections[0].status, "Paid");
  assert.equal(statement.collections[0].paymentMode, "—");
  assert.equal(statement.collections[0].collectedBy, "—");
});

test("labels months from the scheme start date and clamps the current month", () => {
  assert.equal(monthLabel("2026-09-01", 1), "Sep 26");
  assert.equal(currentSchemeMonth({ start_date: "2026-01-01", duration_months: 10 }, new Date("2026-08-27T00:00:00+05:30")), 8);
  assert.equal(currentSchemeMonth({ start_date: "2026-01-01", duration_months: 3 }, new Date("2026-08-27T00:00:00+05:30")), 3);
});

test("renders a downloadable PDF with the sample statement sections", () => {
  const { scheme, details } = sampleAuction();
  const { pdf, statement } = renderChitMonthStatementPdf({
    scheme,
    details,
    monthNumber: 1,
    generatedAt: new Date("2026-08-27T06:01:51+05:30"),
  });
  assert.match(pdf, /^%PDF-1.4/);
  assert.match(pdf, /%%EOF/);
  assert.match(pdf, /MONTH STATEMENT/);
  assert.match(pdf, /AUCTION \/ PRIZE/);
  assert.match(pdf, /COLLECTIONS/);
  assert.match(pdf, /Collected by/);
  assert.match(pdf, /Vaishu/);
  assert.match(pdf, /OUTSTANDING DUES/);
  assert.match(pdf, /Satish/);
  assert.match(pdf, /Kishore/);
  assert.match(pdf, /Collection Progress  20% received/);
  assert.equal(statement.progress, 20);
});
