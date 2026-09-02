-- FinTrack Accounts P1: ledger edit/delete, opening balances on create.
-- Run AFTER 053_accounts_small_business_coa.sql.
-- Additive: does not alter Daily Finance, Monthly Finance, Chit Fund, or Cashbook behaviour.

drop function if exists public.acc_create_coa(text, text, text, text);

create or replace function public.acc_create_coa(
  input_code text,
  input_name text,
  input_group_type text,
  input_account_type text,
  input_opening numeric default 0,
  input_opening_side text default 'debit'
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; new_id uuid; opening_amt numeric; opening_side text;
begin
  org_id := public.acc_require_owner();
  perform public.acc_initialize(null, current_date);
  if trim(coalesce(input_code, '')) = '' or trim(coalesce(input_name, '')) = '' then
    raise exception 'Account code and name are required';
  end if;
  opening_amt := round(coalesce(input_opening, 0), 2);
  if opening_amt < 0 then raise exception 'Opening balance cannot be negative'; end if;
  opening_side := case when input_opening_side in ('debit', 'credit') then input_opening_side else 'debit' end;
  insert into public.acc_coa(
    organization_id, code, name, group_type, account_type, opening_balance, opening_side
  ) values (
    org_id, trim(input_code), trim(input_name), input_group_type,
    coalesce(nullif(input_account_type, ''), 'other'), opening_amt, opening_side
  )
  returning id into new_id;
  perform public.acc_write_audit(org_id, 'coa', new_id, 'create', null, jsonb_build_object(
    'code', input_code, 'name', input_name, 'opening_balance', opening_amt, 'opening_side', opening_side
  ), null);
  return new_id;
end;
$$;

create or replace function public.acc_update_coa(
  input_id uuid,
  input_code text,
  input_name text,
  input_opening numeric default 0,
  input_opening_side text default 'debit',
  input_is_active boolean default true
) returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; account public.acc_coa; opening_amt numeric; opening_side text;
begin
  org_id := public.acc_require_owner();
  select * into account from public.acc_coa where id = input_id and organization_id = org_id;
  if account.id is null then raise exception 'Account not found'; end if;
  if trim(coalesce(input_code, '')) = '' or trim(coalesce(input_name, '')) = '' then
    raise exception 'Account code and name are required';
  end if;
  if account.is_system and trim(input_code) <> account.code then
    raise exception 'System account codes cannot be changed';
  end if;
  opening_amt := round(coalesce(input_opening, 0), 2);
  if opening_amt < 0 then raise exception 'Opening balance cannot be negative'; end if;
  opening_side := case when input_opening_side in ('debit', 'credit') then input_opening_side else account.opening_side end;
  update public.acc_coa
    set code = trim(input_code),
        name = trim(input_name),
        opening_balance = opening_amt,
        opening_side = opening_side,
        is_active = coalesce(input_is_active, true)
    where id = account.id;
  perform public.acc_write_audit(org_id, 'coa', account.id, 'update',
    jsonb_build_object('code', account.code, 'name', account.name, 'opening_balance', account.opening_balance),
    jsonb_build_object('code', trim(input_code), 'name', trim(input_name), 'opening_balance', opening_amt),
    null);
end;
$$;

create or replace function public.acc_delete_coa(input_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; account public.acc_coa;
begin
  org_id := public.acc_require_owner();
  select * into account from public.acc_coa where id = input_id and organization_id = org_id;
  if account.id is null then raise exception 'Account not found'; end if;
  if account.is_system then raise exception 'System accounts cannot be deleted'; end if;
  if exists (select 1 from public.acc_voucher_lines where organization_id = org_id and coa_id = account.id) then
    raise exception 'Cannot delete an account that has transactions';
  end if;
  if exists (select 1 from public.acc_bank_statements where organization_id = org_id and coa_id = account.id) then
    raise exception 'Cannot delete an account that has bank statements';
  end if;
  delete from public.acc_coa where id = account.id;
  perform public.acc_write_audit(org_id, 'coa', account.id, 'delete',
    jsonb_build_object('code', account.code, 'name', account.name), null, 'Ledger deleted');
end;
$$;

grant execute on function public.acc_create_coa(text, text, text, text, numeric, text) to authenticated;
grant execute on function public.acc_update_coa(uuid, text, text, numeric, text, boolean) to authenticated;
grant execute on function public.acc_delete_coa(uuid) to authenticated;
