-- 143: Fix for 142. Counter sales are stored with voucher_type 'sales' (not 'sale'),
-- so 142 refused every Counter sale by a cashier. Returns ('credit_note') were fine.
-- Safe to re-run. Apply after 142.

create or replace function public.acc_cashier_guard_voucher()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.acc_is_cashier() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if new.source_type is distinct from 'pos_counter' or new.voucher_type not in ('sales', 'credit_note') then
      raise exception 'A cashier can only post Counter sales and returns';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.source_type is distinct from 'pos_counter'
       or new.source_type is distinct from 'pos_counter'
       or new.voucher_type is distinct from old.voucher_type then
      raise exception 'A cashier can only change Counter bills';
    end if;
    return new;
  end if;
  raise exception 'A cashier cannot delete vouchers';
end;
$$;
