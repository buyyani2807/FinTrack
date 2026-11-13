import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql142 = readFileSync(new URL("../supabase/142_cashier_counter_only_and_owner_only_staff.sql", import.meta.url), "utf8");
const sql143 = readFileSync(new URL("../supabase/143_fix_cashier_counter_sales_type.sql", import.meta.url), "utf8");
const sql = sql142;
const fn = name => {
  const start = sql.indexOf(`function public.${name}(`);
  assert.ok(start > 0, `${name} is defined`);
  return sql.slice(start, sql.indexOf("$$;", start));
};

test("a cashier may only post Counter sales and returns (latest definition, 143)", () => {
  const start = sql143.indexOf("function public.acc_cashier_guard_voucher(");
  const body = sql143.slice(start, sql143.indexOf("$$;", start));
  assert.match(body, /source_type is distinct from 'pos_counter'/);
  // The voucher_type check constraint uses 'sales'; 'sale' would refuse every Counter sale.
  assert.match(body, /voucher_type not in \('sales', 'credit_note'\)/);
  assert.match(body, /cannot delete vouchers/);
  assert.match(sql, /create trigger acc_cashier_guard_voucher\s+before insert or update or delete on public\.acc_vouchers/);
});

test("voucher lines, GST, item lines and stock need a Counter voucher for a cashier", () => {
  assert.match(fn("acc_cashier_guard_voucher_child"), /v\.source_type = 'pos_counter'/);
  for (const table of ["acc_voucher_lines", "acc_voucher_item_lines", "acc_gst_lines", "acc_stock_movements"]) {
    assert.ok(sql.includes(`'${table}'`), table);
  }
});

test("a cashier cannot write parties, items, chart, settings or payroll", () => {
  const blockList = sql.slice(sql.indexOf("1c."), sql.indexOf("1d."));
  for (const table of ["acc_coa", "acc_parties", "acc_items", "acc_settings", "acc_payroll_runs", "acc_companies", "acc_price_lists"]) {
    assert.ok(blockList.includes(`'${table}'`), table);
  }
  for (const counterTable of ["acc_vouchers", "acc_sequences", "acc_audit_log", "acc_counter_day_closes"]) {
    assert.ok(!blockList.includes(`'${counterTable}'`), `${counterTable} stays writable for Counter posting`);
  }
});

test("a cashier cannot read audit log, payroll or bank statements", () => {
  const readList = sql.slice(sql.indexOf("1d."), sql.indexOf("-- 2."));
  for (const table of ["acc_audit_log", "acc_payroll_runs", "acc_payroll_profiles", "acc_bank_statements"]) {
    assert.ok(readList.includes(`'${table}'`), table);
  }
  assert.match(readList, /as restrictive for select to authenticated\s+using \(not public\.acc_is_cashier\(\)\)/);
});

test("staff profiles are visible only to the owner and to the person themself", () => {
  assert.match(sql, /create policy profiles_owner_or_self_read on public\.profiles\s+as restrictive for select to authenticated\s+using \(id = auth\.uid\(\) or public\.is_financier_owner\(\)\)/);
});

test("the cashier check is false, not NULL, for users without an Accounts role", () => {
  assert.match(fn("acc_is_cashier"), /coalesce\(public\.accounts_access_role\(\) = 'cashier', false\)/);
});

test("cashier allow-list uses voucher types that exist in the acc_vouchers check constraint", () => {
  const constraint = readFileSync(new URL("../supabase/052_fintrack_accounts_double_entry.sql", import.meta.url), "utf8");
  const allowed = constraint.match(/voucher_type in \(([^)]*)\)/)[1];
  const start = sql143.indexOf("voucher_type not in (");
  const used = sql143.slice(start, sql143.indexOf(")", start)).match(/'([a-z_]+)'/g);
  for (const type of used) assert.ok(allowed.includes(type), `${type} is a real voucher type`);
});
