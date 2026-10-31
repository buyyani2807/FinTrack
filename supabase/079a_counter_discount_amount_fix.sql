-- Hotfix for Counter / itemized sales when acc_apply_voucher_item_lines expects
-- discount_amount but the column was never added (079 partially missing).
-- Safe to re-run. Prefer the full 079_accounts_inventory_returns_discounts.sql when possible.

alter table public.acc_voucher_item_lines
  add column if not exists discount_amount numeric(18,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'acc_voucher_item_lines_discount_check'
  ) then
    alter table public.acc_voucher_item_lines
      add constraint acc_voucher_item_lines_discount_check
      check (discount_amount >= 0 and discount_amount <= amount);
  end if;
end $$;

notify pgrst, 'reload schema';
