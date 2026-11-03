import test from "node:test";
import assert from "node:assert/strict";
import {
  counterDayReport,
  counterDayReportAll,
  counterModeFromTender,
  counterTenderFromVoucher,
} from "../src/features/accounts/model/counterDayReport.js";

const accounts = [
  { id: "cash", code: "1000", name: "Cash", accountType: "cash", groupType: "asset" },
  { id: "upi", code: "1010", name: "UPI", accountType: "upi", groupType: "asset" },
  { id: "bank", code: "1020", name: "Bank", accountType: "bank", groupType: "asset" },
  { id: "sales", code: "4100", name: "Sales", accountType: "income", groupType: "income" },
  { id: "ar", code: "1100", name: "AR", accountType: "receivable", groupType: "asset" },
];

const bill = ({ id, n, date, narration, lines, sourceType = "pos_counter", postedAt }) => ({
  id,
  voucherNumber: `SALE-${String(n).padStart(6, "0")}`,
  date,
  narration,
  sourceType,
  status: "posted",
  postedAt,
  createdAt: postedAt,
  lines,
});

test("counter tender reads cash, upi, and card (bank) from sale lines", () => {
  const voucher = bill({
    id: "v1",
    n: 1,
    date: "2026-11-03",
    narration: "Counter sale · Till 1 · Cash + UPI",
    postedAt: "2026-11-03T04:30:00.000Z",
    lines: [
      { coaId: "cash", debit: 200, credit: 0 },
      { coaId: "upi", debit: 300, credit: 0 },
      { coaId: "sales", debit: 0, credit: 500 },
    ],
  });
  assert.deepEqual(counterTenderFromVoucher(accounts, voucher), {
    cash: 200,
    upi: 300,
    card: 0,
    total: 500,
  });
  assert.deepEqual(counterModeFromTender({ cash: 200, upi: 300, card: 0 }), {
    id: "cash_upi",
    label: "Cash + UPI",
  });
});

test("day report totals Counter sales and tender split for one till", () => {
  const vouchers = [
    bill({
      id: "c1",
      n: 1,
      date: "2026-11-03",
      narration: "Counter sale · Till 1 · Cash",
      postedAt: "2026-11-03T03:00:00.000Z",
      lines: [
        { coaId: "cash", debit: 100, credit: 0 },
        { coaId: "sales", debit: 0, credit: 100 },
      ],
    }),
    bill({
      id: "c2",
      n: 2,
      date: "2026-11-03",
      narration: "Counter sale · Till 1 · Card",
      postedAt: "2026-11-03T04:00:00.000Z",
      lines: [
        { coaId: "bank", debit: 250, credit: 0 },
        { coaId: "sales", debit: 0, credit: 250 },
      ],
    }),
    bill({
      id: "c3",
      n: 3,
      date: "2026-11-03",
      narration: "Counter sale · Till 2 · UPI",
      postedAt: "2026-11-03T05:00:00.000Z",
      lines: [
        { coaId: "upi", debit: 80, credit: 0 },
        { coaId: "sales", debit: 0, credit: 80 },
      ],
    }),
    bill({
      id: "a1",
      n: 9,
      date: "2026-11-03",
      narration: "Credit sale",
      sourceType: null,
      postedAt: "2026-11-03T06:00:00.000Z",
      lines: [
        { coaId: "ar", debit: 999, credit: 0 },
        { coaId: "sales", debit: 0, credit: 999 },
      ],
    }),
  ];

  const report = counterDayReport(accounts, vouchers, { date: "2026-11-03", tillLabel: "Till 1" });
  assert.equal(report.billCount, 2);
  assert.equal(report.sales, 350);
  assert.equal(report.tender.cash, 100);
  assert.equal(report.tender.upi, 0);
  assert.equal(report.tender.card, 250);
  assert.equal(report.bills[0].reference, "SALE-000002");
  assert.equal(report.bills[0].modeLabel, "Card");
  assert.equal(report.bills[1].modeLabel, "Cash");
});

test("Accounts credit sales never appear on the Counter day report", () => {
  const report = counterDayReport(accounts, [
    bill({
      id: "credit",
      n: 4,
      date: "2026-11-03",
      narration: "Credit sale to Ravi",
      sourceType: null,
      lines: [
        { coaId: "ar", debit: 400, credit: 0 },
        { coaId: "sales", debit: 0, credit: 400 },
      ],
    }),
  ], { date: "2026-11-03", tillLabel: "Till 1" });
  assert.equal(report.billCount, 0);
  assert.equal(report.sales, 0);
});

test("all-tills day report totals every Counter till and breaks down per till", () => {
  const vouchers = [
    bill({
      id: "c1",
      n: 1,
      date: "2026-11-03",
      narration: "Counter sale · Till 1 · Cash",
      postedAt: "2026-11-03T03:00:00.000Z",
      lines: [
        { coaId: "cash", debit: 100, credit: 0 },
        { coaId: "sales", debit: 0, credit: 100 },
      ],
    }),
    bill({
      id: "c2",
      n: 2,
      date: "2026-11-03",
      narration: "Counter sale · Till 2 · UPI",
      postedAt: "2026-11-03T05:00:00.000Z",
      lines: [
        { coaId: "upi", debit: 80, credit: 0 },
        { coaId: "sales", debit: 0, credit: 80 },
      ],
    }),
    bill({
      id: "a1",
      n: 9,
      date: "2026-11-03",
      narration: "Credit sale",
      sourceType: null,
      lines: [
        { coaId: "ar", debit: 999, credit: 0 },
        { coaId: "sales", debit: 0, credit: 999 },
      ],
    }),
  ];
  const report = counterDayReportAll(accounts, vouchers, {
    date: "2026-11-03",
    tills: [
      { id: "till-1", label: "Till 1" },
      { id: "till-2", label: "Till 2" },
    ],
  });
  assert.equal(report.scope, "all");
  assert.equal(report.billCount, 2);
  assert.equal(report.sales, 180);
  assert.equal(report.tender.cash, 100);
  assert.equal(report.tender.upi, 80);
  assert.equal(report.byTill.length, 2);
  assert.equal(report.byTill.find(row => row.tillLabel === "Till 1").sales, 100);
  assert.equal(report.byTill.find(row => row.tillLabel === "Till 2").sales, 80);
});
