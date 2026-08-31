-- FT-021. Run after 045_ft008_ft014_integrity.sql.
-- Same-day uniqueness was RPC-only; concurrent inserts could still create two payments.

do $$
declare dup_count integer;
begin
  select count(*) into dup_count from (
    select finance_account_id, paid_on
    from public.payments
    group by finance_account_id, paid_on
    having count(*) > 1
  ) duplicates;
  if dup_count > 0 then
    raise exception
      'Cannot add unique (finance_account_id, paid_on): % duplicate payment day(s) exist. Run 046a to list them, 046b to keep one row per day (same amounts only), then rerun this migration.',
      dup_count;
  end if;
end $$;

create unique index if not exists payments_account_paid_on_uidx
  on public.payments (finance_account_id, paid_on);
