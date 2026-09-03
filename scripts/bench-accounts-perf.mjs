import { performance } from "node:perf_hooks";
import { assembleVouchers } from "../src/features/accounts/accountsVoucherAssembly.js";
import { dashboardMetrics, trialBalance, profitAndLoss, balanceSheet, dayBook } from "../src/features/accounts/accountingReports.js";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../src/features/accounts/accountingModel.js";

const accounts = DEFAULT_CHART_OF_ACCOUNTS.map(row => ({ ...row, id: row.code }));
const voucherCount = 2000;
const linesPerVoucher = 4;

const rawVouchers = Array.from({ length: voucherCount }, (_, index) => ({
  id: `v-${index}`,
  voucher_type: index % 2 ? "receipt" : "payment",
  voucher_number: `V-${index + 1}`,
  voucher_date: `2026-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
  narration: `Bench voucher ${index}`,
  status: "posted",
  party_id: null,
  source_module: null,
  source_type: null,
  source_transaction_id: null,
  cancel_reason: null,
  due_date: null,
  created_at: null,
  posted_at: null,
}));

const rawLines = rawVouchers.flatMap(voucher => Array.from({ length: linesPerVoucher }, (_, lineIndex) => ({
  id: `${voucher.id}-l-${lineIndex}`,
  voucher_id: voucher.id,
  line_no: lineIndex + 1,
  coa_id: lineIndex % 2 ? "1000" : "1100",
  party_id: null,
  debit: lineIndex % 2 ? 100 : 0,
  credit: lineIndex % 2 ? 0 : 100,
  description: "",
  acc_coa: { code: lineIndex % 2 ? "1000" : "1100", name: lineIndex % 2 ? "Cash" : "Receivable" },
})));

const bench = (label, fn) => {
  const start = performance.now();
  const result = fn();
  const ms = performance.now() - start;
  console.log(`${label}: ${ms.toFixed(2)} ms`);
  return result;
};

const joined = bench("assembleVouchers (2000 vouchers, 8000 lines)", () => assembleVouchers(rawVouchers, rawLines, []));
const range = { from: "2026-04-01", to: "2026-06-30" };

bench("dashboardMetrics (old-style full scan)", () => dashboardMetrics(accounts, joined, [], { today: "2026-04-15", ...range }));
bench("trialBalance", () => trialBalance(accounts, joined, range));
bench("profitAndLoss", () => profitAndLoss(accounts, joined, range));
bench("balanceSheet", () => balanceSheet(accounts, joined, range));
bench("dayBook", () => dayBook(joined, range));

console.log(`Dataset: ${joined.length} vouchers, ${rawLines.length} lines`);
