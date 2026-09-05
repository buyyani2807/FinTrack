import test from "node:test";
import assert from "node:assert/strict";
import { assembleVouchers } from "../src/features/accounts/accountsVoucherAssembly.js";
import { pageSlice, groupByKey } from "../src/features/accounts/accountsList.js";
import { dashboardMetrics, invoiceRegister, partyBalances } from "../src/features/accounts/accountingReports.js";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../src/features/accounts/accountingModel.js";

const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code }));

test("groupByKey and assembleVouchers join lines in linear time", () => {
  const vouchers = [{ id: "v1", voucher_type: "receipt", voucher_number: "R-1", voucher_date: "2026-04-01", narration: "A", status: "posted", party_id: null, source_module: null, source_type: null, source_transaction_id: null, cancel_reason: null, due_date: null, created_at: null, posted_at: null }];
  const lines = [
    { id: "l1", voucher_id: "v1", line_no: 1, coa_id: "1000", party_id: null, debit: 100, credit: 0, description: "", acc_coa: { code: "1000", name: "Cash" } },
    { id: "l2", voucher_id: "v1", line_no: 2, coa_id: "1100", party_id: null, debit: 0, credit: 100, description: "", acc_coa: { code: "1100", name: "Receivable" } },
  ];
  const joined = assembleVouchers(vouchers, lines, []);
  assert.equal(joined.length, 1);
  assert.equal(joined[0].lines.length, 2);
  assert.equal(groupByKey(lines, "voucher_id").get("v1").length, 2);
});

test("pageSlice paginates long lists", () => {
  const rows = Array.from({ length: 120 }, (_, index) => index + 1);
  const page2 = pageSlice(rows, 2, 50);
  assert.equal(page2.page, 2);
  assert.equal(page2.pages, 3);
  assert.equal(page2.total, 120);
  assert.equal(page2.items[0], 51);
  assert.equal(page2.items.length, 50);
});

test("dashboardMetrics stays accurate on synthetic books", () => {
  const vouchers = Array.from({ length: 200 }, (_, index) => ({
    id: `v-${index}`,
    voucherType: "receipt",
    voucherNumber: `R-${index + 1}`,
    date: "2026-04-01",
    narration: "Collection",
    status: "posted",
    lines: [
      { coaId: "1000", code: "1000", debit: 100, credit: 0 },
      { coaId: "1100", code: "1100", debit: 0, credit: 100 },
    ],
  }));
  const metrics = dashboardMetrics(accounts, vouchers, [], { today: "2026-04-01", from: "2026-04-01", to: "2026-04-30" });
  assert.equal(metrics.cash, 20000);
  assert.equal(metrics.todayReceipts, 20000);
  assert.equal(metrics.equationHolds, true);
});

test("invoice register and party balances stay accurate on 10k sales", () => {
  const ravi = { id: "ravi", name: "Ravi", partyType: "customer" };
  const vouchers = Array.from({ length: 10000 }, (_, index) => ({
    id: `s-${index}`,
    voucherType: "sales",
    voucherNumber: `SAL-${String(index + 1).padStart(6, "0")}`,
    date: "2026-04-01",
    status: "posted",
    partyId: "ravi",
    dueDate: "2026-04-08",
    lines: [
      { coaId: "1100", code: "1100", debit: 100, credit: 0, partyId: "ravi" },
      { coaId: "4300", code: "4300", debit: 0, credit: 100 },
    ],
  }));
  const started = Date.now();
  const invoices = invoiceRegister(accounts, vouchers, [ravi], {
    kind: "receivable",
    today: "2026-04-20",
    from: "2026-04-01",
    to: "2026-04-30",
  });
  const balances = partyBalances(accounts, vouchers, [ravi], { kind: "receivable", from: "2026-04-01", to: "2026-04-30" });
  const elapsed = Date.now() - started;
  assert.equal(invoices.length, 10000);
  assert.equal(invoices.reduce((sum, row) => sum + row.outstanding, 0), 1000000);
  assert.equal(balances.find(row => row.id === "ravi").balance, 1000000);
  assert.ok(elapsed < 15000, `10k soak took ${elapsed}ms`);
});

